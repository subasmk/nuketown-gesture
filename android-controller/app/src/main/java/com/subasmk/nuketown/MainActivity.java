package com.subasmk.nuketown;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.opengl.GLSurfaceView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.exceptions.UnavailableException;

/**
 * Nuketown phone controller (native).
 *   Volume UP   = fire (hold = keep firing)
 *   Volume DOWN = jump
 *   Phone pointing/tilt = aim (same /gyro WebSocket and messages as the web page)
 *   Guns switch on the laptop keyboard (1/2/3), not here.
 *
 * Two screens in one activity: SETUP while disconnected, and a control pad
 * (fire / jump / re-centre / sensitivity) once connected.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "nuketown";

    // palette
    private static final int BG      = 0xFF0B0F14;
    private static final int CARD    = 0xFF161C24;
    private static final int CARD2   = 0xFF1B232E;
    private static final int STROKE  = 0xFF2A323D;
    private static final int TXT     = 0xFFEDF2F7;
    private static final int DIM     = 0xFF8B97A5;
    private static final int ACCENT  = 0xFF5B8DEF;
    private static final int FIRE_C  = 0xFFE14D4D;
    private static final int JUMP_C  = 0xFF3D8BFD;


    private final Handler ui = new Handler(Looper.getMainLooper());

    private EditText urlBox;
    private EditText codeBox;
    private TextView status;
    private Button connectBtn, centreBtn, modeBtn;
    private final SeekBar[] sensBars = new SeekBar[2];
    private final TextView[] sensLabels = new TextView[2];
    private LinearLayout setupPanel, controlPanel, root;
    private float sens = 13f;
    private int mode = ControllerService.MODE_POINT;
    private boolean fireOn, jumpOn;
    /* AIR MOUSE: created only when the user picks the mode; camera opens only
       after the OS permission grant, and closes on mode switch / background. */
    private AirMouse air;
    private GLSurfaceView airView;
    private TextView airStatus;
    private static final int REQ_CAMERA = 42;

    private final Runnable refresh = () -> {
        boolean live = ControllerService.inst != null && ControllerService.connected && ControllerService.paired;
        status.setText(ControllerService.status);
        connectBtn.setText(ControllerService.inst != null ? "DISCONNECT" : "CONNECT");
        setupPanel.setVisibility(live ? View.GONE : View.VISIBLE);
        controlPanel.setVisibility(live ? View.VISIBLE : View.GONE);
    };

    private int dp(int d) { return (int) (d * getResources().getDisplayMetrics().density + 0.5f); }

    private GradientDrawable round(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private GradientDrawable cardBg(int strokeColor, int strokeDp) {
        GradientDrawable g = round(CARD, 16);
        g.setStroke(dp(strokeDp), strokeColor);
        return g;
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        sens = sp.getFloat("sens", 18f);
        mode = sp.getInt("mode", ControllerService.MODE_POINT);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(28), dp(20), dp(20));
        scroll.addView(root);

        // header
        TextView title = text("NUKETOWN", 30, true, TXT);
        title.setLetterSpacing(0.08f);
        root.addView(title);
        root.addView(text("PHONE CONTROLLER", 13, true, ACCENT));

        status = text("Not connected.", 14, false, DIM);
        status.setPadding(0, dp(14), 0, dp(6));
        root.addView(status);

        airStatus = text("", 13, false, ACCENT);
        airStatus.setVisibility(View.GONE);
        root.addView(airStatus);

        setupPanel = new LinearLayout(this);
        setupPanel.setOrientation(LinearLayout.VERTICAL);
        root.addView(setupPanel);

        controlPanel = new LinearLayout(this);
        controlPanel.setOrientation(LinearLayout.VERTICAL);
        controlPanel.setVisibility(View.GONE);
        root.addView(controlPanel);

        buildSetupPanel(sp);
        buildControlPanel();
        if (mode == ControllerService.MODE_AIR) {
            /* Saved from last session: the camera still needs a fresh foreground
               start, so show the state honestly instead of a dead mode. */
            airStatus.setVisibility(View.VISIBLE);
            airStatus.setText("AIR MOUSE selected - camera starts when you tap AIM MODE.");
        }

        setContentView(scroll);
    }

    /* ---------------- SETUP screen ---------------- */

    private void buildSetupPanel(SharedPreferences sp) {
        // connect card
        LinearLayout connectCard = section();
        connectCard.addView(sectionTitle("CONNECT TO THE GAME"));
        connectCard.addView(text("Type the game address. Online: nuketown-gesture.onrender.com - or same Wi-Fi as the laptop: 192.168.x.x:8080.", 13, false, DIM));

        urlBox = new EditText(this);
        urlBox.setSingleLine(true);
        urlBox.setHint("nuketown-gesture.onrender.com");
        urlBox.setHintTextColor(DIM);
        urlBox.setTextColor(TXT);
        urlBox.setTextSize(16);
        urlBox.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        urlBox.setBackground(round(CARD2, 12));
        urlBox.setPadding(dp(14), 0, dp(14), 0);
        LinearLayout.LayoutParams ul = new LinearLayout.LayoutParams(-1, dp(52));
        ul.setMargins(0, dp(10), 0, 0);
        urlBox.setLayoutParams(ul);
        urlBox.setText(sp.getString("url", ""));
        connectCard.addView(urlBox);

        connectCard.addView(text("Phone code shown in the game (4 letters, next to CONNECT PHONE). Two laptops = two codes, so phones never cross-control.", 13, false, DIM));
        codeBox = new EditText(this);
        codeBox.setSingleLine(true);
        codeBox.setHint("CODE (e.g. K7QZ)");
        codeBox.setHintTextColor(DIM);
        codeBox.setTextColor(TXT);
        codeBox.setTextSize(16);
        codeBox.setAllCaps(true);
        codeBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        codeBox.setBackground(round(CARD2, 12));
        codeBox.setPadding(dp(14), 0, dp(14), 0);
        LinearLayout.LayoutParams xl = new LinearLayout.LayoutParams(-1, dp(52));
        xl.setMargins(0, dp(10), 0, 0);
        codeBox.setLayoutParams(xl);
        codeBox.setText(sp.getString("code", ""));
        connectCard.addView(codeBox);

        connectBtn = new Button(this);
        connectBtn.setText("CONNECT");
        connectBtn.setTextSize(17);
        connectBtn.setTextColor(Color.WHITE);
        connectBtn.setTypeface(Typeface.DEFAULT_BOLD);
        connectBtn.setAllCaps(false);
        connectBtn.setBackground(round(ACCENT, 12));
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(-1, dp(54));
        cl.setMargins(0, dp(14), 0, 0);
        connectBtn.setLayoutParams(cl);
        connectBtn.setOnClickListener(v -> toggleConnect());
        connectCard.addView(connectBtn);
        setupPanel.addView(connectCard);

        // aim card
        LinearLayout aimCard = section();
        aimCard.addView(sectionTitle("AIM"));

        modeBtn = flatButton("", ACCENT);
        modeBtn.setOnClickListener(v -> cycleMode());
        aimCard.addView(modeBtn);
        modeText();

        centreBtn = flatButton("RE-CENTRE  (hold the phone at the screen, tap)", TXT);
        centreBtn.setOnClickListener(v -> {
            ControllerService c = ControllerService.inst;
            if (c != null) c.centre();
            if (air != null) air.recenter();
            say("Re-centred. This direction is now straight ahead.");
        });
        aimCard.addView(centreBtn);

        addSensRow(aimCard, 0);
        setupPanel.addView(aimCard);

        // guide card
        LinearLayout guideCard = section();
        guideCard.addView(sectionTitle("HOW IT PLAYS"));
        guideCard.addView(text(
            "VOLUME UP = FIRE (hold to keep firing)\n" +
            "VOLUME DOWN = JUMP\n" +
            "Switch guns on the laptop keyboard: 1/2/3.\n\n" +
            "POINT aim: where the phone points is where you look, like a laser pointer. Hold it upright, back camera at the laptop screen, tap RE-CENTRE. It drifts slowly, so tap RE-CENTRE whenever it wanders.\n" +
            "TILT aim: turning the phone moves the view (old behaviour).\n" +
            "AIR MOUSE aim (experimental): slide the whole phone through the air to move the view - needs decent light. Uses the camera with Google Play Services for AR; video is processed on the phone and never uploaded. The camera turns on ONLY in this mode.\n\n" +
            "SCREEN OFF: aim keeps streaming (a notification shows). Android does not deliver the volume buttons with the screen off, so fire/jump need the screen ON. Leave 'Keep screen on' ticked.", 13, false, DIM));
        CheckBox keep = new CheckBox(this);
        keep.setText("Keep screen on (recommended for volume-key fire/jump)");
        keep.setTextColor(TXT);
        keep.setTextSize(14);
        keep.setChecked(sp.getBoolean("keepOn", true));
        keep.setOnCheckedChangeListener((cb, on) -> {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("keepOn", on).apply();
            applyKeepOn(on);
        });
        guideCard.addView(keep);
        setupPanel.addView(guideCard);
        applyKeepOn(keep.isChecked());
    }

    /* ---------------- CONTROL screen (connected: fire / jump / re-centre / sensitivity) ---------------- */

    private void buildControlPanel() {
        TextView head = text("CONNECTED", 15, true, DIM);
        head.setLetterSpacing(0.1f);
        head.setGravity(Gravity.CENTER);
        head.setPadding(0, dp(6), 0, dp(10));
        controlPanel.addView(head);

        // sensitivity lives here now - it adjusts live, mid-round
        LinearLayout sensCard = section();
        sensCard.addView(sectionTitle("AIM SENSITIVITY"));
        addSensRow(sensCard, 1);
        controlPanel.addView(sensCard);

        // big FIRE / JUMP
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(96), 1f);
        lp.setMargins(dp(6), dp(4), dp(6), dp(4));
        row.addView(holdButton("FIRE", FIRE_C, true), lp);
        row.addView(holdButton("JUMP", JUMP_C, false), lp);
        controlPanel.addView(row);

        // re-centre / disconnect
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        Button re = flatButton("RE-CENTRE", TXT);
        re.setOnClickListener(v -> {
            ControllerService c = ControllerService.inst;
            if (c != null) c.centre();
            if (air != null) air.recenter();
            say("Re-centred. This direction is now straight ahead.");
        });
        Button off = flatButton("DISCONNECT", FIRE_C);
        off.setOnClickListener(v -> toggleConnect());
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(0, dp(48), 1f);
        blp.setMargins(dp(6), dp(8), dp(6), 0);
        row2.addView(re, blp);
        row2.addView(off, blp);
        controlPanel.addView(row2);

        TextView hint = text("Vol UP = fire \u00b7 Vol DOWN = jump \u00b7 guns on laptop keys 1/2/3", 12, false, DIM);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(12), 0, 0);
        controlPanel.addView(hint);
    }

    /* One sensitivity value, shown on both screens. which = 0 setup, 1 control. */
    private void addSensRow(LinearLayout card, int which) {
        TextView label = text("", 13, false, DIM);
        card.addView(label);
        SeekBar bar = new SeekBar(this);
        bar.setMax(30);
        bar.setProgress(Math.round(sens) - 4);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int p, boolean u) {
                if (!u) return; // programmatic sync below, not a second save
                sens = p + 4;
                ControllerService c = ControllerService.inst;
                if (c != null) c.setSens(sens);
                syncSens();
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putFloat("sens", sens).apply(); }
        });
        card.addView(bar);
        sensLabels[which] = label;
        sensBars[which] = bar;
        syncSens();
    }

    private void syncSens() {
        for (int i = 0; i < 2; i++) {
            if (sensLabels[i] != null) sensLabels[i].setText("Aim sensitivity: " + (int) sens + "  (higher = turns faster)");
            if (sensBars[i] != null && sensBars[i].getProgress() != Math.round(sens) - 4) sensBars[i].setProgress(Math.round(sens) - 4);
        }
    }

    /* ---------------- shared widgets ---------------- */

    private LinearLayout section() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(cardBg(STROKE, 1));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(8), 0, dp(8));
        card.setLayoutParams(lp);
        return card;
    }

    private TextView sectionTitle(String t) {
        TextView v = text(t, 13, true, DIM);
        v.setLetterSpacing(0.08f);
        v.setPadding(0, 0, 0, dp(6));
        return v;
    }

    private Button flatButton(String label, int tint) {
        Button bt = new Button(this);
        bt.setText(label);
        bt.setTextSize(14);
        bt.setAllCaps(false);
        bt.setTextColor(tint);
        GradientDrawable g = round(CARD2, 12);
        g.setStroke(dp(1), STROKE);
        bt.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(48));
        lp.setMargins(0, dp(6), 0, dp(2));
        bt.setLayoutParams(lp);
        return bt;
    }

    private TextView text(String t, int sp, boolean bold, int color) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(sp);
        v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setPadding(0, dp(4), 0, dp(4));
        return v;
    }

    private Button holdButton(String label, int color, final boolean isFire) {
        Button bt = new Button(this);
        bt.setText(label);
        bt.setTextSize(22);
        bt.setTypeface(Typeface.DEFAULT_BOLD);
        bt.setTextColor(Color.WHITE);
        bt.setBackground(round(color, 14));
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
        String label = mode == ControllerService.MODE_POINT ? "POINT  ·  tap for TILT"
            : mode == ControllerService.MODE_TILT ? "TILT  ·  tap for AIR MOUSE"
            : "AIR MOUSE (camera)  ·  tap for POINT";
        modeBtn.setText("AIM MODE: " + label);
    }

    /* ---------------- AIR MOUSE (ARCore, camera, optional) ---------------- */

    private void cycleMode() {
        int next = mode == ControllerService.MODE_POINT ? ControllerService.MODE_TILT
            : mode == ControllerService.MODE_TILT ? ControllerService.MODE_AIR
            : ControllerService.MODE_POINT;
        if (next == ControllerService.MODE_AIR) { tryEnableAir(); return; }
        applyMode(next);
    }

    private void applyMode(int m) {
        mode = m;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("mode", m).apply();
        ControllerService c = ControllerService.inst;
        if (c != null) c.setMode(m);
        if (m != ControllerService.MODE_AIR) stopAir();
        airStatus.setVisibility(m == ControllerService.MODE_AIR ? View.VISIBLE : View.GONE);
        modeText();
    }

    private void tryEnableAir() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            say("AIR MOUSE tracks the phone moving through the air with the camera. Android will now ask for camera permission; POINT and TILT never use the camera.");
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            return;
        }
        ensureArCoreAndStart();
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(req, perms, grants);
        if (req != REQ_CAMERA) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) ensureArCoreAndStart();
        else say("Camera permission declined - AIR MOUSE stays off. POINT and TILT still work.");
    }

    private void ensureArCoreAndStart() {
        try {
            switch (ArCoreApk.getInstance().checkAvailability(this)) {
                case SUPPORTED_INSTALLED:
                    startAir();
                    return;
                case SUPPORTED_APK_TOO_OLD:
                case SUPPORTED_NOT_INSTALLED:
                    say("AIR MOUSE needs Google Play Services for AR (free, from the Play Store) - opening the install...");
                    ArCoreApk.getInstance().requestInstall(this, true);
                    return; // onResume after the install re-tries
                case UNKNOWN_CHECKING:
                    say("Checking ARCore support...");
                    ui.postDelayed(() -> { if (mode != ControllerService.MODE_AIR) ensureArCoreAndStart(); }, 300);
                    return;
                default:
                    say("AIR MOUSE: this phone does not support ARCore. POINT and TILT still work.");
            }
        } catch (UnavailableException e) {
            say("AIR MOUSE unavailable: " + e.getMessage() + ". POINT and TILT still work.");
        } catch (Exception e) {
            say("AIR MOUSE could not start: " + e.getMessage());
        }
    }

    private void startAir() {
        applyMode(ControllerService.MODE_AIR);
        if (air == null) air = new AirMouse(this, (txt, tracking) -> ui.post(() -> airStatus.setText(txt)));
        if (airView == null) {
            airView = new GLSurfaceView(this);
            airView.setEGLContextClientVersion(2);
            airView.setPreserveEGLContextOnPause(true);
            airView.setRenderer(air);
            airView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
            /* 1dp: the view only supplies the GL context ARCore requires. No
               camera preview is drawn; the status line says what is happening. */
            root.addView(airView, 0, new LinearLayout.LayoutParams(dp(1), dp(1)));
        }
        airView.onResume();
        air.start();
    }

    private void stopAir() {
        if (airView != null) airView.onPause();
        if (air != null) air.stop();
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
        String code = codeBox.getText().toString().trim().toUpperCase();
        if (!code.matches("[A-Z0-9]{4,8}")) { say("Type the 4-letter phone code the game shows."); return; }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString("url", urlBox.getText().toString().trim())
            .putString("code", code).apply();
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(urlBox.getWindowToken(), 0);
        Intent in = new Intent(this, ControllerService.class).setAction(ControllerService.ACTION_CONNECT)
            .putExtra("host", host).putExtra("port", port).putExtra("tls", tls).putExtra("code", code);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(in); else startService(in);
        connectBtn.setText("DISCONNECT");
        say("Connecting to " + host + ":" + port + " ...");
    }

    @Override protected void onResume() {
        super.onResume();
        ControllerService.statusListener = refresh;
        refresh.run();
        if (mode == ControllerService.MODE_AIR && airView == null
                && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            ensureArCoreAndStart(); // returns from the ARCore install flow, or restarts after backgrounding
        } else if (mode == ControllerService.MODE_AIR && air != null) {
            airView.onResume();
            air.start();
        }
    }

    @Override protected void onPause() {
        super.onPause();
        stopAir(); // camera fully off whenever the app is not on screen
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
