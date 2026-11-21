import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { getCargoBookings, getReserveImportTruckAction, getReturnCargoToYardAction, getReturnCargoYardStatus } from '@one-monopoly/shared';
import { publicGameEvents, RoomManager } from '../dist/roomManager.js';
import { gameStateForPlayer, setupSocketServer } from '../dist/socketServer.js';

function bid(state, amount) {
  return {
    type: 'BID_FREIGHT_TENDER', tenderId: state.logistics.market.tender.id,
    revision: state.cargoRevision, amount,
  };
}

function withdraw(state) {
  return { type: 'WITHDRAW_FREIGHT_TENDER_BID', tenderId: state.logistics.market.tender.id, revision: state.cargoRevision };
}

function visibleBids(snapshot, entrants, mine) {
  const tender = snapshot.logistics.market.tender;
  assert.deepEqual(tender.bids, mine);
  assert.deepEqual([...tender.bidderIds].sort(), [...entrants].sort());
  assert.equal(tender.bidCount, entrants.length);
}

test('a public yard return releases its held truck while both captains keep their own sealed quote on reconnect', async t => {
  const network = await socketNetwork(t);
  if (!network) return;
  const { open, request, next, roomManager } = network;
  const host = await open(), owner = await open();
  const { roomId, playerId: a } = await request(host, 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const { playerId: b, sessionToken } = await request(owner, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  assert.ok((await request(host, 'room:start', { roomId, playerId: a })).success);
  const room = roomManager.getRoom(roomId);
  t.after(() => room.timer?.stop());
  const send = (socket, playerId, action) => request(socket, 'game:action', { roomId, playerId, action });
  async function accept(socket, id, action) {
    const reply = await send(socket, id, action);
    assert.ok(reply.success, reply.error);
    return reply;
  }
  await accept(host, a, bid(room.gameState, 13));
  await accept(host, a, { type: 'END_TURN' });
  const quote = await accept(owner, b, bid(room.gameState, 7));
  const load = getCargoBookings(quote.state, b, 'laden').find(choice => choice.tileId === 1);
  const booked = await accept(owner, b, load.action);
  const held = await accept(owner, b, getReserveImportTruckAction(booked.state, b));
  const release = getReturnCargoToYardAction(held.state, b);
  const before = room.gameState;
  assert.equal(held.state.logistics.ports[1].demand, 0);
  for (const id of [a, b]) assert.equal((await send(host, id, release)).success, false);
  assert.equal(room.gameState, before);

  const [hostUpdate, ownerUpdate, ack] = await Promise.all([
    next(host, 'game:update'), next(owner, 'game:update'), accept(owner, b, release),
  ]);
  visibleBids(hostUpdate.state, [a, b], { [a]: 13 });
  for (const packet of [ownerUpdate, ack]) visibleBids(packet.state, [a, b], { [b]: 7 });
  for (const packet of [hostUpdate, ownerUpdate, ack]) {
    assert.deepEqual(packet.events, [{ type: 'CARGO_RETURNED_TO_YARD', playerId: b, tileId: 0,
      bookingId: release.bookingId, kind: 'laden', destinationTileId: 1 }]);
    assert.equal(packet.state.players[1].cargo, undefined);
    assert.equal(packet.state.logistics.ports[0].supply, before.logistics.ports[0].supply + 1);
    assert.equal(packet.state.logistics.ports[1].demand, 1);
    assert.equal(packet.state.logistics.importTruckReservations[b], undefined);
    assert.equal(packet.state.logistics.importTruckAvailable[b], false);
  }
  owner.disconnect();
  const returning = await open();
  const [init, joined] = await Promise.all([next(returning, 'game:init'),
    request(returning, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT', sessionToken })]);
  assert.ok(joined.isReconnect);
  assert.deepEqual(init.state, joined.gameState);
  visibleBids(init.state, [a, b], { [b]: 7 });
  assert.equal(getReturnCargoYardStatus(init.state, b), null);
  assert.equal(init.state.logistics.ports[1].demand, 1);
  const fresh = await accept(returning, b, getCargoBookings(init.state, b, 'laden').find(choice => choice.tileId === 1).action);
  assert.notEqual(fresh.state.players[1].cargo.bookingId, release.bookingId);
  const replacement = room.gameState;
  for (const revision of [release.revision, replacement.cargoRevision]) {
    assert.equal((await send(returning, b, { ...release, revision })).success, false);
  }
  assert.equal(room.gameState, replacement);
});

test('socket dispatch hides prices even before serialization and rejected bids leave deadlines intact', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const updates = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, events) => updates.push(events) });
  const { room, playerId } = manager.createRoom('Linh', 'ONE_APUS', 'captain');
  manager.startGame(room.id, playerId);
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  const bot = room.players[1].id;
  const send = (actor, action) => manager.dispatchSocketAction('captain', { roomId: room.id, playerId: actor, action });
  const initialBid = bid(room.gameState, 12);
  t.mock.timers.tick(2000);
  const amount = send(playerId, initialBid);
  assert.ok(amount.success, amount.error);
  visibleBids(amount.state, [playerId], { [playerId]: 12 });
  assert.equal(room.timer.getRemainingSeconds(), 43);
  const afterBid = room.gameState;
  const updateCount = updates.length;
  for (const invalid of [initialBid, { ...bid(afterBid, 12), tenderId: -1 }, bid(afterBid, NaN)]) {
    assert.equal(send(playerId, invalid).success, false);
    assert.equal(room.gameState, afterBid);
    assert.equal(updates.length, updateCount);
    assert.equal(room.timer.getRemainingSeconds(), 43);
  }
  const amended = send(playerId, bid(afterBid, 14));
  assert.ok(amended.success);
  visibleBids(amended.state, [playerId], { [playerId]: 14 });
  visibleBids(gameStateForPlayer(room.gameState, bot), [playerId], {});
  visibleBids(gameStateForPlayer(room.gameState, undefined), [playerId], {});
  assert.deepEqual(amended.events, [{ type: 'FREIGHT_TENDER_BID', tenderId: initialBid.tenderId, playerId }]);
  const handover = send(playerId, { type: 'END_TURN' });
  assert.ok(handover.success);
  const timer = room.botTimer;
  assert.ok(timer);
  const state = room.gameState;
  const writes = updates.length;
  t.mock.timers.tick(1000);
  for (const actor of [playerId, bot]) {
    const refused = send(actor, bid(state, 8));
    assert.equal(refused.success, false);
    assert.equal(refused.state, undefined);
    assert.equal(room.botTimer, timer);
    assert.equal(room.gameState, state);
    assert.equal(room.timer.getRemainingSeconds(), 44);
    assert.equal(updates.length, writes);
  }
  t.mock.timers.tick(801);
  assert.notEqual(room.gameState, state, 'bot still acts on the originally scheduled deadline');
});

async function socketNetwork(t) {
  const httpServer = createServer();
  try {
    await new Promise((resolve, reject) => httpServer.once('error', reject).listen(0, '127.0.0.1', resolve));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local network listener unavailable');
    throw error;
  }
  const { io, roomManager } = setupSocketServer(httpServer);
  const connected = [];
  t.after(async () => {
    connected.forEach(client => client.disconnect());
    await io.close();
  });
  const next = (client, event) => once(client, event, { signal: AbortSignal.timeout(5000) }).then(([packet]) => packet);
  const request = (client, event, data) => client.timeout(5000).emitWithAck(event, data);
  async function open() {
    const client = connect('http://127.0.0.1:' + httpServer.address().port, { autoConnect: false, transports: ['websocket'], reconnection: false });
    connected.push(client);
    const ready = next(client, 'connect');
    client.connect();
    await ready;
    return client;
  }
  return { open, request, next, roomManager };
}

test('sealed prices stay private on live broadcasts, raw acknowledgements and reconnect, including for the host', async t => {
  const network = await socketNetwork(t);
  if (!network) return;
  const { open, request, next, roomManager } = network;
  let host = await open();
  const rival = await open();
  const bystander = await open();
  const captain = await request(host, 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const { roomId, playerId: first } = captain;
  const second = (await request(rival, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' })).playerId;
  const third = (await request(bystander, 'room:join', { roomId, playerName: 'An', token: 'GANTRY_CRANE' })).playerId;
  const room = roomManager.getRoom(roomId);
  t.after(() => room.timer?.stop());
  const occupants = () => [[host, first], [rival, second], [bystander, third]];
  const action = (client, playerId, command) => request(client, 'game:action', { roomId, playerId, action: command });
  async function broadcast(requestAction) {
    const [packets, ack] = await Promise.all([Promise.all(occupants().map(([client]) => next(client, 'game:update'))), requestAction()]);
    assert.ok(ack.success, ack.error);
    for (const packet of packets) assert.deepEqual(packet.events, packets[0].events);
    return { packets, ack };
  }
  await broadcast(() => request(host, 'room:start', { roomId, playerId: first }));
  const one = await broadcast(() => action(host, first, bid(room.gameState, 12)));
  const firstBid = { [first]: 12 };
  visibleBids(one.packets[0].state, [first], firstBid);
  visibleBids(one.packets[1].state, [first], {});
  visibleBids(one.packets[2].state, [first], {});
  visibleBids(one.ack.state, [first], firstBid);
  assert.deepEqual(one.ack.events, [{
    type: 'FREIGHT_TENDER_BID', playerId: first, tenderId: room.gameState.logistics.market.tender.id,
  }]);
  const wait = await broadcast(() => action(host, first, { type: 'END_TURN' }));
  visibleBids(wait.packets[1].state, [first], {});
  const two = await broadcast(() => action(rival, second, bid(room.gameState, 8)));
  const entrants = [first, second];
  visibleBids(two.packets[0].state, entrants, firstBid);
  visibleBids(two.packets[1].state, entrants, { [second]: 8 });
  visibleBids(two.packets[2].state, entrants, {});
  visibleBids(two.ack.state, entrants, { [second]: 8 });
  assert.deepEqual(two.ack.events, [{
    type: 'FREIGHT_TENDER_BID', playerId: second, tenderId: room.gameState.logistics.market.tender.id,
  }]);
  assert.deepEqual(room.gameState.logistics.market.tender.bids, { [first]: 12, [second]: 8 });

  const oldHost = host;
  const oldUpdates = [];
  oldHost.on('game:update', packet => oldUpdates.push(packet));
  host = await open();
  const [init, resumed] = await Promise.all([
    next(host, 'game:init'),
    request(host, 'room:join', { roomId, playerName: 'Linh', token: 'ONE_APUS', sessionToken: captain.sessionToken }),
  ]);
  assert.ok(resumed.isReconnect);
  visibleBids(init.state, entrants, firstBid);
  assert.deepEqual(resumed.gameState, init.state);
  assert.equal(JSON.stringify(resumed.room).includes('"bids"'), false);
  assert.equal((await action(oldHost, first, bid(room.gameState, 8))).success, false);
  assert.equal((await action(host, second, bid(room.gameState, 8))).success, false);
  assert.equal((await action(bystander, third, bid(room.gameState, 8))).success, false);
  const unauthorizedJoin = await request(oldHost, 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  assert.equal(unauthorizedJoin.success, false);
  assert.equal(unauthorizedJoin.gameState, undefined);

  await broadcast(() => action(rival, second, { type: 'END_TURN' }));
  const settled = await broadcast(() => action(bystander, third, { type: 'END_TURN' }));
  for (const packet of [...settled.packets, settled.ack]) {
    visibleBids(packet.state, [], {});
    const market = packet.state.logistics.market;
    assert.equal(market.contract.playerId, second);
    assert.equal(market.contract.amount, 8);
    const award = packet.events.find(e => e.type === 'FREIGHT_TENDER_AWARDED');
    assert.deepEqual(award, {
      type: 'FREIGHT_TENDER_AWARDED', tenderId: 1, deliveryRound: 2, playerId: second,
      kind: market.contract.kind, destinationTileId: market.contract.destinationTileId, amount: 8,
    });
    assert.equal(JSON.stringify({ contract: market.contract, history: market.history, award }).includes(first), false);
    assert.equal(JSON.stringify({ contract: market.contract, history: market.history, award }).includes('"bids"'), false);
  }
  // An acknowledgement on the superseded socket is ordered after any unintended broadcasts to it.
  assert.equal((await action(oldHost, first, { type: 'END_TURN' })).success, false);
  assert.deepEqual(oldUpdates, []);
});

test('bid and withdrawal broadcasts whitelist the same public fields even when an event contains private prices', () => {
  for (const type of ['FREIGHT_TENDER_BID', 'FREIGHT_TENDER_BID_WITHDRAWN']) {
    const event = { type, playerId: 'captain', tenderId: 1, amount: 4, oldAmount: 4, bids: { other: 11 }, offer: { quote: 4 } };
    assert.deepEqual(publicGameEvents([event]), [{ type, playerId: 'captain', tenderId: 1 }]);
  }
});

test('reconnecting to a legacy tender rebuilds public participation before it hides the other sealed quotes', t => {
  const manager = new RoomManager();
  const { room, playerId } = manager.createRoom('Linh', 'ONE_APUS', 'captain');
  const rival = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'other').playerId;
  manager.startGame(room.id, playerId);
  t.after(() => room.timer?.stop());
  const tender = room.gameState.logistics.market.tender;
  const entrants = [rival, playerId];
  tender.bids = Object.assign(Object.create({ inherited: 9 }), { [rival]: 12, [playerId]: 7 });
  tender.previousAmount = 16;
  for (const omitted of [['bidderIds'], ['bidCount'], ['bidderIds', 'bidCount']]) {
    tender.bidderIds = entrants;
    tender.bidCount = entrants.length;
    for (const field of omitted) delete tender[field];
    for (const [viewer, mine] of [[playerId, { [playerId]: 7 }], [rival, { [rival]: 12 }], [undefined, {}], ['inherited', {}]]) {
      const view = gameStateForPlayer(room.gameState, viewer);
      visibleBids(view, entrants, mine);
      assert.equal(Object.hasOwn(view.logistics.market.tender, 'previousAmount'), false);
    }
    for (const field of omitted) assert.equal(Object.hasOwn(tender, field), false);
  }
});

test('a withdrawal preserves the turn deadline and an old request cannot cancel a replacement bid', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const writes = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, events) => writes.push(events) });
  const { room, playerId: captain } = manager.createRoom('Linh', 'ONE_APUS', 'first');
  const other = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'second').playerId;
  manager.startGame(room.id, captain);
  t.after(() => room.timer?.stop());
  const send = (socket, playerId, action) => manager.dispatchSocketAction(socket, { roomId: room.id, playerId, action });
  const own = action => send('first', captain, action);
  assert.ok(own(bid(room.gameState, 4)).success);
  const cancel = withdraw(room.gameState);
  t.mock.timers.tick(3000);
  const state = room.gameState, updates = writes.length;
  const refused = [
    ['second', captain, cancel], ['second', other, cancel], ['disconnected', captain, cancel],
    ['first', captain, { ...cancel, amount: 4 }], ['first', captain, { ...cancel, playerId: other }],
    ['first', captain, { ...cancel, revision: String(cancel.revision) }], ['first', captain, { ...cancel, revision: cancel.revision - 1 }],
    ['first', captain, { ...cancel, tenderId: cancel.tenderId + 1 }],
  ];
  for (const args of refused) {
    const result = send(...args);
    assert.equal(result.success, false);
    assert.equal(result.state, undefined);
    assert.equal(room.gameState, state);
    assert.equal(writes.length, updates);
  }
  const accepted = own(cancel);
  assert.ok(accepted.success, accepted.error);
  visibleBids(accepted.state, [], {});
  assert.equal(accepted.state.cargoRevision, state.cargoRevision + 1);
  assert.deepEqual(accepted.events, [{ type: 'FREIGHT_TENDER_BID_WITHDRAWN', playerId: captain, tenderId: cancel.tenderId }]);
  assert.equal(room.timer.getRemainingSeconds(), 42);
  assert.equal(own(withdraw(room.gameState)).success, false);
  assert.ok(own(bid(room.gameState, 8)).success);
  const replacement = room.gameState;
  assert.equal(own(cancel).success, false);
  assert.equal(room.gameState, replacement);
  visibleBids(room.gameState, [captain], { [captain]: 8 });
  assert.equal(room.timer.getRemainingSeconds(), 42);
  t.mock.timers.tick(42000);
  assert.equal(room.gameState.players[room.gameState.activePlayerIndex].id, other);
  assert.equal(own(withdraw(room.gameState)).success, false);
  visibleBids(room.gameState, [captain], { [captain]: 8 });
});

