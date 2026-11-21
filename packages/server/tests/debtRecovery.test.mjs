import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomManager } from '../dist/roomManager.js';

function setup(t, solo = false) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const events = [];
  const manager = new RoomManager({ onBroadcastUpdate: (_id, _state, sent) => events.push(...sent) });
  const { room, playerId: host } = manager.createRoom('Linh', 'ONE_APUS', 'linh');
  if (!solo) {
    const guest = manager.joinRoom(room.id, 'Minh', 'PILOT_BOAT', 'minh');
    manager.setReady(room.id, guest.playerId, true);
  }
  assert.equal(manager.startGame(room.id, host, 'classic').success, true);
  t.after(() => { room.timer.stop(); manager.clearBotTimer(room); });
  const guest = room.players[1].id;
  const debtor = solo ? guest : host;
  const creditor = solo ? host : guest;
  if (solo) {
    room.gameState.phase = 'END_OF_TURN';
    manager.dispatchAction(room.id, host, { type: 'END_TURN' });
  }
  const captain = room.gameState.players.find(p => p.id === debtor);
  captain.balance = 5;
  Object.assign(room.gameState.properties[1], { ownerId: debtor, containerLevel: 1 });
  Object.assign(room.gameState.properties[3], { ownerId: creditor, containerLevel: 2 });
  const send = action => manager.dispatchAction(room.id, debtor, action);
  send({ type: 'ROLL_DICE', forcedDice: [1, 2] });
  assert.equal(room.gameState.pendingDebt.amount, 60);
  return { room, manager, debtor, creditor, send, events };
}

test('only the debtor can sell or mortgage, and a payable bill settles on the deadline', t => {
  const { room, manager, creditor, send, events } = setup(t);
  t.mock.timers.tick(4_000);
  const sale = { type: 'SELL_CONTAINER', tileId: 1, expectedLevel: 1 };
  const mortgage = { type: 'MORTGAGE_TILE', tileId: 1 };
  const before = room.gameState;
  assert.equal(manager.dispatchAction(room.id, creditor, sale).success, false);
  assert.equal(send(mortgage).success, false);
  assert.equal(send({ type: 'SETTLE_DEBT' }).success, false);
  assert.equal(room.gameState, before);
  assert.equal(send(sale).success, true);
  assert.equal(send(sale).success, false);
  assert.equal(manager.dispatchAction(room.id, creditor, mortgage).success, false);
  assert.equal(send(mortgage).success, true);
  assert.equal(send(mortgage).success, false);
  assert.equal(room.timer.getRemainingSeconds(), 41);
  t.mock.timers.tick(41_000);
  assert.equal(room.gameState.pendingDebt, null);
  assert.equal(room.gameState.players[0].balance, 0);
  assert.equal(room.gameState.players[1].balance, 1560);
  assert.equal(events.filter(e => e.type === 'DEBT_SETTLED').length, 1);
  assert.equal(send({ type: 'DECLARE_BANKRUPTCY' }).success, false);
  assert.equal(room.gameState.players[0].isBankrupt, false);
});

test('a solo rival sells one level, mortgages the port, and pays rent before continuing', t => {
  const { room, events } = setup(t, true);
  t.mock.timers.tick(1_000);
  assert.equal(room.gameState.players[1].balance, 30);
  t.mock.timers.tick(1_000);
  assert.equal(room.gameState.players[1].balance, 60);
  t.mock.timers.tick(1_000);
  assert.deepEqual(events.filter(e => ['CONTAINER_SOLD','TILE_MORTGAGED','DEBT_SETTLED'].includes(e.type))
    .map(e => e.type), ['CONTAINER_SOLD','TILE_MORTGAGED','DEBT_SETTLED']);
  assert.equal(room.gameState.players[1].isBankrupt, false);
  assert.equal(room.gameState.players[1].balance, 0);
  assert.equal(room.gameState.players[0].balance, 1560);
  assert.equal(room.gameState.phase, 'END_OF_TURN');
});
