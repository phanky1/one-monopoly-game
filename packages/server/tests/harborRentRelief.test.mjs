import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

for (const situation of [
  { name: 'can pay in full with freight', cash: 51, remainder: 0 },
  { name: 'needs freight and one mortgage', cash: 21, remainder: 30 },
  { name: 'cannot pay even with freight and a mortgage', cash: 20, remainder: 31 },
]) {
  test(`the harbor rival ${situation.name}`, t => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const batches = [];
    const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, events) => batches.push(events) });
    const { room, playerId: owner } = manager.createRoom('Minh', 'ONE_APUS', 'host');
    t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
    assert.ok(manager.startGame(room.id, owner, 'harbor').success);
    const bot = room.players[1].id;
    room.gameState.players[1].balance = situation.cash;
    room.gameState.properties[1].ownerId = bot;
    Object.assign(room.gameState.properties[3], { ownerId: owner, containerLevel: 2 });
    assert.ok(manager.dispatchAction(room.id, owner, { type: 'END_TURN' }).success);
    const dice = [0, 0.2];
    t.mock.method(Math, 'random', () => dice.shift());
    const saw = type => batches.some(events => events.some(event => event.type === type));
    function until(check) {
      for (let step = 0; step < 75 && !check(); step++) t.mock.timers.tick(100);
      assert.ok(check(), 'the scheduled bot advanced');
    }
    until(() => saw('DEBT_CREATED'));
    if (situation.remainder > 30) {
      until(() => saw('PLAYER_BANKRUPT'));
      assert.equal(saw('HARBOR_DISCHARGED'), false);
      assert.equal(saw('TILE_MORTGAGED'), false);
      return;
    }
    until(() => saw('HARBOR_DISCHARGED'));
    const freight = batches.find(events => events.some(e => e.type === 'HARBOR_DISCHARGED'));
    assert.equal(freight.some(e => e.type === 'DEBT_SETTLED'), situation.remainder === 0);
    assert.equal(saw('TILE_MORTGAGED'), false);
    t.mock.timers.tick(3300);
    assert.equal(room.gameState.activePlayerIndex, 1);
    assert.equal(room.gameState.properties[1].isMortgaged, false);
    if (situation.remainder) {
      assert.equal(room.gameState.pendingDebt.amount, 60);
      until(() => saw('TILE_MORTGAGED'));
    }
    until(() => room.gameState.activePlayerIndex === 0);
    assert.equal(room.gameState.players[1].balance, 0);
    assert.equal(room.gameState.players[0].balance, 1563);
    assert.equal(batches.flat().filter(e => e.type === 'HARBOR_DISCHARGED').length, 1);
    assert.equal(batches.flat().filter(e => e.type === 'DEBT_SETTLED').length, 1);
  });
}

