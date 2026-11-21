import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoOpportunity, getCargoRedirections, getLogisticsRoutes, OneMonopolyEngine,
  type CargoKind, type GameAction, type GameState,
} from '../src/index.js';

const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
];
const { createGame, dispatch } = OneMonopolyEngine;
function booked(destination: number, kind: CargoKind = 'laden', reefer = false) {
  const state = createGame('amendments', seats, 'logistics');
  const choice = getCargoBookings(state, 'a', kind, reefer).find(c => c.tileId === destination);
  assert.ok(choice);
  const loaded = dispatch(state, choice.action, 'a');
  assert.equal(loaded.events[0]?.type, 'CARGO_LOADED');
  return loaded.state;
}
function change(state: GameState, destination: number) {
  const choice = getCargoRedirections(state, 'a').find(c => c.tileId === destination);
  assert.ok(choice);
  return choice.action;
}
function rejected(state: GameState, action: GameAction, actor = 'a') {
  const outcome = dispatch(state, action, actor);
  assert.equal(outcome.state, state);
  assert.deepEqual(outcome.events, []);
}
function sail(state: GameState, destination: number) {
  const route = getLogisticsRoutes(state, 'a').find(c => c.tileId === destination);
  assert.ok(route);
  const result = dispatch(state, route.action, 'a');
  assert.equal(result.events[0]?.type, 'SHIP_STEPPED');
  return result.state;
}
function discharge(state: GameState) {
  const choice = getCargoOpportunity(state, 'a');
  assert.equal(choice?.action.type, 'UNLOAD_CARGO');
  assert.ok(choice);
  const result = dispatch(state, choice.action, 'a');
  const event = result.events.find(e => e.type === 'CARGO_UNLOADED');
  assert.ok(event);
  return { ...result, event, request: choice.action };
}

test('only accepted destination changes count, including changing back to the first destination', () => {
  const original = booked(17); // Singapore to Busan.
  const request = change(original, 27);
  rejected(original, request, 'b');
  rejected(original, { ...request, bookingId: request.bookingId + 1 });
  rejected(original, { ...request, destinationTileId: 17 });
  const first = dispatch(original, request, 'a');
  const expected = { firstDestinationTileId: 17, count: 1, originalQuote: { distanceNm: 2472, reward: 16 } };
  const firstEvent = first.events[0];
  assert.ok(firstEvent?.type === 'CARGO_DESTINATION_CHANGED');
  assert.deepEqual(firstEvent.destinationAmendment, expected);
  assert.deepEqual(first.state.players[0].cargo?.destinationAmendment, expected);
  assert.equal(original.players[0].cargo?.destinationAmendment, undefined);
  rejected(first.state, request);

  const restored: GameState = JSON.parse(JSON.stringify(first.state));
  const returned = dispatch(restored, change(restored, 17), 'a');
  assert.equal(returned.state.players[0].cargo?.destinationTileId, 17);
  assert.deepEqual(returned.state.players[0].cargo?.destinationAmendment, { ...expected, count: 2 });
  assert.deepEqual(restored.players[0].cargo?.destinationAmendment, expected);
  assert.deepEqual(firstEvent.destinationAmendment, expected);
  const { state } = discharge(sail(returned.state, 17));
  assert.deepEqual(state.logistics!.voyageLog![0].destinationAmendment, { ...expected, count: 2 });
  assert.equal(state.players[0].balance, 16);
});

const cargoServices = [
  { name: 'dry cargo', kind: 'laden', reefer: false, originalRate: 16, paidRate: 12, premium: undefined },
  { name: 'empty equipment', kind: 'empty', reefer: false, originalRate: 8, paidRate: 6, premium: undefined },
  { name: 'refrigerated cargo', kind: 'laden', reefer: true, originalRate: 16, paidRate: 12, premium: 8 },
] as const;

