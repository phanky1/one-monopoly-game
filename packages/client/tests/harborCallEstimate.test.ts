import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHarborFreightOpportunity, OneMonopolyEngine, type GameState } from '@one-monopoly/shared';
import { getHarborCallEstimate } from '../src/components/harborCallEstimate.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'an', name: 'An', token: 'ONE_APUS' as const },
  { id: 'binh', name: 'Bình', token: 'GANTRY_CRANE' as const },
  { id: 'chi', name: 'Chi', token: 'PILOT_BOAT' as const },
];

function departing() {
  const state = createGame('call-estimate', seats, 'harbor');
  const load = getHarborFreightOpportunity(state, 'an');
  assert.ok(load?.kind === 'load');
  return dispatch(state, load.action, 'an').state;
}

function openCall(state: GameState, tileId: number, viewer = 'an') {
  const estimate = getHarborCallEstimate(state, tileId, viewer);
  assert.ok(estimate?.kind === 'open');
  return estimate;
}

function sailToGenoa(state: GameState) {
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: [5, 6] }, 'an').state;
}

test('a rival berth estimate matches actual rent and rounded handling paid when the ship arrives and unloads', () => {
  for (const fullGroup of [false, true]) {
    const state = departing();
    state.properties[11].ownerId = 'binh';
    if (fullGroup) {
      state.properties[9].ownerId = 'binh';
      state.properties[12].ownerId = 'binh';
    }
    const before = structuredClone(state);
    const plan = openCall(state, 11);
    assert.deepEqual(state, before);
    assert.deepEqual([plan.ownership, plan.originTileId, plan.tileId, plan.quote.gross], ['rival', 0, 11, 22]);
    assert.deepEqual([plan.quote.feePercent, plan.quote.handlingFee, plan.quote.carrierNet, plan.rent, plan.portIncome],
      fullGroup ? [50, 11, 11, 20, -9] : [25, 5, 17, 10, 7]);

    const arrived = sailToGenoa(state);
    const discharge = getHarborFreightOpportunity(arrived, 'an');
    assert.ok(discharge?.kind === 'discharge');
    assert.deepEqual(discharge.quote, plan.quote);
    const paid = dispatch(arrived, discharge.action, 'an').state;
    assert.equal(paid.players[0].balance - state.players[0].balance, plan.portIncome);
    assert.equal(paid.players[1].balance - state.players[1].balance, plan.rent + plan.quote.handlingFee);
  }
});

test('own, unowned and Singapore berths do not charge the inspecting captain rent or a handling fee at current ownership', () => {
  const state = departing();
  state.properties[9].ownerId = 'an';
  for (const [tileId, ownership] of [[9, 'own'], [11, 'unowned']] as const) {
    const plan = openCall(state, tileId);
    assert.deepEqual([plan.ownership, plan.rent, plan.quote.handlingFee, plan.charterRent], [ownership, 0, 0, null]);
    assert.equal(plan.portIncome, plan.quote.gross);
  }
  state.players[0].position = 9;
  state.harborFreight!.manifests.an = { originTileId: 11 };
  const singapore = openCall(state, 0);
  assert.deepEqual([singapore.ownership, singapore.rent, singapore.quote.handlingFee, singapore.portIncome],
    ['go', 0, 0, 22]); // Only income from the call, excluding any reward for passing GO.
});

test('the estimate uses the waiting viewer’s manifest and shows a current alternative only for an actionable discharge', () => {
  const state = departing();
  state.properties[11].ownerId = 'an';
  state.harborFreight!.manifests.binh = { originTileId: 3 };
  const docked = sailToGenoa(state);
  const discharge = getHarborFreightOpportunity(docked, 'an');
  assert.ok(discharge?.kind === 'discharge');
  assert.deepEqual(openCall(docked, 9).currentDischarge, discharge.quote);
  const waiting = openCall(docked, 9, 'binh');
  assert.deepEqual([waiting.originTileId, waiting.quote.playerId, waiting.currentDischarge], [3, 'binh', null]);
  assert.equal(getHarborCallEstimate(docked, 11, 'an'), null);
  assert.equal(getHarborCallEstimate(docked, 9, 'chi'), null);

  const handled = structuredClone(docked);
  handled.harborFreight!.visits.an!.handled = true;
  assert.equal(openCall(handled, 9).currentDischarge, null);
  const mortgaged = structuredClone(docked);
  mortgaged.properties[11].isMortgaged = true;
  assert.equal(openCall(mortgaged, 9).currentDischarge, null);

  const poor = departing();
  poor.players[0].balance = 0;
  poor.properties[11].ownerId = 'binh';
  const owing = sailToGenoa(poor);
  assert.equal(owing.phase, 'AWAITING_DEBT_RESOLUTION');
  assert.equal(openCall(owing, 9).currentDischarge, null);
});

