// Phone-bridge contract tests: gyro deltas turn the view the right way,
// joystick writes the game's analog fields, fire presses/releases, jump
// pulses, and a silent phone parks every channel.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let clock = 1000, look = null, presses = 0, releases = 0, tick = null;
const listeners = {};
const elements = {
  'ctl-status': { textContent: '' },
  'ctl-start': { onclick: null },
  'ctl-flip': { onclick: null }
};
class FakeWS {
  constructor(url) { this.url = url; this.h = {}; FakeWS.last = this; }
  addEventListener(k, f) { this.h[k] = f; }
  send(s) { this.sent = JSON.parse(s); }
  emit(k, arg) { this.h[k] && this.h[k](arg); }
}
const ctx = {
  performance: { now: () => clock },
  document: {
    createElement: () => ({ style: {}, innerHTML: '' }),
    getElementById: id => elements[id],
    body: { append() {} }
  },
  localStorage: { getItem: () => 'ABCD', setItem() {} },
  location: { protocol: 'https:', host: 'lan:8080', origin: 'https://lan:8080' },
  NETP: { VERSION: 11 },
  TOUCH: { on: false, fwd: 0, strafe: 0, jump: false, sprint: false },
  IN: { firing: false },
  mouseSens: 0.0021,
  gestureAccepts: () => true,
  applyLook: (dx, dy, s) => { look = [dx, dy]; },
  pressFire: () => { presses++; ctx.IN.firing = true; },
  releaseFire: () => { releases++; ctx.IN.firing = false; },
  WebSocket: FakeWS,
  addEventListener: (k, f) => { listeners[k] = f; },
  setInterval: f => { tick = f; },
  setTimeout: (f, ms) => setTimeout(f, ms),
  console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'phone-bridge.js'), 'utf8') + '\nglobalThis.testPhone = CTLP;', ctx);
const P = ctx.testPhone;

listeners.DOMContentLoaded();
elements['ctl-start'].onclick();
const ws = FakeWS.last;
ws.emit('open');
assert.deepStrictEqual(ws.sent, { t: 'ctl-listen', v: 11, code: 'ABCD' });
console.log('PASS bridge listens with the panel code');

ws.emit('message', { data: JSON.stringify({ t: 'ctl-status', phone: true }) });
assert.strictEqual(P.connected, true);
const msg = o => ws.emit('message', { data: JSON.stringify({ t: 'ctl', o, s: 0, j: [0, 0], f: 0 }) });
msg([100, 90, 0]);                       // first sighting only sets the reference
assert.strictEqual(P.lookX, 0);
msg([90, 90, 0]);                        // alpha drops 10deg = phone turned RIGHT
tick();
assert(look && look[0] > 0, 'turning phone right must turn the view right, got ' + look);
console.log('PASS gyro: phone right = view right');

ws.emit('message', { data: JSON.stringify({ t: 'ctl', o: [90, 90, 0], s: 0, j: [0.5, 1], f: 1 }) });
assert.strictEqual(ctx.TOUCH.strafe, 0.5);
assert.strictEqual(ctx.TOUCH.fwd, 1);
assert.strictEqual(ctx.TOUCH.sprint, true);
tick();
assert.strictEqual(presses, 1);
console.log('PASS joystick writes TOUCH fields, fire presses');

ws.emit('message', { data: JSON.stringify({ t: 'ctl', o: [90, 90, 0], s: 0, j: [0, 0], f: 0, jump: 1 }) });
assert.strictEqual(ctx.TOUCH.jump, true);
tick();
assert.strictEqual(releases, 1);
console.log('PASS jump pulses and fire releases');

clock += 500;                            // phone goes silent -> all parked
tick();
assert.strictEqual(ctx.TOUCH.fwd, 0);
assert.strictEqual(ctx.TOUCH.strafe, 0);
console.log('PASS stale phone parks movement');
