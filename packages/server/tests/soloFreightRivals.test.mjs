import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { FREIGHT_RIVALS } from '@one-monopoly/shared';
import { gameStateForPlayer, RoomManager } from '../dist/roomManager.js';
import { getFreightBotAction } from '../dist/freightBot.js';
import { setupSocketServer } from '../dist/socketServer.js';

const botId = 'ai-mate-1';
function create(t, token = 'ONE_APUS') {
  const manager = new RoomManager();
  const { room, playerId } = manager.createRoom('Linh', token, 'host');
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  return { manager, room, playerId };
}

test('solo starts choose the named freight rival and a free thematic token, including the default', t => {
  for (const [style, hostToken, expectedToken] of [
    [undefined, 'ONE_APUS', 'PILOT_BOAT'], ['standard', 'GANTRY_CRANE', 'ONE_APUS'],
    ['equipment', 'ONE_APUS', 'GANTRY_CRANE'], ['equipment', 'GANTRY_CRANE', 'CONTAINER_TRUCK'],
    ['coastal', 'ONE_APUS', 'BUNKER_BARGE'], ['coastal', 'BUNKER_BARGE', 'PILOT_BOAT'],
  ]) {
    const { manager, room, playerId } = create(t, hostToken);
    assert.ok(manager.startGame(room.id, playerId, 'logistics', style).success);
    const [captain, bot] = room.gameState.players;
    assert.equal(captain.freightRivalStyle, undefined);
    assert.equal(bot.id, botId);
    assert.equal(bot.freightRivalStyle, style ?? 'standard');
    assert.equal(bot.token, expectedToken);
    assert.notEqual(bot.token, captain.token);
    assert.equal(bot.name, FREIGHT_RIVALS[style ?? 'standard'].name);
    assert.equal(room.players[1].name, bot.name);
    assert.equal(room.players[1].freightRivalStyle, bot.freightRivalStyle);
    assert.equal(room.players[1].sessionToken, undefined);
    const started = room.gameState;
    assert.equal(manager.startGame(room.id, playerId, 'logistics', 'coastal').success, false);
    assert.equal(room.gameState, started);
    assert.equal(room.players.length, 2);
  }
});

test('invalid choices, classic and a second captain arriving before start leave the lobby unchanged', t => {
  const { manager, room, playerId } = create(t);
  const roster = structuredClone(room.players);
  for (const style of ['unknown', '', '__proto__', null, false, ['equipment'], { style: 'coastal' }]) {
    assert.equal(manager.startGame(room.id, playerId, 'logistics', style).success, false);
  }
  for (const style of ['standard', 'coastal', 'equipment']) {
    assert.equal(manager.startGame(room.id, playerId, 'classic', style).success, false);
  }
  assert.equal(room.isGameStarted, false);
  assert.equal(room.timer, null);
  assert.deepEqual(room.players, roster);
  const rival = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'mate');
  const joined = structuredClone(room.players);
  assert.equal(manager.startGame(room.id, rival.playerId, 'logistics', 'equipment').success, false);
  assert.equal(manager.startGame(room.id, playerId, 'logistics', 'standard').success, false);
  assert.deepEqual(room.players, joined);
  assert.equal(room.gameState, null);
  assert.ok(manager.startGame(room.id, playerId).success);
  assert.ok(room.gameState.players.every(player => !player.freightRivalStyle && player.id !== botId));
  const classic = create(t);
  assert.ok(classic.manager.startGame(classic.room.id, classic.playerId, 'classic').success);
  assert.deepEqual(classic.room.gameState.players.map(p => p.freightRivalStyle), [undefined, undefined]);
  assert.equal(classic.room.gameState.players[1].name, 'AI Thuyền Phó (Bot)');
  assert.equal(classic.room.gameState.players[1].token, 'PILOT_BOAT');
});

