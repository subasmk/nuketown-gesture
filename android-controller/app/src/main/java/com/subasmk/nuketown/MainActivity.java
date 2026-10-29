package com.subasmk.nuketown;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Nuketown phone controller (native). Replaces the browser /controller page so
 * the hardware volume keys can be used:
 *   Volume UP   = fire (hold = keep firing)
 *   Volume DOWN = jump
 *   Phone turn/tilt = aim (same /gyro WebSocket and messages as the web page)
 */
public class MainActivity extends Activity implements SensorEventListener {
    private static final String PREFS = "nuketown";
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private EditText urlBox;
    private TextView status;
    private Button connectBtn, centreBtn;
    private SeekBar sensBar;
    private TextView sensLabel;

    private SensorManager sm;
    private Sensor rot;
    private MiniWebSocket ws;

    private boolean haveLast;
    private float lastAz, lastPitch;
    private float accX, accY;
    private float sens = 13f; // game units per degree of phone turn (8.3 is 1:1)
    private boolean fireOn, jumpOn;
    private final float[] R = new float[9], R2 = new float[9], O = new float[3];

    private final Runnable flush = new Runnable() {
        @Override public void run() {
            if (ws != null && ws.isOpen() && (accX != 0 || accY != 0)) {
                final String m = "{\"t\":\"look\",\"dx\":" + Math.round(accX * 10) / 10.0
                    + ",\"dy\":" + Math.round(accY * 10) / 10.0 + "}";
                accX = accY = 0;
                send(m);
            } else if (ws == null || !ws.isOpen()) { accX = accY = 0; }
            ui.postDelayed(this, 40);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        sens = sp.getFloat("sens", 13f);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#101820"));
        root.setPadding(32, 48, 32, 32);

        TextView title = text("NUKETOWN PHONE CONTROLLER", 20, true);
        root.addView(title);
        root.addView(text("Type the link or address the game shows (example: 192.168.43.5:8080). Same hotspot / Wi-Fi as the laptop.", 14, false));

        urlBox = new EditText(this);
        urlBox.setSingleLine(true);
        urlBox.setHint("192.168.x.x:8080");
        urlBox.setHintTextColor(Color.GRAY);
        urlBox.setTextColor(Color.WHITE);
        urlBox.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        urlBox.setText(sp.getString("url", ""));
        root.addView(urlBox);

        connectBtn = new Button(this);
        connectBtn.setText("CONNECT");
        connectBtn.setTextSize(20);
        connectBtn.setOnClickListener(v -> toggleConnect());
        root.addView(connectBtn);

        status = text("Not connected.", 16, false);
        root.addView(status);

        centreBtn = new Button(this);
        centreBtn.setText("RE-CENTRE (hold phone straight at the screen, tap)");
        centreBtn.setOnClickListener(v -> { haveLast = false; accX = accY = 0; say("Re-centred."); });
        root.addView(centreBtn);

        sensLabel = text("", 14, false);
        root.addView(sensLabel);
        sensBar = new SeekBar(this);
        sensBar.setMax(30);
        sensBar.setProgress(Math.round(sens) - 4);
        sensBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean u) { sens = p + 4; sensLabel.setText("Aim sensitivity: " + (int) sens + " (higher = turns faster)"); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putFloat("sens", sens).apply(); }
        });
        sens = Math.round(sens);
        sensLabel.setText("Aim sensitivity: " + (int) sens + " (higher = turns faster)");
        root.addView(sensBar);

        root.addView(text("\nVOLUME UP = FIRE (hold to keep firing)\nVOLUME DOWN = JUMP\nPhone turn / tilt = aim. Hold the phone upright, back camera pointing at the laptop screen.", 16, true));

        // On-screen backups
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, 220, 1f);
        lp.setMargins(8, 24, 8, 8);
        row.addView(holdButton("FIRE", "#c0392b", true), lp);
        row.addView(holdButton("JUMP", "#2e6da4", false), lp);
        root.addView(row);

        setContentView(root);
        sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        rot = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        if (rot == null) rot = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (rot == null) say("This phone has no rotation sensor, so aim cannot work.");
    }

    private TextView text(String t, int sp, boolean bold) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(sp);
        v.setTextColor(Color.WHITE);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setPadding(0, 12, 0, 12);
        return v;
    }

    private Button holdButton(String label, String color, final boolean isFire) {
        Button bt = new Button(this);
        bt.setText(label);
        bt.setTextSize(24);
        bt.setTextColor(Color.WHITE);
        bt.setBackgroundColor(Color.parseColor(color));
        bt.setOnTouchListener((v, e) -> {
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_DOWN) setAction(isFire, true);
            else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) setAction(isFire, false);
            return true;
        });
        return bt;
    }

    private void say(final String s) { ui.post(() -> status.setText(s)); }

    private void send(final String m) {
        final MiniWebSocket w = ws;
        if (w == null) return;
        net.execute(() -> w.sendText(m));
    }

    private void setAction(boolean isFire, boolean on) {
        if (isFire) { if (fireOn == on) return; fireOn = on; send("{\"t\":\"fire\",\"on\":" + on + "}"); }
        else { if (jumpOn == on) return; jumpOn = on; send("{\"t\":\"jump\",\"on\":" + on + "}"); }
    }

    private void toggleConnect() {
        if (ws != null) { disconnect("Disconnected."); return; }
        String raw = urlBox.getText().toString().trim();
        if (raw.isEmpty()) { say("Type the laptop address first."); return; }
        if (!raw.contains("://")) raw = "https://" + raw;
        Uri u;
        try { u = Uri.parse(raw); } catch (Exception e) { say("That address does not look right."); return; }
        String host = u.getHost();
        if (host == null || host.isEmpty()) { say("That address does not look right."); return; }
        boolean tls = !"http".equalsIgnoreCase(u.getScheme());
        int port = u.getPort() > 0 ? u.getPort() : (tls ? 443 : 80);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("url", urlBox.getText().toString().trim()).apply();
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(urlBox.getWindowToken(), 0);
        say("Connecting to " + host + ":" + port + " ...");
        connectBtn.setText("DISCONNECT");
        haveLast = false;
        final MiniWebSocket[] holder = new MiniWebSocket[1];
        holder[0] = new MiniWebSocket(host, port, tls, "/gyro?role=phone", new MiniWebSocket.Listener() {
            @Override public void onOpen() {
                ui.post(() -> { if (ws == holder[0]) say("Connected. Turn/tilt = aim. Vol UP = fire, Vol DOWN = jump. (Tap CONNECT PHONE in the game first.)"); });
            }
            @Override public void onClose(final String why) {
                ui.post(() -> { if (ws == holder[0]) disconnect("Not connected: " + why + ". Check the address and that the game server is running."); });
            }
        });
        ws = holder[0];
        ws.connect();
    }

    private void disconnect(String msg) {
        if (fireOn) setAction(true, false);
        if (jumpOn) setAction(false, false);
        final MiniWebSocket w = ws;
        ws = null;
        if (w != null) net.execute(w::close);
        connectBtn.setText("CONNECT");
        say(msg);
    }

    @Override protected void onResume() {
        super.onResume();
        if (rot != null) sm.registerListener(this, rot, SensorManager.SENSOR_DELAY_GAME);
        ui.post(flush);
    }

    @Override protected void onPause() {
        super.onPause();
        sm.unregisterListener(this);
        ui.removeCallbacks(flush);
        // Never leave a trigger stuck if the app goes to background.
        if (fireOn) setAction(true, false);
        if (jumpOn) setAction(false, false);
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        final MiniWebSocket w = ws;
        ws = null;
        if (w != null) net.execute(w::close);
        net.shutdown();
    }

    @Override public void onSensorChanged(SensorEvent e) {
        SensorManager.getRotationMatrixFromVector(R, e.values);
        // Phone held upright, back camera pointing forward: azimuth = which way it points,
        // pitch = up/down.
        SensorManager.remapCoordinateSystem(R, SensorManager.AXIS_X, SensorManager.AXIS_Z, R2);
        SensorManager.getOrientation(R2, O);
        float az = (float) Math.toDegrees(O[0]);
        float pitch = (float) Math.toDegrees(O[1]);
        if (!haveLast) { lastAz = az; lastPitch = pitch; haveLast = true; return; }
        float da = az - lastAz;
        if (da > 180) da -= 360; else if (da < -180) da += 360;
        float dp = pitch - lastPitch;
        lastAz = az; lastPitch = pitch;
        if (Math.abs(da) > 30 || Math.abs(dp) > 30) return; // glitch spike
        if (ws == null || !ws.isOpen()) return;
        accX += da * sens;   // turn right = positive = game turns right
        accY += dp * sens;   // camera up = pitch decreases = looks up
    }

    @Override public void onAccuracyChanged(Sensor s, int a) {}

    /** Volume keys are taken here before the system volume UI sees them. */
    @Override public boolean dispatchKeyEvent(KeyEvent ev) {
        int code = ev.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) {
            boolean up = code == KeyEvent.KEYCODE_VOLUME_UP;
            if (ev.getAction() == KeyEvent.ACTION_DOWN) { if (ev.getRepeatCount() == 0) setAction(up, true); }
            else if (ev.getAction() == KeyEvent.ACTION_UP) setAction(up, false);
            return true;
        }
        return super.dispatchKeyEvent(ev);
    }
}
