import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoOpportunity, getEarlyTruckCalls, getFeederRoutes, getFreightQuote, getLogisticsRoutes,
  getLogisticsStandings, getPortTruckSchedule, getReserveImportTruckAction, getStreetTurnAction, getVoyagePayment,
  isFinalLogisticsRound, LOGISTICS_PORT_CAPACITY, OneMonopolyEngine, type CargoKind, type GameAction, type GameState,
} from '../src/index.js';

const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const fresh = () => OneMonopolyEngine.createGame('street-turn', seats, 'logistics');
const active = (s: GameState) => s.players[s.activePlayerIndex].id;
function act(s: GameState, action: GameAction) {
  const result = OneMonopolyEngine.dispatch(s, action, active(s));
  assert.notEqual(result.state, s, action.type);
  return result;
}
function reject(s: GameState, action: GameAction, playerId = active(s)) {
  const result = OneMonopolyEngine.dispatch(s, action, playerId);
  assert.equal(result.state, s);
  assert.deepEqual(result.events, []);
}
const end = (s: GameState) => act(s, { type: 'END_TURN' }).state;
function load(s: GameState, to: number, kind: CargoKind = 'laden', reefer = false) {
  const choice = getCargoBookings(s, active(s), kind, reefer).find(o => o.tileId === to);
  assert.ok(choice);
  return act(s, choice.action).state;
}
function sail(s: GameState, to: number) {
  const route = getLogisticsRoutes(s, active(s)).find(o => o.tileId === to);
  assert.ok(route);
  return act(s, route.action).state;
}
function normal(s: GameState) {
  const action = getCargoOpportunity(s, active(s))?.action;
  assert.ok(action?.type === 'UNLOAD_CARGO');
  return action;
}
function street(s: GameState) {
  const alternative = getStreetTurnAction(s, active(s));
  assert.ok(alternative);
  assert.deepEqual(alternative, { ...normal(s), streetTurn: true });
  return alternative;
}

test('settles one dry import: ordinary discharge releases an empty, a street turn supplies one public export, and neither loads the ship', () => {
  const ready = sail(load(fresh(), 1), 1);
  const before = structuredClone(ready);
  const stock = before.logistics!.ports[1];
  const plain = act(ready, normal(ready));
  const paired = act(ready, street(ready));
  assert.deepEqual(ready, before);
  assert.deepEqual(ready.logistics!.streetTurnAvailable, { a: true, b: true });
  assert.deepEqual(plain.state.logistics!.ports[1], { ...stock, empties: stock.empties + 1, demand: stock.demand - 1 });
  assert.deepEqual(paired.state.logistics!.ports[1], { ...stock, supply: stock.supply + 1, demand: stock.demand - 1 });
  assert.deepEqual(plain.state.logistics!.streetTurnAvailable, { a: true, b: true });
  assert.deepEqual(paired.state.logistics!.streetTurnAvailable, { a: false, b: true });
  const fee = getFreightQuote(0, 1)!.reward;
  const ordinaryReceipt = plain.state.players[0].lastDelivery!;
  const pairedReceipt = paired.state.players[0].lastDelivery!;
  assert.deepEqual(pairedReceipt, { ...ordinaryReceipt, streetTurn: true });
  assert.deepEqual(paired.events.find(e => e.type === 'CARGO_UNLOADED'), { type: 'CARGO_UNLOADED', playerId: 'a', ...pairedReceipt });
  assert.deepEqual(paired.state.logistics!.voyageLog, [{ ...plain.state.logistics!.voyageLog![0], streetTurn: true }]);
  assert.ok(!('streetTurn' in ordinaryReceipt) && !('streetTurn' in plain.state.logistics!.voyageLog![0]));
  for (const { state, events } of [plain, paired]) {
    assert.equal(state.players[0].cargo, undefined);
    assert.equal(state.players[0].balance, fee);
    assert.deepEqual(state.logistics!.deliveries, { a: 1, b: 0 });
    assert.deepEqual(state.logistics!.emptyDeliveries, { a: 0, b: 0 });
    assert.equal(state.logistics!.earnings.a, fee);
    assert.deepEqual(events.filter(e => e.type === 'BALANCE_CHANGED').map(e => [e.playerId, e.delta]), [['a', fee]]);
    assert.equal(events.some(e => e.type === 'CARGO_LOADED'), false);
    assert.equal(state.phase, ready.phase);
  }
  assert.equal(getVoyagePayment(paired.state.logistics!.voyageLog![0]), fee);
  reject(paired.state, street(ready));
  reject(paired.state, { ...street(ready), revision: paired.state.cargoRevision! });
  reject(paired.state, { ...normal(ready), revision: paired.state.cargoRevision! });
});

