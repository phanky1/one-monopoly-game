import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { getCargoBookings, getFeederRoutes, getLogisticsRoutes } from '@one-monopoly/shared';
import { io as connect } from 'socket.io-client';
import { setupSocketServer } from '../dist/socketServer.js';

test('two captains see the same feeder movement and a reconnected captain cannot spend the use twice', async t => {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local network listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(server);
  const clients = [];
  let room;
  t.after(async () => { room?.timer?.stop(); clients.forEach(client => client.disconnect()); await io.close(); });
  const next = (c, event) => once(c, event, { signal: AbortSignal.timeout(5000) }).then(([value]) => value);
  async function open() {
    const c = connect('http://127.0.0.1:' + server.address().port, { transports: ['websocket'], reconnection: false, autoConnect: false });
    clients.push(c);
    const wait = next(c, 'connect');
    c.connect();
    await wait;
    return c;
  }
  const host = await open(), rival = await open();
  const send = (c, event, data) => c.timeout(5000).emitWithAck(event, data);
  const seat = await send(host, 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const { roomId, playerId } = seat;
  const other = await send(rival, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  room = roomManager.getRoom(roomId);
  const [, , started] = await Promise.all([
    next(host, 'game:update'), next(rival, 'game:update'), send(host, 'room:start', { roomId, playerId }),
  ]);
  assert.ok(started.success);
  const act = (c, actor, action) => send(c, 'game:action', { roomId, playerId: actor, action });
  async function update(action) {
    const [a, b, ack] = await Promise.all([next(host, 'game:update'), next(rival, 'game:update'), act(host, playerId, action)]);
    assert.ok(ack.success, ack.error);
    assert.deepEqual(a.events, b.events);
    return [a, b, ack];
  }
  const booking = getCargoBookings(room.gameState, playerId, 'laden').find(r => r.tileId === 3);
  await update(booking.action);
  const normal = await update(getLogisticsRoutes(room.gameState, playerId).find(r => r.tileId === 1).action);
  assert.equal(normal[0].events.find(e => e.type === 'SHIP_STEPPED').feeder, undefined);
  const leg = getFeederRoutes(room.gameState, playerId).find(r => r.tileId === 3).action;
  const before = room.gameState;
  assert.equal((await act(rival, playerId, leg)).success, false);
  assert.equal((await act(rival, other.playerId, leg)).success, false);
  assert.equal((await act(host, playerId, { ...leg, revision: leg.revision - 1 })).success, false);
  assert.equal(room.gameState, before);
  const moved = await update(leg);
  for (const packet of moved) {
    assert.deepEqual(packet.events, [{ type: 'SHIP_STEPPED', playerId, from: 1, to: 3, feeder: true }]);
    assert.equal(packet.state.players[0].position, 3);
    assert.deepEqual(packet.state.players[0].cargo, before.players[0].cargo);
    assert.deepEqual(packet.state.logistics.feederAvailable, { [playerId]: false, [other.playerId]: true });
  }
  const replacement = await open();
  const [snapshot, resumed] = await Promise.all([
    next(replacement, 'game:init'),
    send(replacement, 'room:join', { roomId, sessionToken: seat.sessionToken, playerName: 'Linh', token: 'ONE_APUS' }),
  ]);
  assert.ok(resumed.isReconnect);
  assert.equal(snapshot.state.logistics.feederAvailable[playerId], false);
  assert.deepEqual(snapshot.state, resumed.gameState);
  assert.equal((await act(replacement, playerId, { ...leg, tileId: 1, revision: resumed.gameState.cargoRevision })).success, false);
  assert.equal((await act(host, playerId, { type: 'END_TURN' })).success, false);
});
