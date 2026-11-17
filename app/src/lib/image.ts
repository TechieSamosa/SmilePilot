import dicomParser from "dicom-parser";
import type { Finding } from "../types";
import { labelInfo } from "./labels";

export async function canvasToBlob(c: HTMLCanvasElement, type = "image/jpeg", q = 0.92): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Image encoding failed"))), type, q));
}

async function bitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Decode an uncompressed DICOM file (most intraoral sensors / OPG machines export this) into a JPEG. */
async function dicomToJpeg(file: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ds = dicomParser.parseDicom(bytes);
  const rows = ds.uint16("x00280010") ?? 0;
  const cols = ds.uint16("x00280011") ?? 0;
  const bits = ds.uint16("x00280100") ?? 8;
  const signed = ds.uint16("x00280103") === 1;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").trim();
  const spp = ds.uint16("x00280002") ?? 1;
  const px = ds.elements.x7fe00010;
  if (!rows || !cols || !px) throw new Error("This DICOM file has no readable image.");
  if (px.encapsulatedPixelData) throw new Error("Compressed DICOM is not supported. Please export the X-ray as JPEG/PNG from the X-ray software.");
  const n = rows * cols;
  const values = new Float32Array(n);
  const dv = new DataView(bytes.buffer, bytes.byteOffset + px.dataOffset, px.length);
  if (spp === 3) {
    const c = document.createElement("canvas");
    c.width = cols;
    c.height = rows;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(cols, rows);
    for (let i = 0; i < n; i++) {
      img.data[i * 4] = dv.getUint8(i * 3);
      img.data[i * 4 + 1] = dv.getUint8(i * 3 + 1);
      img.data[i * 4 + 2] = dv.getUint8(i * 3 + 2);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvasToBlob(c);
  }
  for (let i = 0; i < n; i++) {
    values[i] = bits > 8 ? (signed ? dv.getInt16(i * 2, true) : dv.getUint16(i * 2, true)) : dv.getUint8(i);
  }
  const slope = parseFloat(ds.string("x00281053") ?? "1") || 1;
  const intercept = parseFloat(ds.string("x00281052") ?? "0") || 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i] * slope + intercept;
    values[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // Prefer the stored window if present
  const wc = parseFloat((ds.string("x00281050") ?? "").split("\\")[0]);
  const ww = parseFloat((ds.string("x00281051") ?? "").split("\\")[0]);
  if (isFinite(wc) && isFinite(ww) && ww > 1) {
    lo = wc - ww / 2;
    hi = wc + ww / 2;
  }
  const range = hi - lo || 1;
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  const invert = photometric === "MONOCHROME1";
  for (let i = 0; i < n; i++) {
    let g = Math.max(0, Math.min(255, ((values[i] - lo) / range) * 255));
    if (invert) g = 255 - g;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvasToBlob(c);
}

function isDicom(file: File | Blob, head: Uint8Array): boolean {
  const name = (file as File).name?.toLowerCase() ?? "";
  if (name.endsWith(".dcm") || name.endsWith(".dicom") || file.type === "application/dicom") return true;
  return head.length > 132 && String.fromCharCode(head[128], head[129], head[130], head[131]) === "DICM";
}

export interface ImportedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Normalise any picked file (JPEG/PNG/HEIC-as-JPEG/DICOM) into a JPEG + thumbnail. Caps size at 4096px. */
export async function importImage(file: File | Blob): Promise<ImportedImage> {
  const head = new Uint8Array(await file.slice(0, 140).arrayBuffer());
  let src: Blob = isDicom(file, head) ? await dicomToJpeg(file) : file;
  let bmp: ImageBitmap;
  try {
    bmp = await bitmap(src);
  } catch {
    throw new Error("This file could not be opened as an image. Use JPEG, PNG or DICOM.");
  }
  const max = 4096;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  const blob = s < 1 || src.type !== "image/jpeg" ? await canvasToBlob(c) : src;
  const ts = Math.min(1, 320 / Math.max(w, h));
  const t = document.createElement("canvas");
  t.width = Math.round(w * ts);
  t.height = Math.round(h * ts);
  t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
  const thumb = await canvasToBlob(t, "image/jpeg", 0.8);
  bmp.close();
  return { blob, thumb, width: w, height: h };
}

/** Rotate an image by 90° steps; returns a new import result. */
export async function rotateImage(blob: Blob, quarterTurns: number): Promise<ImportedImage> {
  const bmp = await bitmap(blob);
  const q = ((quarterTurns % 4) + 4) % 4;
  const c = document.createElement("canvas");
  c.width = q % 2 ? bmp.height : bmp.width;
  c.height = q % 2 ? bmp.width : bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((q * Math.PI) / 2);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  return importImage(await canvasToBlob(c));
}

/** Render the radiograph with finding boxes burned in (for PDFs and sharing). */
export async function renderAnnotated(blob: Blob, findings: Finding[], maxSide = 1600): Promise<HTMLCanvasElement> {
  const bmp = await bitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const lw = Math.max(2, c.width / 400);
  ctx.font = `600 ${Math.max(12, c.width / 70)}px sans-serif`;
  for (const f of findings) {
    if (!f.box) continue;
    const info = labelInfo(f.label);
    const x = f.box.x * s;
    const y = f.box.y * s;
    ctx.strokeStyle = info.color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, f.box.w * s, f.box.h * s);
    const text = `${info.name}${f.tooth ? ` #${f.tooth}` : ""}`;
    const tw = ctx.measureText(text).width + 8;
    const th = parseInt(ctx.font.split(" ")[1]!) + 6;
    const ty = y - th < 0 ? y + f.box.h * s : y - th;
    ctx.fillStyle = info.color;
    ctx.fillRect(x, ty, tw, th);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + 4, ty + th - 5);
  }
  return c;
}

export function blobUrlCache() {
  const urls = new Map<string, string>();
  return {
    get(id: string, blob: Blob) {
      let u = urls.get(id);
      if (!u) urls.set(id, (u = URL.createObjectURL(blob)));
      return u;
    },
    clear() {
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
    },
  };
}
