import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FEEDER_RANGE_NM, getCargoBookings, getEmptyNeed, getFeederDistanceNm,
  getFreightQuote, getLogisticsRoutes, getReserveImportTruckAction, getVoyagePayment, OneMonopolyEngine,
} from '@one-monopoly/shared';
import { getFreightBotAction as choose } from '../dist/freightBot.js';

const pilot = 'pilot';
const seats = [{ id: pilot, name: 'Hoa tiêu', token: 'PILOT_BOAT' }, { id: 'human', name: 'An', token: 'ONE_APUS' }];
function opening(withTender = false) {
  const state = OneMonopolyEngine.createGame('rivals', seats, 'logistics');
  if (!withTender) state.logistics.market.tender = null;
  return state;
}
function apply(state, action) {
  const result = OneMonopolyEngine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state, JSON.stringify(action));
  return result.state;
}
const advance = (s, style) => apply(s, choose(s, style));
function sail(state, tileId) {
  return apply(state, getLogisticsRoutes(state, pilot).find(route => route.tileId === tileId).action);
}
function publicReceivers(state, ...ports) {
  for (const [id, yard] of Object.entries(state.logistics.ports)) {
    yard.demand = ports.includes(Number(id)) ? 1 : 0;
    yard.empties = yard.emptyTarget;
  }
}

test('the standard rival and an older match with no style both choose the unchanged export and cold-chain play', () => {
  let state = opening();
  const initial = choose(state);
  assert.equal(initial.type, 'LOAD_CARGO');
  assert.equal(initial.kind, 'laden');
  assert.equal(initial.reefer, true);
  for (let i = 0; i < 3; i++) {
    const action = choose(state);
    assert.deepEqual(choose(state, 'standard'), action);
    state = apply(state, action);
  }
  assert.equal(state.players[0].lastDelivery.kind, 'laden');
  assert.equal(state.players[0].lastDelivery.reeferBonus, 8);
});

test('equipment sends a surplus box to the largest real shortage; without an available box it hauls export cargo', () => {
  const start = opening();
  const yards = start.logistics.ports;
  for (const [id, yard] of Object.entries(yards)) if (id !== '0') yard.empties = yard.emptyTarget;
  Object.assign(yards[1], { empties: 0, emptyTarget: 3 });
  Object.assign(yards[21], { empties: 0, emptyTarget: 1 });
  const choice = choose(start, 'equipment');
  assert.deepEqual([choice.type, choice.kind, choice.destinationTileId], ['LOAD_CARGO', 'empty', 1]);
  let delivered = apply(start, choice);
  assert.equal(delivered.logistics.ports[0].empties, yards[0].empties - 1);
  delivered = advance(advance(delivered, 'equipment'), 'equipment');
  assert.equal(delivered.players[0].lastDelivery.tileId, 1);
  assert.equal(delivered.logistics.emptyDeliveries[pilot], 1);
  assert.equal(getEmptyNeed(delivered.logistics.ports[1]), 2);
  const withoutBox = structuredClone(start);
  withoutBox.logistics.ports[0].empties = withoutBox.logistics.ports[0].emptyTarget;
  const fallback = choose(withoutBox, 'equipment');
  assert.equal(fallback.type, 'LOAD_CARGO');
  assert.equal(fallback.kind, 'laden');
  assert.ok(apply(withoutBox, fallback).players[0].cargo);
});

test('coastal chooses a short payable service, and takes available deep-sea work when neighboring ports cannot receive', () => {
  const start = opening();
  publicReceivers(start, 1, 21);
  const near = choose(start, 'coastal');
  assert.deepEqual([near.type, near.kind, near.destinationTileId], ['LOAD_CARGO', 'laden', 1]);
  assert.ok(getFreightQuote(0, near.destinationTileId).distanceNm <= FEEDER_RANGE_NM);
  const done = advance(advance(apply(start, near), 'coastal'), 'coastal');
  assert.equal(done.players[0].lastDelivery.tileId, 1);
  const blocked = structuredClone(start);
  blocked.logistics.ports[1].demand = 0;
  const far = choose(blocked, 'coastal');
  assert.deepEqual([far.type, far.kind, far.destinationTileId], ['LOAD_CARGO', 'laden', 21]);
  assert.equal(getFeederDistanceNm(0, far.destinationTileId), null);
  assert.ok(apply(blocked, far).players[0].cargo);
});

