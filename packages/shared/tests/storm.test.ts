import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OneMonopolyEngine } from '../src/gameEngine.js';
import type { GameAction } from '../src/types.js';

const players = [
  { id: 'a', name: 'A', token: 'ONE_APUS' as const },
  { id: 'b', name: 'B', token: 'ONE_MAGENTA' as const },
  { id: 'c', name: 'C', token: 'FREIGHT_TRAIN' as const },
];

describe('OPS-02 storm', () => {
  it('drifts back three tiles and lasts through an extra roll until the turn changes', () => {
    const game = OneMonopolyEngine.createGame('storm', players);
    game.opsDeck = ['OPS-02', 'OPS-01'];
    const draw = OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: [3, 3] });

    assert.equal(draw.state.stormActive, true);
    assert.equal(draw.state.players[0].position, 6);
    assert.equal(draw.state.phase, 'AWAITING_STORM_DECISION');
    assert.ok(draw.events.some((event) => event.type === 'CARD_DRAWN' && event.card.id === 'OPS-02'));
    const drift = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
    assert.deepEqual(drift.events, [
      { type: 'STORM_RESOLVED', playerId: 'a', choice: 'DRIFT' },
      { type: 'SHIP_STEPPED', playerId: 'a', from: 6, to: 3 },
    ]);
    assert.equal(drift.state.players[0].balance, 1500);
    assert.equal(drift.state.phase, 'AWAITING_BUY_DECISION');

    const buy = OneMonopolyEngine.dispatch(drift.state, { type: 'BUY_PROPERTY' });
    assert.equal(buy.state.phase, 'WAIT_FOR_ROLL');
    const extraRoll = OneMonopolyEngine.dispatch(buy.state, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    assert.equal(extraRoll.state.stormActive, true);
    assert.equal(extraRoll.state.players[0].position, 16); // OPS-01 moves the ship to free anchorage.
    const next = OneMonopolyEngine.dispatch(extraRoll.state, { type: 'END_TURN' });
    assert.equal(next.state.activePlayerIndex, 1);
    assert.equal(next.state.stormActive, false);
  });

  it('keeps the storm during unpaid rent and clears it on a bankruptcy handoff', () => {
    const game = OneMonopolyEngine.createGame('debt', players);
    game.opsDeck = ['OPS-02'];
    game.properties[3].ownerId = 'b';
    game.players[0].balance = 1;
    const draw = OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: [2, 4] });
    const tug = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'TUG' });
    assert.deepEqual(tug.state, draw.state);
    assert.deepEqual(tug.events, []);
    const drift = OneMonopolyEngine.dispatch(tug.state, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
    assert.equal(drift.state.pendingDebt?.amount, 4);
    assert.equal(drift.state.pendingDebt?.creditorId, 'b');

    const blocked = OneMonopolyEngine.dispatch(drift.state, { type: 'END_TURN' });
    assert.equal(blocked.state.activePlayerIndex, 0);
    assert.equal(blocked.state.stormActive, true);
    const next = OneMonopolyEngine.dispatch(blocked.state, { type: 'DECLARE_BANKRUPTCY' });
    assert.equal(next.state.players[0].isBankrupt, true);
    assert.equal(next.state.activePlayerIndex, 1);
    assert.equal(next.state.stormActive, false);
  });

  it('charges exactly $25M once to hold position and preserves a doubles roll', () => {
    const game = OneMonopolyEngine.createGame('tug', players);
    game.opsDeck = ['OPS-02', 'OPS-03'];
    game.players[0].balance = 25;
    const draw = OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: [3, 3] });
    const tug = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'TUG' });

    assert.equal(tug.state.players[0].balance, 0);
    assert.equal(tug.state.players[0].position, 6);
    assert.deepEqual(tug.state.opsDeck, ['OPS-03', 'OPS-02']);
    assert.equal(tug.state.phase, 'WAIT_FOR_ROLL');
    assert.equal(tug.state.hasRolled, false);
    assert.equal(tug.state.stormActive, true);
    assert.deepEqual(tug.events[0], { type: 'STORM_RESOLVED', playerId: 'a', choice: 'TUG' });
    assert.ok(tug.events.some((event) => event.type === 'BALANCE_CHANGED' && event.delta === -25));
    assert.ok(!tug.events.some((event) => event.type === 'SHIP_STEPPED' || event.type === 'CARD_DRAWN'));
    for (const choice of ['TUG', 'DRIFT'] as const) {
      const stale = OneMonopolyEngine.dispatch(tug.state, { type: 'RESOLVE_STORM', choice });
      assert.deepEqual(stale, { state: tug.state, events: [] });
    }
  });

  it('holds the decision against unrelated actions and malformed choices', () => {
    const game = OneMonopolyEngine.createGame('waiting', players);
    game.opsDeck = ['OPS-02'];
    game.properties[1].ownerId = 'a';
    const draw = OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: [4, 2] });
    for (const action of [
      { type: 'END_TURN' }, { type: 'DECLARE_BANKRUPTCY' }, { type: 'ROLL_DICE' },
      { type: 'MORTGAGE_TILE', tileId: 1 }, { type: 'RESOLVE_STORM', choice: 'OTHER' },
      { type: 'RESOLVE_STORM' }, null,
    ]) {
      const ignored = OneMonopolyEngine.dispatch(draw.state, action as GameAction);
      assert.deepEqual(ignored, { state: draw.state, events: [] });
    }
    const tug = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'TUG' });
    assert.equal(tug.state.phase, 'END_OF_TURN');
  });

  it('resolves a drift onto an eligible rival port through slot chartering', () => {
    const game = OneMonopolyEngine.createGame('charter', players);
    game.opsDeck = ['OPS-02'];
    game.properties[3].ownerId = 'b';
    game.properties[3].containerLevel = 1;
    game.properties[4].ownerId = 'a';
    const draw = OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: [4, 2] });
    const drift = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
    assert.equal(drift.state.players[0].position, 3);
    assert.equal(drift.state.phase, 'AWAITING_SLOT_CHARTER_RESPONSE');
    assert.equal(drift.state.pendingSlotCharter?.originalRent, 20);
    const duplicate = OneMonopolyEngine.dispatch(drift.state, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
    assert.deepEqual(duplicate, { state: drift.state, events: [] });
  });

  it('ends storm weather when bankruptcy ends the game', () => {
    const game = OneMonopolyEngine.createGame('final-turn', players.slice(0, 2));
    game.stormActive = true;
    game.phase = 'AWAITING_DEBT_RESOLUTION';
    game.pendingDebt = { creditorId: 'b', amount: 4, reason: 'Port rent' };
    const result = OneMonopolyEngine.dispatch(game, { type: 'DECLARE_BANKRUPTCY' });
    assert.equal(result.state.winnerId, 'b');
    assert.equal(result.state.stormActive, false);
  });

  it('keeps clear weather on a non-storm draw from an older snapshot', () => {
    const game = OneMonopolyEngine.createGame('legacy', players);
    assert.equal(game.stormActive, false);
    delete game.stormActive;
    game.opsDeck = ['OPS-01'];
    const draw = OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: [2, 4] });
    assert.equal(draw.state.players[0].position, 16);
    assert.equal(draw.state.stormActive ?? false, false);
  });
});
