/**
 * Offline writing helpers — free, instant, private, and they never invent anything:
 * every sentence is built only from what the dentist entered for this visit.
 */
import { db, getProfile } from "../db";
import type { Appointment, ClinicProfile, Finding, Patient, Rx, Visit } from "../types";
import { ageOf, fmtDate, fmtDateTime } from "./format";
import { labelInfo, TOOTH_CONDITIONS } from "./labels";
import { changeLabel, progressText } from "./ortho";
import { orthoSummary } from "../components/visit/OrthoTab";

export const OFFLINE_LANGS = ["English", "Hindi", "Marathi"] as const;
export type OfflineLang = (typeof OFFLINE_LANGS)[number];

interface Ctx {
  visit: Visit;
  patient: Patient;
  profile: ClinicProfile;
  findings: Finding[];
  pendingAi: number;
  imageKinds: string[];
  next?: Appointment;
}

async function context(visit: Visit, patient: Patient): Promise<Ctx> {
  const all = await db.findings.where("visitId").equals(visit.id).toArray();
  const findings = all.filter((f) => f.status === "confirmed" || f.status === "corrected" || (f.source !== "ai" && f.status !== "rejected"));
  const pendingAi = all.filter((f) => f.source === "ai" && f.status === "pending").length;
  const images = await db.images.where("visitId").equals(visit.id).toArray();
  const next = (
    await db.appointments
      .where("patientId")
      .equals(patient.id)
      .filter((a) => a.status === "scheduled" && a.start > Date.now())
      .sortBy("start")
  )[0];
  return { visit, patient, profile: await getProfile(), findings, pendingAi, imageKinds: [...new Set(images.map((i) => i.kind))], next };
}

const firstName = (p: Patient) => p.name.trim().split(/\s+/)[0] ?? p.name;
const clean = (s: string) => s.trim();

