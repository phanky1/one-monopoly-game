import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARD_TILES, OneMonopolyEngine, getHarborFreightOpportunity, getHarborPurchase, getHarborTurnaround,
  type GameState,
} from '@one-monopoly/shared';
import { getHarborAtlasRoute } from '../src/components/ports/harborAtlasRoute.js';
import { readPortLanding } from '../src/components/ports/portArrival.js';
import { portGuide, type PortArrival } from '../src/components/ports/portGuide.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'minh', name: 'Minh', token: 'ONE_APUS' as const },
  { id: 'linh', name: 'Linh', token: 'PILOT_BOAT' as const },
];

function loaded() {
  const state = createGame('atlas-route', seats, 'harbor');
  const load = getHarborFreightOpportunity(state, 'minh');
  assert.ok(load?.kind === 'load');
  return dispatch(state, load.action, 'minh').state;
}

function roll(state: GameState, dice: [number, number]) {
  const result = dispatch(state, { type: 'ROLL_DICE', forcedDice: dice }, state.players[state.activePlayerIndex].id);
  const landing = readPortLanding(result.state, result.events);
  assert.ok(landing);
  return { state: result.state, arrival: { ...landing, id: 1 } };
}

function atCaiMep(level = 0) {
  const state = loaded();
  Object.assign(state.properties[3], { ownerId: 'linh', containerLevel: level });
  return roll(state, [1, 2]);
}

test('following the container through an intermediate port keeps its true load origin and live deed terms', () => {
  const first = atCaiMep();
  let next = dispatch(first.state, { type: 'END_TURN' }, 'minh').state;
  next = roll(next, [1, 2]).state;
  next = dispatch(next, { type: 'END_TURN' }, 'linh').state;
  next.properties[7].ownerId = 'linh';
  const { state, arrival } = roll(next, [1, 3]);
  assert.equal(arrival.origin?.code, 'VNVUT');
  const chart = getHarborAtlasRoute(state, arrival, 7);
  assert.ok(chart?.kind === 'available');
  assert.equal(chart.origin.code, 'SGSIN');
  assert.equal(chart.destination.code, BOARD_TILES[7].code);
  assert.equal(chart.playerName, 'Minh');
  assert.equal(chart.receipt, null);
  const discharge = getHarborFreightOpportunity(state, 'minh');
  assert.ok(discharge?.kind === 'discharge');
  assert.deepEqual(chart.quote, discharge.quote);
  assert.equal(chart.quote.feePercent, 25);

  state.properties[5].ownerId = 'linh';
  assert.equal(getHarborAtlasRoute(state, arrival, 7)?.quote.feePercent, 50);
});

test('a turnaround shows only the delivered leg and retains the actual split after the deed changes', () => {
  const { state, arrival } = atCaiMep(1);
  const action = getHarborTurnaround(state, 'minh')?.action;
  assert.ok(action);
  const exchanged = dispatch(state, action, 'minh').state;
  assert.equal(exchanged.harborFreight?.manifests.minh?.originTileId, 3);
  exchanged.properties[1].ownerId = 'linh';

  const chart = getHarborAtlasRoute(exchanged, arrival, 3);
  assert.ok(chart?.kind === 'delivered');
  assert.equal(chart.origin.code, 'SGSIN');
  assert.equal(chart.receipt.turnaround?.fee, 3);
  assert.deepEqual([chart.quote.gross, chart.quote.handlingFee, chart.quote.carrierNet], [12, 3, 9]);
  assert.deepEqual(chart.receipt, exchanged.harborFreight?.lastDelivery);
  const after = dispatch(exchanged, { type: 'END_TURN' }, 'minh').state;
  assert.equal(getHarborAtlasRoute(after, arrival, 3), null);
});

test('purchase settlement opens a receipt-only route with its real purchase price after the deed decision', () => {
  const { state, arrival } = roll(loaded(), [1, 2]);
  assert.equal(state.phase, 'AWAITING_BUY_DECISION');
  assert.equal(getHarborAtlasRoute(state, arrival, 3), null);
  const auction = dispatch(state, { type: 'SKIP_BUY' }, 'minh').state;
  assert.equal(getHarborAtlasRoute(auction, arrival, 3), null);
  const purchase = getHarborPurchase(state, 'minh');
  assert.ok(purchase);
  const settled = dispatch(state, purchase.action, 'minh').state;
  const chart = getHarborAtlasRoute(settled, arrival, 3);
  assert.ok(chart?.kind === 'delivered');
  assert.deepEqual([chart.quote.carrierNet, chart.receipt.purchasePrice], [12, 60]);
});

test('a Singapore arrival charts the export from its real port without counting the pass-Go payment as freight', () => {
  const state = createGame('atlas-hub', seats, 'harbor');
  // A ship on the far side of the board is still carrying its Cái Mép export.
  state.players[0].position = BOARD_TILES.length - 3;
  state.harborFreight!.manifests.minh = { originTileId: 3 };
  const { state: arrived, arrival } = roll(state, [1, 2]);
  const route = getHarborAtlasRoute(arrived, arrival, 0);
  assert.ok(route?.kind === 'available');
  assert.equal(route.origin.code, 'VNVUT');
  assert.equal(route.destination.code, 'SGSIN');
  assert.deepEqual([route.quote.gross, route.quote.handlingFee, route.quote.operatorId], [12, 0, null]);
  const offer = getHarborFreightOpportunity(arrived, 'minh');
  assert.ok(offer?.kind === 'discharge');
  const settled = dispatch(arrived, offer.action, 'minh').state;
  assert.equal(getHarborAtlasRoute(settled, arrival, 0)?.receipt?.carrierNet, 12);
});

test('other modes, manual browsing, empty holds, older receipts and inactive captains do not show a route', () => {
  const { state, arrival } = atCaiMep();
  const manual: PortArrival = { id: 2, port: portGuide.VNVUT };
  assert.equal(getHarborAtlasRoute(state, manual, 3), null);
  assert.equal(getHarborAtlasRoute(state, { ...arrival, port: portGuide.SGSIN }, 3), null);
  assert.equal(getHarborAtlasRoute(state, arrival, 7), null);
  for (const mode of ['logistics', 'classic'] as const) {
    assert.equal(getHarborAtlasRoute({ ...state, mode }, arrival, 3), null);
  }
  assert.equal(getHarborAtlasRoute({ ...state, winnerId: 'linh' }, arrival, 3), null);
  const harbor = state.harborFreight!;
  assert.equal(getHarborAtlasRoute({ ...state, harborFreight: { ...harbor, manifests: { minh: null } } }, arrival, 3), null);

  const discharge = getHarborFreightOpportunity(state, 'minh');
  assert.ok(discharge?.kind === 'discharge');
  const settled = dispatch(state, discharge.action, 'minh').state;
  assert.equal(getHarborAtlasRoute(settled, arrival, 3)?.kind, 'delivered');
  const published = settled.harborFreight!;
  assert.equal(getHarborAtlasRoute({ ...settled, turnCount: settled.turnCount + 1 }, arrival, 3), null);
  assert.equal(getHarborAtlasRoute({ ...settled, harborFreight: { ...published, revision: published.revision + 1 } }, arrival, 3), null);
  assert.equal(getHarborAtlasRoute({ ...settled, harborFreight: { ...published, visits: { minh: { tileId: 3, handled: false } } } }, arrival, 3), null);
});
