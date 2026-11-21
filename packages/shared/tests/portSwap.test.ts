import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OneMonopolyEngine, SECRET_MISSIONS, getHarborFreightOpportunity, getHarborTerminalShare, getPortSwapOptions,
  getTradeCounterAction, getTradeRestriction,
  type GameAction, type GameMode, type GameState,
} from '../src/index.js';

const { createGame, dispatch, calculateRent } = OneMonopolyEngine;
const seats = [
  { id: 'ship', name: 'An', token: 'ONE_APUS' as const },
  { id: 'buyer', name: 'Linh', token: 'PILOT_BOAT' as const },
  { id: 'seller', name: 'Minh', token: 'FREIGHT_TRAIN' as const },
];

function table(mode: GameMode = 'harbor') {
  const state = createGame('port-swap', seats, mode);
  for (const player of state.players) delete player.secretMission;
  state.properties[5].ownerId = 'buyer';
  state.properties[3].ownerId = 'buyer';
  state.properties[7].ownerId = 'seller';
  state.properties[1].ownerId = 'seller';
  return state;
}

const swap = (price = 0): GameAction => ({ type: 'OFFER_PORT_SWAP', tileId: 7, sellerId: 'seller', offeredTileId: 3, price });
const accept = (offerId = 1, offeredTileId = 3): GameAction => ({ type: 'RESPOND_TRADE', offerId, accept: true, offeredTileId });

function unchanged(state: GameState, action: GameAction, actor: string) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('two cashless captains can swap ports and both color groups acquire their actual rent and freight rates', () => {
  const state = table();
  state.players[1].balance = state.players[2].balance = 0;
  assert.equal(getTradeRestriction(state, 'buyer', 7), null);
  assert.deepEqual(getPortSwapOptions(state, 'buyer', 7), [3, 5]);
  unchanged(state, { type: 'OFFER_TRADE', sellerId: 'seller', tileId: 7, price: 0 }, 'buyer');
  const snapshot = structuredClone(state);
  const offered = dispatch(state, swap(), 'buyer');
  assert.equal(offered.state.tradeOffers?.[0]?.offeredTileId, 3);
  assert.deepEqual(offered.state.properties, snapshot.properties);
  const settled = dispatch(JSON.parse(JSON.stringify(offered.state)), accept(), 'seller');
  assert.deepEqual(settled.state.players.map(p => p.balance), [1500, 0, 0]);
  assert.deepEqual(settled.state.tradeOffers, []);
  assert.equal(settled.state.activePlayerIndex, state.activePlayerIndex);
  assert.equal(settled.state.phase, state.phase);
  for (const [tile, owner] of [[1, 'seller'], [3, 'seller'], [5, 'buyer'], [7, 'buyer']] as const) {
    assert.equal(settled.state.properties[tile].ownerId, owner);
    assert.equal(getHarborTerminalShare(state, tile), 25);
    assert.equal(getHarborTerminalShare(settled.state, tile), 50);
    assert.equal(calculateRent(settled.state, tile, [1, 2]), 2 * calculateRent(state, tile, [1, 2]));
  }
  unchanged(settled.state, accept(), 'seller');
  assert.deepEqual(state, snapshot);
});

test('a swap keeps arrival rent settled while replacing the live freight quote at the port the buyer gives up', () => {
  const start = table();
  const load = getHarborFreightOpportunity(start, 'ship');
  assert.ok(load?.kind === 'load');
  const loaded = dispatch(start, load.action, 'ship').state;
  const docked = dispatch(loaded, { type: 'ROLL_DICE', forcedDice: [1, 2] }, 'ship').state;
  const before = getHarborFreightOpportunity(docked, 'ship');
  assert.ok(before?.kind === 'discharge');
  assert.deepEqual([before.quote.carrierNet, before.quote.handlingFee, before.quote.operatorId], [9, 3, 'buyer']);
  assert.deepEqual(docked.players.map(p => p.balance), [1496, 1504, 1500]);
  const pending = dispatch(docked, swap(20), 'buyer').state;
  const settled = dispatch(pending, accept(), 'seller').state;
  assert.deepEqual(settled.players.map(p => p.balance), [1496, 1484, 1520]);
  assert.deepEqual(settled.harborFreight!.manifests.ship, { originTileId: 0 });
  unchanged(settled, before.action, 'ship');
  const after = getHarborFreightOpportunity(settled, 'ship');
  assert.ok(after?.kind === 'discharge');
  assert.deepEqual([after.quote.carrierNet, after.quote.handlingFee, after.quote.operatorId], [6, 6, 'seller']);
  const delivered = dispatch(settled, after.action, 'ship').state;
  assert.deepEqual(delivered.players.map(p => p.balance), [1502, 1484, 1526]);
});

test('swap counters keep both deeds, raise only cash and require both clients to acknowledge the additional port', () => {
  const pending = dispatch(table(), swap(), 'buyer').state;
  for (const echo of [{}, { offeredTileId: 5 }]) {
    unchanged(pending, { type: 'RESPOND_TRADE', offerId: 1, accept: true, ...echo }, 'seller');
    unchanged(pending, { type: 'COUNTER_TRADE', offerId: 1, price: 25, ...echo }, 'seller');
  }
  const counter = getTradeCounterAction(pending, 'seller', 1, 25);
  assert.deepEqual(counter, { type: 'COUNTER_TRADE', offerId: 1, price: 25, offeredTileId: 3 });
  const revised = dispatch(pending, counter!, 'seller').state;
  assert.deepEqual(revised.tradeOffers, [{ id: 2, tileId: 7, sellerId: 'seller', buyerId: 'buyer', offeredTileId: 3,
    originalPrice: 0, price: 25 }]);
  unchanged(revised, accept(1), 'seller');
  unchanged(revised, accept(2), 'seller');
  unchanged(revised, { type: 'RESPOND_TRADE', offerId: 2, accept: true }, 'buyer');
  const closed = dispatch(revised, accept(2), 'buyer').state;
  assert.equal(closed.properties[3].ownerId, 'seller');
  assert.equal(closed.properties[7].ownerId, 'buyer');
  assert.deepEqual(closed.players.map(p => p.balance), [1500, 1475, 1525]);
});

