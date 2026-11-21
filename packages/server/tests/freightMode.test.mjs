import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCargoBookings, getCargoOpportunity, getCargoRedirections, getLogisticsRoutes } from '@one-monopoly/shared';
import { RoomManager } from '../dist/roomManager.js';

function createRoom(t, withRival = false) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_roomId, _state, incoming) => events.push(...incoming) });
  const { room, playerId, sessionToken } = manager.createRoom('Linh', 'ONE_APUS', 'original');
  if (withRival) manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'rival');
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  const send = (socket, actor, action) => manager.dispatchSocketAction(socket, { roomId: room.id, playerId: actor, action });
  return { manager, room, playerId, sessionToken, send, events };
}

test('a new room keeps an empty booking through reconnection and changes its destination exactly once', t => {
  const { manager, room, playerId, sessionToken, send } = createRoom(t, true);
  assert.equal(manager.startGame(room.id, playerId).success, true);
  assert.equal(room.gameState.mode, 'logistics');
  const rival = room.players[1].id;
  assert.equal(send('original', playerId, { type: 'ROLL_DICE' }).success, false);
  const { action: load, quote } = getCargoBookings(room.gameState, playerId, 'empty').find(option => option.tileId === 3);
  assert.equal(send('rival', playerId, load).success, false);
  assert.equal(send('rival', rival, load).success, false);
  assert.equal(send('original', playerId, load).success, true);
  const booking = room.gameState.players[0].cargo;
  const reconnect = manager.joinRoom(room.id, 'Linh', 'ONE_APUS', 'reconnected', sessionToken);
  assert.equal(reconnect.isReconnect, true);
  const cod = getCargoRedirections(room.gameState, playerId).find(option => option.tileId === 1).action;
  assert.equal(send('original', playerId, cod).success, false);
  assert.equal(send('reconnected', playerId, cod).success, true);
  assert.equal(send('reconnected', playerId, cod).success, false);
  const amendment = { firstDestinationTileId: booking.destinationTileId, count: 1, originalQuote: quote };
  assert.deepEqual(room.gameState.players[0].cargo, { ...booking, destinationTileId: 1, destinationAmendment: amendment });
  assert.equal(room.gameState.players[0].position, 0);
  const sail = getLogisticsRoutes(room.gameState, playerId).find(option => option.tileId === 1).action;
  assert.equal(send('reconnected', playerId, sail).success, true);
  const unload = getCargoOpportunity(room.gameState, playerId).action;
  assert.equal(send('reconnected', playerId, unload).success, true);
  assert.equal(send('reconnected', playerId, unload).success, false);
  assert.equal(room.gameState.logistics.emptyDeliveries[playerId], 1);
  assert.equal(room.gameState.logistics.earnings[playerId], 6);
  assert.deepEqual(room.gameState.logistics.voyageLog[0].destinationAmendment, amendment);
  manager.handleAFKTimeout(room.id);
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, rival);
});

test('the scheduled solo opponent completes a freight match with laden and empty deliveries', t => {
  const { manager, room, playerId, events } = createRoom(t);
  assert.equal(manager.startGame(room.id, playerId).success, true);
  const bot = room.players[1].id;
  for (let step = 0; step < 70 && !room.gameState.winnerId; step++) {
    if (room.gameState.players[room.gameState.activePlayerIndex].id === playerId) manager.handleAFKTimeout(room.id);
    else t.mock.timers.tick(1800);
  }
  assert.equal(room.gameState.winnerId, bot);
  assert.equal(room.gameState.logistics.deliveries[bot], 3);
  const kinds = events.filter(event => event.type === 'CARGO_UNLOADED' && event.playerId === bot).map(event => event.kind);
  assert.deepEqual(new Set(kinds), new Set(['laden', 'empty']));
  assert.equal(room.botTimer, null);
});

test('a classic game rejects freight commands from a logistics client', t => {
  const { manager, room, playerId, send } = createRoom(t, true);
  assert.equal(manager.startGame(room.id, playerId, 'classic').success, true);
  const snapshot = room.gameState;
  assert.equal(send('original', playerId, { type: 'SAIL_TO_PORT', tileId: 3, revision: 0 }).success, false);
  assert.equal(room.gameState, snapshot);
});

test('only a valid explicit harbor start creates the combined game without a dedicated freight rival', t => {
  const { manager, room, playerId } = createRoom(t);
  assert.equal(manager.startGame(room.id, playerId, 'port').success, false);
  assert.equal(manager.startGame(room.id, playerId, 'harbor', 'coastal').success, false);
  assert.equal(room.isGameStarted, false);
  assert.equal(room.players.length, 1);
  assert.equal(manager.startGame(room.id, playerId, 'harbor').success, true);
  assert.equal(room.gameState.mode, 'harbor');
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');
  assert.equal(room.gameState.players[1].freightRivalStyle, undefined);
});
