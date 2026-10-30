/* Phone gyroscope aim for the expo build. Local LAN only: the native app
   (or the legacy browser page at /gyro-controller) connects and streams orientation deltas over
   a WebSocket on /gyro. While a phone is live it owns aim + fire and the
   webcam hand drives walking only; nothing leaves the hotspot. */
const PHONE = { enabled: false, ws: null, liveUntil: 0, last: 0, lookX: 0, lookY: 0, aim: null, applied: null, fire: false, jump: false, holding: false };
function PHONE_JUMP() { return PHONE_LIVE() && PHONE.jump; }
/* The gesture bridge asks this before applying webcam aim/fire. */
function PHONE_LIVE() { return PHONE.enabled && PHONE.ws && PHONE.ws.readyState === 1 && performance.now() < PHONE.liveUntil; }
function phoneRelease() { if (PHONE.holding) { PHONE.holding = false; releaseFire(); } PHONE.fire = false; PHONE.jump = false; }
function phoneStatus(t) { const el = document.getElementById?.('phone-status'); if (el) el.textContent = t; }
function phoneTick(dt) {
  const ok = PHONE.enabled && document.hasFocus() && !document.hidden && G.started && !G.paused && !G.over && G.player && G.player.alive;
  if (!PHONE_LIVE() || !ok || performance.now() - PHONE.last > 500) {
    PHONE.lookX = PHONE.lookY = 0;
    PHONE.aim = PHONE.applied = null;
    phoneRelease();
    return;
  }
  /* POINT mode: the phone sends an absolute direction (degrees from its own
     re-centre reference). Turn the camera by the difference from what was
     already applied, so the view follows where the phone points. */
  if (PHONE.aim && PHONE.applied) {
    /* Chase the latest sample instead of jumping to it: aim messages land
       every ~20-40ms, so applying the whole delta on arrival stair-steps the
       camera. A ~45ms time constant spreads each step across frames; a reset
       still adopts instantly above, so re-centring never slides. */
    const chase = 1 - Math.exp(-dt / 0.045);
    let dyaw = PHONE.aim.yaw - PHONE.applied.yaw;
    if (dyaw > 180) dyaw -= 360; else if (dyaw < -180) dyaw += 360;
    const dpitch = PHONE.aim.pitch - PHONE.applied.pitch;
    const sy = dyaw * chase, sp = dpitch * chase;
    /* applied must stay wrapped like the incoming aim: accumulate past
       +-180 unwrapped and dyaw collapses to 0 after one full turn, so a
       long spin would freeze the camera. */
    let ay = PHONE.applied.yaw + sy;
    if (ay > 180) ay -= 360; else if (ay < -180) ay += 360;
    PHONE.applied = { yaw: ay, pitch: PHONE.applied.pitch + sp };
    if (sy || sp) {
      const k = Math.PI / 180 / mouseSens; /* game look units per degree */
      applyLook(sy * k, -sp * k, mouseSens);
    }
  }
  if (PHONE.lookX || PHONE.lookY) { applyLook(PHONE.lookX, PHONE.lookY, mouseSens); PHONE.lookX = PHONE.lookY = 0; }
  if (PHONE.fire && !IN.firing) { pressFire(); PHONE.holding = true; }
  if (!PHONE.fire && PHONE.holding && IN.firing) { PHONE.holding = false; releaseFire(); }
}
function phoneConnect() {
  if (PHONE.ws && PHONE.ws.readyState <= 1) { PHONE.enabled = false; try { PHONE.ws.close(); } catch {} PHONE.ws = null; phoneRelease(); phoneStatus('Off. Tap CONNECT PHONE to start again.'); try { localStorage.setItem('pn-phone-enabled', '0'); } catch (e) {} return; }
  PHONE.enabled = true;
  try { localStorage.setItem('pn-phone-enabled', '1'); } catch (e) {}
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(proto + '://' + location.host + '/gyro?role=game&code=' + PHONE.code);
  PHONE.ws = ws;
  phoneStatus('Waiting for phone... in the phone app, type this address and code ' + PHONE.code + '.');
  ws.onopen = () => phoneStatus('Ready. Phone app: address ' + location.host + ', code ' + PHONE.code + ', then CONNECT.');
  /* Application-level liveness: some proxies answer WebSocket pings at the
     edge, so the server cannot trust pong frames to mean this page is alive.
     A tiny app message every 5s is unforgeable proof; the server drops a
     game that goes silent for >15s and tells the phone. */
  if (PHONE.hb) clearInterval(PHONE.hb);
  PHONE.hb = setInterval(() => { try { if (ws.readyState === 1) ws.send('{"t":"hb"}'); } catch (e) {} }, 5000);
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      PHONE.last = performance.now(); PHONE.liveUntil = PHONE.last + 1500;
      if (m.t === 'look') {
        PHONE.lookX = Math.max(-500, Math.min(500, PHONE.lookX + (+m.dx || 0)));
        PHONE.lookY = Math.max(-500, Math.min(500, PHONE.lookY + (+m.dy || 0)));
      } else if (m.t === 'aim') {
        const yaw = Math.max(-180, Math.min(180, +m.yaw || 0));
        const pitch = Math.max(-80, Math.min(80, +m.pitch || 0));
        PHONE.aim = { yaw, pitch };
        /* First aim, or the phone re-centred: adopt it without moving the camera. */
        if (m.reset || !PHONE.applied) PHONE.applied = { yaw, pitch };
      } else if (m.t === 'weapon') {
        /* Gun select from the app's full-screen weapon cards. Slot numbers are
           the same ones the keyboard uses: 1/2/3 -> smg/shotgun/rifle, and the
           switch goes through the same switchWeapon() those keys call. Same
           arbitration as fire/jump: the phone must be live and the round
           running, so a stale phone (or a menu tap) cannot swap guns. */
        const order = ['smg', 'shotgun', 'rifle'];
        const id = order[Math.round(+m.slot) - 1];
        if (id && PHONE_LIVE() && G.started && !G.paused && !G.over
            && G.player && G.player.alive && typeof switchWeapon === 'function') switchWeapon(id);
      } else if (m.t === 'fire') PHONE.fire = !!m.on;
      else if (m.t === 'jump') PHONE.jump = !!m.on;
      phoneStatus(PHONE.fire ? 'Phone live — FIRING' : 'Phone live — point aims, Vol UP shoots, Vol DOWN jumps. Webcam hand = walking.');
    } catch {}
  };
  ws.onclose = () => { if (PHONE.hb) { clearInterval(PHONE.hb); PHONE.hb = null; } if (PHONE.ws === ws) { PHONE.ws = null; phoneRelease(); phoneStatus('Phone disconnected. Tap CONNECT PHONE to retry.'); } };
  ws.onerror = () => {};
}
addEventListener('DOMContentLoaded', () => {
  /* Per-laptop pairing code: the phone app must type this code so two
     laptops on one server never cross-control each other. */
  let code = '';
  try { code = localStorage.getItem('pn-gyro-code') || ''; } catch (e) {}
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    try { localStorage.setItem('pn-gyro-code', code); } catch (e) {}
  }
  PHONE.code = code;
  const box = document.createElement('section'); box.id = 'phone-panel';
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:100000;width:230px;padding:8px;background:#182431ed;color:white;font:12px system-ui;border-radius:10px';
  box.innerHTML = '<b>PHONE AIM</b> - phone code <b id="phone-code">' + PHONE.code + '</b><br><div id="phone-status" role="status">Off. Tap CONNECT PHONE, then open the link on the phone.</div><button id="phone-connect">CONNECT PHONE</button><br><span id="phone-link"></span><br>Point the phone = look there (or TILT mode) | phone Vol UP = shoot | Vol DOWN = jump<br>While live, webcam hand = WALKING only';
  document.body.append(box);
  const link = document.getElementById('phone-link');
  try { link.textContent = location.origin + '/gyro-controller (browser fallback) or the Android app'; } catch {}
  document.getElementById('phone-connect').onclick = phoneConnect;
  /* A page reload (deploy, refresh, crash) used to silently drop the laptop
     half of the pair: the phone app reconnects on its own and its messages
     then went nowhere, leaving aim + fire dead with the phone still showing
     "Connected". Re-listen automatically if the phone was on before. */
  try { if (localStorage.getItem('pn-phone-enabled') === '1') phoneConnect(); } catch (e) {}
  addEventListener('blur', () => { PHONE.lookX = PHONE.lookY = 0; phoneRelease(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { PHONE.lookX = PHONE.lookY = 0; phoneRelease(); } });
});
