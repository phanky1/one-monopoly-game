import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getHarborFreightOpportunity, getHarborFreightQuote, OneMonopolyEngine, type GameAction, type GameState,
} from '../src/index.js';

const seats = [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'minh', name: 'Minh', token: 'PILOT_BOAT' as const },
];
const { createGame, dispatch } = OneMonopolyEngine;
function game() {
  const state = createGame('harbor-test', seats, 'harbor');
  for (const player of state.players) delete player.secretMission;
  return state;
}
function act(state: GameState, action: GameAction, actor = state.players[state.activePlayerIndex].id) {
  const result = dispatch(state, action, actor);
  assert.notDeepEqual(result.state, state, action.type);
  return result;
}
function reject(state: GameState, action: GameAction, actor = state.players[state.activePlayerIndex].id) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}
function roll(state: GameState, first: number, second: number) {
  return act(state, { type: 'ROLL_DICE', forcedDice: [first, second] });
}
function auctionAnswer(state: GameState, amount?: number) {
  const auction = state.auction!;
  const terms = { auctionId: auction.id, revision: auction.revision };
  const action = amount === undefined ? { type: 'AUCTION_PASS' as const, ...terms }
    : { type: 'AUCTION_BID' as const, ...terms, amount };
  return act(state, action, auction.bidderId).state;
}
function end(state: GameState) {
  return act(state, { type: 'END_TURN' }).state;
}
function load(state: GameState) {
  const captain = state.players[state.activePlayerIndex];
  const opportunity = getHarborFreightOpportunity(state, captain.id);
  assert.ok(opportunity?.kind === 'load');
  const result = act(state, opportunity.action);
  assert.ok(result.events.some(event => event.type === 'HARBOR_LOADED' &&
    event.playerId === captain.id && event.tileId === captain.position));
  return result.state;
}
function unload(state: GameState) {
  const opportunity = getHarborFreightOpportunity(state, state.players[state.activePlayerIndex].id);
  assert.ok(opportunity?.kind === 'discharge');
  const result = act(state, opportunity.action);
  const settled = result.events.find(event => event.type === 'HARBOR_DISCHARGED');
  assert.ok(settled);
  assert.deepEqual(result.state.harborFreight!.lastDelivery, settled.receipt);
  assert.equal(result.state.harborFreight!.manifests[settled.receipt.playerId], null);
  reject(result.state, opportunity.action);
  return { ...result, receipt: settled.receipt };
}

test('Harbor captains start at Singapore with a classic treasury, dice, and a separate freight manifest', () => {
  const start = game();
  assert.ok(start.harborFreight);
  assert.equal(start.mode, 'harbor');
  assert.equal(start.logistics, undefined);
  assert.equal(start.phase, 'WAIT_FOR_ROLL');
  assert.deepEqual(start.players.map(p => [p.position, p.balance]), [[0, 1500], [0, 1500]]);
  const landed = roll(start, 1, 2);
  assert.equal(landed.state.players[0].position, 3);
  assert.equal(landed.state.phase, 'AWAITING_BUY_DECISION');
  assert.ok(landed.events.some(event => event.type === 'DICE_ROLLED'));
});

test('initial Singapore loading is free, seat-bound and limited to one shipment aboard', () => {
  const start = game();
  const offer = getHarborFreightOpportunity(start, 'linh');
  assert.ok(offer?.kind === 'load');
  assert.equal(getHarborFreightOpportunity(start, 'minh'), null);
  assert.deepEqual(dispatch(start, offer.action), { state: start, events: [] });
  reject(start, offer.action, 'minh');
  reject(start, { ...offer.action, tileId: 1 });
  const loaded = load(start);
  assert.deepEqual(loaded.harborFreight!.manifests.linh, { originTileId: 0 });
  assert.deepEqual(loaded.players.map(p => p.balance), [1500, 1500]);
  assert.equal(loaded.phase, 'WAIT_FOR_ROLL');
  reject(loaded, offer.action);
  reject(loaded, { ...offer.action, revision: loaded.harborFreight!.revision });
  assert.equal(getHarborFreightOpportunity(loaded, 'linh'), null);
});

