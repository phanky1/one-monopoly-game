import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomManager, gameStateForPlayer } from '../dist/roomManager.js';

test('a turnaround from the seated carrier broadcasts once without restarting the turn clock', t => {
  const updates = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_room, state, events) => updates.push({ state, events }) });
  const { room, playerId } = manager.createRoom('Mai', 'ONE_APUS', 'carrier');
  const { playerId: operatorId } = manager.joinRoom(room.id, 'Linh', 'PILOT_BOAT', 'owner');
  t.after(() => room.timer?.stop());
  assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
  Object.assign(room.gameState.properties[3], { ownerId: operatorId, containerLevel: 1 });
  const command = (socketId, actorId, action) =>
    manager.dispatchSocketAction(socketId, { roomId: room.id, playerId: actorId, action });
  assert.ok(command('carrier', playerId, { type: 'HARBOR_LOAD', tileId: 0, revision: 0 }).success);
  const arrival = command('carrier', playerId, { type: 'ROLL_DICE', forcedDice: [1, 2] });
  assert.ok(arrival.success);
  assert.equal(arrival.state.supportsHarborTurnaround, true);
  const before = room.gameState;
  const action = { type: 'HARBOR_TURNAROUND', tileId: 3, revision: before.harborFreight.revision, operatorId, fee: 3 };
  const reset = t.mock.method(room.timer, 'reset');
  updates.length = 0;
  for (const [socket, actor, attempted] of [
    ['owner', playerId, action], ['owner', operatorId, action], ['carrier', playerId, { ...action, fee: 0 }],
  ]) {
    assert.equal(command(socket, actor, attempted).success, false);
    assert.equal(room.gameState, before);
  }
  const accepted = command('carrier', playerId, action);
  assert.ok(accepted.success, accepted.error);
  assert.equal(accepted.state.players[1].secretMission, undefined);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].events, accepted.events);
  const ownerView = gameStateForPlayer(updates[0].state, operatorId);
  assert.deepEqual(ownerView.harborFreight, accepted.state.harborFreight);
  assert.deepEqual(ownerView.players.map(p => p.balance), [1486, 1526]);
  assert.equal(ownerView.harborFreight.manifests[playerId].originTileId, 3);
  for (const revision of [action.revision, action.revision + 1]) {
    assert.equal(command('carrier', playerId, { ...action, revision }).success, false);
  }
  assert.equal(updates.length, 1);
  assert.equal(reset.mock.callCount(), 0);
  for (const change of [{ mode: 'classic' }, { mode: 'logistics' }, { mode: undefined }, { winnerId: playerId }, { gameStarted: false }]) {
    assert.equal(gameStateForPlayer({ ...before, supportsHarborTurnaround: true, ...change }, playerId).supportsHarborTurnaround, undefined);
  }
});

for (const scenario of [
  { name: 'takes the free outbound box at its own port below its reserve', ownPort: true, startingCash: 20, afterCall: 32, reload: true },
  { name: 'books the rival export with exactly its $80M reserve', ownPort: false, startingCash: 94, afterCall: 80, reload: true },
  { name: 'unloads only when the rival booking would leave $79M', ownPort: false, startingCash: 93, afterCall: 82, reload: false },
]) {
  test('the solo captain ' + scenario.name, t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const manager = new RoomManager();
    const { room, playerId } = manager.createRoom('Mai', 'ONE_APUS', 'host');
    t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
    assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
    const bot = room.gameState.players[1];
    Object.assign(room.gameState.properties[3], { ownerId: scenario.ownPort ? bot.id : playerId, containerLevel: 1 });
    bot.balance = scenario.startingCash;
    const dice = [1, 2];
    t.mock.method(Math, 'random', () => ((dice.shift() ?? 2) - 0.5) / 6);
    assert.ok(manager.dispatchAction(room.id, playerId, { type: 'END_TURN' }).success);
    for (let i = 0; i < 80 && !room.gameState.harborFreight.lastDelivery; i++) t.mock.timers.tick(100);
    assert.equal(room.gameState.harborFreight.lastDelivery?.tileId, 3);
    assert.equal(room.gameState.players[1].balance, scenario.afterCall);
    assert.equal(room.gameState.harborFreight.manifests[bot.id]?.originTileId ?? null, scenario.reload ? 3 : null);
    if (scenario.reload) {
      t.mock.timers.tick(3300);
      assert.equal(room.gameState.activePlayerIndex, 1, 'the bot allows time to see both crane movements');
    }
    t.mock.timers.tick(1000);
    assert.equal(room.gameState.activePlayerIndex, 0);
  });
}
