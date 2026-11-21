import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getHarborExportBooking, getHarborFreightOpportunity, OneMonopolyEngine, type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'carrier', name: 'An', token: 'ONE_APUS' as const },
  { id: 'exporter', name: 'Linh', token: 'PILOT_BOAT' as const },
  { id: 'importer', name: 'Minh', token: 'GANTRY_CRANE' as const },
];
const balances = (state: GameState) => state.players.map(player => player.balance);
const booking = (state: GameState) => getHarborExportBooking(state, 'carrier');

function depart(complete = false, cash = 1500) {
  const state = createGame('export-booking', seats, 'harbor');
  state.players[0].position = 1;
  state.players[0].balance = cash;
  Object.assign(state.properties[3], { ownerId: 'exporter', containerLevel: 1 });
  if (complete) state.properties[1].ownerId = 'exporter';
  state.properties[7].ownerId = 'importer';
  return state;
}

function roll(state: GameState, dice: [number, number]) {
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, 'carrier');
}

function reject(state: GameState, action: GameAction, actor?: string) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('rent, export booking, destination rent and discharge settle separately, preserving the extra roll', () => {
  const arrival = roll(depart(), [1, 1]);
  assert.equal(arrival.events.some(event => event.type === 'DEMURRAGE_PAID'), true);
  assert.deepEqual(balances(arrival.state), [1480, 1520, 1500]);
  const offer = booking(arrival.state)!;
  const terms = { operatorId: 'exporter', operatorName: 'Linh', fee: 3 };
  assert.deepEqual(offer, { action: { type: 'HARBOR_BOOK_EXPORT', tileId: 3,
    revision: arrival.state.harborFreight!.revision, operatorId: 'exporter', fee: 3 }, operatorName: 'Linh', shortfall: 0 });
  assert.equal(getHarborFreightOpportunity(arrival.state, 'carrier'), null);
  const before = structuredClone(arrival.state);
  const booked = dispatch(arrival.state, offer.action, 'carrier');
  assert.deepEqual(arrival.state, before);
  assert.deepEqual(balances(booked.state), [1477, 1523, 1500]);
  assert.equal(booked.state.phase, 'WAIT_FOR_ROLL');
  assert.equal(booked.state.consecutiveDoubles, 1);
  assert.equal(booked.state.hasRolled, false);
  assert.deepEqual(booked.state.harborFreight!.manifests.carrier, { originTileId: 3, exportBooking: terms });
  assert.deepEqual(booked.state.harborFreight!.visits.carrier, { tileId: 3, handled: true });
  assert.equal(booked.state.harborFreight!.revision, offer.action.revision + 1);
  assert.deepEqual(booked.events.find(event => event.type === 'HARBOR_LOADED'),
    { type: 'HARBOR_LOADED', playerId: 'carrier', tileId: 3, exportBooking: terms });
  assert.equal(booked.state.harborFreight!.lastDelivery, null);
  reject(booked.state, offer.action, 'carrier');
  reject(booked.state, { ...offer.action, revision: booked.state.harborFreight!.revision }, 'carrier');

  // Terms belong to the cargo even when the origin operator changes while the ship is sailing.
  const sailing = structuredClone(booked.state);
  sailing.properties[3].ownerId = 'importer';
  sailing.players[1].name = 'Renamed';
  const destination = roll(sailing, [1, 3]).state;
  assert.deepEqual(balances(destination), [1469, 1523, 1508]);
  const delivery = getHarborFreightOpportunity(destination, 'carrier');
  assert.ok(delivery?.kind === 'discharge');
  const paid = dispatch(destination, delivery.action, 'carrier');
  assert.deepEqual(balances(paid.state), [1483, 1523, 1512]);
  assert.equal(paid.state.phase, 'END_OF_TURN');
  assert.equal(paid.state.harborFreight!.manifests.carrier, null);
  const receipt = paid.state.harborFreight!.lastDelivery!;
  assert.deepEqual([receipt.operatorId, receipt.gross, receipt.carrierNet, receipt.handlingFee], ['importer', 18, 14, 4]);
  assert.deepEqual(receipt.exportBooking, terms);
  assert.deepEqual(paid.events.find(event => event.type === 'HARBOR_DISCHARGED')?.receipt, receipt);
  reject(paid.state, delivery.action, 'carrier');
});

