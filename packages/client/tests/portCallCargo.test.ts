import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OneMonopolyEngine, getCargoBookings, getCargoOpportunity, getFeederRoutes, getLogisticsRoutes, getReserveImportTruckAction,
  type CargoKind, type GameAction, type GameEvent, type GameState,
} from '@one-monopoly/shared';
import { getPortCallCargo, getPortCallLoad } from '../src/components/ports/portCallCargo.js';
import type { PortLoad } from '../src/components/ports/portArrival.js';

const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const start = () => OneMonopolyEngine.createGame('call', seats, 'logistics');
function act(state: GameState, action: GameAction) {
  const result = OneMonopolyEngine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state, `expected ${action.type} to be accepted`);
  return result;
}
const load = (state: GameState, destination: number, kind: CargoKind = 'laden', reefer = false) =>
  act(state, getCargoBookings(state, 'a', kind, reefer).find(choice => choice.tileId === destination)!.action).state;
const sail = (state: GameState, destination: number) =>
  act(state, getLogisticsRoutes(state, 'a').find(route => route.tileId === destination)!.action).state;
const feeder = (state: GameState, destination: number) =>
  act(state, getFeederRoutes(state, 'a').find(route => route.tileId === destination)!.action).state;
const unloadEvent = (events: GameEvent[]) => events.find(e => e.type === 'CARGO_UNLOADED')!;

test('the quay uses the booked truck and leaves other waiting trucks available', () => {
  const departure = load(start(), 3);
  const held = act(departure, getReserveImportTruckAction(departure, 'a')!).state;
  const arrival = sail(held, 3);
  const call = getPortCallCargo(arrival, 3, 'a')!;
  assert.equal(call.receiver, 'appointment');
  assert.equal(call.estimate?.receiver, 'appointment');
  assert.equal(call.publicSlots, 1);
  assert.equal(call.stockAfterUnload?.demand, 1);
  const settled = act(arrival, call.unloadAction!);
  assert.deepEqual(call.stockAfterUnload, settled.state.logistics!.ports[3]);
});

test('an intermediate call offers a local diversion while the feeder arrival permits the booked container to discharge', () => {
  let state = sail(load(start(), 1), 3);
  const before = structuredClone(state);
  const detour = getPortCallCargo(state, 3, 'a')!;
  assert.equal(detour.cargoType, 'laden');
  assert.equal(detour.bookedHere, false);
  assert.deepEqual([detour.booking?.originTileId, detour.booking?.destinationTileId], [0,1]);
  assert.equal(detour.unloadAction, null);
  assert.equal(detour.stockAfterUnload, null);
  assert.equal(detour.redirectAction?.destinationTileId, 3);
  assert.equal(detour.estimate?.total, 12);
  assert.deepEqual(state, before);
  state = feeder(state, 1);
  const berth = getPortCallCargo(state, 1, 'a')!;
  assert.equal(berth.bookedHere, true);
  assert.equal(berth.redirectAction, null);
  assert.equal(berth.unloadAction?.type, 'UNLOAD_CARGO');
  const delivered = act(state, berth.unloadAction!);
  assert.deepEqual(berth.stockAfterUnload, delivered.state.logistics!.ports[1]);
  assert.equal(berth.estimate?.total, delivered.state.players[0].balance);
  const evidence = unloadEvent(delivered.events);
  assert.equal(getPortCallCargo(delivered.state, 1, 'a')?.receipt, null);
  const complete = getPortCallCargo(delivered.state, 1, 'a', evidence)!;
  assert.equal(complete.cargoType, null);
  assert.equal(complete.receipt?.bookingId, evidence.bookingId);
  assert.deepEqual(complete.stock, delivered.state.logistics!.ports[1]);
  assert.equal(getPortCallCargo(delivered.state, 1, 'a', {...evidence, bookingId:999})?.receipt, null);
  assert.equal(getPortCallCargo(delivered.state, 1, 'a', {...evidence, playerId:'b'})?.receipt, null);
});

