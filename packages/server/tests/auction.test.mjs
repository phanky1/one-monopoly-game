import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomManager, getTimerPlayerId } from '../dist/roomManager.js';

function openAuction(t, dice = [1, 2]) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const clocks = [];
  const updates = [];
  const manager = new RoomManager({
    onTimerTick: (_roomId, seconds, playerId) => clocks.push({ playerId, seconds }),
    onBroadcastUpdate: (_roomId, _state, events) => updates.push(events),
  });
  const { room, playerId: captainId } = manager.createRoom('Captain', 'ONE_APUS', 'captain-socket');
  assert.ok(manager.joinRoom(room.id, 'First mate', 'PILOT_BOAT', 'mate-socket').success);
  assert.ok(manager.joinRoom(room.id, 'Engineer', 'GANTRY_CRANE', 'engineer-socket').success);
  assert.ok(manager.startGame(room.id, captainId, 'classic').success);
  t.after(() => room.timer.stop());

  function send(playerId, action) {
    return manager.dispatchSocketAction(room.playerToSocket.get(playerId), { roomId: room.id, playerId, action });
  }

  function assertClock(playerId, seconds) {
    assert.deepEqual(clocks.at(-1), { playerId, seconds });
    assert.equal(room.timer.getRemainingSeconds(), seconds);
  }

  assert.ok(send(captainId, { type: 'ROLL_DICE', forcedDice: dice }).success);
  assert.equal(room.gameState.phase, 'AWAITING_BUY_DECISION');
  t.mock.timers.tick(33_000);
  assertClock(captainId, 12);
  assert.ok(send(captainId, { type: 'SKIP_BUY' }).success);
  assert.equal(room.gameState.phase, 'AWAITING_AUCTION');
  assertClock(room.gameState.auction.bidderId, 20);
  return { room, captainId, manager, send, assertClock, updates };
}

function respond(auction, amount) {
  const turn = { auctionId: auction.id, revision: auction.revision };
  return amount === undefined ? { ...turn, type: 'AUCTION_PASS' } : { ...turn, type: 'AUCTION_BID', amount };
}

test('an auction without eligible bidders renews the clock for a doubles roll', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const manager = new RoomManager();
  const { room, playerId } = manager.createRoom('Captain', 'ONE_APUS', 'captain-socket');
  assert.ok(manager.startGame(room.id, playerId, 'classic').success);
  t.after(() => room.timer.stop());
  for (const player of room.gameState.players) player.balance = 0;
  t.mock.timers.tick(40_000);
  const result = manager.dispatchAction(room.id, playerId, { type: 'ROLL_DICE', forcedDice: [2, 2] });
  assert.ok(result.events.some((event) => event.type === 'AUCTION_ENDED' && event.winnerId === null));
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, playerId);
  assert.equal(room.timer.getRemainingSeconds(), 45);
});

test('only accepted auction responses move the bidder clock or broadcast a state update', (t) => {
  const { room, send, assertClock, updates, captainId } = openAuction(t);
  const opening = room.gameState.auction;
  const firstBid = respond(opening, 10);
  t.mock.timers.tick(7_000);
  const observer = room.players.find((player) => player.id !== opening.bidderId);
  const openingUpdates = updates.length;
  assert.equal(send(observer.id, firstBid).success, false);
  assert.equal(updates.length, openingUpdates);
  assertClock(opening.bidderId, 13);

  assert.ok(send(opening.bidderId, firstBid).success);
  const second = room.gameState.auction;
  assert.notEqual(second.bidderId, opening.bidderId);
  assertClock(second.bidderId, 20);
  assert.equal(updates.length, openingUpdates + 1);

  t.mock.timers.tick(9_000);
  assert.ok(send(second.bidderId, respond(second, 20)).success);
  const third = room.gameState.auction;
  assertClock(third.bidderId, 20);
  t.mock.timers.tick(11_000);
  assert.ok(send(third.bidderId, respond(third)).success);
  const final = room.gameState.auction;
  assert.equal(final.bidderId, opening.bidderId);
  assertClock(final.bidderId, 20);
  t.mock.timers.tick(8_000);

  const standing = structuredClone(room.gameState);
  const updateCount = updates.length;
  for (const rejected of [
    firstBid,
    { ...respond(final, 30), revision: opening.revision },
    { ...respond(final), auctionId: final.id + 1 },
    respond(final, 0),
    respond(final, 2000),
  ]) {
    assert.equal(send(final.bidderId, rejected).success, false);
    assert.deepEqual(room.gameState, standing);
    assertClock(final.bidderId, 12);
    assert.equal(updates.length, updateCount);
  }

  const lastPass = respond(final);
  assert.ok(send(final.bidderId, lastPass).success);
  assert.equal(room.gameState.phase, 'END_OF_TURN');
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, captainId);
  assert.equal(room.gameState.properties[opening.tileId].ownerId, second.bidderId);
  assert.equal(room.gameState.players.find((p) => p.id === second.bidderId).balance, 1480);
  assertClock(captainId, 45);
  t.mock.timers.tick(5_000);
  assert.equal(send(final.bidderId, lastPass).success, false);
  assertClock(captainId, 40);
  assert.equal(updates.length, updateCount + 1);
});

test('every bidder gets 20 seconds to pass before the captain takes their doubles roll', (t) => {
  const { room, send, assertClock, updates, captainId } = openAuction(t, [2, 2]);
  const { tileId } = room.gameState.auction;
  const timedOut = new Set();
  for (let seat = 0; seat < room.players.length; seat++) {
    const { bidderId } = room.gameState.auction;
    assert.ok(!timedOut.has(bidderId));
    timedOut.add(bidderId);
    assertClock(bidderId, 20);
    const before = updates.length;
    t.mock.timers.tick(19_000);
    assertClock(bidderId, 1);
    assert.equal(updates.length, before);
    t.mock.timers.tick(1_000);
    assert.equal(updates.length, before + 1);
  }
  assert.equal(room.gameState.properties[tileId].ownerId, null);
  assert.deepEqual(room.gameState.players.map((player) => player.balance), [1500, 1500, 1500]);
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, captainId);
  assert.equal(room.gameState.hasRolled, false);
  assertClock(captainId, 45);
  t.mock.timers.tick(44_000);
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');
  assertClock(captainId, 1);
  assert.ok(send(captainId, { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].position, 7);
});

test('a reconnecting bidder keeps the standing offer and the time left on their existing turn', (t) => {
  const { manager, room, send, assertClock } = openAuction(t);
  const opening = room.gameState.auction;
  assert.ok(send(opening.bidderId, respond(opening, 10)).success);
  const standing = structuredClone(room.gameState.auction);
  const bidder = room.players.find((p) => p.id === standing.bidderId);
  t.mock.timers.tick(8_000);
  manager.handleDisconnect(room.playerToSocket.get(bidder.id));
  t.mock.timers.tick(4_000);

  const joined = manager.joinRoom(room.id, bidder.name, bidder.token, 'replacement-socket', bidder.sessionToken);
  assert.equal(joined.isReconnect, true);
  assert.equal(joined.playerId, bidder.id);
  assert.deepEqual(joined.room.gameState.auction, standing);
  assert.equal(getTimerPlayerId(joined.room.gameState), bidder.id);
  assert.equal(joined.room.timer.getRemainingSeconds(), 8);
  assertClock(bidder.id, 8);
  const reply = manager.dispatchSocketAction('replacement-socket', {
    roomId: room.id, playerId: bidder.id, action: respond(standing),
  });
  assert.ok(reply.success);
  assertClock(room.gameState.auction.bidderId, 20);
});
