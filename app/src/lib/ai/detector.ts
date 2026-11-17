import { Capacitor, registerPlugin } from "@capacitor/core";
import { db } from "../../db";
import type { Box, ModelMeta } from "../../types";
import { TEETH_MODEL_FDI } from "../fdi";

export type ModelTask = "pathology" | "teeth";

export interface Detection {
  label: string;
  classId: number;
  confidence: number;
  box: Box; // original image pixels
}

export interface AnalysisResult {
  findings: (Detection & { tooth?: number })[];
  teeth: (Detection & { fdi: number })[];
  ms: number;
  modelVersion: string;
}

// ---------- worker plumbing ----------
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./inference.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "AI worker crashed"));
      pending.clear();
      worker = null;
      loaded.clear();
    };
  }
  return worker;
}

function call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<any> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id }, transfer);
  });
}

// ---------- model loading ----------
const loaded = new Map<ModelTask, ModelMeta>();

const modelUrl = (file: string) => new URL(`models/${file}`, document.baseURI).toString();

export async function bundledMeta(task: ModelTask): Promise<ModelMeta | null> {
  try {
    const r = await fetch(modelUrl(`${task}.json`));
    if (!r.ok) return null;
    return (await r.json()) as ModelMeta;
  } catch {
    return null;
  }
}

// ---------- engines ----------
// Android app: native ONNX Runtime (multi-threaded). Everywhere else: WebAssembly in a worker.
interface NativeOnnxPlugin {
  load(o: { key: string; asset?: string; base64?: string }): Promise<{ provider: string; threads: number }>;
  run(o: { key: string; data: string; dims: number[]; u8?: boolean }): Promise<{ data: string; dims: number[]; ms: number }>;
}
const NativeOnnx = registerPlugin<NativeOnnxPlugin>("NativeOnnx");
const engineOf = new Map<ModelTask, "native" | "wasm">();
let nativeBroken = false;
const canNative = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("NativeOnnx") && !nativeBroken;

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function engineName(task: ModelTask = "pathology"): string {
  return engineOf.get(task) === "native" ? "native (multi-core)" : "WebAssembly";
}

async function runModel(task: ModelTask, data: Float32Array, dims: number[]): Promise<{ data: Float32Array; dims: number[]; ms: number }> {
  if (engineOf.get(task) === "native") {
    // send 8-bit pixels (inputs are k/255) — 4x less data over the bridge
    const u8 = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) u8[i] = Math.round(data[i]! * 255);
    const r = await NativeOnnx.run({ key: task, data: bytesToB64(u8), dims, u8: true });
    return { data: b64ToFloat32(r.data), dims: r.dims, ms: r.ms };
  }
  const res = await call({ type: "run", key: task, data, dims }, [data.buffer]);
  return { data: res.data as Float32Array, dims: res.dims as number[], ms: res.ms as number };
}

export async function loadModel(task: ModelTask, onProgress?: (msg: string) => void): Promise<ModelMeta> {
  const have = loaded.get(task);
  if (have) return have;
  const custom = await db.models.get(task);
  let meta: ModelMeta;
  if (custom) {
    meta = { ...custom.meta, version: custom.meta.version ?? `custom-${new Date(custom.importedAt).toISOString().slice(0, 10)}` };
  } else {
    const m = await bundledMeta(task);
    if (!m) throw new Error(`The ${task} model is missing from this build.`);
    meta = { ...m, version: m.version ?? `${task}-bundled` };
  }
  onProgress?.(task === "pathology" ? "Loading X-ray model…" : "Loading tooth-numbering model…");

  if (canNative()) {
    try {
      await NativeOnnx.load(custom ? { key: task, base64: bytesToB64(new Uint8Array(custom.data)) } : { key: task, asset: `public/models/${task}.onnx` });
      engineOf.set(task, "native");
      loaded.set(task, meta);
      return meta;
    } catch (e) {
      console.warn("Native AI engine unavailable, using WebAssembly", e);
      nativeBroken = true;
    }
  }

  let buf: ArrayBuffer;
  if (custom) buf = custom.data.slice(0);
  else {
    const r = await fetch(modelUrl(`${task}.onnx`));
    if (!r.ok) throw new Error(`Could not download the ${task} model (HTTP ${r.status}). Check the internet connection once; it is cached afterwards.`);
    buf = await r.arrayBuffer();
  }
  onProgress?.("Preparing AI engine…");
  await call({ type: "load", key: task, model: buf }, [buf]);
  engineOf.set(task, "wasm");
  loaded.set(task, meta);
  return meta;
}

export async function resetModel(task: ModelTask): Promise<void> {
  if (loaded.has(task)) {
    loaded.delete(task);
    if (engineOf.get(task) === "wasm") await call({ type: "unload", key: task });
    engineOf.delete(task);
  }
}

// ---------- pre / post processing ----------
interface Prepared {
  data: Float32Array;
  dims: number[];
  scale: number;
  padX: number;
  padY: number;
}

/** Ultralytics-style "rect" letterbox: long side -> imgsz, short side padded to a multiple of 32. */
function preprocess(src: CanvasImageSource, w: number, h: number, imgsz: number): Prepared {
  const scale = Math.min(imgsz / w, imgsz / h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);
  const W = Math.ceil(nw / 32) * 32;
  const H = Math.ceil(nh / 32) * 32;
  const padX = Math.floor((W - nw) / 2);
  const padY = Math.floor((H - nh) / 2);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, padX, padY, nw, nh);
  const px = ctx.getImageData(0, 0, W, H).data;
  const plane = W * H;
  const data = new Float32Array(3 * plane);
  for (let i = 0, j = 0; i < plane; i++, j += 4) {
    data[i] = px[j] / 255;
    data[i + plane] = px[j + 1] / 255;
    data[i + 2 * plane] = px[j + 2] / 255;
  }
  return { data, dims: [1, 3, H, W], scale, padX, padY };
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

