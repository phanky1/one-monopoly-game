import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OneMonopolyEngine } from '@one-monopoly/shared';
import { getBotTradeResponse } from '../dist/botTrade.js';
import { getTimerPlayerId, RoomManager } from '../dist/roomManager.js';

test('the solo rival counters a low bid once and the original buyer may accept on reconnect', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, batch) => events.push(...batch) });
  const { room, playerId: buyer, sessionToken } = manager.createRoom('Linh', 'PILOT_BOAT', 'buyer');
  assert.ok(manager.startGame(room.id, buyer, 'harbor').success);
  t.after(() => room.timer.stop());
  const seller = room.players[1].id;
  for (const tileId of [9, 11]) room.gameState.properties[tileId].ownerId = seller;
  const send = (socket, action) => manager.dispatchSocketAction(socket, { roomId: room.id, playerId: buyer, action });
  assert.ok(send('buyer', { type: 'OFFER_TRADE', tileId: 9, sellerId: seller, price: 110 }).success);
  t.mock.timers.tick(1000);
  const terms = { id: 2, tileId: 9, buyerId: buyer, sellerId: seller, price: 175, originalPrice: 110 };
  assert.deepEqual(room.gameState.tradeOffers, [terms]);
  assert.ok(events.some(event => event.type === 'TRADE_COUNTERED'));
  manager.handleDisconnect('buyer');
  const rejoined = manager.joinRoom(room.id, 'Linh', 'PILOT_BOAT', 'buyer-new', sessionToken);
  assert.ok(rejoined.isReconnect);
  t.mock.timers.tick(4000);
  assert.deepEqual(room.gameState.tradeOffers, [terms]);
  assert.deepEqual(room.gameState.players.map(player => player.balance), [1500, 1500]);
  assert.equal(room.botTradeTimer, null);
  assert.equal(room.timer.getRemainingSeconds(), 40);
  assert.equal(send('buyer', { type: 'RESPOND_TRADE', offerId: 2, accept: true }).success, false);
  assert.equal(send('buyer-new', { type: 'RESPOND_TRADE', offerId: 1, accept: true }).success, false);
  assert.ok(send('buyer-new', { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
  assert.ok(send('buyer-new', { type: 'BUY_PROPERTY' }).success);
  assert.ok(send('buyer-new', { type: 'END_TURN' }).success);
  t.mock.method(Math, 'random', () => 0.95);
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1000);
  assert.ok(events.some(event => event.type === 'DICE_ROLLED' && event.playerId === seller));
  assert.deepEqual(room.gameState.tradeOffers, [terms]);
  assert.equal(room.gameState.phase, 'AWAITING_BUY_DECISION');
  t.mock.timers.tick(1000);
  const deadline = room.timer.getRemainingSeconds();
  assert.ok(send('buyer-new', { type: 'RESPOND_TRADE', offerId: 2, accept: true }).success);
  assert.equal(room.gameState.properties[9].ownerId, buyer);
  assert.deepEqual(room.gameState.players.map(player => player.balance), [1265, 1675]);
  assert.equal(getTimerPlayerId(room.gameState), seller);
  assert.equal(room.timer.getRemainingSeconds(), deadline);
});

