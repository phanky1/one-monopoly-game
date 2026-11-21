import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHarborFreightOpportunity, OneMonopolyEngine, type GameState } from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [
  { id: 'carrier', name: 'An', token: 'ONE_APUS' as const },
  { id: 'owner', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'buyer', name: 'Chi', token: 'GANTRY_CRANE' as const },
];
function arrive(ownerId: string, load = true) {
  let state = createGame('trade-quote', seats, 'harbor');
  state.properties[11].ownerId = ownerId;
  if (load) state = dispatch(state, getHarborFreightOpportunity(state, 'carrier')!.action, 'carrier').state;
  return dispatch(state, { type: 'ROLL_DICE', forcedDice: [5, 6] }, 'carrier').state;
}
function propose(state: GameState, tileId: number, buyerId: string, sellerId: string) {
  const result = dispatch(state, { type: 'OFFER_TRADE', tileId, sellerId, price: 100 }, buyerId);
  const event = result.events[0];
  assert.ok(event?.type === 'TRADE_OFFERED');
  return { state: result.state, id: event.offer.id };
}
function accept(state: GameState, offerId: number, actor: string) {
  const result = dispatch(state, { type: 'RESPOND_TRADE', offerId, accept: true }, actor);
  assert.ok(result.events.some(event => event.type === 'TRADE_CLOSED' && event.result === 'ACCEPTED'));
  return result.state;
}
function due(state: GameState) {
  const op = getHarborFreightOpportunity(state, 'carrier');
  assert.ok(op?.kind === 'discharge');
  return op;
}

test('offer and counter preserve an outstanding discharge until the accepted sale changes who earns the fee', () => {
  const atPort = arrive('owner');
  const original = due(atPort);
  const offered = propose(atPort, 11, 'buyer', 'owner');
  const counter = dispatch(offered.state, { type: 'COUNTER_TRADE', offerId: offered.id, price: 125 }, 'owner');
  const event = counter.events[0];
  assert.ok(event?.type === 'TRADE_COUNTERED');
  assert.deepEqual(due(offered.state), original);
  assert.deepEqual(due(counter.state), original);
  const sold = accept(counter.state, event.offer.id, 'buyer');
  assert.equal(counter.state.harborFreight!.revision, atPort.harborFreight!.revision);
  assert.equal(sold.harborFreight!.revision, original.action.revision + 1);
  assert.equal(dispatch(sold, original.action, 'carrier').state, sold);
  const current = due(sold);
  assert.deepEqual([current.quote.operatorId, current.quote.handlingFee, current.quote.carrierNet], ['buyer', 5, 17]);
  const settled = dispatch(sold, current.action, 'carrier');
  assert.deepEqual(settled.state.players.map((p, i) => p.balance - sold.players[i].balance), [17, 0, 5]);
});

test('a sibling port sale can change the live fee from 25% to 50% without changing the berth operator', () => {
  const atPort = arrive('owner');
  atPort.properties[9].ownerId = 'owner';
  atPort.properties[12].ownerId = 'buyer';
  const offered = propose(atPort, 12, 'owner', 'buyer');
  const original = due(offered.state);
  assert.equal(original.quote.feePercent, 25);
  const sold = accept(offered.state, offered.id, 'buyer');
  assert.equal(dispatch(sold, original.action, 'carrier').state, sold);
  const current = due(sold);
  assert.equal(current.quote.operatorId, original.quote.operatorId);
  assert.equal(current.quote.feePercent, 50);
  const paid = dispatch(sold, current.action, 'carrier').state;
  assert.deepEqual(paid.players.map((p, i) => p.balance - sold.players[i].balance), [11, 11, 0]);
});

test('an unrelated sale and an incomplete-group sibling sale leave the same discharge confirmable', () => {
  for (const tileId of [1, 9]) {
    const atPort = arrive('owner');
    atPort.properties[tileId].ownerId = 'buyer';
    const original = due(atPort);
    const offer = propose(atPort, tileId, 'owner', 'buyer');
    const sold = accept(offer.state, offer.id, 'buyer');
    assert.deepEqual(due(sold), original);
    const settled = dispatch(sold, original.action, 'carrier');
    assert.deepEqual(settled.state.players.map((p, i) => p.balance - sold.players[i].balance), [17, 5, 0]);
  }
});

test('selling then repurchasing the loading berth cannot revive a stale loading command', () => {
  const atPort = arrive('carrier', false);
  const load = getHarborFreightOpportunity(atPort, 'carrier');
  assert.ok(load?.kind === 'load');
  const sale = propose(atPort, 11, 'buyer', 'carrier');
  const sold = accept(sale.state, sale.id, 'carrier');
  assert.equal(getHarborFreightOpportunity(sold, 'carrier'), null);
  assert.equal(sold.harborFreight!.revision, load.action.revision + 1);
  const buyback = propose(sold, 11, 'carrier', 'buyer');
  const restored = accept(buyback.state, buyback.id, 'buyer');
  assert.equal(restored.harborFreight!.revision, load.action.revision + 2);
  assert.equal(dispatch(restored, load.action, 'carrier').state, restored);
  const fresh = getHarborFreightOpportunity(restored, 'carrier');
  assert.ok(fresh?.kind === 'load');
  assert.deepEqual(dispatch(restored, fresh.action, 'carrier').state.harborFreight!.manifests.carrier, { originTileId: 11 });
});
