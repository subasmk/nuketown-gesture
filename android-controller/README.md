# Nuketown phone controller (Android)

Native app that replaces the browser /controller page so the hardware volume keys work.

- Volume UP = fire (hold = keep firing)
- Volume DOWN = jump
- Phone turn / tilt = aim (same /gyro WebSocket as the web page, so the game side is unchanged)
- On-screen FIRE / JUMP buttons are kept as a backup.

Use: start the game (`npm start`), tap CONNECT PHONE in the game, open the app, type the laptop
address the server prints (for example `192.168.43.5:8080`), tap CONNECT. Hold the phone upright
with the back camera pointing at the screen; RE-CENTRE resets straight ahead.

The laptop uses a throwaway self-signed HTTPS certificate. The app skips the certificate check
for the one host you type, on purpose, and talks to nothing else.

Build: `gradle assembleDebug` (JDK 17, Android SDK 34, Gradle 8.7+), or open this folder in Android
Studio. Debug APK: `app/build/outputs/apk/debug/app-debug.apk`. Sideload by allowing unknown sources.

## v2.0: POINT aim mode and screen-off use

- **AIM MODE: POINT** (default): the direction the phone points is where the camera looks, like a
  laser pointer. Hold the phone upright with the back camera toward the laptop screen and tap
  **RE-CENTRE**. The app sends absolute angles (`{"t":"aim","yaw":deg,"pitch":deg}`, `reset:true`
  on re-centre); the game turns the camera by the difference, so pointing back returns the view.
  Yaw drifts slowly with the phone's gyro: tap RE-CENTRE when it wanders.
- **AIM MODE: TILT**: the old behaviour (turn speed moves the view, `{"t":"look",...}`).
- **Screen off**: a foreground service plus partial wake lock keep the connection and aim streaming
  with the screen off (a notification shows while running). Android does not deliver the volume
  buttons to apps while the screen is off, so volume-key fire/jump need the screen on. Leave
  "Keep screen on" ticked (default) for volume-key play.
- The debug APK is signed with whatever debug key the build machine has. v2 was built on a new
  machine, so it has a different signature from v1: uninstall v1 before installing v2.

## v3.0: full-screen gun select and a redesigned UI

- Once connected, the app switches to a full-screen **gun select**: the game's three weapons as
  large tappable cards - BUBBLEGUN (SMG), MARSHMALLOW (shotgun), LOLLIPOP (rifle), in the same
  order as the keyboard 1/2/3. Tapping a card sends `{"t":"weapon","slot":n}` over the same /gyro
  WebSocket and the game switches through the same `switchWeapon()` path as the 1/2/3 keys, with
  the same phone-live arbitration as fire/jump. Big FIRE / JUMP and RE-CENTRE / DISCONNECT sit
  below the cards; volume keys keep working as before.
- Whole UI redesigned: dark modern card layout, clearer hierarchy, gun cards tinted with each
  weapon's in-game colour. Still a single plain-Java activity, no new dependencies.
- Signing: the debug key is now committed (`debug.keystore`, standard `android`/`androiddebugkey`
  passwords), so every build from v3 on signs identically and installs over the previous version.
  **v3 does NOT install over v2** - v2 was signed with a build-machine key that no longer exists.
  Uninstall v2 first; after that, upgrades are clean.
