import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARD_TILES, getHarborFreightOpportunity, getHarborRedemption, getRedemptionCost, OneMonopolyEngine,
  type GameAction, type GameState, type TurnPhase,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'minh', name: 'Minh', token: 'PILOT_BOAT' as const },
];

function arrive(cash: number) {
  const state = createGame('redemption', seats, 'harbor');
  state.players[0].balance = cash;
  state.properties[5].ownerId = 'linh';
  state.properties[5].isMortgaged = true;
  state.properties[9].ownerId = 'minh';
  const load = getHarborFreightOpportunity(state, 'linh');
  assert.equal(load?.kind, 'load');
  const loaded = dispatch(state, load!.action, 'linh').state;
  return dispatch(loaded, { type: 'ROLL_DICE', forcedDice: [2, 3] }, 'linh').state;
}

function reject(state: GameState, action: GameAction, actor?: string) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('the earned fare can pay part of the exact redemption price at the ship’s own dock', () => {
  const state = arrive(43);
  const before = structuredClone(state);
  const job = getHarborRedemption(state, 'linh');
  assert.ok(job);
  assert.equal(getRedemptionCost(BOARD_TILES[5]), 55);
  assert.deepEqual([job.redemptionCost, job.cashChange, job.shortfall], [55, -43, 0]);
  assert.deepEqual([job.quote.gross, job.quote.carrierNet, job.quote.handlingFee, job.quote.operatorId], [12, 12, 0, null]);
  assert.equal(getHarborFreightOpportunity(state, 'linh'), null);
  reject(state, job.action, 'minh');
  reject(state, job.action);
  reject(state, { ...job.action, tileId: 3 }, 'linh');
  const settled = dispatch(state, job.action, 'linh');
  assert.deepEqual(state, before);
  assert.deepEqual(settled.state.players.map(p => p.balance), [0, 1500]);
  assert.equal(settled.state.properties[5].isMortgaged, false);
  assert.equal(settled.state.properties[5].ownerId, 'linh');
  assert.equal(settled.state.phase, 'END_OF_TURN');
  assert.deepEqual(settled.state.harborFreight!.visits.linh, { tileId: 5, handled: true });
  assert.equal(settled.state.harborFreight!.manifests.linh, null);
  assert.equal(settled.state.harborFreight!.revision, state.harborFreight!.revision + 1);
  const receipt = settled.state.harborFreight!.lastDelivery;
  assert.ok(receipt);
  assert.deepEqual([receipt.originTileId, receipt.tileId, receipt.gross, receipt.carrierNet, receipt.redemptionCost],
    [0, 5, 12, 12, 55]);
  assert.deepEqual(settled.events.map(event => event.type), ['TILE_UNMORTGAGED', 'HARBOR_DISCHARGED', 'BALANCE_CHANGED']);
  assert.ok(settled.events.some(event => event.type === 'BALANCE_CHANGED' && event.playerId === 'linh' &&
    event.delta === -43 && event.newBalance === 0));
  assert.ok(settled.events.some(event => event.type === 'TILE_UNMORTGAGED' && event.cost === 55 && event.tileId === 5));
  assert.equal(OneMonopolyEngine.calculateRent(settled.state, 5, [2, 3]), 6);
  assert.equal(getHarborRedemption(settled.state, 'linh'), null);
  reject(settled.state, job.action, 'linh');
  reject(settled.state, { ...job.action, revision: settled.state.harborFreight!.revision }, 'linh');
});

test('one million short preserves the box, mortgage, money and the unhandled visit', () => {
  const state = arrive(42);
  const short = getHarborRedemption(state, 'linh');
  assert.ok(short);
  assert.deepEqual([short.quote.gross, short.redemptionCost, short.cashChange, short.shortfall], [12, 55, -43, 1]);
  reject(state, short.action, 'linh');
  assert.equal(state.properties[5].isMortgaged, true);
  assert.deepEqual(state.harborFreight!.manifests.linh, { originTileId: 0 });
  assert.equal(state.harborFreight!.lastDelivery, null);
  assert.equal(state.harborFreight!.visits.linh?.handled, false);
  const ordinary = arrive(55);
  const open = dispatch(ordinary, { type: 'UNMORTGAGE_TILE', tileId: 5 }, 'linh');
  assert.equal(open.state.players[0].balance, 0);
  assert.equal(open.state.properties[5].isMortgaged, false);
  assert.deepEqual(open.state.harborFreight!.manifests.linh, { originTileId: 0 });
  assert.equal(open.state.harborFreight!.lastDelivery, null);
});

