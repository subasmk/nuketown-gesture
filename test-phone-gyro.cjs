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
// points, relative to its re-centre. Same direction twice = no extra turn.
{
  ctx.G.paused = false;
  PHONE.ws = null; PHONE.enabled = false; PHONE.fire = false;
  ctx.phoneConnect();
  const sock = ctx.lastSocket;
  const feed = (o) => { now += 10; sock.onmessage({ data: JSON.stringify(o) }); };
  const deg = (r) => r * 180 / Math.PI;
  const turned = () => look ? [deg(look[0] * look[2]), deg(look[1] * look[2])] : [0, 0];
  const tick = () => { look = null; now += 10; PHONE.last = now; PHONE.liveUntil = now + 1500; phoneTick(.016); return turned(); };

  feed({ t: 'aim', yaw: 0, pitch: 0, reset: true });          // centre: no movement
  let [dx, dy] = tick();
  assert(Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6, 're-centre does not move the camera');

  feed({ t: 'aim', yaw: 30, pitch: 10 });                      // point right 30, up 10
  [dx, dy] = tick();
  assert(Math.abs(dx - 30) < 1e-6, 'point right 30 turns right 30 degrees, got ' + dx);
  assert(Math.abs(dy + 10) < 1e-6, 'point up 10 looks up 10 degrees (dy negative), got ' + dy);
  assert(look[0] > 0 && look[1] < 0);

  feed({ t: 'aim', yaw: 30, pitch: 10 });                      // same direction: absolute, no drift
  [dx, dy] = tick();
  assert(dx === 0 && dy === 0 && look === null, 'holding still adds no turn');

  feed({ t: 'aim', yaw: 0, pitch: 0 });                        // point back to centre: camera returns
  [dx, dy] = tick();
  assert(Math.abs(dx + 30) < 1e-6 && Math.abs(dy - 10) < 1e-6, 'pointing back returns the view');

  feed({ t: 'aim', yaw: 170, pitch: 0 });
  tick();
  feed({ t: 'aim', yaw: -170, pitch: 0 });                     // wraparound: shortest way (+20), not -340
  [dx] = tick();
  assert(Math.abs(dx - 20) < 1e-6, 'yaw wraparound takes the short way, got ' + dx);

  feed({ t: 'aim', yaw: 0, pitch: 500 });                      // pitch clamped to 80
  tick();
  assert.strictEqual(PHONE.aim.pitch, 80);

  feed({ t: 'aim', yaw: 90, pitch: 0, reset: true });          // RE-CENTRE mid-game: adopt, no jump
  [dx, dy] = tick();
  assert(Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6, 're-centre mid-game does not lurch');

  feed({ t: 'look', dx: 5, dy: 0 });                           // TILT messages still work alongside
  [dx] = tick();
  assert(look[0] > 0, 'tilt-mode look deltas still apply');

  now += 600; PHONE.last = now - 600; phoneTick(.016);         // stale drops the aim reference
  assert.strictEqual(PHONE.aim, null);
  console.log('PASS point mode: absolute aim, no drift, wraparound, clamp, re-centre, tilt still works');
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
