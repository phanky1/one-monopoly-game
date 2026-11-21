import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getAcceptBackhaulAction, getCargoBookings, getCargoOpportunity, getCargoRedirections, getLogisticsRoutes, getReeferBonus,
  hasReeferSlot, isReeferPort, OneMonopolyEngine, REEFER_ON_TIME_BONUS,
  type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const start = () => createGame('cold-chain', seats, 'logistics');
const actor = (s: GameState) => s.players[s.activePlayerIndex].id;
const finishTurn = (s: GameState) => apply(s, { type: 'END_TURN' });
function apply(s: GameState, action: GameAction) {
  const result = dispatch(s, action, actor(s));
  assert.notEqual(result.state, s);
  assert.ok(result.events.length);
  return result.state;
}
function reject(s: GameState, action: GameAction) {
  const result = dispatch(s, action, actor(s));
  assert.equal(result.state, s);
  assert.deepEqual(result.events, []);
}
function cold(s: GameState, tileId: number) {
  const offer = getCargoBookings(s, actor(s), 'laden', true).find(o => o.tileId === tileId);
  assert.ok(offer);
  return offer.action;
}
function sail(s: GameState, tileId: number) {
  return apply(s, getLogisticsRoutes(s, actor(s)).find(route => route.tileId === tileId)!.action);
}
function unloading(s: GameState) {
  const action = getCargoOpportunity(s, actor(s))?.action;
  assert.ok(action?.type === 'UNLOAD_CARGO');
  return action;
}

