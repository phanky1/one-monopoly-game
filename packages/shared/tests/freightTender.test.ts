import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FREIGHT_TENDER_MAX_BID, FREIGHT_TENDER_MIN_BID, getCargoBookings, getCargoOpportunity, getCargoRedirections,
  getFreightQuote, getLogisticsRoutes, getTenderBidAction, getTenderBonus, LOGISTICS_PORT_CAPACITY,
  OneMonopolyEngine, type CargoKind, type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'c', name: 'Chi', token: 'ONE_MAGENTA' as const },
];
const fresh = (count = 2) => createGame('market', seats.slice(0, count), 'logistics');
const active = (s: GameState) => s.players[s.activePlayerIndex].id;
const market = (s: GameState) => s.logistics!.market!;
function act(s: GameState, action: GameAction) {
  const result = dispatch(s, action, active(s));
  assert.notEqual(result.state, s, action.type);
  return result;
}
function end(s: GameState) { return act(s, { type: 'END_TURN' }).state; }
function bid(s: GameState, amount: number) {
  const action = getTenderBidAction(s, active(s), amount);
  assert.ok(action);
  return act(s, action).state;
}
function load(s: GameState, kind: CargoKind, destination: number) {
  const offer = getCargoBookings(s, active(s), kind).find(offer => offer.tileId === destination);
  assert.ok(offer);
  return act(s, offer.action).state;
}
function sail(s: GameState, destination: number) {
  const route = getLogisticsRoutes(s, active(s)).find(route => route.tileId === destination);
  assert.ok(route);
  return act(s, route.action).state;
}
function unload(s: GameState) {
  const offer = getCargoOpportunity(s, active(s));
  assert.ok(offer?.action.type === 'UNLOAD_CARGO');
  return act(s, offer.action);
}

