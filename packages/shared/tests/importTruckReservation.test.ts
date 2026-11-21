import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoDestinationEstimate, getCargoOpportunity, getCargoRedirections, getEarlyTruckCalls,
  getFeederRoutes, getFreightQuote, getImportTruckReservation, getLogisticsRoutes, getPortTruckSchedule,
  getReserveImportTruckAction, getTenderBidAction, LOGISTICS_PORT_CAPACITY, LOGISTICS_ROUND_LIMIT, OneMonopolyEngine,
  type CargoKind, type GameAction, type GameState,
} from '../src/index.js';
import { getNextRoundReceivingSlots } from '../src/cargo.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'c', name: 'Chi', token: 'GANTRY_CRANE' as const },
];
const fresh = (count = 2) => createGame('truck-booking', seats.slice(0, count), 'logistics');
const actor = (s: GameState) => s.players[s.activePlayerIndex].id;
function act(s: GameState, action: GameAction) {
  const result = dispatch(s, action, actor(s));
  assert.notEqual(result.state, s, action.type);
  return result;
}
function reject(s: GameState, action: GameAction, playerId = actor(s)) {
  const result = dispatch(s, action, playerId);
  assert.equal(result.state, s);
  assert.deepEqual(result.events, []);
}
const end = (s: GameState) => act(s, { type: 'END_TURN' }).state;
function load(s: GameState, destination: number, kind: CargoKind = 'laden', reefer = false) {
  const booking = getCargoBookings(s, actor(s), kind, reefer).find(o => o.tileId === destination);
  assert.ok(booking);
  return act(s, booking.action).state;
}
function sail(s: GameState, destination: number) {
  const route = getLogisticsRoutes(s, actor(s)).find(o => o.tileId === destination);
  assert.ok(route);
  return act(s, route.action).state;
}
function reserve(s: GameState) {
  const action = getReserveImportTruckAction(s, actor(s));
  assert.ok(action);
  return act(s, action).state;
}
function unload(s: GameState) {
  const action = getCargoOpportunity(s, actor(s))?.action;
  assert.ok(action?.type === 'UNLOAD_CARGO');
  return act(s, action).state;
}

test('sets aside exactly one public truck for this booking and pays the normal freight only on discharge', () => {
  const before = load(fresh(), 3);
  const offer = getReserveImportTruckAction(before, 'a')!;
  const { bookingId } = before.players[0].cargo!;
  assert.deepEqual(offer, { type: 'RESERVE_IMPORT_TRUCK', bookingId, destinationTileId: 3, revision: before.cargoRevision });
  assert.deepEqual(before.logistics!.importTruckAvailable, { a: true, b: true });
  assert.equal(before.logistics!.ports[3].demand, 2);
  reject(before, offer, 'b');
  reject(before, { ...offer, bookingId: bookingId + 1 });
  reject(before, { ...offer, destinationTileId: 1 });
  reject(before, { ...offer, revision: offer.revision - 1 });
  const result = act(before, offer);
  assert.deepEqual(result.events, [{ type: 'IMPORT_TRUCK_RESERVED', playerId: 'a', bookingId, destinationTileId: 3, throughRound: 2 }]);
  const saved: GameState = JSON.parse(JSON.stringify(result.state));
  assert.deepEqual(getImportTruckReservation(saved, 'a'), { bookingId, destinationTileId: 3, throughRound: 2 });
  assert.equal(getImportTruckReservation(saved, 'b'), null);
  assert.deepEqual(saved.players[0].cargo, before.players[0].cargo);
  assert.deepEqual(saved.logistics!.ports[3], { ...before.logistics!.ports[3], demand: 1 });
  assert.deepEqual(saved.logistics!.importTruckAvailable, { a: false, b: true });
  assert.equal(saved.players[0].balance, before.players[0].balance);
  assert.equal(saved.logistics!.earnings.a, 0);
  assert.equal(getCargoDestinationEstimate(saved, 'a', 3)?.receiver, 'appointment');
  reject(saved, offer);
  reject(saved, { ...offer, revision: saved.cargoRevision! });
  const delivered = unload(sail(saved, 3));
  assert.equal(delivered.logistics!.ports[3].demand, 1);
  assert.equal(delivered.players[0].balance, getFreightQuote(0, 3)!.reward);
  assert.equal(delivered.logistics!.earnings.a, delivered.players[0].balance);
  assert.equal(getImportTruckReservation(delivered, 'a'), null);
  assert.equal(getReserveImportTruckAction(load(delivered, 1), 'a'), null);
});