test('allows a direct transfer even at a full empty yard and refuses a full export queue without changing ordinary discharge', () => {
  const ready = sail(load(fresh(), 1), 1);
  const yard = ready.logistics!.ports[1];
  Object.assign(yard, { empties: LOGISTICS_PORT_CAPACITY, supply: LOGISTICS_PORT_CAPACITY - 1 });
  const completed = act(ready, street(ready)).state;
  assert.deepEqual(completed.logistics!.ports[1], { ...yard, demand: 0, supply: LOGISTICS_PORT_CAPACITY });
  yard.supply = LOGISTICS_PORT_CAPACITY;
  assert.equal(getStreetTurnAction(ready, 'a'), null);
  reject(ready, { ...normal(ready), streetTurn: true });
  const ordinary = act(ready, normal(ready)).state;
  assert.deepEqual(ordinary.logistics!.ports[1], { ...yard, demand: 0 });
  assert.equal(ordinary.logistics!.streetTurnAvailable!.a, true);
});

test('a held truck and a shipper’s private truck both permit a dry street turn without changing the payout or the endgame', () => {
  const original = load(fresh(), 3);
  const appointment = act(original, getReserveImportTruckAction(original, 'a')!).state;
  assert.equal(appointment.logistics!.ports[3].demand, 1);
  const arrived = sail(appointment, 3);
  const usingHold = act(arrived, street(arrived)).state;
  assert.equal(usingHold.logistics!.ports[3].demand, 1);
  assert.deepEqual(usingHold.logistics!.importTruckReservations, {});
  const contracted = sail(original, 3);
  const requested = street(contracted);
  contracted.logistics!.ports[3].demand = 0;
  assert.equal(getStreetTurnAction(contracted, 'a'), null);
  reject(contracted, requested);
  contracted.logistics!.market!.contract = { tenderId: 6, deliveryRound: 1, playerId: 'a',
    destinationTileId: 3, kind: 'laden', amount: 9, status: 'active' };
  contracted.players[0].backhaul = { bookingId: 96, originTileId: 0, destinationTileId: 3, offeredRound: 1, deadlineRound: 1, status: 'active' };
  contracted.logistics!.deliveries.a = 2;
  const plain = act(contracted, normal(contracted)).state;
  const paired = act(contracted, street(contracted)).state;
  const paid = paired.players[0].lastDelivery!;
  assert.deepEqual([paid.reward, paid.tenderBonus, paid.backhaulBonus], [12, 9, 6]);
  assert.deepEqual(paid, { ...plain.players[0].lastDelivery, streetTurn: true });
  assert.equal(paired.logistics!.ports[3].demand, 0);
  assert.equal(paired.logistics!.deliveries.a, 3);
  assert.equal(paired.players[0].balance, 27);
  assert.deepEqual(paired.logistics!.market, plain.logistics!.market);
  assert.deepEqual(paired.players[0].lastBackhaul, plain.players[0].lastBackhaul);
  assert.ok(isFinalLogisticsRound(paired));
  assert.deepEqual(getLogisticsStandings(paired), getLogisticsStandings(plain));
  assert.equal(end(end(paired)).winnerId, 'a');
});