describe('sealed freight tenders', () => {
  it('accepts valid whole-dollar bids only on the current seat and allows revising without exposing an amount in events', () => {
    const start = fresh();
    const tender = market(start).tender!;
    assert.deepEqual([tender.kind, tender.destinationTileId, tender.priorityPlayerId], ['laden', 17, 'a']);
    for (const value of [3, 17, 8.5, NaN]) assert.equal(getTenderBidAction(start, 'a', value), null);
    assert.equal(getTenderBidAction(start, 'b', 8), null);
    const first = getTenderBidAction(start, 'a', FREIGHT_TENDER_MIN_BID)!;
    assert.equal(dispatch(start, first, 'b').state, start);
    assert.equal(dispatch(start, { ...first, tenderId: 87 }, 'a').state, start);
    const result = act(start, first);
    assert.deepEqual(result.events, [{ type: 'FREIGHT_TENDER_BID', tenderId: tender.id, playerId: 'a' }]);
    assert.equal(getTenderBidAction(result.state, 'a', first.amount), null);
    assert.equal(dispatch(result.state, first, 'a').state, result.state);
    const arrived = sail(result.state, 3);
    const changed = bid(arrived, FREIGHT_TENDER_MAX_BID);
    assert.deepEqual(market(changed).tender!.bidderIds, ['a']);
    assert.equal(market(changed).tender!.bidCount, 1);
    assert.equal(market(changed).tender!.bids.a, FREIGHT_TENDER_MAX_BID);
    const closed = end(bid(end(changed), 9));
    assert.equal(market(closed).contract!.playerId, 'b');
    assert.equal(market(closed).contract!.amount, 9);
    assert.deepEqual(market(closed).tender!.bids, {});
    assert.equal(closed.players[1].balance, 0);
  });

  it('rotates tied quotes by bidding round and issues calls independently of the submitted prices', () => {
    let state = end(bid(end(bid(fresh(), 8)), 8));
    assert.equal(market(state).contract!.playerId, 'a');
    assert.equal(market(state).tender!.priorityPlayerId, 'b');
    assert.equal(market(state).tender!.kind, 'empty');
    const noBids = end(end(fresh()));
    const alternate = market(noBids).tender!;
    assert.deepEqual([alternate.kind, alternate.destinationTileId], [market(state).tender!.kind, market(state).tender!.destinationTileId]);
    state = unload(sail(load(state, 'laden', 17), 17)).state;
    state = end(bid(end(bid(state, 12)), 12));
    assert.equal(market(state).contract!.playerId, 'b');
    assert.equal(market(state).history[0].status, 'fulfilled');
  });

  it('lets only the winner book, redirect and discharge using the shipper’s truck after a rival consumes the last public slot', () => {
    let state = fresh(3);
    state.logistics!.ports[17].demand = 1;
    state = end(bid(state, 8));
    state = end(state); // Second seat stays in Singapore.
    state = end(unload(sail(load(state, 'laden', 17), 17)).state);
    assert.equal(state.logistics!.ports[17].demand, 0);
    const rivalTurn = end(state);
    assert.ok(!getCargoBookings(rivalTurn, 'b', 'laden').some(item => item.tileId === 17));
    assert.equal(getTenderBonus(rivalTurn, 'b', 17, 'laden'), 0);
    assert.equal(getTenderBonus(state, 'a', 17, 'empty'), 0);
    assert.ok(getCargoBookings(state, 'a', 'laden').some(item => item.tileId === 17));
    state = load(state, 'laden', 3);
    const cod = getCargoRedirections(state, 'a').find(item => item.tileId === 17)!;
    state = act(state, cod.action).state;
    const leg = getLogisticsRoutes(state, 'a').find(item => item.tileId === 17)!;
    assert.deepEqual(leg.quote, getFreightQuote(0, 17));
    state = act(state, leg.action).state;
    const action = getCargoOpportunity(state, 'a')!.action;
    const result = act(state, action);
    const paid = result.state.players[0].lastDelivery!;
    assert.equal(paid.reward, leg.quote!.reward);
    assert.equal(paid.tenderBonus, 8);
    assert.equal(paid.tenderId, 1);
    assert.equal(result.state.players[0].balance, paid.reward + 8);
    assert.equal(result.state.logistics!.earnings.a, paid.reward + 8);
    assert.equal(market(result.state).bonusEarnings.a, 8);
    assert.equal(result.state.logistics!.ports[17].demand, 0);
    assert.equal(result.events.filter(e => e.type === 'FREIGHT_CONTRACT_FULFILLED').length, 1);
    assert.equal(getTenderBonus(result.state, 'a', 17, 'laden'), 0);
    assert.equal(dispatch(result.state, action, 'a').state, result.state);
    const restored = JSON.parse(JSON.stringify(end(end(end(result.state))))) as GameState;
    assert.equal(market(restored).history[0].status, 'fulfilled');
    assert.equal(restored.players[0].lastDelivery!.tenderBonus, 8);
  });

  it('honors an empty booking loaded before award at a fully stocked yard and keeps freight and premium separate', () => {
    let state = end(end(fresh()));
    const tender = market(state).tender!;
    assert.equal(tender.kind, 'empty');
    const dest = tender.destinationTileId;
    state = sail(load(bid(state, 12), 'empty', dest), dest);
    const bookingId = state.players[0].cargo!.bookingId;
    state = end(end(state)); // The bidder kept its load for the delivery round.
    state.logistics!.ports[dest].empties = LOGISTICS_PORT_CAPACITY;
    const result = unload(state);
    const paid = result.state.players[0].lastDelivery!;
    assert.equal(paid.bookingId, bookingId);
    assert.equal(paid.reward, getFreightQuote(0, dest, 'empty')!.reward);
    assert.equal(paid.tenderBonus, 12);
    assert.equal(result.state.logistics!.ports[dest].empties, LOGISTICS_PORT_CAPACITY);
    assert.equal(result.state.logistics!.emptyDeliveries.a, 1);
  });

  it('skips an unfulfilled carrier at this award only and continues to accept its next bid', () => {
    let state = end(end(bid(fresh(), 12))); // R1 awarded to the first seat.
    state = end(bid(state, 4));             // Same captain leaves its contract unserved.
    state = bid(state, 9);
    const result = act(state, { type: 'END_TURN' });
    assert.deepEqual(result.events.map(event => event.type), ['LOGISTICS_TURN_ENDED', 'FREIGHT_CONTRACT_EXPIRED', 'FREIGHT_TENDER_AWARDED']);
    assert.equal(market(result.state).history[0].status, 'expired');
    assert.equal(market(result.state).contract!.playerId, 'b');
    assert.equal(market(result.state).contract!.amount, 9);
    assert.equal(market(result.state).bonusEarnings.a, 0);
    assert.equal(result.state.players[0].balance, 0);
    const nextAward = end(end(bid(result.state, 4)));
    assert.equal(market(nextAward).contract!.playerId, 'a');
  });

  it('cancels future bidding immediately at the target but honors the current award through the last seat', () => {
    let state = end(bid(end(fresh()), 8)); // Second seat has the active Busan contract.
    state.logistics!.deliveries.a = 2;
    state = bid(state, 5);
    state = unload(sail(load(state, 'laden', 3), 3)).state;
    assert.equal(market(state).tender, null);
    state = end(state);
    assert.equal(getTenderBidAction(state, 'b', 9), null);
    assert.equal(getTenderBonus(state, 'b', 17, 'laden'), 8);
    state = unload(sail(load(state, 'laden', 17), 17)).state;
    const finish = act(state, { type: 'END_TURN' });
    assert.ok(finish.events.some(event => event.type === 'GAME_OVER'));
    assert.ok(!finish.events.some(event => event.type === 'FREIGHT_TENDER_AWARDED'));
    assert.equal(market(finish.state).history[0].status, 'fulfilled');
    assert.equal(market(finish.state).contract, null);
  });

  it('awards the seventh-round tender for round eight without issuing an unfulfillable ninth-round contract', () => {
    let state = fresh();
    while (state.turnCount < 7) state = end(state);
    state = end(end(bid(state, 10)));
    assert.equal(state.turnCount, 8);
    assert.equal(market(state).contract!.deliveryRound, 8);
    assert.equal(market(state).tender, null);
    const finish = act(end(state), { type: 'END_TURN' });
    assert.deepEqual(finish.events.map(e => e.type), ['LOGISTICS_TURN_ENDED', 'FREIGHT_CONTRACT_EXPIRED', 'GAME_OVER']);
  });

  it('leaves classic and pre-tender logistics saves outside the freight market', () => {
    const classic = createGame('classic', seats);
    const legacy = fresh();
    delete legacy.logistics!.market;
    const attempted = getTenderBidAction(fresh(), 'a', 8)!;
    for (const state of [classic, legacy]) {
      assert.equal(getTenderBidAction(state, 'a', 8), null);
      assert.equal(dispatch(state, attempted, 'a').state, state);
      assert.equal(getTenderBonus(state, 'a', 17, 'laden'), 0);
    }
    const advanced = end(end(legacy));
    assert.equal(advanced.logistics!.market, undefined);
    assert.equal(advanced.turnCount, 2);
  });
});
