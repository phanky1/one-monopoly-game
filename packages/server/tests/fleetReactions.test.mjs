import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { setupSocketServer } from '../dist/socketServer.js';

test('both captains see the reaction beside the sending seat', async t => {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Local network listener unavailable');
    throw error;
  }
  const { io } = setupSocketServer(server);
  const url = 'http://127.0.0.1:' + server.address().port;
  const clients = [connect(url), connect(url)];
  t.after(async () => { clients.forEach(client => client.disconnect()); await io.close(); });
  const receive = (client, event) => once(client, event, { signal: AbortSignal.timeout(5000) });
  await Promise.all(clients.map(client => receive(client, 'connect')));
  const [sender, observer] = clients;
  const seat = await sender.timeout(5000).emitWithAck('room:create', { playerName: 'Linh', token: 'ONE_APUS' });
  const guest = await observer.timeout(5000).emitWithAck('room:join', {
    roomId: seat.roomId, playerName: 'Minh', token: 'PILOT_BOAT',
  });
  const packets = clients.map(client => receive(client, 'game:reaction'));
  sender.emit('game:reaction', { roomId: seat.roomId, playerId: guest.playerId, emoji: '🛟' });
  for (const [packet] of await Promise.all(packets)) {
    assert.deepEqual(packet, { playerId: seat.playerId, emoji: '🛟' });
  }
});
