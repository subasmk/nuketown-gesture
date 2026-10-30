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

test('the browser pairing controller page is served at /controller', async (t) => {
  const port = await startRelay(t);
  const response = await fetch(`http://127.0.0.1:${port}/controller`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /NUKETOWN CONTROLLER/);
  assert.match(body, /deviceorientation/);
});

test('the legacy gyro controller page is served at /gyro-controller', async (t) => {
  const port = await startRelay(t);
  const response = await fetch(`http://127.0.0.1:${port}/gyro-controller`);
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

test('gyro relay forwards phone weapon-select messages to the game page', async (t) => {
  const port = await startRelay(t);
  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game`);
  await new Promise((resolve) => game.once('open', resolve));
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone`);
  await new Promise((resolve) => phone.once('open', resolve));
  const received = new Promise((resolve) => game.once('message', (data) => resolve(data.toString())));
  phone.send(JSON.stringify({ t: 'weapon', slot: 2 }));
  assert.deepEqual(JSON.parse(await received), { t: 'weapon', slot: 2 });
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

test('gyro relay forwards phone jump messages to the game page', async (t) => {
  const port = await startRelay(t);
  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game`);
  await new Promise((resolve) => game.once('open', resolve));
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone`);
  await new Promise((resolve) => phone.once('open', resolve));
  const received = new Promise((resolve) => game.once('message', (data) => resolve(data.toString())));
  phone.send(JSON.stringify({ t: 'jump', on: true }));
  assert.deepEqual(JSON.parse(await received), { t: 'jump', on: true });
  game.close();
  phone.close();
});

test('game wiring: phone jump feeds the local input and the Windows build includes phone-gyro.js', async () => {
  const fs = await import('node:fs');
  assert.match(fs.readFileSync('src/70-game.js', 'utf8'), /PHONE_JUMP/);
  assert.match(fs.readFileSync('phone-gyro.js', 'utf8'), /t === 'jump'/);
  assert.match(fs.readFileSync('build-windows.mjs', 'utf8'), /phone-gyro\.js/);
  assert.match(fs.readFileSync('build-windows.mjs', 'utf8'), /phone-bridge\.js/);
});

test('gyro relay forwards absolute point-mode aim messages verbatim', async (t) => {
  const port = await startRelay(t);
  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game`);
  await new Promise((resolve) => game.once('open', resolve));
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone`);
  await new Promise((resolve) => phone.once('open', resolve));
  const received = new Promise((resolve) => game.once('message', (data) => resolve(data.toString())));
  phone.send(JSON.stringify({ t: 'aim', yaw: -12.5, pitch: 7, reset: true }));
  assert.deepEqual(JSON.parse(await received), { t: 'aim', yaw: -12.5, pitch: 7, reset: true });
  game.close();
  phone.close();
});

test('android app wiring: POINT/TILT toggle, re-centre, foreground service with wake lock', async () => {
  const fs = await import('node:fs');
  const dir = new URL('./android-controller/app/src/main/', import.meta.url);
  const manifest = fs.readFileSync(new URL('AndroidManifest.xml', dir), 'utf8');
  const svc = fs.readFileSync(new URL('java/com/subasmk/nuketown/ControllerService.java', dir), 'utf8');
  const act = fs.readFileSync(new URL('java/com/subasmk/nuketown/MainActivity.java', dir), 'utf8');
  assert.match(manifest, /ControllerService/);
  assert.match(manifest, /FOREGROUND_SERVICE/);
  assert.match(manifest, /WAKE_LOCK/);
  assert.match(svc, /PARTIAL_WAKE_LOCK/);
  assert.match(svc, /startForeground/);
  assert.match(svc, /"\{\\"t\\":\\"aim\\"/);
  assert.match(svc, /\\"reset\\":true/);
  assert.match(act, /AIM MODE/);
  assert.match(act, /RE-CENTRE/);
  assert.match(act, /KEYCODE_VOLUME_UP/);
  assert.match(act, /KEYCODE_VOLUME_DOWN/);
});

test('android app wiring: no gun picker on the phone, sensitivity on both screens, version 4', async () => {
  const fs = await import('node:fs');
  const dir = new URL('./android-controller/app/', import.meta.url);
  const svc = fs.readFileSync(new URL('src/main/java/com/subasmk/nuketown/ControllerService.java', dir), 'utf8');
  const act = fs.readFileSync(new URL('src/main/java/com/subasmk/nuketown/MainActivity.java', dir), 'utf8');
  const gradle = fs.readFileSync(new URL('build.gradle', dir), 'utf8');
  /* v4.0 removed the phone-side gun picker entirely: guns stay on the
     laptop keyboard (1/2/3), so no weapon names or weapon messages remain
     anywhere in the Android app. */
  for (const name of ['BUBBLEGUN', 'MARSHMALLOW', 'LOLLIPOP']) {
    assert.doesNotMatch(act, new RegExp(name));
    assert.doesNotMatch(svc, new RegExp(name));
  }
  assert.doesNotMatch(svc, /setWeapon/);
  assert.doesNotMatch(svc, /weapon/);
  assert.match(act, /Switch guns on the laptop keyboard/);
  /* Sensitivity is adjustable on the setup screen AND while connected, and
     the service actually applies it in POINT mode (the v3 bug was that the
     slider moved but the aim never changed). */
  assert.match(act, /AIM SENSITIVITY/);
  assert.match(svc, /setSens/);
  assert.match(svc, /sens \/ 13f/);
  assert.match(gradle, /versionCode 6/);
  assert.match(gradle, /versionName '4\.2'/);
});

test('gyro pairs are isolated by pairing code (expo: 2 laptops, 2 phones)', async (t) => {
  const port = await startRelay(t);
  const openWs = (url) => new Promise((resolve) => { const ws = new WebSocket(url); ws.once('open', () => resolve(ws)); });
  const gameA = await openWs(`ws://127.0.0.1:${port}/gyro?role=game&code=AAAA`);
  const phoneA = await openWs(`ws://127.0.0.1:${port}/gyro?role=phone&code=AAAA`);
  const gameB = await openWs(`ws://127.0.0.1:${port}/gyro?role=game&code=BBBB`);
  const phoneB = await openWs(`ws://127.0.0.1:${port}/gyro?role=phone&code=BBBB`);

  const gotA = new Promise((resolve) => gameA.once('message', (d) => resolve(d.toString())));
  let bSaw = null;
  gameB.on('message', (d) => { bSaw = d.toString(); });
  phoneA.send(JSON.stringify({ t: 'aim', yaw: 10, pitch: 0 }));
  assert.deepEqual(JSON.parse(await gotA), { t: 'aim', yaw: 10, pitch: 0 });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(bSaw, null, 'laptop B must not receive laptop A phone input');

  const gotB = new Promise((resolve) => gameB.once('message', (d) => resolve(d.toString())));
  phoneB.send(JSON.stringify({ t: 'fire', on: true }));
  assert.deepEqual(JSON.parse(await gotB), { t: 'fire', on: true });

  for (const ws of [gameA, phoneA, gameB, phoneB]) ws.close();
});

/* Pair-state acknowledgement: the phone must be able to tell "the server
   accepted my socket" apart from "a laptop is actually listening on my code". */

function nextMessage(ws) {
  return new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data.toString()))));
}

