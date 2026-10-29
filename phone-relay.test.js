/* Phone-controller relay channel: pairing by code, state forwarding,
   isolation between codes, and disconnect notification. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createRelayServer } from './server.mjs';

const V = 11;
const wait = ms => new Promise(r => setTimeout(r, ms));

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.msgs = [];
    ws.on('message', d => { try { ws.msgs.push(JSON.parse(d.toString())); } catch {} });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
const has = (ws, pred) => ws.msgs.some(pred);
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await wait(25); }
  return false;
}

test('ctl channel: pair, forward, isolate, disconnect', async () => {
  const relay = createRelayServer();
  await new Promise(r => relay.listen(0, '127.0.0.1', r));
  const port = relay.address().port;
  try {
    const listener = await connect(port);
    listener.send(JSON.stringify({ t: 'ctl-listen', v: V, code: 'TEST1' }));
    assert(await until(() => has(listener, m => m.t === 'ctl-ok' && m.role === 'listener')), 'listener registered');

    const stranger = await connect(port);
    stranger.send(JSON.stringify({ t: 'ctl-listen', v: V, code: 'OTHR1' }));

    const phone = await connect(port);
    phone.send(JSON.stringify({ t: 'ctl-hello', v: V, code: 'TEST1' }));
    assert(await until(() => has(phone, m => m.t === 'ctl-ok' && m.role === 'phone')), 'phone registered');
    assert(await until(() => has(listener, m => m.t === 'ctl-status' && m.phone === true)), 'listener told phone arrived');
    assert(!has(stranger, m => m.t === 'ctl-status'), 'other code hears nothing');

    phone.send(JSON.stringify({ t: 'ctl', v: V, o: [10, 20, 30], s: 0, j: [0, 1], f: 1 }));
    assert(await until(() => has(listener, m => m.t === 'ctl' && Array.isArray(m.o) && m.o[0] === 10 && m.f === 1)), 'state forwarded to paired listener');
    await wait(150);
    assert(!has(stranger, m => m.t === 'ctl'), 'state not leaked to other code');

    phone.close();
    assert(await until(() => has(listener, m => m.t === 'ctl-status' && m.phone === false)), 'listener told phone left');
    listener.close(); stranger.close();
  } finally {
    await relay.close();
  }
});
