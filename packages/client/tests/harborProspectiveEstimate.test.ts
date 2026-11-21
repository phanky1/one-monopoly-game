import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHarborExportBooking, getHarborFreightOpportunity, OneMonopolyEngine, type GameState } from '@one-monopoly/shared';
import { getHarborCallEstimate, getHarborLoadTerms } from '../src/components/harborCallEstimate.js';

const { createGame, dispatch } = OneMonopolyEngine;
const crews = [
  { id: 'minh', name: 'Minh', token: 'ONE_APUS' as const },
  { id: 'linh', name: 'Linh', token: 'PILOT_BOAT' as const },
];

function atCaiMep(ownsGroup = false) {
  const state = createGame('export-preview', crews, 'harbor');
  state.supportsHarborExportBooking = true;
  state.players[0].position = 1;
  Object.assign(state.properties[3], { ownerId: 'linh', containerLevel: 1 });
  if (ownsGroup) state.properties[1].ownerId = 'linh';
  state.properties[5].ownerId = 'minh';
  state.properties[14].ownerId = 'linh';
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: [1, 1] }, 'minh').state;
}

function openCall(state: GameState, destination: number) {
  const estimate = getHarborCallEstimate(state, destination, 'minh');
  assert.ok(estimate?.kind === 'open');
  return estimate;
}

test('an empty captain can inspect free loading at GO or an owned port on older servers', () => {
  const home = createGame('free-preview', crews, 'harbor');
  home.properties[3].ownerId = 'minh';
  const own = dispatch(home, { type: 'ROLL_DICE', forcedDice: [1, 2] }, 'minh').state;
  for (const state of [home, own]) {
    const terms = { originTileId: state.players[0].position, fee: 0 };
    assert.deepEqual(getHarborLoadTerms(state, 'minh'), terms);
    const plan = openCall(state, 5);
    assert.deepEqual(plan.loadTerms, terms);
    assert.equal(plan.currentDischarge, null);
    const loading = getHarborFreightOpportunity(state, 'minh');
    assert.ok(loading?.kind === 'load');
    const loaded = dispatch(state, loading.action, 'minh').state;
    assert.equal(getHarborLoadTerms(loaded, 'minh'), null);
    const onBoard = openCall(loaded, 5);
    assert.equal(onBoard.loadTerms, null);
    assert.deepEqual(onBoard.quote, plan.quote);
  }
});

test('the prospective voyage predicts actual cash and the difference from sailing empty', () => {
  for (const ownsGroup of [false, true]) {
    const state = atCaiMep(ownsGroup);
    const snapshot = structuredClone(state);
    const fee = ownsGroup ? 6 : 3;
    const hamburg = openCall(state, 14);
    const laemChabang = openCall(state, 5);
    assert.deepEqual(hamburg.loadTerms, { originTileId: 3, fee });
    assert.equal(hamburg.currentDischarge, null);
    assert.deepEqual([hamburg.quote.gross, hamburg.quote.handlingFee, hamburg.quote.carrierNet, hamburg.rent], [22, 5, 17, 14]);
    assert.deepEqual([laemChabang.quote.gross, laemChabang.quote.handlingFee, laemChabang.rent], [12, 0, 0]);
    assert.deepEqual(state, snapshot);

    const booking = getHarborExportBooking(state, 'minh');
    assert.ok(booking);
    const booked = dispatch(state, booking.action, 'minh').state;
    assert.equal(openCall(booked, 14).loadTerms, null);
    const sail = (from: GameState) => dispatch(from, { type: 'ROLL_DICE', forcedDice: [5, 6] }, 'minh').state;
    const empty = sail(state);
    const arrival = sail(booked);
    const unload = getHarborFreightOpportunity(arrival, 'minh');
    assert.ok(unload?.kind === 'discharge');
    assert.deepEqual(unload.quote, hamburg.quote);
    const settled = dispatch(arrival, unload.action, 'minh').state;
    assert.equal(empty.players[0].balance, state.players[0].balance - hamburg.rent);
    assert.equal(settled.players[0].balance - state.players[0].balance, hamburg.portIncome - fee);
    assert.equal(settled.players[0].balance - empty.players[0].balance, hamburg.quote.carrierNet - fee);
  }
});

test('an unaffordable paid booking can be inspected without accepting it or changing either wallet', () => {
  const state = atCaiMep(true);
  state.players[0].balance = 5;
  const snapshot = structuredClone(state);
  const booking = getHarborExportBooking(state, 'minh');
  assert.equal(booking?.shortfall, 1);
  assert.deepEqual(openCall(state, 5).loadTerms, { originTileId: 3, fee: 6 });
  assert.deepEqual(state, snapshot);
  assert.ok(booking);
  assert.equal(dispatch(state, booking.action, 'minh').state, state);
});

test('prospective quotes follow visit eligibility, viewer identity, server support and closed berths', () => {
  const state = atCaiMep();
  for (const viewer of ['linh', 'unknown', null]) {
    assert.equal(getHarborLoadTerms(state, viewer), null);
    assert.equal(getHarborCallEstimate(state, 5, viewer), null);
  }
  for (const unavailable of [
    { ...state, supportsHarborExportBooking: undefined }, { ...state, mode: 'classic' as const },
    { ...state, mode: 'logistics' as const }, { ...state, phase: 'AWAITING_BUY_DECISION' as const },
  ]) {
    assert.equal(getHarborLoadTerms(unavailable, 'minh'), null);
    assert.equal(getHarborCallEstimate(unavailable, 5, 'minh'), null);
  }
  state.properties[14].isMortgaged = true;
  const closed = getHarborCallEstimate(state, 14, 'minh');
  assert.equal(closed?.kind, 'mortgaged');
  assert.deepEqual(closed?.loadTerms, { originTileId: 3, fee: 3 });
  state.harborFreight!.visits.minh!.handled = true;
  assert.equal(getHarborCallEstimate(state, 14, 'minh'), null);
});
