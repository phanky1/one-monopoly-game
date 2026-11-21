import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getHarborCharterPickup, getHarborExportBooking, getHarborFreightOpportunity, getHarborTurnaround,
  OneMonopolyEngine, type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'minh', name: 'Minh', token: 'ONE_APUS' as const },
  { id: 'an', name: 'An', token: 'GANTRY_CRANE' as const },
  { id: 'linh', name: 'Linh', token: 'PILOT_BOAT' as const },
];
const wallets = (state: GameState) => state.players.map(player => player.balance);

function sailing(players = seats) {
  const state = createGame('charter-berth', players, 'harbor');
  for (const player of state.players) delete player.secretMission;
  state.properties[4].ownerId = 'minh'; // Service line qualifies Minh for a charter.
  Object.assign(state.properties[3], { ownerId: 'linh', containerLevel: 1 });
  return state;
}

function roll(state: GameState, dice: [number, number], actor = 'minh') {
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, actor);
}

function answer(state: GameState, accept = true) {
  assert.equal(state.phase, 'AWAITING_SLOT_CHARTER_RESPONSE');
  assert.equal(getHarborCharterPickup(state, 'minh'), null);
  return dispatch(state, { type: 'RESPOND_SLOT_CHARTER', accept }, 'linh').state;
}

function nextGuest(state: GameState) {
  const next = dispatch(state, { type: 'END_TURN' }, 'minh').state;
  assert.equal(next.players[next.activePlayerIndex].id, 'an');
  return roll(next, [1, 2], 'an');
}

function reject(state: GameState, action: GameAction, actor?: string) {
  const refused = dispatch(state, action, actor);
  assert.equal(refused.state, state);
  assert.deepEqual(refused.events, []);
}

test('an empty partner can trade the next rent split for a free export, or pay the published fee and collect that split', () => {
  const waiting = roll(sailing(), [1, 2]).state;
  assert.equal(waiting.pendingSlotCharter?.originalRent, 20);
  const declined = answer(waiting, false);
  assert.deepEqual(wallets(declined), [1480, 1500, 1520]);
  assert.equal(getHarborCharterPickup(declined, 'minh'), null);

  const agreed = answer(waiting);
  assert.deepEqual(wallets(agreed), [1490, 1500, 1510]);
  const offer = getHarborCharterPickup(agreed, 'minh')!;
  const waived = { operatorId: 'linh', operatorName: 'Linh', waivedFee: 3 };
  assert.deepEqual([offer.action.kind, offer.action.waivedFee, offer.quote, offer.cashChange], ['load', 3, null, 0]);
  const spent = dispatch(agreed, offer.action, 'minh');
  assert.deepEqual(wallets(spent.state), wallets(agreed));
  assert.deepEqual(spent.state.harborFreight!.manifests.minh, { originTileId: 3, charterPickup: waived });
  assert.equal(spent.events.find(e => e.type === 'HARBOR_LOADED')?.charterPickup?.waivedFee, 3);
  assert.equal(spent.state.properties[3].slotCharter?.active, false);
  assert.equal(spent.state.harborFreight!.lastDelivery, null);
  assert.deepEqual(spent.state.harborFreight!.visits.minh, { tileId: 3, handled: true });
  assert.equal(spent.state.harborFreight!.revision, agreed.harborFreight!.revision + 1);
  assert.equal(getHarborCharterPickup(spent.state, 'minh'), null);
  reject(spent.state, offer.action, 'minh');
  const fullRent = nextGuest(spent.state);
  assert.deepEqual(wallets(fullRent.state), [1490, 1480, 1530]);
  assert.equal(fullRent.events.some(e => e.type === 'SLOT_CHARTER_RENT_SPLIT'), false);

  const paid = dispatch(agreed, getHarborExportBooking(agreed, 'minh')!.action, 'minh').state;
  assert.deepEqual(wallets(paid), [1487, 1500, 1513]);
  assert.equal(paid.properties[3].slotCharter?.active, true);
  assert.equal(paid.harborFreight!.manifests.minh?.exportBooking?.fee, 3);
  const split = nextGuest(paid);
  assert.deepEqual(wallets(split.state), [1497, 1480, 1523]);
  assert.equal(split.events.find(e => e.type === 'SLOT_CHARTER_RENT_SPLIT')?.splitAmount, 10);
  assert.equal(split.state.properties[3].slotCharter?.active, false);
});

