import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

for (const scenario of [
  { name: 'redeems and keeps the $80M reserve', cash: 123, shouldRedeem: true, dice: [2, 3], tileId: 5 },
  { name: 'keeps the box if paying would leave only $79M', cash: 122, shouldRedeem: false, dice: [2, 3], tileId: 5 },
  { name: 'finishes the discharge before rolling its doubles again', cash: 144, shouldRedeem: true, dice: [6, 6], tileId: 12 },
]) {
  test(`the solo captain ${scenario.name}`, t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const events = [];
    const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, incoming) => events.push(...incoming) });
    const { room, playerId: human } = manager.createRoom('Linh', 'ONE_APUS', 'host');
    t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
    assert.ok(manager.startGame(room.id, human, 'harbor').success);
    const ai = room.players[1].id;
    room.gameState.properties[scenario.tileId].ownerId = ai;
    room.gameState.properties[scenario.tileId].isMortgaged = true;
    room.gameState.players[1].balance = scenario.cash;
    assert.ok(manager.dispatchAction(room.id, human, { type: 'END_TURN' }).success);
    const dice = [...scenario.dice, 1, 2];
    t.mock.method(Math, 'random', () => (dice.shift() - 0.5) / 6);
    function until(check) {
      for (let i = 0; i < 70 && !check(); i++) t.mock.timers.tick(100);
      assert.ok(check(), 'the scheduled bot completed the expected step');
    }
    until(() => events.some(event => event.type === 'DICE_ROLLED'));
    assert.deepEqual(room.gameState.harborFreight.manifests[ai], { originTileId: 0 });
    assert.equal(room.gameState.players[1].position, scenario.tileId);
    if (!scenario.shouldRedeem) {
      until(() => room.gameState.activePlayerIndex === 0);
      assert.equal(room.gameState.harborFreight.lastDelivery, null);
      assert.equal(room.gameState.properties[scenario.tileId].isMortgaged, true);
      assert.equal(room.gameState.players[1].balance, scenario.cash);
      return;
    }
    until(() => room.gameState.harborFreight.lastDelivery !== null);
    assert.equal(room.gameState.players[1].balance, 80);
    assert.equal(room.gameState.properties[scenario.tileId].isMortgaged, false);
    t.mock.timers.tick(3300);
    assert.equal(room.gameState.players[1].position, scenario.tileId);
    assert.equal(room.gameState.activePlayerIndex, 1);
    assert.equal(events.filter(event => event.type === 'DICE_ROLLED').length, 1);
    if (scenario.dice[0] === scenario.dice[1]) until(() => events.filter(event => event.type === 'DICE_ROLLED').length === 2);
    else until(() => room.gameState.activePlayerIndex === 0);
    assert.equal(events.filter(event => event.type === 'HARBOR_DISCHARGED').length, 1);
  });
}

test('both sockets see one atomic redemption; a reconnect cannot repeat it or pay an invalid cash-only release', async t => {
  const http = createServer();
  try { await new Promise((resolve, reject) => http.once('error', reject).listen(0, '127.0.0.1', resolve)); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(http);
  const sockets = [];
  let room;
  t.after(async () => {
    room?.timer?.stop();
    sockets.forEach(socket => socket.disconnect());
    await io.close();
  });
  const next = (socket, event) => once(socket, event, { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const send = (socket, event, data) => socket.timeout(5000).emitWithAck(event, data);
  async function open() {
    const socket = connect('http://127.0.0.1:' + http.address().port, {
      transports: ['websocket'], autoConnect: false, reconnection: false,
    });
    sockets.push(socket);
    const ready = next(socket, 'connect');
    socket.connect();
    await ready;
    return socket;
  }
  const owner = await open(), visitor = await open();
  const identity = { playerName: 'Linh', token: 'ONE_APUS' };
  const { roomId, playerId, sessionToken } = await send(owner, 'room:create', identity);
  const { playerId: rival } = await send(visitor, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  assert.ok((await send(owner, 'room:start', { roomId, playerId, mode: 'harbor' })).success);
  room = roomManager.getRoom(roomId);
  room.gameState.properties[5].ownerId = playerId;
  room.gameState.properties[5].isMortgaged = true;
  room.gameState.players[0].balance = 43;
  const command = (socket, actor, action) => send(socket, 'game:action', { roomId, playerId: actor, action });
  assert.ok((await command(owner, playerId, { type: 'HARBOR_LOAD', tileId: 0, revision: 0 })).success);
  const arrival = await command(owner, playerId, { type: 'ROLL_DICE', forcedDice: [2, 3] });
  assert.equal(arrival.state.players[0].position, 5);
  const saved = room.gameState;
  const resets = t.mock.method(room.timer, 'reset');
  const action = { type: 'HARBOR_REDEEM_AND_DISCHARGE', tileId: 5, revision: saved.harborFreight.revision };
  assert.equal((await command(visitor, playerId, action)).success, false);
  assert.equal((await command(visitor, rival, action)).success, false);
  assert.equal((await command(owner, playerId, { type: 'UNMORTGAGE_TILE', tileId: 5 })).success, false);
  assert.equal(room.gameState, saved);
  const [self, opponent, ack] = await Promise.all([next(owner, 'game:update'), next(visitor, 'game:update'),
    command(owner, playerId, action)]);
  assert.ok(ack.success, ack.error);
  for (const packet of [self, opponent, ack]) {
    assert.deepEqual(packet.events.map(event => event.type), ['TILE_UNMORTGAGED', 'HARBOR_DISCHARGED', 'BALANCE_CHANGED']);
    assert.equal(packet.state.harborFreight.lastDelivery.redemptionCost, 55);
    assert.equal(packet.state.harborFreight.manifests[playerId], null);
    assert.equal(packet.state.properties[5].isMortgaged, false);
    assert.deepEqual(packet.state.players.map(player => player.balance), [0, 1500]);
  }
  assert.equal(opponent.state.players[0].secretMission, undefined);
  assert.equal(self.state.players[1].secretMission, undefined);
  const returning = await open();
  const [init, rejoined] = await Promise.all([next(returning, 'game:init'),
    send(returning, 'room:join', { roomId, ...identity, sessionToken })]);
  assert.ok(rejoined.isReconnect);
  assert.deepEqual(rejoined.gameState, init.state);
  assert.deepEqual(init.state.harborFreight, ack.state.harborFreight);
  assert.equal(init.events, undefined);
  const after = room.gameState;
  for (const request of [action, { ...action, revision: after.harborFreight.revision }, { type: 'UNMORTGAGE_TILE', tileId: 5 }]) {
    assert.equal((await command(returning, playerId, request)).success, false);
    assert.equal(room.gameState, after);
  }
  assert.equal(resets.mock.callCount(), 0);
});
