import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTimerPlayerId, RoomManager } from '../dist/roomManager.js';

function startSoloGame(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const events = [];
  const manager = new RoomManager({
    onBroadcastUpdate: (_id, _state, emitted) => events.push(...emitted),
  });
  const { room, playerId: human } = manager.createRoom('Captain ONE', 'ONE_APUS', 'human-socket');
  assert.ok(manager.startGame(room.id, human, 'classic').success);
  const bot = room.players.find((p) => manager.isBot(room, p.id)).id;
  assert.equal(room.players.length, 2);
  assert.equal(manager.isBot(room, human), false);
  t.after(() => {
    room.timer.stop();
    manager.clearBotTimer(room);
  });

  function send(action) {
    const reply = manager.dispatchSocketAction('human-socket', { roomId: room.id, playerId: human, action });
    assert.ok(reply.success, reply.error);
    return reply;
  }
  send({ type: 'ROLL_DICE', forcedDice: [1, 2] });
  send({ type: 'SKIP_BUY' });
  assert.equal(room.gameState.phase, 'AWAITING_AUCTION');
  assert.equal(getTimerPlayerId(room.gameState), bot);
  return { room, send, human, bot, events };
}

test('a bot bids during the human turn, collects the port on timeout, and plays its next turn', (t) => {
  const { room, send, human, bot, events } = startSoloGame(t);
  room.gameState.properties[9].ownerId = bot;
  t.mock.timers.tick(500);
  const request = send({ type: 'OFFER_TRADE', tileId: 9, sellerId: bot, price: 75 });
  assert.equal(room.gameState.auction.revision, 0);
  t.mock.timers.tick(200);
  assert.equal(room.gameState.auction.highestBid, 10);
  assert.equal(room.gameState.auction.leaderId, bot);
  assert.equal(getTimerPlayerId(room.gameState), human);
  assert.equal(room.botTimer, null);

  t.mock.timers.tick(5_000);
  send({ type: 'CANCEL_TRADE', offerId: request.state.tradeOffers[0].id });
  assert.equal(room.timer.getRemainingSeconds(), 15);
  t.mock.timers.tick(15_000);
  assert.equal(room.gameState.phase, 'END_OF_TURN');
  assert.equal(room.gameState.properties[3].ownerId, bot);
  assert.equal(getTimerPlayerId(room.gameState), human);
  assert.equal(room.timer.getRemainingSeconds(), 45);

  send({ type: 'END_TURN' });
  const dice = [0.2, 0.4]; // A normal bot roll of 2 + 3 lands on an unowned port.
  t.mock.method(Math, 'random', () => dice.shift());
  t.mock.timers.tick(1_000);
  assert.ok(events.some((e) => e.type === 'DICE_ROLLED' && e.playerId === bot));
  assert.equal(room.gameState.phase, 'AWAITING_BUY_DECISION');
  t.mock.timers.tick(2_750);
  assert.equal(room.gameState.properties[5].ownerId, bot);
  assert.equal(room.gameState.properties[5].containerLevel, 0);
  t.mock.timers.tick(700);
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');
  assert.equal(getTimerPlayerId(room.gameState), human);
  assert.equal(room.botTimer, null);
});

test('a bot passes when the next bid would spend its cash reserve', (t) => {
  const { room, human, bot, send, events } = startSoloGame(t);
  room.gameState.players.find((p) => p.id === bot).balance = 100;
  t.mock.timers.tick(700);
  const { id, revision } = room.gameState.auction;
  send({ type: 'AUCTION_BID', auctionId: id, revision, amount: 20 });
  assert.equal(getTimerPlayerId(room.gameState), bot);
  t.mock.timers.tick(700);
  assert.equal(room.gameState.auction, null);
  assert.equal(room.gameState.properties[3].ownerId, human);
  assert.ok(events.some((e) => e.type === 'AUCTION_ENDED' && e.winnerId === human && e.price === 20));
  assert.equal(room.gameState.players.find((p) => p.id === bot).balance, 100);
  assert.equal(room.timer.getRemainingSeconds(), 45);
  assert.equal(room.botTimer, null);
});
