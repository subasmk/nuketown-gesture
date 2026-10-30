package com.subasmk.nuketown;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Tiny WebSocket client (text frames only) for the laptop's local server.
 * For https the certificate check is skipped on purpose: the laptop uses a
 * throwaway self-signed certificate and this app only talks to the one host
 * the user typed in. Do not point it at anything else.
 */
final class MiniWebSocket {
    interface Listener { void onOpen(); void onMessage(String text); void onClose(String why); }

    private final String host;
    private final int port;
    private final boolean tls;
    private final String path;
    private final Listener listener;
    private volatile Socket socket;
    private volatile OutputStream out;
    private volatile boolean open;
    private final SecureRandom rnd = new SecureRandom();

    MiniWebSocket(String host, int port, boolean tls, String path, Listener l) {
        this.host = host; this.port = port; this.tls = tls; this.path = path; this.listener = l;
    }

    boolean isOpen() { return open; }

    void connect() {
        Thread t = new Thread(this::run, "mini-ws");
        t.setDaemon(true);
        t.start();
    }

    private void run() {
        String why = "closed";
        try {
            Socket s = new Socket();
            s.connect(new InetSocketAddress(host, port), 6000);
            s.setTcpNoDelay(true);
            if (tls) {
                TrustManager[] trustAll = { new X509TrustManager() {
                    public void checkClientTrusted(X509Certificate[] c, String a) {}
                    public void checkServerTrusted(X509Certificate[] c, String a) {}
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                } };
                SSLContext ctx = SSLContext.getInstance("TLS");
                ctx.init(null, trustAll, new SecureRandom());
                SSLSocket ss = (SSLSocket) ctx.getSocketFactory().createSocket(s, host, port, true);
                ss.startHandshake();
                s = ss;
            }
            socket = s;
            InputStream in = s.getInputStream();
            OutputStream o = s.getOutputStream();
            byte[] keyBytes = new byte[16];
            rnd.nextBytes(keyBytes);
            String key = android.util.Base64.encodeToString(keyBytes, android.util.Base64.NO_WRAP);
            String origin = (tls ? "https://" : "http://") + host + ":" + port;
            String req = "GET " + path + " HTTP/1.1\r\nHost: " + host + ":" + port + "\r\n"
                + "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\n"
                + "Sec-WebSocket-Version: 13\r\nOrigin: " + origin + "\r\n\r\n";
            o.write(req.getBytes(StandardCharsets.US_ASCII));
            o.flush();
            // read response headers
            StringBuilder sb = new StringBuilder();
            int c;
            while (!sb.toString().endsWith("\r\n\r\n") && sb.length() < 8192 && (c = in.read()) != -1) sb.append((char) c);
            if (!sb.toString().startsWith("HTTP/1.1 101")) {
                throw new RuntimeException("Server refused: " + sb.toString().split("\r\n")[0]);
            }
            out = o;
            open = true;
            listener.onOpen();
            // drain incoming frames (the game never sends us anything; answer pings, stop on close)
            while (true) {
                int b0 = in.read();
                if (b0 == -1) break;
                int b1 = in.read();
                if (b1 == -1) break;
                long len = b1 & 0x7f;
                if (len == 126) len = (in.read() << 8) | in.read();
                else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | in.read(); }
                if ((b1 & 0x80) != 0) for (int i = 0; i < 4; i++) in.read();
                byte[] payload = new byte[(int) Math.min(len, 65536)];
                int got = 0;
                while (got < payload.length) { int r = in.read(payload, got, payload.length - got); if (r < 0) break; got += r; }
                int op = b0 & 0x0f;
                if (op == 8) break;
                if (op == 9) sendFrame(10, payload);
                if (op == 1) {
                    // Server pair-state messages (e.g. {"t":"paired","on":true}).
                    try { listener.onMessage(new String(payload, 0, got, StandardCharsets.UTF_8)); } catch (Exception ignored) {}
                }
            }
        } catch (Exception e) {
            why = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        } finally {
            boolean was = open;
            open = false;
            close();
            listener.onClose(was ? "Disconnected" : why);
        }
    }

    private synchronized void sendFrame(int opcode, byte[] payload) {
        OutputStream o = out;
        if (o == null) return;
        try {
            byte[] mask = new byte[4];
            rnd.nextBytes(mask);
            int n = payload.length;
            int hdr = n < 126 ? 2 : 4;
            byte[] f = new byte[hdr + 4 + n];
            f[0] = (byte) (0x80 | opcode);
            if (n < 126) f[1] = (byte) (0x80 | n);
            else { f[1] = (byte) (0x80 | 126); f[2] = (byte) (n >> 8); f[3] = (byte) n; }
            System.arraycopy(mask, 0, f, hdr, 4);
            for (int i = 0; i < n; i++) f[hdr + 4 + i] = (byte) (payload[i] ^ mask[i & 3]);
            o.write(f);
            o.flush();
        } catch (Exception e) {
            open = false;
            close();
        }
    }

    /** Sends from any thread; network work is done off the UI thread by the caller. */
    void sendText(String s) {
        if (!open) return;
        sendFrame(1, s.getBytes(StandardCharsets.UTF_8));
    }

    void close() {
        try { Socket s = socket; if (s != null) s.close(); } catch (Exception ignored) {}
    }
}
