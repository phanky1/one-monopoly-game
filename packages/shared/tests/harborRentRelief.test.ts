import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHarborFreightOpportunity, getHarborRentRelief, OneMonopolyEngine, type GameAction, type GameState } from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'minh', name: 'Minh', token: 'GANTRY_CRANE' as const },
  { id: 'an', name: 'An', token: 'PILOT_BOAT' as const },
];
function loaded(cash: number) {
  const state = createGame('rent-relief', seats, 'harbor');
  state.players[0].balance = cash;
  const offer = getHarborFreightOpportunity(state, 'linh')!;
  return dispatch(state, offer.action, 'linh').state;
}
function roll(state: GameState, dice: [number, number]) {
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, 'linh').state;
}
function reject(state: GameState, action: GameAction, actor?: string) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}
const balances = (state: GameState) => state.players.map(player => player.balance);

test('the owner of a complete color group earns both its half of freight and normal rent, preserving doubles', () => {
  const sailing = loaded(12);
  for (const id of [9, 11, 12]) sailing.properties[id].ownerId = 'minh';
  const owing = roll(sailing, [6, 6]);
  const snapshot = structuredClone(owing);
  const relief = getHarborRentRelief(owing, 'linh')!;
  assert.deepEqual([relief.quote.gross, relief.quote.carrierNet, relief.quote.handlingFee, relief.rentDue,
    relief.shortfallAfter], [24, 12, 12, 24, 0]);
  assert.equal(getHarborFreightOpportunity(owing, 'linh'), null);
  const paid = dispatch(owing, relief.action, 'linh');
  assert.deepEqual(owing, snapshot);
  assert.equal(paid.state.phase, 'WAIT_FOR_ROLL');
  assert.equal(paid.state.hasRolled, false);
  assert.equal(paid.state.consecutiveDoubles, 1);
  assert.equal(paid.state.pendingDebt, null);
  assert.deepEqual(balances(paid.state), [0, 1536, 1500]);
  assert.deepEqual(paid.state.harborFreight!.lastDelivery!.rentRelief, { rentDue: 24, shortfallAfter: 0 });
  assert.equal(paid.state.harborFreight!.lastDelivery!.carrierNet, 12);
  assert.deepEqual(paid.events.filter(e => e.type === 'HARBOR_DISCHARGED' || e.type === 'DEMURRAGE_PAID' || e.type === 'DEBT_SETTLED')
    .map(e => e.type), ['HARBOR_DISCHARGED', 'DEMURRAGE_PAID', 'DEBT_SETTLED']);
  assert.equal(paid.state.harborFreight!.revision, owing.harborFreight!.revision + 1);
  assert.equal(paid.state.harborFreight!.manifests.linh, null);
  assert.equal(paid.state.harborFreight!.visits.linh?.handled, true);
  reject(paid.state, relief.action, 'linh');
  reject(paid.state, { ...relief.action, revision: paid.state.harborFreight!.revision }, 'linh');
  assert.equal(roll(paid.state, [1, 2]).players[0].position, 15);
});

test('a partial freight payment preserves the full rent debt for ordinary recovery and cannot be repeated', () => {
  const sailing = loaded(21);
  sailing.properties[1].ownerId = 'linh';
  Object.assign(sailing.properties[3], { ownerId: 'minh', containerLevel: 2 });
  const owing = roll(sailing, [1, 2]);
  const relief = getHarborRentRelief(owing, 'linh')!;
  assert.deepEqual([relief.rentDue, relief.shortfallAfter], [60, 30]);
  const partial = dispatch(owing, relief.action, 'linh');
  assert.deepEqual(partial.state.pendingDebt, owing.pendingDebt);
  assert.equal(partial.state.phase, 'AWAITING_DEBT_RESOLUTION');
  assert.deepEqual(balances(partial.state), [30, 1503, 1500]);
  assert.deepEqual(partial.state.harborFreight!.lastDelivery!.rentRelief, { rentDue: 60, shortfallAfter: 30 });
  assert.equal(partial.events.some(e => e.type === 'DEMURRAGE_PAID' || e.type === 'DEBT_SETTLED'), false);
  assert.equal(getHarborRentRelief(partial.state, 'linh'), null);
  reject(partial.state, { ...relief.action, revision: partial.state.harborFreight!.revision }, 'linh');
  const raised = dispatch(partial.state, { type: 'MORTGAGE_TILE', tileId: 1 }, 'linh').state;
  const paid = dispatch(raised, { type: 'SETTLE_DEBT' }, 'linh');
  assert.deepEqual(balances(paid.state), [0, 1563, 1500]);
  assert.equal(paid.state.pendingDebt, null);
  assert.equal(paid.events.filter(e => e.type === 'DEBT_SETTLED').length, 1);
  assert.deepEqual(paid.state.harborFreight!.lastDelivery, partial.state.harborFreight!.lastDelivery);
});

