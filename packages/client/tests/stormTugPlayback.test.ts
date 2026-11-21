import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OneMonopolyEngine, type GameEvent } from '@one-monopoly/shared';
import { nextStormRescue } from '../src/components/stormTugPlayback.js';

function stormAtHarbor() {
  const state = OneMonopolyEngine.createGame('rescue', [
    { id: 'visitor', name: 'Visitor', token: 'FREIGHT_TRAIN' },
    { id: 'captain', name: 'Captain', token: 'PILOT_BOAT' },
  ]);
  state.players[0].position = 6;
  state.players[1].position = 18;
  return state;
}

const tow: GameEvent = { type: 'STORM_RESOLVED', playerId: 'captain', choice: 'TUG' };
const drift: GameEvent = { ...tow, choice: 'DRIFT' };

test('only a tug resolution starts a rescue at the resolving captain’s actual tile', () => {
  const state = stormAtHarbor();
  state.stormActive = true;
  assert.equal(nextStormRescue(null, state, []), null);
  assert.equal(nextStormRescue(null, state, [drift]), null);
  assert.equal(nextStormRescue(null, state, [{ ...tow, playerId: 'unknown' }]), null);
  assert.deepEqual(nextStormRescue(null, state, [tow]), { playerId: 'captain', tileId: 18, sequence: 1 });
});

test('trade updates preserve a rescue and a snapshot clears it even on the same storm tile', () => {
  const state = stormAtHarbor();
  const rescue = nextStormRescue(null, state, [tow]);
  const trade: GameEvent = { type: 'TRADE_OFFERED', offer: { id: 1, buyerId: 'visitor', sellerId: 'captain', tileId: 3, price: 60 } };
  assert.equal(nextStormRescue(rescue, state, [trade]), rescue);
  assert.equal(nextStormRescue(rescue, state, null), null);
  assert.equal(nextStormRescue(rescue, state, [drift]), null);
  assert.equal(nextStormRescue(rescue, state, [{ type: 'DICE_ROLLED', playerId: 'captain', dice: [1, 2], isDouble: false }]), null);
  state.players[1].position = 19;
  assert.equal(nextStormRescue(rescue, state, []), null);
});
