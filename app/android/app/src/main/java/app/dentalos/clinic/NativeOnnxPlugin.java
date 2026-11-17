package app.dentalos.clinic;

import android.content.SharedPreferences;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Runs the X-ray models with ONNX Runtime for Android (multi-threaded native CPU, XNNPACK when
 * available). Android WebView cannot run multi-threaded WebAssembly, so this is many times faster.
 * Pre/post-processing stays in TypeScript (identical on iPhone).
 *
 * Safety: ONNX Runtime types live in OrtRunner, so nothing native loads until the AI is used, and a
 * crash-loop guard switches the app to its WebAssembly engine if a phone ever crashes while loading it.
 */
@CapacitorPlugin(name = "NativeOnnx")
public class NativeOnnxPlugin extends Plugin {

    private static final String PREFS = "dentalos_native_ai";
    private static final String LOADING = "loading";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private OrtRunner runner;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private byte[] readAsset(String path) throws Exception {
        try (InputStream in = getContext().getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        final String key = call.getString("key");
        final String asset = call.getString("asset");
        final String b64 = call.getString("base64");
        if (prefs().getBoolean(LOADING, false)) {
            call.reject("Native AI disabled on this phone after a previous failure; using the built-in engine.");
            return;
        }
        executor.execute(() -> {
            try {
                byte[] model = asset != null ? readAsset(asset) : Base64.decode(b64, Base64.DEFAULT);
                prefs().edit().putBoolean(LOADING, true).commit(); // survives a native crash
                if (runner == null) runner = new OrtRunner();
                runner.load(key, model);
                prefs().edit().putBoolean(LOADING, false).commit();
                JSObject r = new JSObject();
                r.put("provider", runner.provider);
                r.put("threads", OrtRunner.threads());
                call.resolve(r);
            } catch (Throwable e) {
                prefs().edit().putBoolean(LOADING, false).commit();
                call.reject("Could not load model: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void run(PluginCall call) {
        final String key = call.getString("key");
        final String data = call.getString("data");
        final boolean u8 = Boolean.TRUE.equals(call.getBoolean("u8", false));
        final JSArray dimsArr = call.getArray("dims");
        executor.execute(() -> {
            try {
                if (runner == null) throw new IllegalStateException("AI not loaded");
                long[] dims = new long[dimsArr.length()];
                for (int i = 0; i < dims.length; i++) dims[i] = dimsArr.getLong(i);
                byte[] raw = Base64.decode(data, Base64.DEFAULT);
                FloatBuffer fb;
                if (u8) {
                    // 8-bit pixels (4x smaller over the bridge) -> float 0..1
                    fb = FloatBuffer.allocate(raw.length);
                    for (byte b : raw) fb.put((b & 0xFF) / 255f);
                    fb.rewind();
                } else {
                    fb = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer();
                }
                OrtRunner.Output o = runner.run(key, fb, dims);
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(o.data, Base64.NO_WRAP));
                JSArray sh = new JSArray();
                for (long d : o.shape) sh.put(d);
                r.put("dims", sh);
                r.put("ms", o.ms);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Inference failed: " + e.getMessage());
            }
        });
    }
}
