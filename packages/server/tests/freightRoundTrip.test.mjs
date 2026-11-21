import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCargoOpportunity, getVoyagePayment } from '@one-monopoly/shared';
import { RoomManager } from '../dist/roomManager.js';

test('the room pays a refrigerated tender and return load together and preserves the receipt after reconnect', t => {
  const manager = new RoomManager();
  const { room, playerId, sessionToken } = manager.createRoom('Linh', 'ONE_APUS', 'host');
  const rival = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'guest').playerId;
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  assert.ok(manager.startGame(room.id, playerId).success);

  const send = (action, guest = false) => {
    const response = manager.dispatchSocketAction(guest ? 'guest' : 'host', {
      roomId: room.id, playerId: guest ? rival : playerId, action: { revision: room.gameState.cargoRevision, ...action },
    });
    assert.ok(response.success, action.type + ' ' + (response.error ?? ''));
    return response;
  };
  const captain = () => room.gameState.players[0];
  const loadReefer = (from, to) =>
    send({ type: 'LOAD_CARGO', tileId: from, destinationTileId: to, kind: 'laden', reefer: true });
  const unload = () => getCargoOpportunity(room.gameState, playerId).action;
  send({ type: 'BID_FREIGHT_TENDER', tenderId: room.gameState.logistics.market.tender.id, amount: 7 });
  send({ type: 'SAIL_TO_PORT', tileId: 17 }); // Busan to Tokyo is within feeder range.
  loadReefer(17, 31);
  assert.equal(captain().cargo.reeferDueRound, 1);
  send({ type: 'SAIL_FEEDER', tileId: 31 });
  send(unload());
  const first = captain().lastDelivery;
  assert.equal(first.reeferBonus, 8);
  send({ type: 'ACCEPT_BACKHAUL', bookingId: first.bookingId });
  send({ type: 'END_TURN' });
  send({ type: 'END_TURN' }, true);

  loadReefer(31, 17);
  send({ type: 'SAIL_TO_PORT', tileId: 17 });
  const discharge = unload();
  const result = send(discharge);
  const receipt = captain().lastDelivery;
  assert.deepEqual([receipt.tenderBonus, receipt.reeferBonus, receipt.backhaulBonus], [7, 8, 6]);
  const total = first.reward + 8 + receipt.reward + 7 + 8 + 6;
  assert.equal(captain().balance, total);
  assert.equal(room.gameState.logistics.earnings[playerId], total);
  assert.equal(result.events.filter(event => event.type === 'BALANCE_CHANGED').length, 1);
  assert.equal(result.events.find(event => event.type === 'BALANCE_CHANGED').delta, receipt.reward + 21);
  const log = room.gameState.logistics.voyageLog;
  assert.equal(log.length, 2);
  assert.deepEqual(log.map(entry => [entry.round, entry.originTileId, entry.destinationTileId]), [[1, 17, 31], [2, 31, 17]]);
  assert.deepEqual([log[1].tenderBonus, log[1].reeferBonus, log[1].backhaulBonus], [7, 8, 6]);
  assert.equal(log.reduce((sum, entry) => sum + getVoyagePayment(entry), 0), total);
  assert.ok(manager.joinRoom(room.id, 'Linh', 'ONE_APUS', 'reconnected', sessionToken).isReconnect);
  const replay = manager.dispatchSocketAction('reconnected', { roomId: room.id, playerId, action: discharge });
  assert.equal(replay.success, false);
  assert.equal(captain().balance, total);
  assert.equal(room.gameState.logistics.voyageLog.length, 2);
});
