import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OneMonopolyEngine } from '@one-monopoly/shared';
import { getPortTender } from '../src/components/ports/portTender.js';

test('only live destinations are flagged and a port never displays a sealed price', () => {
  const state = OneMonopolyEngine.createGame('chart', [
    { id: 'a', name: 'Linh', token: 'ONE_APUS' }, { id: 'b', name: 'Minh', token: 'PILOT_BOAT' },
  ], 'logistics');
  const market = state.logistics!.market = {
    tender: { id: 1, round: 1, kind: 'laden' as const, destinationTileId: 17, priorityPlayerId: 'a',
      bids: { a: 11, b: 9 }, bidderIds: ['a', 'b'], bidCount: 2 },
    contract: null, history: [], bonusEarnings: {},
  };
  const open = getPortTender(state, 17);
  assert.equal(open?.phase, 'open');
  assert.doesNotMatch(open!.detail, /\$|Linh|Minh/);
  assert.equal(getPortTender(state, 0), null);
  state.turnCount = 2;
  state.logistics!.market!.contract = { tenderId: market.tender.id, playerId: 'b', kind: 'laden', amount: 9,
    deliveryRound: 2, destinationTileId: 17, status: 'active' };
  const awarded = getPortTender(state, 17);
  assert.equal(awarded?.phase, 'assigned');
  assert.match(awarded!.detail, /Minh/);
  assert.match(awarded!.detail, /\$9M/);
  state.logistics!.market!.contract.status = 'fulfilled';
  assert.equal(getPortTender(state, 17), null);
});