test('coastal completes a paid ordinary dry shipment with the one feeder after its main sailing', () => {
  const start = opening();
  publicReceivers(start, 1, 21);
  let state = sail(start, 3);
  const load = choose(state, 'coastal');
  assert.deepEqual([load.type, load.kind, load.destinationTileId, load.reefer], ['LOAD_CARGO', 'laden', 1, undefined]);
  state = apply(state, load);
  const feeder = choose(state, 'coastal');
  assert.deepEqual([feeder.type, feeder.tileId], ['SAIL_FEEDER', 1]);
  const lostReceiver = structuredClone(state);
  lostReceiver.logistics.ports[1].demand = 0;
  assert.notEqual(choose(lostReceiver, 'coastal').type, 'SAIL_FEEDER');
  state = apply(state, feeder);
  assert.equal(state.logistics.feederAvailable[pilot], false);
  assert.equal(state.players[0].balance, 0);
  assert.equal(choose(state, 'coastal').type, 'UNLOAD_CARGO');
  state = advance(state, 'coastal');
  assert.equal(state.players[0].balance, getFreightQuote(3, 1).reward);
  assert.equal(state.logistics.deliveries[pilot], 1);
});

for (const style of ['equipment', 'coastal']) {
  test(`${style} fulfills a long-haul laden award and a feasible return before choosing discretionary work`, () => {
    let state = opening();
    state.logistics.market.contract = { tenderId: 1, playerId: pilot, kind: 'laden', destinationTileId: 21,
      amount: 9, deliveryRound: 1, status: 'active' };
    const award = choose(state, style);
    assert.deepEqual([award.type, award.kind, award.destinationTileId], ['LOAD_CARGO', 'laden', 21]);
    state = advance(advance(apply(state, award), style), style);
    assert.equal(state.players[0].lastDelivery.tenderBonus, 9);
    assert.equal(state.logistics.market.contract.status, 'fulfilled');
    assert.equal(state.players[0].backhaul.status, 'offered');
    const accept = choose(state, style);
    assert.equal(accept.type, 'ACCEPT_BACKHAUL');
    state = apply(state, accept);
    const pickup = choose(state, style);
    assert.deepEqual([pickup.type, pickup.destinationTileId], ['LOAD_CARGO', 0]);
    state = apply(state, pickup);
    state = apply(apply(state, { type: 'END_TURN' }), { type: 'END_TURN' });
    state = advance(advance(state, style), style);
    assert.equal(state.players[0].lastDelivery.tileId, 0);
    assert.equal(state.players[0].lastDelivery.backhaulBonus, 6);
  });
}

test('the rival bases its bid on the booked shipment across all styles, regardless of the human’s sealed amount', () => {
  let state = opening(true);
  const booking = getCargoBookings(state, pilot, 'laden').find(option => option.tileId === 17);
  state = sail(apply(state, booking.action), 3);
  for (const style of ['standard', 'equipment', 'coastal']) {
    let first;
    for (const amount of [4, 16]) {
      const view = structuredClone(state);
      Object.assign(view.logistics.market.tender, { bids: { human: amount }, bidderIds: ['human'], bidCount: 1 });
      const action = choose(view, style);
      assert.equal(action.type, 'BID_FREIGHT_TENDER');
      if (first) assert.deepEqual(action, first);
      first = action;
      const after = apply(view, action);
      assert.equal(after.logistics.market.tender.bids[pilot], action.amount);
      assert.equal(after.logistics.market.tender.bids.human, amount);
    }
  }
});

for (const style of ['standard', 'equipment', 'coastal']) {
  test(`${style} and a competing standard captain complete an unmodified match with every choice accepted`, () => {
    let state = opening(true);
    let actions = 0;
    while (!state.winnerId && actions < 160) {
      const active = state.players[state.activePlayerIndex].id;
      const action = choose(state, active === pilot ? style : 'standard');
      state = apply(state, action);
      actions++;
    }
    assert.ok(state.players.some(player => player.id === state.winnerId));
    for (const captain of state.players) {
      const voyages = state.logistics.voyageLog.filter(voyage => voyage.playerId === captain.id);
      assert.equal(voyages.length, state.logistics.deliveries[captain.id]);
      assert.ok(voyages.length > 0);
      assert.equal(captain.balance, voyages.reduce((sum, voyage) => sum + getVoyagePayment(voyage), 0));
    }
  });
}

