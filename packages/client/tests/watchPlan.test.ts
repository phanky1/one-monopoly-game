import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoOpportunity, getCargoRedirections, getEarlyTruckCalls, getFreightQuote, getLogisticsRoutes,
  LOGISTICS_ROUND_LIMIT, OneMonopolyEngine, type GameAction, type GameState,
} from '@one-monopoly/shared';
import {
  createWatchPlan, getWatchRates, getWatchTurn, isWatchPlan, resolveWatchPlan, type WatchService,
} from '../src/components/watchPlan.js';

const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'c', name: 'Chi', token: 'GANTRY_CRANE' as const }, { id: 'd', name: 'Dung', token: 'ONE_MAGENTA' as const },
];
const fresh = (count = 2) => OneMonopolyEngine.createGame('watch-room', seats.slice(0, count), 'logistics');
const apply = (state: GameState, action: GameAction) => {
  const result = OneMonopolyEngine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state, action.type);
  return result.state;
};
const end = (state: GameState) => apply(state, { type: 'END_TURN' });
function load(state: GameState, to: number, reefer = false) {
  const id = state.players[state.activePlayerIndex].id;
  return apply(state, getCargoBookings(state, id, 'laden', reefer).find(choice => choice.tileId === to)!.action);
}
function sail(state: GameState, to: number) {
  const id = state.players[state.activePlayerIndex].id;
  return apply(state, getLogisticsRoutes(state, id).find(choice => choice.tileId === to)!.action);
}
function draft(s: GameState, id: string, service: WatchService, to: number) {
  const plan = createWatchPlan(s, id, service, to);
  assert.ok(plan);
  return plan;
}

test('across two, three and four seats only a waiting captain can draft for their next turn; the preview has no action or side effects', () => {
  for (const count of [2, 3, 4]) {
    let state = fresh(count);
    for (let activeIndex = 0; activeIndex < count; activeIndex++) {
      const before = structuredClone(state);
      for (const [index, { id }] of state.players.entries()) {
        if (index === activeIndex) {
          assert.equal(getWatchTurn(state, id), null);
          assert.equal(createWatchPlan(state, id, 'laden', 1), null);
          continue;
        }
        const turnRound = index > activeIndex ? 1 : 2;
        assert.equal(getWatchTurn(state, id), turnRound);
        const rates = getWatchRates(state, id, 'laden');
        assert.equal(rates.get(1), getFreightQuote(0, 1)!.reward);
        assert.equal(rates.has(0), false);
        const plan = draft(state, id, 'laden', 1);
        assert.deepEqual(plan, { roomId: state.roomId, playerId: id, turnRound, berthId: 0,
          bookingId: null, bookedDestinationId: null, service: 'laden', tileId: 1 });
        assert.deepEqual(resolveWatchPlan(state, id, plan), { status: 'waiting', action: null });
      }
      assert.deepEqual(state, before);
      state = end(state);
    }
  }
});

test('laden, empty and reefer plans produce the live booking only on their owner’s turn and cannot repeat the booking', () => {
  for (const service of ['laden', 'empty', 'reefer'] as const) {
    const waiting = fresh();
    const plan = draft(waiting, 'b', service, 1);
    const state = end(waiting);
    const before = structuredClone(state);
    const restored = JSON.parse(JSON.stringify(plan));
    assert.ok(isWatchPlan(restored));
    const resolved = resolveWatchPlan(state, 'b', restored);
    assert.equal(resolved?.status, 'ready');
    assert.ok(resolved.action);
    const expected = getCargoBookings(state, 'b', service === 'empty' ? 'empty' : 'laden', service === 'reefer')
      .find(choice => choice.tileId === 1)!.action;
    assert.deepEqual(resolved.action, expected);
    assert.deepEqual(state, before);
    const loaded = apply(state, resolved.action);
    assert.equal(loaded.players[1].cargo?.destinationTileId, 1);
    assert.equal(loaded.players[1].cargo?.reeferDueRound, service === 'reefer' ? 1 : undefined);
    assert.equal(resolveWatchPlan(loaded, 'b', plan), null);
    assert.equal(OneMonopolyEngine.dispatch(loaded, resolved.action, 'b').state, loaded);
  }
});