test('a charter discount is conditional on the same terms the owner actually receives', () => {
  const state = departing();
  Object.assign(state.properties[11], { ownerId: 'binh', containerLevel: 4 });
  assert.equal(openCall(state, 11).charterRent, null);
  state.properties[4].ownerId = 'an';
  const ordinary = openCall(state, 11);
  assert.deepEqual([ordinary.rent, ordinary.portIncome, ordinary.charterRent], [625, -608, 312]);
  assert.equal(sailToGenoa(state).pendingSlotCharter?.discountedRent, ordinary.charterRent);

  state.properties[11].slotCharter = { partnerId: 'chi', active: true };
  const split = openCall(state, 11);
  assert.deepEqual([split.charterRent, split.portIncome], [null, -608]);
  const charged = sailToGenoa(state);
  assert.equal(charged.pendingSlotCharter, null);
  assert.equal(charged.players[0].balance, state.players[0].balance - split.rent);

  state.properties[11].slotCharter.partnerId = 'an';
  assert.equal(openCall(state, 11).charterRent, 312);
  state.properties[11].slotCharter.partnerId = 'chi';
  state.players[2].isBankrupt = true;
  assert.equal(openCall(state, 11).charterRent, sailToGenoa(state).pendingSlotCharter?.discountedRent);
  state.properties[11].containerLevel = 0;
  assert.equal(openCall(state, 11).charterRent, null);
});

test('the loading port and a mortgaged terminal report why this box cannot discharge there', () => {
  const state = departing();
  state.players[0].position = 11;
  const origin = getHarborCallEstimate(state, 0, 'an');
  assert.deepEqual([origin?.kind, origin?.originTileId, origin?.tileId], ['origin', 0, 0]);
  state.properties[9].ownerId = 'binh';
  state.properties[9].isMortgaged = true;
  const closed = getHarborCallEstimate(state, 9, 'an');
  assert.deepEqual([closed?.kind, closed?.originTileId, closed?.tileId], ['mortgaged', 0, 9]);
  state.harborFreight!.manifests.an = { originTileId: 9 };
  assert.equal(getHarborCallEstimate(state, 9, 'an')?.kind, 'origin');
});

test('quotes require a live combined game, a seated solvent viewer, a valid manifest and a remote harbor', () => {
  const state = departing();
  for (const viewer of [null, 'absent']) assert.equal(getHarborCallEstimate(state, 11, viewer), null);
  for (const tileId of [0, 2, 4, 10, 32, -1, 1.5]) assert.equal(getHarborCallEstimate(state, tileId, 'an'), null);
  for (const mode of ['classic', 'logistics'] as const) {
    assert.equal(getHarborCallEstimate(createGame('other-mode', seats, mode), 11, 'an'), null);
  }
  for (const invalidate of [
    (s: GameState) => { s.gameStarted = false; },
    (s: GameState) => { s.winnerId = 'chi'; },
    (s: GameState) => { s.players[0].isBankrupt = true; },
    (s: GameState) => { delete s.harborFreight; },
    (s: GameState) => { s.harborFreight!.manifests.an = null; },
    (s: GameState) => { s.harborFreight!.manifests.an = { originTileId: 2 }; },
    (s: GameState) => {
      s.properties[11].isMortgaged = true;
      s.harborFreight!.manifests.an = { originTileId: 40 };
    },
    (s: GameState) => { s.properties[11].ownerId = 'absent'; },
    (s: GameState) => { s.properties[11].ownerId = 'chi'; s.players[2].isBankrupt = true; },
  ]) {
    const invalid = structuredClone(state);
    invalidate(invalid);
    assert.equal(getHarborCallEstimate(invalid, 11, 'an'), null);
  }
});
