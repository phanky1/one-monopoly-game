import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { getHarborFreightOpportunity } from '@one-monopoly/shared';
import { io as connect } from 'socket.io-client';
import { RoomManager } from '../dist/roomManager.js';
import { setupSocketServer } from '../dist/socketServer.js';

const landingRoll = { type: 'ROLL_DICE', forcedDice: [1, 2] };
const balances = state => state.players.map(player => player.balance);

test('the scheduled Harbor bot loads before rolling, pays rent, settles freight once and hands back the turn', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, group) => events.push(...group) });
  const { room, playerId } = manager.createRoom('Linh', 'ONE_APUS', 'host');
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  assert.ok(manager.startGame(room.id, playerId, 'harbor').success);
  const send = action => manager.dispatchSocketAction('host', { roomId: room.id, playerId, action });
  assert.ok(send(landingRoll).success);
  assert.ok(send({ type: 'BUY_PROPERTY' }).success);
  assert.equal(room.gameState.properties[3].ownerId, playerId);
  assert.ok(send({ type: 'END_TURN' }).success);
  const botId = room.players[1].id;
  const dice = [0, 0.2]; // The bot's real roll produces a one and a two.
  t.mock.method(Math, 'random', () => {
    assert.ok(dice.length, 'the bot must roll once');
    return dice.shift();
  });
  function advanceUntil(predicate) {
    for (let i = 0; i < 60 && !predicate(); i++) t.mock.timers.tick(100);
    assert.ok(predicate(), 'the scheduled bot advanced');
  }
  const start = events.length;
  advanceUntil(() => room.gameState.harborFreight.manifests[botId]);
  assert.equal(room.gameState.players[1].position, 0);
  assert.deepEqual(events.slice(start).map(event => event.type), ['HARBOR_LOADED']);
  advanceUntil(() => room.gameState.players[1].position === 3);
  assert.equal(room.gameState.phase, 'END_OF_TURN');
  assert.deepEqual(balances(room.gameState), [1444, 1496]);
  assert.equal(room.gameState.harborFreight.lastDelivery, null);
  advanceUntil(() => room.gameState.harborFreight.lastDelivery);
  const receipt = room.gameState.harborFreight.lastDelivery;
  assert.deepEqual([receipt.playerId, receipt.operatorId, receipt.carrierNet, receipt.handlingFee], [botId, playerId, 9, 3]);
  assert.deepEqual(balances(room.gameState), [1447, 1505]);
  advanceUntil(() => room.gameState.activePlayerIndex === 0);
  t.mock.timers.tick(3000);
  assert.equal(room.botTimer, null);
  const order = new Set(['HARBOR_LOADED', 'DICE_ROLLED', 'DEMURRAGE_PAID', 'HARBOR_DISCHARGED']);
  assert.deepEqual(events.slice(start).map(event => event.type).filter(type => order.has(type)),
    ['HARBOR_LOADED', 'DICE_ROLLED', 'DEMURRAGE_PAID', 'HARBOR_DISCHARGED']);
  assert.deepEqual(balances(room.gameState), [1447, 1505]);
});

test('Harbor sockets bind cargo to its captain and resume the paid receipt with each classic mission private', async t => {
  const http = createServer();
  try { await new Promise((ok, fail) => http.once('error', fail).listen(0, '127.0.0.1', ok)); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local socket listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(http);
  const sockets = [];
  let room;
  t.after(async () => {
    room?.timer?.stop();
    if (room) roomManager.clearBotTimer(room);
    sockets.forEach(socket => socket.disconnect());
    await io.close();
  });
  const next = (socket, name) => once(socket, name, { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const send = (socket, event, data) => socket.timeout(5000).emitWithAck(event, data);
  async function open() {
    const socket = connect('http://127.0.0.1:' + http.address().port, {
      transports: ['websocket'], autoConnect: false, reconnection: false,
    });
    sockets.push(socket);
    const connected = next(socket, 'connect');
    socket.connect();
    await connected;
    return socket;
  }
  const owner = await open(), carrier = await open();
  const { roomId, playerId: ownerId } = await send(owner, 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const join = { roomId, playerName: 'Minh', token: 'PILOT_BOAT' };
  const { playerId: carrierId, sessionToken } = await send(carrier, 'room:join', join);
  room = roomManager.getRoom(roomId);
  const [initialOwner, initialCarrier, start] = await Promise.all([
    next(owner, 'game:update'), next(carrier, 'game:update'),
    send(owner, 'room:start', { roomId, playerId: ownerId, mode: 'harbor' }),
  ]);
  assert.ok(start.success);
  const missions = new Map([
    [ownerId, initialOwner.state.players[0].secretMission], [carrierId, initialCarrier.state.players[1].secretMission],
  ]);
  assert.ok([...missions.values()].every(mission => mission && !mission.isCompleted));
  function checkPrivacy(state, viewer) {
    assert.equal(state.mode, 'harbor');
    for (const player of state.players) {
      if (player.id === viewer) assert.deepEqual(player.secretMission, missions.get(viewer));
      else assert.equal(Object.hasOwn(player, 'secretMission'), false);
    }
  }
  const command = (socket, playerId, action) => send(socket, 'game:action', { roomId, playerId, action });
  async function accept(socket, actor, action) {
    const [ownerUpdate, carrierUpdate, ack] = await Promise.all([
      next(owner, 'game:update'), next(carrier, 'game:update'), command(socket, actor, action),
    ]);
    assert.ok(ack.success, ack.error);
    for (const [packet, viewer] of [[ownerUpdate, ownerId], [carrierUpdate, carrierId], [ack, actor]]) {
      checkPrivacy(packet.state, viewer);
      assert.deepEqual(packet.events, ack.events);
      assert.deepEqual(packet.state.harborFreight, ack.state.harborFreight);
    }
    return ack;
  }
  await accept(owner, ownerId, landingRoll);
  await accept(owner, ownerId, { type: 'BUY_PROPERTY' });
  const turn = await accept(owner, ownerId, { type: 'END_TURN' });
  const load = getHarborFreightOpportunity(turn.state, carrierId).action;
  assert.equal((await command(owner, carrierId, load)).success, false);
  assert.equal((await command(owner, ownerId, load)).success, false);
  await accept(carrier, carrierId, load);
  const arrival = await accept(carrier, carrierId, landingRoll);
  assert.deepEqual(balances(arrival.state), [1444, 1496]);
  const discharge = getHarborFreightOpportunity(arrival.state, carrierId).action;
  const paid = await accept(carrier, carrierId, discharge);
  assert.equal(paid.events.filter(event => event.type === 'HARBOR_DISCHARGED').length, 1);
  assert.deepEqual(balances(paid.state), [1447, 1505]);

  const returning = await open();
  const [init, resumed] = await Promise.all([next(returning, 'game:init'),
    send(returning, 'room:join', { ...join, sessionToken })]);
  assert.ok(resumed.isReconnect);
  assert.deepEqual(init.state, resumed.gameState);
  checkPrivacy(init.state, carrierId);
  assert.equal(init.events, undefined);
  assert.deepEqual(init.state.harborFreight, paid.state.harborFreight);
  assert.deepEqual(balances(init.state), [1447, 1505]);
  assert.equal(getHarborFreightOpportunity(init.state, carrierId), null);
  const after = room.gameState;
  assert.equal((await command(carrier, carrierId, { type: 'END_TURN' })).success, false);
  assert.equal((await command(returning, carrierId, discharge)).success, false);
  assert.equal((await command(returning, carrierId, { ...discharge, revision: after.harborFreight.revision })).success, false);
  assert.equal(room.gameState, after);
});
