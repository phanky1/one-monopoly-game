import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_MISSIONS } from '../src/boardData.js';
import {
  getHarborExportBooking, getHarborFreightOpportunity, getHarborPurchase, OneMonopolyEngine,
  type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'minh', name: 'Minh', token: 'ONE_APUS' as const },
  { id: 'linh', name: 'Linh', token: 'PILOT_BOAT' as const },
];

function loaded(cash: number) {
  const state = createGame('freight-purchase', seats, 'harbor');
  state.players[0].balance = cash;
  const load = getHarborFreightOpportunity(state, 'minh');
  assert.ok(load?.kind === 'load');
  return dispatch(state, load.action, 'minh').state;
}

function roll(state: GameState, dice: [number, number] = [1, 2]) {
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, 'minh').state;
}

function purchase(state: GameState) {
  const terms = getHarborPurchase(state, 'minh');
  assert.ok(terms);
  return terms;
}

function reject(state: GameState, action: GameAction, actor?: string) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('a Singapore container can cover the cash shortfall on a $60M Cái Mép deed exactly once', () => {
  for (const cash of [48, 52]) {
    const state = roll(loaded(cash));
    assert.equal(state.phase, 'AWAITING_BUY_DECISION');
    const before = structuredClone(state);
    const job = purchase(state);
    assert.deepEqual(job.action, { type: 'HARBOR_BUY_AND_DISCHARGE', tileId: 3, revision: state.harborFreight!.revision });
    assert.deepEqual([job.purchasePrice, job.quote.gross, job.quote.carrierNet, job.cashChange, job.shortfall], [60, 12, 12, -48, 0]);
    assert.equal(getHarborFreightOpportunity(state, 'minh'), null);
    const result = dispatch(state, job.action, 'minh');
    assert.deepEqual(state, before);
    assert.deepEqual(result.events.filter(event => event.type === 'TILE_PURCHASED'), [
      { type: 'TILE_PURCHASED', playerId: 'minh', tileId: 3, price: 60 },
    ]);
    const receipt = result.state.harborFreight!.lastDelivery!;
    assert.deepEqual(result.events.filter(event => event.type === 'HARBOR_DISCHARGED'), [{ type: 'HARBOR_DISCHARGED', receipt }]);
    assert.deepEqual([receipt.purchasePrice, receipt.gross, receipt.handlingFee, receipt.operatorId, receipt.carrierNet], [60, 12, 0, null, 12]);
    assert.equal(result.events.some(event => event.type === 'DEMURRAGE_PAID'), false);
    assert.deepEqual(result.state.players.map(p => p.balance), [cash - 48, 1500]);
    assert.equal(result.state.properties[3].ownerId, 'minh');
    assert.equal(result.state.canUpgradeCurrentPort, false);
    assert.equal(result.state.pendingDebt, null);
    assert.equal(result.state.phase, 'END_OF_TURN');
    assert.equal(result.state.harborFreight!.manifests.minh, null);
    assert.deepEqual(result.state.harborFreight!.visits.minh, { tileId: 3, handled: true });
    assert.equal(receipt.revision, job.action.revision + 1);
    assert.equal(result.state.harborFreight!.revision, receipt.revision);
    assert.equal(getHarborFreightOpportunity(result.state, 'minh'), null);
    reject(result.state, job.action, 'minh');
    reject(result.state, { ...job.action, revision: receipt.revision }, 'minh');
  }
});

test('the cargo stays aboard for an ordinary purchase or an auction, and it cannot fund a bid', () => {
  const solvent = roll(loaded(60));
  const paid = dispatch(solvent, { type: 'BUY_PROPERTY' }, 'minh').state;
  assert.equal(paid.players[0].balance, 0);
  assert.equal(paid.properties[3].ownerId, 'minh');
  assert.equal(paid.harborFreight!.lastDelivery, null);
  assert.equal(getHarborFreightOpportunity(paid, 'minh')?.kind, 'discharge');

  const barely = roll(loaded(52));
  const normal = dispatch(barely, { type: 'BUY_PROPERTY' }, 'minh');
  assert.deepEqual(normal.state, barely);
  assert.deepEqual(normal.events, []);
  const auction = dispatch(barely, { type: 'SKIP_BUY' }, 'minh').state;
  assert.equal(auction.phase, 'AWAITING_AUCTION');
  assert.deepEqual(auction.harborFreight!.manifests.minh, { originTileId: 0 });
  reject(auction, purchase(barely).action, 'minh');
  const bidder = auction.auction!;
  const nextBid = dispatch(auction, { type: 'AUCTION_PASS', auctionId: bidder.id, revision: bidder.revision }, bidder.bidderId).state;
  assert.equal(nextBid.auction!.bidderId, 'minh');
  reject(nextBid, { type: 'AUCTION_BID', auctionId: bidder.id, revision: nextBid.auction!.revision, amount: 60 }, 'minh');

  const short = roll(loaded(47));
  assert.equal(short.phase, 'AWAITING_AUCTION');
  assert.equal(getHarborPurchase(short, 'minh'), null);
  assert.equal(short.players[0].balance, 47);
  assert.deepEqual(short.harborFreight!.manifests.minh, { originTileId: 0 });
});

