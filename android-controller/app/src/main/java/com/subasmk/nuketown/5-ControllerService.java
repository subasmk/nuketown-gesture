package com.subasmk.nuketown;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Owns the WebSocket, the rotation sensor and a partial wake lock, so aim keeps
 * streaming with the screen off. (Volume keys are NOT delivered to apps while the
 * screen is off on stock Android; that part needs the screen on.)
 *
 * Aim modes:
 *   POINT: absolute. The direction the phone points = where the camera looks,
 *          relative to the RE-CENTRE reference. Sends {"t":"aim","yaw":deg,"pitch":deg}.
 *   TILT : relative. Phone turn speed moves the view. Sends {"t":"look","dx":..,"dy":..}.
 */
public class ControllerService extends Service implements SensorEventListener {
    public static final String ACTION_CONNECT = "connect";
    public static final String ACTION_STOP = "stop";
    public static final String PREFS = "nuketown";
    public static final int MODE_POINT = 0, MODE_TILT = 1;
    public static final float PITCH_LIMIT = 80f;

    /** Set while the service is alive. Used by the activity. */
    public static volatile ControllerService inst;
    public static volatile String status = "Not connected.";
    public static volatile boolean connected;
    /** True only after the server confirms a laptop is listening on our code. */
    public static volatile boolean paired;
    public static volatile Runnable statusListener;

    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private SensorManager sm;
    private Sensor rot;
    private MiniWebSocket ws;
    private PowerManager.WakeLock wake;

    private volatile int mode = MODE_POINT;
    private volatile float sens = 13f;
    private boolean fireOn, jumpOn;
    private final float[] R = new float[9], R2 = new float[9], O = new float[3];

    // TILT state
    private boolean haveLast;
    private float lastAz, lastPitch, accX, accY;
    // POINT state
    private boolean needRef = true, sendReset = true;
    private float refAz, refPitch, curYaw, curPitch;
    private boolean haveAim;
    // POINT smoothing: raw sensor angles jitter; an EMA keeps the reticle steady
    // without noticeable lag (alpha chosen for the 25 Hz flush).
    private boolean haveSmooth;
    private float smYaw, smPitch;

