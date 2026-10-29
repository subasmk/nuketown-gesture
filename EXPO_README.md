# Private local expo copy with webcam gestures

Original game: Luckey Faraday / LuckeySystems, https://github.com/luckeyfaraday/pastel-nuketown . Original source snapshot: 62d18b6003b7015db70b52b5185177dc539394a7. The upstream README says **Private. All rights reserved.** That notice remains unchanged. This is not an open-source license grant or a claim of permission from the original author. Keep this delivery private. Do not republish, distribute or deploy publicly without resolving the original author's rights. Gesture-layer changes and portable local run route were added for the requested expo experiment; original authorship/history is retained.

## Windows host

Install current Node 22 LTS (22.5 minimum). Clone/download this PRIVATE repository while signed into your own GitHub account, then open PowerShell in its folder:

```text
npm ci
npm start
```

Or double-click START_EXPO.bat. First install needs internet. Build now runs through Node, NOT Bash, so native PowerShell works. Libraries/models are served from installed packages rather than live CDNs. Some upstream art/fonts may still use network URLs, so test offline behavior separately.

Host opens printed **https://localhost:8080**. Friend opens the correct printed host Wi-Fi IPv4 HTTPS link on the SAME trusted hotspot. Ignore VPN/virtual adapter addresses; check ipconfig. If 8080 is already in use, close the other server, or in PowerShell `$env:PORT=8081; npm start`.

Both browsers must accept the self-signed certificate for YOUR own verified host/private IP only, then allow camera. Certificate changes each server restart. Do not disable browser security/firewall. Allow Node only on PRIVATE networks. If a managed browser refuses camera capture on that certificate, stop and report the exact error. Remote webcam capture has not been physically verified here.

## Controls

1. ENABLE CAMERA in lower-left panel; allow the browser camera prompt.
2. Show TWO hands comfortably still for one second, or click SET NEUTRAL with both hands detected. No exact finger-open shape required. Expand preview to see hands. The status includes camera/model state, 0/2, 1/2 or 2/2 hand count, calibration progress and errors.
3. Use SOLO for bots. For two laptops, create a room and give your friend its code/invite on YOUR local HTTPS host. Do not join public matchmaking. Menus/start still need clicks. This remains upstream free-for-all/respawn rules, not first-elimination 1v1.
4. Left palm around actual resting neutral = forward/back/strafe. Right index fingertip = aim. Open right thumb/index first, then pinch = hold fire; release pinch = stop fire. Neutral deadzones and speed caps apply.
5. C recalibrates and releases. F8 toggles gestures. Missing either hand, stale results, blur/hidden tab, pause/death/round end stops gesture input. Click the game to lock mouse when required; Esc pauses. C is the practical neutral control during pointer lock, because the panel cannot be clicked then.
6. Keyboard/mouse remain available: WASD, mouse/click, R reload, Space jump, Shift sprint, 1/2/3 weapons. These extra actions are NOT gesture-mapped. F8 pauses gesture input without stopping the camera stream; close the tab to release camera entirely.

Local expo launcher does not configure accounts, purchases, cloud store or public hosting. Sign-in/store UI inherited from upstream is not part of this demo; no keys or payment backend were set up. Use guest solo/private LAN rooms.

## Checks and caveats

`node test-gestures.cjs` tests neutral/deadzone/loss handling. `node test-gesture-bridge.cjs` tests native intent, fire release, pause/stale stop and safe neutral behavior. `npm test` runs upstream tests. The pre-change upstream suite had 379/380 passing here, one failing store animation assertion ('a character stopped turning'). Do not mistake that existing failure for a clean all-tests pass. The local variant's script-security assertion accepts the three npm-pinned same-origin dependencies instead of demanding CDN copies. The original store-animation check passed on the later run, so it may be order/timing-sensitive. Default upstream check/build freshness expectations refer to their Bash builder; use npm run build for this local variant.

Syntax, model/library routes, local HTTPS and browser render were checked. Physical Windows camera directions/model speed, pointer lock and TWO actual laptop cameras over hotspot remain unverified. This is a prototype, not a claim of expo readiness. Test neutral, stop-on-hand-loss, pinch release, movement and guest play on both machines before presenting it.


## Two options: bots or first-kill 1v1
- SOLO: unchanged practice against eight bots.
- First-kill 1v1: both laptops open the host HTTPS URL, enter distinct PLAYER NAME values. Host opens ROOMS, selects **1v1 ROOM - FIRST KILL WINS**. This is an unlisted, two-seat room with zero bots. Friend uses ROOMS -> code -> JOIN (or the invite link). Host waits for exactly two names, clicks START MATCH, then both click ENTER MATCH. Calibrate gestures on each laptop before entering. First valid elimination ends the round, displays the winner's name on both screens, and stops gameplay. No timed auto-rematch in this mode.
- Same pair: host clicks NEXT ROUND / SAME PAIR, then both ENTER MATCH. Health, ammo, scores reset.
- Next booth pair: both click MAIN MENU, change PLAYER NAME values, host creates a new 1v1 room, friend joins the new code. This avoids carrying previous people's names or scores.
- Disconnect during a live duel cancels it with no winner; return to menu and create a new room. A third player is rejected. A running duel cannot accept a substitute.
- CREATE DEATHMATCH ROOM and regular PLAY retain their original bot-fill/25-kill behavior. The 1v1 rule is carried by the room, not the URL or the guest's selected mode.