export function intersectionOverArea(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return a.w * a.h > 0 ? inter / (a.w * a.h) : 0;
}

export { iou };

/** Decode YOLOv8 output [1, 4+nc, N] with class-aware NMS. */
function decode(
  out: Float32Array,
  dims: number[],
  classes: string[],
  p: Prepared,
  imgW: number,
  imgH: number,
  minConf: number,
  iouThr = 0.5,
): Detection[] {
  const nc = dims[1] - 4;
  const n = dims[2];
  const cand: Detection[] = [];
  for (let i = 0; i < n; i++) {
    let best = 0;
    let cls = -1;
    for (let c = 0; c < nc; c++) {
      const s = out[(4 + c) * n + i];
      if (s > best) {
        best = s;
        cls = c;
      }
    }
    if (best < minConf) continue;
    const cx = out[i];
    const cy = out[n + i];
    const w = out[2 * n + i];
    const h = out[3 * n + i];
    let x1 = (cx - w / 2 - p.padX) / p.scale;
    let y1 = (cy - h / 2 - p.padY) / p.scale;
    let x2 = (cx + w / 2 - p.padX) / p.scale;
    let y2 = (cy + h / 2 - p.padY) / p.scale;
    x1 = Math.max(0, Math.min(imgW, x1));
    y1 = Math.max(0, Math.min(imgH, y1));
    x2 = Math.max(0, Math.min(imgW, x2));
    y2 = Math.max(0, Math.min(imgH, y2));
    if (x2 - x1 < 2 || y2 - y1 < 2) continue;
    cand.push({ label: classes[cls] ?? `class_${cls}`, classId: cls, confidence: best, box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } });
  }
  cand.sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  for (const d of cand) {
    if (keep.some((k) => k.classId === d.classId && iou(k.box, d.box) > iouThr)) continue;
    keep.push(d);
    if (keep.length >= 300) break;
  }
  return keep;
}

async function detect(task: ModelTask, img: CanvasImageSource, w: number, h: number, minConf: number) {
  const meta = await loadModel(task);
  const p = preprocess(img, w, h, meta.imgsz);
  const res = await runModel(task, p.data, p.dims);
  const dets = decode(res.data, res.dims, meta.classes, p, w, h, minConf, task === "teeth" ? 0.6 : 0.5);
  return { dets, ms: res.ms, meta };
}

/** Assign each finding to the tooth it overlaps most. */
function assignTeeth(findings: Detection[], teeth: (Detection & { fdi: number })[]) {
  return findings.map((f) => {
    let best = 0;
    let tooth: number | undefined;
    for (const t of teeth) {
      const o = intersectionOverArea(f.box, t.box);
      if (o > best) {
        best = o;
        tooth = t.fdi;
      }
    }
    return { ...f, tooth: best >= 0.2 ? tooth : undefined };
  });
}

export async function loadImageBitmap(blob: Blob): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(blob);
      return { img: bmp, w: bmp.width, h: bmp.height };
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const el = new Image();
    el.src = url;
    await el.decode();
    return { img: el, w: el.naturalWidth, h: el.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Full analysis: pathology + tooth numbering.
 * minConf is deliberately low (0.10) so dentist reviews can calibrate thresholds;
 * the UI hides detections below each class's (learned) threshold.
 */
export async function analyzeImage(
  blob: Blob,
  opts: { numberTeeth: boolean; onProgress?: (msg: string) => void },
): Promise<AnalysisResult> {
  const { img, w, h } = await loadImageBitmap(blob);
  opts.onProgress?.("Loading X-ray model…");
  await loadModel("pathology", opts.onProgress);
  opts.onProgress?.("Analysing radiograph…");
  const path = await detect("pathology", img, w, h, 0.1);
  let teeth: (Detection & { fdi: number })[] = [];
  let ms = path.ms;
  if (opts.numberTeeth) {
    try {
      opts.onProgress?.("Numbering teeth…");
      await loadModel("teeth", opts.onProgress);
      const t = await detect("teeth", img, w, h, 0.35);
      ms += t.ms;
      // keep the most confident box per tooth number
      const byFdi = new Map<number, Detection & { fdi: number }>();
      for (const d of t.dets) {
        const fdi = TEETH_MODEL_FDI[d.classId] ?? Number(d.label);
        const prev = byFdi.get(fdi);
        if (!prev || prev.confidence < d.confidence) byFdi.set(fdi, { ...d, fdi });
      }
      teeth = [...byFdi.values()];
    } catch (e) {
      console.warn("Tooth numbering unavailable", e);
    }
  }
  if ("close" in img && typeof (img as ImageBitmap).close === "function") (img as ImageBitmap).close();
  return {
    findings: assignTeeth(path.dets, teeth),
    teeth,
    ms,
    modelVersion: path.meta.version ?? "pathology",
  };
}

/** Download both models now so analysis works offline later. */
export async function prefetchModels(): Promise<void> {
  await Promise.all(
    (["pathology", "teeth"] as const).flatMap((t) => [fetch(modelUrl(`${t}.onnx`)), fetch(modelUrl(`${t}.json`))]),
  );
}