test('gyro pair-state: phone alone hears paired:false, game join flips it true, game leave flips it back', async (t) => {
  const port = await startRelay(t);
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone&code=ABCD`);
  const first = nextMessage(phone);
  await new Promise((resolve) => phone.once('open', resolve));
  assert.deepEqual(await first, { t: 'paired', on: false });

  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game&code=ABCD`);
  const joined = nextMessage(phone);
  await new Promise((resolve) => game.once('open', resolve));
  assert.deepEqual(await joined, { t: 'paired', on: true });

  const left = nextMessage(phone);
  game.close();
  assert.deepEqual(await left, { t: 'paired', on: false });
  phone.close();
});

test('gyro pair-state: phone joining a listening game hears paired:true immediately', async (t) => {
  const port = await startRelay(t);
  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game&code=WXYZ`);
  await new Promise((resolve) => game.once('open', resolve));
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone&code=WXYZ`);
  const msg = nextMessage(phone);
  await new Promise((resolve) => phone.once('open', resolve));
  assert.deepEqual(await msg, { t: 'paired', on: true });
  game.close();
  phone.close();
});

test('gyro pair-state: codes isolate pairs - a phone on one code never hears another code\'s game', async (t) => {
  const port = await startRelay(t);
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone&code=AAAA`);
  const first = nextMessage(phone);
  await new Promise((resolve) => phone.once('open', resolve));
  assert.deepEqual(await first, { t: 'paired', on: false });

  const game = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game&code=BBBB`);
  await new Promise((resolve) => game.once('open', resolve));
  // The other code's game joining must not notify this phone, and input must not cross.
  const crossed = new Promise((resolve) => { game.once('message', () => resolve(true)); setTimeout(() => resolve(false), 300); });
  phone.send(JSON.stringify({ t: 'fire', on: true }));
  assert.equal(await crossed, false);
  game.close();
  phone.close();
});

