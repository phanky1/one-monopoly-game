import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BOARD_TILES, getHarborFreightQuote, getHarborPurchase } from '@one-monopoly/shared';
import { io as connect } from 'socket.io-client';
import { gameStateForPlayer, RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

const loadInSingapore = { type: 'HARBOR_LOAD', tileId: 0, revision: 0 };
const sailToCaiMep = { type: 'ROLL_DICE', forcedDice: [1, 2] };

test('two sockets settle one posted-price purchase using a $12M delivery and $48M cash', async t => {
  const http = createServer();
  try { await new Promise((resolve, reject) => http.once('error', reject).listen(0, '127.0.0.1', resolve)); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(http);
  const open = () => connect('http://127.0.0.1:' + http.address().port, { transports: ['websocket'], reconnection: false });
  const buyer = open(), rival = open();
  let room;
  t.after(async () => {
    room?.timer?.stop();
    buyer.disconnect();
    rival.disconnect();
    await io.close();
  });
  const send = (socket, event, data) => socket.timeout(5000).emitWithAck(event, data);
  const update = socket => once(socket, 'game:update', { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const { roomId, playerId } = await send(buyer, 'room:create', { playerName: 'An', token: 'ONE_APUS' });
  const { playerId: otherId } = await send(rival, 'room:join', { roomId, playerName: 'Mai', token: 'PILOT_BOAT' });
  assert.ok((await send(buyer, 'room:start', { roomId, playerId, mode: 'harbor' })).success);
  room = roomManager.getRoom(roomId);
  room.gameState.players[0].balance = 52;
  const act = (socket, actor, action) => send(socket, 'game:action', { roomId, playerId: actor, action });
  assert.ok((await act(buyer, playerId, loadInSingapore)).success);
  const arrival = await act(buyer, playerId, sailToCaiMep);
  assert.equal(arrival.state.phase, 'AWAITING_BUY_DECISION');
  assert.equal(arrival.state.supportsHarborPurchase, true);
  const { action } = getHarborPurchase(arrival.state, playerId);
  const before = room.gameState;
  const resets = t.mock.method(room.timer, 'reset');
  for (const [socket, actor, request] of [
    [buyer, playerId, { type: 'BUY_PROPERTY' }], [rival, playerId, action], [rival, otherId, action],
    [buyer, playerId, { ...action, revision: action.revision - 1 }], [buyer, playerId, { ...action, tileId: 5 }],
  ]) {
    assert.equal((await act(socket, actor, request)).success, false);
    assert.strictEqual(room.gameState, before);
  }
  assert.equal(resets.mock.callCount(), 0);
  const [own, peer, ack] = await Promise.all([update(buyer), update(rival), act(buyer, playerId, action)]);
  assert.ok(ack.success, ack.error);
  for (const result of [own, peer, ack]) {
    assert.deepEqual(result.events, ack.events);
    assert.deepEqual(result.events.filter(event => event.type === 'TILE_PURCHASED'),
      [{ type: 'TILE_PURCHASED', tileId: 3, playerId, price: 60 }]);
    assert.equal(result.events.filter(event => event.type === 'HARBOR_DISCHARGED').length, 1);
    assert.equal(result.state.properties[3].ownerId, playerId);
    assert.deepEqual(result.state.players.map(player => player.balance), [4, 1500]);
    assert.equal(result.state.harborFreight.manifests[playerId], null);
    assert.equal(result.state.harborFreight.lastDelivery.purchasePrice, 60);
    assert.equal(result.state.phase, 'END_OF_TURN');
  }
  assert.equal(peer.state.players[0].secretMission, undefined);
  const settled = room.gameState;
  for (const revision of [action.revision, settled.harborFreight.revision]) {
    assert.equal((await act(buyer, playerId, { ...action, revision })).success, false);
    assert.strictEqual(room.gameState, settled);
  }
  assert.equal(resets.mock.callCount(), 1);
});

for (const example of [
  { name: 'pays cash when the ordinary purchase leaves its $80M reserve', dice: [1, 2], cashReserve: 80, result: 'cash' },
  { name: 'uses freight to keep its $80M reserve', dice: [1, 2], finalReserve: 80, result: 'freight' },
  { name: 'opens the auction when discharge would leave only $79M', dice: [1, 2], finalReserve: 79, result: 'auction' },
  { name: 'waits for the claim and discharge before its extra roll', dice: [6, 6], finalReserve: 80, result: 'freight' },
]) {
  test('the solo bot ' + example.name, t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const batches = [];
    const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, events) => batches.push(events) });
    const { room, playerId } = manager.createRoom('An', 'ONE_APUS', 'host');
    t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
    assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
    const state = room.gameState;
    const bot = state.players[1];
    const tileId = example.dice[0] + example.dice[1];
    const price = BOARD_TILES[tileId].price;
    const freight = getHarborFreightQuote(state, bot.id, 0, tileId).carrierNet;
    bot.balance = example.cashReserve === undefined ? price - freight + example.finalReserve : price + example.cashReserve;
    const dice = [...example.dice, 1, 2];
    t.mock.method(Math, 'random', () => (dice.shift() - 0.5) / 6);
    const until = check => {
      for (let tick = 0; tick < 85 && !check(); tick++) t.mock.timers.tick(100);
      assert.ok(check(), 'bot reached the expected decision');
    };
    assert.ok(manager.dispatchAction(room.id, playerId, { type: 'END_TURN' }).success);
    until(() => room.gameState.phase === 'AWAITING_BUY_DECISION');
    assert.equal(room.gameState.harborFreight.manifests[bot.id].originTileId, 0);
    until(() => room.gameState.phase !== 'AWAITING_BUY_DECISION');
    if (example.result === 'auction') {
      assert.equal(room.gameState.phase, 'AWAITING_AUCTION');
      assert.equal(room.gameState.properties[tileId].ownerId, null);
      assert.equal(room.gameState.harborFreight.lastDelivery, null);
      return;
    }
    const acquisition = batches.find(events => events.some(event => event.type === 'TILE_PURCHASED'));
    assert.equal(room.gameState.properties[tileId].ownerId, bot.id);
    assert.equal(room.gameState.players[1].balance, 80);
    assert.equal(acquisition.some(event => event.type === 'HARBOR_DISCHARGED'), example.result === 'freight');
    if (example.result === 'cash') {
      assert.equal(room.gameState.harborFreight.manifests[bot.id].originTileId, 0);
      return;
    }
    assert.equal(room.gameState.harborFreight.lastDelivery.purchasePrice, price);
    t.mock.timers.tick(3300);
    assert.equal(room.gameState.activePlayerIndex, 1);
    assert.equal(batches.flat().filter(event => event.type === 'DICE_ROLLED').length, 1);
    if (example.dice[0] === example.dice[1]) until(() => batches.flat().filter(event => event.type === 'DICE_ROLLED').length === 2);
    else until(() => room.gameState.activePlayerIndex === 0);
  });
}