test('both deeds must be transferable ports in Monopoly and the cash supplement must be affordable', () => {
  const normal = table();
  normal.properties[3].isMortgaged = true;
  assert.deepEqual(getPortSwapOptions(normal, 'buyer', 7), [5]);
  normal.properties[5].isMortgaged = true;
  normal.players[1].balance = 0;
  assert.ok(getTradeRestriction(normal, 'buyer', 7));
  assert.deepEqual(getPortSwapOptions(normal, 'buyer', 7), []);
  for (const mode of ['classic', 'logistics'] as const) unchanged(table(mode), swap(20), 'buyer');
  const legacy = table('classic');
  delete legacy.mode;
  unchanged(legacy, swap(20), 'buyer');
  const offer = { type: 'OFFER_PORT_SWAP', tileId: 7, sellerId: 'seller', offeredTileId: 3, price: 20 } as const;
  const open = table();
  for (const offeredTileId of [0, 1, 4, 7, 8, 10, -1, 3.5, 32, NaN]) unchanged(open, { ...offer, offeredTileId }, 'buyer');
  for (const tileId of [0, 3, 4, 10, 32]) unchanged(open, { ...offer, tileId }, 'buyer');
  for (const price of [-1, 1.1, Infinity, NaN, 1501]) unchanged(open, swap(price), 'buyer');
  for (const [deed, sister, owner] of [[3, 1, 'buyer'], [7, 5, 'seller']] as const) {
    for (const lock of [
      (s: GameState) => { s.properties[deed].isMortgaged = true; },
      (s: GameState) => { s.properties[deed].slotCharter = { partnerId: 'ship', active: true }; },
      (s: GameState) => { s.properties[sister].containerLevel = 1; },
      (s: GameState) => { s.players.find(p => p.id === owner)!.isBankrupt = true; },
    ]) {
      const state = table();
      lock(state);
      unchanged(state, offer, 'buyer');
    }
  }
});

test('ambiguous wire terms cannot create a cash sale or a one-sided swap', () => {
  const state = table();
  const base = { sellerId: 'seller', tileId: 7, price: 20 };
  for (const price of [0, 20]) {
    unchanged(state, { ...base, price, type: 'OFFER_TRADE', offeredTileId: 3 } as unknown as GameAction, 'buyer');
    unchanged(state, { ...base, price, type: 'OFFER_PORT_SWAP' } as unknown as GameAction, 'buyer');
  }
  const cash = dispatch(state, { ...base, type: 'OFFER_TRADE' }, 'buyer');
  assert.deepEqual(cash.state.tradeOffers, [{ ...base, id: 1, buyerId: 'buyer' }]);
});

test('selling the offered deed to a third captain expires the exchange before either leg can settle', () => {
  const pending = dispatch(table(), swap(20), 'buyer').state;
  const competing = dispatch(pending, { type: 'OFFER_TRADE', tileId: 3, sellerId: 'buyer', price: 70 }, 'ship').state;
  const won = dispatch(competing, { type: 'RESPOND_TRADE', offerId: 2, accept: true }, 'buyer');
  assert.deepEqual(won.events.filter(e => e.type === 'TRADE_CLOSED').map(e => [e.offer.id, e.result]),
    [[2, 'ACCEPTED'], [1, 'EXPIRED']]);
  assert.deepEqual(won.state.tradeOffers, []);
  assert.equal(won.state.properties[7].ownerId, 'seller');
  assert.equal(won.state.properties[3].ownerId, 'ship');
  assert.deepEqual(won.state.players.map(p => p.balance), [1430, 1570, 1500]);
  unchanged(won.state, accept(), 'seller');
});

test('missions are checked for both captains after both deeds have changed hands', () => {
  const state = table();
  state.properties[3].ownerId = 'seller';
  for (const id of [1, 4, 17]) state.properties[id].ownerId = 'buyer';
  for (const id of [31, 14]) state.properties[id].ownerId = 'seller';
  state.properties[14].containerLevel = 5;
  state.players[1].secretMission = { ...SECRET_MISSIONS.find(card => card.id === 'MISSION-5')! };
  state.players[2].secretMission = { ...SECRET_MISSIONS.find(card => card.id === 'MISSION-2')! };
  const pending = dispatch(state, { type: 'OFFER_PORT_SWAP', tileId: 3, sellerId: 'seller', offeredTileId: 17, price: 10 }, 'buyer').state;
  const settled = dispatch(pending, accept(1, 17), 'seller');
  assert.deepEqual(settled.state.players.map(p => p.balance), [1500, 1840, 2010]);
  assert.deepEqual(settled.state.players.slice(1).map(p => p.secretMission?.isCompleted), [true, true]);
  assert.equal(settled.events.filter(e => e.type === 'MISSION_COMPLETED').length, 2);
  unchanged(settled.state, accept(1, 17), 'seller');
});
