import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { OneMonopolyEngine, SECRET_MISSIONS } from '@one-monopoly/shared';
import { io as connect } from 'socket.io-client';
import { gameStateForPlayer, setupSocketServer } from '../dist/socketServer.js';

const seats = [
  { id: 'buyer', name: 'Buyer', token: 'ONE_APUS' },
  { id: 'seller', name: 'Seller', token: 'PILOT_BOAT' },
];

function assertMissionView(view, authoritative, viewerId) {
  assert.equal(view.players.length, authoritative.players.length);
  for (const player of authoritative.players) {
    const received = view.players.find((p) => p.id === player.id);
    assert.equal(received.balance, player.balance);
    if (player.id === viewerId || player.secretMission?.isCompleted) {
      assert.deepEqual(received.secretMission, player.secretMission);
    } else {
      assert.equal(Object.hasOwn(received, 'secretMission'), false);
    }
  }
}

test('projecting a seat preserves authoritative missions and reveals completed cards', () => {
  const state = OneMonopolyEngine.createGame('ONE-TEST', seats);
  const cards = structuredClone(state.players.map((p) => p.secretMission));
  for (const viewer of ['buyer', 'seller', undefined]) {
    assertMissionView(gameStateForPlayer(state, viewer), state, viewer);
  }
  assert.deepEqual(state.players.map((p) => p.secretMission), cards);
  state.players[1].secretMission.isCompleted = true;
  assertMissionView(gameStateForPlayer(state, 'buyer'), state, 'buyer');
});

test('two captains receive private cards on startup, turn actions, trades and reconnect', async (t) => {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local network listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(server);
  const clients = [];
  let room;
  t.after(async () => {
    room?.timer?.stop();
    for (const client of clients) client.disconnect();
    await io.close();
  });

  async function open() {
    const client = connect('http://127.0.0.1:' + server.address().port, {
      transports: ['websocket'], reconnection: false,
    });
    clients.push(client);
    await next(client, 'connect');
    return client;
  }
  function next(client, event) {
    return once(client, event, { signal: AbortSignal.timeout(5000) }).then(([payload]) => payload);
  }
  const request = (client, event, payload) => client.timeout(5000).emitWithAck(event, payload);

  const buyer = await open();
  let seller = await open();
  const created = await request(buyer, 'room:create', { playerName: seats[0].name, token: seats[0].token });
  const { roomId, playerId: buyerId } = created;
  const join = { roomId, playerName: seats[1].name, token: seats[1].token };
  const joined = await request(seller, 'room:join', join);
  const sellerId = joined.playerId;
  room = roomManager.getRoom(roomId);

  async function checkUpdates(requestAction, viewerId) {
    const [first, second, ack] = await Promise.all([
      next(buyer, 'game:update'), next(seller, 'game:update'), requestAction(),
    ]);
    assert.ok(ack.success, ack.error);
    assertMissionView(first.state, room.gameState, buyerId);
    assertMissionView(second.state, room.gameState, sellerId);
    assert.deepEqual(first.events, second.events);
    if (viewerId) {
      assertMissionView(ack.state, room.gameState, viewerId);
      assert.deepEqual(ack.events, first.events);
    }
    return first;
  }
  function act(client, playerId, action) {
    return checkUpdates(() => request(client, 'game:action', { roomId, playerId, action }), playerId);
  }

  await checkUpdates(() => request(buyer, 'room:start', { roomId, playerId: buyerId, mode: 'classic' }));
  // Set up an Intra-Asia mission one purchase and one trade away from completion.
  room.gameState.players[0].secretMission = structuredClone(SECRET_MISSIONS.find((m) => m.id === 'MISSION-5'));
  room.gameState.players[1].secretMission = structuredClone(SECRET_MISSIONS.find((m) => m.id === 'MISSION-4'));
  room.gameState.properties[4].ownerId = buyerId;
  room.gameState.properties[1].ownerId = sellerId;
  await act(buyer, buyerId, { type: 'ROLL_DICE', forcedDice: [1, 2] });
  await act(buyer, buyerId, { type: 'BUY_PROPERTY' });
  const offered = await act(buyer, buyerId, { type: 'OFFER_TRADE', tileId: 1, sellerId, price: 75 });
  const offer = offered.events.find((e) => e.type === 'TRADE_OFFERED').offer;

  seller.disconnect();
  seller = await open();
  const [init, rejoined] = await Promise.all([
    next(seller, 'game:init'), request(seller, 'room:join', { ...join, sessionToken: joined.sessionToken }),
  ]);
  assert.ok(rejoined.isReconnect);
  assertMissionView(init.state, room.gameState, sellerId);
  assert.deepEqual(rejoined.gameState, init.state);
  assert.deepEqual(init.state.tradeOffers, [offer]);

  const completed = await act(seller, sellerId, { type: 'RESPOND_TRADE', offerId: offer.id, accept: true });
  const mission = completed.events.find((e) => e.type === 'MISSION_COMPLETED');
  assert.equal(mission.playerId, buyerId);
  assert.equal(mission.mission.isCompleted, true);
  assert.equal(mission.reward, 350);
  assert.deepEqual(mission.mission, completed.state.players[0].secretMission);
  assert.equal(completed.state.properties[1].ownerId, buyerId);
});