test('gyro pair-state: a replacement game re-acks the waiting phone', async (t) => {
  const port = await startRelay(t);
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone&code=RECN`);
  const first = nextMessage(phone);
  await new Promise((resolve) => phone.once('open', resolve));
  assert.deepEqual(await first, { t: 'paired', on: false });

  const game1 = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game&code=RECN`);
  const on1 = nextMessage(phone);
  await new Promise((resolve) => game1.once('open', resolve));
  assert.deepEqual(await on1, { t: 'paired', on: true });

  const off = nextMessage(phone);
  game1.close();
  assert.deepEqual(await off, { t: 'paired', on: false });

  const game2 = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=game&code=RECN`);
  const on2 = nextMessage(phone);
  await new Promise((resolve) => game2.once('open', resolve));
  assert.deepEqual(await on2, { t: 'paired', on: true });
  game2.close();
  phone.close();
});

test('gyro heartbeat: a silent (half-open) game socket is dropped and the phone hears paired:false', async () => {
  const { createRelayServer } = await import('./server.mjs');
  const relay = createRelayServer({ gyroHeartbeatMs: 150, gyroSilenceMs: 300 });
  await new Promise((resolve, reject) => { relay.server.once('error', reject); relay.listen(0, '127.0.0.1', resolve); });
  const port = relay.address().port;
  // Raw socket: handshakes, then never answers pings and never sends app messages (laptop asleep / half-open).
  const { connect } = await import('net');
  const raw = await new Promise((resolve, reject) => {
    const key = Buffer.from('0123456789abcdef').toString('base64');
    const sock = connect(port, '127.0.0.1', () => {
      sock.write(`GET /gyro?role=game&code=BEAT HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    sock.on('data', d => { buf = Buffer.concat([buf, d]); if (buf.includes('\r\n\r\n')) resolve(sock); });
    sock.on('error', reject);
  });
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone&code=BEAT`);
  const states = [];
  phone.on('message', m => states.push(JSON.parse(m.toString())));
  await new Promise((resolve) => phone.once('open', resolve));
  const phoneStream = setInterval(() => { try { phone.send('{"t":"aim","yaw":1,"pitch":0}'); } catch {} }, 100);
  try {
    await new Promise(r => setTimeout(r, 900));   // phone joins before round 1; ~6 rounds total
    assert.deepEqual(states.map(s => s.on), [true, false], `expected paired true then false, got ${JSON.stringify(states)}`);
  } finally { clearInterval(phoneStream); raw.destroy(); phone.close(); await relay.close(); }
});

test('gyro heartbeat: a game sending keepalives (but never ponging) stays connected', async () => {
  const { createRelayServer } = await import('./server.mjs');
  const relay = createRelayServer({ gyroHeartbeatMs: 150, gyroSilenceMs: 300 });
  await new Promise((resolve, reject) => { relay.server.once('error', reject); relay.listen(0, '127.0.0.1', resolve); });
  const port = relay.address().port;
  // Raw game socket that never pongs but sends app-level keepalives, like the real page behind a proxy that eats pings.
  const { connect: connect2 } = await import('net');
  const game = await new Promise((resolve, reject) => {
    const key = Buffer.from('0123456789abcdef').toString('base64');
    const sock = connect2(port, '127.0.0.1', () => {
      sock.write(`GET /gyro?role=game&code=ALIV HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    sock.on('data', d => { buf = Buffer.concat([buf, d]); if (buf.includes('\r\n\r\n')) resolve(sock); });
    sock.on('error', reject);
  });
  const sendText = (sock, str) => {
    const p = Buffer.from(str);
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const h = Buffer.from([0x81, 0x80 | p.length]);
    const masked = Buffer.from(p.map((b, i) => b ^ mask[i % 4]));
    sock.write(Buffer.concat([h, mask, masked]));
  };
  const hbTimer = setInterval(() => sendText(game, '{"t":"hb"}'), 100);
  const phone = new WebSocket(`ws://127.0.0.1:${port}/gyro?role=phone&code=ALIV`);
  let lastState = null;
  phone.on('message', m => { lastState = JSON.parse(m.toString()); });
  await new Promise((resolve) => phone.once('open', resolve));
  const phoneStream = setInterval(() => { try { phone.send('{"t":"aim","yaw":1,"pitch":0}'); } catch {} }, 100);
  try {
    await new Promise(r => setTimeout(r, 900));   // keepalives beat the silence rule even with zero pongs
    assert.equal(game.destroyed, false, 'game socket should still be open');
    assert.equal(phone.readyState, WebSocket.OPEN);
    assert.deepEqual(lastState, { t: 'paired', on: true });
  } finally { clearInterval(hbTimer); clearInterval(phoneStream); game.destroy(); phone.close(); await relay.close(); }
});
