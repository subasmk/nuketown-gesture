// Local webcam input only. No external-game/OS input injection.
//
// v2 — forgiving by design (the expo build):
//   * ONE hand is enough: it aims, and pinch (thumb tip to index tip)
//     is a held trigger — close to fire, open to stop.
//   * A second hand, when visible, moves: palm position vs its neutral.
//   * No mandatory calibration pose: each hand's neutral is captured
//     automatically from its first steady frames. SET NEUTRAL / C snaps
//     or re-takes the neutrals of whichever hands are visible.
//   * Losing one hand only parks that hand's channel after a short
//     grace period; the other hand keeps working. Nothing waits on
//     window focus — only a hidden tab pauses input.
window.GestureControl = (() => {
  let running = false, starting = false, fatal = false;
  let cameraState = 'not started', detail = 'Click ENABLE CAMERA to start';
  let handlers = null, detected = 0, lastAt = 0;
  let aim = { x: 0, y: 0 }, move = { x: 0, z: 0 }, firing = false;
  let pinchState = false, pinchSince = 0;

  // Per-role tracking. A role exists only while its hand is seen.
  function newRole() { return { seen: 0, lastSeenAt: 0, cand: null, candN: 0, neutral: null, pos: null }; }
  const roles = { aim: newRole(), move: newRole() };

  function report(message) {
    if (message) detail = message;
    handlers?.onStatus(`Camera: ${cameraState} | Hands: ${detected} | ${detail}`);
  }
  const center = p => [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + p[i].x / 5, y: a.y + p[i].y / 5 }), { x: 0, y: 0 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const axis = (v, span) => Math.abs(v) < .04 ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * .04) / span));

  function emit() {
    handlers?.onAim(aim.x, aim.y);
    handlers?.onMove(move.x, move.z);
    handlers?.onFire?.(firing);
  }
  function zeroRole(role) {
    if (role === 'aim') { aim = { x: 0, y: 0 }; firing = false; pinchState = false; }
    else { move = { x: 0, z: 0 }; }
  }
  function clearAll(message) { zeroRole('aim'); zeroRole('move'); emit(); if (message) report(message); }

  // Feed one sighting of a hand into a role; returns true once its
  // neutral has settled (output is live from that frame on).
  function feedRole(role, pos, now) {
    const r = roles[role];
    r.seen++; r.lastSeenAt = now; r.pos = pos;
    if (!r.neutral) {
      if (!r.cand || Math.hypot(pos.x - r.cand.x, pos.y - r.cand.y) > .06) { r.cand = { ...pos }; r.candN = 1; }
      else { r.candN++; r.cand.x += (pos.x - r.cand.x) / r.candN; r.cand.y += (pos.y - r.cand.y) / r.candN; }
      if (r.candN >= 5) { r.neutral = { ...r.cand }; r.cand = null; r.candN = 0; }
      return false;
    }
    return true;
  }

  function capture() {
    let took = false;
    for (const name of ['aim', 'move']) {
      const r = roles[name];
      if (r.pos && performance.now() - r.lastSeenAt < 400) { r.neutral = { ...r.pos }; r.cand = null; r.candN = 0; took = true; }
    }
    if (took) report('Neutral saved. Aim hand: point + pinch. Other hand: move.');
    else report('No hand visible — show a hand, then SET NEUTRAL.');
    return took;
  }
  function calibrate() {
    for (const name of ['aim', 'move']) { roles[name].neutral = null; roles[name].cand = null; roles[name].candN = 0; }
    clearAll('Re-centring: hold hand(s) steady a moment — neutral sets itself.');
  }

  function onResults(results) {
    lastAt = performance.now(); cameraState = 'live + model OK'; fatal = false;
    if (document.hidden) { clearAll('Paused: tab hidden'); return; }
    const all = results.multiHandLandmarks || [], labels = results.multiHandedness || [];
    detected = all.length;
    const now = lastAt;
    if (!all.length) {
      for (const name of ['aim', 'move']) if (now - roles[name].lastSeenAt > 200) zeroRole(name);
      emit(); report('No hands in frame. One hand = aim + pinch fire; add the other to move.');
      return;
    }
    // Role assignment: the hand labelled 'Left' is the player's physical
    // right hand in the mirrored preview — that one aims. Fallback: the
    // hand further right in frame aims. A lone hand always aims.
    let aimIdx = labels.findIndex(x => x?.label === 'Left');
    if (aimIdx < 0) aimIdx = all.length === 2 ? (center(all[0]).x > center(all[1]).x ? 0 : 1) : 0;
    const moveIdx = all.length === 2 ? 1 - aimIdx : -1;

    const aimHand = all[aimIdx];
    const tip = { x: aimHand[8].x, y: aimHand[8].y };
    if (feedRole('aim', tip, now)) {
      const n = roles.aim.neutral;
      aim.x += .35 * (axis(tip.x - n.x, .20) - aim.x);
      aim.y += .35 * (axis(tip.y - n.y, .20) - aim.y);
      if (Math.abs(tip.x - n.x) < .04) aim.x = 0;
      if (Math.abs(tip.y - n.y) < .04) aim.y = 0;
      // Pinch = held trigger with hysteresis.
      const scale = Math.max(.03, dist(aimHand[0], aimHand[9]));
      const pinch = dist(aimHand[4], aimHand[8]) / scale;
      const want = pinchState ? pinch < .50 : pinch < .34;
      if (want !== pinchState) {
        if (!pinchSince) pinchSince = now;
        if (now - pinchSince > 50) { pinchState = want; pinchSince = 0; }
      } else pinchSince = 0;
      firing = pinchState;
    } else { aim = { x: 0, y: 0 }; firing = false; pinchState = false; }

    if (moveIdx >= 0) {
      const mc = center(all[moveIdx]);
      if (feedRole('move', mc, now)) {
        const n = roles.move.neutral;
        move.x += .4 * (axis(mc.x - n.x, .17) - move.x);
        // Image y grows downward; the game reads +fwd as forward (the
        // touch stick does the same inversion: up on screen = forward).
        move.z += .4 * (axis(n.y - mc.y, .17) - move.z);
        if (Math.abs(mc.x - n.x) < .04) move.x = 0;
        if (Math.abs(mc.y - n.y) < .04) move.z = 0;
      } else move = { x: 0, z: 0 };
    } else if (now - roles.move.lastSeenAt > 200) zeroRole('move');

    emit();
    if (!roles.aim.neutral) report('Hold aim hand steady — setting its neutral…');
    else if (detected === 1) report('1 hand: AIM + pinch = FIRE. Show 2nd hand to MOVE.');
    else if (!roles.move.neutral) report('Aim live. Hold 2nd hand steady — setting move neutral…');
    else report(`2 hands: AIM + pinch FIRE | MOVE ${move.z > 0 ? 'FORWARD' : move.z < 0 ? 'BACK' : ''}${move.x > 0 ? ' RIGHT' : move.x < 0 ? ' LEFT' : ''} | C re-centre`);
  }

  function start(videoEl, h) {
    handlers = h;
    if (running || starting) { report(); return; }
    fatal = false; cameraState = 'checking'; report('Starting camera…');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fatal = true; cameraState = 'blocked';
      clearAll('Camera needs a secure page: open the https:// link and accept the certificate on this laptop.');
      return;
    }
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      fatal = true; cameraState = 'model unavailable';
      clearAll('Camera model missing. Run npm ci in the game folder, then reload.');
      return;
    }
    starting = true;
    const hands = new Hands({ locateFile: f => `vendor/hands/${f}` });
    hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: .5, minTrackingConfidence: .5 });
    hands.onResults(onResults);
    const camera = new Camera(videoEl, {
      onFrame: async () => { try { await hands.send({ image: videoEl }); } catch (e) { if (!fatal) { fatal = true; cameraState = 'model error'; clearAll(`Tracking error: ${e?.message || e}. Reload the page.`); } } },
      width: 640, height: 480
    });
    cameraState = 'requesting permission'; report('Allow camera in the browser prompt');
    camera.start().then(() => {
      running = true; starting = false; cameraState = 'live; model loading';
      report('Camera live. Show a hand — neutral sets itself, no pose to hold.');
      videoEl.srcObject?.getVideoTracks().forEach(t => t.addEventListener('ended', () => { fatal = true; running = false; cameraState = 'stopped'; clearAll('Camera stopped. Reload after reconnecting the webcam.'); }));
    }).catch(e => {
      fatal = true; starting = false; cameraState = 'denied/unavailable';
      clearAll(`Camera error: ${e?.name || ''} ${e?.message || ''}. Allow camera; close other camera apps; reload.`);
    });
    const startedAt = performance.now();
    setInterval(() => {
      if (fatal || !running) return;
      if (!lastAt) { if (performance.now() - startedAt > 15000) report('No model results yet. Check the vendor/ model files loaded, then reload.'); return; }
      if (performance.now() - lastAt > 900) { detected = 0; clearAll('Tracking paused — show a hand to continue.'); }
    }, 100);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll('Paused: tab hidden'); });
  }
  return { start, calibrate, capture };
})();
