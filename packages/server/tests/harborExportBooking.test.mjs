import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { getHarborExportBooking } from '@one-monopoly/shared';
import { io as connect } from 'socket.io-client';
import { gameStateForPlayer, RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

function developPort(state, ownerId) {
  Object.assign(state.properties[3], { ownerId, containerLevel: 1 });
}

const landingRoll = { type: 'ROLL_DICE', forcedDice: [1, 2] };

test('socket booking pays the quoted operator once and preserves the visitor’s turn clock', async t => {
  const http = createServer();
  try { await new Promise((resolve, reject) => http.once('error', reject).listen(0, '127.0.0.1', resolve)); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(http);
  const open = () => connect('http://127.0.0.1:' + http.address().port, { transports: ['websocket'], reconnection: false });
  const carrier = open(), operator = open();
  let room;
  t.after(async () => {
    room?.timer?.stop();
    carrier.disconnect();
    operator.disconnect();
    await io.close();
  });
  const send = (socket, name, data) => socket.timeout(5000).emitWithAck(name, data);
  const nextUpdate = socket => once(socket, 'game:update', { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const { roomId, playerId } = await send(carrier, 'room:create', { playerName: 'Mai', token: 'ONE_APUS' });
  const { playerId: operatorId } = await send(operator, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  assert.ok((await send(carrier, 'room:start', { roomId, playerId, mode: 'harbor' })).success);
  room = roomManager.getRoom(roomId);
  developPort(room.gameState, operatorId);
  const command = (socket, actor, action) => send(socket, 'game:action', { roomId, playerId: actor, action });
  const arrival = await command(carrier, playerId, landingRoll);
  assert.equal(arrival.state.supportsHarborExportBooking, true);
  const { action } = getHarborExportBooking(arrival.state, playerId);
  assert.equal(action.fee, 3);
  const before = room.gameState;
  const resets = t.mock.method(room.timer, 'reset');
  for (const [socket, actor, attempted] of [
    [operator, playerId, action], [operator, operatorId, action], [carrier, playerId, { ...action, fee: 0 }],
    [carrier, playerId, { ...action, revision: action.revision + 1 }],
  ]) {
    assert.equal((await command(socket, actor, attempted)).success, false);
    assert.equal(room.gameState, before);
  }
  const [self, peer, ack] = await Promise.all([nextUpdate(carrier), nextUpdate(operator), command(carrier, playerId, action)]);
  assert.ok(ack.success, ack.error);
  for (const packet of [ack, self, peer]) {
    assert.equal(packet.state.supportsHarborExportBooking, true);
    assert.deepEqual(packet.events, ack.events);
    assert.equal(packet.events.filter(event => event.type === 'HARBOR_LOADED').length, 1);
    assert.deepEqual(packet.state.players.map(p => p.balance), [1477, 1523]);
    assert.equal(packet.state.harborFreight.manifests[playerId].exportBooking.operatorId, operatorId);
    assert.equal(packet.state.harborFreight.revision, action.revision + 1);
  }
  const paid = room.gameState;
  for (const revision of [action.revision, paid.harborFreight.revision]) {
    assert.equal((await command(carrier, playerId, { ...action, revision })).success, false);
    assert.equal(room.gameState, paid);
  }
  assert.equal(resets.mock.callCount(), 0);
});

for (const scenario of [
  { name: 'buys an export with exactly $80M left after rent and fee', cash: 103, dice: [1, 2], buys: true },
  { name: 'sails empty if the booking would leave $79M', cash: 102, dice: [1, 2], buys: false },
  { name: 'waits for the booked load before rolling doubles again', cash: 103, dice: [1, 1], buys: true },
]) {
  test(`the solo rival ${scenario.name}`, t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const events = [];
    const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, incoming) => events.push(...incoming) });
    const { room, playerId } = manager.createRoom('Mai', 'ONE_APUS', 'host');
    t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
    assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
    const bot = room.gameState.players[1];
    developPort(room.gameState, playerId);
    bot.position = 3 - scenario.dice[0] - scenario.dice[1];
    bot.balance = scenario.cash;
    room.gameState.harborFreight.visits[bot.id] = { tileId: bot.position, handled: true };
    const dice = [...scenario.dice, 1, 2];
    t.mock.method(Math, 'random', () => (dice.shift() - 0.5) / 6);
    const until = done => {
      for (let i = 0; i < 70 && !done(); i++) t.mock.timers.tick(100);
      assert.ok(done(), 'scheduled bot reached the expected decision');
    };
    assert.ok(manager.dispatchAction(room.id, playerId, { type: 'END_TURN' }).success);
    until(() => room.gameState.players[1].position === 3);
    assert.equal(getHarborExportBooking(room.gameState, bot.id)?.action.fee, 3);
    if (scenario.buys) {
      until(() => room.gameState.harborFreight.manifests[bot.id]);
      assert.equal(room.gameState.players[1].balance, 80);
      assert.equal(room.gameState.players[0].balance, 1523);
      t.mock.timers.tick(3300);
      assert.equal(room.gameState.activePlayerIndex, 1);
      assert.equal(events.filter(event => event.type === 'DICE_ROLLED').length, 1);
      if (scenario.dice[0] === scenario.dice[1]) until(() => events.filter(event => event.type === 'DICE_ROLLED').length === 2);
      else until(() => room.gameState.activePlayerIndex === 0);
    } else {
      until(() => room.gameState.activePlayerIndex === 0);
      assert.equal(room.gameState.players[1].balance, 82);
      assert.equal(room.gameState.players[0].balance, 1520);
    }
    assert.equal(events.filter(event => event.type === 'HARBOR_LOADED').length, Number(scenario.buys));
  });
}

test('an idle human skips paid exports and only live Monopoly snapshots advertise support', t => {
  const manager = new RoomManager();
  const { room, playerId } = manager.createRoom('Mai', 'ONE_APUS', 'host');
  const { playerId: operatorId } = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'other');
  t.after(() => room.timer?.stop());
  assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
  developPort(room.gameState, operatorId);
  assert.ok(manager.dispatchAction(room.id, playerId, landingRoll).success);
  const live = room.gameState;
  assert.ok(getHarborExportBooking(live, playerId));
  assert.equal(Object.hasOwn(live, 'supportsHarborExportBooking'), false);
  for (const change of [{ mode: 'classic' }, { mode: 'logistics' }, { mode: undefined }, { gameStarted: false }, { winnerId: playerId }]) {
    const snapshot = { ...live, supportsHarborExportBooking: true, ...change };
    assert.equal(Object.hasOwn(gameStateForPlayer(snapshot, playerId), 'supportsHarborExportBooking'), false);
  }
  manager.handleAFKTimeout(room.id);
  assert.equal(room.gameState.activePlayerIndex, 1);
  assert.deepEqual(room.gameState.players.map(p => p.balance), [1480, 1520]);
  assert.equal(room.gameState.harborFreight.manifests[playerId], null);
});
