package com.subasmk.nuketown;

import android.app.Activity;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.view.Display;

import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.UnavailableException;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * AIR MOUSE: whole-phone translation aim on ARCore.
 *
 * The camera pose is the only input - no sensor fusion with the gyro, and no
 * fallback that would fake motion from rotation. Camera frames are processed
 * on the phone by Google Play Services for AR; nothing is uploaded anywhere.
 *
 * Lifecycle, owned by MainActivity: start() opens the camera (only after the
 * user picked AIR MOUSE and granted the OS camera permission), stop() pauses
 * and closes the session so the camera is fully released. A tiny GLSurfaceView
 * supplies the GL context ARCore needs; no preview is drawn.
 */
public class AirMouse implements GLSurfaceView.Renderer {
    public interface Listener {
        /** Truthful state for the UI: exactly what the tracker is doing. */
        void onState(String text, boolean tracking);
    }

    /* Aim gain: degrees of view per metre of phone movement at sensitivity 13
       (the sensitivity slider scales it linearly, like POINT). ~10 cm of hand
       movement turns the view about 22 degrees at the default. */
    private static final float DEG_PER_M = 220f;
    /* Per-frame sanity limits: bigger jumps are tracking glitches, not hands. */
    private static final float MAX_STEP_M = 0.15f;
    private static final float MAX_STEP_DEG = 8f;

    private final Activity activity;
    private final Listener listener;

    private Session session;
    private int textureId = -1;
    private int viewW = 1, viewH = 1;
    private boolean haveLast;
    private float lastX, lastY;
    private String lastText;

    public AirMouse(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
    }

    /** Opens the camera. Call only with CAMERA permission already granted. */
    public synchronized void start() {
        if (session != null) return;
        try {
            session = new Session(activity);
            Config cfg = new Config(session);
            cfg.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
            session.configure(cfg);
            session.resume();
            haveLast = false;
            notify("AIR MOUSE: camera on - starting tracking...", false);
        } catch (UnavailableException e) {
            session = null;
            notify("AIR MOUSE unavailable: Google Play Services for AR is missing or too old.", false);
        } catch (CameraNotAvailableException e) {
            if (session != null) { session.close(); session = null; }
            notify("AIR MOUSE: camera is busy - close other camera apps and re-tap the mode.", false);
        } catch (SecurityException e) {
            if (session != null) { session.close(); session = null; }
            notify("AIR MOUSE: camera permission is off.", false);
        }
    }

    /** Releases the camera completely. */
    public synchronized void stop() {
        if (session == null) return;
        try { session.pause(); } catch (Exception ignored) {}
        session.close();
        session = null;
        haveLast = false;
        notify("AIR MOUSE: camera off.", false);
    }

    /** RE-CENTRE: the phone's current position becomes the aim reference. */
    public void recenter() { haveLast = false; }

    @Override public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        textureId = t[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_NEAREST);
    }

    @Override public void onSurfaceChanged(GL10 gl, int w, int h) {
        viewW = w; viewH = h;
        GLES20.glViewport(0, 0, w, h);
    }

    @Override public void onDrawFrame(GL10 gl) {
        Session s;
        synchronized (this) { s = session; }
        if (s == null || textureId < 0) return;
        try {
            s.setCameraTextureName(textureId);
            Display d = activity.getWindowManager().getDefaultDisplay();
            s.setDisplayGeometry(d.getRotation(), viewW, viewH);
            Frame frame = s.update();
            Camera cam = frame.getCamera();
            if (cam.getTrackingState() != TrackingState.TRACKING) {
                haveLast = false;
                notify("AIR MOUSE: tracking lost - needs decent light and visible surfaces. Move slowly.", false);
                return;
            }
            float[] t = cam.getPose().getTranslation();
            float x = t[0], y = t[1];           // metres: right, up
            if (!haveLast) { lastX = x; lastY = y; haveLast = true;
                notify("AIR MOUSE: tracking - move the phone to aim. RE-CENTRE resets.", true);
                return; }
            float dx = x - lastX, dy = y - lastY;
            lastX = x; lastY = y;
            if (Math.abs(dx) > MAX_STEP_M || Math.abs(dy) > MAX_STEP_M) return; // glitch frame
            float sens = 13f;
            ControllerService c = ControllerService.inst;
            if (c != null) sens = c.sensNow();
            float k = DEG_PER_M * (sens / 13f);
            /* Same sign convention as TILT: hand right = look right, hand up =
               look up. Clamped per frame so a bad frame never whips the view. */
            float lookX = clamp(dx * k, MAX_STEP_DEG);
            float lookY = clamp(-dy * k, MAX_STEP_DEG);
            if (lookX != 0 || lookY != 0) {
                ControllerService svc = ControllerService.inst;
                if (svc != null) svc.addLook(lookX, lookY);
            }
        } catch (CameraNotAvailableException e) {
            notify("AIR MOUSE: camera lost - close other camera apps.", false);
        } catch (Exception ignored) {
            /* A dropped frame must never kill the session or the game aim. */
        }
    }

    private static float clamp(float v, float max) { return Math.max(-max, Math.min(max, v)); }

    /* GL callbacks fire ~30x/s; only real state changes reach the UI. */
    private void notify(String text, boolean tracking) {
        if (text.equals(lastText)) return;
        lastText = text;
        listener.onState(text, tracking);
    }
}