test('redemption requires an active, legal cargo visit to the eligible mortgaged destination', () => {
  const base = arrive(1000);
  const job = getHarborRedemption(base, 'linh')!;
  const phases: TurnPhase[] = ['AWAITING_BUY_DECISION', 'AWAITING_AUCTION', 'AWAITING_SLOT_CHARTER_RESPONSE',
    'AWAITING_DEBT_RESOLUTION', 'AWAITING_STORM_DECISION'];
  const invalid: GameState[] = phases.map(phase => ({ ...base, phase }));
  for (const change of [
    (s: GameState) => { s.harborFreight!.manifests.linh = null; },
    (s: GameState) => { s.harborFreight!.manifests.linh = { originTileId: 5 }; },
    (s: GameState) => { s.harborFreight!.visits.linh!.handled = true; },
    (s: GameState) => { s.players[0].position = 3; },
    (s: GameState) => { s.properties[5].ownerId = 'minh'; },
    (s: GameState) => { s.properties[5].isMortgaged = false; },
    (s: GameState) => { s.players[0].inHold = true; },
    (s: GameState) => { s.players[0].isBankrupt = true; },
    (s: GameState) => { s.winnerId = 'minh'; },
  ]) {
    const state = structuredClone(base);
    change(state);
    invalid.push(state);
  }
  invalid.push(createGame('classic', seats, 'classic'), createGame('logistics', seats, 'logistics'));
  const legacy = createGame('legacy', seats);
  delete legacy.mode;
  invalid.push(legacy);
  for (const state of invalid) {
    assert.equal(getHarborRedemption(state, 'linh'), null);
    reject(state, job.action, 'linh');
  }
});

test('the cash contribution expires unaffordable offers and old quotes cannot redeem a later turn', () => {
  const arrived = arrive(50);
  const original = getHarborRedemption(arrived, 'linh')!;
  const offered = dispatch(arrived, { type: 'OFFER_TRADE', tileId: 9, sellerId: 'minh', price: 10 }, 'linh').state;
  const laterQuote = getHarborRedemption(offered, 'linh')!;
  assert.deepEqual(laterQuote.action, original.action); // An unaccepted cash bid does not reserve funds.
  const waiting = dispatch(offered, { type: 'END_TURN' }, 'linh').state;
  assert.equal(getHarborRedemption(waiting, 'linh'), null);
  const resumed = dispatch(waiting, { type: 'END_TURN' }, 'minh').state;
  assert.equal(resumed.turnCount, 2);
  reject(resumed, laterQuote.action, 'linh');
  const paid = dispatch(resumed, getHarborRedemption(resumed, 'linh')!.action, 'linh');
  assert.equal(paid.state.players[0].balance, 7);
  assert.deepEqual(paid.state.tradeOffers, []);
  assert.ok(paid.events.some(event => event.type === 'TRADE_CLOSED' && event.result === 'EXPIRED' && event.offer.id === 1));
  assert.equal(paid.state.harborFreight!.lastDelivery?.round, 2);
});

test('a separate redemption or a subsequent transfer invalidates the combined quote', () => {
  const arrival = arrive(200);
  const old = getHarborRedemption(arrival, 'linh')!;
  const reopened = dispatch(arrival, { type: 'UNMORTGAGE_TILE', tileId: 5 }, 'linh').state;
  const bought = dispatch(reopened, { type: 'OFFER_TRADE', tileId: 5, sellerId: 'linh', price: 20 }, 'minh').state;
  const sold = dispatch(bought, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'linh').state;
  reject(sold, old.action, 'linh');
  const delivery = getHarborFreightOpportunity(sold, 'linh');
  assert.ok(delivery?.kind === 'discharge');
  assert.deepEqual([delivery.quote.carrierNet, delivery.quote.handlingFee, delivery.quote.operatorId], [9, 3, 'minh']);
  const paid = dispatch(sold, delivery.action, 'linh');
  assert.equal(paid.state.harborFreight!.lastDelivery?.redemptionCost, undefined);
  assert.deepEqual(paid.state.players.map(player => player.balance), [174, 1483]);
});
