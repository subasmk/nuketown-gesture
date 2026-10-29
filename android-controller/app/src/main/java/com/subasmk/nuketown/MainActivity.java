package com.subasmk.nuketown;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.CheckBox;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
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


/**
 * Nuketown phone controller (native). Replaces the browser /controller page so
 * the hardware volume keys can be used:
 *   Volume UP   = fire (hold = keep firing)
 *   Volume DOWN = jump
 *   Phone turn/tilt = aim (same /gyro WebSocket and messages as the web page)
 */
public class MainActivity extends Activity {
    private static final String PREFS = "nuketown";
    private final Handler ui = new Handler(Looper.getMainLooper());

    private EditText urlBox;
    private TextView status;
    private Button connectBtn, centreBtn, modeBtn;
    private SeekBar sensBar;
    private TextView sensLabel;
    private float sens = 13f;
    private int mode = ControllerService.MODE_POINT;
    private boolean fireOn, jumpOn;

    private final Runnable refresh = () -> {
        status.setText(ControllerService.status);
        connectBtn.setText(ControllerService.inst != null ? "DISCONNECT" : "CONNECT");
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        sens = sp.getFloat("sens", 13f);
        mode = sp.getInt("mode", ControllerService.MODE_POINT);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);

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
        centreBtn.setOnClickListener(v -> {
            ControllerService c = ControllerService.inst;
            if (c != null) c.centre();
            say("Re-centred. This direction is now straight ahead.");
        });
        root.addView(centreBtn);

        modeBtn = new Button(this);
        modeBtn.setOnClickListener(v -> {
            mode = mode == ControllerService.MODE_POINT ? ControllerService.MODE_TILT : ControllerService.MODE_POINT;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("mode", mode).apply();
            ControllerService c = ControllerService.inst;
            if (c != null) c.setMode(mode);
            modeText();
        });
        root.addView(modeBtn);
        modeText();

        sensLabel = text("", 14, false);
        root.addView(sensLabel);
        sensBar = new SeekBar(this);
        sensBar.setMax(30);
        sensBar.setProgress(Math.round(sens) - 4);
        sensBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean u) { sens = p + 4; ControllerService c = ControllerService.inst; if (c != null) c.setSens(sens); sensLabel.setText("Aim sensitivity: " + (int) sens + " (higher = turns faster)"); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putFloat("sens", sens).apply(); }
        });
        sens = Math.round(sens);
        sensLabel.setText("Aim sensitivity: " + (int) sens + " (higher = turns faster)");
        root.addView(sensBar);

        root.addView(text("\nVOLUME UP = FIRE (hold to keep firing)\nVOLUME DOWN = JUMP\nAIM MODE POINT: the direction the phone points is where you look (like a laser pointer). Hold the phone upright, back camera towards the laptop screen, tap RE-CENTRE.\nAIM MODE TILT: turning the phone moves the view (old behaviour).\nPOINT drifts slowly over time: tap RE-CENTRE whenever it wanders.\n\nSCREEN OFF: aim and the connection keep working with the screen off (a notification shows while running). But Android does not deliver the VOLUME buttons to apps when the screen is off, so fire/jump from volume keys need the screen ON. Recommended: leave 'Keep screen on' ticked.", 15, true));

        CheckBox keep = new CheckBox(this);
        keep.setText("Keep screen on (recommended for volume-key fire/jump)");
        keep.setTextColor(Color.WHITE);
        keep.setChecked(sp.getBoolean("keepOn", true));
        keep.setOnCheckedChangeListener((cb, on) -> {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("keepOn", on).apply();
            applyKeepOn(on);
        });
        root.addView(keep);
        applyKeepOn(keep.isChecked());

        // On-screen backups
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, 220, 1f);
        lp.setMargins(8, 24, 8, 8);
        row.addView(holdButton("FIRE", "#c0392b", true), lp);
        row.addView(holdButton("JUMP", "#2e6da4", false), lp);
        root.addView(row);

        setContentView(root);
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

    private void modeText() {
        modeBtn.setText("AIM MODE: " + (mode == ControllerService.MODE_POINT ? "POINT (tap to switch to TILT)" : "TILT (tap to switch to POINT)"));
    }

    private void applyKeepOn(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void setAction(boolean isFire, boolean on) {
        if (isFire) { if (fireOn == on) return; fireOn = on; } else { if (jumpOn == on) return; jumpOn = on; }
        ControllerService c = ControllerService.inst;
        if (c != null) c.setAction(isFire, on);
    }

    private void toggleConnect() {
        if (ControllerService.inst != null) {
            startService(new Intent(this, ControllerService.class).setAction(ControllerService.ACTION_STOP));
            ui.postDelayed(refresh, 200);
            return;
        }
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
        Intent in = new Intent(this, ControllerService.class).setAction(ControllerService.ACTION_CONNECT)
            .putExtra("host", host).putExtra("port", port).putExtra("tls", tls);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(in); else startService(in);
        connectBtn.setText("DISCONNECT");
        say("Connecting to " + host + ":" + port + " ...");
    }

    @Override protected void onResume() {
        super.onResume();
        ControllerService.statusListener = refresh;
        refresh.run();
    }

    @Override protected void onPause() {
        super.onPause();
        ControllerService.statusListener = null;
        // Never leave a trigger stuck if the app goes to background / screen off.
        if (fireOn) setAction(true, false);
        if (jumpOn) setAction(false, false);
    }

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