test('lets either captain book the new public export with the normal load action and spends each street-turn allowance independently', () => {
  const opening = fresh();
  opening.logistics!.ports[1].supply = 0;
  const arrived = sail(load(opening, 1), 1);
  const discharged = act(arrived, street(arrived)).state;
  const rival = sail(end(discharged), 1);
  for (const [berthed, captain] of [[discharged, 'a'], [rival, 'b']] as const) {
    const loaded = load(berthed, 0);
    assert.equal(loaded.logistics!.ports[1].supply, 0);
    const cargo = loaded.players[loaded.activePlayerIndex].cargo!;
    assert.equal(cargo.originTileId, 1);
    assert.notEqual(cargo.bookingId, discharged.players[0].lastDelivery!.bookingId);
    const route = getFeederRoutes(loaded, captain).find(o => o.tileId === 0)!;
    const home = act(loaded, route.action).state;
    if (captain === 'a') {
      assert.equal(getStreetTurnAction(home, captain), null);
      reject(home, { ...normal(home), streetTurn: true });
      assert.equal(act(home, normal(home)).state.logistics!.deliveries.a, 2);
    } else {
      const result = act(home, street(home)).state;
      assert.deepEqual(result.logistics!.streetTurnAvailable, { a: false, b: false });
      assert.deepEqual(result.logistics!.deliveries, { a: 1, b: 1 });
    }
  }
});

test('the Valencia street turn leaves the scheduled export and once-only early truck call independent', () => {
  const ready = sail(load(fresh(), 12), 12);
  const original = { ...ready.logistics!.ports[12] };
  const paired = act(ready, street(ready)).state;
  assert.deepEqual(paired.logistics!.earlyTruckAvailable, ready.logistics!.earlyTruckAvailable);
  assert.deepEqual(paired.logistics!.calledTrucks, {});
  const forecast = getPortTruckSchedule(paired, 12)!;
  const early = getEarlyTruckCalls(paired, 'a').find(c => c.operation === 'export')!;
  assert.deepEqual(early.after, { ...original, supply: original.supply + 2, empties: original.empties - 1, demand: original.demand - 1 });
  assert.deepEqual(forecast.projected, early.after);
  const called = act(paired, early.action).state;
  assert.deepEqual(called.logistics!.calledTrucks?.[12], ['export']);
  assert.equal(called.logistics!.earlyTruckAvailable!.a, false);
  assert.deepEqual(end(end(called)).logistics!.ports[12], forecast.projected);
  assert.deepEqual(end(end(paired)).logistics!.ports[12], forecast.projected);
});

test('rejects wrong actor, stale or mismatched booking, legacy room, empty shipments, reefers and malformed runtime flags', () => {
  const source = load(fresh(), 1);
  assert.equal(getStreetTurnAction(source, 'a'), null);
  const docked = sail(source, 1);
  const action = street(docked);
  reject(source, { ...action, revision: source.cargoRevision! });
  reject(docked, action, 'b');
  reject(docked, { ...action, revision: action.revision - 1 });
  reject(docked, { ...action, bookingId: action.bookingId + 1 });
  reject(docked, { ...action, originTileId: 3 });
  reject(docked, { ...action, tileId: 3 });
  for (const invalid of [false, 'true', null, 1]) {
    reject(docked, { ...action, streetTurn: invalid } as unknown as GameAction);
  }
  const legacy = structuredClone(docked);
  delete legacy.logistics!.streetTurnAvailable;
  const dryClassic = OneMonopolyEngine.createGame('classic', seats, 'classic');
  assert.equal(getStreetTurnAction(dryClassic, 'a'), null);
  reject(dryClassic, action);
  for (const ineligible of [legacy, sail(load(fresh(), 1, 'empty'), 1), sail(load(fresh(), 1, 'laden', true), 1)]) {
    assert.equal(getStreetTurnAction(ineligible, 'a'), null);
    const basic = normal(ineligible);
    reject(ineligible, { ...basic, streetTurn: true });
    const delivered = act(ineligible, basic).state;
    assert.equal(delivered.logistics!.deliveries.a, 1);
    assert.equal(delivered.players[0].lastDelivery?.streetTurn, undefined);
    if (ineligible === legacy) assert.equal(delivered.logistics!.streetTurnAvailable, undefined);
  }
});
