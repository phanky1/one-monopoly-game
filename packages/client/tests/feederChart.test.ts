import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARD_TILES, getAcceptBackhaulAction, getCargoBookings, getCargoOpportunity, getFeederRoutes, getLogisticsRoutes,
  getReserveImportTruckAction, getTenderBidAction, OneMonopolyEngine,
  type CargoKind, type GameAction, type GameState,
} from '@one-monopoly/shared';
import { getFeederChart } from '../src/components/ports/feederChart.js';
import { portGuide } from '../src/components/ports/portGuide.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'minh', name: 'Minh', token: 'PILOT_BOAT' as const },
];
const fresh = () => createGame('feeder-chart', seats, 'logistics');
const captainId = (state: GameState) => state.players[state.activePlayerIndex].id;
function act(state: GameState, action: GameAction) {
  const result = dispatch(state, action, captainId(state));
  assert.notEqual(result.state, state, action.type);
  return result.state;
}
function book(state: GameState, destination: number, kind: CargoKind = 'laden', reefer = false) {
  const choice = getCargoBookings(state, captainId(state), kind, reefer).find(row => row.tileId === destination);
  assert.ok(choice);
  return act(state, choice.action);
}
function sail(state: GameState, destination: number) {
  const route = getLogisticsRoutes(state, captainId(state)).find(row => row.tileId === destination);
  assert.ok(route);
  return act(state, route.action);
}
function chart(state: GameState) {
  const view = getFeederChart(state, 'linh', state.players[0].position);
  assert.ok(view);
  return view;
}
function discharge(state: GameState) {
  const action = getCargoOpportunity(state, captainId(state))?.action;
  assert.ok(action?.type === 'UNLOAD_CARGO');
  return act(state, action);
}

test('opening and inspecting the chart lists only canonical legs without spending the feeder or moving cargo', () => {
  const state = sail(fresh(), 1);
  const before = structuredClone(state);
  const view = chart(state);
  assert.deepEqual(view.origin, portGuide.VNSGN);
  assert.equal(view.captainName, 'Linh');
  assert.equal(view.preferredTileId, 3);
  assert.equal(view.departureDelivery, null);
  assert.deepEqual(view.options.map(row => [row.tileId, row.distanceNm, row.action]),
    getFeederRoutes(state, 'linh').map(row => [row.tileId, row.distanceNm, row.action]));
  for (const row of view.options) {
    assert.deepEqual(row.port, portGuide[BOARD_TILES[row.tileId].code]);
    assert.deepEqual({ supply: row.supply, demand: row.demand, empties: row.empties, emptyTarget: row.emptyTarget },
      state.logistics!.ports[row.tileId]);
    assert.equal(row.cargoStatus, 'empty-hold');
    assert.equal(row.payment, null);
  }
  assert.deepEqual(state, before);
  const chosen = view.options.find(row => row.tileId === 3)!;
  const sailed = dispatch(state, chosen.action, 'linh');
  assert.deepEqual(sailed.events, [{ type: 'SHIP_STEPPED', playerId: 'linh', from: 1, to: 3, feeder: true }]);
  assert.equal(sailed.state.logistics!.feederAvailable!.linh, false);
  assert.equal(sailed.state.players[0].balance, 0);
});

test('a payable feeder shows the whole booking rate and each earned bonus at a private receiving berth', () => {
  const opening = fresh();
  opening.players[0].position = 17; // This fixture starts Linh at Busan with one public truck.
  opening.logistics!.ports[17].demand = 1;
  let state = discharge(sail(book(opening, 0), 0));
  state = act(state, getAcceptBackhaulAction(state, 'linh')!);
  state = act(state, getTenderBidAction(state, 'linh', 7)!);
  state = act(state, { type: 'END_TURN' });
  state = discharge(sail(book(state, 17), 17)); // Minh consumes Busan's public receiver.
  state = act(state, { type: 'END_TURN' });
  state = sail(book(state, 17, 'laden', true), 31); // Singapore booking, last leg from Tokyo.
  const view = chart(state);
  assert.equal(view.departureDelivery, null);
  const busan = view.options.find(row => row.tileId === 17)!;
  assert.equal(view.preferredTileId, 17);
  assert.deepEqual([busan.distanceNm, busan.demand, busan.cargoStatus, busan.payment], [527, 0, 'deliver', 37]);
  const arrival = act(state, busan.action);
  assert.equal(arrival.players[0].balance, state.players[0].balance);
  const paid = discharge(arrival);
  const receipt = paid.players[0].lastDelivery!;
  assert.deepEqual([receipt.distanceNm, receipt.reward, receipt.reeferBonus, receipt.tenderBonus, receipt.backhaulBonus],
    [2472, 16, 8, 7, 6]);
  assert.equal(paid.players[0].balance - state.players[0].balance, busan.payment);
});

