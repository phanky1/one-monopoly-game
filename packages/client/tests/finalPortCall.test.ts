import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCargoBookings, getCargoOpportunity, getCargoRedirections, getFeederRoutes, getLogisticsRoutes, getLogisticsStandings,
  getReserveImportTruckAction, LOGISTICS_ROUND_LIMIT, OneMonopolyEngine, type CargoKind, type GameAction, type GameState,
} from '@one-monopoly/shared';
import { getFinalPortCallOptions } from '../src/components/finalPortCall.js';

const seats = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'c', name: 'Chi', token: 'GANTRY_CRANE' as const },
];
const { createGame, dispatch } = OneMonopolyEngine;
function opening(round = LOGISTICS_ROUND_LIMIT) {
  const state = createGame('last-call', seats, 'logistics');
  state.turnCount = round;
  return state;
}
const actor = (s: GameState) => s.players[s.activePlayerIndex].id;
function apply(s: GameState, action: GameAction) {
  const result = dispatch(s, action, actor(s));
  assert.notEqual(result.state, s, action.type);
  return result.state;
}
function load(s: GameState, destination: number, kind: CargoKind = 'laden', reefer = false) {
  const booking = getCargoBookings(s, actor(s), kind, reefer).find(option => option.tileId === destination);
  assert.ok(booking);
  return apply(s, booking.action);
}
function sail(s: GameState, destination: number) {
  const option = getLogisticsRoutes(s, actor(s)).find(route => route.tileId === destination);
  assert.ok(option);
  return apply(s, option.action);
}
function options(s: GameState) {
  const before = structuredClone(s);
  const result = getFinalPortCallOptions(s, actor(s));
  assert.deepEqual(s, before);
  return result;
}
type Row = ReturnType<typeof getFinalPortCallOptions>[number];
const rank = (s: GameState, id: string) => 1 + getLogisticsStandings(s).findIndex(seat => seat.playerId === id);

// Each row sends only its first authoritative action. Compare its projected outcome with a separate, real discharge.
function settle(s: GameState, option: Row) {
  const id = actor(s);
  const balance = s.players[s.activePlayerIndex].balance;
  assert.equal(option.currentRank, rank(s, id));
  assert.equal(option.bookingId, s.players[s.activePlayerIndex].cargo?.bookingId);
  let result = apply(s, option.action);
  if (option.kind !== 'unload') {
    assert.equal(result.players[s.activePlayerIndex].balance, balance);
    const discharge = getCargoOpportunity(result, id)?.action;
    assert.ok(discharge?.type === 'UNLOAD_CARGO');
    result = apply(result, discharge);
  }
  assert.equal(result.players[s.activePlayerIndex].balance - balance, option.total);
  assert.equal(rank(result, id), option.projectedRank);
  assert.equal(dispatch(result, option.action, id).state, result, 'the old click cannot repeat a paid action');
  return result.players[s.activePlayerIndex].lastDelivery!;
}

test('shows the booked main voyage and the actual berth discharge when a held truck has emptied the public queue', () => {
  const aboard = load(opening(), 1);
  const held = apply(aboard, getReserveImportTruckAction(aboard, 'a')!);
  assert.equal(held.logistics!.ports[1].demand, 0);
  const choices = options(held);
  assert.deepEqual(choices.map(row => [row.kind, row.tileId, row.total]), [['sail', 1, 12]]);
  assert.deepEqual(choices[0].action, getLogisticsRoutes(held, 'a').find(route => route.tileId === 1)!.action);
  settle(held, choices[0]);
  const atPort = apply(held, choices[0].action);
  const [unload] = options(atPort);
  assert.equal(unload.kind, 'unload');
  assert.equal(unload.expiringReeferBonus, 0);
  assert.deepEqual(unload.action, getCargoOpportunity(atPort, 'a')!.action);
  assert.equal(settle(atPort, unload).reward, 12);
  assert.deepEqual(options(apply(atPort, unload.action)), []);
});

