import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OneMonopolyEngine, getCargoBookings, getCargoOpportunity, getLogisticsRoutes, type GameState, type GameAction } from '../src/index.js';

const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const fresh = () => OneMonopolyEngine.createGame('roundtrip', seats, 'logistics');
function run(state: GameState, action: GameAction) {
  const result = OneMonopolyEngine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state, `expected an accepted ${action.type}`);
  return result.state;
}
const end = (state: GameState) => run(state, { type: 'END_TURN' });
const load = (state: GameState, kind: 'laden' | 'empty', to: number) => run(state, getCargoBookings(state, 'a', kind).find(choice => choice.tileId === to)!.action);
const sail = (state: GameState, to: number) => run(state, getLogisticsRoutes(state, 'a').find(choice => choice.tileId === to)!.action);
const unload = (state: GameState) => run(state, getCargoOpportunity(state, 'a')!.action);
const deliver = (s: GameState, to: number) => unload(sail(load(s, 'laden', to), to));
const accept = (s: GameState): GameAction => ({type: 'ACCEPT_BACKHAUL', bookingId: s.players[0].lastDelivery!.bookingId, revision: s.cargoRevision!});

test('the signed return receipt pays six once, beside ordinary freight and tender earnings', () => {
  let state = deliver(fresh(), 1);
  assert.deepEqual([state.players[0].backhaul?.originTileId, state.players[0].backhaul?.destinationTileId, state.players[0].backhaul?.deadlineRound], [1, 0, 2]);
  const choice = accept(state);
  assert.equal(OneMonopolyEngine.dispatch(state, choice, 'b').state, state);
  assert.equal(OneMonopolyEngine.dispatch(state, {...choice, bookingId: 999} as GameAction, 'a').state, state);
  state = run(state, choice);
  assert.equal(OneMonopolyEngine.dispatch(state, choice, 'a').state, state);
  assert.equal(OneMonopolyEngine.dispatch(state, accept(state), 'a').state, state);
  assert.equal(state.players[0].backhaul?.status, 'active');
  state = load(state, 'laden', 0);
  state = end(end(state));
  state.logistics!.market!.contract = {playerId:'a', kind:'laden', amount:7, tenderId:1, deliveryRound:2, destinationTileId:0, status:'active'};
  state = sail(state, 0);
  const action = getCargoOpportunity(state, 'a')!.action;
  const result = OneMonopolyEngine.dispatch(state, action, 'a');
  const next = result.state;
  assert.deepEqual([next.players[0].lastDelivery!.reward,next.players[0].lastDelivery!.tenderBonus,next.players[0].lastDelivery!.backhaulBonus], [12,7,6]);
  assert.equal(next.logistics!.earnings.a, 12 + 12 + 7 + 6);
  assert.equal(next.players[0].balance, next.logistics!.earnings.a);
  assert.equal(next.players[0].lastBackhaul?.status, 'fulfilled');
  assert.equal(result.events.filter(e => e.type === 'BACKHAUL_FULFILLED').length, 1);
  assert.equal(OneMonopolyEngine.dispatch(next, action, 'a').state, next);
});

test('ignoring the offer preserves freight and prevents a late signature from a stale or refreshed browser', () => {
  let s = deliver(fresh(), 1);
  const original = accept(s);
  s = end(end(s));
  assert.equal(s.players[0].backhaul, undefined);
  assert.equal(OneMonopolyEngine.dispatch(s, original, 'a').state, s);
  assert.equal(OneMonopolyEngine.dispatch(s, accept(s), 'a').state, s);
  s = deliver(s, 0);
  assert.equal(s.players[0].lastDelivery?.backhaulBonus, undefined);
  assert.equal(s.logistics!.earnings.a, 24);
});

test('an unserved job remains valid through its stated round, then expires without a cash penalty', () => {
  let s = deliver(fresh(), 1);
  s = run(s, accept(s));
  s = end(end(s));
  assert.equal(s.players[0].backhaul?.status, 'active');
  const balance = s.players[0].balance;
  s = end(end(s));
  assert.equal(s.players[0].lastBackhaul?.status, 'expired');
  assert.equal(s.players[0].balance, balance);
});

test('a saved room without backhauls continues to discharge at its original rate', () => {
  const original = fresh();
  delete original.logistics!.backhaulEnabled;
  const s = deliver(original, 1);
  assert.equal(s.players[0].backhaul, undefined);
  assert.equal(s.players[0].balance, 12);
});

test('a returned empty earns the premium, while an unrelated delivery closes its signed offer unpaid', () => {
  const start = fresh();
  start.logistics!.ports[0].empties = 0;
  start.logistics!.ports[1].empties = 3;
  let s = deliver(start, 1);
  s = run(s, accept(s));
  const back = unload(sail(load(end(end(s)), 'empty', 0), 0));
  assert.equal(back.players[0].lastDelivery?.backhaulBonus, 6);
  assert.equal(back.logistics!.earnings.a, 12 + 6 + 6);
  const elsewhere = deliver(end(end(s)), 3);
  assert.equal(elsewhere.players[0].lastDelivery?.backhaulBonus, undefined);
  assert.equal(elsewhere.players[0].lastBackhaul?.status, 'expired');
  assert.equal(elsewhere.logistics!.deliveries.a, 2);
});

test('an optional signature reserves no cargo and no receiver; a captain cannot collect two backhaul premiums in a round', () => {
  let s = deliver(fresh(), 1);
  s.logistics!.ports[0].demand = 0;
  s.logistics!.ports[0].empties = 3;
  s = run(s, accept(s));
  assert.equal(getCargoBookings(s, 'a', 'laden').some(route => route.tileId === 0), false);
  s.logistics!.ports[0].demand = 1;
  s = end(end(s));
  s.players[0].lastBackhaulPaidRound = s.turnCount;
  s = deliver(s, 0);
  assert.equal(s.players[0].lastDelivery?.backhaulBonus, undefined);
  assert.equal(s.logistics!.earnings.a, 24);
});

test('the final round offers an achievable local return with a match-end deadline and hides an unreachable return', () => {
  const start = fresh();
  start.logistics!.deliveries.a = 2;
  let nearby = deliver(start, 1);
  assert.equal(nearby.players[0].backhaul?.deadlineRound, nearby.turnCount);
  nearby = run(nearby, accept(nearby));
  nearby = load(nearby, 'laden', 0);
  nearby = run(nearby, {type: 'SAIL_FEEDER', tileId:0, revision:nearby.cargoRevision!});
  nearby = unload(nearby);
  assert.equal(nearby.players[0].lastDelivery?.backhaulBonus, 6);
  assert.equal(nearby.players[0].backhaul, undefined);
  const distant = deliver(start, 17);
  assert.equal(distant.players[0].backhaul, undefined);
});

test('a rival triggering the final round shortens an existing job through the actual match ending', () => {
  let state = deliver(fresh(), 1);
  state = end(run(state, accept(state)));
  state.logistics!.deliveries.b = 2;
  const out = getCargoBookings(state, 'b', 'laden').find(item => item.tileId === 3)!;
  state = run(state, out.action);
  state = run(state, getLogisticsRoutes(state, 'b').find(item => item.tileId === 3)!.action);
  state = run(state, getCargoOpportunity(state, 'b')!.action);
  assert.equal(state.players[0].backhaul?.deadlineRound, 1);
  state = end(state);
  assert.ok(state.winnerId);
  assert.equal(state.players[0].lastBackhaul?.status, 'expired');
  assert.equal(state.players[0].lastBackhaul?.deadlineRound, 1);
});
