import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAcceptBackhaulAction, getCargoBookings, getCargoOpportunity, getCargoRedirections, getEmptyNeed,
  getFeederRoutes, getImportTruckReservation, getLogisticsRoutes, getReserveImportTruckAction,
  getReturnCargoToYardAction, getReturnCargoYardStatus, getTenderBidAction, OneMonopolyEngine,
  type CargoKind, type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'minh', name: 'Minh', token: 'PILOT_BOAT' as const },
];
const fresh = () => createGame('yard', seats, 'logistics');
const who = (s: GameState) => s.players[s.activePlayerIndex].id;
function apply(s: GameState, action: GameAction) {
  const result = dispatch(s, action, who(s));
  assert.notEqual(result.state, s, action.type);
  return result.state;
}
function end(s: GameState) { return apply(s, { type: 'END_TURN' }); }
function book(s: GameState, dest: number, kind: CargoKind = 'laden', reefer = false) {
  const option = getCargoBookings(s, who(s), kind, reefer).find(choice => choice.tileId === dest);
  assert.ok(option);
  return apply(s, option.action);
}
function sail(s: GameState, dest: number) {
  const option = getLogisticsRoutes(s, who(s)).find(choice => choice.tileId === dest);
  assert.ok(option);
  return apply(s, option.action);
}
function discharge(s: GameState) {
  const action = getCargoOpportunity(s, who(s))?.action;
  assert.ok(action?.type === 'UNLOAD_CARGO');
  return apply(s, action);
}
function reject(s: GameState, action: GameAction, actor = who(s)) {
  const result = dispatch(s, action, actor);
  assert.equal(result.state, s);
  assert.deepEqual(result.events, []);
}
function returnAction(state: GameState) {
  const action = getReturnCargoToYardAction(state, who(state));
  assert.ok(action);
  return action;
}

test('when a rival fills Cái Mép’s last empty order, the captain can return that empty and book a dry export', () => {
  const waiting = book(fresh(), 3, 'empty');
  const original = waiting.players[0].cargo!;
  const rival = end(waiting);
  const ready = end(discharge(sail(book(rival, 3, 'empty'), 3)));
  assert.equal(getEmptyNeed(ready.logistics!.ports[3]), 0);
  assert.deepEqual(ready.logistics!.deliveries, { linh: 0, minh: 1 });
  const request = { type: 'RETURN_CARGO_TO_YARD', tileId: 0, bookingId: original.bookingId, revision: ready.cargoRevision! } as const;
  const returned = dispatch(ready, request, 'linh');
  assert.deepEqual(returned.events, [{ type: 'CARGO_RETURNED_TO_YARD', playerId: 'linh', tileId: 0,
    bookingId: original.bookingId, kind: 'empty', destinationTileId: 3 }]);
  assert.deepEqual(getReturnCargoToYardAction(ready, 'linh'), request);
  const state = returned.state;
  const yard = ready.logistics!.ports[0];
  assert.deepEqual(state.logistics!.ports[0], { ...yard, empties: yard.empties + 1 });
  assert.deepEqual(state.logistics!.ports[3], ready.logistics!.ports[3]);
  assert.deepEqual(state.logistics!.deliveries, ready.logistics!.deliveries);
  assert.deepEqual(state.logistics!.emptyDeliveries, ready.logistics!.emptyDeliveries);
  assert.deepEqual(state.logistics!.voyageLog, ready.logistics!.voyageLog);
  assert.equal(state.players[0].cargo, undefined);
  assert.equal(state.players[0].balance, 0);
  assert.equal(state.players[0].lastDelivery, undefined);
  assert.equal(state.logistics!.earnings.linh, 0);
  reject(state, request);
  const replacement = book(state, 3);
  assert.notEqual(replacement.players[0].cargo?.bookingId, original.bookingId);
  reject(replacement, { ...request, revision: replacement.cargoRevision! });
  const paid = discharge(sail(replacement, 3));
  assert.equal(paid.players[0].balance, 12);
  assert.deepEqual(paid.logistics!.deliveries, { linh: 1, minh: 1 });
  assert.deepEqual(paid.logistics!.emptyDeliveries, { linh: 0, minh: 1 });
});

