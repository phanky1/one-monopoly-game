import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCargoBookings, getLogisticsRoutes, getTenderBidAction, OneMonopolyEngine as engine } from '@one-monopoly/shared';
import { getFreightBotAction as choose } from '../dist/freightBot.js';

function game(withTender = false) {
  const state = engine.createGame('routes', [{id:'pilot', name:'An', token:'ONE_APUS'}, {id:'human', name:'Bình', token:'PILOT_BOAT'}], 'logistics');
  if (!withTender) state.logistics.market.tender = null;
  return state;
}
const step = state => {
  const next = engine.dispatch(state, choose(state), 'pilot').state;
  assert.notEqual(next, state);
  return next;
};

test('the pilot chooses a reefer for an immediate sailing, but dry freight when booking after the voyage', () => {
  const s = game();
  const immediate = choose(s);
  assert.equal(immediate.type, 'LOAD_CARGO');
  assert.equal(immediate.reefer, true);
  let arriving = step(step(s));
  arriving = step(arriving);
  assert.equal(arriving.players[0].lastDelivery.reeferBonus, 8);
  delete s.players[0].lastDelivery;
  s.phase = 'END_OF_TURN'; s.logistics.hasSailed = true;
  const preload = choose(s);
  assert.equal(preload.type, 'LOAD_CARGO');
  assert.notEqual(preload.reefer, true);
});

test('the pilot spends its one feeder sailing only when the due reefer has a confirmed receiver', () => {
  const s = game();
  s.players[0].position = 3;
  s.players[0].cargo = { bookingId: 1, originTileId: 0, destinationTileId: 1, kind: 'laden', reeferDueRound:s.turnCount };
  s.phase = 'END_OF_TURN'; s.logistics.hasSailed = true;
  assert.equal(choose(s).type, 'SAIL_FEEDER');
  let paid = step(s);
  assert.equal(paid.logistics.feederAvailable.pilot, false);
  paid = step(paid);
  assert.equal(paid.players[0].lastDelivery.reeferBonus, 8);
  s.logistics.ports[1].demand = 0;
  assert.notEqual(choose(s).type, 'SAIL_FEEDER');
});

test('a captain accepts a feasible return, loads it and receives the backhaul premium at the original berth', () => {
  let s = game();
  s.players[0].position = 1;
  s.players[0].lastDelivery = {bookingId:1, kind:'laden', originTileId:0, destinationTileId:1, tileId:1, reward:12, distanceNm:596};
  s.players[0].backhaul = {bookingId:1, originTileId:1, destinationTileId:0, offeredRound:1, deadlineRound:2, status:'offered'};
  s.cargoRevision = 3;
  assert.equal(choose(s).type, 'ACCEPT_BACKHAUL');
  for (let i=0; i<4; i++) s = step(s);
  assert.equal(s.players[0].lastBackhaul.status, 'fulfilled');
  assert.equal(s.players[0].lastDelivery.backhaulBonus, 6);
});

for (const work of ['tender', 'backhaul']) {
  test(`a nearby ${work} saves its deadline with the feeder and pays only on discharge`, () => {
    let s = game();
    s.turnCount = 2;
    s.phase = 'END_OF_TURN'; s.logistics.hasSailed = true;
    s.players[0].position = 3;
    s.players[0].cargo = {bookingId:12, originTileId:0, destinationTileId:1, kind:'laden'};
    if (work === 'tender') {
      s.logistics.ports[1].demand = 0;
      s.logistics.market.contract = {tenderId:1, playerId:'pilot', kind:'laden', destinationTileId:1, amount:11, deliveryRound:2, status:'active'};
    } else {
      s.players[0].backhaul = {bookingId:8, originTileId:0, destinationTileId:1, offeredRound:1, deadlineRound:2, status:'active'};
    }
    assert.equal(choose(s).type, 'SAIL_FEEDER');
    s = step(s);
    assert.equal(s.players[0].balance, 0);
    s = step(s);
    assert.equal(s.players[0].balance, work === 'tender' ? 23 : 18);
  });
}

