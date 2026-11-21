import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoOpportunity, getFeederDistanceNm, getFeederRoutes, getFreightQuote, getLogisticsRoutes,
  OneMonopolyEngine as engine, type GameAction, type GameState,
} from '../src/index.js';

const seats = [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'minh', name: 'Minh', token: 'PILOT_BOAT' as const },
];
const start = () => engine.createGame('FEEDER', seats, 'logistics');
function accept(state: GameState, command: GameAction) {
  const result = engine.dispatch(state, command, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state);
  return result.state;
}
function sail(state: GameState, tileId: number) {
  const route = getLogisticsRoutes(state, state.players[state.activePlayerIndex].id).find(r => r.tileId === tileId);
  assert.ok(route);
  return accept(state, route.action);
}
function refuse(state: GameState, command: GameAction, who = 'linh') {
  const result = engine.dispatch(state, command, who);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('feeder leg preserves the booked cargo, berth stock and contract until normal discharge', () => {
  let state = start();
  assert.deepEqual(state.logistics!.feederAvailable, { linh: true, minh: true });
  assert.deepEqual(getFeederRoutes(state, 'linh'), []);
  assert.equal(getFeederDistanceNm(1, 3), 20);
  assert.equal(getFeederDistanceNm(1, 1), null);
  assert.equal(getFeederDistanceNm(1, 2), null);
  assert.equal(getFeederDistanceNm(1, 15), null);
  refuse(state, { type: 'SAIL_FEEDER', tileId: 1, revision: 0 });
  const booking = getCargoBookings(state, 'linh', 'laden').find(b => b.tileId === 3)!;
  state = sail(accept(state, booking.action), 1);
  const market = state.logistics!.market!;
  market.contract = { tenderId: 9, deliveryRound: state.turnCount, playerId: 'linh', kind: 'laden', destinationTileId: 3, amount: 7, status: 'active' };
  state.logistics!.ports[3].demand = 0; // The private contract's receiver can still accept this shipment.
  const routes = getFeederRoutes(state, 'linh');
  assert.ok(routes.length);
  assert.deepEqual(routes.map(r => r.distanceNm), routes.map(r => r.distanceNm).sort((a, b) => a - b));
  assert.ok(routes.every(r => r.tileId !== 1 && r.distanceNm <= 1000 && r.distanceNm === getFreightQuote(1, r.tileId)?.distanceNm));
  const leg = routes.find(r => r.tileId === 3)!;
  assert.deepEqual(leg.quote, getFreightQuote(0, 3));
  assert.ok(routes.filter(r => r.tileId !== 3).every(r => r.quote === null));
  for (const bad of [1, 2, 15, -1, NaN]) refuse(state, { ...leg.action, tileId: bad });
  refuse(state, leg.action, 'minh');
  const result = engine.dispatch(state, leg.action, 'linh');
  assert.deepEqual(result.events, [{ type: 'SHIP_STEPPED', playerId: 'linh', from: 1, to: 3, feeder: true }]);
  assert.deepEqual(result.state.players[0].cargo, state.players[0].cargo);
  assert.deepEqual(result.state.logistics!.ports, state.logistics!.ports);
  assert.deepEqual(result.state.logistics!.market, market);
  assert.equal(result.state.phase, 'END_OF_TURN');
  assert.deepEqual(result.state.logistics!.feederAvailable, { linh: false, minh: true });
  assert.deepEqual(getFeederRoutes(result.state, 'linh'), []);
  refuse(result.state, leg.action);
  refuse(result.state, { ...leg.action, revision: result.state.cargoRevision! });
  const unload = getCargoOpportunity(result.state, 'linh')!.action;
  const paid = accept(result.state, unload);
  assert.equal(paid.players[0].lastDelivery!.tenderBonus, 7);
  assert.equal(paid.logistics!.deliveries.linh, 1);
  const nextTurn = accept(accept(paid, { type: 'END_TURN' }), { type: 'END_TURN' });
  assert.deepEqual(getFeederRoutes(sail(nextTurn, 1), 'linh'), []);
});

test('no feeder sails in legacy/classic sessions, at remote harbors, out of turn or using a stale revision', () => {
  const state = sail(start(), 3);
  const leg = getFeederRoutes(state, 'linh')[0].action;
  refuse(state, { ...leg, revision: leg.revision - 1 });
  assert.deepEqual(getFeederRoutes(state, 'minh'), []);
  const archived = structuredClone(state);
  delete archived.logistics!.feederAvailable;
  assert.deepEqual(getFeederRoutes(archived, 'linh'), []);
  refuse(archived, leg);
  const classic = engine.createGame('OLD', seats, 'classic');
  refuse(classic, leg);
  assert.deepEqual(getFeederRoutes(sail(start(), 27), 'linh'), []); // Santos
});

test('every captain keeps a separate feeder and arrivals still need a receiver for an ordinary booking', () => {
  let state = start();
  const booking = getCargoBookings(state, 'linh', 'empty').find(b => b.tileId === 3)!;
  state = sail(accept(state, booking.action), 1);
  const stock = state.logistics!.ports[3];
  stock.empties = stock.emptyTarget;
  const leg = getFeederRoutes(state, 'linh').find(r => r.tileId === 3)!;
  assert.equal(leg.quote, null);
  state = accept(state, leg.action);
  assert.equal(getCargoOpportunity(state, 'linh'), null);
  assert.equal(state.players[0].cargo?.kind, 'empty');
  state = sail(accept(state, { type: 'END_TURN' }), 1);
  const otherLeg = getFeederRoutes(state, 'minh').find(r => r.tileId === 3)!;
  state = accept(state, otherLeg.action);
  assert.deepEqual(state.logistics!.feederAvailable, { linh: false, minh: false });
  assert.equal(state.logistics!.deliveries.minh, 0);
  assert.equal(state.players[1].cargo, undefined);
});
