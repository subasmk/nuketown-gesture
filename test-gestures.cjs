// Gesture controller v2 contract tests.
// Design under test: ONE hand aims + pinch-fires (no calibration pose,
// no two-hand requirement); a second hand adds movement; neutrals settle
// automatically from the first steady frames; +fwd means forward, the
// same convention as the game's touch stick (up on screen = forward).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let clock = 1000, results, watch, aim = null, move = null, fire = null, status = '';
const events = {};
class Hands { setOptions() {} onResults(f) { results = f; } async send() {} }
class Camera { start() { return Promise.resolve(); } }
const context = {
  window: { isSecureContext: true }, navigator: { mediaDevices: { getUserMedia() {} } },
  Hands, Camera, performance: { now: () => clock },
  document: { hidden: false, hasFocus: () => true, addEventListener: (k, f) => events[k] = f },
  addEventListener: (k, f) => events[k] = f, setInterval: f => watch = f, console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'gesture-controller.js'), 'utf8'), context);

// Synthetic hand: palm centre near (cx, cy); index tip offset (tx, ty)
// from the palm; pinchRatio = thumb-tip distance / palm scale (0.15).
function hand(cx, cy, tx = 0, ty = -0.1, pinchRatio = 0.9) {
  const p = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  p[0] = { x: cx, y: cy + 0.15 };                       // wrist
  p[5] = { x: cx - 0.03, y: cy }; p[9] = { x: cx, y: cy };
  p[13] = { x: cx + 0.03, y: cy }; p[17] = { x: cx + 0.06, y: cy };
  p[8] = { x: cx + tx, y: cy + ty };                    // index tip (aim point)
  p[4] = { x: p[8].x + pinchRatio * 0.15, y: p[8].y };  // thumb tip
  return p;
}
const AIM = (tx, ty, pinch) => hand(0.7, 0.65, tx, ty, pinch);       // labelled 'Left' = physical right
const MOVE = (cx, cy) => hand(cx, cy);
function frame(hands, labels) {
  results({ multiHandLandmarks: hands, multiHandedness: labels || hands.map((_, i) => ({ label: i === 0 ? 'Left' : 'Right' })) });
}
function frames(n, make) { for (let i = 0; i < n; i++) { clock += 30; frame(...make()); } }

(async () => {
  context.window.GestureControl.start({}, {
    onAim: (x, y) => aim = [x, y], onMove: (x, z) => move = [x, z],
    onFire: v => fire = v, onStatus: t => status = t
  });
  await Promise.resolve();

  // 1. ONE hand is enough: neutral settles by itself, output starts at 0.
  frames(6, () => [[AIM(0, -0.1)]]);
  assert.deepStrictEqual(aim, [0, 0]);
  assert.strictEqual(fire, false);
  console.log('PASS one hand calibrates itself to exact neutral');

  // 2. Fingertip right = aim right; fingertip up = aim up (negative y).
  frames(3, () => [[AIM(0.12, -0.1)]]);
  assert(aim[0] > 0, 'aim right');
  frames(3, () => [[AIM(0, -0.22)]]);
  assert(aim[1] < 0, 'aim up');
  frames(3, () => [[AIM(0, -0.1)]]);
  assert.deepStrictEqual(aim, [0, 0]);
  console.log('PASS fingertip aims with correct signs and returns to zero');

  // 3. Pinch is a held trigger: close fires and keeps firing, open stops.
  frames(4, () => [[AIM(0, -0.1, 0.15)]]);
  assert.strictEqual(fire, true);
  frames(2, () => [[AIM(0, -0.1, 0.15)]]);
  assert.strictEqual(fire, true);
  frames(3, () => [[AIM(0, -0.1, 0.9)]]);
  assert.strictEqual(fire, false);
  console.log('PASS pinch hold fires, release stops');

  // 4. Hand loss parks everything, no stuck fire.
  frame([]);
  assert.deepStrictEqual(aim, [0, 0]);
  assert.strictEqual(fire, false);
  console.log('PASS hand loss clears aim and fire');

  // 5. Second hand moves: raised palm = FORWARD (+z), right palm = +x.
  frames(6, () => [[AIM(0, -0.1), MOVE(0.3, 0.7)]]);
  assert.deepStrictEqual(move, [0, 0]);
  frames(3, () => [[AIM(0, -0.1), MOVE(0.3, 0.56)]]);
  assert(move[1] > 0, 'raised palm must move FORWARD');
  frames(3, () => [[AIM(0, -0.1), MOVE(0.44, 0.7)]]);
  assert(move[0] > 0, 'palm right must strafe right');
  frames(3, () => [[AIM(0, -0.1), MOVE(0.3, 0.7)]]);
  assert.deepStrictEqual(move, [0, 0]);
  console.log('PASS move palm: raise = forward, right = right, neutral = stop');

  // 6. Losing the MOVE hand mid-play keeps AIM + fire working.
  frames(4, () => [[AIM(0, -0.1, 0.15)]]);
  assert.strictEqual(fire, true);
  console.log('PASS dropping to one hand keeps aim + fire live');

  // 7. Manual neutral: works with the one visible hand; refuses none.
  assert.strictEqual(context.window.GestureControl.capture(), true);
  clock += 500; frame([]);
  assert.strictEqual(context.window.GestureControl.capture(), false);
  console.log('PASS manual capture accepts visible hand, rejects none');

  // 8. Watchdog: results stopping zeroes everything.
  frames(6, () => [[AIM(0, -0.1)]]);
  frames(2, () => [[AIM(0.12, -0.1, 0.15)]]);
  clock += 1000; watch();
  assert.deepStrictEqual(aim, [0, 0]);
  assert.strictEqual(fire, false);
  console.log('PASS watchdog zeros input when tracking stalls');

  // 9b. A light, partial pinch still fires (forgiving threshold), and the
  // trigger holds through small finger wobble around the old cutoff.
  frames(4, () => [[AIM(0.05, -0.05, 0.38)]]);
  assert.strictEqual(fire, true);
  frames(2, () => [[AIM(0.05, -0.05, 0.55)]]);
  assert.strictEqual(fire, true);
  frames(3, () => [[AIM(0.05, -0.05, 0.9)]]);
  assert.strictEqual(fire, false);
  console.log('PASS light pinch fires and holds through wobble');

  // 9. Recalibrate re-settles at the current pose.
  context.window.GestureControl.calibrate();
  frames(6, () => [[AIM(0.05, -0.05)]]);
  assert.deepStrictEqual(aim, [0, 0]);
  console.log('PASS recalibrate settles at the new pose');
})().catch(e => { console.error(e); process.exitCode = 1; });