function apply(state, action) {
  const result = engine.dispatch(state, action, state.players[state.activePlayerIndex].id);
  assert.notEqual(result.state, state, action.type);
  return result.state;
}
function load(state, destination, kind, reefer = false) {
  const choice = getCargoBookings(state, 'pilot', kind, reefer).find(row => row.tileId === destination);
  assert.ok(choice);
  return apply(state, choice.action);
}
function sail(state, destination) {
  const route = getLogisticsRoutes(state, 'pilot').find(row => row.tileId === destination);
  assert.ok(route);
  return apply(state, route.action);
}
function award(state, kind, target) {
  state.logistics.market.contract = { tenderId: 1, playerId: 'pilot', kind, destinationTileId: target,
    amount: 7, deliveryRound: state.turnCount, status: 'active' };
}
function playReplacement(state, style, sailing) {
  const contract = state.logistics.market.contract;
  const original = state.players[0].cargo;
  const before = structuredClone(state);
  for (const expected of ['RETURN_CARGO_TO_YARD', 'LOAD_CARGO', sailing, 'UNLOAD_CARGO']) {
    const action = choose(state, style);
    assert.equal(action.type, expected, style);
    if (expected === 'RETURN_CARGO_TO_YARD') assert.deepEqual(state, before, 'planning must not move freight');
    if (expected === 'LOAD_CARGO') {
      assert.equal(action.kind, contract.kind);
      assert.equal(action.destinationTileId, contract.destinationTileId);
    }
    state = apply(state, action);
    if (expected !== 'UNLOAD_CARGO') {
      assert.equal(state.players[0].balance, before.players[0].balance);
      assert.equal(state.logistics.deliveries.pilot, before.logistics.deliveries.pilot);
    }
  }
  assert.notEqual(state.players[0].lastDelivery.bookingId, original.bookingId);
  assert.equal(state.players[0].lastDelivery.tenderBonus, contract.amount);
  assert.equal(state.logistics.market.contract.status, 'fulfilled');
  assert.equal(state.logistics.deliveries.pilot, before.logistics.deliveries.pilot + 1);
  assert.equal(state.logistics.voyageLog.length, before.logistics.voyageLog.length + 1);
}

test('every pilot rebooks a wrong-kind origin load to fulfill an awarded tender this turn', () => {
  const opening = game(true);
  const offered = apply(opening, getTenderBidAction(opening, 'pilot', 7));
  const loaded = load(offered, 3, 'empty');
  const ready = apply(apply(loaded, { type: 'END_TURN' }), { type: 'END_TURN' });
  assert.equal(ready.logistics.market.contract.destinationTileId, 17);
  for (const style of ['standard', 'equipment', 'coastal']) playReplacement(ready, style, 'SAIL_TO_PORT');
});

test('a sailed pilot can swap a cold booking for the sole dry export and use its feeder to a non-reefer tender port', () => {
  const state = load(sail(game(), 1), 17, 'laden', true);
  assert.equal(state.logistics.ports[1].supply, 0);
  award(state, 'laden', 3);
  playReplacement(state, 'standard', 'SAIL_FEEDER');
});

test('an empty-equipment award can replace a dry export with an available surplus box', () => {
  const state = load(game(), 1, 'laden');
  award(state, 'empty', 3);
  playReplacement(state, 'equipment', 'SAIL_TO_PORT');
});

test('the pilot keeps the original booking without an active personal award, a replacement load or a reachable tender berth', () => {
  const original = load(game(), 3, 'empty');
  const noSupply = structuredClone(original);
  award(noSupply, 'laden', 17);
  noSupply.logistics.ports[0].supply = 0; // Returning the empty will not create a dry export.
  const expired = structuredClone(original);
  award(expired, 'laden', 17);
  expired.logistics.market.contract.status = 'expired';
  const pastDeadline = structuredClone(original);
  award(pastDeadline, 'laden', 17);
  pastDeadline.turnCount++;
  const rivalAward = structuredClone(original);
  award(rivalAward, 'laden', 17);
  rivalAward.logistics.market.contract.playerId = 'human';
  const awayFromOrigin = sail(original, 1);
  award(awayFromOrigin, 'laden', 3); // The feeder can reach Cái Mép, but the box was loaded in Singapore.
  const outOfRange = load(sail(game(), 1), 17, 'laden', true);
  award(outOfRange, 'laden', 9); // The available feeder cannot reach Piraeus this turn.
  const noFeeder = structuredClone(outOfRange);
  award(noFeeder, 'laden', 3);
  noFeeder.logistics.feederAvailable.pilot = false;
  for (const state of [original, noSupply, expired, pastDeadline, rivalAward, awayFromOrigin, outOfRange, noFeeder]) {
    assert.notEqual(choose(state).type, 'RETURN_CARGO_TO_YARD');
  }
});

test('the pilot discharges a payable current booking before serving the award and redirects compatible cargo in place', () => {
  const payable = sail(load(game(), 1, 'laden'), 1);
  const nextTurn = apply(apply(payable, { type: 'END_TURN' }), { type: 'END_TURN' });
  award(nextTurn, 'laden', 17);
  assert.equal(choose(nextTurn).type, 'UNLOAD_CARGO');
  const paid = step(nextTurn);
  assert.equal(paid.players[0].balance, 12);
  assert.equal(paid.logistics.market.contract.status, 'active');

  const compatible = load(game(), 1, 'laden', true);
  award(compatible, 'laden', 17);
  const redirect = choose(compatible);
  assert.equal(redirect.type, 'CHANGE_DESTINATION');
  assert.equal(redirect.destinationTileId, 17);
  assert.equal(apply(compatible, redirect).players[0].cargo.bookingId, compatible.players[0].cargo.bookingId);
});