test('blocks competing public bookings and the discharge of a previously booked rival at an empty queue', () => {
  let s = end(load(fresh(3), 1)); // An loaded cargo bound for a terminal with one free truck.
  s = end(reserve(load(s, 1))); // Bình now holds the truck.
  assert.equal(s.logistics!.ports[1].demand, 0);
  assert.ok(!getCargoBookings(s, 'c', 'laden').some(o => o.tileId === 1));
  s = sail(end(s), 1);
  assert.equal(s.turnCount, 2);
  assert.equal(getCargoOpportunity(s, 'a'), null);
  const blocked = s.players[0].cargo!;
  reject(s, { type: 'UNLOAD_CARGO', tileId: 1, originTileId: 0, bookingId: blocked.bookingId, revision: s.cargoRevision! });
  assert.equal(s.players[0].balance, 0);
  s = unload(sail(end(s), 1));
  assert.equal(s.players[1].lastDelivery?.tileId, 1);
  assert.equal(s.logistics!.ports[1].demand, 0);
  assert.deepEqual(s.logistics!.deliveries, { a: 0, b: 1, c: 0 });
});

test('returns the truck on an accepted diversion or after the whole following round and keeps its allowance spent', () => {
  const held = reserve(load(fresh(), 1));
  const cod = getCargoRedirections(held, 'a').find(o => o.tileId === 3)!.action;
  reject(held, { ...cod, revision: cod.revision - 1 });
  const diverted = act(held, cod).state;
  assert.equal(diverted.logistics!.ports[1].demand, 1);
  assert.equal(diverted.players[0].cargo?.destinationTileId, 3);
  assert.equal(getImportTruckReservation(diverted, 'a'), null);
  assert.equal(getReserveImportTruckAction(diverted, 'a'), null);
  const following = end(end(held));
  assert.equal(following.turnCount, 2);
  assert.equal(getImportTruckReservation(end(following), 'a')?.throughRound, 2);
  assert.equal(following.logistics!.ports[1].demand, 0);
  const forecast = getPortTruckSchedule(following, 1)!;
  assert.deepEqual(forecast.operations, []);
  assert.equal(forecast.projected.demand, 1);
  assert.equal(getNextRoundReceivingSlots(following, 1, 'laden'), 1);
  assert.equal(unload(sail(following, 1)).players[0].lastDelivery?.tileId, 1);
  const expired = end(end(following));
  assert.equal(expired.turnCount, 3);
  assert.equal(expired.logistics!.ports[1].demand, 1);
  assert.equal(getImportTruckReservation(expired, 'a'), null);
  assert.equal(getReserveImportTruckAction(expired, 'a'), null);
  assert.equal(expired.players[0].balance, 0);
});

test('keeps an expiring truck reserved during an early call and includes its release in the opening queue', () => {
  const held = reserve(load(fresh(), 5));
  const atBerth = sail(end(end(held)), 5);
  assert.equal(getImportTruckReservation(atBerth, 'a')?.throughRound, atBerth.turnCount);
  const call = getEarlyTruckCalls(atBerth, 'a').find(choice => choice.operation === 'import')!;
  const opening = getPortTruckSchedule(atBerth, 5)!.projected;
  assert.equal(atBerth.logistics!.ports[5].demand, 0);
  assert.equal(call.after.demand, 1);
  assert.equal(opening.demand, 2);
  const called = act(atBerth, call.action).state;
  assert.equal(called.logistics!.ports[5].demand, 1);
  assert.ok(getImportTruckReservation(called, 'a'));
  assert.equal(getNextRoundReceivingSlots(called, 5, 'laden'), opening.demand);
  assert.equal(end(end(called)).logistics!.ports[5].demand, opening.demand);
});

test('allows a final-round reservation for a reachable berth and returns it unpaid at game over if unused', () => {
  const initial = fresh();
  initial.turnCount = LOGISTICS_ROUND_LIMIT;
  const booked = load(initial, 1);
  const held = reserve(booked);
  assert.equal(getImportTruckReservation(held, 'a')?.throughRound, LOGISTICS_ROUND_LIMIT);
  const finished = end(end(held));
  assert.ok(finished.winnerId);
  assert.deepEqual(finished.logistics!.importTruckReservations, {});
  assert.equal(finished.logistics!.ports[1].demand, 1);
  assert.equal(finished.logistics!.earnings.a, 0);
  const tooFar = sail(booked, 17);
  assert.equal(getReserveImportTruckAction(tooFar, 'a'), null);
  const nearby = reserve(sail(booked, 3));
  const feeder = getFeederRoutes(nearby, 'a').find(route => route.tileId === 1)!;
  assert.deepEqual(feeder.quote, getFreightQuote(0, 1));
  const delivered = unload(act(nearby, feeder.action).state);
  assert.equal(delivered.players[0].lastDelivery?.tileId, 1);
  assert.equal(delivered.logistics!.ports[1].demand, 0);
});

