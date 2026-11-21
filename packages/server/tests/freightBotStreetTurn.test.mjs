import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoOpportunity, getFeederRoutes, getLogisticsRoutes,
  getStreetTurnAction, OneMonopolyEngine,
} from '@one-monopoly/shared';
import { getFreightBotAction } from '../dist/freightBot.js';
import { gameStateForPlayer } from '../dist/roomManager.js';

const pilot = 'pilot';
const seats = [{ id: pilot, name: 'Hoa tiêu', token: 'BUNKER_BARGE' }, { id: 'ship', name: 'An', token: 'PILOT_BOAT' }];
const singapore = 0, laemChabang = 5;
function apply(state, action) {
  const result = OneMonopolyEngine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.ok(result.events.length, JSON.stringify(action));
  return result.state;
}
function arrival({ port = laemChabang, spentFeeder = false, kind = 'laden', reefer = false } = {}) {
  let state = OneMonopolyEngine.createGame('street-turn-bot', seats, 'logistics');
  const booking = getCargoBookings(state, pilot, kind, reefer).find(choice => choice.tileId === port);
  state = apply(state, booking.action);
  const mainLeg = spentFeeder ? 3 : port;
  state = apply(state, getLogisticsRoutes(state, pilot).find(route => route.tileId === mainLeg).action);
  return spentFeeder ? apply(state, getFeederRoutes(state, pilot).find(route => route.tileId === port).action) : state;
}
function choose(state, style = 'coastal') {
  return getFreightBotAction(gameStateForPlayer(state, state.players[state.activePlayerIndex].id), style);
}
function follow(state, type) {
  const action = choose(state);
  assert.equal(action.type, type);
  return apply(state, action);
}

test('a coastal rival reuses a dry box in a bare yard, books the return and earns its backhaul on a real feeder', () => {
  let state = arrival();
  assert.equal(state.logistics.ports[laemChabang].supply, 0);
  const before = structuredClone(state);
  const reuse = choose(state);
  assert.equal(reuse.streetTurn, true);
  assert.deepEqual(reuse, getStreetTurnAction(state, pilot));
  assert.deepEqual(state, before);
  state = apply(state, reuse);
  assert.equal(state.logistics.ports[laemChabang].supply, 1);
  assert.equal(state.logistics.ports[laemChabang].empties, before.logistics.ports[laemChabang].empties);
  assert.equal(state.players[0].cargo, undefined);
  state = follow(state, 'ACCEPT_BACKHAUL');
  state = follow(state, 'LOAD_CARGO');
  assert.deepEqual([state.players[0].cargo.destinationTileId, state.players[0].cargo.kind], [singapore, 'laden']);
  state = follow(state, 'SAIL_FEEDER');
  state = follow(state, 'UNLOAD_CARGO');
  assert.equal(state.players[0].lastBackhaul.status, 'fulfilled');
  assert.equal(state.logistics.deliveries[pilot], 2);
  assert.equal(state.logistics.streetTurnAvailable.ship, true);
});

test('with no feeder, the coastal captain preloads the return and delivers on its next normal sailing', () => {
  let state = arrival({ spentFeeder: true });
  const reuse = choose(state);
  assert.equal(reuse.streetTurn, true);
  state = apply(state, reuse);
  state = follow(state, 'ACCEPT_BACKHAUL');
  state = follow(state, 'LOAD_CARGO');
  assert.equal(state.players[0].cargo.destinationTileId, singapore);
  state = apply(state, { type: 'END_TURN' });
  state = apply(state, { type: 'END_TURN' });
  state = follow(state, 'SAIL_TO_PORT');
  state = follow(state, 'UNLOAD_CARGO');
  assert.equal(state.players[0].lastBackhaul.status, 'fulfilled');
});

test('an expiring return can use a remaining feeder, but a delivery that ends the game this round cannot expect another turn', () => {
  for (const spentFeeder of [true, false]) {
    const state = arrival({ spentFeeder });
    state.logistics.deliveries[pilot] = 2;
    const action = choose(state);
    assert.equal(action.type, 'UNLOAD_CARGO');
    assert.equal(action.streetTurn === true, !spentFeeder);
  }
});

test('a dry import held overnight can make a return on the last regular sailing without any feeder', () => {
  let state = arrival({ spentFeeder: true });
  state = apply(state, { type: 'END_TURN' });
  state = apply(state, { type: 'END_TURN' });
  state.logistics.deliveries[pilot] = 2;
  const reuse = choose(state);
  assert.equal(reuse.streetTurn, true);
  state = apply(state, reuse);
  state = follow(state, 'ACCEPT_BACKHAUL');
  state = follow(state, 'LOAD_CARGO');
  state = follow(state, 'SAIL_TO_PORT');
  state = follow(state, 'UNLOAD_CARGO');
  assert.equal(state.players[0].lastBackhaul.status, 'fulfilled');
  assert.equal(state.logistics.feederAvailable[pilot], false);
});

test('equipment and standard keep the empty; coastal skips an unneeded export or a return with no public receiver', () => {
  const state = arrival();
  const ordinary = getCargoOpportunity(state, pilot).action;
  for (const style of ['equipment', 'standard']) {
    assert.deepEqual(choose(state, style), ordinary);
    const after = apply(state, choose(state, style));
    assert.equal(after.logistics.ports[laemChabang].empties, state.logistics.ports[laemChabang].empties + 1);
    assert.equal(after.logistics.streetTurnAvailable[pilot], true);
  }
  for (const supply of [1, 4]) {
    const stocked = structuredClone(state);
    stocked.logistics.ports[laemChabang].supply = supply;
    assert.deepEqual(choose(stocked), ordinary);
  }
  const noReceiver = structuredClone(state);
  noReceiver.logistics.ports[singapore].demand = 0;
  noReceiver.logistics.market.contract = { tenderId: 4, playerId: 'ship', kind: 'laden', destinationTileId: singapore,
    amount: 7, deliveryRound: 1, status: 'active' };
  assert.deepEqual(choose(noReceiver), ordinary);
  const noAllowance = structuredClone(state);
  noAllowance.logistics.streetTurnAvailable[pilot] = false;
  assert.deepEqual(choose(noAllowance), ordinary);
  for (const options of [{ port: 1, reefer: true }, { port: 1, kind: 'empty' }]) {
    const otherCargo = arrival(options);
    otherCargo.logistics.ports[1].supply = 0;
    assert.deepEqual(choose(otherCargo), getCargoOpportunity(otherCargo, pilot).action);
  }
});

test('a rival cannot use another captain’s direct reuse or observe the value of their sealed tender', () => {
  const state = arrival();
  let expected;
  for (const price of [4, 16]) {
    state.logistics.market.tender.bids.ship = price;
    state.logistics.market.tender.bidderIds = ['ship'];
    const view = gameStateForPlayer(state, pilot);
    assert.deepEqual(view.logistics.market.tender.bids, {});
    const action = getFreightBotAction(view, 'coastal');
    assert.equal(action.streetTurn, true);
    assert.equal(getStreetTurnAction(view, 'ship'), null);
    assert.deepEqual(OneMonopolyEngine.dispatch(state, action, 'ship').events, []);
    if (expected) assert.deepEqual(action, expected);
    expected = action;
  }
});