test('after a rival consumes Cát Lái’s sole import receiver the saved laden plan is blocked, while its public base quote stays available', () => {
  const start = fresh();
  const plan = draft(start, 'b', 'laden', 1);
  const docked = sail(load(start, 1), 1);
  const discharged = apply(docked, getCargoOpportunity(docked, 'a')!.action);
  assert.equal(discharged.logistics!.ports[1].demand, 0);
  assert.equal(getWatchRates(discharged, 'b', 'laden').get(1), getFreightQuote(0, 1)!.reward);
  assert.deepEqual(resolveWatchPlan(discharged, 'b', plan), { status: 'waiting', action: null });
  const active = end(discharged);
  assert.ok(!getCargoBookings(active, 'b', 'laden').some(choice => choice.tileId === 1));
  assert.deepEqual(resolveWatchPlan(active, 'b', plan), { status: 'blocked', action: null });
});

test('a later yard change can make a blocked loading plan legal again at the latest revision', () => {
  const waiting = fresh();
  waiting.players[1].position = 12; // Valencia can call an export truck before the next rollover.
  assert.equal(waiting.logistics!.ports[12].supply, 0);
  const plan = draft(waiting, 'b', 'laden', 1);
  const active = end(waiting);
  assert.deepEqual(resolveWatchPlan(active, 'b', plan), { status: 'blocked', action: null });
  const pickup = getEarlyTruckCalls(active, 'b').find(call => call.operation === 'export')!;
  const packed = apply(active, pickup.action);
  const resolved = resolveWatchPlan(packed, 'b', plan);
  assert.equal(resolved?.status, 'ready');
  assert.ok(resolved.action);
  assert.deepEqual(resolved.action, getCargoBookings(packed, 'b', 'laden').find(choice => choice.tileId === 1)!.action);
  assert.equal(apply(packed, resolved.action).players[1].cargo?.originTileId, 12);
});

test('a draft quotes base freight regardless of sealed bids; a dedicated shipper can receive the live booking at zero public demand', () => {
  const waiting = fresh();
  waiting.logistics!.ports[17].demand = 0;
  const market = waiting.logistics!.market!;
  market.contract = { tenderId: 9, playerId: 'b', deliveryRound: 1, destinationTileId: 17,
    kind: 'laden', status: 'active', amount: 10 };
  const original = draft(waiting, 'b', 'laden', 17);
  for (const amount of [4, 16]) {
    market.tender!.bids.a = amount;
    assert.equal(getWatchRates(waiting, 'b', 'laden').get(17), getFreightQuote(0, 17)!.reward);
    assert.deepEqual(draft(waiting, 'b', 'laden', 17), original);
    assert.deepEqual(resolveWatchPlan(waiting, 'b', original), { status: 'waiting', action: null });
  }
  const active = end(waiting);
  const live = resolveWatchPlan(active, 'b', original);
  assert.equal(live?.status, 'ready');
  assert.ok(live.action);
  assert.equal(apply(active, live.action).players[1].cargo?.destinationTileId, 17);
});

test('reefer compatibility, shared plug use and empty-equipment scarcity remain distinct', () => {
  const waiting = fresh();
  const cold = draft(waiting, 'b', 'reefer', 17);
  assert.equal(createWatchPlan(waiting, 'b', 'reefer', 3), null);
  const usedPlug = end(load(waiting, 1, true));
  assert.ok(usedPlug.logistics!.ports[0].supply > 0 && usedPlug.logistics!.ports[17].demand > 0);
  assert.deepEqual(resolveWatchPlan(usedPlug, 'b', cold), { status: 'blocked', action: null });
  const legacy = structuredClone(usedPlug);
  delete legacy.logistics!.reeferSlots;
  assert.equal(resolveWatchPlan(legacy, 'b', cold), null);
  const equipment = draft(waiting, 'b', 'empty', 1);
  for (const yard of ['origin', 'destination']) {
    const active = end(waiting);
    const stock = active.logistics!.ports[yard === 'origin' ? 0 : 1];
    stock.empties = stock.emptyTarget;
    assert.deepEqual(resolveWatchPlan(active, 'b', equipment), { status: 'blocked', action: null });
  }
});

