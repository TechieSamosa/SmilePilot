/// <reference lib="webworker" />
// Runs ONNX models off the UI thread so the app stays responsive during analysis.
import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const sessions = new Map<string, ort.InferenceSession>();

type Req =
  | { id: number; type: "load"; key: string; model: ArrayBuffer }
  | { id: number; type: "run"; key: string; data: Float32Array; dims: number[] }
  | { id: number; type: "unload"; key: string };

// ONNX Runtime's helper threads ("em-pthread-*") load this same script; leave them alone.
const isPthread = typeof self.name === "string" && self.name.startsWith("em-pthread");

if (!isPthread) self.onmessage = async (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const old = sessions.get(msg.key);
      if (old) await old.release();
      const s = await ort.InferenceSession.create(new Uint8Array(msg.model), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      sessions.set(msg.key, s);
      self.postMessage({ id: msg.id, ok: true });
    } else if (msg.type === "run") {
      const s = sessions.get(msg.key);
      if (!s) throw new Error(`Model ${msg.key} not loaded`);
      const input = new ort.Tensor("float32", msg.data, msg.dims);
      const t0 = performance.now();
      const out = await s.run({ [s.inputNames[0]]: input });
      const ms = performance.now() - t0;
      const t = out[s.outputNames[0]];
      const data = t.data as Float32Array;
      self.postMessage({ id: msg.id, ok: true, data, dims: t.dims, ms }, [data.buffer]);
    } else if (msg.type === "unload") {
      const s = sessions.get(msg.key);
      if (s) await s.release();
      sessions.delete(msg.key);
      self.postMessage({ id: msg.id, ok: true });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