test('the freight handling fee belongs to the terminal while odd rent still splits between charter partners', () => {
  const sailing = loaded(610);
  Object.assign(sailing.properties[9], { ownerId: 'minh', containerLevel: 4, slotCharter: { partnerId: 'an', active: true } });
  const owing = roll(sailing, [4, 5]);
  assert.deepEqual(owing.pendingDebt?.charterRent, { type: 'SPLIT', partnerId: 'an' });
  const paid = dispatch(owing, getHarborRentRelief(owing, 'linh')!.action, 'linh');
  assert.deepEqual(balances(paid.state), [0, 1818, 1812]);
  assert.equal(paid.state.harborFreight!.lastDelivery?.operatorId, 'minh');
  assert.equal(paid.state.harborFreight!.lastDelivery?.handlingFee, 5);
  const split = paid.events.find(e => e.type === 'SLOT_CHARTER_RENT_SPLIT');
  assert.deepEqual([split?.ownerAmount, split?.splitAmount], [313, 312]);
  assert.equal(paid.state.properties[9].slotCharter?.active, false);
});

test('a previously agreed discount activates only once freight makes its discounted rent payable', () => {
  const sailing = loaded(10);
  sailing.properties[4].ownerId = 'linh';
  Object.assign(sailing.properties[9], { ownerId: 'minh', containerLevel: 1 });
  const offered = roll(sailing, [4, 5]);
  assert.equal(offered.phase, 'AWAITING_SLOT_CHARTER_RESPONSE');
  assert.equal(getHarborRentRelief(offered, 'linh'), null);
  const owing = dispatch(offered, { type: 'RESPOND_SLOT_CHARTER', accept: true }, 'minh').state;
  assert.equal(owing.pendingDebt?.amount, 25);
  const paid = dispatch(owing, getHarborRentRelief(owing, 'linh')!.action, 'linh');
  assert.deepEqual(paid.state.properties[9].slotCharter, { partnerId: 'linh', active: true });
  assert.deepEqual(balances(paid.state), [0, 1530, 1500]);
  assert.equal(paid.events.filter(e => e.type === 'SLOT_CHARTER_ACCEPTED').length, 1);
});

test('only an unpaid rent on this live rival port and this captain’s fresh call may use freight', () => {
  const sailing = loaded(0);
  sailing.properties[3].ownerId = 'minh';
  const owing = roll(sailing, [1, 2]);
  const action = getHarborRentRelief(owing, 'linh')!.action;
  reject(owing, action, 'minh');
  reject(owing, action);
  reject(owing, { ...action, tileId: 5 }, 'linh');
  reject(owing, { ...action, revision: action.revision - 1 }, 'linh');
  for (const invalidate of [
    (s: GameState) => { s.players[0].balance = s.pendingDebt!.amount; },
    (s: GameState) => { s.pendingDebt!.creditorId = 'BANK'; },
    (s: GameState) => { s.pendingDebt!.creditorId = 'an'; },
    (s: GameState) => { s.pendingDebt!.tileId = 5; },
    (s: GameState) => { delete s.pendingDebt!.tileId; },
    (s: GameState) => { s.harborFreight!.manifests.linh = { originTileId: 3 }; },
    (s: GameState) => { s.harborFreight!.visits.linh!.handled = true; },
    (s: GameState) => { s.harborFreight!.manifests.linh = null; },
    (s: GameState) => { s.properties[3].isMortgaged = true; },
    (s: GameState) => { s.properties[3].ownerId = 'linh'; },
    (s: GameState) => { s.players[0].inHold = true; },
    (s: GameState) => { s.players[0].isBankrupt = true; },
    (s: GameState) => { s.winnerId = 'minh'; },
    (s: GameState) => { delete s.harborFreight; },
  ]) {
    const invalid = structuredClone(owing);
    invalidate(invalid);
    assert.equal(getHarborRentRelief(invalid, 'linh'), null);
    reject(invalid, action, 'linh');
  }
  for (const mode of ['classic', 'logistics'] as const) {
    const state = createGame('unchanged', seats, mode);
    assert.equal(getHarborRentRelief(state, 'linh'), null);
    reject(state, action, 'linh');
  }
  for (const dice of [[1, 3], [4, 6]] as [number, number][]) {
    const departing = loaded(0);
    departing.properties[dice[0] + dice[1]].ownerId = 'minh';
    const otherRent = roll(departing, dice);
    assert.equal(otherRent.phase, 'AWAITING_DEBT_RESOLUTION');
    assert.equal(getHarborRentRelief(otherRent, 'linh'), null);
  }
  const approach = loaded(0);
  approach.players[0].position = 26;
  const taxed = roll(approach, [1, 2]);
  assert.equal(taxed.pendingDebt?.creditorId, 'BANK');
  assert.equal(taxed.pendingDebt?.tileId, 29);
  assert.equal(getHarborRentRelief(taxed, 'linh'), null);
  reject(taxed, { ...action, tileId: 29, revision: taxed.harborFreight!.revision }, 'linh');
});