test('purchase or auction settlement opens handling for the captain physically at the quay', () => {
  const landing = roll(game(), 1, 2).state;
  assert.equal(getHarborFreightOpportunity(landing, 'linh'), null);
  const owned = act(landing, { type: 'BUY_PROPERTY' }).state;
  assert.equal(owned.properties[3].ownerId, 'linh');
  assert.deepEqual(load(owned).harborFreight!.manifests.linh, { originTileId: 3 });
  const offered = act(landing, { type: 'SKIP_BUY' }).state;
  const lastBidder = auctionAnswer(offered);
  assert.equal(getHarborFreightOpportunity(lastBidder, 'linh'), null);
  const won = auctionAnswer(lastBidder, 10);
  assert.equal(won.properties[3].ownerId, 'linh');
  assert.equal(won.phase, 'END_OF_TURN');
  assert.deepEqual(load(won).harborFreight!.manifests.linh, { originTileId: 3 });

  const carrying = roll(load(game()), 1, 2).state;
  assert.equal(getHarborFreightOpportunity(carrying, 'linh'), null);
  const auction = act(carrying, { type: 'SKIP_BUY' }).state;
  const competing = auctionAnswer(auction, 10);
  const rivalWon = auctionAnswer(competing);
  assert.equal(rivalWon.properties[3].ownerId, 'minh');
  const paid = unload(rivalWon);
  assert.deepEqual([paid.receipt.gross, paid.receipt.carrierNet, paid.receipt.handlingFee], [12, 9, 3]);
  assert.deepEqual(paid.state.players.map(p => p.balance), [1509, 1493]); // Bid to the bank; no retroactive rent.
});

for (const scenario of [
  { name: 'single deed', siblings: false, mortgageSibling: false, rent: 10, percent: 25, fee: 5 },
  { name: 'complete color group', siblings: true, mortgageSibling: false, rent: 20, percent: 50, fee: 11 },
  { name: 'complete group with a mortgaged sibling', siblings: true, mortgageSibling: true, rent: 20, percent: 50, fee: 11 },
]) {
  test(`ordinary rent and the ${scenario.name} fee are settled separately at Genoa`, () => {
    const start = game();
    start.properties[11].ownerId = 'minh';
    if (scenario.siblings) for (const id of [9, 12]) start.properties[id].ownerId = 'minh';
    start.properties[9].isMortgaged = scenario.mortgageSibling;
    const loaded = load(start);
    const landed = roll(loaded, 5, 6);
    const rent = landed.events.find(event => event.type === 'DEMURRAGE_PAID');
    assert.equal(rent?.amount, scenario.rent);
    const balances = landed.state.players.map(p => p.balance);
    assert.deepEqual(balances, [1500 - scenario.rent, 1500 + scenario.rent]);
    const quote = getHarborFreightQuote(landed.state, 'linh', 0, 11);
    assert.ok(quote);
    assert.deepEqual([quote.distanceNm, quote.gross, quote.operatorId, quote.feePercent, quote.handlingFee, quote.carrierNet],
      [5562, 22, 'minh', scenario.percent, scenario.fee, 22 - scenario.fee]);
    const paid = unload(landed.state);
    assert.equal(paid.receipt.originTileId, 0);
    assert.equal(paid.receipt.tileId, 11);
    assert.equal(paid.receipt.round, landed.state.turnCount);
    assert.deepEqual(paid.state.players.map(p => p.balance),
      [balances[0] + 22 - scenario.fee, balances[1] + scenario.fee]);
    const payments = paid.events.filter(event => event.type === 'BALANCE_CHANGED');
    assert.deepEqual(payments.map(event => [event.playerId, event.delta]).sort(),
      [['linh', 22 - scenario.fee], ['minh', scenario.fee]]);
    assert.equal(paid.events.some(event => event.type === 'DEMURRAGE_PAID'), false);
  });
}