test('a complete color group charges $6M and the captain may decline, afford exactly the fee, or fall short', () => {
  const landed = roll(depart(true, 26), [1, 1]).state;
  const offer = booking(landed)!;
  assert.equal(offer.action.fee, 6);
  assert.equal(offer.shortfall, 0);
  const booked = dispatch(landed, offer.action, 'carrier').state;
  assert.deepEqual(balances(booked), [0, 1526, 1500]);
  assert.equal(booked.pendingDebt, null);
  const decline = roll(landed, [1, 3]).state;
  assert.equal(decline.harborFreight!.manifests.carrier, null);
  assert.equal(decline.players[1].balance, 1520);

  const short = roll(depart(true, 25), [1, 1]).state;
  assert.equal(booking(short)?.shortfall, 1);
  reject(short, booking(short)!.action, 'carrier');
});

test('booking binds the active captain, port, revision, operator and current fee', () => {
  const landed = roll(depart(), [1, 1]).state;
  const { action } = booking(landed)!;
  reject(landed, action);
  reject(landed, action, 'exporter');
  reject(landed, { ...action, tileId: 7 }, 'carrier');
  reject(landed, { ...action, revision: action.revision - 1 }, 'carrier');
  reject(landed, { ...action, operatorId: 'importer' }, 'carrier');
  reject(landed, { ...action, fee: 6 }, 'carrier');
  reject(landed, { type: 'HARBOR_LOAD', tileId: 3, revision: action.revision }, 'carrier');
  for (const change of [
    (s: GameState) => { s.properties[3].ownerId = 'importer'; },
    (s: GameState) => { s.properties[1].ownerId = 'exporter'; },
  ]) {
    const revised = structuredClone(landed);
    change(revised);
    reject(revised, action, 'carrier');
    const fresh = booking(revised)!.action;
    const result = dispatch(revised, fresh, 'carrier').state;
    const operator = revised.players.findIndex(p => p.id === fresh.operatorId);
    assert.equal(result.players[operator].balance, revised.players[operator].balance + fresh.fee);
  }
});

test('only an empty ship at a fresh, open, developed rival port can book after all obligations resolve', () => {
  const landed = roll(depart(), [1, 1]).state;
  const { action } = booking(landed)!;
  const inDebt = roll(depart(false, 19), [1, 1]).state;
  assert.equal(inDebt.phase, 'AWAITING_DEBT_RESOLUTION');
  assert.equal(booking(inDebt), null);
  reject(inDebt, action, 'carrier');
  for (const invalidate of [
    (s: GameState) => { s.properties[3].ownerId = null; },
    (s: GameState) => { s.properties[3].ownerId = 'carrier'; },
    (s: GameState) => { s.properties[3].containerLevel = 0; },
    (s: GameState) => { s.properties[3].isMortgaged = true; },
    (s: GameState) => { s.players[1].isBankrupt = true; },
    (s: GameState) => { s.players[0].inHold = true; },
    (s: GameState) => { s.players[0].isBankrupt = true; },
    (s: GameState) => { s.harborFreight!.visits.carrier!.handled = true; },
    (s: GameState) => { s.harborFreight!.visits.carrier = null; },
    (s: GameState) => { s.players[0].position = 0; },
    (s: GameState) => { s.harborFreight!.manifests.carrier = { originTileId: 1 }; },
    (s: GameState) => { s.phase = 'AWAITING_BUY_DECISION'; },
    (s: GameState) => { s.pendingSlotCharter = { requesterId: 'carrier', ownerId: 'exporter', tileId: 3, originalRent: 20, discountedRent: 10 }; },
    (s: GameState) => { s.auction = { id: 1, revision: 0, tileId: 3, bidderId: 'carrier', leaderId: null, highestBid: 0, passedIds: [] }; },
    (s: GameState) => { s.winnerId = 'importer'; },
    (s: GameState) => { delete s.harborFreight; },
  ]) {
    const invalid = structuredClone(landed);
    invalidate(invalid);
    assert.equal(booking(invalid), null);
    reject(invalid, action, 'carrier');
  }
  for (const mode of ['classic', 'logistics'] as const) {
    const other = createGame('old-rules', seats, mode);
    assert.equal(booking(other), null);
    reject(other, action, 'carrier');
  }
});

