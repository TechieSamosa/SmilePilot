/**
 * Human-in-the-loop calibration.
 *
 * Every AI detection (down to 10% confidence) is stored. When the dentist confirms,
 * corrects, rejects, or adds findings, we learn — per class — the display threshold
 * that best matches her judgement (maximising F2, i.e. weighting misses twice as much
 * as false alarms, which is appropriate for screening). Until a class has enough
 * reviews we use the default threshold.
 */
import { db, getSetting, setSetting } from "../../db";
import type { Finding } from "../../types";
import { DEFAULT_THRESHOLD, labelInfo } from "../labels";

export interface ClassStats {
  label: string;
  confirmed: number; // AI right (incl. box/tooth corrections with the same label)
  rejected: number; // AI false positive
  relabeled: number; // AI found something, but wrong label
  missed: number; // dentist added a finding the AI did not report
  precision: number | null;
  recall: number | null;
  threshold: number;
  learned: boolean;
}

const MIN_REVIEWS = 8;
let cache: Record<string, number> | null = null;
let modelDefaults: Record<string, number> | null = null;

/** Per-class defaults shipped with the model (best-F1 confidence on validation films). */
async function getModelDefaults(): Promise<Record<string, number>> {
  if (modelDefaults) return modelDefaults;
  try {
    const custom = await db.models.get("pathology");
    const meta = custom?.meta ?? (await (await fetch(new URL("models/pathology.json", document.baseURI))).json());
    modelDefaults = (meta as { thresholds?: Record<string, number> }).thresholds ?? {};
  } catch {
    modelDefaults = {};
  }
  return modelDefaults;
}

/** The dentist's learned thresholds win over the model defaults. */
export async function getThresholds(): Promise<Record<string, number>> {
  if (!cache) cache = { ...(await getModelDefaults()), ...(await getSetting<Record<string, number>>("thresholds", {})) };
  return cache;
}

export function invalidateThresholds() {
  cache = null;
  modelDefaults = null;
}

export function thresholdFor(label: string, t: Record<string, number>): number {
  return t[label] ?? DEFAULT_THRESHOLD;
}

/** True if this finding should be shown on the image / in reports. */
export function isVisible(f: Finding, t: Record<string, number>, showLow: boolean): boolean {
  if (f.status === "rejected") return false;
  if (f.source !== "ai" || f.status !== "pending") return true;
  return showLow || f.confidence >= thresholdFor(f.label, t);
}

function aiOutcome(f: Finding): "pos" | "neg" | null {
  if (f.source !== "ai") return null;
  if (f.status === "confirmed") return "pos";
  if (f.status === "corrected") return f.originalLabel && f.originalLabel !== f.label ? "neg" : "pos";
  if (f.status === "rejected") return "neg";
  return null;
}

function bestThreshold(pos: number[], neg: number[], missed: number): number {
  let best = DEFAULT_THRESHOLD;
  let bestScore = -1;
  for (let t = 0.1; t <= 0.81; t += 0.025) {
    const tp = pos.filter((c) => c >= t).length;
    const fn = pos.length - tp + missed;
    const fp = neg.filter((c) => c >= t).length;
    const beta2 = 4; // F2
    const denom = (1 + beta2) * tp + beta2 * fn + fp;
    const score = denom ? ((1 + beta2) * tp) / denom : 0;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = t;
    }
  }
  return Math.round(best * 1000) / 1000;
}

export async function computeStats(): Promise<ClassStats[]> {
  const all = await db.findings.toArray();
  const thresholds = await getThresholds();
  const learnedSet = await getSetting<Record<string, number>>("thresholds", {});
  const byLabel = new Map<string, { pos: number[]; neg: number[]; relabeled: number; missed: number; rejected: number }>();
  const get = (l: string) => {
    let v = byLabel.get(l);
    if (!v) byLabel.set(l, (v = { pos: [], neg: [], relabeled: 0, missed: 0, rejected: 0 }));
    return v;
  };
  for (const f of all) {
    const o = aiOutcome(f);
    if (f.source === "ai" && o) {
      const key = f.originalLabel ?? f.label;
      const s = get(key);
      if (o === "pos") s.pos.push(f.confidence);
      else {
        s.neg.push(f.confidence);
        if (f.status === "rejected") s.rejected++;
        else s.relabeled++;
      }
      // a relabel is also a miss for the corrected class
      if (f.status === "corrected" && f.originalLabel && f.originalLabel !== f.label) get(f.label).missed++;
    } else if (f.source !== "ai") {
      get(f.label).missed++;
    }
  }
  const out: ClassStats[] = [];
  for (const [label, s] of byLabel) {
    const reviews = s.pos.length + s.neg.length;
    const t = thresholdFor(label, thresholds);
    const tp = s.pos.filter((c) => c >= t).length;
    const fp = s.neg.filter((c) => c >= t).length;
    const fn = s.pos.length - tp + s.missed;
    out.push({
      label,
      confirmed: s.pos.length,
      rejected: s.rejected,
      relabeled: s.relabeled,
      missed: s.missed,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      threshold: t,
      learned: reviews >= MIN_REVIEWS && label in learnedSet,
    });
  }
  return out.sort((a, b) => labelInfo(a.label).name.localeCompare(labelInfo(b.label).name));
}

/** Re-learn thresholds from all reviews. Called after every review session. */
export async function recalibrate(): Promise<Record<string, number>> {
  const all = await db.findings.toArray();
  const pos = new Map<string, number[]>();
  const neg = new Map<string, number[]>();
  const missed = new Map<string, number>();
  for (const f of all) {
    const o = aiOutcome(f);
    if (f.source === "ai" && o) {
      const key = f.originalLabel ?? f.label;
      (o === "pos" ? pos : neg).set(key, [...((o === "pos" ? pos : neg).get(key) ?? []), f.confidence]);
    } else if (f.source !== "ai") {
      missed.set(f.label, (missed.get(f.label) ?? 0) + 1);
    }
  }
  const labels = new Set([...pos.keys(), ...neg.keys()]);
  const t: Record<string, number> = {};
  for (const l of labels) {
    const p = pos.get(l) ?? [];
    const n = neg.get(l) ?? [];
    if (p.length + n.length >= MIN_REVIEWS) t[l] = bestThreshold(p, n, missed.get(l) ?? 0);
  }
  cache = { ...(await getModelDefaults()), ...t };
  await setSetting("thresholds", t);
  return t;
}

export async function resetCalibration(): Promise<void> {
  cache = null;
  await setSetting("thresholds", {});
}