test('the scheduled AI uses its own equipment policy and falls back to standard for an older snapshot', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  for (const legacy of [false, true]) {
    const { manager, room, playerId } = create(t);
    assert.ok(manager.startGame(room.id, playerId, 'logistics', 'equipment').success);
    if (legacy) {
      delete room.gameState.players[1].freightRivalStyle;
      delete room.players[1].freightRivalStyle;
    }
    assert.ok(manager.dispatchAction(room.id, playerId, { type: 'END_TURN' }).success);
    const view = gameStateForPlayer(room.gameState, botId);
    const standard = getFreightBotAction(view, 'standard');
    const equipment = getFreightBotAction(view, 'equipment');
    assert.notEqual(standard.destinationTileId, equipment.destinationTileId, 'opening ports distinguish the policies');
    const expected = legacy ? standard : equipment;
    t.mock.timers.tick(1801);
    const booking = room.gameState.players[1].cargo;
    assert.deepEqual([booking.kind, booking.destinationTileId], [expected.kind, expected.destinationTileId]);
    room.timer.stop();
    manager.clearBotTimer(room);
  }
});

test('the authenticated host starts one rival and reconnects to the same public AI identity and private tender', async t => {
  const http = createServer();
  try { await new Promise((ok, fail) => http.once('error', fail).listen(0, '127.0.0.1', ok)); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable'); throw error; }
  const { io, roomManager } = setupSocketServer(http);
  const clients = [];
  let room;
  t.after(async () => { room?.timer?.stop(); if (room) roomManager.clearBotTimer(room); clients.forEach(c => c.disconnect()); await io.close(); });
  const next = (c, event) => once(c, event, { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const send = (c, event, data) => c.timeout(5000).emitWithAck(event, data);
  async function open() {
    const c = connect('http://127.0.0.1:' + http.address().port, { autoConnect: false, transports: ['websocket'], reconnection: false });
    clients.push(c); const ready = next(c, 'connect'); c.connect(); await ready; return c;
  }
  const host = await open(), stranger = await open();
  const seat = await send(host, 'room:create', { playerName: 'Linh', token: 'ONE_APUS', freightRivalStyle: 'equipment' });
  const { roomId, playerId, sessionToken } = seat;
  room = roomManager.getRoom(roomId);
  const start = (socket, style) => send(socket, 'room:start', { roomId, playerId, mode: 'logistics', rivalStyle: style });
  assert.equal((await start(stranger, 'equipment')).success, false);
  assert.equal((await start(host, { name: 'coastal' })).success, false);
  assert.equal(room.gameState, null);
  const [update, first, duplicate] = await Promise.all([next(host, 'game:update'), start(host, 'equipment'), start(host, 'coastal')]);
  assert.ok(first.success);
  assert.equal(duplicate.success, false);
  const [actualHost, rival] = update.state.players;
  assert.ok(update.state.players.every(player => !Object.hasOwn(player, 'sessionToken')));
  assert.equal(actualHost.freightRivalStyle, undefined);
  assert.deepEqual([rival.id, rival.token, rival.freightRivalStyle], [botId, 'GANTRY_CRANE', 'equipment']);
  assert.ok(rival.name.length > 0);
  const bid = await send(host, 'game:action', { roomId, playerId, action: { type: 'BID_FREIGHT_TENDER',
    tenderId: update.state.logistics.market.tender.id, revision: update.state.cargoRevision, amount: 12 } });
  assert.ok(bid.success);
  assert.deepEqual(bid.state.players[1], rival);
  const replacement = await open();
  const [init, joined] = await Promise.all([next(replacement, 'game:init'), send(replacement, 'room:join', {
    roomId, sessionToken, playerName: 'Untrusted replacement', token: 'BUNKER_BARGE', rivalStyle: 'coastal',
  })]);
  assert.ok(joined.isReconnect);
  assert.deepEqual(joined.gameState, init.state);
  assert.deepEqual(init.state.players[1], rival);
  assert.equal(joined.room.players[0].freightRivalStyle, undefined);
  assert.equal(joined.room.players[1].freightRivalStyle, 'equipment');
  assert.ok(joined.room.players.every(p => !Object.hasOwn(p, 'sessionToken')));
  assert.deepEqual(init.state.logistics.market.tender.bids, { [playerId]: 12 });
  assert.equal((await start(host, 'standard')).success, false);
});