test('mortgaged destinations close both freight operations, and a bank port accepts delivery after an auction with no bids', () => {
  const start = game();
  start.properties[3].ownerId = 'minh';
  start.properties[3].isMortgaged = true;
  const landed = roll(load(start), 1, 2);
  assert.equal(landed.events.some(event => event.type === 'DEMURRAGE_PAID'), false);
  assert.equal(getHarborFreightQuote(landed.state, 'linh', 0, 3), null);
  assert.equal(getHarborFreightOpportunity(landed.state, 'linh'), null);
  assert.deepEqual(landed.state.harborFreight!.manifests.linh, { originTileId: 0 });
  start.properties[3].ownerId = 'linh';
  assert.equal(getHarborFreightOpportunity(roll(start, 1, 2).state, 'linh'), null);
  start.properties[3].isMortgaged = false;
  start.properties[3].ownerId = 'minh';
  assert.equal(getHarborFreightOpportunity(roll(start, 1, 2).state, 'linh'), null);

  const available = roll(load(game()), 1, 2).state;
  const bank = auctionAnswer(auctionAnswer(act(available, { type: 'SKIP_BUY' }).state));
  assert.equal(bank.properties[3].ownerId, null);
  const settled = unload(bank);
  assert.deepEqual([settled.receipt.operatorId, settled.receipt.handlingFee, settled.receipt.carrierNet], [null, 0, 12]);
  assert.deepEqual(settled.state.players.map(p => p.balance), [1512, 1500]);
});

test('delivery cannot pay a compulsory rent debt before it settles', () => {
  const start = game();
  start.properties[11].ownerId = 'minh';
  start.properties[4].ownerId = 'linh';
  start.players[0].balance = 3;
  const owing = roll(load(start), 5, 6).state;
  assert.equal(owing.phase, 'AWAITING_DEBT_RESOLUTION');
  assert.equal(getHarborFreightOpportunity(owing, 'linh'), null);
  reject(owing, { type: 'HARBOR_DISCHARGE', tileId: 11, revision: owing.harborFreight!.revision });
  const raised = act(owing, { type: 'MORTGAGE_TILE', tileId: 4 }).state;
  const solvent = act(raised, { type: 'SETTLE_DEBT' }).state;
  assert.equal(solvent.pendingDebt, null);
  assert.deepEqual(solvent.players.map(p => p.balance), [93, 1510]);
  const settled = unload(solvent);
  assert.deepEqual(settled.state.players.map(p => p.balance), [110, 1515]);
});

test('a transfer between quote and discharge invalidates the old fee and only the new payout can settle', () => {
  const start = game();
  start.properties[11].ownerId = 'minh';
  const landed = roll(load(start), 5, 6).state;
  const before = getHarborFreightOpportunity(landed, 'linh');
  assert.ok(before?.kind === 'discharge');
  assert.equal(before.quote.handlingFee, 5);
  const offered = act(landed, { type: 'OFFER_TRADE', tileId: 11, sellerId: 'minh', price: 80 }).state;
  const transferred = act(offered, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'minh').state;
  reject(transferred, before.action);
  const settled = unload(transferred);
  assert.deepEqual([settled.receipt.gross, settled.receipt.handlingFee, settled.receipt.operatorId], [22, 0, null]);
  assert.deepEqual(settled.state.players.map(p => p.balance), [1432, 1590]);
});

test('dice doubles and turn handoffs do not reopen a handled berth for a second cargo action', () => {
  const start = game();
  start.properties[12].ownerId = 'linh';
  start.properties[15].ownerId = 'linh';
  const doubles = roll(load(start), 6, 6).state;
  assert.equal(doubles.phase, 'WAIT_FOR_ROLL');
  const settled = unload(doubles).state;
  assert.equal(getHarborFreightOpportunity(settled, 'linh'), null);
  const nextPort = roll(settled, 1, 2).state;
  assert.equal(nextPort.players[0].position, 15);
  assert.deepEqual(load(nextPort).harborFreight!.manifests.linh, { originTileId: 15 });

  const otherVisit = roll(load(game()), 1, 2).state;
  const served = unload(act(otherVisit, { type: 'BUY_PROPERTY' }).state).state;
  const restored: GameState = JSON.parse(JSON.stringify(end(end(served))));
  assert.equal(restored.players[0].position, 3);
  assert.equal(getHarborFreightOpportunity(restored, 'linh'), null);
  reject(restored, { type: 'HARBOR_LOAD', tileId: 3, revision: restored.harborFreight!.revision });
});

