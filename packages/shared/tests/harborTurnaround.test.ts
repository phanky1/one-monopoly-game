import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getHarborExportBooking, getHarborFreightOpportunity, getHarborTurnaround, OneMonopolyEngine,
  type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'an', name: 'An', token: 'ONE_APUS' as const },
  { id: 'linh', name: 'Linh', token: 'PILOT_BOAT' as const },
  { id: 'minh', name: 'Minh', token: 'GANTRY_CRANE' as const },
];
const balances = (state: GameState) => state.players.map(player => player.balance);
const turnaround = (state: GameState) => getHarborTurnaround(state, 'an');

function game() {
  const state = createGame('harbor-turnaround', seats, 'harbor');
  for (const player of state.players) delete player.secretMission;
  return state;
}

function roll(state: GameState, dice: [number, number]) {
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, 'an').state;
}

function arrive(ownerId: string, level: number, fullGroup = false) {
  const state = game();
  state.players[0].balance = ownerId === 'an' ? 1500 : 20;
  Object.assign(state.properties[3], { ownerId, containerLevel: level });
  if (fullGroup) state.properties[1].ownerId = ownerId;
  const load = getHarborFreightOpportunity(state, 'an');
  assert.ok(load?.kind === 'load');
  return roll(dispatch(state, load.action, 'an').state, [1, 2]);
}