test('a pending bot counter leaves other buyers eligible, with unaffordable asks and non-port sales declined', () => {
  const seats = [
    { id: 'bot', name: 'Minh', token: 'ONE_APUS' },
    { id: 'first', name: 'An', token: 'REEFER_TRUCK' },
    { id: 'second', name: 'Linh', token: 'PILOT_BOAT' },
  ];
  const initial = OneMonopolyEngine.createGame('several-buyers', seats, 'harbor');
  initial.properties[3].ownerId = 'bot';
  initial.properties[4].ownerId = 'bot';
  const bid = (state, actor, price, tileId = 3) =>
    OneMonopolyEngine.dispatch(state, { type: 'OFFER_TRADE', sellerId: 'bot', tileId, price }, actor).state;
  const offered = bid(initial, 'first', 55);
  const reply = getBotTradeResponse(offered, 'bot');
  assert.deepEqual(reply, { type: 'COUNTER_TRADE', offerId: 1, price: 60 });
  const held = OneMonopolyEngine.dispatch(offered, reply, 'bot').state;
  assert.equal(getBotTradeResponse(held, 'bot'), null);
  const rival = bid(held, 'second', 60);
  const accept = getBotTradeResponse(rival, 'bot');
  assert.deepEqual(accept, { type: 'RESPOND_TRADE', offerId: 3, accept: true });
  const cleared = OneMonopolyEngine.dispatch(rival, accept, 'bot');
  assert.equal(cleared.state.properties[3].ownerId, 'second');
  assert.ok(cleared.events.some(event => event.type === 'TRADE_CLOSED' && event.offer.id === 2 && event.result === 'EXPIRED'));
  const tight = structuredClone(initial);
  tight.players[2].balance = 59;
  assert.deepEqual(getBotTradeResponse(bid(tight, 'second', 30), 'bot'),
    { type: 'RESPOND_TRADE', offerId: 1, accept: false });
  const serviceLine = bid(initial, 'second', 120, 4);
  assert.deepEqual(getBotTradeResponse(serviceLine, 'bot'), { type: 'RESPOND_TRADE', offerId: 1, accept: false });
});

test('out-of-turn captains exchange a counter at auction without resetting the bidding clock or moving cash', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const updates = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, events) => updates.push(events) });
  const { room, playerId: captain } = manager.createRoom('Captain', 'PILOT_BOAT', 'captain');
  const { playerId: buyer } = manager.joinRoom(room.id, 'Buyer', 'ONE_APUS', 'buyer');
  const { playerId: seller } = manager.joinRoom(room.id, 'Seller', 'FREIGHT_TRAIN', 'seller');
  assert.ok(manager.startGame(room.id, captain, 'harbor').success);
  t.after(() => room.timer.stop());
  room.gameState.properties[9].ownerId = seller;
  const send = (id, action, socket = room.playerToSocket.get(id)) =>
    manager.dispatchSocketAction(socket, { roomId: room.id, playerId: id, action });
  assert.ok(send(captain, { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
  assert.ok(send(captain, { type: 'SKIP_BUY' }).success);
  t.mock.timers.tick(6000);
  assert.equal(getTimerPlayerId(room.gameState), buyer);
  assert.ok(send(buyer, { type: 'OFFER_TRADE', tileId: 9, sellerId: seller, price: 62 }).success);
  const auction = structuredClone(room.gameState.auction);
  const counter = { type: 'COUNTER_TRADE', offerId: 1, price: 80 };
  const countBeforeCounter = updates.length;
  assert.equal(send(seller, counter, 'buyer').success, false);
  assert.equal(send(captain, counter).success, false);
  assert.equal(updates.length, countBeforeCounter);
  const pending = send(seller, counter);
  assert.ok(pending.success, pending.error);
  assert.deepEqual(updates.at(-1), pending.events);
  const { id } = pending.events.find(e => e.type === 'TRADE_COUNTERED').offer;
  assert.equal(send(buyer, { type: 'RESPOND_TRADE', offerId: id, accept: true }).success, false);
  assert.equal(send(seller, counter).success, false);
  assert.deepEqual(room.gameState.auction, auction);
  assert.equal(room.timer.getRemainingSeconds(), 14);
  assert.equal(getTimerPlayerId(room.gameState), buyer);
  assert.deepEqual(room.gameState.players.map(p => p.balance), [1500, 1500, 1500]);
  t.mock.timers.tick(14000);
  assert.ok(room.gameState.auction.passedIds.includes(buyer));
  assert.ok(send(buyer, { type: 'RESPOND_TRADE', offerId: id, accept: false }).success);
  assert.equal(room.gameState.tradeOffers.length, 0);
});
