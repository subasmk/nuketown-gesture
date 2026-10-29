/* Phone gyroscope aim for the expo build. Local LAN only: the phone opens
   /controller on this same laptop server and streams orientation deltas over
   a WebSocket on /gyro. While a phone is live it owns aim + fire and the
   webcam hand drives walking only; nothing leaves the hotspot. */
const PHONE = { enabled: false, ws: null, liveUntil: 0, last: 0, lookX: 0, lookY: 0, fire: false, jump: false, holding: false };
function PHONE_JUMP() { return PHONE_LIVE() && PHONE.jump; }
/* The gesture bridge asks this before applying webcam aim/fire. */
function PHONE_LIVE() { return PHONE.enabled && PHONE.ws && PHONE.ws.readyState === 1 && performance.now() < PHONE.liveUntil; }
function phoneRelease() { if (PHONE.holding) { PHONE.holding = false; releaseFire(); } PHONE.fire = false; PHONE.jump = false; }
function phoneStatus(t) { const el = document.getElementById?.('phone-status'); if (el) el.textContent = t; }
function phoneTick(dt) {
  const ok = PHONE.enabled && document.hasFocus() && !document.hidden && G.started && !G.paused && !G.over && G.player && G.player.alive;
  if (!PHONE_LIVE() || !ok || performance.now() - PHONE.last > 500) {
    PHONE.lookX = PHONE.lookY = 0;
    phoneRelease();
    return;
  }
  if (PHONE.lookX || PHONE.lookY) { applyLook(PHONE.lookX, PHONE.lookY, mouseSens); PHONE.lookX = PHONE.lookY = 0; }
  if (PHONE.fire && !IN.firing) { pressFire(); PHONE.holding = true; }
  if (!PHONE.fire && PHONE.holding && IN.firing) { PHONE.holding = false; releaseFire(); }
}
function phoneConnect() {
  if (PHONE.ws && PHONE.ws.readyState <= 1) { PHONE.enabled = false; try { PHONE.ws.close(); } catch {} PHONE.ws = null; phoneRelease(); phoneStatus('Off. Tap CONNECT PHONE to start again.'); return; }
  PHONE.enabled = true;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(proto + '://' + location.host + '/gyro?role=game');
  PHONE.ws = ws;
  phoneStatus('Waiting for phone... open the link below on the phone.');
  ws.onopen = () => phoneStatus('Ready. On the phone: open the link, START, allow motion.');
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      PHONE.last = performance.now(); PHONE.liveUntil = PHONE.last + 1500;
      if (m.t === 'look') {
        PHONE.lookX = Math.max(-500, Math.min(500, PHONE.lookX + (+m.dx || 0)));
        PHONE.lookY = Math.max(-500, Math.min(500, PHONE.lookY + (+m.dy || 0)));
      } else if (m.t === 'fire') PHONE.fire = !!m.on;
      else if (m.t === 'jump') PHONE.jump = !!m.on;
      phoneStatus(PHONE.fire ? 'Phone live — FIRING' : 'Phone live — tilt aims, Vol UP shoots, Vol DOWN jumps. Webcam hand = walking.');
    } catch {}
  };
  ws.onclose = () => { if (PHONE.ws === ws) { PHONE.ws = null; phoneRelease(); phoneStatus('Phone disconnected. Tap CONNECT PHONE to retry.'); } };
  ws.onerror = () => {};
}
addEventListener('DOMContentLoaded', () => {
  const box = document.createElement('section'); box.id = 'phone-panel';
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:100000;width:230px;padding:8px;background:#182431ed;color:white;font:12px system-ui;border-radius:10px';
  box.innerHTML = '<b>PHONE AIM</b><br><div id="phone-status" role="status">Off. Tap CONNECT PHONE, then open the link on the phone.</div><button id="phone-connect">CONNECT PHONE</button><br><span id="phone-link"></span><br>Phone tilt = screen turn | phone Vol UP = shoot | Vol DOWN = jump<br>While live, webcam hand = WALKING only';
  document.body.append(box);
  const link = document.getElementById('phone-link');
  try { link.textContent = location.origin + '/controller'; } catch {}
  document.getElementById('phone-connect').onclick = phoneConnect;
  addEventListener('blur', () => { PHONE.lookX = PHONE.lookY = 0; phoneRelease(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { PHONE.lookX = PHONE.lookY = 0; phoneRelease(); } });
});