test('returning a dry amended booking restores export stock and releases its held truck exactly once', () => {
  const loaded = book(fresh(), 17);
  const amend = getCargoRedirections(loaded, 'linh').find(choice => choice.tileId === 1)!;
  const amended = apply(loaded, amend.action);
  const held = apply(amended, getReserveImportTruckAction(amended, 'linh')!);
  assert.equal(held.logistics!.ports[1].demand, 0);
  const request = returnAction(held);
  const { state, events } = dispatch(held, request, 'linh');
  assert.deepEqual(events, [{ type: 'CARGO_RETURNED_TO_YARD', playerId: 'linh', tileId: 0,
    bookingId: loaded.players[0].cargo!.bookingId, kind: 'laden', destinationTileId: 1 }]);
  const expected = structuredClone(held);
  expected.cargoRevision = request.revision + 1;
  delete expected.players[0].cargo;
  delete expected.logistics!.importTruckReservations!.linh;
  expected.logistics!.ports[0].supply++;
  expected.logistics!.ports[1].demand++;
  assert.deepEqual(state, expected);
  assert.equal(state.logistics!.importTruckAvailable!.linh, false);
  assert.equal(getImportTruckReservation(state, 'linh'), null);
  reject(state, { ...request, revision: state.cargoRevision! });
  const replacement = book(state, 1);
  assert.equal(getReserveImportTruckAction(replacement, 'linh'), null);
});

test('returning refrigerated cargo adds a public export, keeps the spent cold slot and earns no premium', () => {
  const cold = book(fresh(), 17, 'laden', true);
  const returned = dispatch(cold, returnAction(cold), 'linh');
  assert.deepEqual(returned.events, [{ type: 'CARGO_RETURNED_TO_YARD', playerId: 'linh', tileId: 0,
    bookingId: cold.players[0].cargo!.bookingId, kind: 'laden', destinationTileId: 17, reeferDueRound: 1 }]);
  const state = returned.state;
  assert.equal(state.logistics!.ports[0].supply, cold.logistics!.ports[0].supply + 1);
  assert.equal(state.players[0].balance, 0);
  assert.equal(state.logistics!.earnings.linh, 0);
  assert.deepEqual(state.logistics!.voyageLog, []);
  assert.equal(state.logistics!.reeferSlots![0], 1);
  assert.deepEqual(getCargoBookings(state, 'linh', 'laden', true), []);
  const rival = end(state);
  assert.deepEqual(getCargoBookings(rival, 'minh', 'laden', true), []);
  // Minh can take ordinary export stock, and next round replenishes the reefer slot normally.
  const nextRound = end(book(rival, 1));
  assert.ok(getCargoBookings(nextRound, 'linh', 'laden', true).some(choice => choice.tileId === 17));
});

test('a booking can return on a later visit to its loading berth, but never from another port or with a stale request', () => {
  const loaded = book(fresh(), 17);
  const request = returnAction(loaded);
  assert.equal(getReturnCargoToYardAction(loaded, 'minh'), null);
  reject(loaded, request, 'minh');
  reject(loaded, { ...request, tileId: 17 });
  reject(loaded, { ...request, bookingId: request.bookingId + 1 });
  const forged = { ...request, kind: 'empty', destinationTileId: 3 };
  reject(loaded, forged);
  const away = sail(loaded, 1);
  assert.equal(getReturnCargoYardStatus(away, 'linh'), null);
  assert.equal(getReturnCargoToYardAction(away, 'linh'), null);
  reject(away, { ...request, revision: away.cargoRevision! });
  reject(away, { ...request, tileId: 1, revision: away.cargoRevision! });
  const connector = getFeederRoutes(away, 'linh').find(leg => leg.tileId === 0)!;
  const revisited = apply(away, connector.action);
  reject(revisited, request);
  assert.equal(revisited.phase, 'END_OF_TURN');
  const returned = apply(revisited, returnAction(revisited));
  assert.equal(returned.players[0].cargo, undefined);
  assert.equal(returned.logistics!.hasSailed, true);
  assert.equal(returned.logistics!.feederAvailable!.linh, false);
  assert.equal(returned.phase, 'END_OF_TURN');
  assert.equal(returned.players[0].balance, 0);
});

