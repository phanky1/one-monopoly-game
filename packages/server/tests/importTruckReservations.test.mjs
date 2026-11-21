import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { getCargoBookings, getCargoRedirections } from '@one-monopoly/shared';
import { RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

function reserve(state, captain) {
  const booking = state.players.find(p => p.id === captain).cargo;
  return { type: 'RESERVE_IMPORT_TRUCK', bookingId: booking.bookingId, destinationTileId: booking.destinationTileId, revision: state.cargoRevision };
}

test('only the authenticated active owner can reserve the current booking using an exact, current request', t => {
  const updates = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, state, events) => updates.push({ state, events }) });
  const { room, playerId: owner } = manager.createRoom('Linh', 'ONE_APUS', 'owner');
  const { playerId: rival } = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'rival');
  assert.ok(manager.startGame(room.id, owner).success);
  t.after(() => room.timer?.stop());
  const act = (socket, id, action) => manager.dispatchSocketAction(socket, { roomId: room.id, playerId: id, action });
  const book = getCargoBookings(room.gameState, owner, 'laden').find(c => c.tileId === 1);
  assert.ok(act('owner', owner, book.action).success);
  const before = room.gameState;
  const call = reserve(before, owner);
  const bad = [
    {}, { revision: -1 }, { revision: '1' }, { revision: undefined }, { revision: call.revision - 1 }, { revision: call.revision + 1 },
    { bookingId: 0 }, { bookingId: 1.25 }, { bookingId: String(call.bookingId) }, { bookingId: call.bookingId + 1 },
    { destinationTileId: null }, { destinationTileId: '1' }, { destinationTileId: 3 }, { throughRound: 99 },
  ];
  const count = updates.length;
  for (const [i, fields] of bad.entries()) {
    const action = i === 0 ? { type: call.type } : { ...call, ...fields };
    const reply = act('owner', owner, action);
    assert.equal(reply.success, false, JSON.stringify(action));
    assert.equal(reply.state, undefined);
  }
  assert.equal(act('rival', owner, call).success, false);
  assert.equal(act('rival', rival, call).success, false);
  assert.equal(room.gameState, before);
  assert.equal(updates.length, count);
  const ok = act('owner', owner, call);
  assert.ok(ok.success, ok.error);
  const reserved = room.gameState;
  assert.equal(act('owner', owner, call).success, false);
  assert.equal(act('owner', owner, { ...call, revision: reserved.cargoRevision }).success, false);
  assert.equal(room.gameState, reserved);
  assert.equal(updates.length, count + 1);
});

test('classic rooms reject a reservation without changing the board or broadcasting a turn', t => {
  let updates = 0;
  const manager = new RoomManager({ onBroadcastUpdate: () => updates++ });
  const { room, playerId } = manager.createRoom('Linh', 'ONE_APUS', 'host');
  manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'mate');
  assert.ok(manager.startGame(room.id, playerId, 'classic').success);
  t.after(() => room.timer?.stop());
  const original = room.gameState, count = updates;
  const result = manager.dispatchSocketAction('host', { roomId: room.id, playerId, action: {
    type: 'RESERVE_IMPORT_TRUCK', bookingId: 1, destinationTileId: 1, revision: 0,
  } });
  assert.equal(result.success, false);
  assert.equal(room.gameState, original);
  assert.equal(updates, count);
});

test('the hold and its COD release are public on sockets and reconnect while sealed bids remain private', async t => {
  const server = createServer();
  try { await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok)); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable'); throw error; }
  const { io, roomManager } = setupSocketServer(server);
  const clients = [];
  let room;
  t.after(async () => { room?.timer?.stop(); clients.forEach(c => c.disconnect()); await io.close(); });
  const next = (socket, event) => once(socket, event, { signal: AbortSignal.timeout(5000) }).then(([data]) => data);
  const send = (socket, event, payload) => socket.timeout(5000).emitWithAck(event, payload);
  async function open() {
    const c = connect('http://127.0.0.1:' + server.address().port, { autoConnect: false, transports: ['websocket'], reconnection: false });
    clients.push(c);
    const ready = next(c, 'connect');
    c.connect();
    await ready;
    return c;
  }
  const host = await open();
  let rival = await open();
  const first = await send(host, 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const roomId = first.roomId, a = first.playerId;
  const second = await send(rival, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' }), b = second.playerId;
  assert.ok((await send(host, 'room:start', { roomId, playerId: a })).success);
  room = roomManager.getRoom(roomId);
  async function dispatch(socket, id, action) {
    const [hostUpdate, rivalUpdate, ack] = await Promise.all([
      next(host, 'game:update'), next(rival, 'game:update'), send(socket, 'game:action', { roomId, playerId: id, action }),
    ]);
    assert.ok(ack.success, ack.error);
    return { hostUpdate, rivalUpdate, ack };
  }
  const bid = { type: 'BID_FREIGHT_TENDER', tenderId: room.gameState.logistics.market.tender.id, amount: 13, revision: room.gameState.cargoRevision };
  await dispatch(host, a, bid);
  await dispatch(host, a, { type: 'END_TURN' });
  const load = getCargoBookings(room.gameState, b, 'laden').find(c => c.tileId === 1).action;
  await dispatch(rival, b, load);
  const action = reserve(room.gameState, b);
  const { hostUpdate, rivalUpdate, ack } = await dispatch(rival, b, action);
  const held = { bookingId: action.bookingId, destinationTileId: 1, throughRound: 2 };
  const tenderBids = packet => packet.state.logistics.market.tender.bids;
  assert.deepEqual(tenderBids(hostUpdate), { [a]: 13 });
  for (const packet of [rivalUpdate, ack]) assert.deepEqual(tenderBids(packet), {});
  for (const packet of [hostUpdate, rivalUpdate, ack]) {
    assert.deepEqual(packet.state.logistics.importTruckReservations[b], held);
    assert.equal(packet.state.logistics.ports[1].demand, 0);
    assert.deepEqual(packet.events, [{ type: 'IMPORT_TRUCK_RESERVED', playerId: b, ...held }]);
  }
  const previous = rival;
  rival = await open();
  const [init, resumed] = await Promise.all([next(rival, 'game:init'), send(rival, 'room:join', {
    roomId, playerName: 'Minh', token: 'PILOT_BOAT', sessionToken: second.sessionToken,
  })]);
  assert.ok(resumed.isReconnect);
  assert.deepEqual(init.state, resumed.gameState);
  assert.deepEqual(init.state.logistics.importTruckReservations[b], held);
  assert.deepEqual(tenderBids(init), {});
  assert.equal((await send(previous, 'game:action', { roomId, playerId: b, action })).success, false);
  const redirect = getCargoRedirections(room.gameState, b).find(c => c.tileId === 3).action;
  const changed = await dispatch(rival, b, redirect);
  assert.deepEqual(tenderBids(changed.hostUpdate), { [a]: 13 });
  for (const packet of [changed.rivalUpdate, changed.ack]) assert.deepEqual(tenderBids(packet), {});
  for (const packet of Object.values(changed)) {
    assert.equal(packet.state.logistics.importTruckReservations[b], undefined);
    assert.equal(packet.state.logistics.importTruckAvailable[b], false);
    assert.equal(packet.state.logistics.ports[1].demand, 1);
  }
});
