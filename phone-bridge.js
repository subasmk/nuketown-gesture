/* Browser phone controller bridge (v3 expo addition). Coexists with
   phone-gyro.js (native Android app, /gyro protocol): all globals here are
   CTL-prefixed so both scripts can load in the same page. The phone opens The player's phone opens
   /controller, pairs with the code shown in this panel, and streams
   gyro + joystick + buttons through the relay. This page listens and
   plays them through the game's own input contracts:
     look  -> applyLook()          (same as mouse / gesture aim)
     move  -> TOUCH.fwd / strafe   (the analog fields readLocalInput reads)
     jump  -> TOUCH.jump           (a short pulse, like the touch button)
     fire  -> pressFire() / releaseFire()
   Gyro aim is delta-based: each phone message turns the view by how
   much the phone itself turned since the previous message, so any
   holding pose works and there is no calibration step. A FLIP button
   covers phones whose pitch axis runs the other way. */
const CTLP = { on: false, connected: false, fire: false, pressedByUs: false, lastA: null, lastP: null, lookX: 0, lookY: 0, lastMsg: 0, flipY: false, code: '', sens: 1 };
const CTL_PX_PER_DEG = 8;
/* The gesture bridge asks this before applying webcam aim/fire: while a
   paired browser phone is streaming, it owns aim + fire (same rule as the
   native /gyro app's PHONE_LIVE). Webcam walking stays live for both. */
