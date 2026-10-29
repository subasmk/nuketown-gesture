# Private local expo copy with webcam gestures

Original game: Luckey Faraday / LuckeySystems, https://github.com/luckeyfaraday/pastel-nuketown . Original source snapshot: 62d18b6003b7015db70b52b5185177dc539394a7. The upstream README says **Private. All rights reserved.** That notice remains unchanged. This is not an open-source license grant or a claim of permission from the original author. Keep this delivery private. Do not republish, distribute or deploy publicly without resolving the original author's rights. Gesture-layer changes and portable local run route were added for the requested expo experiment; original authorship/history is retained.

## Windows host

Install current Node 22 LTS (22.5 minimum). Clone/download this PRIVATE repository while signed into your own GitHub account, then open PowerShell in its folder:

```text
npm ci
npm start
```

Or double-click START_EXPO.bat. First install needs internet. Build now runs through Node, NOT Bash, so native PowerShell works. Libraries/models are served from installed packages rather than live CDNs. Some upstream art/fonts may still use network URLs, so test offline behavior separately.

Host opens printed **https://localhost:8080**. The server also prints one **FRIEND OPENS** link — that is the only link the friend needs, on the SAME hotspot/Wi-Fi. On a Windows mobile hotspot it is normally `https://192.168.137.1:8080`. Other printed addresses are VPN/virtual adapters; ignore them. If 8080 is already in use, close the other server, or in PowerShell `$env:PORT=8081; npm start`.

Friend checklist (this is where connections usually fail):
1. Open the **https://** link — plain http:// cannot work on this port and looks like a dead page.
2. The browser warns "Your connection is not private" (self-signed certificate). Click **Advanced -> Proceed**. This is expected for your own laptop; the certificate changes each server restart, so the warning returns after a restart.
3. If the page never loads at all: on the HOST laptop, Windows Firewall must allow Node.js on **Private** networks (click Allow on the first-run prompt, or Windows Security -> Firewall -> Allow an app). If it asks, treat the hotspot network as Private.
4. Both laptops on the same hotspot, friend's page in Chrome, then allow camera when asked.

Remote webcam capture has not been physically verified here — test the friend's camera on the friend's laptop before the expo.

## Controls

1. ENABLE CAMERA in lower-left panel; allow the browser camera prompt.
2. **One hand is enough.** There is no pose to hold and no mandatory calibration: each hand's neutral is captured automatically from its first steady frames (about half a second). SET NEUTRAL snaps the neutral of whichever hands are visible; C re-centres the same way mid-game.
3. Use SOLO for bots. For two laptops, create a room and give your friend its code/invite on YOUR local HTTPS host. Do not join public matchmaking. Menus/start still need clicks.
4. Aim hand (your right hand): index fingertip position aims. **Pinch = trigger: close thumb to index to fire, keep it closed to keep firing, open to stop.** Second hand: palm position moves — raise palm = forward, lower = back, sides = strafe. Neutral deadzones and speed caps apply.
5. C re-centres and releases. F8 toggles gestures. Losing ONE hand only parks that hand's channel (aim/fire or movement) briefly; the other keeps working. Hidden tab, stale tracking, pause/death/round end still stop gesture input. Click the game to lock mouse when required; Esc pauses. C is the practical neutral control during pointer lock, because the panel cannot be clicked then.
6. Keyboard/mouse remain available: WASD, mouse/click, R reload, Space jump, Shift sprint, 1/2/3 weapons. These extra actions are NOT gesture-mapped. F8 pauses gesture input without stopping the camera stream; close the tab to release camera entirely.
7. **Phone aim (recommended for play):** tap CONNECT PHONE in the lower-right panel and open the shown `.../gyro-controller` link on the phone (same hotspot/Wi-Fi, Advanced -> Proceed on the certificate warning), then START and allow motion. Tilting/turning the phone turns the screen; the big FIRE button on the phone shoots. While the phone is live it owns aim and fire, and the webcam hand drives WALKING only. Web pages cannot read the hardware volume keys in Chrome, so volume-up fire is not reliably possible; the on-phone FIRE button is the trigger. RE-CENTRE on the phone re-sets straight ahead.

Local expo launcher does not configure accounts, purchases, cloud store or public hosting. Sign-in/store UI inherited from upstream is not part of this demo; no keys or payment backend were set up. Use guest solo/private LAN rooms.

## Checks and caveats

`node test-phone-gyro.cjs` tests the phone aim contract (look applies once, held fire, stale/pause release, phone owns aim+fire over gestures). `node gyro-relay.test.js` (inside `npm test`) covers the /controller and /gyro-controller pages and the /gyro relay. `node --test phone-relay.test.js` and `node test-phone-bridge.cjs` cover the browser-controller pairing, forwarding, signs and stale-stop. `node test-gestures.cjs` tests the v2 gesture contract: one-hand aim/fire, automatic neutrals, pinch hold/release, movement signs (raised palm = forward), per-hand loss, watchdog and recalibration. `node test-gesture-bridge.cjs` tests native intent, fire release, pause/stale stop and safe neutral behavior. `npm test` runs upstream tests. Gesture v2 fixes over the previous build: movement forward was inverted (raised palm moved backward — its own test failed on the shipped code), the bridge stopped all input whenever a status line contained the word "STOP" (including standing still), pinch fire needed an open-first arming ritual and pulsed instead of holding, and input required two hands plus a calibration pose and window focus at all times. The relay/duel path (create room, join by code, host start, round start) is verified end-to-end with two scripted WebSocket clients. The pre-change upstream suite had 379/380 passing here, one failing store animation assertion ('a character stopped turning'). Do not mistake that existing failure for a clean all-tests pass. The local variant's script-security assertion accepts the three npm-pinned same-origin dependencies instead of demanding CDN copies. The original store-animation check passed on the later run, so it may be order/timing-sensitive. Default upstream check/build freshness expectations refer to their Bash builder; use npm run build for this local variant.

