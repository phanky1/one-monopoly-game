import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomManager } from '../dist/roomManager.js';

test('an unanswered slot charter charges full rent when the timer expires', (t) => {
  const manager = new RoomManager();
  const { room, playerId: visitorId } = manager.createRoom('Visitor', 'ONE_APUS', 'visitor-socket');
  const { playerId: ownerId } = manager.joinRoom(room.id, 'Owner', 'GANTRY_CRANE', 'owner-socket');
  assert.ok(ownerId);
  assert.ok(manager.startGame(room.id, visitorId, 'classic').success);
  t.after(() => room.timer?.stop());

  room.gameState.properties[4].ownerId = visitorId;
  room.gameState.properties[1].ownerId = ownerId;
  room.gameState.properties[3].ownerId = ownerId;
  room.gameState.properties[3].containerLevel = 1;
  manager.dispatchAction(room.id, visitorId, { type: 'ROLL_DICE', forcedDice: [1, 2] });
  assert.equal(room.gameState.phase, 'AWAITING_SLOT_CHARTER_RESPONSE');

  manager.handleDisconnect('owner-socket');
  manager.handleAFKTimeout(room.id);

  assert.equal(room.gameState.phase, 'END_OF_TURN');
  assert.equal(room.gameState.pendingSlotCharter, null);
  assert.equal(room.gameState.players[0].balance, 1480);
  assert.equal(room.gameState.players[1].balance, 1520);
});