function CTL_LIVE() { return CTLP.on && CTLP.connected && performance.now() - CTLP.lastMsg < 1000; }
function ctlAccepts() {
  return CTLP.on && CTLP.connected &&
    (typeof gestureAccepts === 'function' ? gestureAccepts() : (typeof G !== 'undefined' && G.started && !G.paused && !G.over));
}
function ctlRelease() {
  if (CTLP.pressedByUs && typeof IN !== 'undefined' && IN.firing) releaseFire();
  CTLP.pressedByUs = false; CTLP.fire = false;
  if (typeof TOUCH !== 'undefined') { TOUCH.fwd = 0; TOUCH.strafe = 0; TOUCH.jump = false; TOUCH.sprint = false; }
}
function ctlAngDelta(a, b) { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function ctlHandleMessage(m) {
  const status = document.getElementById('ctl-status');
  if (m.t === 'ctl-status') {
    CTLP.connected = !!m.phone;
    CTLP.lastA = CTLP.lastP = null;
    if (!CTLP.connected) ctlRelease();
    if (status) status.textContent = CTLP.connected ? '📱 Phone connected — turn it to aim!' : 'Waiting for phone… open /controller and enter the code.';
    return;
  }
  if (m.t !== 'ctl' || !Array.isArray(m.o)) return;
  /* Sensitivity from the phone's slider: 1 = the original fixed feel. */
  if (typeof m.sn === 'number' && isFinite(m.sn)) CTLP.sens = Math.max(0.25, Math.min(3, m.sn));
  CTLP.connected = true;
  CTLP.lastMsg = performance.now();
  const [a, b, g] = m.o;
  const landscape = m.s === 90 || m.s === -90 || m.s === 270;
  const pitch = landscape ? g : b;
  if (CTLP.lastA !== null) {
    const dYaw = ctlAngDelta(a, CTLP.lastA);
    const dPitch = pitch - CTLP.lastP;
    const px = CTL_PX_PER_DEG * CTLP.sens;
    if (Math.abs(dYaw) < 60) CTLP.lookX += dYaw * px;   // turning phone right lowers alpha -> handled by sign below
    if (Math.abs(dPitch) < 60) CTLP.lookY += (CTLP.flipY ? -dPitch : dPitch) * px;
  }
  CTLP.lastA = a; CTLP.lastP = pitch;
  if (Array.isArray(m.j) && typeof TOUCH !== 'undefined') {
    TOUCH.strafe = Math.max(-1, Math.min(1, +m.j[0] || 0));
    TOUCH.fwd = Math.max(-1, Math.min(1, +m.j[1] || 0));
    TOUCH.sprint = TOUCH.fwd > 0.85;
  }
  CTLP.fire = !!m.f;
  if (m.jump) {
    if (typeof TOUCH !== 'undefined') { TOUCH.jump = true; setTimeout(() => { TOUCH.jump = false; }, 130); }
  }
}
function ctlTick() {
  if (!ctlAccepts()) { if (CTLP.pressedByUs || CTLP.fire) ctlRelease(); CTLP.lookX = CTLP.lookY = 0; return; }
  if (performance.now() - CTLP.lastMsg > 450) { ctlRelease(); CTLP.lookX = CTLP.lookY = 0; return; }
  if (CTLP.lookX || CTLP.lookY) {
    // Phone yaw (alpha) decreases when the phone turns right; the game
   phone-gyro.js (native Android app, /gyro protocol): all globals here are
   CTL-prefixed so both scripts can load in the same page. The phone opens The player's phone opens
   /controller, pairs with the code shown in this panel, and streams
   gyro + joystick + buttons through the relay. This page listens and
   plays them through the game's own input contracts:
     look  -> applyLook()          (same as mouse / gesture aim)
     move  -> TOUCH.fwd / strafe   (the analog fields readLocalInput reads)
     jump  -> TOUCH.jump           (a short pulse, like the touch button)
     fire  -> pressFire() / releaseFire()
   Gyro aim is delta-based: each phone message turns the view by how
   much the phone itself turned since the previous message, so any
   holding pose works and there is no calibration step. A FLIP button
   covers phones whose pitch axis runs the other way. */
const CTLP = { on: false, connected: false, fire: false, pressedByUs: false, lastA: null, lastP: null, lookX: 0, lookY: 0, lastMsg: 0, flipY: false, code: '', sens: 1 };
const CTL_PX_PER_DEG = 8;
/* The gesture bridge asks this before applying webcam aim/fire: while a
   paired browser phone is streaming, it owns aim + fire (same rule as the
   native /gyro app's PHONE_LIVE). Webcam walking stays live for both. */
function CTL_LIVE() { return CTLP.on && CTLP.connected && performance.now() - CTLP.lastMsg < 1000; }
function ctlAccepts() {
  return CTLP.on && CTLP.connected &&
    (typeof gestureAccepts === 'function' ? gestureAccepts() : (typeof G !== 'undefined' && G.started && !G.paused && !G.over));
}
function ctlRelease() {
  if (CTLP.pressedByUs && typeof IN !== 'undefined' && IN.firing) releaseFire();
  CTLP.pressedByUs = false; CTLP.fire = false;
  if (typeof TOUCH !== 'undefined') { TOUCH.fwd = 0; TOUCH.strafe = 0; TOUCH.jump = false; TOUCH.sprint = false; }
}
function ctlAngDelta(a, b) { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function ctlHandleMessage(m) {
  const status = document.getElementById('ctl-status');
  if (m.t === 'ctl-status') {
    CTLP.connected = !!m.phone;
    CTLP.lastA = CTLP.lastP = null;
    if (!CTLP.connected) ctlRelease();
    if (status) status.textContent = CTLP.connected ? '📱 Phone connected — turn it to aim!' : 'Waiting for phone… open /controller and enter the code.';
    return;
  }
  if (m.t !== 'ctl' || !Array.isArray(m.o)) return;
  /* Sensitivity from the phone's slider: 1 = the original fixed feel. */
  if (typeof m.sn === 'number' && isFinite(m.sn)) CTLP.sens = Math.max(0.25, Math.min(3, m.sn));
  CTLP.connected = true;
  CTLP.lastMsg = performance.now();
  const [a, b, g] = m.o;
  const landscape = m.s === 90 || m.s === -90 || m.s === 270;
  const pitch = landscape ? g : b;
  if (CTLP.lastA !== null) {
    const dYaw = ctlAngDelta(a, CTLP.lastA);
    const dPitch = pitch - CTLP.lastP;
    const px = CTL_PX_PER_DEG * CTLP.sens;
    if (Math.abs(dYaw) < 60) CTLP.lookX += dYaw * px;   // turning phone right lowers alpha -> handled by sign below
    if (Math.abs(dPitch) < 60) CTLP.lookY += (CTLP.flipY ? -dPitch : dPitch) * px;
  }
  CTLP.lastA = a; CTLP.lastP = pitch;
  if (Array.isArray(m.j) && typeof TOUCH !== 'undefined') {
    TOUCH.strafe = Math.max(-1, Math.min(1, +m.j[0] || 0));
    TOUCH.fwd = Math.max(-1, Math.min(1, +m.j[1] || 0));
    TOUCH.sprint = TOUCH.fwd > 0.85;
  }
  CTLP.fire = !!m.f;
  if (m.jump) {
    if (typeof TOUCH !== 'undefined') { TOUCH.jump = true; setTimeout(() => { TOUCH.jump = false; }, 130); }
  }
}
function ctlTick() {
  if (!ctlAccepts()) { if (CTLP.pressedByUs || CTLP.fire) ctlRelease(); CTLP.lookX = CTLP.lookY = 0; return; }
  if (performance.now() - CTLP.lastMsg > 450) { ctlRelease(); CTLP.lookX = CTLP.lookY = 0; return; }
  if (CTLP.lookX || CTLP.lookY) {
    // Phone yaw (alpha) decreases when the phone turns right; the game
    // turns right on positive dx, so feed the negated delta.
    applyLook(-CTLP.lookX, CTLP.lookY, mouseSens);
    CTLP.lookX = CTLP.lookY = 0;
  }
  if (CTLP.fire && !IN.firing) { pressFire(); CTLP.pressedByUs = true; }
  if (!CTLP.fire && CTLP.pressedByUs && IN.firing) { releaseFire(); CTLP.pressedByUs = false; }
}
addEventListener('DOMContentLoaded', () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  try { code = localStorage.getItem('pn-phone-code') || ''; } catch (e) {}
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    try { localStorage.setItem('pn-phone-code', code); } catch (e) {}
  }
  CTLP.code = code;
  const box = document.createElement('section');
  box.id = 'ctl-panel';
  box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:100000;width:230px;padding:8px;background:#182431ed;color:white;font:12px system-ui;border-radius:10px';
  box.innerHTML = '<b>📱 CTLP CONTROLLER</b><br>On the phone open <b>' + location.origin + '/controller</b><br>Pairing code: <b style="font-size:20px;letter-spacing:4px">' + code + '</b><br><span id="ctl-status">Off. Click ENABLE CTLP.</span><br><button id="ctl-start">ENABLE CTLP</button> <button id="ctl-flip">FLIP ↕ AIM</button><br>Turn phone = aim · stick = move<br>FIRE / JUMP buttons · Android: vol keys work too';
  document.body.append(box);
  const status = document.getElementById('ctl-status');
  document.getElementById('ctl-flip').onclick = () => { CTLP.flipY = !CTLP.flipY; status.textContent = 'Aim ↕ ' + (CTLP.flipY ? 'flipped.' : 'normal.'); };
  document.getElementById('ctl-start').onclick = () => {
    if (CTLP.on) return;
    CTLP.on = true;
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const ws = new WebSocket(proto + location.host + '/ws');
    const V = (typeof NETP !== 'undefined' && NETP.VERSION) || 11;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'ctl-listen', v: V, code })));
    ws.addEventListener('message', e => { try { ctlHandleMessage(JSON.parse(e.data)); } catch (err) {} });
    ws.addEventListener('close', () => { CTLP.connected = false; ctlRelease(); status.textContent = 'Phone link closed — reload page to retry.'; });
    status.textContent = 'Waiting for phone… open /controller and enter the code.';
  };
  setInterval(ctlTick, 16);
});