function reject(state: GameState, action: GameAction, actorId?: string) {
  const result = dispatch(state, action, actorId);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

test('building the first level at your port unlocks a free return load alongside ordinary discharge', () => {
  const undeveloped = arrive('an', 0);
  assert.equal(turnaround(undeveloped), null);
  const built = dispatch(undeveloped, { type: 'BUILD_CONTAINER', tileId: 3 }, 'an').state;
  const quote = turnaround(built);
  assert.ok(quote);
  assert.deepEqual([quote.action.operatorId, quote.action.fee, quote.cashChange, quote.shortfall], ['an', 0, 12, 0]);
  const plain = getHarborFreightOpportunity(built, 'an');
  assert.ok(plain?.kind === 'discharge');
  const unloaded = dispatch(built, plain.action, 'an').state;
  assert.equal(unloaded.harborFreight!.manifests.an, null);
  assert.equal(unloaded.harborFreight!.lastDelivery!.turnaround, undefined);
  reject(unloaded, quote.action, 'an');

  const before = structuredClone(built);
  const swapped = dispatch(built, quote.action, 'an');
  assert.deepEqual(built, before);
  assert.deepEqual(balances(swapped.state), [1462, 1500, 1500]);
  assert.deepEqual(balances(swapped.state), balances(unloaded));
  assert.equal(swapped.state.phase, 'END_OF_TURN');
  assert.deepEqual(swapped.state.harborFreight!.manifests.an, { originTileId: 3 });
  assert.deepEqual(swapped.state.harborFreight!.visits.an, { tileId: 3, handled: true });
  assert.deepEqual(swapped.state.harborFreight!.lastDelivery!.turnaround, { operatorId: 'an', operatorName: 'An', fee: 0 });
  assert.equal(swapped.state.harborFreight!.revision, built.harborFreight!.revision + 1);
  assert.equal(turnaround(swapped.state), null);
  reject(swapped.state, quote.action, 'an');
  reject(swapped.state, { ...quote.action, revision: swapped.state.harborFreight!.revision }, 'an');
});

test('a cashless visiting ship may use the arriving freight for the new export fee at either group rate', () => {
  for (const fullGroup of [false, true]) {
    const state = arrive('linh', 1, fullGroup);
    assert.deepEqual(balances(state), [0, 1520, 1500]); // $20M rent already paid.
    const offer = turnaround(state);
    assert.ok(offer);
    const fee = fullGroup ? 6 : 3;
    const carrierChange = fullGroup ? 0 : 6;
    assert.deepEqual([offer.quote.gross, offer.quote.handlingFee, offer.action.fee, offer.shortfall, offer.cashChange],
      [12, fee, fee, 0, carrierChange]);
    const settled = dispatch(state, offer.action, 'an');
    const booking = { operatorId: 'linh', operatorName: 'Linh', fee };
    assert.deepEqual(balances(settled.state), [carrierChange, 1520 + fee * 2, 1500]);
    assert.deepEqual(settled.state.harborFreight!.manifests.an, { originTileId: 3, exportBooking: booking });
    const receipt = settled.state.harborFreight!.lastDelivery!;
    assert.deepEqual(receipt.turnaround, booking);
    assert.equal(receipt.exportBooking, undefined);
    assert.equal(receipt.carrierNet, 12 - fee);
    assert.deepEqual(settled.events.filter(e => e.type === 'HARBOR_DISCHARGED'), [{ type: 'HARBOR_DISCHARGED', receipt }]);
    assert.deepEqual(settled.events.filter(e => e.type === 'HARBOR_LOADED'),
      [{ type: 'HARBOR_LOADED', tileId: 3, playerId: 'an', exportBooking: booking }]);
    assert.ok(settled.events.every(e => e.type !== 'DEMURRAGE_PAID'));
    assert.equal(getHarborFreightOpportunity(settled.state, 'an'), null);
  }
});

test('two paid exports keep distinct origin receipts and neither booking fee is charged twice', () => {
  const state = game();
  state.players[0].position = 1;
  Object.assign(state.properties[3], { ownerId: 'linh', containerLevel: 1 });
  Object.assign(state.properties[5], { ownerId: 'minh', containerLevel: 1 });
  state.properties[7].ownerId = 'minh';
  state.properties[9].ownerId = 'an';
  const caiMep = roll(state, [1, 1]);
  const first = getHarborExportBooking(caiMep, 'an');
  assert.ok(first);
  const voyage = dispatch(caiMep, first.action, 'an').state;
  const laem = roll(voyage, [1, 1]);
  assert.deepEqual(balances(laem), [1447, 1523, 1530]);
  const offer = turnaround(laem);
  assert.ok(offer);
  const swapped = dispatch(laem, offer.action, 'an').state;
  const paidAtCaiMep = { operatorId: 'linh', operatorName: 'Linh', fee: 3 };
  const paidAtLaem = { operatorId: 'minh', operatorName: 'Minh', fee: 6 };
  assert.deepEqual(swapped.harborFreight!.lastDelivery!.exportBooking, paidAtCaiMep);
  assert.deepEqual(swapped.harborFreight!.lastDelivery!.turnaround, paidAtLaem);
  assert.deepEqual(swapped.harborFreight!.manifests.an, { originTileId: 5, exportBooking: paidAtLaem });
  assert.deepEqual(balances(swapped), [1447, 1523, 1542]);
  assert.equal(swapped.phase, 'WAIT_FOR_ROLL');
  assert.equal(swapped.consecutiveDoubles, 2);

  const piraeus = roll(swapped, [1, 3]);
  const last = getHarborFreightOpportunity(piraeus, 'an');
  assert.ok(last?.kind === 'discharge');
  const delivered = dispatch(piraeus, last.action, 'an').state;
  assert.equal(delivered.harborFreight!.lastDelivery!.originTileId, 5);
  assert.deepEqual(delivered.harborFreight!.lastDelivery!.exportBooking, paidAtLaem);
  assert.equal(delivered.harborFreight!.lastDelivery!.turnaround, undefined);
  assert.deepEqual(balances(delivered), [1447 + last.quote.gross, 1523, 1542]);
  assert.equal(delivered.harborFreight!.manifests.an, null);
});

test('the quote is bound to the captain, quote revision, live operator, group tariff and available berth', () => {
  const state = arrive('linh', 1);
  const offer = turnaround(state)!;
  assert.equal(getHarborTurnaround(state, 'linh'), null);
  reject(state, offer.action);
  reject(state, offer.action, 'linh');
  reject(state, { ...offer.action, tileId: 1 }, 'an');
  reject(state, { ...offer.action, revision: offer.action.revision - 1 }, 'an');
  const newOwner = structuredClone(state);
  newOwner.properties[3].ownerId = 'minh';
  assert.equal(turnaround(newOwner)?.action.operatorId, 'minh');
  reject(newOwner, offer.action, 'an');
  const newTariff = structuredClone(state);
  newTariff.properties[1].ownerId = 'linh';
  assert.equal(turnaround(newTariff)?.action.fee, 6);
  reject(newTariff, offer.action, 'an');

  const disable: ((s: GameState) => void)[] = [
    s => { delete s.harborFreight; },
    s => { s.properties[3].isMortgaged = true; },
    s => { s.properties[3].ownerId = null; },
    s => { s.properties[3].containerLevel = 0; },
    s => { s.players[1].isBankrupt = true; },
    s => { s.players[0].inHold = true; },
    s => { s.harborFreight!.manifests.an = null; },
    s => { s.harborFreight!.manifests.an = { originTileId: 3 }; },
    s => { s.harborFreight!.visits.an!.handled = true; },
    s => { s.phase = 'AWAITING_DEBT_RESOLUTION'; },
  ];
  for (const change of disable) {
    const closed = structuredClone(state);
    change(closed);
    assert.equal(turnaround(closed), null);
    reject(closed, offer.action, 'an');
  }
  for (const mode of ['classic', 'logistics'] as const) {
    const other = createGame('other-mode', seats, mode);
    assert.equal(turnaround(other), null);
    reject(other, offer.action, 'an');
  }
});
