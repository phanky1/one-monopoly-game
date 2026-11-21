import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFreightQuote, OneMonopolyEngine } from '@one-monopoly/shared';
import { marketPlanRates, marketRowsByRate } from '../src/components/marketPlanRates.js';
import { freightMarketRows } from '../src/components/freightMarketRows.js';

const game = () => OneMonopolyEngine.createGame('rates', [
  { id: 'linh', name: 'Linh', token: 'ONE_APUS' }, { id: 'minh', name: 'Minh', token: 'PILOT_BOAT' },
], 'logistics');

test('highest freight puts available bookings first and resolves equal quotes by the existing distance order', () => {
  const state = game();
  const rates = marketPlanRates(state, 'linh', 'laden');
  const ranked = marketRowsByRate(state, 'linh', 'all', rates);
  const distance = freightMarketRows(state, 'linh', 'all', 'distance');
  assert.equal(ranked.length, 18);
  const prices = ranked.map(row => rates.get(row.tileId) ?? -1);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
  for (const price of new Set(prices)) {
    const atPrice = (row: { tileId: number }) => (rates.get(row.tileId) ?? -1) === price;
    assert.deepEqual(ranked.filter(atPrice), distance.filter(atPrice));
  }
  assert.ok(rates.size > 0 && ranked.length > rates.size);
  assert.equal(marketPlanRates(state, 'minh', 'laden').size, 0);
});

test('a private receiving berth is eligible at its base rate, and redirects quote from the original booking', () => {
  const state = game();
  state.logistics!.ports[15].demand = 0;
  state.logistics!.market!.contract = { tenderId: 1, playerId: 'linh', kind: 'laden', destinationTileId: 15, amount: 9, deliveryRound: 1, status: 'active' };
  assert.equal(marketPlanRates(state, 'linh', 'laden').get(15), getFreightQuote(0, 15)!.reward);
  state.players[0].cargo = { bookingId: 3, kind: 'laden', originTileId: 0, destinationTileId: 3 };
  state.players[0].position = 14;
  const rates = marketPlanRates(state, 'linh', 'redirect');
  assert.equal(rates.has(3), false);
  assert.equal(rates.get(15), getFreightQuote(0, 15)!.reward);
  assert.notEqual(rates.get(15), getFreightQuote(14, 15)!.reward);
  const listed = marketRowsByRate(state, 'linh', 'all', rates);
  assert.ok(listed.slice(0, rates.size).some(row => row.tileId === 15));
});
