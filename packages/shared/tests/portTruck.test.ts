import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OneMonopolyEngine, getCargoBookings, getCargoOpportunity, getEarlyTruckCalls, getLogisticsRoutes, getPortTruckSchedule,
  type GameAction, type GameState, type TruckOperation,
} from '../src/index.js';
import { getNextRoundReceivingSlots } from '../src/cargo.js';

const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const fresh = () => OneMonopolyEngine.createGame('trucks', seats, 'logistics');
const captain = (state: GameState) => state.players[state.activePlayerIndex].id;
function apply(state: GameState, action: GameAction) {
  const result = OneMonopolyEngine.dispatch(state, action, captain(state));
  assert.notEqual(result.state, state, `expected ${action.type} to be accepted`);
  return result.state;
}
const end = (state: GameState) => apply(state, { type: 'END_TURN' });
const actionFor = (state: GameState, operation: TruckOperation) => {
  const chosen = getEarlyTruckCalls(state, captain(state)).find(call => call.operation === operation);
  assert.ok(chosen, `expected an eligible ${operation} call`);
  return chosen.action;
};
const reject = (state: GameState, action: GameAction, id = captain(state)) => {
  const result = OneMonopolyEngine.dispatch(state, action, id);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
};

test('each captain can advance one of the two Singapore operations without using a voyage or paying freight', () => {
  let state = end(end(fresh()));
  const original = structuredClone(state);
  const schedule = getPortTruckSchedule(state, 0)!;
  assert.equal(schedule.scheduledRound, 3);
  assert.deepEqual(schedule.before, { supply: 2, demand: 2, empties: 4, emptyTarget: 1 });
  assert.deepEqual(schedule.projected, { supply: 3, demand: 3, empties: 3, emptyTarget: 1 });
  assert.deepEqual(schedule.operations.map(op => [op.operation, op.available, op.consumed]), [['export', true, false], ['import', true, false]]);
  const choice = actionFor(state, 'export');
  assert.deepEqual(state, original);
  reject(state, choice, 'b');
  reject(state, {...choice, tileId: 1});
  reject(state, {...choice, revision: 0});
  const result = OneMonopolyEngine.dispatch(state, choice, 'a');
  state = result.state;
  assert.deepEqual(result.events, [{type:'PORT_TRUCK_CALLED', playerId:'a', tileId:0, operation:'export', scheduledRound:3}]);
  assert.deepEqual(state.logistics!.ports[0], schedule.operations[0].after);
  assert.equal(state.cargoRevision, original.cargoRevision! + 1);
  assert.equal(state.logistics!.earlyTruckAvailable!.a, false);
  assert.equal(state.logistics!.hasSailed, false);
  assert.equal(state.phase, 'AWAITING_SAIL');
  assert.deepEqual(state.players, original.players);
  assert.deepEqual(state.logistics!.earnings, original.logistics!.earnings);
  assert.deepEqual(state.logistics!.voyageLog, []);
  reject(state, choice);
  reject(state, {...choice, operation: 'import', revision: state.cargoRevision!});
  state = end(state);
  const remaining = getEarlyTruckCalls(state, 'b');
  assert.deepEqual(remaining.map(c => c.operation), ['import']);
  reject(state, {...choice, revision:state.cargoRevision!});
  state = apply(state, remaining[0].action);
  assert.ok(getPortTruckSchedule(state, 0)!.operations.every(op => op.consumed && !op.available));
  assert.deepEqual(state.logistics!.ports[0], schedule.projected);
  state = end(state);
  assert.deepEqual(state.logistics!.ports[0], schedule.projected);
  assert.deepEqual(state.logistics!.calledTrucks, {});
  assert.deepEqual(state.logistics!.earlyTruckAvailable, {a:false,b:false});
});

test('bringing forward one operation leaves the other to normal rollover and does not duplicate COD projected receiving capacity', () => {
  let state = end(end(fresh()));
  const yard = state.logistics!.ports[0];
  Object.assign(yard, {supply:1, demand:2, empties:3, emptyTarget:3});
  const projected = getPortTruckSchedule(state, 0)!.projected;
  assert.deepEqual([getNextRoundReceivingSlots(state, 0, 'empty'), getNextRoundReceivingSlots(state, 0, 'laden')], [1,3]);
  state = apply(state, actionFor(state,'export'));
  assert.deepEqual([getNextRoundReceivingSlots(state, 0, 'empty'), getNextRoundReceivingSlots(state, 0, 'laden')], [1,3]);
  assert.deepEqual(getPortTruckSchedule(state, 0)!.projected, projected);
  state = end(end(state));
  assert.deepEqual(state.logistics!.ports[0], projected);
});

