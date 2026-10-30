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

test('android app wiring: full-screen gun cards send weapon slots 1-3, version 3', async () => {
  const fs = await import('node:fs');
  const dir = new URL('./android-controller/app/', import.meta.url);
  const svc = fs.readFileSync(new URL('src/main/java/com/subasmk/nuketown/ControllerService.java', dir), 'utf8');
  const act = fs.readFileSync(new URL('src/main/java/com/subasmk/nuketown/MainActivity.java', dir), 'utf8');
  const gradle = fs.readFileSync(new URL('build.gradle', dir), 'utf8');
  // the app's gun list is the game's real weapon list, in keyboard 1/2/3 order
  const weapons = fs.readFileSync('src/40-weapons.js', 'utf8');
  for (const name of ['BUBBLEGUN', 'MARSHMALLOW', 'LOLLIPOP']) {
    assert.match(act, new RegExp(name));
    assert.match(weapons, new RegExp(`name: '${name}'`));
  }
  assert.match(svc, /setWeapon/);
  assert.match(svc, /"{\\"t\\":\\"weapon\\"/);
  assert.match(svc, /slot < 1 \|\| slot > 3/);
  assert.match(act, /c\.setWeapon\(slot\)/);
  assert.match(gradle, /versionCode 3/);
  assert.match(gradle, /versionName '3\.0'/);
});
