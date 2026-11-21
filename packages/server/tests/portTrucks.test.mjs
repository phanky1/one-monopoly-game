import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { getEarlyTruckCalls, OneMonopolyEngine } from '@one-monopoly/shared';
import { getFreightBotAction } from '../dist/freightBot.js';
import { RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

const game = () => OneMonopolyEngine.createGame('truck-test', [
  { id: 'host', name: 'Linh', token: 'ONE_APUS' }, { id: 'pilot', name: 'Minh', token: 'PILOT_BOAT' },
], 'logistics');
function botAt(tileId) {
  const state = game();
  state.activePlayerIndex = 1;
  state.players[1].position = tileId;
  return state;
}
function apply(state, action) {
  const result = OneMonopolyEngine.dispatch(state, action, 'pilot');
  assert.notEqual(result.state, state, action.type);
  return result.state;
}

test('a scheduled solo captain calls an import truck then unloads its otherwise blocked cargo', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, added) => events.push(...added) });
  const { room, playerId } = manager.createRoom('Linh', 'ONE_APUS', 'host-socket');
  manager.startGame(room.id, playerId);
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  const pilot = room.gameState.players[1];
  Object.assign(pilot, { position: 3, cargo: { kind: 'laden', bookingId: 6, originTileId: 0, destinationTileId: 3 } });
  room.gameState.cargoRevision = 6;
  room.gameState.logistics.ports[3].demand = 0;
  manager.dispatchAction(room.id, playerId, { type: 'END_TURN' });
  t.mock.timers.tick(1800);
  assert.equal(events.filter(e => e.type === 'PORT_TRUCK_CALLED' && e.operation === 'import').length, 1);
  assert.equal(room.gameState.logistics.ports[3].demand, 1);
  t.mock.timers.tick(1800);
  assert.equal(room.gameState.logistics.deliveries[pilot.id], 1);
  assert.equal(room.gameState.logistics.ports[3].demand, 0);
  assert.equal(room.gameState.logistics.earlyTruckAvailable[pilot.id], false);
});

test('export packing can release a booked empty box, but the bot saves its call if the yard would still be full', () => {
  const state = botAt(1);
  state.players[1].cargo = { kind: 'empty', bookingId: 1, originTileId: 0, destinationTileId: 1 };
  const stock = state.logistics.ports[1];
  stock.empties = stock.emptyTarget + 1;
  assert.ok(getEarlyTruckCalls(state, 'pilot').some(c => c.operation === 'export'));
  assert.notEqual(getFreightBotAction(state).type, 'CALL_PORT_TRUCK');
  stock.empties = stock.emptyTarget;
  const call = getFreightBotAction(state);
  assert.deepEqual([call.type, call.operation], ['CALL_PORT_TRUCK', 'export']);
  const after = apply(state, call);
  const unload = getFreightBotAction(after);
  assert.equal(unload.type, 'UNLOAD_CARGO');
  assert.equal(apply(after, unload).logistics.emptyDeliveries.pilot, 1);
});

test('an export call creates a useful shipment and is conserved without receivers or when a shipment is already available', () => {
  const state = botAt(1);
  Object.assign(state.logistics.ports[1], { supply: 0, empties: 1, emptyTarget: 2 });
  const call = getFreightBotAction(state);
  assert.deepEqual([call.type, call.operation], ['CALL_PORT_TRUCK', 'export']);
  const after = apply(state, call);
  assert.equal(getFreightBotAction(after).type, 'LOAD_CARGO');
  assert.deepEqual(getEarlyTruckCalls(after, 'pilot'), []);

  const noReceiver = structuredClone(state);
  Object.values(noReceiver.logistics.ports).forEach(stock => { stock.demand = 0; });
  assert.notEqual(getFreightBotAction(noReceiver).type, 'CALL_PORT_TRUCK');
  state.logistics.ports[1].empties = 3;
  assert.equal(getFreightBotAction(state).type, 'LOAD_CARGO');
  const legacy = botAt(1);
  Object.assign(legacy.logistics.ports[1], { supply: 0, empties: 1 });
  delete legacy.logistics.earlyTruckAvailable;
  assert.notEqual(getFreightBotAction(legacy).type, 'CALL_PORT_TRUCK');
});