test('a COD plan follows the original freight origin and survives only for the same booking, booked target and holding berth', () => {
  const waiting = end(sail(load(fresh(), 3), 14)); // An is in Hamburg with a Singapore → Cái Mép booking.
  const cargo = waiting.players[0].cargo!;
  const rates = getWatchRates(waiting, 'a', 'redirect');
  assert.equal(rates.get(15), getFreightQuote(0, 15)!.reward);
  assert.notEqual(rates.get(15), getFreightQuote(14, 15)!.reward);
  assert.ok(!rates.has(0) && !rates.has(3));
  assert.equal(createWatchPlan(waiting, 'a', 'laden', 15), null);
  assert.equal(createWatchPlan(waiting, 'b', 'redirect', 15), null);
  const plan = draft(waiting, 'a', 'redirect', 15);
  assert.deepEqual([plan.berthId, plan.bookingId, plan.bookedDestinationId, plan.turnRound], [14, cargo.bookingId, 3, 2]);
  const active = end(waiting);
  const resolved = resolveWatchPlan(active, 'a', plan);
  assert.equal(resolved?.status, 'ready');
  assert.ok(resolved.action);
  const live = getCargoRedirections(active, 'a').find(choice => choice.tileId === 15)!.action;
  assert.deepEqual(resolved.action, live);
  for (const changed of [sail(active, 1), apply(active, live)]) assert.equal(resolveWatchPlan(changed, 'a', plan), null);
  const replacement = structuredClone(active);
  replacement.players[0].cargo!.bookingId++;
  assert.equal(resolveWatchPlan(replacement, 'a', plan), null);
  const redirected = apply(active, resolved.action);
  assert.equal(redirected.players[0].cargo?.originTileId, 0);
  assert.equal(redirected.players[0].cargo?.destinationTileId, 15);
  assert.equal(redirected.players[0].balance, active.players[0].balance);
});

test('only remaining seats can plan in a final round, and a saved plan expires as soon as its seat passes', () => {
  const start = fresh(3);
  const ordinary = draft(start, 'b', 'laden', 1);
  const missed = end(end(start));
  assert.equal(missed.turnCount, ordinary.turnRound);
  assert.equal(resolveWatchPlan(missed, 'b', ordinary), null);
  assert.equal(resolveWatchPlan(end(missed), 'b', ordinary), null);
  const middle = end(start);
  const nextRound = draft(middle, 'a', 'laden', 1);
  for (const reason of ['round limit', 'delivery target']) {
    const final = structuredClone(middle);
    if (reason === 'round limit') final.turnCount = LOGISTICS_ROUND_LIMIT;
    else final.logistics!.deliveries.b = 3;
    assert.equal(getWatchTurn(final, 'a'), null);
    assert.equal(createWatchPlan(final, 'a', 'laden', 1), null);
    assert.equal(getWatchTurn(final, 'c'), final.turnCount);
    assert.equal(draft(final, 'c', 'laden', 1).turnRound, final.turnCount);
    assert.equal(resolveWatchPlan(final, 'a', nextRound), null);
  }
  const done = { ...start, winnerId: 'c' };
  assert.equal(resolveWatchPlan(done, 'b', ordinary), null);
});

test('persisted drafts validate board ports and cargo identity, stay scoped to the room and seat, and never supply their own action', () => {
  const waiting = fresh();
  const plan = draft(waiting, 'b', 'laden', 1);
  for (const invalid of [null, [], {}, { ...plan, turnRound: 0 }, { ...plan, turnRound: 1.5 }, { ...plan, turnRound: 9 },
    { ...plan, berthId: 2 }, { ...plan, tileId: 88 }, { ...plan, service: 'mystery' }, { ...plan, bookingId: 2 },
    { ...plan, bookedDestinationId: 3 }, { ...plan, service: 'redirect' }, { ...plan, roomId: '' }, { ...plan, playerId: '' }]) {
    assert.equal(isWatchPlan(invalid), false);
    assert.equal(resolveWatchPlan(waiting, 'b', invalid), null);
  }
  assert.equal(resolveWatchPlan(waiting, 'b', { ...plan, roomId: 'another-room' }), null);
  assert.equal(resolveWatchPlan(waiting, 'a', plan), null);
  const stale = { ...plan, action: { type: 'END_TURN' }, revision: -100 };
  const active = end(waiting);
  assert.deepEqual(resolveWatchPlan(active, 'b', stale)?.action,
    getCargoBookings(active, 'b', 'laden').find(option => option.tileId === 1)!.action);
  assert.equal(getWatchTurn(OneMonopolyEngine.createGame('classic', seats, 'classic'), 'b'), null);
});
