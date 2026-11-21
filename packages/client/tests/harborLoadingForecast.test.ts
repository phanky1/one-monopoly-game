import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHarborExportBooking, getHarborFreightOpportunity, OneMonopolyEngine } from '@one-monopoly/shared';
import { getHarborLoadingForecast } from '../src/components/harborLoadingForecast.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'minh', name: 'Minh', token: 'ONE_APUS' as const },
  { id: 'linh', name: 'Linh', token: 'GANTRY_CRANE' as const },
];

function docked(tileId = 3) {
  const state = createGame('loading-forecast', seats, 'harbor');
  state.supportsHarborExportBooking = true;
  state.players[0].position = tileId;
  state.harborFreight!.visits.minh = { tileId, handled: false };
  if (tileId !== 0) Object.assign(state.properties[tileId], { ownerId: 'linh', containerLevel: 1 });
  return state;
}

test('Cái Mép lists the 21 direct port outcomes in dice order without revealing the next card or changing the game', () => {
  const state = docked();
  state.properties[5].ownerId = 'minh';
  const before = structuredClone(state);
  const forecast = getHarborLoadingForecast(state, 'minh')!;
  assert.deepEqual([forecast.originTileId, forecast.fee, forecast.directWays, forecast.holdWays], [3, 3, 21, 0]);
  assert.deepEqual(forecast.calls.map(c => [c.tileId, c.total, c.ways]), [
    [5, 2, 1], [7, 4, 3], [9, 6, 5], [11, 8, 5], [12, 9, 4], [14, 11, 2], [15, 12, 1],
  ]);
  assert.equal(forecast.calls[0].freightMargin, 9);
  assert.deepEqual(state, before);

  state.properties[9].isMortgaged = true;
  const closed = getHarborLoadingForecast(state, 'minh')!;
  assert.equal(closed.directWays, 16);
  assert.equal(closed.calls.some(c => c.tileId === 9), false);
});

test('six immediate third doubles send the captain to customs and the next normal turn restores all combinations', () => {
  const state = docked();
  state.consecutiveDoubles = 2;
  const forecast = getHarborLoadingForecast(state, 'minh')!;
  assert.deepEqual([forecast.directWays, forecast.holdWays], [16, 6]);
  assert.deepEqual(forecast.calls.map(c => [c.total, c.ways]), [[4, 2], [6, 4], [8, 4], [9, 4], [11, 2]]);
  for (let face = 1; face <= 6; face++) {
    const sent = dispatch(state, { type: 'ROLL_DICE', forcedDice: [face, face] }, 'minh');
    assert.equal(sent.state.players[0].inHold, true);
  }
  state.phase = 'END_OF_TURN';
  const nextTurn = getHarborLoadingForecast(state, 'minh')!;
  assert.deepEqual([nextTurn.directWays, nextTurn.holdWays], [21, 0]);
});

test('the margin equals booked versus empty wallets after both ships pay destination rent', () => {
  const state = docked();
  state.properties[1].ownerId = 'linh'; // Full origin group charges $6M.
  state.properties[7].ownerId = 'linh';
  const preview = getHarborLoadingForecast(state, 'minh')!;
  const call = preview.calls.find(c => c.total === 4)!;
  assert.deepEqual([preview.fee, call.freightMargin], [6, 8]);
  const booking = getHarborExportBooking(state, 'minh')!;
  const booked = dispatch(state, booking.action, 'minh').state;
  const sail = (s: typeof state) => dispatch(s, { type: 'ROLL_DICE', forcedDice: [1, 3] }, 'minh').state;
  const laden = sail(booked);
  const empty = sail(state);
  assert.equal(empty.players[0].balance, state.players[0].balance - 8);
  const unload = getHarborFreightOpportunity(laden, 'minh');
  assert.ok(unload?.kind === 'discharge');
  const paid = dispatch(laden, unload.action, 'minh').state;
  assert.equal(paid.players[0].balance - empty.players[0].balance, call.freightMargin);
});

test('a wrapped Singapore call uses only its freight receipt, and free and unaffordable offers can be compared', () => {
  const state = docked(30);
  state.players[0].balance = 0;
  const wrapped = getHarborLoadingForecast(state, 'minh')!;
  const singapore = wrapped.calls.find(c => c.tileId === 0)!;
  assert.deepEqual([singapore.total, singapore.ways], [2, 1]);
  state.players[0].balance = 1500;
  const book = getHarborExportBooking(state, 'minh')!;
  const booked = dispatch(state, book.action, 'minh').state;
  const arrival = dispatch(booked, { type: 'ROLL_DICE', forcedDice: [1, 1] }, 'minh');
  const discharge = getHarborFreightOpportunity(arrival.state, 'minh');
  assert.ok(discharge?.kind === 'discharge');
  assert.equal(singapore.freightMargin, discharge.quote.carrierNet - 3);
  assert.equal(getHarborLoadingForecast(docked(0), 'minh')?.fee, 0);
  state.properties[30].ownerId = 'minh';
  assert.equal(getHarborLoadingForecast(state, 'minh')?.fee, 0);
});

test('no forecast leaks to another seat or game, an unsupported paid berth, a loaded ship, or a spent visit', () => {
  const state = docked();
  for (const viewer of [null, 'linh', 'unknown']) assert.equal(getHarborLoadingForecast(state, viewer), null);
  delete state.supportsHarborExportBooking;
  assert.equal(getHarborLoadingForecast(state, 'minh'), null);
  state.properties[3].ownerId = 'minh';
  assert.equal(getHarborLoadingForecast(state, 'minh')?.fee, 0); // Older servers support regular free loads.
  state.harborFreight!.manifests.minh = { originTileId: 0 };
  assert.equal(getHarborLoadingForecast(state, 'minh'), null);
  state.harborFreight!.manifests.minh = null;
  state.harborFreight!.visits.minh!.handled = true;
  assert.equal(getHarborLoadingForecast(state, 'minh'), null);
  for (const mode of ['classic', 'logistics'] as const) {
    assert.equal(getHarborLoadingForecast(createGame('other', seats, mode), 'minh'), null);
  }
});