test('the bot can pack a contract shipment for a reserved berth and discharges there without buying a public receiver', () => {
  const state = botAt(1);
  Object.assign(state.logistics.ports[1], { supply: 0, empties: 3, emptyTarget: 2 });
  state.logistics.ports[17].demand = 0;
  state.logistics.market.contract = { tenderId: 1, status: 'active', kind: 'laden', destinationTileId: 17,
    deliveryRound: state.turnCount, amount: 8, playerId: 'pilot' };
  const call = getFreightBotAction(state);
  assert.deepEqual([call.type, call.operation], ['CALL_PORT_TRUCK', 'export']);
  const after = apply(state, call);
  const load = getFreightBotAction(after);
  assert.deepEqual([load.type, load.kind, load.destinationTileId], ['LOAD_CARGO', 'laden', 17]);
  const loaded = apply(after, load);
  const arrived = apply(loaded, getFreightBotAction(loaded));
  assert.equal(getFreightBotAction(arrived).type, 'UNLOAD_CARGO');
});

test('a multiplayer truck call is authenticated, visible to rivals, and not reapplied at round rollover', async t => {
  const server = createServer(), clients = [];
  try { await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok)); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable'); throw error; }
  const { io, roomManager } = setupSocketServer(server);
  let room;
  t.after(async () => { room?.timer?.stop(); clients.forEach(c => c.disconnect()); await io.close(); });
  const next = (c, event) => once(c, event, { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const send = (c, event, data) => c.timeout(5000).emitWithAck(event, data);
  async function open() {
    const c = connect('http://127.0.0.1:' + server.address().port, { autoConnect: false, transports: ['websocket'], reconnection: false });
    clients.push(c);
    const connected = next(c, 'connect');
    c.connect(); await connected;
    return c;
  }
  const host = await open(), rival = await open();
  const seat = await send(host, 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const { roomId, playerId } = seat;
  const other = await send(rival, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  assert.ok((await send(host, 'room:start', { roomId, playerId })).success);
  room = roomManager.getRoom(roomId);
  const act = (c, id, action) => send(c, 'game:action', { roomId, playerId: id, action });
  const sail = id => ({ type: 'SAIL_TO_PORT', tileId: id, revision: room.gameState.cargoRevision });
  assert.ok((await act(host, playerId, sail(3))).success);
  const before = room.gameState;
  const call = getEarlyTruckCalls(before, playerId).find(choice => choice.operation === 'import').action;
  assert.equal((await act(rival, playerId, call)).success, false);
  assert.equal((await act(rival, other.playerId, call)).success, false);
  assert.equal((await act(host, playerId, { ...call, tileId: 1 })).success, false);
  assert.equal(room.gameState, before);
  const [view, accepted] = await Promise.all([next(rival, 'game:update'), act(host, playerId, call)]);
  assert.ok(accepted.success);
  assert.deepEqual(view.events, [{ type: 'PORT_TRUCK_CALLED', playerId, tileId: 3, operation: 'import', scheduledRound: 2 }]);
  const demand = before.logistics.ports[3].demand + 1;
  assert.equal(view.state.logistics.ports[3].demand, demand);
  assert.equal(view.state.phase, before.phase);
  assert.equal((await act(host, playerId, call)).success, false);
  const fresh = await open();
  const rejoined = await send(fresh, 'room:join', { roomId, playerName: 'Linh', token: 'ONE_APUS', sessionToken: seat.sessionToken });
  assert.equal(rejoined.gameState.logistics.earlyTruckAvailable[playerId], false);
  assert.ok((await act(fresh, playerId, { type: 'END_TURN' })).success);
  assert.ok((await act(rival, other.playerId, sail(3))).success);
  assert.equal((await act(rival, other.playerId, { ...call, revision: room.gameState.cargoRevision })).success, false);
  assert.ok((await act(rival, other.playerId, { type: 'END_TURN' })).success);
  assert.equal(room.gameState.turnCount, 2);
  assert.equal(room.gameState.logistics.ports[3].demand, demand);
  assert.equal(room.gameState.logistics.earlyTruckAvailable[other.playerId], true);
});

test('classic rooms and older freight snapshots reject truck calls without changing state', t => {
  const manager = new RoomManager();
  const { room, playerId } = manager.createRoom('Linh', 'ONE_APUS', 'host');
  manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'rival');
  manager.startGame(room.id, playerId, 'classic');
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  const call = () => manager.dispatchSocketAction('host', { roomId: room.id, playerId,
    action: { type: 'CALL_PORT_TRUCK', operation: 'import', tileId: 3, revision: 0 } });
  const classic = room.gameState;
  assert.equal(call().success, false);
  assert.equal(room.gameState, classic);
  const freight = game();
  freight.players[0].id = playerId;
  freight.players[0].position = 3;
  delete freight.logistics.earlyTruckAvailable;
  room.gameState = freight;
  assert.equal(call().success, false);
  assert.equal(room.gameState, freight);
});