test('a laden partner earns the usual incoming freight and can waive only the new export fee, including a complete color group', () => {
  const state = sailing();
  state.properties[1].ownerId = 'linh';
  state.properties[5].ownerId = 'minh';
  state.players[0].position = 1;
  const harbor = state.harborFreight!;
  harbor.visits.minh = { tileId: 1, handled: false };
  harbor.manifests.minh = { originTileId: 0 };
  const agreed = answer(roll(state, [1, 1]).state);
  const offer = getHarborCharterPickup(agreed, 'minh')!;
  const waived = { operatorId: 'linh', operatorName: 'Linh', waivedFee: 6 };
  assert.deepEqual([offer.action.kind, offer.action.waivedFee, offer.quote?.gross, offer.quote?.handlingFee, offer.cashChange],
    ['turnaround', 6, 12, 6, 6]);
  const paid = dispatch(agreed, getHarborTurnaround(agreed, 'minh')!.action, 'minh').state;
  assert.deepEqual(wallets(paid), [1490, 1500, 1522]);
  assert.equal(paid.properties[3].slotCharter?.active, true);
  const ordinary = dispatch(agreed, getHarborFreightOpportunity(agreed, 'minh')!.action, 'minh').state;
  assert.deepEqual(wallets(ordinary), [1496, 1500, 1516]);
  assert.equal(ordinary.properties[3].slotCharter?.active, true);
  assert.equal(ordinary.harborFreight!.manifests.minh, null);

  const before = structuredClone(agreed);
  const used = dispatch(agreed, offer.action, 'minh');
  assert.deepEqual(agreed, before);
  const terminal = used.state.harborFreight!;
  assert.deepEqual(wallets(used.state), wallets(ordinary));
  assert.deepEqual(terminal.manifests.minh, { originTileId: 3, charterPickup: waived });
  assert.equal(terminal.lastDelivery!.handlingFee, 6);
  assert.deepEqual(terminal.lastDelivery!.turnaround, { ...waived, fee: 0 });
  assert.equal(terminal.lastDelivery!.charterPickup, undefined);
  assert.equal(terminal.manifests.minh?.exportBooking, undefined);
  assert.deepEqual(used.events.filter(e => e.type === 'HARBOR_LOADED' || e.type === 'HARBOR_DISCHARGED').map(e => e.type),
    ['HARBOR_DISCHARGED', 'HARBOR_LOADED']);
  assert.equal(used.state.phase, 'WAIT_FOR_ROLL');
  reject(used.state, { ...offer.action, revision: terminal.revision }, 'minh');

  const laem = roll(used.state, [1, 1]).state;
  const unload = getHarborFreightOpportunity(laem, 'minh');
  assert.ok(unload?.kind === 'discharge');
  const delivered = dispatch(laem, unload.action, 'minh').state;
  assert.deepEqual(wallets(delivered), [1496 + unload.quote.gross, 1500, 1516]);
  assert.deepEqual(delivered.harborFreight!.lastDelivery!.charterPickup, waived);
  assert.equal(delivered.harborFreight!.lastDelivery!.exportBooking, undefined);
  assert.equal(delivered.harborFreight!.lastDelivery!.turnaround, undefined);
});

test('a deferred rent discount earns no charter pickup until the debt is actually settled', () => {
  const state = sailing();
  state.players[0].balance = 5;
  state.properties[7].ownerId = 'minh';
  const owing = answer(roll(state, [1, 2]).state);
  assert.equal(owing.phase, 'AWAITING_DEBT_RESOLUTION');
  assert.equal(owing.pendingDebt?.amount, 10);
  assert.equal(getHarborCharterPickup(owing, 'minh'), null);
  const liquid = dispatch(owing, { type: 'MORTGAGE_TILE', tileId: 7 }, 'minh').state;
  assert.equal(getHarborCharterPickup(liquid, 'minh'), null);
  const settled = dispatch(liquid, { type: 'SETTLE_DEBT' }, 'minh').state;
  assert.equal(settled.pendingDebt, null);
  assert.equal(getHarborCharterPickup(settled, 'minh')?.action.kind, 'load');
});

test('a two-captain room can use a charter with no cash left for the ordinary booking', () => {
  const state = sailing([seats[0], seats[2]]);
  state.players[0].balance = 10;
  const agreed = answer(roll(state, [1, 2]).state);
  assert.deepEqual(wallets(agreed), [0, 1510]);
  const paid = getHarborExportBooking(agreed, 'minh')!;
  assert.equal(paid.shortfall, 3);
  reject(agreed, paid.action, 'minh');
  const free = getHarborCharterPickup(agreed, 'minh')!;
  const pickedUp = dispatch(agreed, free.action, 'minh').state;
  assert.deepEqual(wallets(pickedUp), [0, 1510]);
  assert.equal(pickedUp.harborFreight!.manifests.minh?.originTileId, 3);
  assert.equal(pickedUp.properties[3].slotCharter?.active, false);
});

test('only the named partner can redeem a current quote at a live developed berth', () => {
  const agreed = answer(roll(sailing(), [1, 2]).state);
  const action = getHarborCharterPickup(agreed, 'minh')!.action;
  reject(agreed, action);
  reject(agreed, action, 'linh');
  reject(agreed, { ...action, kind: 'turnaround' }, 'minh');
  reject(agreed, { ...action, revision: action.revision + 1 }, 'minh');
  reject(agreed, { ...action, tileId: 5 }, 'minh');
  reject(agreed, { ...action, operatorId: 'an' }, 'minh');
  reject(agreed, { ...action, waivedFee: 6 }, 'minh');

  const changedRate = structuredClone(agreed);
  changedRate.properties[1].ownerId = 'linh';
  assert.equal(getHarborCharterPickup(changedRate, 'minh')?.action.waivedFee, 6);
  reject(changedRate, action, 'minh');
  for (const disable of [
    (s: GameState) => { s.properties[3].slotCharter = null; },
    (s: GameState) => { s.properties[3].slotCharter!.partnerId = 'an'; },
    (s: GameState) => { s.properties[3].slotCharter!.active = false; },
    (s: GameState) => { s.properties[3].isMortgaged = true; },
    (s: GameState) => { s.properties[3].containerLevel = 0; },
    (s: GameState) => { s.harborFreight!.visits.minh!.handled = true; },
    (s: GameState) => { s.activePlayerIndex = 1; },
    (s: GameState) => { s.mode = 'classic'; },
    (s: GameState) => { s.mode = 'logistics'; },
  ]) {
    const closed = structuredClone(agreed);
    disable(closed);
    assert.equal(getHarborCharterPickup(closed, 'minh'), null);
    reject(closed, action, 'minh');
  }
});