function rivalBookings(rivalKind = 'laden', rivalHoldsTruck = false) {
  let state = OneMonopolyEngine.createGame('competing-trucks', [...seats].reverse(), 'logistics');
  state.logistics.market.tender = null;
  if (rivalHoldsTruck) state.logistics.ports[1].demand = 2;
  for (const [id, kind] of [['human', rivalKind], [pilot, 'laden']]) {
    const choice = getCargoBookings(state, id, kind).find(option => option.tileId === 1);
    state = apply(state, choice.action);
    if (id === 'human') {
      if (rivalHoldsTruck) state = apply(state, getReserveImportTruckAction(state, id));
      state = apply(state, { type: 'END_TURN' });
    }
  }
  return state;
}

test('any rival sails for its held truck or its shipper’s receiving berth even when the public queue is empty', () => {
  const aboard = rivalBookings();
  const appointment = apply(aboard, getReserveImportTruckAction(aboard, pilot));
  const award = structuredClone(aboard);
  award.logistics.ports[1].demand = 0;
  award.logistics.market.contract = { tenderId: 1, playerId: pilot, kind: 'laden', destinationTileId: 1,
    amount: 7, deliveryRound: 1, status: 'active' };
  for (const style of ['standard', 'equipment', 'coastal']) {
    for (const state of [appointment, award]) {
      assert.equal(state.logistics.ports[1].demand, 0);
      const course = choose(state, style);
      assert.deepEqual([course.type, course.tileId], ['SAIL_TO_PORT', 1]);
      const delivered = advance(apply(state, course), style);
      assert.equal(delivered.players[1].lastDelivery.tileId, 1);
      assert.equal(delivered.logistics.ports[1].demand, 0);
    }
  }
});

test('specialists hold the last public truck only for a true laden competitor when their delivery must wait', () => {
  const aboard = rivalBookings();
  const waiting = sail(aboard, 17);
  assert.equal(waiting.logistics.ports[1].demand, 1);
  const cases = {
    'no rival load': state => { delete state.players[0].cargo; },
    'rival bound elsewhere': state => { state.players[0].cargo.destinationTileId = 3; },
    'two trucks': state => { state.logistics.ports[1].demand = 2; },
    'allowance spent': state => { state.logistics.importTruckAvailable[pilot] = false; },
    'final round': state => { state.turnCount = 8; },
    'private award': state => {
      state.logistics.market.contract = { tenderId: 1, playerId: pilot, kind: 'laden', destinationTileId: 1,
        amount: 6, deliveryRound: 1, status: 'active' };
    },
  };
  for (const style of ['equipment', 'coastal']) {
    const hold = choose(waiting, style);
    assert.deepEqual(hold, getReserveImportTruckAction(waiting, pilot));
    const held = apply(waiting, hold);
    assert.equal(held.logistics.ports[1].demand, 0);
    assert.notEqual(choose(held, style).type, 'RESERVE_IMPORT_TRUCK');
    for (const [scenario, change] of Object.entries(cases)) {
      const alternative = structuredClone(waiting);
      change(alternative);
      assert.notEqual(choose(alternative, style).type, 'RESERVE_IMPORT_TRUCK', scenario);
    }
    assert.notEqual(choose(sail(aboard, 3), style).type, 'RESERVE_IMPORT_TRUCK', 'a payable feeder is available');
    assert.notEqual(choose(sail(rivalBookings('empty'), 17), style).type, 'RESERVE_IMPORT_TRUCK', 'rival carries an empty');
    assert.notEqual(choose(sail(rivalBookings('laden', true), 17), style).type, 'RESERVE_IMPORT_TRUCK', 'rival has its own truck');
    assert.notEqual(choose(aboard, style).type, 'RESERVE_IMPORT_TRUCK', 'main voyage is still available');
  }
  assert.notEqual(choose(waiting, 'standard').type, 'RESERVE_IMPORT_TRUCK');
});
