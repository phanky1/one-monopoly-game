import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OneMonopolyEngine } from '../src/gameEngine.js';
import type { EngineResult, GameState } from '../src/types.js';

function createRentGame() {
  return OneMonopolyEngine.createGame('rent', [
    { id: 'visitor', name: 'Visitor', token: 'ONE_APUS' },
    { id: 'owner', name: 'Owner', token: 'ONE_MAGENTA' },
    { id: 'partner', name: 'Partner', token: 'REEFER_TRUCK' },
  ]);
}

function createPortGame() {
  const state = createRentGame();
  // Piraeus charges $625M at level four.
  for (const tileId of [9, 11, 12]) {
    state.properties[tileId].ownerId = 'owner';
    state.properties[tileId].containerLevel = 4;
  }
  return state;
}

function visitPort(state: GameState) {
  return OneMonopolyEngine.dispatch(state, { type: 'ROLL_DICE', forcedDice: [4, 5] });
}

function balances(state: GameState) {
  return state.players.map((player) => player.balance);
}

function assertSplitEvents(result: EngineResult) {
  const splits = result.events.filter((event) => event.type === 'SLOT_CHARTER_RENT_SPLIT');
  assert.equal(splits.length, 1);
  assert.equal(splits[0].ownerAmount, 313);
  assert.equal(splits[0].splitAmount, 312);
  const changes = result.events.filter((event) => event.type === 'BALANCE_CHANGED');
  assert.equal(changes.length, 3);
  for (const [playerId, amount] of Object.entries({ visitor: -625, owner: 313, partner: 312 })) {
    const change = changes.find((event) => event.playerId === playerId);
    assert.ok(change);
    assert.equal(change.delta, amount);
    assert.equal(change.newBalance, result.state.players.find((player) => player.id === playerId)?.balance);
  }
}

describe('Slot charter rent', () => {
  it('activates an accepted charter once its discounted rent has been paid', () => {
    const state = createPortGame();
    state.properties[4].ownerId = 'visitor';
    state.players[0].balance = 212;
    const landing = visitPort(state);
    const accepted = OneMonopolyEngine.dispatch(landing.state, {
      type: 'RESPOND_SLOT_CHARTER', accept: true,
    });

    assert.equal(accepted.state.phase, 'AWAITING_DEBT_RESOLUTION');
    assert.equal(accepted.state.pendingDebt?.amount, 312);
    assert.equal(accepted.state.pendingSlotCharter, null);
    assert.ok(!accepted.state.properties[9].slotCharter?.active);
    assert.deepEqual(balances(accepted.state), [212, 1500, 1500]);
    assert.ok(!accepted.events.some((event) => event.type === 'DEMURRAGE_PAID'));

    const mortgaged = OneMonopolyEngine.dispatch(accepted.state, { type: 'MORTGAGE_TILE', tileId: 4 });
    const paid = OneMonopolyEngine.dispatch(mortgaged.state, { type: 'SETTLE_DEBT' });
    assert.deepEqual(balances(paid.state), [0, 1812, 1500]);
    assert.deepEqual(paid.state.properties[9].slotCharter, { partnerId: 'visitor', active: true });
    assert.equal(paid.state.phase, 'END_OF_TURN');
  });

  it('collects full rent for the owner after a rejected charter goes to debt', () => {
    const state = createPortGame();
    state.properties[4].ownerId = 'visitor';
    state.players[0].balance = 525;
    const landing = visitPort(state);
    const rejected = OneMonopolyEngine.dispatch(landing.state, {
      type: 'RESPOND_SLOT_CHARTER', accept: false,
    });

    assert.equal(rejected.state.pendingDebt?.amount, 625);
    assert.deepEqual(balances(rejected.state), [525, 1500, 1500]);
    const mortgaged = OneMonopolyEngine.dispatch(rejected.state, { type: 'MORTGAGE_TILE', tileId: 4 });
    const paid = OneMonopolyEngine.dispatch(mortgaged.state, { type: 'SETTLE_DEBT' });
    assert.deepEqual(balances(paid.state), [0, 2125, 1500]);
    assert.equal(paid.state.pendingDebt, null);
    assert.ok(!paid.state.properties[9].slotCharter?.active);
    assert.ok(paid.events.some((event) => event.type === 'DEMURRAGE_PAID' && event.amount === 625));
  });

  it('honors the existing split even when the visitor could qualify for a new charter', () => {
    const state = createPortGame();
    state.properties[9].slotCharter = { partnerId: 'partner', active: true };
    state.properties[4].ownerId = 'visitor';
    const landing = visitPort(state);

    assert.equal(landing.state.pendingSlotCharter, null);
    assert.deepEqual(balances(landing.state), [875, 1813, 1812]);
    assert.ok(!landing.state.properties[9].slotCharter?.active);
    assertSplitEvents(landing);
  });

  it('pays both charter parties exactly once after the visitor raises the missing cash', () => {
    const state = createPortGame();
    state.properties[9].slotCharter = { partnerId: 'partner', active: true };
    state.properties[10].ownerId = 'visitor';
    state.players[0].balance = 550;
    const landing = visitPort(state);
    const tooSoon = OneMonopolyEngine.dispatch(landing.state, { type: 'SETTLE_DEBT' });

    assert.equal(tooSoon.state.pendingDebt?.amount, 625);
    assert.deepEqual(balances(tooSoon.state), [550, 1500, 1500]);
    const mortgaged = OneMonopolyEngine.dispatch(tooSoon.state, { type: 'MORTGAGE_TILE', tileId: 10 });
    const paid = OneMonopolyEngine.dispatch(mortgaged.state, { type: 'SETTLE_DEBT' });

    assert.deepEqual(balances(paid.state), [0, 1813, 1812]);
    assert.ok(!paid.state.properties[9].slotCharter?.active);
    assertSplitEvents(paid);
    assert.equal(paid.state.pendingDebt, null);
    const retry = OneMonopolyEngine.dispatch(paid.state, { type: 'SETTLE_DEBT' });
    assert.deepEqual(balances(retry.state), balances(paid.state));
    assert.deepEqual(retry.events, []);
  });

  it('consumes the one-visit split when the visitor declares bankruptcy', () => {
    const state = createPortGame();
    state.properties[9].slotCharter = { partnerId: 'partner', active: true };
    state.players[0].balance = 25;
    const landing = visitPort(state);
    const bankrupt = OneMonopolyEngine.dispatch(landing.state, { type: 'DECLARE_BANKRUPTCY' });

    assert.equal(bankrupt.state.players[0].bankruptTo, 'owner');
    assert.deepEqual(balances(bankrupt.state), [0, 1525, 1500]);
    assert.ok(!bankrupt.events.some((event) => event.type === 'SLOT_CHARTER_RENT_SPLIT'));
    assert.ok(!bankrupt.state.properties[9].slotCharter?.active);
    assert.equal(bankrupt.state.pendingDebt, null);
  });
});