test('the yard preview of a cold container uses its preserved origin and tender’s reserved receiving berth', () => {
  let state = sail(load(start(), 17, 'laden', true), 1);
  state.logistics!.ports[1].demand = 0;
  state.logistics!.ports[1].empties = 4;
  state.logistics!.market!.tender!.bids = { b: 13 };
  state.logistics!.market!.contract = { tenderId:3, deliveryRound:1, destinationTileId:1, kind:'laden', playerId:'a', amount:9, status:'active' };
  const away = getPortCallCargo(state, 1, 'a')!;
  assert.equal(away.cargoType, 'reefer');
  assert.equal(away.receiver, 'reserved');
  assert.equal(away.publicSlots, 0);
  assert.equal(away.estimate?.total, 29);
  const before = structuredClone(away);
  state.logistics!.market!.tender!.bids = { b: 4 };
  assert.deepEqual(getPortCallCargo(state, 1, 'a'), before);
  state = act(state, away.redirectAction!).state;
  assert.equal(state.players[0].balance, 0);
  const berth = getPortCallCargo(state, 1, 'a')!;
  assert.equal(berth.booking?.originTileId, 0);
  const delivered = act(state, berth.unloadAction!).state;
  assert.deepEqual(berth.stockAfterUnload, {supply:1, demand:0, empties:4, emptyTarget:2});
  assert.equal(delivered.players[0].balance, berth.estimate?.total);
});

test('an empty equipment delivery and an observer use the correct berth capacity and never borrow another captain’s actions', () => {
  let state = sail(load(start(), 1, 'empty'), 1);
  const owner = getPortCallCargo(state, 1, 'a')!;
  assert.equal(owner.cargoType, 'empty');
  assert.equal(owner.publicSlots, 2);
  assert.deepEqual(owner.stockAfterUnload, {supply:1, demand:1, empties:1, emptyTarget:2});
  state = act(state, {type:'END_TURN'}).state;
  const observer = getPortCallCargo(state, 1, 'a')!;
  assert.equal(observer.active, false);
  assert.equal(observer.receiver, 'public');
  assert.equal(observer.unloadAction, null);
  assert.equal(observer.redirectAction, null);
  assert.equal(observer.estimate, null);
  assert.equal(observer.stockAfterUnload, null);
  assert.equal(getPortCallCargo(state, 1, 'b'), null);
  assert.equal(getPortCallCargo(state, 0, 'b')?.booking, null);
});

test('unstarted, classic and finished games, remote berths, old receipts and non-terminal tiles are excluded', () => {
  const state = start();
  delete state.logistics!.market;
  delete state.logistics!.reeferSlots;
  delete state.logistics!.voyageLog;
  const arrived = sail(load(state, 1), 1);
  const delivery = act(arrived, getCargoOpportunity(arrived, 'a')!.action);
  const paid = delivery.state;
  const returned = feeder(paid, 3);
  assert.equal(getPortCallCargo(returned, 3, 'a', unloadEvent(delivery.events))?.receipt, null);
  assert.equal(getPortCallCargo(paid, 1, 'a')?.receipt, null);
  assert.equal(getPortCallCargo(paid, 3, 'a'), null);
  assert.equal(getPortCallCargo(paid, 1, 'absent'), null);
  for (const tile of [2, 99, -1, NaN]) assert.equal(getPortCallCargo(state, tile, 'a'), null);
  assert.equal(getPortCallCargo({...state, gameStarted:false}, 0, 'a'), null);
  assert.equal(getPortCallCargo({...state, winnerId:'a'}, 0, 'a'), null);
  assert.equal(getPortCallCargo(OneMonopolyEngine.createGame('classic', seats, 'classic'), 0, 'a'), null);
});

test('returning empty to the same port does not resurrect the previous call’s receipt', () => {
  const arrived = sail(load(start(), 1), 1);
  const paid = act(arrived, getCargoOpportunity(arrived, 'a')!.action);
  const left = feeder(paid.state, 3);
  const otherTurn = act(left, {type:'END_TURN'}).state;
  const nextRound = act(otherTurn, {type:'END_TURN'}).state;
  const revisit = sail(nextRound, 1);
  assert.equal(revisit.players[0].lastDelivery?.tileId, 1);
  assert.equal(getPortCallCargo(revisit, 1, 'a')?.receipt, null);
  const loadedAgain = load(revisit, 0);
  assert.equal(getPortCallCargo(loadedAgain, 1, 'a', unloadEvent(paid.events))?.receipt, null);
});