test('a human timeout auctions a freight-fundable port and leaves the manifest intact', t => {
  const manager = new RoomManager();
  const { room, playerId } = manager.createRoom('An', 'ONE_APUS', 'host');
  manager.joinRoom(room.id, 'Mai', 'PILOT_BOAT', 'second');
  t.after(() => room.timer?.stop());
  assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
  room.gameState.players[0].balance = 52;
  assert.ok(manager.dispatchAction(room.id, playerId, loadInSingapore).success);
  assert.ok(manager.dispatchAction(room.id, playerId, sailToCaiMep).success);
  const state = room.gameState;
  assert.ok(getHarborPurchase(state, playerId));
  assert.equal(Object.hasOwn(state, 'supportsHarborPurchase'), false);
  for (const change of [{ gameStarted: false }, { winnerId: playerId }, { mode: 'classic' }, { mode: 'logistics' }, { mode: undefined }]) {
    assert.equal(gameStateForPlayer({ ...state, supportsHarborPurchase: true, ...change }, playerId).supportsHarborPurchase, undefined);
  }
  manager.handleAFKTimeout(room.id);
  assert.equal(room.gameState.phase, 'AWAITING_AUCTION');
  assert.equal(room.gameState.players[0].balance, 52);
  assert.deepEqual(room.gameState.harborFreight.manifests[playerId], { originTileId: 0 });
  assert.equal(room.gameState.properties[3].ownerId, null);
});
