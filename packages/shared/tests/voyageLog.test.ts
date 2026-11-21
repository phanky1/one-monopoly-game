import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAcceptBackhaulAction, getCargoBookings, getCargoOpportunity, getLogisticsRoutes, getTenderBidAction,
  getVoyagePayment, OneMonopolyEngine, type GameAction, type GameState,
} from '../src/index.js';

const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const game = () => OneMonopolyEngine.createGame('journal', seats, 'logistics');
function act(s: GameState, action: GameAction) {
  const r = OneMonopolyEngine.dispatch(s, action, s.players[s.activePlayerIndex].id);
  assert.notEqual(r.state, s, action.type);
  return r.state;
}
function book(s: GameState, destination: number, reefer = false) {
  const offer = getCargoBookings(s, 'a', 'laden', reefer).find(choice => choice.tileId === destination);
  assert.ok(offer);
  return act(s, offer.action);
}
function sail(s: GameState, destination: number) {
  return act(s, getLogisticsRoutes(s, 'a').find(choice => choice.tileId === destination)!.action);
}
function unload(s: GameState) {
  const action = getCargoOpportunity(s, 'a')!.action;
  assert.equal(action.type, 'UNLOAD_CARGO');
  return action;
}

test('the ledger records each actual discharge once, including all settled premiums', () => {
  let s = game();
  assert.equal(s.logistics!.voyageLog?.length, 0);
  s.players[0].position = 17;
  s = book(s, 0);
  s = sail(s, 0);
  assert.equal(s.logistics!.voyageLog?.length, 0);
  s = act(s, unload(s));
  const first = s.logistics!.voyageLog![0];
  assert.deepEqual(first, { bookingId: 1, playerId: 'a', round: 1, originTileId: 17, destinationTileId: 0,
    kind: 'laden', distanceNm: 2472, baseFreight: 16 });
  s = act(s, getAcceptBackhaulAction(s, 'a')!);
  s = act(s, getTenderBidAction(s, 'a', 6)!);
  s = act(act(s, { type: 'END_TURN' }), { type: 'END_TURN' });
  s = book(s, 17, true);
  s = sail(s, 17);
  const request = unload(s);
  const settled = act(s, request);
  const log = settled.logistics!.voyageLog!;
  assert.equal(log.length, 2);
  assert.deepEqual(log[0], first);
  assert.deepEqual(log[1], { bookingId: s.players[0].cargo!.bookingId, playerId: 'a', round: 2, originTileId: 0,
    destinationTileId: 17, kind: 'laden', distanceNm: 2472, baseFreight: 16,
    reeferBonus: 8, backhaulBonus: 6, tenderBonus: 6 });
  assert.equal(log.reduce((sum, entry) => sum + getVoyagePayment(entry), 0), settled.players[0].balance);
  const restored = structuredClone(settled);
  assert.equal(OneMonopolyEngine.dispatch(restored, request, 'a').state, restored);
  assert.deepEqual(restored.logistics!.voyageLog, log);
  assert.equal(s.logistics!.voyageLog!.length, 1);
});

test('an older room starts its log on its next delivery without inventing past voyages', () => {
  let s = game();
  delete s.logistics!.voyageLog;
  s.logistics!.deliveries.a = 1;
  s = book(s, 3);
  const cod = { type: 'CHANGE_DESTINATION', bookingId: s.players[0].cargo!.bookingId, destinationTileId: 1,
    revision: s.cargoRevision! } as const;
  s = act(s, cod);
  s = sail(s, 1);
  assert.equal(s.logistics!.voyageLog, undefined);
  s = act(s, unload(s));
  assert.equal(s.logistics!.deliveries.a, 2);
  assert.equal(s.logistics!.voyageLog!.length, 1);
  assert.equal(s.logistics!.voyageLog![0].destinationTileId, 1);
  assert.equal(s.logistics!.voyageLog![0].reeferBonus, undefined);
});

test('the receipt distinguishes empty equipment and a late reefer with zero premium', () => {
  let cold = book(game(), 17, true);
  cold = act(act(cold, { type: 'END_TURN' }), { type: 'END_TURN' });
  cold = sail(cold, 17);
  cold = act(cold, unload(cold));
  assert.equal(cold.logistics!.voyageLog![0].reeferBonus, 0);

  let empty = game();
  empty = act(empty, getCargoBookings(empty, 'a', 'empty').find(b => b.tileId === 1)!.action);
  empty = sail(empty, 1);
  empty = act(empty, unload(empty));
  const entry = empty.logistics!.voyageLog![0];
  assert.equal(entry.kind, 'empty');
  assert.equal(entry.reeferBonus, undefined);
  assert.equal(getVoyagePayment(entry), empty.logistics!.earnings.a);
});
