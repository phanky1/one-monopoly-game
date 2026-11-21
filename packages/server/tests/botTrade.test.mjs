import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBotAskingPrice, OneMonopolyEngine } from '@one-monopoly/shared';
import { getBotTradeResponse } from '../dist/botTrade.js';
import { RoomManager } from '../dist/roomManager.js';

const players = [
  { id: 'bot', name: 'Bot', token: 'ONE_APUS' },
  { id: 'first', name: 'First', token: 'PILOT_BOAT' },
  { id: 'second', name: 'Second', token: 'GANTRY_CRANE' },
];

test('bot asking prices reflect ownership of a port group, service lines or infrastructure', () => {
  const game = OneMonopolyEngine.createGame('prices', players);
  for (const [tile, price, siblings, expected] of [
    [9, 140, [11, 12], [175, 210]],
    [4, 200, [13, 20, 28], [250, 250, 300]],
    [10, 150, [22], [225]],
  ]) {
    assert.equal(getBotAskingPrice(game, 'bot', tile), null);
    game.properties[tile].ownerId = 'bot';
    assert.equal(getBotAskingPrice(game, 'bot', tile), price);
    siblings.forEach((id, i) => {
      game.properties[id].ownerId = 'bot';
      assert.equal(getBotAskingPrice(game, 'bot', tile), expected[i]);
    });
    assert.equal(getBotAskingPrice(game, 'first', tile), null);
  }
  assert.equal(getBotAskingPrice(game, 'bot', 0), null);
});

test('competing offers use the highest eligible price, then the earliest offer ID', () => {
  const game = OneMonopolyEngine.createGame('compete', players);
  game.properties[9].ownerId = 'bot';
  function offers(first, second) {
    let state = OneMonopolyEngine.dispatch(game, { type: 'OFFER_TRADE', sellerId: 'bot', tileId: 9, price: first }, 'first').state;
    return OneMonopolyEngine.dispatch(state, { type: 'OFFER_TRADE', sellerId: 'bot', tileId: 9, price: second }, 'second').state;
  }
  const competing = offers(150, 160);
  const reply = getBotTradeResponse(competing, 'bot');
  assert.deepEqual(reply, { type: 'RESPOND_TRADE', offerId: 2, accept: true });
  const settled = OneMonopolyEngine.dispatch(competing, reply, 'bot');
  assert.equal(settled.state.properties[9].ownerId, 'second');
  assert.deepEqual(settled.events.filter(e => e.type === 'TRADE_CLOSED').map(e => [e.offer.id, e.result]),
    [[2, 'ACCEPTED'], [1, 'EXPIRED']]);
  assert.equal(getBotTradeResponse(settled.state, 'bot'), null);
  assert.deepEqual(OneMonopolyEngine.dispatch(settled.state, reply, 'bot').events, []);
  const equal = offers(140, 140);
  equal.tradeOffers.reverse();
  assert.equal(getBotTradeResponse(equal, 'bot').offerId, 1);
  const low = offers(1, 2);
  for (const phase of ['AWAITING_AUCTION', 'AWAITING_STORM_DECISION', 'AWAITING_SLOT_CHARTER_RESPONSE', 'AWAITING_DEBT_RESOLUTION']) {
    assert.equal(getBotTradeResponse({ ...low, phase }, 'bot'), null);
  }
  competing.players[2].balance = 159;
  assert.equal(getBotTradeResponse(competing, 'bot').offerId, 1);
  competing.properties[9].isMortgaged = true;
  assert.equal(getBotTradeResponse(competing, 'bot'), null);
});

function solo(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_roomId, _state, batch) => events.push(...batch) });
  const { room, playerId: human, sessionToken } = manager.createRoom('Captain', 'ONE_APUS', 'first-socket');
  assert.ok(manager.startGame(room.id, human, 'classic').success);
  t.after(() => {
    room.timer.stop();
    manager.clearBotTimer(room);
  });
  const bot = room.players.find(player => manager.isBot(room, player.id)).id;
  room.gameState.properties[9].ownerId = bot;
  function send(action) {
    const result = manager.dispatchSocketAction(room.playerToSocket.get(human), { roomId: room.id, playerId: human, action });
    assert.ok(result.success, result.error);
    return result;
  }
  function offer(price) {
    return send({ type: 'OFFER_TRADE', sellerId: bot, tileId: 9, price }).events[0].offer.id;
  }
  function closed(id) {
    return events.filter(event => event.type === 'TRADE_CLOSED' && event.offer.id === id).map(event => event.result);
  }
  return { manager, room, human, bot, sessionToken, events, send, offer, closed };
}