describe('Ordinary rent on landing', () => {
  const cases = [
    { name: 'base port rent', tile: 3, owned: [3], rent: 4 },
    { name: 'double rent for a complete port group', tile: 3, owned: [1, 3], rent: 8 },
    { name: 'three service lines', tile: 4, owned: [4, 13, 20], rent: 100 },
    { name: 'one infrastructure tile at four times the roll', tile: 10, owned: [10], rent: 12 },
    { name: 'both infrastructure tiles at ten times the roll', tile: 22, owned: [10, 22], dice: [3, 4] as [number, number], rent: 70 },
    { name: 'mortgaged port', tile: 3, owned: [1, 3], mortgaged: true, rent: 0 },
    { name: 'owner visiting their own port', tile: 3, owned: [3], selfOwned: true, rent: 0 },
  ];
  for (const testCase of cases) {
    it(testCase.name, () => {
      const state = createRentGame();
      const dice: [number, number] = testCase.dice ?? [1, 2];
      state.players[0].position = testCase.tile - dice[0] - dice[1];
      for (const id of testCase.owned) {
        state.properties[id].ownerId = testCase.selfOwned ? 'visitor' : 'owner';
      }
      state.properties[testCase.tile].isMortgaged = !!testCase.mortgaged;
      const { state: landed, events } = OneMonopolyEngine.dispatch(state, { type: 'ROLL_DICE', forcedDice: dice });

      assert.equal(landed.players[0].position, testCase.tile);
      assert.equal(landed.phase, 'END_OF_TURN');
      assert.deepEqual(balances(landed), [1500 - testCase.rent, 1500 + testCase.rent, 1500]);
      const payments = events.filter((event) => event.type === 'DEMURRAGE_PAID');
      assert.deepEqual(payments.map((event) => event.amount), testCase.rent ? [testCase.rent] : []);
    });
  }
});
