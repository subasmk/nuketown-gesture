import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

async function startRelay(t, options = {}) {
  const { createRelayServer } = await import('./server.mjs');
  const relay = createRelayServer({ heartbeatMs: 0, ...options });
  await new Promise((resolve, reject) => {
    relay.server.once('error', reject);
    relay.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => { await relay.close(); });
  return relay.address().port;
}

test('the phone controller page is served at /controller', async (t) => {
  const port = await startRelay(t);
  const response = await fetch(`http://127.0.0.1:${port}/controller`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /PHONE CONTROLLER/);
  assert.match(body, /deviceorientation/);
});

test('gyro relay forwards phone input to the game page', async (t) => {
  const port = await startRelay(t);
  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game`);
  await new Promise((resolve) => game.once('open', resolve));
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone`);
  await new Promise((resolve) => phone.once('open', resolve));
  const received = new Promise((resolve) => game.once('message', (data) => resolve(data.toString())));
  phone.send(JSON.stringify({ t: 'fire', on: true }));
  assert.deepEqual(JSON.parse(await received), { t: 'fire', on: true });
  game.close();
  phone.close();
});

test('unrelated websocket paths are still refused', async (t) => {
  const port = await startRelay(t);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/nope`);
  await assert.rejects(new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  }));
});