test('at an intermediate berth offers only the booked feeder and a payable local diversion; each pays its own quoted freight', () => {
  const intermediate = sail(load(opening(), 3, 'empty'), 1);
  const choices = options(intermediate);
  assert.deepEqual(choices.map(row => [row.kind, row.tileId]).sort(), [['feeder', 3], ['redirect', 1]]);
  const feeder = choices.find(row => row.kind === 'feeder')!;
  assert.deepEqual(feeder.action, getFeederRoutes(intermediate, 'a').find(route => route.tileId === 3)!.action);
  assert.equal(settle(intermediate, feeder).kind, 'empty');
  const change = choices.find(row => row.kind === 'redirect')!;
  assert.deepEqual(change.action, getCargoRedirections(intermediate, 'a').find(route => route.tileId === 1)!.action);
  assert.equal(settle(intermediate, change).tileId, 1);
  const noConnector = structuredClone(intermediate);
  noConnector.logistics!.feederAvailable!.a = false;
  assert.deepEqual(options(noConnector).map(row => row.kind), ['redirect']);
  noConnector.logistics!.ports[1].empties = noConnector.logistics!.ports[1].emptyTarget;
  assert.deepEqual(options(noConnector), []);
});

test('projects all earned premiums at a dedicated receiving berth and respects starting seat order in a complete three-way rank tie', () => {
  const round = opening();
  let s = apply(round, { type: 'END_TURN' });
  s = load(s, 1, 'laden', true);
  const captain = s.players[1];
  s.logistics!.market!.contract = { tenderId: 71, playerId: 'b', kind: 'laden', destinationTileId: 1,
    amount: 9, status: 'active', deliveryRound: s.turnCount };
  captain.backhaul = { bookingId: 70, originTileId: 0, destinationTileId: 1, status: 'active', offeredRound: 7, deadlineRound: 8 };
  s.logistics!.ports[1].demand = 0;
  Object.assign(s.logistics!.deliveries, { a: 2, b: 1, c: 2 });
  Object.assign(s.logistics!.earnings, { a: 35, b: 0, c: 35 });
  for (const player of s.players) player.balance = s.logistics!.earnings[player.id];
  const [leg] = options(s);
  assert.deepEqual([leg.kind, leg.currentRank, leg.projectedRank, leg.total], ['sail', 3, 2, 35]);
  assert.equal(leg.expiringReeferBonus, 8);
  const receipt = settle(s, leg);
  assert.deepEqual([receipt.reward, receipt.reeferBonus, receipt.tenderBonus, receipt.backhaulBonus], [12, 8, 9, 6]);
});

test('recognizes a delivery-target finish before round eight and skips inactive, blocked, stale and legacy-classic contexts', () => {
  const aboard = load(opening(2), 1);
  assert.deepEqual(options(aboard), []);
  aboard.logistics!.deliveries.c = 3;
  assert.deepEqual(options(aboard).map(row => row.kind), ['sail']);
  assert.deepEqual(getFinalPortCallOptions(aboard, 'b'), []);
  assert.deepEqual(getFinalPortCallOptions(aboard, 'absent'), []);
  for (const s of [opening(), { ...aboard, gameStarted: false }, { ...aboard, winnerId: 'c' }, createGame('classic', seats, 'classic')]) {
    assert.deepEqual(getFinalPortCallOptions(s, 'a'), []);
  }
  const oldRoom = structuredClone(aboard);
  delete oldRoom.logistics!.market;
  delete oldRoom.logistics!.importTruckAvailable;
  delete oldRoom.logistics!.importTruckReservations;
  assert.equal(options(oldRoom)[0].total, 12);
  oldRoom.logistics!.ports[1].demand = 0;
  assert.deepEqual(options(oldRoom), []);
  assert.deepEqual(options(sail(oldRoom, 1)), []);
});

test('before the last round only an immediately dischargeable reefer losing its premium this turn prompts the captain', () => {
  const cold = load(opening(1), 1, 'laden', true);
  assert.deepEqual(options(cold), []);
  assert.deepEqual(options(sail(cold, 3)), []);
  const canDivert = sail(load(opening(1), 17, 'laden', true), 1);
  assert.ok(getCargoRedirections(canDivert, 'a').some(choice => choice.tileId === 1));
  assert.deepEqual(options(canDivert), []);
  const ready = sail(cold, 1);
  const [unload] = options(ready);
  assert.deepEqual([unload.kind, unload.tileId, unload.total, unload.expiringReeferBonus], ['unload', 1, 20, 8]);
  assert.equal(settle(ready, unload).reeferBonus, 8);
  const warmer = sail(load(opening(1), 1), 1);
  assert.deepEqual(options(warmer), []);
  const later = structuredClone(ready);
  later.players[0].cargo!.reeferDueRound = 2;
  assert.deepEqual(options(later), []);
  const late = { ...ready, turnCount: 2 };
  assert.deepEqual(options(late), []);
  ready.logistics!.ports[1].demand = 0;
  assert.deepEqual(options(ready), []);
});