test('only available space for the returned kind matters, and a full yard keeps the original booking aboard', () => {
  for (const kind of ['laden', 'empty'] as const) {
    const loaded = book(fresh(), 3, kind);
    const request = returnAction(loaded);
    const yard = loaded.logistics!.ports[0];
    const counter = kind === 'laden' ? 'supply' : 'empties';
    const other = kind === 'laden' ? 'empties' : 'supply';
    yard[counter] = 4;
    yard[other] = 0;
    assert.equal(getReturnCargoYardStatus(loaded, 'linh'), 'full');
    assert.equal(getReturnCargoToYardAction(loaded, 'linh'), null);
    reject(loaded, request);
    assert.equal(loaded.players[0].cargo?.bookingId, request.bookingId);
    yard[counter] = 3;
    yard[other] = 4;
    assert.equal(getReturnCargoYardStatus(loaded, 'linh'), 'available');
    const accepted = apply(loaded, returnAction(loaded));
    assert.deepEqual(accepted.logistics!.ports[0], { ...yard, [counter]: 4 });
  }
});

test('returning cargo preserves an active backhaul and tender for a later qualifying delivery', () => {
  const opening = fresh();
  opening.players[0].position = 17; // Start at Busan to set up a return contract to the round-one tender port.
  let ready = discharge(sail(book(opening, 0), 0));
  ready = apply(ready, getAcceptBackhaulAction(ready, 'linh')!);
  ready = apply(ready, getTenderBidAction(ready, 'linh', 7)!);
  ready = book(end(end(ready)), 17);
  const returned = apply(ready, returnAction(ready));
  assert.deepEqual(returned.players[0].lastDelivery, ready.players[0].lastDelivery);
  assert.deepEqual(returned.players[0].backhaul, ready.players[0].backhaul);
  assert.equal(returned.players[0].backhaul?.status, 'active');
  assert.deepEqual(returned.logistics!.market, ready.logistics!.market);
  assert.equal(returned.logistics!.market?.contract?.status, 'active');
  assert.deepEqual(returned.logistics!.voyageLog, ready.logistics!.voyageLog);
  assert.equal(returned.players[0].balance, 16);
  const settled = discharge(sail(book(returned, 17), 17));
  const receipt = settled.players[0].lastDelivery!;
  assert.deepEqual([receipt.reward, receipt.backhaulBonus, receipt.tenderBonus], [16, 6, 7]);
  assert.equal(settled.players[0].balance, 45);
  assert.equal(settled.logistics!.deliveries.linh, 2);
});

test('old freight bookings remain returnable while classic, inactive and unladen captains cannot return cargo', () => {
  const oldRoom = book(fresh(), 3);
  delete oldRoom.logistics!.importTruckReservations;
  delete oldRoom.logistics!.importTruckAvailable;
  delete oldRoom.logistics!.voyageLog;
  const restored: GameState = JSON.parse(JSON.stringify(oldRoom));
  const request = returnAction(restored);
  assert.equal(apply(restored, request).logistics!.voyageLog, undefined);
  for (const state of [createGame('classic', seats), fresh(), { ...restored, winnerId: 'linh' }, { ...restored, gameStarted: false }]) {
    assert.equal(getReturnCargoToYardAction(state, 'linh'), null);
    reject(state, { ...request, revision: state.cargoRevision ?? 0 });
  }
});