test('the combined settlement requires the quoted active unhandled port visit and a deliverable manifest', () => {
  const atPort = roll(loaded(52));
  const { action } = purchase(atPort);
  reject(atPort, action);
  reject(atPort, action, 'linh');
  reject(atPort, { ...action, tileId: 5 }, 'minh');
  reject(atPort, { ...action, revision: action.revision - 1 }, 'minh');
  for (const mutate of [
    (s: GameState) => { s.harborFreight!.manifests.minh = null; },
    (s: GameState) => { s.harborFreight!.manifests.minh = { originTileId: 3 }; },
    (s: GameState) => { s.harborFreight!.visits.minh!.handled = true; },
    (s: GameState) => { s.harborFreight!.visits.minh!.tileId = 5; },
    (s: GameState) => { s.properties[3].isMortgaged = true; },
    (s: GameState) => { s.properties[3].ownerId = 'linh'; },
    (s: GameState) => { s.players[0].inHold = true; },
    (s: GameState) => { s.winnerId = 'linh'; },
    (s: GameState) => { s.phase = 'END_OF_TURN'; },
  ]) {
    const invalid = structuredClone(atPort);
    mutate(invalid);
    assert.equal(getHarborPurchase(invalid, 'minh'), null);
    reject(invalid, action, 'minh');
  }
  const classic = createGame('classic', seats, 'classic');
  classic.players[0].balance = 52;
  assert.equal(roll(classic).phase, 'AWAITING_AUCTION');
  for (const state of [roll(classic), createGame('logistics', seats, 'logistics')]) {
    assert.equal(getHarborPurchase(state, 'minh'), null);
    reject(state, action, 'minh');
  }
  const infra = roll(loaded(52), [2, 2]);
  assert.equal(infra.phase, 'AWAITING_AUCTION');
  assert.deepEqual(infra.harborFreight!.manifests.minh, { originTileId: 0 });
});

test('buying with freight completes the same group mission as a cash purchase, once and only after funding', () => {
  const outbound = loaded(48);
  outbound.properties[1].ownerId = 'minh';
  outbound.properties[4].ownerId = 'minh';
  outbound.players[0].secretMission = { ...SECRET_MISSIONS.find(m => m.id === 'MISSION-5')! };
  const underfunded = structuredClone(outbound);
  underfunded.players[0].balance = 47;
  assert.equal(roll(underfunded).phase, 'AWAITING_AUCTION');
  const landed = roll(outbound);
  const settled = dispatch(landed, purchase(landed).action, 'minh');
  assert.equal(settled.state.players[0].balance, outbound.players[0].secretMission.reward);
  assert.equal(OneMonopolyEngine.calculateRent(settled.state, 3, [1, 2]), 8);
  assert.equal(settled.events.filter(event => event.type === 'MISSION_COMPLETED').length, 1);
  assert.equal(settled.state.players[0].secretMission?.isCompleted, true);
  assert.deepEqual(dispatch(settled.state, { type: 'CLAIM_MISSION_REWARD' }, 'minh').events, []);
});

test('the buyer’s cash contribution expires an unaffordable offer after settlement and is rechecked after a trade', () => {
  const voyage = loaded(52);
  voyage.properties[9].ownerId = 'linh';
  const offered = dispatch(voyage, { type: 'OFFER_TRADE', tileId: 9, price: 5, sellerId: 'linh' }, 'minh');
  const offer = offered.events.find(e => e.type === 'TRADE_OFFERED')!.offer;
  const arrived = roll(offered.state);
  const job = purchase(arrived);
  const bought = dispatch(arrived, job.action, 'minh');
  assert.equal(bought.state.players[0].balance, 4);
  assert.deepEqual(bought.state.tradeOffers, []);
  assert.ok(bought.events.some(e => e.type === 'TRADE_CLOSED' && e.result === 'EXPIRED' && e.offer.id === offer.id));
  const afterTrade = dispatch(arrived, { type: 'RESPOND_TRADE', offerId: offer.id, accept: true }, 'linh').state;
  assert.equal(afterTrade.properties[9].ownerId, 'minh');
  assert.equal(afterTrade.players[0].balance, 47);
  assert.equal(purchase(afterTrade).shortfall, 1);
  reject(afterTrade, job.action, 'minh');
  reject(afterTrade, purchase(afterTrade).action, 'minh');

  const resale = dispatch(afterTrade, { type: 'OFFER_TRADE', tileId: 9, price: 5, sellerId: 'minh' }, 'linh');
  const resaleId = resale.events.find(e => e.type === 'TRADE_OFFERED')!.offer.id;
  const restored = dispatch(resale.state, { type: 'RESPOND_TRADE', offerId: resaleId, accept: true }, 'minh').state;
  assert.equal(restored.players[0].balance, 52);
  reject(restored, job.action, 'minh');
  assert.equal(dispatch(restored, purchase(restored).action, 'minh').state.players[0].balance, 4);
});

test('a paid export can fund the next deed on doubles without charging the origin fee twice', () => {
  const game = createGame('paid-purchase', seats, 'harbor');
  game.players[0].balance = 111;
  Object.assign(game.properties[3], { ownerId: 'linh', containerLevel: 1 });
  game.players[0].position = 1;
  const origin = roll(game, [1, 1]);
  const booking = getHarborExportBooking(origin, 'minh')!;
  const booked = dispatch(origin, booking.action, 'minh').state;
  assert.deepEqual(booked.players.map(p => p.balance), [88, 1523]);
  const destination = roll(booked, [1, 1]); // Laem Chabang costs $100M and the shipment earns $12M.
  const job = purchase(destination);
  assert.deepEqual([job.purchasePrice, job.cashChange, job.shortfall], [100, -88, 0]);
  const settled = dispatch(destination, job.action, 'minh').state;
  assert.deepEqual(settled.players.map(p => p.balance), [0, 1523]);
  assert.deepEqual(settled.harborFreight!.lastDelivery!.exportBooking, { operatorId: 'linh', operatorName: 'Linh', fee: 3 });
  assert.equal(settled.phase, 'WAIT_FOR_ROLL');
  assert.equal(settled.hasRolled, false);
  assert.equal(settled.consecutiveDoubles, 2);
  assert.equal(roll(settled, [1, 1]).players[0].inHold, true);
});
