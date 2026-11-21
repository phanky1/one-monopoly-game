import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OneMonopolyEngine, type GameAction, type GameMode, type GameState, type TurnPhase } from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'captain', name: 'An', token: 'ONE_APUS' as const },
  { id: 'buyer', name: 'Linh', token: 'PILOT_BOAT' as const },
  { id: 'seller', name: 'Minh', token: 'FREIGHT_TRAIN' as const },
];

function offered(tileId = 3, mode: GameMode = 'harbor') {
  const state = createGame('port-counter', seats, mode);
  state.properties[tileId].ownerId = 'seller';
  return dispatch(state, { type: 'OFFER_TRADE', sellerId: 'seller', tileId, price: 50 }, 'buyer').state;
}

const counter = (offerId = 1, price = 100): GameAction => ({ type: 'COUNTER_TRADE', offerId, price });
const respond = (offerId: number, accept: boolean): GameAction => ({ type: 'RESPOND_TRADE', offerId, accept });
const withdraw = (offerId: number): GameAction => ({ type: 'CANCEL_TRADE', offerId });

function reject(state: GameState, action: GameAction, playerId?: string) {
  const result = dispatch(state, action, playerId);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('a seller can replace a port bid once, with the buyer deciding the revised price', () => {
  const initial = offered();
  const revised = dispatch(initial, counter(), 'seller');
  const terms = { id: 2, sellerId: 'seller', buyerId: 'buyer', tileId: 3, price: 100, originalPrice: 50 };
  assert.deepEqual(revised.events, [{ type: 'TRADE_COUNTERED', offer: terms }]);
  assert.deepEqual(revised.state.tradeOffers, [terms]);
  assert.equal(initial.tradeOffers![0].price, 50);
  assert.deepEqual(revised.state.players, initial.players);
  assert.deepEqual(revised.state.properties, initial.properties);
  reject(revised.state, counter(2, 110), 'seller');
  reject(revised.state, counter(1, 110), 'seller');
  reject(revised.state, respond(1, true), 'seller');
  reject(revised.state, respond(2, true), 'seller');
  reject(revised.state, respond(2, true), 'captain');
  reject(revised.state, withdraw(2), 'captain');
  reject(revised.state, { type: 'OFFER_TRADE', sellerId: 'seller', tileId: 3, price: 66 }, 'buyer');

  const sale = dispatch(revised.state, respond(2, true), 'buyer');
  assert.equal(sale.state.properties[3].ownerId, 'buyer');
  assert.deepEqual(sale.state.players.map(player => player.balance), [1500, 1400, 1600]);
  assert.deepEqual(sale.events.filter(event => event.type === 'TRADE_CLOSED'),
    [{ type: 'TRADE_CLOSED', offer: terms, result: 'ACCEPTED' }]);
  assert.equal(sale.state.activePlayerIndex, 0);
  assert.equal(sale.state.phase, initial.phase);
  reject(sale.state, respond(2, true), 'buyer');
});

test('countering requires a tradeable Monopoly port, its seller and an affordable price above the bid', () => {
  const state = offered();
  for (const price of [-1, 0, 49, 50, 51.5, 1501, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    reject(state, counter(1, price), 'seller');
  }
  for (const id of [undefined, 'buyer', 'captain']) reject(state, counter(), id);
  assert.equal(dispatch(state, counter(1, 1500), 'seller').events[0]?.type, 'TRADE_COUNTERED');
  for (const tileId of [4, 10]) reject(offered(tileId), counter(), 'seller');
  reject(offered(3, 'classic'), counter(), 'seller');
  reject(offered(3, 'logistics'), counter(), 'seller');
  const legacy = offered(3, 'classic');
  delete legacy.mode;
  reject(legacy, counter(), 'seller');
  for (const change of [
    (s: GameState) => { s.properties[3].ownerId = 'captain'; },
    (s: GameState) => { s.properties[3].isMortgaged = true; },
    (s: GameState) => { s.properties[1].containerLevel = 1; },
    (s: GameState) => { s.properties[3].slotCharter = { partnerId: 'captain', active: true }; },
    (s: GameState) => { s.players[1].isBankrupt = true; },
  ]) {
    const locked = structuredClone(state);
    change(locked);
    reject(locked, counter(), 'seller');
  }
});

test('a counter may be negotiated during a compulsory decision, but only settled after it clears', () => {
  const phases: TurnPhase[] = ['AWAITING_AUCTION', 'AWAITING_DEBT_RESOLUTION', 'AWAITING_STORM_DECISION',
    'AWAITING_SLOT_CHARTER_RESPONSE'];
  for (const phase of phases) {
    const initial = { ...offered(), phase };
    const pending = dispatch(initial, counter(), 'seller').state;
    assert.equal(pending.tradeOffers![0].originalPrice, 50);
    assert.equal(pending.phase, phase);
    reject(pending, respond(2, true), 'buyer');
    for (const [actor, action, result] of [
      ['seller', withdraw(2), 'WITHDRAWN'], ['buyer', respond(2, false), 'DECLINED'],
      ['buyer', withdraw(2), 'DECLINED'],
    ] as const) {
      const close = dispatch(pending, action, actor);
      assert.deepEqual(close.events, [{ type: 'TRADE_CLOSED', offer: pending.tradeOffers![0], result }]);
      assert.deepEqual(close.state.players, initial.players);
      assert.equal(close.state.phase, phase);
    }
  }
});

test('a competing sale expires the outstanding counter and the buyer can start a new negotiation', () => {
  const revised = dispatch(offered(), counter(), 'seller').state;
  const rivalBid = dispatch(revised, { type: 'OFFER_TRADE', tileId: 3, sellerId: 'seller', price: 74 }, 'captain').state;
  const won = dispatch(rivalBid, respond(3, true), 'seller');
  assert.deepEqual(won.events.filter(event => event.type === 'TRADE_CLOSED').map(event => [event.offer.id, event.result]),
    [[3, 'ACCEPTED'], [2, 'EXPIRED']]);
  assert.deepEqual(won.state.players.map(player => player.balance), [1426, 1500, 1574]);
  reject(won.state, respond(2, true), 'buyer');
  const fresh = dispatch(won.state, { type: 'OFFER_TRADE', tileId: 3, sellerId: 'captain', price: 80 }, 'buyer');
  assert.equal(fresh.state.tradeOffers![0].id, 4);
  assert.equal(fresh.state.tradeOffers![0].originalPrice, undefined);
});
