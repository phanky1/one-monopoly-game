import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomManager, gameStateForPlayer } from '../dist/roomManager.js';

function charterRoom(t, { third = false, laden = false, port = 3, group = false } = {}) {
  const updates = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, state, events) => updates.push({ state, events }) });
  const { room, playerId: carrier } = manager.createRoom('Minh', 'ONE_APUS', 'carrier');
  const { playerId: owner } = manager.joinRoom(room.id, 'Linh', 'PILOT_BOAT', 'owner');
  if (third) manager.joinRoom(room.id, 'An', 'GANTRY_CRANE', 'third');
  t.after(() => { room.timer?.stop(); manager.clearBotTimer(room); });
  assert.ok(manager.startGame(room.id, carrier, 'harbor').success);
  const command = (socketId, playerId, action) =>
    manager.dispatchSocketAction(socketId, { roomId: room.id, playerId, action });
  if (laden) assert.ok(command('carrier', carrier, { type: 'HARBOR_LOAD', tileId: 0, revision: 0 }).success);
  const state = room.gameState;
  state.properties[4].ownerId = carrier;
  Object.assign(state.properties[port], { ownerId: owner, containerLevel: 1 });
  if (group) state.properties[port === 1 ? 3 : 1].ownerId = owner;
  if (port === 1) state.players[0].position = 30;
  assert.ok(command('carrier', carrier, { type: 'ROLL_DICE', forcedDice: [1, 2] }).success);
  assert.equal(room.gameState.phase, 'AWAITING_SLOT_CHARTER_RESPONSE');
  const accepted = command('owner', owner, { type: 'RESPOND_SLOT_CHARTER', accept: true });
  assert.ok(accepted.success);
  assert.deepEqual(accepted.state.properties[port].slotCharter, { partnerId: carrier, active: true });
  return { room, manager, carrier, owner, command, updates };
}

test('the seated charter partner can waive the pickup once without resetting the turn or paying the tariff', t => {
  const { room, carrier, owner, command, updates } = charterRoom(t, { laden: true });
  const state = room.gameState;
  const action = { type: 'HARBOR_USE_CHARTER', kind: 'turnaround', tileId: 3,
    revision: state.harborFreight.revision, operatorId: owner, waivedFee: 3 };
  const timer = t.mock.method(room.timer, 'reset');
  updates.length = 0;
  for (const [socket, actor, request] of [
    ['owner', carrier, action], ['owner', owner, action], ['carrier', carrier, { ...action, waivedFee: 6 }],
  ]) {
    assert.equal(command(socket, actor, request).success, false);
    assert.equal(room.gameState, state);
  }
  const result = command('carrier', carrier, action);
  assert.ok(result.success, result.error);
  assert.equal(result.state.supportsHarborCharterPickup, true);
  // $10 discounted rent has settled; only the $9 inbound freight and $3 handling move now.
  assert.deepEqual(result.state.players.map(p => p.balance), [1499, 1513]);
  assert.equal(!!result.state.properties[3].slotCharter?.active, false);
  const ownerView = gameStateForPlayer(updates[0].state, owner);
  assert.deepEqual(ownerView.harborFreight, result.state.harborFreight);
  assert.deepEqual(updates[0].events, result.events);
  for (const revision of [action.revision, action.revision + 1]) {
    assert.equal(command('carrier', carrier, { ...action, revision }).success, false);
  }
  assert.equal(updates.length, 1);
  assert.equal(timer.mock.callCount(), 0);
});

test('a time-out leaves a human charter unspent, and only live Monopoly rooms advertise its use', t => {
  const { room, manager, carrier } = charterRoom(t);
  const before = room.gameState;
  assert.equal(gameStateForPlayer(before, carrier).supportsHarborCharterPickup, true);
  for (const change of [{ mode: 'classic' }, { mode: 'logistics' }, { mode: undefined }, { gameStarted: false }, { winnerId: carrier }]) {
    assert.equal(gameStateForPlayer({ ...before, supportsHarborCharterPickup: true, ...change }, carrier).supportsHarborCharterPickup, undefined);
  }
  manager.handleAFKTimeout(room.id);
  assert.equal(room.gameState.activePlayerIndex, 1);
  assert.equal(room.gameState.properties[3].slotCharter.active, true);
  assert.equal(room.gameState.harborFreight.manifests[carrier], null);
});

for (const scenario of [
  { name: 'uses a charter in a two-player game', spend: true },
  { name: 'pays the tariff to retain its $10M share while a third captain is offline', third: true, disconnect: true, laden: true, spend: false },
  { name: 'uses the charter when a $6M pickup beats a $5M rent share', third: true, port: 1, group: true, spend: true },
]) {
  test('the rival ' + scenario.name, t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const { room, manager, carrier, owner } = charterRoom(t, scenario);
    if (scenario.disconnect) manager.handleDisconnect('third');
    // Match the bot identity used by RoomManager without changing the participants or their deeds.
    room.players[0].sessionToken = 'bot-charter-test';
    manager.triggerBotIfNeeded(room);
    t.mock.timers.tick(700);
    const state = room.gameState;
    const tile = scenario.port ?? 3;
    const box = state.harborFreight.manifests[carrier];
    assert.equal(box?.originTileId, tile);
    if (scenario.spend) {
      assert.equal(box.charterPickup?.operatorId, owner);
      assert.equal(box.charterPickup.waivedFee, scenario.group ? 6 : 3);
      assert.equal(box.exportBooking, undefined);
    } else {
      assert.equal(box.exportBooking?.fee, 3);
      assert.equal(box.charterPickup, undefined);
    }
    assert.equal(!!state.properties[tile].slotCharter?.active, !scenario.spend);
  });
}