for (const { name, kind, reefer, originalRate, paidRate, premium } of cargoServices) {
  test(`${name} keeps the original base quote and settles at the amended port's own rate`, () => {
    // Sail to Cát Lái on a Busan ticket, then redirect at the berth. Both quotes must use Singapore.
    const atPort = sail(booked(17, kind, reefer), 1);
    const changed = dispatch(atPort, change(atPort, 1), 'a');
    const result = discharge(changed.state);
    const receipt = result.state.players[0].lastDelivery!;
    const [entry] = result.state.logistics!.voyageLog!;
    const expected = { firstDestinationTileId: 17, count: 1, originalQuote: { distanceNm: 2472, reward: originalRate } };
    assert.equal(entry.bookingId, atPort.players[0].cargo!.bookingId);
    for (const record of [result.event, receipt, entry]) {
      assert.deepEqual(record.destinationAmendment, expected);
      assert.equal(record.kind, kind);
      assert.equal(record.originTileId, 0);
      assert.equal(record.destinationTileId, 1);
      assert.equal(record.distanceNm, 596);
      assert.equal(record.reeferBonus, premium);
    }
    assert.equal(receipt.reward, paidRate);
    assert.equal(entry.baseFreight, paidRate);
    const total = paidRate + (premium ?? 0);
    assert.equal(result.state.players[0].balance, total);
    assert.equal(result.state.logistics!.earnings.a, total);
    const balance = result.events.find(e => e.type === 'BALANCE_CHANGED');
    assert.equal(balance?.delta, total);
    rejected(result.state, result.request);
    assert.equal(result.state.logistics!.voyageLog!.length, 1);
  });
}

test('unamended tickets produce plain receipts and log entries for every service', () => {
  for (const { kind, reefer, paidRate, premium } of cargoServices) {
    const atPort = sail(booked(1, kind, reefer), 1);
    const result = discharge(atPort);
    const receipt = result.state.players[0].lastDelivery!;
    const entry = result.state.logistics!.voyageLog![0];
    for (const record of [atPort.players[0].cargo!, receipt, result.event, entry]) {
      assert.equal(Object.hasOwn(record, 'destinationAmendment'), false);
    }
    assert.equal(entry.baseFreight, paidRate);
    assert.equal(receipt.reeferBonus, premium);
  }
});

test('events and the voyage log keep independent copies of the original quote', () => {
  const original = booked(17);
  const changed = dispatch(original, change(original, 1), 'a');
  const changeEvent = changed.events[0];
  assert.ok(changeEvent?.type === 'CARGO_DESTINATION_CHANGED' && changeEvent.destinationAmendment);
  changeEvent.destinationAmendment.originalQuote.reward = 999;
  const atPort = sail(changed.state, 1);
  const result = discharge(atPort);
  assert.ok(result.event.destinationAmendment);
  result.event.destinationAmendment.originalQuote.reward = 998;
  const receipt = result.state.players[0].lastDelivery!;
  assert.equal(receipt.destinationAmendment?.originalQuote.reward, 16);
  receipt.destinationAmendment.originalQuote.reward = 997;
  assert.equal(result.state.logistics!.voyageLog![0].destinationAmendment?.originalQuote.reward, 16);
  assert.equal(atPort.players[0].cargo!.destinationAmendment?.originalQuote.reward, 16);
});

test('a restored ticket without amendment history starts counting at its first observed diversion', () => {
  const loaded = booked(17);
  const previous = dispatch(loaded, change(loaded, 1), 'a').state;
  const restored: GameState = JSON.parse(JSON.stringify(previous));
  delete restored.players[0].cargo!.destinationAmendment; // Older saved ticket only knew its latest booked port.
  const atPort = sail(restored, 27);
  rejected(atPort, { ...change(atPort, 27), destinationTileId: 0 });
  assert.equal(atPort.players[0].cargo!.destinationAmendment, undefined);
  const accepted = dispatch(atPort, change(atPort, 27), 'a');
  const { state } = discharge(accepted.state);
  assert.deepEqual(state.logistics!.voyageLog![0].destinationAmendment, {
    firstDestinationTileId: 1, count: 1, originalQuote: { distanceNm: 596, reward: 12 },
  });
  assert.equal(state.players[0].balance, 28);
  assert.equal(state.players[0].lastDelivery!.distanceNm, 8601);
});
