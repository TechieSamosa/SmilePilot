/** Orthodontic helpers: treatment progress, aligner schedule, reminders. */
import { getSetting } from "../db";
import { IS_ORTHO_PRESET } from "../preset";
import type { OrthoCase, Patient } from "../types";

export const DAY = 86400000;

export async function orthoEnabled(): Promise<boolean> {
  return getSetting<boolean>("orthoTools", IS_ORTHO_PRESET);
}

export const isAligner = (o?: OrthoCase) => o?.appliance === "Clear aligners";

const parse = (d?: string) => (d ? new Date(`${d}T00:00:00`).getTime() : NaN);
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** When the patient should switch to the next aligner (null when not applicable). */
export function nextAlignerChange(o?: OrthoCase): number | null {
  if (!o || !isAligner(o) || o.status !== "active" || !o.alignerSince || !o.alignerDays) return null;
  if (o.alignerTotal && o.alignerCurrent && o.alignerCurrent >= o.alignerTotal) return null;
  return parse(o.alignerSince) + o.alignerDays * DAY;
}

/** Days until next aligner change (negative = overdue). */
export function daysToChange(o?: OrthoCase): number | null {
  const t = nextAlignerChange(o);
  if (t === null) return null;
  const today = parse(todayISO());
  return Math.round((t - today) / DAY);
}

export function monthsElapsed(o: OrthoCase): number {
  const start = parse(o.startDate);
  if (isNaN(start)) return 0;
  return Math.max(0, (Date.now() - start) / (30.44 * DAY));
}

/** 0..1 progress — aligner count when known, otherwise elapsed / estimated months. */
export function progress(o: OrthoCase): number {
  if (o.status !== "active") return 1;
  if (isAligner(o) && o.alignerTotal && o.alignerCurrent) return Math.min(1, o.alignerCurrent / o.alignerTotal);
  return o.estMonths ? Math.min(1, monthsElapsed(o) / o.estMonths) : 0;
}

export function progressText(o: OrthoCase): string {
  if (o.status === "retention") return `In retention${o.retainer ? ` · ${o.retainer}` : ""}`;
  if (o.status === "completed") return "Treatment completed";
  const m = Math.floor(monthsElapsed(o));
  const base = `Month ${m + 1}${o.estMonths ? ` of ~${o.estMonths}` : ""}`;
  if (isAligner(o) && o.alignerCurrent) return `Aligner ${o.alignerCurrent}${o.alignerTotal ? ` of ${o.alignerTotal}` : ""} · ${base}`;
  return `${base}${o.archwire ? ` · ${o.archwire}` : ""}`;
}

export function changeLabel(o?: OrthoCase): string | null {
  const d = daysToChange(o);
  if (d === null) return null;
  if (d < 0) return `aligner change overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (d === 0) return "switch to next aligner today";
  if (d === 1) return "switch to next aligner tomorrow";
  return `next aligner in ${d} days`;
}

export function alignerReminder(p: Patient, clinic: string, doctor: string, lang = "English"): string {
  const o = p.ortho!;
  const next = (o.alignerCurrent ?? 0) + 1;
  const when = nextAlignerChange(o);
  const date = when ? new Date(when).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }) : "";
  const name = p.name.split(" ")[0];
  if (lang === "Hindi")
    return `नमस्ते ${name} जी, ${date ? `${date} को ` : ""}अलाइनर नंबर ${next} लगाना है। रोज़ 22 घंटे पहनें, खाने और ब्रश के बाद ही वापस लगाएँ। पुराने अलाइनर संभाल कर रखें।\n— ${doctor}, ${clinic}`;
  if (lang === "Marathi")
    return `नमस्कार ${name}, ${date ? `${date} रोजी ` : ""}अलाइनर क्रमांक ${next} लावायचा आहे. रोज 22 तास घाला, जेवण व ब्रश केल्यानंतरच परत लावा. जुने अलाइनर जपून ठेवा.\n— ${doctor}, ${clinic}`;
  return `Hi ${name}, a reminder: please switch to aligner #${next}${date ? ` on ${date}` : ""}. Wear it about 22 hours a day and put it back right after meals and brushing. Keep your previous aligner safely in its case.\n— ${doctor}, ${clinic}`;
}

// ---- procedures, findings and wording used across the app when orthodontic tools are on
export const ORTHO_PROCEDURES = [
  "Ortho consultation",
  "Orthodontic records (photos, scans, X-rays)",
  "Aligner scan / impressions",
  "Aligner delivery & attachments",
  "Aligner check / next trays",
  "IPR (interproximal reduction)",
  "Bracket bonding",
  "Wire change / adjustment",
  "Elastics check",
  "Bracket / wire repair",
  "Mini-implant (TAD) placement",
  "Debonding",
  "Retainer delivery",
  "Retention check",
];

export const ORTHO_TREATMENTS = [
  "Orthodontic treatment — metal braces",
  "Orthodontic treatment — ceramic braces",
  "Orthodontic treatment — self-ligating braces",
  "Orthodontic treatment — clear aligners",
  "Orthodontic records",
  "Retainers (upper & lower)",
  "IPR",
  "Mini-implant (TAD)",
  "Bracket replacement",
];

export const ORTHO_COMPLAINTS = ["Crooked teeth", "Crowding", "Spacing", "Forwardly placed teeth", "Deep bite", "Braces consult", "Aligner consult", "Bracket broken", "Wire poking", "Aligner not fitting", "Ulcer from braces"];

export const ORTHO_DIAGNOSES = [
  "Angle's Class I malocclusion with crowding",
  "Angle's Class I malocclusion with spacing",
  "Angle's Class II div 1 malocclusion",
  "Angle's Class II div 2 malocclusion",
  "Angle's Class III malocclusion",
  "Bimaxillary protrusion",
  "Deep bite",
  "Anterior open bite",
  "Posterior crossbite",
];
