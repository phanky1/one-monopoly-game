import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getLogisticsRoutes, getTenderBidAction, getWithdrawTenderBidAction,
  LOGISTICS_ROUND_LIMIT, OneMonopolyEngine, type GameAction, type GameState,
} from '../src/index.js';

const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'c', name: 'Chi', token: 'ONE_MAGENTA' as const },
];
const { createGame, dispatch } = OneMonopolyEngine;
const fresh = (count = 2) => createGame('withdraw', seats.slice(0, count), 'logistics');
const market = (state: GameState) => state.logistics!.market!;

function apply(state: GameState, action: GameAction) {
  const outcome = dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(outcome.state, state, action.type);
  return outcome;
}
function bid(state: GameState, amount: number) {
  const request = getTenderBidAction(state, state.players[state.activePlayerIndex].id, amount);
  assert.ok(request);
  return apply(state, request).state;
}
function end(state: GameState) {
  return apply(state, { type: 'END_TURN' }).state;
}
function withdrawal(state: GameState) {
  const action = getWithdrawTenderBidAction(state, state.players[state.activePlayerIndex].id);
  assert.ok(action);
  return action;
}
function reject(state: GameState, action: GameAction, actor: string) {
  const outcome = dispatch(state, action, actor);
  assert.equal(outcome.state, state);
  assert.deepEqual(outcome.events, []);
}

test('a captain can withdraw before sailing without disclosing a price or changing freight', () => {
  const start = fresh();
  const booking = getCargoBookings(start, 'a', 'laden').find(option => option.tileId === 17);
  assert.ok(booking);
  const quoted = bid(apply(start, booking.action).state, 4);
  const request = { type: 'WITHDRAW_FREIGHT_TENDER_BID', tenderId: 1, revision: quoted.cargoRevision! } as const;
  const result = dispatch(quoted, request, 'a');
  assert.deepEqual(result.events, [{ type: 'FREIGHT_TENDER_BID_WITHDRAWN', tenderId: 1, playerId: 'a' }]);
  assert.deepEqual(getWithdrawTenderBidAction(quoted, 'a'), request);
  const expected = structuredClone(quoted);
  expected.cargoRevision = request.revision + 1;
  const tender = market(expected).tender!;
  delete tender.bids.a;
  tender.bidderIds = [];
  tender.bidCount = 0;
  assert.deepEqual(result.state, expected);
  assert.deepEqual(market(quoted).tender!.bids, { a: 4 });
  assert.equal(getWithdrawTenderBidAction(result.state, 'a'), null);
  reject(result.state, request, 'a');
  reject(result.state, { ...request, revision: result.state.cargoRevision! }, 'a');
});

test('a post-sailing withdrawal removes only the lowest quote and awards the remaining bidder', () => {
  let state = end(bid(fresh(), 11));
  state = bid(state, 4);
  const beforeSailing = withdrawal(state);
  const route = getLogisticsRoutes(state, 'b').find(choice => choice.tileId === 17);
  assert.ok(route);
  state = apply(state, route.action).state;
  assert.equal(state.phase, 'END_OF_TURN');
  reject(state, beforeSailing, 'b');
  state = JSON.parse(JSON.stringify(state)); // Resume the same live turn with the newer revision.
  const removed = apply(state, withdrawal(state));
  assert.deepEqual(removed.events, [{ type: 'FREIGHT_TENDER_BID_WITHDRAWN', tenderId: 1, playerId: 'b' }]);
  const tender = market(removed.state).tender!;
  assert.deepEqual(tender.bids, { a: 11 });
  assert.deepEqual(tender.bidderIds, ['a']);
  assert.equal(tender.bidCount, 1);
  const closed = apply(removed.state, { type: 'END_TURN' });
  const award = closed.events.find(e => e.type === 'FREIGHT_TENDER_AWARDED');
  assert.deepEqual([award?.playerId, award?.amount, award?.tenderId], ['a', 11, 1]);
  assert.deepEqual([market(closed.state).contract?.playerId, market(closed.state).contract?.amount], ['a', 11]);
  assert.deepEqual(closed.state.players.map(player => player.balance), [0, 0]);
});

test('removing the last quote closes without an award and a fresh bid still participates in the next round’s tie', () => {
  let state = bid(fresh(3), 6);
  state = apply(state, withdrawal(state)).state;
  const roundEnd = apply(end(end(state)), { type: 'END_TURN' });
  assert.equal(roundEnd.events.some(e => e.type === 'FREIGHT_TENDER_AWARDED'), false);
  assert.equal(market(roundEnd.state).contract, null);
  assert.deepEqual(market(roundEnd.state).history, []);
  assert.equal(market(roundEnd.state).tender!.priorityPlayerId, 'b');

  state = bid(end(bid(roundEnd.state, 7)), 4); // A submitted 7, B submitted 4.
  const oldWithdrawal = withdrawal(state);
  state = apply(state, oldWithdrawal).state;
  state = bid(state, 7);
  reject(state, oldWithdrawal, 'b'); // The delayed retry must not remove B's new quote.
  assert.deepEqual(market(state).tender!.bidderIds, ['a', 'b']);
  state = bid(end(state), 7);
  assert.equal(market(state).tender!.bidCount, 3);
  const newRound = end(state);
  const winner = market(newRound).contract!;
  assert.deepEqual([winner.playerId, winner.amount, winner.tenderId], ['b', 7, 2]);
});

test('withdrawal requires the current tender, its bidder’s own turn and a live freight market', () => {
  const initial = fresh();
  const quoted = bid(initial, 7);
  const request = withdrawal(quoted);
  assert.equal(getWithdrawTenderBidAction(initial, 'a'), null);
  assert.equal(getWithdrawTenderBidAction(quoted, 'b'), null);
  reject(quoted, request, 'b');
  reject(quoted, { ...request, tenderId: 2 }, 'a');

  const revised = bid(quoted, 9);
  reject(revised, request, 'a');
  const rivalsTurn = end(revised);
  assert.equal(getWithdrawTenderBidAction(rivalsTurn, 'a'), null);
  assert.equal(getWithdrawTenderBidAction(rivalsTurn, 'b'), null);
  reject(rivalsTurn, { ...request, revision: rivalsTurn.cargoRevision! }, 'a');
  reject(rivalsTurn, { ...request, revision: rivalsTurn.cargoRevision! }, 'b');
  const nextTender = bid(end(rivalsTurn), 6);
  reject(nextTender, { ...request, revision: nextTender.cargoRevision! }, 'a');
  assert.deepEqual(market(nextTender).tender!.bids, { a: 6 });
  const award = market(nextTender).contract!;
  assert.deepEqual([award.playerId, award.amount, award.status], ['a', 9, 'active']);
  const withdrawn = apply(nextTender, withdrawal(nextTender)).state;
  assert.deepEqual(market(withdrawn).contract, award);

  const classic = createGame('classic', seats);
  const legacy = structuredClone(quoted);
  delete legacy.logistics!.market;
  let lastRound = initial;
  while (lastRound.turnCount < LOGISTICS_ROUND_LIMIT) lastRound = end(lastRound);
  assert.equal(market(lastRound).tender, null);
  for (const state of [classic, legacy, lastRound, end(end(lastRound))]) {
    assert.equal(getWithdrawTenderBidAction(state, 'a'), null);
    reject(state, { ...request, revision: state.cargoRevision ?? 0 }, 'a');
  }
});