describe('refrigerated freight', () => {
  it('requires ordinary laden stock and a cold-chain port at both ends; dry and legacy bookings remain unchanged', () => {
    const s = start();
    const action = cold(s, 17);
    assert.equal(action.reefer, true);
    assert.ok(isReeferPort(0) && isReeferPort(17));
    assert.ok(getCargoBookings(s, 'a', 'laden', true).every(o => isReeferPort(o.tileId)));
    const dry = getCargoBookings(s, 'a', 'laden').find(o => o.tileId === 3)!;
    assert.ok(dry);
    assert.equal(dry.action.reefer, undefined);
    assert.ok(!isReeferPort(3));
    reject(s, { ...action, destinationTileId: 3 });
    reject(s, { ...action, kind: 'empty' });
    assert.deepEqual(getCargoBookings(s, 'a', 'empty', true), []);
    const inland = sail(s, 3);
    assert.deepEqual(getCargoBookings(inland, 'a', 'laden', true), []);
    const dryDelivered = apply(s, dry.action);
    assert.equal(dryDelivered.players[0].cargo?.reeferDueRound, undefined);
    s.logistics!.ports[0].supply = 0;
    assert.deepEqual(getCargoBookings(s, 'a', 'laden', true), []);
    s.logistics!.ports[0].supply = 2;
    delete s.logistics!.reeferSlots;
    reject(s, action);
    assert.ok(getCargoBookings(s, 'a', 'laden').length);
  });

  it('shares one chilled pickup per origin per round across captains, then releases the plug next round', () => {
    const s = start();
    const action = cold(s, 17);
    const loaded = apply(s, action);
    const booking = loaded.players[0].cargo!;
    assert.equal(booking.reeferDueRound, 1);
    assert.deepEqual(loaded.logistics!.reeferSlots, { 0: 1 });
    assert.equal(loaded.logistics!.ports[0].supply, 1);
    reject(loaded, action);
    const other = finishTurn(loaded);
    assert.equal(hasReeferSlot(other, 0), false);
    assert.deepEqual(getCargoBookings(other, 'b', 'laden', true), []);
    assert.ok(getCargoBookings(other, 'b', 'laden').length);
    reject(other, { ...action, revision: other.cargoRevision! });
    const nextRound = finishTurn(other);
    assert.equal(nextRound.turnCount, 2);
    assert.ok(hasReeferSlot(nextRound, 0));
    const second = finishTurn(nextRound);
    assert.equal(apply(second, cold(second, 1)).players[1].cargo?.reeferDueRound, 2);
  });

  it('preserves the original deadline through reconnect and COD, stacks with tender once, and itemizes payment', () => {
    let s = start();
    s.logistics!.market!.contract = { tenderId: 90, deliveryRound: 1, playerId: 'a', kind: 'laden',
      destinationTileId: 17, amount: 6, status: 'active' };
    s = apply(s, cold(s, 1));
    s = JSON.parse(JSON.stringify(s));
    const cargo = s.players[0].cargo!;
    const choices = getCargoRedirections(s, 'a');
    assert.ok(choices.every(o => isReeferPort(o.tileId)));
    const change = choices.find(o => o.tileId === 17)!.action;
    reject(s, { ...change, destinationTileId: 3 });
    s = apply(s, change);
    assert.equal(s.players[0].cargo!.reeferDueRound, cargo.reeferDueRound);
    s = sail(s, 17);
    const action = unloading(s);
    const result = dispatch(s, action, 'a');
    const receipt = result.state.players[0].lastDelivery!;
    assert.equal(receipt.reeferBonus, REEFER_ON_TIME_BONUS);
    assert.equal(receipt.tenderBonus, 6);
    assert.equal(getReeferBonus(cargo, s.turnCount), 8);
    assert.equal(result.state.players[0].balance, receipt.reward + 14);
    assert.equal(result.state.logistics!.earnings.a, result.state.players[0].balance);
    assert.deepEqual(result.events[0], { type: 'CARGO_UNLOADED', playerId: 'a', ...receipt });
    reject(result.state, action);
    reject(result.state, { ...action, revision: result.state.cargoRevision! });
  });

  it('keeps the tender bonus on a late delivery and never renews the reefer premium on COD', () => {
    let s = start();
    s = apply(s, cold(s, 17));
    s = finishTurn(finishTurn(s));
    s.logistics!.market!.contract = { tenderId: 91, deliveryRound: 2, playerId: 'a', kind: 'laden',
      destinationTileId: 1, amount: 7, status: 'active' };
    const change = getCargoRedirections(s, 'a').find(o => o.tileId === 1)!.action;
    s = apply(s, change);
    s = sail(s, 1);
    const original = s.players[0].cargo!;
    assert.equal(getReeferBonus(original, s.turnCount), 0);
    s = apply(s, unloading(s));
    assert.equal(s.players[0].lastDelivery?.reeferBonus, 0);
    assert.equal(s.players[0].lastDelivery?.tenderBonus, 7);
    assert.equal(s.players[0].balance, s.players[0].lastDelivery!.reward + 7);
    assert.deepEqual(s.logistics!.deliveries, { a: 1, b: 0 });
  });

  it('itemizes reefer, backhaul and tender bonuses on the same return journey', () => {
    let s = start();
    s = apply(s, getCargoBookings(s, 'a', 'laden').find(o => o.tileId === 1)!.action);
    s = sail(s, 1);
    s = apply(s, unloading(s));
    s = apply(s, getAcceptBackhaulAction(s, 'a')!);
    s = finishTurn(finishTurn(s));
    s.logistics!.market!.contract = { tenderId: 92, deliveryRound: s.turnCount, playerId: 'a', kind: 'laden',
      destinationTileId: 0, amount: 9, status: 'active' };
    s = apply(s, cold(s, 0));
    s = sail(s, 0);
    const priorBalance = s.players[0].balance;
    const pay = unloading(s);
    s = apply(s, pay);
    const receipt = s.players[0].lastDelivery!;
    assert.deepEqual([receipt.reeferBonus, receipt.backhaulBonus, receipt.tenderBonus], [8, 6, 9]);
    assert.equal(s.players[0].balance - priorBalance, receipt.reward + 8 + 6 + 9);
    reject(s, pay);
  });
});