// ---------------------------------------------------------------- case record
export async function buildCaseRecord(visit: Visit, patient: Patient): Promise<string> {
  const c = await context(visit, patient);
  const age = ageOf(patient);
  const out: string[] = [];
  const section = (title: string, body: string | string[] | undefined) => {
    const text = Array.isArray(body) ? body.filter(Boolean).join("\n") : clean(body ?? "");
    out.push(`${title}\n${text || "Not recorded"}`);
  };

  out.push(
    `${patient.name}${age !== undefined ? `, ${age} y` : ""}${patient.gender ? `, ${patient.gender}` : ""} — ${fmtDate(visit.date)}` +
      (patient.allergies.length ? `\nAllergies: ${patient.allergies.join(", ")}` : "") +
      (patient.conditions.length ? `\nMedical history: ${patient.conditions.join(", ")}` : "") +
      (patient.medications ? `\nCurrent medications: ${patient.medications}` : ""),
  );
  section("CHIEF COMPLAINT", visit.chiefComplaint);
  if (clean(visit.history)) section("HISTORY", visit.history);

  const chart = Object.entries(visit.toothChart)
    .filter(([, v]) => v.length)
    .sort(([a], [b]) => +a - +b)
    .map(([t, v]) => `#${t}: ${v.map((k) => TOOTH_CONDITIONS.find((x) => x.key === k)?.label ?? k).join(", ")}`);
  section("CLINICAL FINDINGS", [clean(visit.examination), chart.length ? `Tooth chart — ${chart.join("; ")}` : ""]);

  if (c.imageKinds.length || c.findings.length) {
    const rows = c.findings.map((f) => `- ${labelInfo(f.label).name}${f.tooth ? ` wrt ${f.tooth}` : ""}${f.note ? ` (${f.note})` : ""}`);
    if (c.pendingAi) rows.push(`(${c.pendingAi} AI suggestion${c.pendingAi > 1 ? "s" : ""} not yet reviewed)`);
    section(`RADIOGRAPHIC FINDINGS${c.imageKinds.length ? ` (${c.imageKinds.join(", ")})` : ""}`, rows.length ? rows : ["No significant findings recorded"]);
  }
  const oex = orthoSummary(visit.ortho);
  if (oex.length) section("ORTHODONTIC ASSESSMENT", oex);
  section("DIAGNOSIS", visit.diagnosis);
  section("TREATMENT DONE", [clean(visit.treatmentDone), visit.ortho?.procedure ? `Orthodontic: ${visit.ortho.procedure}` : "", visit.ortho?.elastics ? `Elastics: ${visit.ortho.elastics}` : ""]);
  if (patient.ortho) section("ORTHODONTIC TREATMENT", `${patient.ortho.appliance} — ${progressText(patient.ortho)}${changeLabel(patient.ortho) ? ` (${changeLabel(patient.ortho)})` : ""}`);
  const planned = visit.plan.filter((p) => p.status === "planned").map((p) => `- ${p.tooth ? `#${p.tooth} ` : ""}${p.procedure}`);
  if (planned.length) section("TREATMENT PLAN", planned);
  if (visit.prescriptions.length)
    section(
      "PRESCRIPTION",
      visit.prescriptions.map((r, i) => `${i + 1}. ${r.drug} — ${r.dose}, ${r.frequency}, ${r.duration}${r.instructions ? ` (${r.instructions})` : ""}`),
    );
  if (clean(visit.advice)) section("ADVICE", visit.advice);
  if (c.next) section("NEXT APPOINTMENT", `${fmtDateTime(c.next.start)} — ${c.next.procedure}`);
  return out.join("\n\n");
}

// ---------------------------------------------------------------- patient message
const WHEN: Record<string, { en: string; hi: string; mr: string }> = {
  "1-0-1": { en: "morning & night", hi: "सुबह और रात", mr: "सकाळी आणि रात्री" },
  "1-1-1": { en: "morning, afternoon & night", hi: "सुबह, दोपहर और रात", mr: "सकाळी, दुपारी आणि रात्री" },
  "1-0-0": { en: "morning", hi: "सुबह", mr: "सकाळी" },
  "0-0-1": { en: "night", hi: "रात", mr: "रात्री" },
  "0-1-0": { en: "afternoon", hi: "दोपहर", mr: "दुपारी" },
  "1-1-1-1": { en: "4 times a day", hi: "दिन में 4 बार", mr: "दिवसातून 4 वेळा" },
  SOS: { en: "only when needed (for pain)", hi: "सिर्फ़ ज़रूरत होने पर (दर्द में)", mr: "फक्त गरज असेल तेव्हा (दुखत असल्यास)" },
};
const MR_INSTR: [RegExp, string][] = [
  [/after food/i, "जेवणानंतर"],
  [/before food/i, "जेवणापूर्वी"],
  [/empty stomach/i, "उपाशी पोटी"],
  [/before breakfast/i, "नाश्त्यापूर्वी"],
  [/no alcohol/i, "दारू अजिबात नको"],
  [/do not swallow/i, "गिळू नका"],
];
const HI_INSTR: [RegExp, string][] = [
  [/after food/i, "खाने के बाद"],
  [/before food/i, "खाने से पहले"],
  [/empty stomach/i, "खाली पेट"],
  [/before breakfast/i, "नाश्ते से पहले"],
  [/no alcohol/i, "शराब बिल्कुल नहीं"],
  [/do not swallow/i, "निगलें नहीं"],
];

function rxLine(r: Rx, lang: OfflineLang): string {
  const w = WHEN[r.frequency.trim()];
  if (lang === "Marathi") {
    let instr = r.instructions;
    for (const [re, mr] of MR_INSTR) instr = instr.replace(re, mr);
    const dur = r.duration.replace(/(\d+)\s*days?/i, "$1 दिवस").replace(/(\d+)\s*weeks?/i, "$1 आठवडे");
    return `• ${r.drug} — ${r.dose}, ${w ? w.mr : r.frequency}, ${dur}${instr ? ` (${instr})` : ""}`;
  }
  if (lang === "Hindi") {
    let instr = r.instructions;
    for (const [re, hi] of HI_INSTR) instr = instr.replace(re, hi);
    const dur = r.duration.replace(/(\d+)\s*days?/i, "$1 दिन").replace(/(\d+)\s*weeks?/i, "$1 हफ़्ते");
    return `• ${r.drug} — ${r.dose}, ${w ? w.hi : r.frequency}, ${dur}${instr ? ` (${instr})` : ""}`;
  }
  return `• ${r.drug} — ${r.dose}, ${w ? w.en : r.frequency}, ${r.duration}${r.instructions ? ` (${r.instructions})` : ""}`;
}

export async function buildPatientMessage(visit: Visit, patient: Patient, lang: OfflineLang): Promise<string> {
  const c = await context(visit, patient);
  const p = c.profile;
  const name = firstName(patient);
  const done = clean(visit.treatmentDone);
  const planned = visit.plan.filter((x) => x.status === "planned").map((x) => `${x.procedure}${x.tooth ? ` (tooth ${x.tooth})` : ""}`);
  const advice = visit.advice
    .split("\n")
    .map((l) => l.replace(/^[•\-\s]+/, "").trim())
    .filter(Boolean);
  const lines: string[] = [];

  const o = patient.ortho && patient.ortho.status !== "completed" ? patient.ortho : undefined;
  const orthoLine = o ? `${o.appliance} — ${progressText(o)}${changeLabel(o) ? ` (${changeLabel(o)})` : ""}` : "";
  const nextNo = (o?.alignerCurrent ?? 0) + 1;
  const alignerDue = o?.appliance === "Clear aligners" && changeLabel(o);
  const orthoHi = o ? `${o.appliance}${o.alignerCurrent ? ` — अलाइनर ${o.alignerCurrent}${o.alignerTotal ? `/${o.alignerTotal}` : ""}` : ""}${alignerDue ? ` (अगला अलाइनर #${nextNo})` : ""}` : "";
  const orthoMr = o ? `${o.appliance}${o.alignerCurrent ? ` — अलाइनर ${o.alignerCurrent}${o.alignerTotal ? `/${o.alignerTotal}` : ""}` : ""}${alignerDue ? ` (पुढील अलाइनर #${nextNo})` : ""}` : "";
  if (lang === "Marathi") {
    lines.push(`नमस्कार ${name},`, `आज ${p.clinicName || "क्लिनिक"} ला भेट दिल्याबद्दल धन्यवाद.`);
    if (done) lines.push("", `आजचे उपचार: ${done}`);
    if (visit.ortho?.procedure) lines.push(`आज केलेले: ${visit.ortho.procedure}`);
    if (orthoMr) lines.push(`तुमचे ऑर्थो उपचार: ${orthoMr}`);
    if (planned.length) lines.push(`पुढील उपचार: ${planned.join(", ")}`);
    if (visit.prescriptions.length) lines.push("", "तुमची औषधे:", ...visit.prescriptions.map((r) => rxLine(r, lang)));
    if (advice.length) lines.push("", "लक्षात ठेवा:", ...advice.map((a) => `• ${a}`));
    if (c.next) lines.push("", `पुढील भेट: ${fmtDateTime(c.next.start)} — ${c.next.procedure}`);
    lines.push("", "सूज वाढल्यास, जास्त ताप आल्यास किंवा दुखणे कमी न झाल्यास लगेच संपर्क करा.", "", "काळजी घ्या,", p.doctorName);
  } else if (lang === "Hindi") {
    lines.push(`नमस्ते ${name} जी,`, `आज ${p.clinicName || "क्लिनिक"} आने के लिए धन्यवाद।`);
    if (done) lines.push("", `आज का इलाज: ${done}`);
    if (visit.ortho?.procedure) lines.push(`आज किया गया: ${visit.ortho.procedure}`);
    if (orthoHi) lines.push(`आपका ऑर्थो इलाज: ${orthoHi}`);
    if (planned.length) lines.push(`आगे का इलाज: ${planned.join(", ")}`);
    if (visit.prescriptions.length) lines.push("", "आपकी दवाइयाँ:", ...visit.prescriptions.map((r) => rxLine(r, lang)));
    if (advice.length) lines.push("", "ध्यान रखें:", ...advice.map((a) => `• ${a}`));
    if (c.next) lines.push("", `अगली अपॉइंटमेंट: ${fmtDateTime(c.next.start)} — ${c.next.procedure}`);
    lines.push("", "अगर सूजन बढ़े, तेज़ बुखार हो या दर्द कम न हो, तो तुरंत संपर्क करें।", "", "अपना ध्यान रखें,", p.doctorName);
  } else {
    lines.push(`Hello ${name},`, `Thank you for visiting ${p.clinicName || "the clinic"} today.`);
    if (done) lines.push("", `Today's treatment: ${done}`);
    if (visit.ortho?.procedure) lines.push(`Done today: ${visit.ortho.procedure}`);
    if (orthoLine) lines.push(`Your orthodontic treatment: ${orthoLine}`);
    if (planned.length) lines.push(`Next steps: ${planned.join(", ")}`);
    if (visit.prescriptions.length) lines.push("", "Your medicines:", ...visit.prescriptions.map((r) => rxLine(r, lang)));
    if (advice.length) lines.push("", "Please remember:", ...advice.map((a) => `• ${a}`));
    if (c.next) lines.push("", `Next appointment: ${fmtDateTime(c.next.start)} — ${c.next.procedure}`);
    lines.push("", "If the swelling increases, you get a high fever, or the pain does not reduce, please contact us immediately.", "", "Take care,", p.doctorName);
  }
  if (p.clinicName || p.phone) lines.push([p.clinicName, p.phone].filter(Boolean).join(" · "));
  return lines.join("\n");
}