test('two connected captains see a withdrawal, reconnect to private quotes, and award only the bid still submitted', async t => {
  const network = await socketNetwork(t);
  if (!network) return;
  const { open, request, next, roomManager } = network;
  const seats = [await open(), await open()];
  const first = await request(seats[0], 'room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const { roomId } = first;
  const second = await request(seats[1], 'room:join', { roomId, playerName: 'Minh', token: 'PILOT_BOAT' });
  const ids = [first.playerId, second.playerId];
  const room = roomManager.getRoom(roomId);
  t.after(() => room.timer?.stop());
  const send = (client, playerId, action) => request(client, 'game:action', { roomId, playerId, action });
  async function act(index, action) {
    const [packets, ack] = await Promise.all([
      Promise.all(seats.map(socket => next(socket, 'game:update'))),
      send(seats[index], ids[index], action),
    ]);
    assert.ok(ack.success, ack.error);
    for (const packet of packets) assert.deepEqual(packet.events, ack.events);
    return [...packets, ack];
  }
  const [, start] = await Promise.all([
    Promise.all(seats.map(socket => next(socket, 'game:update'))),
    request(seats[0], 'room:start', { roomId, playerId: ids[0] }),
  ]);
  assert.ok(start.success, start.error);
  await act(0, bid(room.gameState, 15));
  await act(0, { type: 'END_TURN' });
  await act(1, bid(room.gameState, 4));
  const cancel = withdraw(room.gameState);
  const after = await act(1, cancel);
  visibleBids(after[0].state, [ids[0]], { [ids[0]]: 15 });
  visibleBids(after[1].state, [ids[0]], {});
  visibleBids(after[2].state, [ids[0]], {});
  assert.deepEqual(after[2].events, [{ type: 'FREIGHT_TENDER_BID_WITHDRAWN', playerId: ids[1], tenderId: cancel.tenderId }]);

  // A replacement connection can see only its own live quote and the old one loses its authority.
  for (const [i, token, login] of [[0, 'ONE_APUS', first], [1, 'PILOT_BOAT', second]]) {
    const old = seats[i];
    seats[i] = await open();
    const [init, ack] = await Promise.all([
      next(seats[i], 'game:init'),
      request(seats[i], 'room:join', { roomId, sessionToken: login.sessionToken, playerName: 'Rejoin', token }),
    ]);
    assert.equal(ack.isReconnect, true);
    visibleBids(init.state, [ids[0]], i === 0 ? { [ids[0]]: 15 } : {});
    assert.deepEqual(ack.gameState, init.state);
    assert.equal((await send(old, ids[i], withdraw(room.gameState))).success, false);
    old.disconnect();
  }
  const awarded = await act(1, { type: 'END_TURN' });
  for (const packet of awarded) {
    const award = packet.events.find(event => event.type === 'FREIGHT_TENDER_AWARDED');
    assert.equal(award.playerId, ids[0]);
    assert.equal(award.amount, 15);
    visibleBids(packet.state, [], {});
  }

  // A delayed withdrawal from round one cannot remove the same player's new-round quote.
  await act(0, { type: 'END_TURN' });
  await act(1, bid(room.gameState, 11));
  const late = await send(seats[1], ids[1], cancel);
  assert.equal(late.success, false);
  assert.equal(late.state, undefined);
  visibleBids(room.gameState, [ids[1]], { [ids[1]]: 11 });
  await act(1, withdraw(room.gameState));
  const unawarded = await act(1, { type: 'END_TURN' });
  for (const packet of unawarded) {
    assert.equal(packet.events.some(event => event.type === 'FREIGHT_TENDER_AWARDED'), false);
    assert.equal(packet.state.logistics.market.contract, null);
    visibleBids(packet.state, [], {});
  }
});
