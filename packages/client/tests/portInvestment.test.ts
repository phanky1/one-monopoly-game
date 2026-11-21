import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getHarborFreightOpportunity, getHarborTerminalShare, OneMonopolyEngine, type GameAction, type GameState,
} from '@one-monopoly/shared';
import { getPortInvestment, projectPortTrade } from '../src/components/portInvestment.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
];
function apply(state: GameState, action: GameAction, actor = 'a') {
  const result = dispatch(state, action, actor);
  assert.notDeepEqual(result.state, state, action.type);
  return result.state;
}
function arrive(withCargo = true) {
  let state = createGame('investment', seats, 'harbor');
  if (withCargo) {
    const offer = getHarborFreightOpportunity(state, 'a');
    assert.ok(offer?.kind === 'load');
    state = apply(state, offer.action);
  }
  return apply(state, { type: 'ROLL_DICE', forcedDice: [5, 6] }); // Singapore to Genoa.
}

test('buying the arrival port completes the buyer’s group, while their own box keeps all its freight', () => {
  const state = arrive();
  state.properties[9].ownerId = 'a';
  state.properties[12].ownerId = 'a';
  const before = structuredClone(state);
  const offer = getPortInvestment(state, 11, 'a');
  assert.deepEqual(state, before);
  assert.ok(offer?.arrival);
  assert.deepEqual([offer.groupName, offer.ownedAfter, offer.groupSize, offer.rent, offer.feePercent],
    ['Mediterranean Route', 3, 3, 20, 50]);
  assert.equal(offer.arrival.carrierName, 'An');
  assert.deepEqual([offer.arrival.quote.gross, offer.arrival.quote.carrierNet, offer.arrival.quote.handlingFee,
    offer.arrival.quote.operatorId, offer.arrival.quote.feePercent], [22, 22, 0, null, 0]);
  const bought = apply(state, { type: 'BUY_PROPERTY' });
  const discharge = getHarborFreightOpportunity(bought, 'a');
  assert.ok(discharge?.kind === 'discharge');
  assert.deepEqual(discharge.quote, offer.arrival.quote);
  assert.equal(OneMonopolyEngine.calculateRent(bought, 11, bought.dice), offer.rent);
});

test('an auction winner gets the correct share of the landing captain’s freight, rounded down', () => {
  const landed = arrive();
  landed.properties[9].ownerId = 'b';
  const auction = apply(landed, { type: 'SKIP_BUY' });
  const before = structuredClone(auction);
  const view = getPortInvestment(auction, 11, 'b');
  assert.deepEqual(auction, before);
  assert.ok(view?.arrival);
  assert.deepEqual([view.ownedAfter, view.groupSize, view.rent, view.feePercent], [2, 3, 10, 25]);
  assert.deepEqual([view.arrival.carrierName, view.arrival.quote.playerId, view.arrival.quote.operatorId,
    view.arrival.quote.carrierNet, view.arrival.quote.handlingFee], ['An', 'a', 'b', 17, 5]);
  const { id: auctionId, revision } = auction.auction!;
  const bid = apply(auction, { type: 'AUCTION_BID', auctionId, revision, amount: 10 }, 'b');
  const sold = apply(bid, { type: 'AUCTION_PASS', auctionId, revision: bid.auction!.revision });
  const discharge = getHarborFreightOpportunity(sold, 'a');
  assert.ok(discharge?.kind === 'discharge');
  assert.deepEqual(discharge.quote, view.arrival.quote);
  const paid = apply(sold, discharge.action);
  assert.deepEqual(paid.players.map((player, i) => player.balance - sold.players[i].balance), [17, 5]);
});

test('only an unhandled arrival by the active captain can contribute a prospective payout', () => {
  const landed = arrive();
  const differentPort = getPortInvestment(landed, 9, 'b');
  assert.ok(differentPort);
  assert.equal(differentPort.arrival, null);
  assert.equal(getPortInvestment(arrive(false), 11, 'b')?.arrival, null);
  for (const change of [
    (state: GameState) => { state.harborFreight!.visits.a = null; },
    (state: GameState) => { state.harborFreight!.visits.a!.handled = true; },
    (state: GameState) => { state.harborFreight!.visits.a!.tileId = 9; },
    (state: GameState) => { state.harborFreight!.manifests.a!.originTileId = 11; },
    (state: GameState) => { state.harborFreight!.manifests.a!.originTileId = 2; },
    (state: GameState) => { state.harborFreight!.manifests.a = null; state.harborFreight!.manifests.b = { originTileId: 0 }; },
  ]) {
    const changed = structuredClone(landed);
    change(changed);
    assert.equal(getPortInvestment(changed, 11, 'b')?.arrival, null);
  }
});

test('only available Harbor port deeds and seated solvent buyers receive projections', () => {
  const state = arrive();
  for (const buyer of [null, 'unknown']) assert.equal(getPortInvestment(state, 11, buyer), null);
  for (const tile of [0, 4, 10, 32, -1, 1.5]) assert.equal(getPortInvestment(state, tile, 'a'), null);
  for (const mode of ['classic', 'logistics'] as const) {
    assert.equal(getPortInvestment(createGame('other-rules', seats, mode), 11, 'a'), null);
  }
  state.players[1].isBankrupt = true;
  assert.equal(getPortInvestment(state, 11, 'b'), null);
  state.properties[11].isMortgaged = true;
  assert.equal(getPortInvestment(state, 11, 'a'), null);
  state.properties[11].isMortgaged = false;
  state.properties[11].ownerId = 'a';
  assert.equal(getPortInvestment(state, 11, 'a'), null);
  assert.equal(getPortInvestment(state, 11, 'b'), null);
});

test('a swap previews both completed routes together, including a mortgaged sister port', () => {
  const state = createGame('swap-rates', seats, 'harbor');
  for (const id of [1, 5]) state.properties[id].ownerId = 'a';
  for (const id of [3, 7]) state.properties[id].ownerId = 'b';
  state.properties[7].isMortgaged = true;
  const original = structuredClone(state);
  const rates = (game: GameState, id: number) => [
    OneMonopolyEngine.calculateRent(game, id, game.dice), getHarborTerminalShare(game, id),
  ];
  const swapped = projectPortTrade(state, 3, 'a', 'b', 5);
  assert.deepEqual([1, 3, 5, 7].map(id => rates(swapped, id)), [[4, 50], [8, 50], [12, 50], [0, 0]]);
  assert.deepEqual(state, original);
  const offer = apply(state, { type: 'OFFER_PORT_SWAP', tileId: 3, sellerId: 'b', offeredTileId: 5, price: 0 });
  const settled = apply(offer, { type: 'RESPOND_TRADE', offerId: offer.tradeOffers![0].id, offeredTileId: 5, accept: true }, 'b');
  assert.deepEqual(swapped.properties, settled.properties);

  const sameGroup = projectPortTrade(state, 3, 'a', 'b', 1);
  assert.deepEqual([1, 3].map(id => rates(sameGroup, id)), [[2, 25], [4, 25]]);
});
