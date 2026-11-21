import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD_TILES, GREEN_FLEET_COST, SECRET_MISSIONS } from '../src/boardData.js';
import { OneMonopolyEngine } from '../src/gameEngine.js';
import { getMissionProgress } from '../src/missionProgress.js';

const { createGame, dispatch } = OneMonopolyEngine;
const players = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const },
  { id: 'c', name: 'Chi', token: 'GANTRY_CRANE' as const },
];

function mission(id: string) {
  return { ...SECRET_MISSIONS.find(card => card.id === id)! };
}

test('all five missions use the printed ownership objectives, including the three-of-four route', () => {
  const state = createGame('objectives', players);
  const expected = [
    [3, 23, 28], [31, 17], [10, 22], [4, 13, 20, 28], [1, 3, 4],
  ];
  for (const [index, tileIds] of expected.entries()) {
    state.players[0].secretMission = mission('MISSION-' + (index + 1));
    const progress = getMissionProgress(state, 'a')!;
    assert.equal(progress.current, 0);
    assert.equal(progress.target, 3);
    assert.deepEqual(progress.objectives.filter(row => row.tileId !== undefined).map(row => [row.tileId, row.label]),
      tileIds.map(id => [id, BOARD_TILES[id].name]));
    assert.equal(new Set(progress.objectives.map(row => row.key)).size, progress.objectives.length);
  }
  state.players[0].secretMission = mission('MISSION-4');
  for (const [index, id] of [4, 13, 20, 28].entries()) {
    state.properties[id].ownerId = 'a';
    state.properties[id].isMortgaged = true; // The contract requires ownership.
    const progress = getMissionProgress(state, 'a')!;
    assert.equal(progress.current, Math.min(index + 1, 3));
    assert.equal(progress.objectives.filter(row => row.achieved).length, index + 1);
  }
  const paid = dispatch(state, { type: 'CLAIM_MISSION_REWARD' });
  assert.equal(paid.state.players[0].balance, 1950);
  assert.equal(paid.events.filter(e => e.type === 'MISSION_COMPLETED').length, 1);
  for (const id of [4, 13, 20]) paid.state.properties[id].ownerId = 'b';
  assert.equal(getMissionProgress(paid.state, 'a')!.current, 1);
  assert.equal(paid.state.players[0].secretMission?.isCompleted, true);
  assert.deepEqual(dispatch(paid.state, { type: 'CLAIM_MISSION_REWARD' }).events, []);
});

for (const [id, key, upgrade] of [
  ['MISSION-2', 'innovation', 'BUILD_CONTAINER'],
  ['MISSION-3', 'green-fleet', 'UPGRADE_GREEN_FLEET'],
] as const) {
  test(id + ' directs the captain to a suitable owned port and pays on the qualifying upgrade', () => {
    const state = createGame('upgrade', players);
    state.players[0].secretMission = mission(id);
    const row = () => getMissionProgress(state, 'a')!.objectives.find(objective => objective.key === key)!;
    state.properties[5].ownerId = 'b';
    state.properties[5].containerLevel = 5;
    state.properties[5].hasGreenFleet = true;
    state.properties[7].ownerId = 'a';
    state.properties[7].isMortgaged = true;
    assert.equal(row().achieved, false);
    assert.equal(row().tileId, undefined);
    for (const tileId of (id === 'MISSION-2' ? [31, 17] : [10, 22])) state.properties[tileId].ownerId = 'a';
    state.properties[9].ownerId = 'a';
    state.properties[9].containerLevel = id === 'MISSION-2' ? 4 : 5;
    state.properties[11].ownerId = 'a';
    state.properties[11].containerLevel = 3;
    assert.equal(row().tileId, 9);
    assert.equal(getMissionProgress(state, 'a')!.current, 2);
    state.players[0].position = 6;
    const visit = dispatch(state, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    const upgraded = dispatch(visit.state, { type: upgrade, tileId: 9 });
    const reward = state.players[0].secretMission.reward;
    const cost = id === 'MISSION-2' ? BOARD_TILES[9].buildCost! : GREEN_FLEET_COST;
    assert.equal(upgraded.state.players[0].balance, 1500 - cost + reward);
    assert.equal(upgraded.events.filter(e => e.type === 'MISSION_COMPLETED').length, 1);
    const fulfilled = getMissionProgress(upgraded.state, 'a')!;
    assert.equal(fulfilled.current, 3);
    assert.equal(fulfilled.objectives.find(objective => objective.key === key)?.achieved, true);
    assert.equal(fulfilled.objectives.find(objective => objective.key === key)?.tileId, 9);
    assert.deepEqual(dispatch(upgraded.state, { type: 'CLAIM_MISSION_REWARD' }).events, []);
  });
}

test('a bank purchase completes the route and pays the buyer exactly once', () => {
  const state = createGame('purchase', players);
  state.players[0].secretMission = mission('MISSION-5');
  state.properties[1].ownerId = 'a';
  state.properties[4].ownerId = 'a';
  const landed = dispatch(state, { type: 'ROLL_DICE', forcedDice: [1, 2] });
  assert.equal(getMissionProgress(landed.state, 'a')?.current, 2);
  const purchased = dispatch(landed.state, { type: 'BUY_PROPERTY' });
  assert.equal(purchased.state.players[0].balance, 1790);
  assert.deepEqual(purchased.events.filter(e => e.type === 'MISSION_COMPLETED').map(e => e.playerId), ['a']);
  assert.equal(getMissionProgress(purchased.state, 'a')?.current, 3);
  assert.deepEqual(dispatch(purchased.state, { type: 'BUY_PROPERTY' }).events, []);
});

for (const count of [2, 3]) {
  test('a bankruptcy transfer rewards the creditor once in a game with ' + count + ' captains', () => {
    const state = createGame('creditor', players.slice(0, count));
    const creditor = state.players[count - 1];
    creditor.secretMission = mission('MISSION-1');
    state.properties[3].ownerId = creditor.id;
    state.properties[23].ownerId = 'a';
    state.properties[28].ownerId = 'a';
    state.players[0].balance = 1;
    const rent = dispatch(state, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    assert.equal(rent.state.pendingDebt?.creditorId, creditor.id);
    const settled = dispatch(rent.state, { type: 'DECLARE_BANKRUPTCY' });
    assert.equal(settled.state.players[count - 1].balance, 1901);
    assert.equal(getMissionProgress(settled.state, creditor.id)?.current, 3);
    assert.equal(settled.state.players[count - 1].secretMission?.isCompleted, true);
    assert.deepEqual(settled.events.filter(e => e.type === 'MISSION_COMPLETED').map(e => e.playerId), [creditor.id]);
    assert.equal(settled.state.winnerId, count === 2 ? creditor.id : null);
  });
}

test('missing or unknown missions provide no progress and grant no reward', () => {
  const state = createGame('legacy', players);
  assert.equal(getMissionProgress(state, 'spectator'), null);
  delete state.players[0].secretMission;
  assert.equal(getMissionProgress(state, 'a'), null);
  state.players[0].secretMission = { ...mission('MISSION-1'), id: 'unknown-mission' };
  assert.equal(getMissionProgress(state, 'a'), null);
  assert.deepEqual(dispatch(state, { type: 'CLAIM_MISSION_REWARD' }).events, []);
});
