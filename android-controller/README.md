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
