import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomManager } from '../dist/roomManager.js';

function createRoom(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const events = [];
  const manager = new RoomManager({
    onBroadcastUpdate: (_id, _state, emitted) => events.push(...emitted),
  });
  const { room, playerId: captainId, sessionToken } = manager.createRoom('Captain', 'ONE_APUS', 'host');
  const { playerId: ownerId } = manager.joinRoom(room.id, 'Port owner', 'GANTRY_CRANE', 'guest');
  assert.ok(ownerId);
  assert.equal(manager.startGame(room.id, captainId, 'classic').success, true);
  t.after(() => room.timer.stop());

  room.gameState.players[0].position = 3;
  room.gameState.opsDeck = ['OPS-02', ...room.gameState.opsDeck.filter((card) => card !== 'OPS-02')];
  return { manager, room, captainId, ownerId, sessionToken, events };
}

function drawStorm(t, { manager, room, captainId }) {
  t.mock.timers.tick(34_000);
  assert.equal(room.timer.getRemainingSeconds(), 11);
  const roll = manager.dispatchSocketAction('host', {
    roomId: room.id, playerId: captainId, action: { type: 'ROLL_DICE', forcedDice: [1, 2] },
  });
  assert.equal(roll.success, true);
  assert.ok(roll.events.some((event) => event.type === 'CARD_DRAWN' && event.card.id === 'OPS-02'));
  assert.equal(room.gameState.players[0].position, 6);
  assert.equal(room.gameState.phase, 'AWAITING_STORM_DECISION');
  assert.equal(room.timer.getRemainingSeconds(), 45);
}

test('only the active captain can resolve the storm, including after reconnecting', (t) => {
  const fixture = createRoom(t);
  const { manager, room, captainId, ownerId, sessionToken, events } = fixture;
  drawStorm(t, fixture);
  t.mock.timers.tick(13_000);
  const waiting = structuredClone(room.gameState);
  for (const [socketId, playerId, action] of [
    ['guest', ownerId, { type: 'RESOLVE_STORM', choice: 'TUG' }],
    ['host', captainId, { type: 'RESOLVE_STORM', choice: 'OTHER' }],
    ['host', captainId, { type: 'RESOLVE_STORM' }],
  ]) {
    const rejected = manager.dispatchSocketAction(socketId, { roomId: room.id, playerId, action });
    assert.equal(rejected.success, false);
    assert.deepEqual(room.gameState, waiting);
    assert.equal(room.timer.getRemainingSeconds(), 32);
  }

  manager.handleDisconnect('host');
  const rejoined = manager.joinRoom(room.id, 'Captain', 'ONE_APUS', 'reconnected-host', sessionToken);
  assert.equal(rejoined.isReconnect, true);
  assert.equal(rejoined.playerId, captainId);
  assert.equal(rejoined.room.gameState.phase, 'AWAITING_STORM_DECISION');
  assert.equal(rejoined.room.timer.getRemainingSeconds(), 32);

  const reply = manager.dispatchSocketAction('reconnected-host', {
    roomId: room.id, playerId: rejoined.playerId, action: { type: 'RESOLVE_STORM', choice: 'TUG' },
  });
  assert.equal(reply.success, true);
  assert.equal(room.gameState.phase, 'END_OF_TURN');
  assert.equal(room.gameState.players[0].position, 6);
  assert.equal(room.gameState.players[0].balance, waiting.players[0].balance - 25);

  const paid = structuredClone(room.gameState);
  t.mock.timers.tick(5_000);
  for (const choice of ['TUG', 'DRIFT']) {
    const stale = manager.dispatchSocketAction('reconnected-host', {
      roomId: room.id, playerId: captainId, action: { type: 'RESOLVE_STORM', choice },
    });
    assert.equal(stale.success, false);
    assert.deepEqual(room.gameState, paid);
    assert.equal(room.timer.getRemainingSeconds(), 40);
  }
  assert.deepEqual(events.filter((event) => event.type === 'STORM_RESOLVED'), [
    { type: 'STORM_RESOLVED', playerId: captainId, choice: 'TUG' },
  ]);
});

for (const phase of ['AWAITING_BUY_DECISION', 'AWAITING_SLOT_CHARTER_RESPONSE', 'AWAITING_DEBT_RESOLUTION']) {
  test(`storm expiry drifts once and gives ${phase} its own 45 seconds`, (t) => {
    const fixture = createRoom(t);
    const { manager, room, captainId, ownerId, events } = fixture;
    if (phase !== 'AWAITING_BUY_DECISION') {
      room.gameState.properties[1].ownerId = ownerId;
      room.gameState.properties[3].ownerId = ownerId;
      room.gameState.properties[3].containerLevel = 1;
    }
    if (phase === 'AWAITING_SLOT_CHARTER_RESPONSE') room.gameState.properties[4].ownerId = captainId;
    if (phase === 'AWAITING_DEBT_RESOLUTION') room.gameState.players[0].balance = 1;

    drawStorm(t, fixture);
    t.mock.timers.tick(44_000);
    assert.equal(room.gameState.phase, 'AWAITING_STORM_DECISION');
    assert.equal(room.timer.getRemainingSeconds(), 1);
    t.mock.timers.tick(1_000);
    assert.equal(room.gameState.phase, phase);
    assert.equal(room.gameState.players[0].position, 3);
    assert.equal(room.timer.getRemainingSeconds(), 45);
    assert.deepEqual(events.filter((event) => event.type === 'SHIP_STEPPED').map(({ from, to }) => [from, to]), [
      [3, 6], [6, 3],
    ]);

    const arrival = structuredClone(room.gameState);
    t.mock.timers.tick(44_000);
    manager.dispatchAction(room.id, captainId, { type: 'RESOLVE_STORM', choice: 'TUG' });
    assert.deepEqual(room.gameState, arrival);
    assert.equal(room.timer.getRemainingSeconds(), 1);
    t.mock.timers.tick(1_000);

    if (phase === 'AWAITING_DEBT_RESOLUTION') {
      assert.equal(room.gameState.players[0].isBankrupt, true);
      assert.equal(room.gameState.winnerId, ownerId);
    } else {
      assert.equal(room.gameState.phase, phase === 'AWAITING_BUY_DECISION' ? 'AWAITING_AUCTION' : 'END_OF_TURN');
      assert.equal(room.gameState.pendingSlotCharter, null);
      const rent = phase === 'AWAITING_SLOT_CHARTER_RESPONSE' ? 20 : 0;
      assert.deepEqual(room.gameState.players.map((player) => player.balance), [1500 - rent, 1500 + rent]);
    }
    assert.deepEqual(events.filter((event) => event.type === 'STORM_RESOLVED'), [
      { type: 'STORM_RESOLVED', playerId: captainId, choice: 'DRIFT' },
    ]);
  });
}
