import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OneMonopolyEngine, getCargoBookings, getCargoDestinationEstimate, getCargoOpportunity,
  getCargoRedirections, getFeederRoutes, getLogisticsRoutes,
  type CargoKind, type GameAction, type GameState,
} from '../src/index.js';

const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const fresh = () => OneMonopolyEngine.createGame('destinations', seats, 'logistics');
function estimate(state: GameState, tileId: number) {
  const value = getCargoDestinationEstimate(state, 'a', tileId);
  assert.ok(value, `expected the active captain’s estimate for port ${tileId}`);
  return value;
}
function act(state: GameState, action: GameAction) {
  const result = OneMonopolyEngine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state, `${action.type} should be accepted`);
  return result.state;
}
function loaded(kind: CargoKind = 'laden', reefer = false) {
  const state = fresh();
  return act(state, getCargoBookings(state, 'a', kind, reefer).find(choice => choice.tileId === 1)!.action);
}
const sail = (state: GameState, id: number) => act(state, getLogisticsRoutes(state, 'a').find(route => route.tileId === id)!.action);
const divert = (state: GameState, id: number) => act(state, getCargoRedirections(state, 'a').find(choice => choice.tileId === id)!.action);
const unload = (state: GameState) => act(state, getCargoOpportunity(state, 'a')!.action);
const end = (state: GameState) => act(state, { type: 'END_TURN' });

test('compares the cold shipment at Cát Lái against a later Busan discharge and the two actual receipts', () => {
  const state = sail(loaded('laden', true), 1);
  const before = structuredClone(state);
  const atBerth = estimate(state, 1), busan = estimate(state, 17);
  assert.deepEqual([atBerth.arrival, atBerth.arrivalRound, atBerth.legDistanceNm, atBerth.freightDistanceNm, atBerth.receiver],
    ['here', 1, 0, 596, 'public']);
  assert.deepEqual([atBerth.baseFreight, atBerth.reeferBonus, atBerth.total], [12, 8, 20]);
  assert.deepEqual([busan.arrival, busan.arrivalRound, busan.legDistanceNm, busan.freightDistanceNm, busan.receiver],
    ['next-round', 2, 1901, 2472, 'conditional']);
  assert.deepEqual([busan.baseFreight, busan.reeferBonus, busan.total], [16, 0, 16]);
  assert.deepEqual(state, before);
  assert.equal(unload(state).players[0].balance, atBerth.total);
  const nextRound = end(end(divert(state, 17)));
  assert.equal(unload(sail(nextRound, 17)).players[0].balance, busan.total);
});

test('projected tender and backhaul awards match actual settlement at a privately reserved berth', () => {
  let state = loaded('laden', true);
  const captain = state.players[0];
  captain.backhaul = { bookingId: 500, originTileId: 0, destinationTileId: 1, offeredRound: 1, deadlineRound: 2, status: 'active' };
  state.logistics!.market!.contract = { playerId: 'a', kind: 'laden', destinationTileId: 1, deliveryRound: 1, tenderId: 1, amount: 9, status: 'active' };
  state.logistics!.ports[1].demand = 0;
  const dispatch = estimate(state, 1);
  assert.deepEqual([dispatch.arrival, dispatch.receiver, dispatch.publicSlots, dispatch.reeferBonus, dispatch.tenderBonus, dispatch.backhaulBonus, dispatch.total],
    ['sail', 'reserved', 0, 8, 9, 6, 35]);
  const different = estimate(state, 17);
  assert.deepEqual([different.tenderBonus, different.backhaulBonus, different.total], [0, 0, 24]);
  state = unload(sail(state, 1));
  assert.equal(state.players[0].balance, dispatch.total);
});

test('an empty feeder can discharge an adjacent alternative and exhausted final-round sailing cannot earn a payout', () => {
  const state = sail(loaded('empty'), 1);
  const close = estimate(state, 3);
  assert.deepEqual([close.arrival, close.legDistanceNm, close.freightDistanceNm, close.publicSlots, close.total], ['feeder', 20, 586, 1, 6]);
  let moved = divert(state, 3);
  moved = act(moved, getFeederRoutes(moved, 'a').find(route => route.tileId === 3)!.action);
  assert.equal(unload(moved).players[0].balance, close.total);
  state.logistics!.feederAvailable!.a = false;
  state.logistics!.deliveries.b = 3;
  const stranded = estimate(state, 3);
  assert.equal(stranded.arrival, 'unreachable');
  assert.equal(stranded.arrivalRound, null);
  assert.equal(stranded.total, null);
});

test('legacy capacity and sailing rules still apply and invalid captains or destinations have no estimate', () => {
  const state = loaded();
  delete state.logistics!.feederAvailable;
  delete state.logistics!.reeferSlots;
  delete state.logistics!.backhaulEnabled;
  delete state.logistics!.market;
  const moved = sail(state, 1);
  moved.logistics!.ports[1].demand = 0;
  assert.deepEqual([estimate(moved, 1).receiver, estimate(moved, 1).total], ['unavailable', null]);
  assert.equal(estimate(moved, 3).arrival, 'next-round');
  assert.equal(getCargoDestinationEstimate(moved, 'b', 1), null);
  assert.equal(getCargoDestinationEstimate(fresh(), 'a', 1), null);
  for (const id of [0, 2, -1, 40, .5, NaN]) assert.equal(getCargoDestinationEstimate(moved, 'a', id), null);
  assert.equal(getCargoDestinationEstimate(loaded('laden', true), 'a', 3), null);
});

test('an expired private receiver gives no payout until scheduled public demand makes next-round receipt possible', () => {
  const state = sail(loaded(), 1);
  state.logistics!.market!.contract = { playerId: 'a', kind: 'laden', destinationTileId: 17, deliveryRound: 1, tenderId: 4, amount: 13, status: 'active' };
  state.logistics!.ports[17].demand = 0;
  const blocked = estimate(state, 17);
  assert.deepEqual([blocked.arrival, blocked.receiver, blocked.publicSlots, blocked.tenderBonus, blocked.total],
    ['next-round', 'unavailable', 0, 0, null]);
  state.logistics!.market!.contract!.destinationTileId = 31;
  state.logistics!.ports[31].demand = 0;
  const expected = estimate(state, 31);
  assert.deepEqual([expected.receiver, expected.publicSlots, expected.tenderBonus], ['conditional', 0, 0]);
  assert.equal(expected.total, expected.baseFreight);
  let next = end(end(divert(state, 31)));
  assert.equal(next.logistics!.ports[31].demand, 1);
  next = unload(sail(next, 31));
  assert.equal(next.players[0].balance, expected.total);
});

test('backhaul eligibility follows the proposed discharge round and once-per-round cap, regardless of a matching offer', () => {
  const state = sail(loaded(), 1);
  const captain = state.players[0];
  captain.lastBackhaulPaidRound = 1;
  captain.backhaul = { bookingId: 21, originTileId: 0, destinationTileId: 1, offeredRound: 1, deadlineRound: 2, status: 'active' };
  assert.equal(estimate(state, 1).backhaulBonus, 0);
  captain.backhaul.destinationTileId = 17;
  const next = estimate(state, 17);
  assert.deepEqual([next.arrivalRound, next.backhaulBonus, next.total], [2, 6, 22]);
  assert.equal(unload(sail(end(end(divert(state, 17))), 17)).players[0].balance, next.total);
  captain.backhaul.deadlineRound = 1;
  assert.equal(estimate(state, 17).backhaulBonus, 0);
  captain.backhaul.deadlineRound = 2;
  captain.backhaul.status = 'offered';
  assert.equal(estimate(state, 17).backhaulBonus, 0);
});
