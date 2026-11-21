import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHarborFreightOpportunity, OneMonopolyEngine, type GameState } from '@one-monopoly/shared';
import { getHarborAuctionChoices } from '../src/components/harborAuctionChoices.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'minh', name: 'Minh', token: 'ONE_APUS' as const },
  { id: 'linh', name: 'Linh', token: 'PILOT_BOAT' as const },
  { id: 'an', name: 'An', token: 'CONTAINER_TRUCK' as const },
];

function auction(dice: [number, number] = [1, 2], seatCount = 2, laden = true) {
  let state = createGame('cargo-auction', seats.slice(0, seatCount), 'harbor');
  state.players[0].balance = 52;
  if (laden) {
    const load = getHarborFreightOpportunity(state, 'minh');
    assert.ok(load?.kind === 'load');
    state = dispatch(state, load.action, 'minh').state;
  }
  state = dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, 'minh').state;
  if (state.phase === 'AWAITING_BUY_DECISION') state = dispatch(state, { type: 'SKIP_BUY' }, 'minh').state;
  assert.equal(state.auction?.bidderId, 'linh');
  return state;
}

function answer(state: GameState, amount?: number) {
  assert.ok(state.auction);
  const { id: auctionId, revision, bidderId } = state.auction;
  const action = amount === undefined
    ? { type: 'AUCTION_PASS' as const, auctionId, revision }
    : { type: 'AUCTION_BID' as const, auctionId, revision, amount };
  const result = dispatch(state, action, bidderId);
  assert.notEqual(result.state, state);
  return result.state;
}

function discharge(state: GameState) {
  const offer = getHarborFreightOpportunity(state, 'minh');
  assert.ok(offer?.kind === 'discharge');
  return dispatch(state, offer.action, 'minh').state;
}

test('a cash counterbid and a standing rival bid both predict the carrier wallet before and after an optional discharge', () => {
  const state = answer(auction(), 40);
  const before = structuredClone(state);
  const forecast = getHarborAuctionChoices(state, 'minh', 50);
  assert.ok(forecast?.bid);
  assert.deepEqual([forecast.minimumBid, forecast.maximumBid, forecast.canBid, forecast.freightCarrierName], [50, 50, true, 'Minh']);
  assert.deepEqual(forecast.standing, {
    buyerId: 'linh', buyerName: 'Linh', price: 40, cashOnAward: 52, freightIfDischarged: 9, cashAfterDischarge: 61,
  });
  assert.deepEqual(forecast.bid, {
    buyerId: 'minh', buyerName: 'Minh', price: 50, cashOnAward: 2, freightIfDischarged: 12, cashAfterDischarge: 14,
  });
  for (const amount of [null, 0, 40, 51, 60, NaN, Infinity, 50.5]) {
    const invalid = getHarborAuctionChoices(state, 'minh', amount);
    assert.equal(invalid?.bid, null);
    assert.deepEqual(invalid?.standing, forecast.standing);
  }
  assert.deepEqual(state, before);
  const won = answer(answer(state, 50));
  const passed = answer(state);
  for (const [sold, expected] of [[won, forecast.bid], [passed, forecast.standing]] as const) {
    assert.equal(sold.properties[3].ownerId, expected.buyerId);
    assert.equal(sold.players[0].balance, expected.cashOnAward);
    assert.equal(sold.harborFreight?.manifests.minh?.originTileId, 0);
    assert.equal(discharge(sold).players[0].balance, expected.cashAfterDischarge);
  }
});

