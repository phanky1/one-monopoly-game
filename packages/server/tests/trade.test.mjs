import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTimerPlayerId, RoomManager } from '../dist/roomManager.js';

function tradingRoom(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const updates = [];
  const clocks = [];
  const manager = new RoomManager({
    onBroadcastUpdate: (_id, _state, events) => updates.push(events),
    onTimerTick: (_id, seconds, playerId) => clocks.push({ seconds, playerId }),
  });
  const { room, playerId: captain } = manager.createRoom('Captain', 'PILOT_BOAT', 'captain');
  const { playerId: observer } = manager.joinRoom(room.id, 'Observer', 'FREIGHT_TRAIN', 'observer');
  const { playerId: buyer } = manager.joinRoom(room.id, 'Buyer', 'ONE_APUS', 'buyer');
  const { playerId: seller, sessionToken } = manager.joinRoom(room.id, 'Seller', 'GANTRY_CRANE', 'seller');
  assert.ok(manager.startGame(room.id, captain, 'classic').success);
  t.after(() => room.timer.stop());
  room.gameState.properties[9].ownerId = seller;

  function send(playerId, action, socketId = room.playerToSocket.get(playerId)) {
    return manager.dispatchSocketAction(socketId, { roomId: room.id, playerId, action });
  }
  function reject(playerId, action, socketId) {
    const before = room.gameState;
    const count = updates.length;
    const tickCount = clocks.length;
    assert.equal(send(playerId, action, socketId).success, false);
    assert.equal(room.gameState, before);
    assert.equal(updates.length, count);
    assert.equal(clocks.length, tickCount);
  }
  function offer() {
    const reply = send(buyer, { type: 'OFFER_TRADE', sellerId: seller, tileId: 9, price: 75 });
    assert.ok(reply.success);
    const offered = reply.events.find((event) => event.type === 'TRADE_OFFERED').offer;
    assert.deepEqual(offered, { id: offered.id, buyerId: buyer, sellerId: seller, tileId: 9, price: 75 });
    assert.deepEqual(updates.at(-1), reply.events);
    return offered.id;
  }
  return { room, manager, captain, observer, buyer, seller, sessionToken, send, reject, offer, clocks, updates };
}

const respond = (offerId, accept) => ({ type: 'RESPOND_TRADE', offerId, accept });
const cancel = (offerId) => ({ type: 'CANCEL_TRADE', offerId });

test('two off-turn players settle a trade after reconnect while the captain keeps the same roll clock', (t) => {
  const { room, manager, captain, observer, buyer, seller, sessionToken, send, reject, offer, clocks, updates } = tradingRoom(t);
  t.mock.timers.tick(11_000);
  const ticksBefore = clocks.length;
  const offerId = offer();
  reject(observer, respond(offerId, true));
  reject(seller, respond(offerId, true), 'observer');
  reject(observer, cancel(offerId));
  reject(buyer, { type: 'OFFER_TRADE', sellerId: seller, tileId: 9, price: -1 });

  manager.handleDisconnect('seller');
  const joined = manager.joinRoom(room.id, 'Seller', 'GANTRY_CRANE', 'new-seller', sessionToken);
  assert.ok(joined.isReconnect);
  assert.equal(joined.room.gameState.tradeOffers[0].id, offerId);
  reject(seller, respond(offerId, true), 'seller');
  const paid = send(seller, respond(offerId, true));
  assert.ok(paid.success);
  assert.ok(paid.events.some((event) => event.type === 'TRADE_CLOSED' && event.result === 'ACCEPTED'));
  assert.deepEqual(updates.at(-1), paid.events);
  assert.equal(room.gameState.properties[9].ownerId, buyer);
  assert.deepEqual(room.gameState.players.map((player) => player.balance), [1500, 1500, 1425, 1575]);
  assert.deepEqual(room.gameState.tradeOffers, []);
  reject(seller, respond(offerId, true));
  reject(buyer, cancel(offerId));
  assert.equal(clocks.length, ticksBefore);
  assert.deepEqual(clocks.at(-1), { seconds: 34, playerId: captain });
  assert.equal(room.gameState.phase, 'WAIT_FOR_ROLL');

  assert.ok(send(captain, { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
  assert.equal(room.gameState.phase, 'AWAITING_BUY_DECISION');
  assert.equal(room.timer.getRemainingSeconds(), 45);
  assert.ok(send(captain, { type: 'BUY_PROPERTY' }).success);
  assert.equal(room.gameState.properties[3].ownerId, captain);
});

for (const phase of ['AWAITING_AUCTION', 'AWAITING_STORM_DECISION', 'AWAITING_DEBT_RESOLUTION']) {
  test(`offers, declines and withdrawals during ${phase} preserve the decision and its deadline`, (t) => {
    const { room, captain, observer, buyer, seller, send, reject, offer, clocks } = tradingRoom(t);
    if (phase === 'AWAITING_STORM_DECISION') {
      room.gameState.players[0].position = 3;
      room.gameState.opsDeck.unshift('OPS-02');
    } else if (phase === 'AWAITING_DEBT_RESOLUTION') {
      room.gameState.properties[3].ownerId = seller;
      room.gameState.players[0].balance = 1;
    }
    assert.ok(send(captain, { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
    if (phase === 'AWAITING_AUCTION') assert.ok(send(captain, { type: 'SKIP_BUY' }).success);
    assert.equal(room.gameState.phase, phase);
    const clockOwner = phase === 'AWAITING_AUCTION' ? observer : captain;
    const waitingAuction = structuredClone(room.gameState.auction);
    const waitingDebt = structuredClone(room.gameState.pendingDebt);
    t.mock.timers.tick(7_000);
    const ticksBefore = clocks.length;
    const first = offer();
    reject(seller, respond(first, true));
    const declined = send(seller, respond(first, false));
    assert.ok(declined.events.some((event) => event.type === 'TRADE_CLOSED' && event.result === 'DECLINED'));
    const second = offer();
    reject(seller, respond(first, false));
    const withdrawn = send(buyer, cancel(second));
    assert.ok(withdrawn.events.some((event) => event.type === 'TRADE_CLOSED' && event.result === 'WITHDRAWN'));
    assert.equal(room.gameState.properties[9].ownerId, seller);
    assert.equal(room.gameState.phase, phase);
    assert.deepEqual(room.gameState.auction, waitingAuction);
    assert.deepEqual(room.gameState.pendingDebt, waitingDebt);
    assert.equal(clocks.length, ticksBefore);
    assert.equal(getTimerPlayerId(room.gameState), clockOwner);
    assert.deepEqual(clocks.at(-1), { seconds: phase === 'AWAITING_AUCTION' ? 13 : 38, playerId: clockOwner });
    if (phase === 'AWAITING_AUCTION') {
      t.mock.timers.tick(13_000);
      assert.ok(room.gameState.auction.passedIds.includes(observer));
      assert.equal(room.gameState.auction.bidderId, buyer);
      assert.deepEqual(clocks.at(-1), { seconds: 20, playerId: buyer });
    }
  });
}