test('origin, non-refrigerated detours and a full empty yard expose no local reroute or unloading action', () => {
  const cold = load(start(), 17, 'laden', true);
  for (const [state, tileId] of [[cold, 0], [sail(cold, 3), 3]] as const) {
    const visit = getPortCallCargo(state, tileId, 'a')!;
    assert.equal(visit.receiver, 'unavailable');
    assert.equal(visit.estimate, null);
    assert.equal(visit.redirectAction, null);
    assert.equal(visit.unloadAction, null);
  }
  const empty = sail(load(start(), 1, 'empty'), 1);
  empty.logistics!.ports[1].empties = empty.logistics!.ports[1].emptyTarget;
  const blocked = getPortCallCargo(empty, 1, 'a')!;
  assert.equal(blocked.publicSlots, 0);
  assert.equal(blocked.receiver, 'unavailable');
  assert.equal(blocked.unloadAction, null);
  assert.equal(blocked.stockAfterUnload, null);
  assert.equal(blocked.estimate?.total, null);
});

function pickup(state: GameState, tileId: number, kind: CargoKind = 'laden', reefer = false) {
  const action = getCargoBookings(state, 'a', kind, reefer).find(choice => choice.tileId === tileId)!.action;
  const result = act(state, action);
  const event = result.events.find(item => item.type === 'CARGO_LOADED');
  assert.ok(event);
  return {state: result.state, event};
}

test('a confirmed local loading slip matches all cargo fields without moving the ship, paying or changing any yard', () => {
  for (const [kind, reefer, round] of [['laden', false, 1], ['empty', false, 1], ['laden', true, 1], ['laden', true, 0]] as const) {
    const initial = start();
    initial.turnCount = round;
    const { state, event } = pickup(initial, 1, kind, reefer);
    const snapshot = structuredClone(state);
    const call = getPortCallCargo(state, 0, 'a');
    assert.equal(getPortCallLoad(call, event), event);
    assert.equal(getPortCallLoad(call, null), null);
    for (const other of [
      {...event, playerId: 'b'}, {...event, tileId: 3}, {...event, originTileId: 3},
      {...event, destinationTileId: 3}, {...event, bookingId: event.bookingId + 1},
      {...event, kind: kind === 'empty' ? 'laden' as const : 'empty' as const},
      {...event, reeferDueRound: reefer ? undefined : 0},
    ]) assert.equal(getPortCallLoad(call, other), null);
    assert.deepEqual(state, snapshot);
    assert.equal(state.players[0].position, 0);
    assert.equal(state.players[0].balance, 0);
    assert.equal(state.logistics!.deliveries.a, 0);
    assert.deepEqual(state.logistics!.ports[1], initial.logistics!.ports[1]);
    assert.equal(state.logistics!.ports[0].supply, initial.logistics!.ports[0].supply - (kind === 'laden' ? 1 : 0));
    assert.equal(state.logistics!.ports[0].empties, initial.logistics!.ports[0].empties - (kind === 'empty' ? 1 : 0));
  }
});

test('an earlier slip cannot match a later booking with the same origin, destination and cargo service', () => {
  const first = pickup(start(), 3);
  const arrival = sail(first.state, 3);
  assert.equal(getPortCallLoad(getPortCallCargo(arrival, 3, 'a'), first.event), null);
  const discharged = act(arrival, getCargoOpportunity(arrival, 'a')!.action);
  assert.equal(getPortCallLoad(getPortCallCargo(discharged.state, 3, 'a'), first.event), null);
  const returned = feeder(discharged.state, 0);
  const later = pickup(returned, 3);
  const call = getPortCallCargo(later.state, 0, 'a');
  assert.notEqual(first.event.bookingId, later.event.bookingId);
  assert.equal(getPortCallLoad(call, first.event), null);
  assert.equal(getPortCallLoad(call, later.event), later.event);
});

test('a diversion before departure invalidates the original slip and another seat or ended match cannot reshow it', () => {
  const { state, event } = pickup(start(), 1);
  const changed = act(state, {type:'CHANGE_DESTINATION', bookingId: event.bookingId, destinationTileId: 3, revision: state.cargoRevision!});
  const call = getPortCallCargo(changed.state, 0, 'a');
  assert.equal(call?.booking?.bookingId, event.bookingId);
  assert.equal(getPortCallLoad(call, event), null);
  // A destination-change event shares the manifest fields but never represents a physical pickup.
  assert.equal(getPortCallLoad(call, changed.events[0] as PortLoad), null);
  const nextSeat = act(state, {type:'END_TURN'}).state;
  assert.equal(getPortCallLoad(getPortCallCargo(nextSeat, 0, 'a'), event), null);
  assert.equal(getPortCallLoad(getPortCallCargo(nextSeat, 0, 'b'), event), null);
  assert.equal(getPortCallLoad(getPortCallCargo({...state, winnerId:'a'}, 0, 'a'), event), null);
});