test('empty equipment earns the empty rate and an already filled yard blocks payment without blocking travel', () => {
  const loaded = sail(book(fresh(), 17, 'empty'), 31);
  const option = chart(loaded).options.find(row => row.tileId === 17)!;
  assert.deepEqual([option.cargoStatus, option.distanceNm, option.payment], ['deliver', 527, 8]);
  const paid = discharge(act(loaded, option.action));
  assert.equal(paid.players[0].lastDelivery!.distanceNm, 2472);
  assert.equal(paid.players[0].balance, 8);

  const blocked = structuredClone(loaded);
  const stock = blocked.logistics!.ports[17];
  stock.empties = stock.emptyTarget;
  const unavailable = chart(blocked).options.find(row => row.tileId === 17)!;
  assert.deepEqual([unavailable.cargoStatus, unavailable.payment], ['blocked', null]);
  const arrived = act(blocked, unavailable.action);
  assert.equal(getCargoOpportunity(arrived, 'linh'), null);
  assert.deepEqual(arrived.players[0].cargo, loaded.players[0].cargo);
});

test('departure warning matches a payable local discharge while sailing keeps the original manifest', () => {
  const loaded = book(fresh(), 1, 'laden', true);
  const held = act(loaded, getReserveImportTruckAction(loaded, 'linh')!);
  const ready = sail(held, 1);
  assert.equal(ready.logistics!.ports[1].demand, 0);
  const view = chart(ready);
  assert.equal(view.departureDelivery, 20);
  assert.equal(view.departureDelivery, discharge(ready).players[0].balance);
  assert.ok(view.options.every(row => row.cargoStatus === 'aboard' && row.payment === null));
  const continued = act(ready, view.options[0].action);
  assert.deepEqual(continued.players[0].cargo, ready.players[0].cargo);
  assert.equal(continued.players[0].balance, 0);
  assert.equal(continued.logistics!.deliveries.linh, 0);

  const elsewhere = sail(book(fresh(), 17), 1);
  const other = chart(elsewhere);
  assert.equal(other.departureDelivery, null);
  assert.ok(other.options.every(row => row.cargoStatus === 'aboard' && row.payment === null));
  assert.equal(other.preferredTileId, 3); // Booked Busan is out of range.
  const atBlockedBerth = sail(book(fresh(), 1), 1);
  atBlockedBerth.logistics!.ports[1].demand = 0;
  assert.equal(chart(atBlockedBerth).departureDelivery, null);
});

test('the booked berth stays selected ahead of a closer leg even if its last import truck is gone', () => {
  const state = sail(book(fresh(), 19), 1);
  state.logistics!.ports[19].demand = 0;
  const view = chart(state);
  assert.equal(view.options[0].tileId, 3);
  assert.equal(view.preferredTileId, 19);
  const booked = view.options.find(row => row.tileId === 19)!;
  assert.deepEqual([booked.distanceNm, booked.cargoStatus, booked.payment], [829, 'blocked', null]);
  assert.ok(view.options.filter(row => row.tileId !== 19).every(row => row.cargoStatus === 'aboard' && row.payment === null));
});

test('the chart requires the current seat, berth and unspent feeder and refreshes stale sailing revisions', () => {
  const initial = fresh();
  assert.equal(getFeederChart(initial, 'linh', 0), null);
  const available = sail(initial, 1);
  assert.equal(getFeederChart(available, 'minh', 1), null);
  assert.equal(getFeederChart(available, 'absent', 1), null);
  assert.equal(getFeederChart(available, 'linh', 3), null);
  const stale = chart(available).options[0];
  const repriced = act(available, getTenderBidAction(available, 'linh', 6)!);
  const rejected = dispatch(repriced, stale.action, 'linh');
  assert.equal(rejected.state, repriced);
  assert.deepEqual(rejected.events, []);
  const refreshed = chart(repriced).options.find(row => row.tileId === stale.tileId)!;
  assert.equal(refreshed.action.revision, repriced.cargoRevision);
  const spent = act(repriced, refreshed.action);
  assert.equal(getFeederChart(spent, 'linh', refreshed.tileId), null);
  const legacy = structuredClone(available);
  delete legacy.logistics!.feederAvailable;
  for (const state of [legacy, { ...available, winnerId: 'linh' }, createGame('classic', seats, 'classic'), sail(initial, 27)]) {
    assert.equal(getFeederChart(state, 'linh', state.players[0].position), null);
  }
});
