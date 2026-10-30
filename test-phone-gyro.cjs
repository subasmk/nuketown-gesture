// Phone gyro controller contract tests (game side).
// Design under test: while a phone is live it owns aim + fire (the webcam
// hand drives walking only); phone look deltas apply once each, fire is a
// held trigger, and pause/stale/disconnect always release safely.
const vm = require('vm'), fs = require('fs'), assert = require('assert');
let now = 1000, shots = 0, releases = 0, look = null;
const callbacks = {};
const ctx = {
  performance: { now: () => now },
  document: { hasFocus: () => true, hidden: false },
  location: { protocol: 'https:', host: 'game.local', origin: 'https://game.local' },
  WebSocket: class { constructor() { this.readyState = 1; ctx.lastSocket = this; } close() {} },
  G: { started: true, paused: false, over: false, player: { alive: true } },
  IN: { firing: false }, mouseSens: .0021, KEY: {},
  addEventListener: (k, f) => callbacks[k] = f,
  pressFire: () => { shots++; ctx.IN.firing = true; },
  releaseFire: () => { releases++; ctx.IN.firing = false; },
  applyLook: (...x) => look = x,
  switchWeapon: (id) => { (ctx.switched = ctx.switched || []).push(id); }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'phone-gyro.js'), 'utf8') +
  '\nglobalThis.testPhone = { PHONE, phoneTick, PHONE_LIVE };', ctx);
const { PHONE, phoneTick, PHONE_LIVE } = ctx.testPhone;

// 1. Disabled/disconnected phone does nothing and reports not-live.
phoneTick(.016);
assert.strictEqual(shots, 0);
assert.strictEqual(PHONE_LIVE(), false);
console.log('PASS idle phone is inert');

// 2. Live phone: look deltas apply once and clear; fire presses once and holds.
PHONE.enabled = true; PHONE.ws = { readyState: 1 };
PHONE.last = now; PHONE.liveUntil = now + 1500;
assert.strictEqual(PHONE_LIVE(), true);
PHONE.lookX = 12; PHONE.lookY = -6; PHONE.fire = true;
phoneTick(.016);
assert.strictEqual(shots, 1);
assert(look[0] > 0 && look[1] < 0, 'phone look signs: right = right, tilt back = up');
assert.strictEqual(PHONE.lookX, 0);
phoneTick(.016);
assert.strictEqual(shots, 1);
console.log('PASS phone look applies once, fire presses once and holds');

// 3. Fire release on the phone stops shooting.
PHONE.fire = false;
phoneTick(.016);
assert.strictEqual(ctx.IN.firing, false);
assert.strictEqual(PHONE.holding, false);
console.log('PASS phone fire release');

// 4. Stale phone (no messages 500ms+) releases a held trigger.
PHONE.fire = true;
phoneTick(.016);
assert.strictEqual(ctx.IN.firing, true);
now += 600;
phoneTick(.016);
assert.strictEqual(ctx.IN.firing, false);
assert.strictEqual(PHONE.holding, false);
console.log('PASS stale phone releases fire');

// 5. Pause gates phone input.
PHONE.last = now; PHONE.liveUntil = now + 1500; PHONE.fire = true;
ctx.G.paused = true;
phoneTick(.016);
assert.strictEqual(ctx.IN.firing, false);
console.log('PASS pause gates phone input');

// 6. POINT mode (absolute aim): the camera follows the direction the phone
// points, relative to its re-centre. Aim messages land every ~20-40ms; the
// camera CHASES each sample across frames (~45ms time constant) instead of
// jumping, so a streamed turn moves in small even steps and still converges.
{
  ctx.G.paused = false;
  PHONE.ws = null; PHONE.enabled = false; PHONE.fire = false;
  ctx.phoneConnect();
  const sock = ctx.lastSocket;
  const feed = (o) => { now += 10; sock.onmessage({ data: JSON.stringify(o) }); };
  const deg = (r) => r * 180 / Math.PI;
  const lastTurn = () => look ? [deg(look[0] * look[2]), deg(look[1] * look[2])] : [0, 0];
  const tick = () => { look = null; now += 10; PHONE.last = now; PHONE.liveUntil = now + 1500; phoneTick(.016); return lastTurn(); };
  const chaseTicks = (n) => { let sx = 0, sy = 0, peak = 0; for (let i = 0; i < n; i++) { const [dx, dy] = tick(); sx += dx; sy += dy; peak = Math.max(peak, Math.abs(dx)); } return { sx, sy, peak }; };

  feed({ t: 'aim', yaw: 0, pitch: 0, reset: true });          // centre: no movement
  let [dx, dy] = tick();
  assert(Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6, 're-centre does not move the camera');

  feed({ t: 'aim', yaw: 30, pitch: 10 });                      // point right 30, up 10
  let first = tick();
  assert(first[0] > 0.5 && first[0] < 15, 'chase: first frame moves a fraction, got ' + first[0]);
  let r = chaseTicks(40);                                      // ~0.4s more frames
  let totalX = first[0] + r.sx, totalY = first[1] + r.sy;
  assert(Math.abs(totalX - 30) < 0.2, 'chase converges to full 30 right, got ' + totalX);
  assert(Math.abs(totalY + 10) < 0.2, 'chase converges to full 10 up (dy negative), got ' + totalY);
  assert(r.peak < 15, 'no single frame jumps the whole delta, peak ' + r.peak);

  r = chaseTicks(10);                                          // same direction held: settled, no drift
  assert(Math.abs(r.sx) < 0.05 && Math.abs(r.sy) < 0.05, 'holding still adds no turn, got ' + r.sx);

  feed({ t: 'aim', yaw: 0, pitch: 0 });                        // point back to centre: camera returns
  first = tick(); r = chaseTicks(40);
  totalX = first[0] + r.sx; totalY = first[1] + r.sy;
  assert(Math.abs(totalX + 30) < 0.2 && Math.abs(totalY - 10) < 0.2, 'pointing back returns the view, got ' + totalX);

  feed({ t: 'aim', yaw: 170, pitch: 0 });
  first = tick(); r = chaseTicks(60);
  totalX = first[0] + r.sx;
  assert(Math.abs(totalX - 170) < 0.3, 'converges to 170, got ' + totalX);

  feed({ t: 'aim', yaw: -170, pitch: 0 });                     // wraparound: shortest way (+20), not -340
  first = tick(); r = chaseTicks(60);
  totalX = first[0] + r.sx;
  assert(Math.abs(totalX - 20) < 0.3, 'yaw wraparound takes the short way, got ' + totalX);

  feed({ t: 'aim', yaw: 0, pitch: 500 });                      // pitch clamped to 80
  tick();
  assert.strictEqual(PHONE.aim.pitch, 80);

  feed({ t: 'aim', yaw: 90, pitch: 0, reset: true });          // RE-CENTRE mid-game: adopt, no slide
  [dx, dy] = tick();
  assert(Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6, 're-centre mid-game does not lurch');

  feed({ t: 'look', dx: 5, dy: 0 });                           // TILT messages still work alongside
  [dx] = tick();
  assert(look[0] > 0, 'tilt-mode look deltas still apply');

  now += 600; PHONE.last = now - 600; phoneTick(.016);         // stale drops the aim reference
  assert.strictEqual(PHONE.aim, null);
  console.log('PASS point mode: chase smooths steps, converges, no drift, wraparound, clamp, re-centre, tilt still works');
}