test('an import call after sailing to Hamburg makes a real laden discharge possible, once', () => {
  let state = fresh();
  const job = getCargoBookings(state, 'a', 'laden').find(c => c.tileId === 1)!;
  state = apply(state, job.action);
  state = apply(state, getLogisticsRoutes(state, 'a').find(r => r.tileId === 14)!.action);
  assert.equal(state.phase, 'END_OF_TURN');
  const booked = structuredClone(state.players[0].cargo);
  assert.equal(state.logistics!.ports[14].demand, 0);
  state = apply(state, actionFor(state,'import'));
  assert.equal(state.logistics!.hasSailed, true);
  assert.deepEqual(state.players[0].cargo, booked);
  state = apply(state, {type:'CHANGE_DESTINATION', bookingId:booked!.bookingId, destinationTileId:14, revision:state.cargoRevision!});
  state = apply(state, getCargoOpportunity(state,'a')!.action);
  assert.equal(state.logistics!.ports[14].demand, 0);
  state = end(end(state));
  assert.equal(state.logistics!.ports[14].demand, 0, 'the called import must not reappear at rollover');
});

test('a scheduled operation can be blocked by the yard and becomes available only after stock changes', () => {
  let state = fresh();
  const catLai = getPortTruckSchedule(state, 1)!;
  assert.equal(catLai.scheduledRound, 2);
  assert.deepEqual(catLai.operations.map(call => [call.operation, call.available, call.consumed]), [['export',false,false]]);
  assert.deepEqual(catLai.operations[0].after, catLai.before);
  state = apply(state, getCargoBookings(state, 'a', 'laden').find(c => c.tileId === 1)!.action);
  state = apply(state, getLogisticsRoutes(state, 'a').find(c => c.tileId === 1)!.action);
  assert.deepEqual(getEarlyTruckCalls(state, 'a'), []);
  state = apply(state, getCargoOpportunity(state, 'a')!.action);
  const before = { ...state.logistics!.ports[1] };
  const call = actionFor(state, 'export');
  assert.equal(before.empties, 1);
  state = apply(state, call);
  assert.deepEqual(state.logistics!.ports[1], {...before, supply:before.supply+1, empties:0});
  const full = end(end(fresh()));
  Object.assign(full.logistics!.ports[0], {supply:4, demand:4, empties:3});
  assert.deepEqual(getEarlyTruckCalls(full, 'a'), []);
  assert.ok(getPortTruckSchedule(full, 0)!.operations.every(call => !call.consumed && !call.available));
  reject(full, {type:'CALL_PORT_TRUCK', tileId:0, operation:'import', revision:full.cargoRevision!});
  assert.equal(full.logistics!.earlyTruckAvailable!.a, true);
});

test('a quiet schedule, final round, old room or invalid actor never grants an early call', () => {
  const roundOne = fresh();
  const quiet = getPortTruckSchedule(roundOne, 0)!;
  assert.deepEqual(quiet.operations, []);
  assert.deepEqual(quiet.before, quiet.projected);
  for (const invalid of [2, -1, NaN, 1.5, 72]) assert.equal(getPortTruckSchedule(roundOne, invalid), null);
  const state = end(end(roundOne));
  const call = actionFor(state, 'import');
  const last = structuredClone(state);
  last.turnCount = 8;
  const suddenEnd = structuredClone(state);
  suddenEnd.logistics!.deliveries.b = 3;
  const legacy = structuredClone(state);
  delete legacy.logistics!.earlyTruckAvailable;
  delete legacy.logistics!.calledTrucks;
  const finished = structuredClone(state);
  finished.winnerId = 'a';
  const classic = OneMonopolyEngine.createGame('classic', seats, 'classic');
  for (const disabled of [last, suddenEnd, legacy, finished, classic]) {
    assert.equal(getPortTruckSchedule(disabled, 0), null);
    assert.deepEqual(getEarlyTruckCalls(disabled, 'a'), []);
    reject(disabled, call);
  }
  const next = end(end(legacy));
  assert.deepEqual(next.logistics!.ports[0], {supply:3, demand:3, empties:3, emptyTarget:1});
  assert.equal(next.logistics!.earlyTruckAvailable, undefined);
  assert.equal(next.logistics!.calledTrucks, undefined);
  const held = structuredClone(state);
  held.players[0].inHold = true;
  assert.deepEqual(getEarlyTruckCalls(held, 'a'), []);
  reject(held, call);
  reject(state, {...call, operation:'EXPORT'} as unknown as GameAction);
});
