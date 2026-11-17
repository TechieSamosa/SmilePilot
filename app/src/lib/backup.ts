import JSZip from "jszip";
import { db, setSetting } from "../db";
import type { XrayImage } from "../types";

const TABLES = ["patients", "visits", "findings", "appointments", "feedback", "chat", "preferences", "settings"] as const;

/** Full backup: all records + all images, as one .zip the dentist keeps in Drive / WhatsApp / email. */
export async function createBackup(includeApiKey = false, onProgress?: (m: string) => void): Promise<Blob> {
  const zip = new JSZip();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    let rows = await (db[t] as any).toArray();
    if (t === "settings" && !includeApiKey) rows = rows.filter((r: { key: string }) => r.key !== "anthropicKey" && r.key !== "pinHash");
    data[t] = rows;
  }
  const images = await db.images.toArray();
  data.images = images.map(({ blob: _b, thumb: _t, ...rest }) => rest);
  zip.file("data.json", JSON.stringify({ app: "DentalOS", version: 1, createdAt: Date.now(), data }));
  let i = 0;
  for (const img of images) {
    onProgress?.(`Packing images ${++i}/${images.length}`);
    zip.file(`images/${img.id}.jpg`, img.blob);
    zip.file(`thumbs/${img.id}.jpg`, img.thumb);
  }
  onProgress?.("Compressing…");
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } });
}

export async function restoreBackup(file: Blob, mode: "merge" | "replace", onProgress?: (m: string) => void): Promise<{ patients: number; images: number }> {
  const zip = await JSZip.loadAsync(file);
  const json = await zip.file("data.json")?.async("string");
  if (!json) throw new Error("This is not a DentalOS backup file.");
  const parsed = JSON.parse(json);
  if (parsed.app !== "DentalOS") throw new Error("This is not a DentalOS backup file.");
  const data = parsed.data as Record<string, any[]>;
  const imgs: XrayImage[] = [];
  let i = 0;
  for (const meta of data.images ?? []) {
    onProgress?.(`Restoring images ${++i}/${data.images.length}`);
    const blob = await zip.file(`images/${meta.id}.jpg`)?.async("blob");
    const thumb = await zip.file(`thumbs/${meta.id}.jpg`)?.async("blob");
    if (!blob) continue;
    imgs.push({ ...meta, blob: new Blob([blob], { type: "image/jpeg" }), thumb: new Blob([thumb ?? blob], { type: "image/jpeg" }) });
  }
  await db.transaction("rw", [...TABLES.map((t) => db[t]), db.images], async () => {
    if (mode === "replace") {
      for (const t of TABLES) if (t !== "settings") await db[t].clear();
      await db.images.clear();
    }
    for (const t of TABLES) if (data[t]?.length) await (db[t] as any).bulkPut(data[t]);
    if (imgs.length) await db.images.bulkPut(imgs);
  });
  await setSetting("lastRestoreAt", Date.now());
  return { patients: data.patients?.length ?? 0, images: imgs.length };
}

export async function storageEstimate(): Promise<{ usedMB: number; quotaMB: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usedMB: Math.round((e.usage ?? 0) / 1048576), quotaMB: Math.round((e.quota ?? 0) / 1048576) };
  } catch {
    return null;
  }
}
