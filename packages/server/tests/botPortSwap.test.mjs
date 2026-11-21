import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBotPortSwapTerms, OneMonopolyEngine } from '@one-monopoly/shared';
import { getBotTradeResponse } from '../dist/botTrade.js';
import { RoomManager } from '../dist/roomManager.js';

const seats = [
  { id: 'bot', name: 'Linh', token: 'ONE_APUS' },
  { id: 'bidder', name: 'Minh', token: 'PILOT_BOAT' },
  { id: 'other', name: 'An', token: 'GANTRY_CRANE' },
];

function game(mode = 'harbor') {
  const state = OneMonopolyEngine.createGame('swap', seats, mode);
  state.properties[9].ownerId = 'bot';     // Piraeus, $140M
  state.properties[1].ownerId = 'bot';     // Cát Lái
  state.properties[3].ownerId = 'bidder';  // Cái Mép, $60M
  return state;
}

function bid(state, actor, price, offeredTileId) {
  const proposal = OneMonopolyEngine.dispatch(state, {
    type: offeredTileId === undefined ? 'OFFER_TRADE' : 'OFFER_PORT_SWAP', tileId: 9, sellerId: 'bot', price,
    ...(offeredTileId === undefined ? {} : { offeredTileId }),
  }, actor);
  assert.equal(proposal.events[0]?.type, 'TRADE_OFFERED');
  return proposal.state;
}

test('bot prices the incoming deed after parting with its own and credits a completed route once', () => {
  const state = game();
  assert.deepEqual(getBotPortSwapTerms(state, 'bot', 9, 3), { credit: 90, minimumCash: 50 });
  // Exchanging Cát Lái for Cái Mép leaves just one brown port.
  assert.deepEqual(getBotPortSwapTerms(state, 'bot', 1, 3), { credit: 60, minimumCash: 0 });
  state.properties[1].ownerId = null;
  assert.deepEqual(getBotPortSwapTerms(state, 'bot', 9, 3), { credit: 60, minimumCash: 80 });
  state.properties[11].ownerId = 'bot';
  state.properties[12].ownerId = 'bot';
  assert.deepEqual(getBotPortSwapTerms(state, 'bot', 9, 3), { credit: 60, minimumCash: 150 });
  state.properties[3].isMortgaged = true;
  assert.equal(getBotPortSwapTerms(state, 'bot', 9, 3), null);
  assert.equal(getBotPortSwapTerms(game('classic'), 'bot', 9, 3), null);
});

test('a scheduled solo counter keeps the offered deed and settles once without extending the turn', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const manager = new RoomManager();
  const { room, playerId: buyer } = manager.createRoom('Minh', 'PILOT_BOAT', 'minh-socket');
  assert.ok(manager.startGame(room.id, buyer, 'harbor').success);
  t.after(() => { room.timer.stop(); manager.clearBotTimer(room); });
  const seller = room.players[1].id;
  room.gameState.properties[9].ownerId = seller;
  room.gameState.properties[1].ownerId = seller;
  room.gameState.properties[3].ownerId = buyer;
  const send = action => manager.dispatchSocketAction('minh-socket', { roomId: room.id, playerId: buyer, action });
  assert.ok(send({ type: 'OFFER_PORT_SWAP', tileId: 9, sellerId: seller, offeredTileId: 3, price: 5 }).success);
  t.mock.timers.tick(1000);
  assert.deepEqual(room.gameState.tradeOffers, [
    { id: 2, buyerId: buyer, sellerId: seller, tileId: 9, offeredTileId: 3, price: 50, originalPrice: 5 },
  ]);
  assert.equal(room.botTradeTimer, null);
  const deadline = room.timer.getRemainingSeconds();
  const accept = { type: 'RESPOND_TRADE', offerId: 2, accept: true };
  assert.equal(send(accept).success, false);
  assert.equal(send({ ...accept, offeredTileId: 3 }).events[0]?.result, 'ACCEPTED');
  assert.equal(send({ ...accept, offeredTileId: 3 }).success, false);
  assert.equal(room.gameState.properties[3].ownerId, seller);
  assert.equal(room.gameState.properties[9].ownerId, buyer);
  assert.deepEqual(room.gameState.players.map(p => p.balance), [1450, 1550]);
  assert.equal(room.timer.getRemainingSeconds(), deadline);
});

test('the bot compares deed credit plus cash against cash-only bids and accepts an even cashless swap', () => {
  const withCash = bid(game(), 'other', 142);
  const withBoth = bid(withCash, 'bidder', 54, 3);
  assert.deepEqual(getBotTradeResponse(withBoth, 'bot'),
    { type: 'RESPOND_TRADE', offerId: 2, accept: true, offeredTileId: 3 });
  const tie = bid(withCash, 'bidder', 52, 3);
  assert.deepEqual(getBotTradeResponse(tie, 'bot'), { type: 'RESPOND_TRADE', offerId: 1, accept: true });
  withBoth.properties[3].isMortgaged = true;
  assert.deepEqual(getBotTradeResponse(withBoth, 'bot'), { type: 'RESPOND_TRADE', offerId: 1, accept: true });

  const even = game();
  even.properties[11].ownerId = 'bidder';
  even.players[1].balance = 0;
  const noCash = bid(even, 'bidder', 0, 11);
  const reply = getBotTradeResponse(noCash, 'bot');
  assert.deepEqual(reply, { type: 'RESPOND_TRADE', offerId: 1, accept: true, offeredTileId: 11 });
  const settled = OneMonopolyEngine.dispatch(noCash, reply, 'bot');
  assert.equal(settled.state.properties[11].ownerId, 'bot');
  assert.equal(settled.state.properties[9].ownerId, 'bidder');
  assert.deepEqual(settled.state.players.map(player => player.balance), even.players.map(player => player.balance));
});