    /** Pure math, unit-tested by hand in docs: wrap an angle difference into [-180, 180]. */
    static float wrap(float d) {
        while (d > 180f) d -= 360f;
        while (d < -180f) d += 360f;
        return d;
    }
    static float clampPitch(float p) { return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p)); }

    private final Runnable flush = new Runnable() {
        @Override public void run() {
            MiniWebSocket w = ws;
            if (w != null && w.isOpen()) {
                if (mode == MODE_POINT) {
                    if (haveAim) {
                        send("{\"t\":\"aim\",\"yaw\":" + r1(curYaw) + ",\"pitch\":" + r1(curPitch)
                            + (sendReset ? ",\"reset\":true" : "") + "}");
                        sendReset = false;
                    }
                } else if (accX != 0 || accY != 0) {
                    send("{\"t\":\"look\",\"dx\":" + r1(accX) + ",\"dy\":" + r1(accY) + "}");
                    accX = accY = 0;
                }
            } else { accX = accY = 0; }
            ui.postDelayed(this, 40);
        }
    };

    private static double r1(float v) { return Math.round(v * 10) / 10.0; }

    @Override public void onCreate() {
        super.onCreate();
        inst = this;
        sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        rot = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        if (rot == null) rot = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
    }

    @Override public int onStartCommand(Intent in, int flags, int startId) {
        if (in == null || ACTION_STOP.equals(in.getAction())) { disconnect("Disconnected."); stopSelf(); return START_NOT_STICKY; }
        goForeground();
        loadPrefs();
        String host = in.getStringExtra("host");
        int port = in.getIntExtra("port", 8080);
        boolean tls = in.getBooleanExtra("tls", true);
        String code = in.getStringExtra("code");
        connect(host, port, tls, code);
        return START_NOT_STICKY;
    }

    private void loadPrefs() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        sens = sp.getFloat("sens", 13f);
        mode = sp.getInt("mode", MODE_POINT);
    }

    public void setMode(int m) {
        mode = m;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("mode", m).apply();
        centre();
    }
    public void setSens(float s) { sens = s; }
    public int getMode() { return mode; }

    /** RE-CENTRE: the next sensor sample becomes "straight ahead". */
    public void centre() {
        needRef = true; sendReset = true; haveAim = false;
        haveLast = false; accX = accY = 0;
        haveSmooth = false;
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("ctl", "Controller", NotificationManager.IMPORTANCE_LOW));
        }
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "ctl") : new Notification.Builder(this);
        Notification n = nb.setContentTitle("Nuketown controller running")
            .setContentText("Aim keeps streaming with the screen off. Tap to open.")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pi).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nuketown:controller");
            wake.setReferenceCounted(false);
        }
        if (!wake.isHeld()) wake.acquire();
    }

    private void say(String s) {
        status = s;
        Runnable l = statusListener;
        if (l != null) ui.post(l);
    }

    private void connect(String host, int port, boolean tls, String code) {
        closeWs();
        say("Connecting to " + host + ":" + port + " ...");
        centre();
        final MiniWebSocket[] holder = new MiniWebSocket[1];
        String path = "/gyro?role=phone" + (code == null || code.isEmpty() ? "" : "&code=" + code);
        holder[0] = new MiniWebSocket(host, port, tls, path, new MiniWebSocket.Listener() {
            @Override public void onOpen() {
                ui.post(() -> { if (ws == holder[0]) { connected = true; paired = false;
                    say("Connected to the server. Waiting for the laptop - in the game open Settings, tap CONNECT PHONE, and check the 4-letter code matches."); } });
            }
            @Override public void onMessage(final String text) {
                ui.post(() -> {
                    if (ws != holder[0]) return;
                    try {
                        org.json.JSONObject m = new org.json.JSONObject(text);
                        if (!"paired".equals(m.optString("t"))) return;
                        paired = m.optBoolean("on");
                        if (paired) say("Paired with the laptop. Aim mode: " + (mode == MODE_POINT ? "POINT" : "TILT") + ".");
                        else say("The laptop stopped listening - in the game open Settings and tap CONNECT PHONE again.");
                    } catch (Exception ignored) {}
                });
            }
            @Override public void onClose(final String why) {
                ui.post(() -> { if (ws == holder[0]) { disconnect("Not connected: " + why + ". Check the address and that the game server is running."); stopSelf(); } });
            }
        });
        ws = holder[0];
        ws.connect();
        if (rot != null) sm.registerListener(this, rot, SensorManager.SENSOR_DELAY_GAME);
        else say("This phone has no rotation sensor, so aim cannot work.");
        ui.removeCallbacks(flush);
        ui.post(flush);
    }

    private void closeWs() {
        final MiniWebSocket w = ws;
        ws = null;
        connected = false;
        paired = false;
        if (w != null) net.execute(w::close);
    }

    private void disconnect(String msg) {
        if (fireOn) setAction(true, false);
        if (jumpOn) setAction(false, false);
        sm.unregisterListener(this);
        ui.removeCallbacks(flush);
        closeWs();
        if (wake != null && wake.isHeld()) wake.release();
        say(msg);
    }

    @Override public void onDestroy() {
        disconnect(status.startsWith("Not connected") ? status : "Disconnected.");
        inst = null;
        net.shutdown();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    private void send(final String m) {
        final MiniWebSocket w = ws;
        if (w == null) return;
        net.execute(() -> w.sendText(m));
    }

    public void setAction(boolean isFire, boolean on) {
        /* Track the trigger even while unpaired so a release after re-pairing
           stays consistent, but only send when a laptop is verifiably
           listening - never shoot into a pair nobody hears. */
        if (isFire) { if (fireOn == on) return; fireOn = on; if (paired) send("{\"t\":\"fire\",\"on\":" + on + "}"); }
        else { if (jumpOn == on) return; jumpOn = on; if (paired) send("{\"t\":\"jump\",\"on\":" + on + "}"); }
    }

    @Override public void onSensorChanged(SensorEvent e) {
        SensorManager.getRotationMatrixFromVector(R, e.values);
        // Phone held upright, back camera pointing forward.
        SensorManager.remapCoordinateSystem(R, SensorManager.AXIS_X, SensorManager.AXIS_Z, R2);
        SensorManager.getOrientation(R2, O);
        float az = (float) Math.toDegrees(O[0]);
        float pitch = (float) Math.toDegrees(O[1]);
        MiniWebSocket w = ws;
        if (w == null || !w.isOpen()) return;
        if (mode == MODE_POINT) {
            if (needRef) { refAz = az; refPitch = pitch; needRef = false; }
            /* The sensitivity slider used to do nothing in this mode - the raw
               angle went straight to the view. Scale around the 13 default so
               13 is exactly the old 1:1 feel, and smooth the sensor jitter. */
            float k = sens / 13f;
            float ty = wrap(az - refAz) * k;                  // point right = positive
            float tp = clampPitch(-(pitch - refPitch) * k);   // point up = positive
            if (!haveSmooth) { smYaw = ty; smPitch = tp; haveSmooth = true; }
            else {
                smYaw += wrap(ty - smYaw) * 0.35f;
                smPitch += (tp - smPitch) * 0.35f;
            }
            curYaw = smYaw;
            curPitch = clampPitch(smPitch);
            haveAim = true;
            return;
        }
        if (!haveLast) { lastAz = az; lastPitch = pitch; haveLast = true; return; }
        float da = wrap(az - lastAz);
        float dp = pitch - lastPitch;
        lastAz = az; lastPitch = pitch;
        if (Math.abs(da) > 30 || Math.abs(dp) > 30) return; // glitch spike
        accX += da * sens;
        accY += dp * sens;
    }

    @Override public void onAccuracyChanged(Sensor s, int a) {}
}