test('a resolved card or storm movement grants the actual berth, while passing Singapore on the way to a service line does not', () => {
  const card = game();
  card.marketDeck = ['MKT-05']; // Rotterdam.
  card.properties[15].ownerId = 'linh';
  const relocated = roll(load(card), 1, 1).state;
  assert.equal(relocated.players[0].position, 15);
  assert.equal(unload(relocated).receipt.tileId, 15);
  const storm = game();
  storm.opsDeck = ['OPS-02'];
  storm.properties[3].ownerId = 'linh';
  const pending = roll(load(storm), 3, 3).state;
  assert.equal(pending.phase, 'AWAITING_STORM_DECISION');
  assert.equal(getHarborFreightOpportunity(pending, 'linh'), null);
  const drifted = act(pending, { type: 'RESOLVE_STORM', choice: 'DRIFT' }).state;
  assert.equal(unload(drifted).receipt.tileId, 3);

  const passing = load(game());
  passing.players[0].position = 30;
  passing.properties[4].ownerId = 'linh';
  const atService = roll(passing, 1, 5).state;
  assert.equal(atService.players[0].balance, 1700);
  assert.equal(atService.players[0].position, 4);
  assert.equal(getHarborFreightOpportunity(atService, 'linh'), null);
  reject(atService, { type: 'HARBOR_DISCHARGE', tileId: 0, revision: atService.harborFreight!.revision });
});

test('landing at Singapore pays a full incoming fare with no operator while returning an origin box there pays nothing', () => {
  const start = game();
  start.properties[12].ownerId = 'linh';
  start.properties[23].ownerId = 'linh';
  const approach = roll(start, 6, 6).state;
  const losAngeles = roll(approach, 5, 6).state;
  assert.equal(losAngeles.players[0].position, 23);
  const hub = roll(end(end(load(losAngeles))), 4, 5);
  assert.ok(hub.events.some(event => event.type === 'PASSED_GO'));
  assert.equal(hub.state.players[0].position, 0);
  const delivered = unload(hub.state);
  assert.deepEqual([delivered.receipt.distanceNm, delivered.receipt.carrierNet, delivered.receipt.operatorId], [7636, 26, null]);
  assert.equal(delivered.state.players[0].balance, 1726);

  const homebound = load(game());
  homebound.marketDeck = ['MKT-04'];
  const backAtSource = roll(homebound, 1, 1).state;
  assert.equal(backAtSource.players[0].position, 0);
  assert.equal(getHarborFreightOpportunity(backAtSource, 'linh'), null);
  assert.deepEqual(backAtSource.harborFreight!.manifests.linh, { originTileId: 0 });
});

test('three freight deliveries leave Monopoly play running, and the other modes reject Harbor commands', () => {
  let state = game();
  for (const id of [3, 7, 11, 15, 19]) state.properties[id].ownerId = 'linh';
  state = unload(roll(load(state), 1, 2).state).state;
  for (const tileId of [11, 19]) {
    state = load(roll(end(end(state)), 1, 3).state);
    const settled = unload(roll(end(end(state)), 1, 3).state);
    assert.equal(settled.receipt.tileId, tileId);
    state = settled.state;
  }
  assert.equal(state.winnerId, null);
  assert.ok(roll(end(end(state)), 1, 3).events.some(event => event.type === 'DICE_ROLLED'));

  for (const mode of ['classic', 'logistics'] as const) {
    const other = createGame('different-rules', seats, mode);
    assert.equal(other.harborFreight, undefined);
    assert.equal(getHarborFreightOpportunity(other, 'linh'), null);
    for (const type of ['HARBOR_LOAD', 'HARBOR_DISCHARGE'] as const) reject(other, { type, tileId: 0, revision: 0 });
  }
  reject(game(), { type: 'SAIL_TO_PORT', tileId: 3, revision: 0 });
  reject(game(), { type: 'LOAD_CARGO', tileId: 0, destinationTileId: 3, kind: 'laden', revision: 0 });
});