test('all captains passing leaves the bank deed unowned and the arriving carrier can collect the full freight', () => {
  const state = auction();
  const operator = getHarborAuctionChoices(state, 'linh', 20);
  const carrier = getHarborAuctionChoices(state, 'minh', 20);
  assert.ok(operator?.bid && carrier);
  assert.deepEqual([operator.standing.buyerId, operator.standing.buyerName, operator.standing.price,
    operator.standing.freightIfDischarged], [null, null, 0, 0]);
  assert.equal(carrier.canBid, false);
  assert.equal(carrier.bid, null);
  assert.equal(operator.bid.freightIfDischarged, 3);
  const unsold = answer(answer(state));
  assert.equal(unsold.properties[3].ownerId, null);
  assert.deepEqual(unsold.players.map(p => p.balance), [carrier.standing.cashOnAward, operator.standing.cashOnAward]);
  assert.deepEqual(discharge(unsold).players.map(p => p.balance), [carrier.standing.cashAfterDischarge, operator.standing.cashAfterDischarge]);
  assert.equal(carrier.standing.cashAfterDischarge, 64);
});

test('the operator forecast uses current color-group ownership and rounds the handling share only once', () => {
  for (const complete of [false, true]) {
    const state = auction([5, 6]); // Singapore to Genoa earns $22M.
    state.properties[9].ownerId = 'linh';
    if (complete) state.properties[12].ownerId = 'linh';
    const draft = getHarborAuctionChoices(state, 'linh', 40)?.bid;
    assert.ok(draft);
    assert.equal(draft.freightIfDischarged, complete ? 11 : 5);
    const leading = answer(state, 40);
    const view = getHarborAuctionChoices(leading, 'linh', 50);
    assert.deepEqual(view?.standing, draft);
    assert.equal(view?.bid, null);
    const sold = answer(leading);
    assert.equal(sold.players[1].balance, draft.cashOnAward);
    assert.equal(discharge(sold).players[1].balance, draft.cashAfterDischarge);
  }
});

test('a standing bid is only a possible outcome while other captains can raise; waiting and withdrawn captains have no draft', () => {
  const first = answer(auction([1, 2], 3), 10); // An can outbid Linh before Minh acts.
  const waiting = getHarborAuctionChoices(first, 'minh', 50);
  assert.equal(waiting?.bid, null);
  assert.equal(waiting?.standing.freightIfDischarged, 9);
  const third = getHarborAuctionChoices(first, 'an', 20);
  assert.equal(third?.standing.freightIfDischarged, 0);
  assert.equal(third?.bid?.freightIfDischarged, 3);
  const raised = answer(first, 20);
  const afterPass = answer(raised);
  assert.equal(afterPass.auction?.bidderId, 'linh');
  const withdrawn = getHarborAuctionChoices(afterPass, 'minh', 50);
  assert.equal(withdrawn?.standing.buyerId, 'an');
  assert.equal(withdrawn?.canBid, false);
  assert.equal(withdrawn?.bid, null);
  const sold = answer(afterPass);
  assert.equal(sold.properties[3].ownerId, 'an');
  assert.equal(discharge(sold).players[0].balance, withdrawn?.standing.cashAfterDischarge);
});

test('handled and empty visits have no optional freight; other game modes and ineligible deeds or seats get no projection', () => {
  const handled = auction();
  handled.harborFreight!.visits.minh!.handled = true;
  for (const state of [handled, auction([1, 2], 2, false)]) {
    const info = getHarborAuctionChoices(state, 'linh', 10);
    assert.ok(info?.bid);
    assert.equal(info.freightCarrierName, null);
    assert.equal(info.bid.freightIfDischarged, 0);
    assert.equal(info.bid.cashAfterDischarge, info.bid.cashOnAward);
  }
  const state = auction();
  for (const viewer of [null, 'unknown']) assert.equal(getHarborAuctionChoices(state, viewer, 10), null);
  for (const mode of ['classic', 'logistics'] as const) {
    assert.equal(getHarborAuctionChoices({ ...state, mode }, 'linh', 10), null);
  }
  assert.equal(getHarborAuctionChoices({ ...state, winnerId: 'linh' }, 'linh', 10), null);
  assert.equal(getHarborAuctionChoices(auction([1, 3]), 'linh', 10), null); // Service line.
  state.properties[3].isMortgaged = true;
  assert.equal(getHarborAuctionChoices(state, 'linh', 10), null);
});