test('counts all held trucks toward the physical queue cap for early calls and ordinary rollover', () => {
  const initial = fresh(3);
  initial.logistics!.ports[3].demand = LOGISTICS_PORT_CAPACITY;
  let s = end(reserve(load(initial, 3)));
  s = end(reserve(load(s, 3)));
  s = sail(s, 3);
  assert.equal(s.logistics!.ports[3].demand, 2);
  const schedule = getPortTruckSchedule(s, 3)!;
  assert.equal(schedule.scheduledRound, 2);
  assert.equal(schedule.operations.find(op => op.operation === 'import')?.available, false);
  assert.equal(schedule.projected.demand, 2);
  assert.equal(getNextRoundReceivingSlots(s, 3, 'laden'), 2);
  assert.ok(!getEarlyTruckCalls(s, 'c').some(op => op.operation === 'import'));
  reject(s, { type: 'CALL_PORT_TRUCK', operation: 'import', tileId: 3, revision: s.cargoRevision! });
  s = end(s);
  assert.equal(s.logistics!.ports[3].demand, 2);
  for (const id of ['a', 'b']) {
    assert.equal(getImportTruckReservation(s, id)?.destinationTileId, 3);
    const diversion = getCargoRedirections(s, id).find(o => o.tileId === 1)!.action;
    s = end(act(s, diversion).state);
  }
  assert.equal(s.logistics!.ports[3].demand, LOGISTICS_PORT_CAPACITY);
});

test('services the tender winner and the reservation holder independently with zero public trucks', () => {
  const initial = fresh(3);
  initial.logistics!.ports[17].demand = 2;
  let s = end(act(initial, getTenderBidAction(initial, 'a', 7)!).state);
  s = end(reserve(load(s, 17)));
  s = end(unload(sail(load(s, 17), 17))); // Third captain consumes the last free truck.
  assert.equal(s.logistics!.ports[17].demand, 0);
  assert.equal(s.logistics!.market!.contract?.playerId, 'a');
  s = load(s, 17);
  const publicSlot = structuredClone(s);
  publicSlot.logistics!.ports[17].demand = 1;
  assert.equal(getReserveImportTruckAction(publicSlot, 'a'), null);
  s = unload(sail(s, 17));
  assert.equal(s.players[0].lastDelivery?.tenderBonus, 7);
  assert.equal(s.logistics!.ports[17].demand, 0);
  assert.ok(getImportTruckReservation(s, 'b'));
  s = unload(sail(end(s), 17));
  assert.equal(s.players[1].lastDelivery?.tenderBonus, undefined);
  assert.equal(s.logistics!.ports[17].demand, 0);
  assert.equal(getImportTruckReservation(s, 'b'), null);
});

test('requires a laden booking before arrival, supports reefers at intermediate ports, and leaves legacy rooms untouched', () => {
  const opening = fresh();
  assert.equal(getReserveImportTruckAction(opening, 'a'), null);
  assert.equal(getReserveImportTruckAction(load(opening, 1, 'empty'), 'a'), null);
  const aboard = load(opening, 17, 'laden', true);
  const action = getReserveImportTruckAction(aboard, 'a')!;
  const unchecked = sail(aboard, 17);
  assert.equal(getReserveImportTruckAction(unchecked, 'a'), null);
  reject(unchecked, { ...action, revision: unchecked.cargoRevision! });
  const stop = sail(aboard, 1);
  assert.equal(stop.phase, 'END_OF_TURN');
  const held = reserve(stop);
  assert.equal(held.players[0].cargo?.reeferDueRound, 1);
  assert.equal(getImportTruckReservation(held, 'a')?.destinationTileId, 17);
  const unavailable = structuredClone(aboard);
  unavailable.logistics!.ports[17].demand = 0;
  const legacy = structuredClone(aboard);
  delete legacy.logistics!.importTruckAvailable;
  delete legacy.logistics!.importTruckReservations;
  const classic = createGame('classic', seats.slice(0, 2), 'classic');
  for (const s of [unavailable, legacy, classic]) {
    assert.equal(getReserveImportTruckAction(s, 'a'), null);
    assert.equal(getImportTruckReservation(s, 'a'), null);
    reject(s, action);
  }
  const oldDelivery = unload(sail(legacy, 17));
  assert.equal(oldDelivery.players[0].lastDelivery?.reeferBonus, 8);
  assert.equal(oldDelivery.logistics!.importTruckReservations, undefined);
});
