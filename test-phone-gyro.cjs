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
  WebSocket: class { constructor() { this.readyState = 0; } },
  G: { started: true, paused: false, over: false, player: { alive: true } },
  IN: { firing: false }, mouseSens: .0021, KEY: {},
  addEventListener: (k, f) => callbacks[k] = f,
  pressFire: () => { shots++; ctx.IN.firing = true; },
  releaseFire: () => { releases++; ctx.IN.firing = false; },
  applyLook: (...x) => look = x, console
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