test('a solo captain can withdraw, receive a decline, and reconnect to a sale at the quoted price', (t) => {
  const { manager, room, human, bot, sessionToken, send, offer, closed } = solo(t);
  t.mock.timers.tick(5_000);
  const withdrawn = offer(140);
  send({ type: 'CANCEL_TRADE', offerId: withdrawn });
  t.mock.timers.tick(3_000);
  assert.deepEqual(closed(withdrawn), ['WITHDRAWN']);

  room.gameState.properties[11].ownerId = bot;
  const belowAsk = offer(174);
  t.mock.timers.tick(3_000);
  assert.deepEqual(closed(belowAsk), ['DECLINED']);
  assert.equal(room.gameState.properties[9].ownerId, bot);

  const atAsk = offer(175);
  manager.handleDisconnect('first-socket');
  const rejoined = manager.joinRoom(room.id, 'Captain', 'ONE_APUS', 'new-socket', sessionToken);
  assert.ok(rejoined.isReconnect);
  assert.equal(rejoined.room.gameState.tradeOffers[0].id, atAsk);
  t.mock.timers.tick(3_000);
  assert.deepEqual(closed(atAsk), ['ACCEPTED']);
  assert.equal(room.gameState.properties[9].ownerId, human);
  assert.deepEqual(room.gameState.players.map(p => p.balance), [1325, 1675]);
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');
  assert.equal(room.timer.getRemainingSeconds(), 31);
});

test('a bot bids in a real auction, deferring its sale until the captain resumes play', (t) => {
  const { room, human, bot, send, offer, closed } = solo(t);
  const id = offer(140);
  send({ type: 'ROLL_DICE', forcedDice: [1, 2] });
  send({ type: 'SKIP_BUY' });
  assert.equal(room.gameState.auction.bidderId, bot);
  t.mock.timers.tick(3_000);
  assert.equal(room.gameState.auction.bidderId, human);
  assert.equal(room.gameState.auction.highestBid, 10);
  assert.deepEqual(closed(id), []);
  assert.equal(room.gameState.properties[9].ownerId, bot);
  const { id: auctionId, revision } = room.gameState.auction;
  send({ type: 'AUCTION_PASS', auctionId, revision });
  assert.equal(room.gameState.properties[3].ownerId, bot);
  t.mock.timers.tick(3_000);
  assert.deepEqual(closed(id), ['ACCEPTED']);
  assert.equal(room.gameState.properties[9].ownerId, human);
  assert.deepEqual(room.gameState.players.map(p => p.balance), [1360, 1630]);
  assert.equal(room.gameState.phase, 'END_OF_TURN');
  assert.equal(room.timer.getRemainingSeconds(), 42);
});

test('an incoming offer leaves the bot’s scheduled roll on time', (t) => {
  const { room, bot, events, send, offer, closed } = solo(t);
  t.mock.method(Math, 'random', () => 0.2);
  send({ type: 'ROLL_DICE', forcedDice: [1, 2] });
  send({ type: 'BUY_PROPERTY' });
  send({ type: 'END_TURN' });
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, bot);
  t.mock.timers.tick(600);
  const id = offer(140);
  t.mock.timers.tick(400);
  assert.equal(events.filter(e => e.type === 'DICE_ROLLED' && e.playerId === bot).length, 1);
  t.mock.timers.tick(3_000);
  assert.deepEqual(closed(id), ['ACCEPTED']);
});

test('a bot that sells its current port completes its turn without attempting the old upgrade', (t) => {
  const { manager, room, human, bot, send, offer, closed } = solo(t);
  send({ type: 'ROLL_DICE', forcedDice: [1, 2] });
  send({ type: 'BUY_PROPERTY' });
  send({ type: 'END_TURN' });
  room.gameState.players[1].position = 6;
  const calls = t.mock.method(manager, 'dispatchAction');
  const visit = manager.dispatchAction(room.id, bot, { type: 'ROLL_DICE', forcedDice: [1, 2] });
  assert.ok(visit.success);
  assert.equal(room.gameState.canUpgradeCurrentPort, true);
  const id = offer(140);
  t.mock.timers.tick(1_500);
  assert.deepEqual(closed(id), ['ACCEPTED']);
  t.mock.timers.tick(2_000);
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, human);
  assert.equal(room.gameState.properties[9].containerLevel, 0);
  assert.equal(calls.mock.calls.some(call => call.arguments[2].type === 'BUILD_CONTAINER'), false);
});
