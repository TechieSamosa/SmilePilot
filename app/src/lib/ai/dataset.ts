/**
 * Export dentist-verified annotations as a YOLO training set.
 * This closes the human-in-the-loop cycle: review in the app -> export -> fine-tune
 * with training/train.py -> import the improved model back in Settings.
 */
import JSZip from "jszip";
import { db, getSetting } from "../../db";
import type { Feedback } from "../../types";
import { PATHOLOGY_CLASSES } from "../labels";
import { getThresholds, thresholdFor } from "./calibration";

export interface DatasetSummary {
  images: number;
  boxes: number;
  perClass: Record<string, number>;
}

export async function datasetSummary(): Promise<DatasetSummary> {
  const { items } = await collect();
  const perClass: Record<string, number> = {};
  let boxes = 0;
  for (const it of items)
    for (const l of it.labels) {
      perClass[PATHOLOGY_CLASSES[l.cls]] = (perClass[PATHOLOGY_CLASSES[l.cls]] ?? 0) + 1;
      boxes++;
    }
  return { images: items.length, boxes, perClass };
}

async function collect() {
  const thresholds = await getThresholds();
  const images = await db.images.toArray();
  const items: { id: string; w: number; h: number; labels: { cls: number; cx: number; cy: number; bw: number; bh: number }[] }[] = [];
  for (const img of images) {
    const fs = await db.findings.where("imageId").equals(img.id).toArray();
    const reviewed = fs.filter((f) => f.status !== "pending");
    if (!reviewed.length) continue;
    // Only fully-reviewed images: no visible AI suggestion left unanswered.
    const unanswered = fs.some((f) => f.source === "ai" && f.status === "pending" && f.confidence >= thresholdFor(f.label, thresholds));
    if (unanswered) continue;
    const labels = [];
    for (const f of fs) {
      if (!f.box || f.status === "rejected") continue;
      if (f.source === "ai" && f.status === "pending") continue;
      const cls = (PATHOLOGY_CLASSES as readonly string[]).indexOf(f.label);
      if (cls < 0) continue;
      labels.push({
        cls,
        cx: (f.box.x + f.box.w / 2) / img.width,
        cy: (f.box.y + f.box.h / 2) / img.height,
        bw: f.box.w / img.width,
        bh: f.box.h / img.height,
      });
    }
    items.push({ id: img.id, w: img.width, h: img.height, labels });
  }
  return { items, images };
}

export async function exportDataset(onProgress?: (m: string) => void): Promise<Blob> {
  const { items, images } = await collect();
  if (!items.length) throw new Error("No reviewed X-rays yet. Confirm or reject AI findings on a few X-rays first.");
  const zip = new JSZip();
  const byId = new Map(images.map((i) => [i.id, i]));
  items.forEach((it, idx) => {
    onProgress?.(`Adding X-ray ${idx + 1}/${items.length}`);
    const split = idx % 6 === 5 ? "val" : "train";
    zip.file(`images/${split}/${it.id}.jpg`, byId.get(it.id)!.blob);
    zip.file(
      `labels/${split}/${it.id}.txt`,
      it.labels.map((l) => `${l.cls} ${l.cx.toFixed(6)} ${l.cy.toFixed(6)} ${l.bw.toFixed(6)} ${l.bh.toFixed(6)}`).join("\n") + "\n",
    );
  });
  zip.file(
    "data.yaml",
    `# DentalOS dentist-verified dataset\npath: .\ntrain: images/train\nval: images/val\nnames:\n${PATHOLOGY_CLASSES.map((n, i) => `  ${i}: ${n}`).join("\n")}\n`,
  );
  const fb: Feedback[] = await db.feedback.toArray();
  zip.file("feedback.jsonl", fb.map((f) => JSON.stringify(f)).join("\n"));
  zip.file(
    "README.txt",
    `Exported ${new Date().toISOString()} by DentalOS.\n${items.length} dentist-reviewed radiographs.\n\nFine-tune:\n  python training/train.py pathology --data <unzipped>/data.yaml --weights <previous best.pt> --epochs 30\nThen in the app: Settings -> AI models -> Import model (.onnx + .json).\n\nfeedback.jsonl holds report/chat ratings and dentist edits (preference pairs: aiText vs finalText).\nThresholds learned on device: ${JSON.stringify(await getSetting("thresholds", {}))}\n`,
  );
  onProgress?.("Compressing…");
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
