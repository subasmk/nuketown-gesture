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
    /* Standing still must be still: pose noise and slow ARCore drift are
       sub-mm per frame, so tiny accumulated movement never reaches the view.
       Real hand movement crosses the deadzone in a frame or two. */
    private static final float DEADZONE_M = 0.002f;

    private final Activity activity;
    private final Listener listener;

    private Session session;
    private int textureId = -1;
    private int viewW = 1, viewH = 1;
    private boolean haveLast;
    private float lastX, lastY, lastZ;
    private float accLat, accVert;
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
    public void recenter() { haveLast = false; accLat = accVert = 0; }

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
            com.google.ar.core.Pose pose = cam.getPose();
            float[] t = pose.getTranslation();
            float x = t[0], y = t[1], z = t[2];
            /* Device-heading axes, not raw world axes: ARCore's world frame is
               fixed at session start, so "right" in world stops matching the
               player's hand once they turn their body. Project the camera's
               right vector onto the ground plane and measure lateral movement
               against THAT, so hand-right is look-right however they stand. */
            float[] q = pose.getRotationQuaternion();
            float rx = 1f - 2f * (q[1] * q[1] + q[2] * q[2]);
            float rz = 2f * (q[0] * q[2] - q[1] * q[3]);
            float rl = (float) Math.sqrt(rx * rx + rz * rz);
            if (rl < 1e-4f) return; // phone pointing straight up/down: no heading
            rx /= rl; rz /= rl;
            if (!haveLast) { lastX = x; lastY = y; lastZ = z; haveLast = true;
                accLat = accVert = 0;
                notify("AIR MOUSE: tracking - move the phone to aim. RE-CENTRE resets.", true);
                return; }
            float dx = x - lastX, dy = y - lastY, dz = z - lastZ;
            lastX = x; lastY = y; lastZ = z;
            if (Math.abs(dx) > MAX_STEP_M || Math.abs(dy) > MAX_STEP_M || Math.abs(dz) > MAX_STEP_M) return; // glitch frame
            /* Rotation about the wrist also moves the camera through space;
               that part is inseparable from a deliberate slide without knowing
               the player's arm, so it is drift the deadzone + RE-CENTRE absorb. */
            accLat += dx * rx + dz * rz;   // metres, device-right positive
            accVert += dy;                 // metres, up positive
            if (Math.abs(accLat) < DEADZONE_M && Math.abs(accVert) < DEADZONE_M) return;
            float sens = 13f;
            ControllerService c = ControllerService.inst;
            if (c != null) sens = c.sensNow();
            float k = DEG_PER_M * (sens / 13f);
            /* Same sign convention as TILT: hand right = look right, hand up =
               look up. Clamped per batch so a bad frame never whips the view. */
            float lookX = clamp(accLat * k, MAX_STEP_DEG);
            float lookY = clamp(-accVert * k, MAX_STEP_DEG);
            accLat = accVert = 0;
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