Syntax, model/library routes, local HTTPS and browser render were checked. Physical Windows camera directions/model speed, pointer lock and TWO actual laptop cameras over hotspot remain unverified. This is a prototype, not a claim of expo readiness. Test neutral, stop-on-hand-loss, pinch release, movement and guest play on both machines before presenting it.


## Two options: bots or first-kill 1v1
- SOLO: unchanged practice against eight bots.
- First-kill 1v1: both laptops open the host HTTPS URL, enter distinct PLAYER NAME values. Host opens ROOMS, selects **1v1 ROOM - FIRST KILL WINS**. This is an unlisted, two-seat room with zero bots. Friend uses ROOMS -> code -> JOIN (or the invite link). Host waits for exactly two names, clicks START MATCH, then both click ENTER MATCH. Turn gestures ON on each laptop before entering (neutrals set themselves). First valid elimination ends the round, displays the winner's name on both screens, and stops gameplay. No timed auto-rematch in this mode.
- Same pair: host clicks NEXT ROUND / SAME PAIR, then both ENTER MATCH. Health, ammo, scores reset.
- Next booth pair: both click MAIN MENU, change PLAYER NAME values, host creates a new 1v1 room, friend joins the new code. This avoids carrying previous people's names or scores.
- Disconnect during a live duel cancels it with no winner; return to menu and create a new room. A third player is rejected. A running duel cannot accept a substitute.
- CREATE DEATHMATCH ROOM and regular PLAY retain their original bot-fill/25-kill behavior. The 1v1 rule is carried by the room, not the URL or the guest's selected mode.

8. **Android app (volume keys):** install `android-controller` (see its README). Volume UP = fire, Volume DOWN = jump, phone turn = aim. Use it instead of the browser /controller page; the page still works as a fallback with an on-screen FIRE button.

## Browser phone controller (v3, no install)

Any phone on the same hotspot can drive a laptop without installing anything - good for expo visitors.

1. On the laptop game page, the **PHONE CONTROLLER** panel (top-left) shows a 4-letter pairing code. Click **ENABLE PHONE**.
2. On the phone (same hotspot), open `https://<host-ip>:8080/controller`, accept the certificate warning, type the code, tap **CONNECT + ENABLE GYRO** (iOS asks for motion permission here - allow it).
3. Hold the phone sideways. Turning it turns the view (delta-based: any starting pose works, no calibration). Left thumb stick moves (push far = sprint), FIRE holds to shoot, JUMP jumps. If up/down aim feels inverted on that phone, click **FLIP ↕ AIM** on the laptop panel.
4. Android Chrome only, experimental: with the controller connected, **VOL UP = fire burst, VOL DOWN = jump**, detected via the media-volume change of a silent loop the page plays (browsers never receive volume key presses directly). It does not work on iOS; the on-screen buttons always work. For reliable volume keys use the native Android app (item 8) - both controllers work against the same server and can even be connected at once (one per panel).
5. While a browser phone is streaming it owns aim + fire (same rule as the native app), and the webcam hand drives WALKING only; the phone's own stick also moves. The relay channel is code-scoped: a phone can only reach the laptop page listening on its code, and it cannot touch room state. The legacy browser gyro page moved to `/gyro-controller`; `/controller` now serves this pairing page.

## Finger walking (v5)

Connect the native Android app with CONNECT PHONE (PHONE AIM panel), or pair the browser controller through ENABLE CTLP and its 4-letter code at /controller. Then ENABLE CAMERA on the laptop. While either phone is streaming, the gesture panel automatically enables MOVE ONLY. Phone = aim/fire/jump; the free webcam hand = walking.

- Extend index/middle/ring/little fingers: 1 = forward, 2 = back, 3 = right, 4 = left. The thumb is ignored. Fist or no hand stops immediately.
- Hold a new direction for at least 80 ms to engage it; transient shapes do not select a direction. Finger-tip distance from the wrist is compared with its middle joint, rather than screen up/down. Physical tracking still needs a visible, unoccluded hand.
- MOVE ONLY button is a manual override until reload. ON uses finger walking and parks webcam aim/pinch; OFF restores the existing full gesture controls. Even in manual OFF, a live phone keeps aim/fire priority.
- With no phone stream, auto mode returns to full gestures with fresh automatic neutrals: one hand aims + light pinch fires, second palm moves.
- Native volume UP = fire, volume DOWN = jump is unchanged. Browser on-screen FIRE/JUMP and stick still work; its Chrome volume trick is experimental. /gyro-controller remains the legacy fallback.

New tests cover finger directions, rotation/scale, the 80 ms stability gate, immediate fist/hand-loss stop, mode changes, watchdog, and both phone types retaining fire while webcam tracking stops. Camera and physical-phone testing on the booth laptops is still required.
