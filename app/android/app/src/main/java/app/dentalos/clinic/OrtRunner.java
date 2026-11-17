package app.dentalos.clinic;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** All ONNX Runtime usage lives here so the native library is only loaded when the AI is first used. */
final class OrtRunner {

    static final class Output {
        byte[] data;
        long[] shape;
        double ms;
    }

    private final Map<String, OrtSession> sessions = new HashMap<>();
    private OrtEnvironment env;
    String provider = "cpu";

    static int threads() {
        int cores = Runtime.getRuntime().availableProcessors();
        return Math.max(1, Math.min(4, cores));
    }

    private OrtSession.SessionOptions options(boolean xnnpack) throws Exception {
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        o.setIntraOpNumThreads(threads());
        if (xnnpack) {
            Map<String, String> x = new HashMap<>();
            x.put("intra_op_num_threads", String.valueOf(threads()));
            o.addXnnpack(x);
        }
        return o;
    }

    void load(String key, byte[] model) throws Exception {
        if (env == null) env = OrtEnvironment.getEnvironment();
        OrtSession old = sessions.remove(key);
        if (old != null) old.close();
        OrtSession s;
        try {
            s = env.createSession(model, options(true));
            provider = "xnnpack";
        } catch (Exception e) {
            s = env.createSession(model, options(false));
            provider = "cpu";
        }
        sessions.put(key, s);
    }

    Output run(String key, FloatBuffer input, long[] dims) throws Exception {
        OrtSession s = sessions.get(key);
        if (s == null) throw new IllegalStateException("Model " + key + " not loaded");
        String name = s.getInputNames().iterator().next();
        long t0 = System.nanoTime();
        try (OnnxTensor t = OnnxTensor.createTensor(env, input, dims);
             OrtSession.Result res = s.run(Collections.singletonMap(name, t))) {
            Output o = new Output();
            o.ms = (System.nanoTime() - t0) / 1e6;
            OnnxTensor out = (OnnxTensor) res.get(0);
            o.shape = out.getInfo().getShape();
            FloatBuffer ob = out.getFloatBuffer();
            ByteBuffer bb = ByteBuffer.allocate(ob.remaining() * 4).order(ByteOrder.LITTLE_ENDIAN);
            bb.asFloatBuffer().put(ob);
            o.data = bb.array();
            return o;
        }
    }
}
