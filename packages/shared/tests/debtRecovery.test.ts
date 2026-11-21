import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDebtRecovery } from '../src/debtRecovery.js';
import { OneMonopolyEngine } from '../src/gameEngine.js';

const { createGame, dispatch } = OneMonopolyEngine;
const players = [
  { id: 'visitor', name: 'An', token: 'ONE_APUS' as const },
  { id: 'owner', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'partner', name: 'Chi', token: 'GANTRY_CRANE' as const },
];

function game(position: number, balance: number) {
  const state = createGame('recovery', players);
  for (const player of state.players) delete player.secretMission;
  state.players[0].position = position;
  state.players[0].balance = balance;
  return state;
}

function piraeusRent(balance: number) {
  const state = game(6, balance);
  Object.assign(state.properties[9], {
    ownerId: 'owner', containerLevel: 4, slotCharter: { partnerId: 'partner', active: true },
  });
  return state;
}

const roll = { type: 'ROLL_DICE' as const, forcedDice: [1, 2] as [number, number] };

test('two remote sales and the newly unlocked mortgage cover a bank debt exactly', () => {
  const state = game(26, 20); // Heading for Carbon Tax, $100M.
  Object.assign(state.properties[1], { ownerId: 'visitor', containerLevel: 2 });
  Object.assign(state.properties[3], { ownerId: 'visitor', isMortgaged: true });
  assert.equal(getDebtRecovery(state), null);
  const landing = dispatch(state, roll);
  assert.equal(landing.state.pendingDebt?.creditorId, 'BANK');
  const opening = getDebtRecovery(landing.state)!;
  assert.equal(opening.shortfall, 80);
  assert.equal(opening.maxProceeds, 80);
  assert.deepEqual(opening.options, [{ action: { type: 'SELL_CONTAINER', tileId: 1, expectedLevel: 2 }, proceeds: 25 }]);

  const first = dispatch(landing.state, opening.recommended!.action);
  const stale = dispatch(first.state, opening.recommended!.action);
  assert.deepEqual(stale.events, []);
  assert.deepEqual(stale.state, first.state);
  assert.equal(stale.state.players[0].balance, 45);
  const next = getDebtRecovery(stale.state)!;
  assert.equal(next.maxProceeds, 55);
  assert.deepEqual(next.recommended, { action: { type: 'SELL_CONTAINER', tileId: 1, expectedLevel: 1 }, proceeds: 25 });
  const second = dispatch(stale.state, next.recommended!.action);
  const unlocked = getDebtRecovery(second.state)!;
  assert.deepEqual(unlocked.options, [{ action: { type: 'MORTGAGE_TILE', tileId: 1 }, proceeds: 30 }]);
  const mortgaged = dispatch(second.state, unlocked.recommended!.action);
  assert.deepEqual(dispatch(mortgaged.state, unlocked.recommended!.action).events, []);
  const covered = getDebtRecovery(mortgaged.state)!;
  assert.equal(covered.shortfall, 0);
  assert.equal(covered.recommended, null);
  assert.equal(mortgaged.state.players[0].balance, 100);
  const settled = dispatch(mortgaged.state, { type: 'SETTLE_DEBT' });
  assert.equal(settled.state.players[0].balance, 0);
  assert.equal(settled.state.phase, 'END_OF_TURN');
  assert.equal(getDebtRecovery(settled.state), null);
  assert.deepEqual(settled.events.filter(e => e.type === 'DEBT_SETTLED'),
    [{ type: 'DEBT_SETTLED', debtorId: 'visitor', creditorId: 'BANK', amount: 100 }]);
  for (const type of ['DECLARE_BANKRUPTCY', 'SETTLE_DEBT'] as const) {
    const stale = dispatch(settled.state, { type });
    assert.strictEqual(stale.state, settled.state);
    assert.deepEqual(stale.events, []);
    assert.equal(stale.state.players[0].isBankrupt, false);
  }
});

test('selling one Green Fleet port level quotes its actual refund and preserves split rent', () => {
  const state = piraeusRent(525);
  Object.assign(state.properties[31], { ownerId: 'visitor', containerLevel: 5, hasGreenFleet: true });
  const landing = dispatch(state, roll);
  const recovery = getDebtRecovery(landing.state)!;
  assert.equal(recovery.shortfall, 100);
  assert.equal(recovery.maxProceeds, 700); // Five $100M refunds and the eventual $200M mortgage.
  assert.deepEqual(recovery.recommended, { action: { type: 'SELL_CONTAINER', tileId: 31, expectedLevel: 5 }, proceeds: 100 });
  const sale = dispatch(landing.state, recovery.recommended!.action);
  assert.equal(sale.state.properties[31].hasGreenFleet, false);
  assert.equal(sale.state.properties[31].containerLevel, 4);
  assert.equal(sale.state.players[0].balance, 625);
  assert.deepEqual(sale.state.pendingDebt?.charterRent, { type: 'SPLIT', partnerId: 'partner' });
  const paid = dispatch(sale.state, { type: 'SETTLE_DEBT' });
  assert.deepEqual(paid.state.players.map(p => p.balance), [0, 1813, 1812]);
  assert.equal(paid.events.filter(e => e.type === 'SLOT_CHARTER_RENT_SPLIT').length, 1);
  assert.deepEqual(dispatch(paid.state, { type: 'SETTLE_DEBT' }).events, []);
});

test('quotes only owned assets, including mortgages on undeveloped siblings, in board order', () => {
  const state = piraeusRent(550);
  state.properties[1].ownerId = 'visitor';
  Object.assign(state.properties[3], { ownerId: 'visitor', containerLevel: 2 });
  for (const id of [4, 10, 13]) state.properties[id].ownerId = 'visitor';
  Object.assign(state.properties[17], { ownerId: 'visitor', isMortgaged: true });
  const debt = dispatch(state, roll).state;
  const recovery = getDebtRecovery(debt)!;
  assert.deepEqual(recovery.options.map(o => [o.action.type, o.action.tileId, o.proceeds]), [
    ['MORTGAGE_TILE', 1, 30], ['SELL_CONTAINER', 3, 25], ['MORTGAGE_TILE', 4, 100],
    ['MORTGAGE_TILE', 10, 75], ['MORTGAGE_TILE', 13, 100],
  ]);
  assert.equal(recovery.maxProceeds, 385);
  assert.equal(recovery.recommended?.action.tileId, 10); // Smallest mortgage covering the $75M gap.
  for (const option of recovery.options) {
    const raised = dispatch(debt, option.action);
    assert.equal(raised.state.players[0].balance - debt.players[0].balance, option.proceeds);
  }
  debt.players[0].balance = 500;
  assert.equal(getDebtRecovery(debt)?.recommended?.action.tileId, 4); // Largest mortgage, earliest equal tile.
});

test('an unrecoverable debtor can inspect legal sales without recommending an unnecessary liquidation', () => {
  const state = game(26, 0);
  Object.assign(state.properties[3], { ownerId: 'visitor', containerLevel: 1 });
  const debt = dispatch(state, roll).state;
  const recovery = getDebtRecovery(debt)!;
  assert.equal(recovery.shortfall, 100);
  assert.equal(recovery.maxProceeds, 55);
  assert.equal(recovery.options.length, 1);
  assert.equal(recovery.recommended, null);
  const sale = dispatch(debt, { type: 'SELL_CONTAINER', tileId: 3 }); // Older clients omit the version.
  assert.equal(sale.state.players[0].balance, 25);
});