test('free home and owned calls keep the original action, prices, manifest and receipt format', () => {
  const own = depart();
  own.properties[3].ownerId = 'carrier';
  for (const state of [createGame('home', seats, 'harbor'), roll(own, [1, 1]).state]) {
    assert.equal(booking(state), null);
    const load = getHarborFreightOpportunity(state, 'carrier');
    assert.ok(load?.kind === 'load');
    const loaded = dispatch(state, load.action, 'carrier');
    const tileId = load.action.tileId;
    assert.deepEqual(loaded.state.harborFreight!.manifests.carrier, { originTileId: tileId });
    assert.deepEqual(loaded.events, [{ type: 'HARBOR_LOADED', playerId: 'carrier', tileId }]);
    assert.deepEqual(balances(loaded.state), balances(state));
    const next = structuredClone(loaded.state);
    next.properties[tileId === 0 ? 3 : 7].ownerId = 'carrier';
    const destination = roll(next, tileId === 0 ? [1, 2] : [1, 3]).state;
    const discharge = getHarborFreightOpportunity(destination, 'carrier');
    assert.ok(discharge?.kind === 'discharge');
    const paid = dispatch(destination, discharge.action, 'carrier');
    assert.equal('exportBooking' in paid.state.harborFreight!.lastDelivery!, false);
  }
});

test('spending the booking fee expires only cash offers that the carrier can no longer honor', () => {
  const sailing = depart(false, 30);
  sailing.properties[11].ownerId = 'importer';
  sailing.properties[12].ownerId = 'importer';
  let state = roll(sailing, [1, 1]).state;
  for (const [buyer, tileId, price] of [['carrier', 11, 10], ['exporter', 12, 7]] as const) {
    const offer = dispatch(state, { type: 'OFFER_TRADE', tileId, price, sellerId: 'importer' }, buyer);
    assert.equal(offer.events[0]?.type, 'TRADE_OFFERED');
    state = offer.state;
  }
  const result = dispatch(state, booking(state)!.action, 'carrier');
  assert.deepEqual(state.tradeOffers!.map(offer => offer.price), [10, 7]);
  assert.deepEqual(result.state.tradeOffers!.map(offer => offer.price), [7]);
  const closed = result.events.find(event => event.type === 'TRADE_CLOSED');
  assert.equal(closed?.result, 'EXPIRED');
  assert.equal(closed.offer.price, 10);
});

test('accepting a deed purchase can change booking affordability and a resale cannot revive the old quote', () => {
  const sailing = depart(false, 30);
  sailing.properties[11].ownerId = 'importer';
  const state = roll(sailing, [1, 1]).state;
  const original = booking(state)!;
  function sell(atPort: GameState, buyer: string, seller: string) {
    const offered = dispatch(atPort, { type: 'OFFER_TRADE', tileId: 11, price: 9, sellerId: seller }, buyer);
    const offer = offered.events.find(event => event.type === 'TRADE_OFFERED')!.offer;
    assert.deepEqual(booking(offered.state), booking(atPort));
    const accepted = dispatch(offered.state, { type: 'RESPOND_TRADE', offerId: offer.id, accept: true }, seller);
    assert.ok(accepted.events.some(event => event.type === 'TRADE_CLOSED' && event.result === 'ACCEPTED'));
    return accepted.state;
  }
  const purchased = sell(state, 'carrier', 'importer');
  assert.equal(booking(purchased)?.shortfall, 2);
  assert.equal(booking(purchased)?.action.revision, original.action.revision + 1);
  reject(purchased, original.action, 'carrier');
  const restored = sell(purchased, 'importer', 'carrier');
  assert.equal(booking(restored)?.shortfall, 0);
  assert.equal(booking(restored)?.action.revision, original.action.revision + 2);
  reject(restored, original.action, 'carrier');
  const booked = dispatch(restored, booking(restored)!.action, 'carrier');
  assert.equal(booked.state.players[0].balance, 7);
});