// 6b. Realistic streamed turn: 90 deg/s streamed at 50Hz for 1s while frames
// tick at ~60fps. The chase must move the camera in small even steps (no
// staircase) and the total turn must land on the streamed angle.
{
  PHONE.ws = null; PHONE.enabled = false;
  ctx.G.started = true; ctx.G.paused = false; ctx.G.over = false; ctx.G.player = { alive: true };
  ctx.phoneConnect();
  const sock = ctx.lastSocket;
  const deg = (r) => r * 180 / Math.PI;
  const tick = () => { look = null; now += 10; PHONE.last = now; PHONE.liveUntil = now + 1500; phoneTick(.016); return look ? deg(look[0] * look[2]) : 0; };

  now += 10; sock.onmessage({ data: JSON.stringify({ t: 'aim', yaw: 0, pitch: 0, reset: true }) });
  tick();
  let total = 0, peak = 0;
  for (let ms = 20; ms <= 1000; ms += 20) {                     // 50 aim messages, 1.8 deg each
    now += 10; sock.onmessage({ data: JSON.stringify({ t: 'aim', yaw: (ms / 1000) * 90, pitch: 0 }) });
    const a = tick();                                          // two frames per message (~60fps)
    const b = tick();
    total += a + b; peak = Math.max(peak, Math.abs(a), Math.abs(b));
  }
  for (let i = 0; i < 40; i++) total += tick();                // settle
  assert(peak < 1.2, 'streamed turn moves in small steps, peak per-frame turn ' + peak + ' deg');
  assert(Math.abs(total - 90) < 1.5, 'streamed 90 deg turn lands on 90, got ' + total);
  console.log('PASS streamed 90 deg/s turn: peak step ' + peak.toFixed(2) + ' deg, total ' + total.toFixed(2) + ' deg');
}

// 7. Weapon select from the app's full-screen gun cards: slot numbers map to
// the same switchWeapon() the 1/2/3 keys call, with phone-live arbitration.
{
  ctx.switched = [];
  PHONE.ws = null; PHONE.enabled = false;
  ctx.G.started = true; ctx.G.paused = false; ctx.G.over = false; ctx.G.player = { alive: true };
  ctx.phoneConnect();
  const sock = ctx.lastSocket;
  const feed = (o) => { now += 10; sock.onmessage({ data: JSON.stringify(o) }); };

  feed({ t: 'weapon', slot: 2 });
  assert.deepStrictEqual(ctx.switched, ['shotgun'], 'slot 2 = shotgun, same as key 2');
  feed({ t: 'weapon', slot: 1 });
  feed({ t: 'weapon', slot: 3 });
  assert.deepStrictEqual(ctx.switched, ['shotgun', 'smg', 'rifle'], 'slots 1/3 = smg/rifle');

  feed({ t: 'weapon', slot: 4 });
  feed({ t: 'weapon', slot: 0 });
  feed({ t: 'weapon', slot: 'x' });
  assert.strictEqual(ctx.switched.length, 3, 'invalid slots are ignored');

  ctx.G.paused = true;
  feed({ t: 'weapon', slot: 2 });
  assert.strictEqual(ctx.switched.length, 3, 'paused round ignores weapon switch');
  ctx.G.paused = false; ctx.G.player.alive = false;
  feed({ t: 'weapon', slot: 2 });
  assert.strictEqual(ctx.switched.length, 3, 'dead player ignores weapon switch');
  ctx.G.player.alive = true;
  console.log('PASS weapon select: slots map to the real guns, invalid/paused/dead ignored');
}