for (const partial of [false, true]) {
  test(`a ${partial ? 'partial' : 'covered'} rent rescue is authenticated, atomic on both sockets, and persists on reconnect`, async t => {
    const http = createServer();
    try { await new Promise((ok, fail) => http.once('error', fail).listen(0, '127.0.0.1', ok)); }
    catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable');
      throw error;
    }
    const { io, roomManager } = setupSocketServer(http);
    const sockets = [];
    let room;
    t.after(async () => { room?.timer?.stop(); sockets.forEach(socket => socket.disconnect()); await io.close(); });
    const next = (socket, event) => once(socket, event, { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
    const request = (socket, event, data) => socket.timeout(5000).emitWithAck(event, data);
    async function open() {
      const socket = connect('http://127.0.0.1:' + http.address().port, {
        transports: ['websocket'], autoConnect: false, reconnection: false,
      });
      sockets.push(socket);
      const connected = next(socket, 'connect');
      socket.connect();
      await connected;
      return socket;
    }
    const ship = await open(), quay = await open();
    const identity = { playerName: 'Linh', token: 'ONE_APUS' };
    const { roomId, playerId: carrier, sessionToken } = await request(ship, 'room:create', identity);
    const { playerId: owner } = await request(quay, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
    assert.ok((await request(ship, 'room:start', { roomId, playerId: carrier, mode: 'harbor' })).success);
    room = roomManager.getRoom(roomId);
    room.gameState.players[0].balance = partial ? 21 : 51;
    Object.assign(room.gameState.properties[3], { ownerId: owner, containerLevel: 2 });
    room.gameState.properties[1].ownerId = carrier;
    const act = (socket, playerId, action) => request(socket, 'game:action', { roomId, playerId, action });
    assert.ok((await act(ship, carrier, { type: 'HARBOR_LOAD', tileId: 0, revision: 0 })).success);
    const arrival = await act(ship, carrier, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    assert.equal(arrival.state.pendingDebt.amount, 60);
    const action = { type: 'HARBOR_DISCHARGE_FOR_RENT', tileId: 3, revision: arrival.state.harborFreight.revision };
    const resets = t.mock.method(room.timer, 'reset');
    const before = room.gameState;
    assert.equal((await act(quay, owner, action)).success, false);
    assert.equal((await act(quay, carrier, action)).success, false);
    assert.equal((await act(ship, carrier, { ...action, revision: action.revision - 1 })).success, false);
    assert.equal(room.gameState, before);
    const [departing, receiving, ack] = await Promise.all([next(ship, 'game:update'), next(quay, 'game:update'),
      act(ship, carrier, action)]);
    assert.ok(ack.success, ack.error);
    assert.equal(resets.mock.callCount(), partial ? 0 : 1);
    for (const packet of [ack, departing, receiving]) {
      assert.deepEqual(packet.events, ack.events);
      assert.equal(packet.events.filter(e => e.type === 'HARBOR_DISCHARGED').length, 1);
      assert.equal(packet.events.some(e => e.type === 'DEBT_SETTLED'), !partial);
      assert.deepEqual(packet.state.players.map(p => p.balance), partial ? [30, 1503] : [0, 1563]);
      assert.equal(packet.state.pendingDebt?.amount ?? 0, partial ? 60 : 0);
      assert.equal(packet.state.phase, partial ? 'AWAITING_DEBT_RESOLUTION' : 'END_OF_TURN');
      assert.deepEqual(packet.state.harborFreight.lastDelivery.rentRelief, { rentDue: 60, shortfallAfter: partial ? 30 : 0 });
    }
    assert.equal(departing.state.players[1].secretMission, undefined);
    assert.equal(receiving.state.players[0].secretMission, undefined);
    const reconnect = await open();
    const [init, joined] = await Promise.all([next(reconnect, 'game:init'),
      request(reconnect, 'room:join', { roomId, ...identity, sessionToken })]);
    assert.ok(joined.isReconnect);
    assert.deepEqual(init.state, joined.gameState);
    assert.deepEqual(init.state.harborFreight, ack.state.harborFreight);
    assert.deepEqual(init.state.pendingDebt, ack.state.pendingDebt);
    assert.equal(init.events, undefined);
    assert.equal((await act(reconnect, carrier, { ...action, revision: init.state.harborFreight.revision })).success, false);
  });
}

test('a human deadline never chooses to discharge the box to settle a bill', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, batch) => events.push(...batch) });
  const { room, playerId: human } = manager.createRoom('Linh', 'ONE_APUS', 'ship');
  const owner = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'owner').playerId;
  t.after(() => room.timer?.stop());
  assert.ok(manager.startGame(room.id, human, 'harbor').success);
  room.gameState.players[0].balance = 1;
  room.gameState.properties[3].ownerId = owner;
  assert.ok(manager.dispatchAction(room.id, human, { type: 'HARBOR_LOAD', tileId: 0, revision: 0 }).success);
  assert.ok(manager.dispatchAction(room.id, human, { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
  assert.equal(room.gameState.pendingDebt.amount, 4);
  t.mock.timers.tick(45_000);
  assert.ok(events.some(e => e.type === 'PLAYER_BANKRUPT'));
  assert.equal(events.some(e => e.type === 'HARBOR_DISCHARGED'), false);
});
