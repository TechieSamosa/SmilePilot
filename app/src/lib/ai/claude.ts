/**
 * Claude integration (reports, X-ray second opinion, prescription safety check, assistant chat).
 *
 * The API key belongs to the dentist and is stored only on her phone; requests go
 * directly from the phone to Anthropic (no DentalOS server in between), which is why
 * the SDK runs with `dangerouslyAllowBrowser`.
 *
 * "Learning" from the dentist: her saved preferences and her own edited reports are
 * fed back as instructions and style examples on every request (in-context learning
 * from human feedback), so drafts converge on how she writes.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { db, getProfile, getSetting } from "../../db";
import type { Patient, Visit } from "../../types";
import { ageOf } from "../format";
import { IS_ORTHO_PRESET, PRESET } from "../../preset";

export const DEFAULT_MODEL = "claude-opus-5-5";
export type Effort = "low" | "medium" | "high";

export class ClaudeError extends Error {}

export async function getApiKey(): Promise<string> {
  return (await getSetting<string>("anthropicKey", "")).trim();
}

export async function isClaudeConfigured(): Promise<boolean> {
  return (await getApiKey()).length > 0;
}

export async function client(): Promise<{ c: Anthropic; model: string }> {
  const key = await getApiKey();
  if (!key) throw new ClaudeError("Add your Claude API key in Settings → AI assistant to use this feature.");
  const model = await getSetting<string>("claudeModel", DEFAULT_MODEL);
  return { c: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 }), model };
}

export function friendlyError(e: unknown): Error {
  if (e instanceof ClaudeError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new ClaudeError("Your Claude API key was rejected. Please check it in Settings.");
  if (e instanceof Anthropic.PermissionDeniedError) return new ClaudeError("This API key is not allowed to use the selected model.");
  if (e instanceof Anthropic.RateLimitError) return new ClaudeError("Claude is busy (rate limit). Please try again in a minute.");
  if (e instanceof Anthropic.BadRequestError) {
    const m = (e as Error).message;
    if (/credit|billing|balance/i.test(m)) return new ClaudeError("Your Anthropic account is out of credit. Add credit at console.anthropic.com.");
    return new ClaudeError(`Claude could not process this request: ${m}`);
  }
  if (e instanceof Anthropic.APIConnectionError) return new ClaudeError("No internet connection. AI assistant features need internet; everything else works offline.");
  if (e instanceof Anthropic.APIError) return new ClaudeError(`Claude service error (${e.status ?? "?"}). Please try again.`);
  return e instanceof Error ? e : new Error(String(e));
}

const BASE_SYSTEM = `You are ${PRESET.appName} Assistant, a clinical decision-support assistant used by a qualified ${IS_ORTHO_PRESET ? "orthodontist" : "dentist"} in her clinic (India).
- The user is the treating dentist, not a patient. Be precise, clinical and concise; use standard dental terminology and FDI tooth numbering.
- Prefer drugs, brands and dosing conventions common in Indian dental practice (e.g. 1-0-1 notation), and mention generic names.
- Never invent findings. If information is missing or uncertain, say so explicitly and state what to check clinically.
- AI X-ray detections are screening aids with known false positives/negatives; treat only dentist-confirmed findings as established.
- Flag red flags (spreading infection, airway risk, suspected malignancy, anticoagulants, pregnancy, allergies) clearly.
- Final clinical decisions rest with the dentist.`;

async function preferenceBlock(): Promise<string> {
  const prefs = await db.preferences.orderBy("createdAt").toArray();
  if (!prefs.length) return "";
  return `\n\nThe dentist's standing preferences (always follow these):\n${prefs.map((p) => `- ${p.text}`).join("\n")}`;
}

export async function systemPrompt(extra = ""): Promise<string> {
  const p = await getProfile();
  const who = p.doctorName ? `\nThe dentist is ${p.doctorName}${p.qualification ? `, ${p.qualification}` : ""}${p.clinicName ? ` at ${p.clinicName}` : ""}.` : "";
  return BASE_SYSTEM + who + (await preferenceBlock()) + extra;
}

interface StreamOpts {
  system: string;
  messages: BetaMessageParam[];
  effort?: Effort;
  maxTokens?: number;
  onText?: (full: string) => void;
  signal?: AbortSignal;
  jsonSchema?: Record<string, unknown>;
}

async function run(o: StreamOpts): Promise<string> {
  const { c, model } = await client();
  try {
    const stream = c.beta.messages.stream(
      {
        model,
        max_tokens: o.maxTokens ?? 16000,
        system: o.system,
        messages: o.messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: o.effort ?? "medium",
          ...(o.jsonSchema ? { format: { type: "json_schema" as const, schema: o.jsonSchema } } : {}),
        },
      },
      { signal: o.signal },
    );
    let text = "";
    stream.on("text", (delta) => {
      text += delta;
      o.onText?.(text);
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") {
      throw new ClaudeError("Claude declined to answer this request. Try rephrasing it with more clinical context.");
    }
    const final = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (msg.stop_reason === "max_tokens") return final + "\n\n[Response was cut short — ask a narrower question.]";
    return final;
  } catch (e) {
    if ((e as Error)?.name === "AbortError" || e instanceof Anthropic.APIUserAbortError) throw e;
    throw friendlyError(e);
  }
}

// ---------- context builders ----------
export function patientSummary(p: Patient): string {
  const age = ageOf(p);
  return [
    `Patient: ${p.name}${age !== undefined ? `, ${age} y` : ""}${p.gender ? `, ${p.gender}` : ""}`,
    `Allergies: ${p.allergies.length ? p.allergies.join(", ") : "none recorded"}`,
    `Medical history: ${p.conditions.length ? p.conditions.join(", ") : "none recorded"}`,
    p.medications ? `Current medications: ${p.medications}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function visitContext(visit: Visit, patient: Patient): Promise<string> {
  const findings = (await db.findings.where("visitId").equals(visit.id).toArray()).filter(
    (f) => f.status === "confirmed" || f.status === "corrected" || f.source !== "ai",
  );
  const images = await db.images.where("visitId").equals(visit.id).toArray();
  const chart = Object.entries(visit.toothChart)
    .filter(([, v]) => v.length)
    .map(([t, v]) => `${t}: ${v.join(", ")}`)
    .join("; ");
  const lines = [
    patientSummary(patient),
    `Visit date: ${new Date(visit.date).toLocaleDateString()}`,
    visit.chiefComplaint && `Chief complaint: ${visit.chiefComplaint}`,
    visit.history && `History of present illness: ${visit.history}`,
    visit.examination && `Clinical examination: ${visit.examination}`,
    chart && `Tooth chart: ${chart}`,
    images.length && `Radiographs taken: ${images.map((i) => i.kind).join(", ")}`,
    findings.length &&
      `Dentist-confirmed radiographic findings:\n${findings
        .map((f) => `- ${f.label.replace(/_/g, " ")}${f.tooth ? ` on tooth ${f.tooth}` : ""}${f.note ? ` (${f.note})` : ""}`)
        .join("\n")}`,
    images.some((i) => i.aiSummary) && `Earlier AI second-opinion notes:\n${images.map((i) => i.aiSummary).filter(Boolean).join("\n")}`,
    visit.diagnosis && `Diagnosis: ${visit.diagnosis}`,
    visit.treatmentDone && `Treatment done today: ${visit.treatmentDone}`,
    visit.plan.length && `Treatment plan: ${visit.plan.map((p) => `${p.tooth ? `#${p.tooth} ` : ""}${p.procedure} (${p.status})`).join("; ")}`,
    visit.prescriptions.length &&
      `Prescription: ${visit.prescriptions.map((r) => `${r.drug} ${r.dose} ${r.frequency} x ${r.duration}`).join("; ")}`,
    visit.notes && `Other notes: ${visit.notes}`,
  ];
  return lines.filter(Boolean).join("\n");
}

async function styleExamples(): Promise<string> {
  const fb = await db.feedback.where("kind").equals("report").reverse().sortBy("createdAt");
  const good = fb.filter((f) => f.finalText && f.finalText.trim().length > 80 && f.rating !== -1).slice(0, 3);
  if (!good.length) return "";
  return (
    "\n\nHere are reports this dentist wrote or approved recently. Match their structure, headings, length and tone:\n" +
    good.map((g, i) => `<example_${i + 1}>\n${g.finalText!.slice(0, 2500)}\n</example_${i + 1}>`).join("\n")
  );
}

// ---------- features ----------
export async function draftReport(visit: Visit, patient: Patient, onText: (t: string) => void, signal?: AbortSignal) {
  const ctx = await visitContext(visit, patient);
  const system = await systemPrompt(await styleExamples());
  return run({
    system,
    effort: "medium",
    onText,
    signal,
    messages: [
      {
        role: "user",
        content: `Write the clinical case record for this visit, ready for the patient file. Use plain text (no markdown symbols like ** or #), with short headings in CAPITALS:
CHIEF COMPLAINT, HISTORY, CLINICAL FINDINGS, RADIOGRAPHIC FINDINGS, DIAGNOSIS, TREATMENT DONE, TREATMENT PLAN, ADVICE.
Only include what is supported by the data below; write "Not recorded" where data is missing. Do not add findings that are not listed. Keep it under 300 words.

${ctx}`,
      },
    ],
  });
}

export async function patientExplanation(
  visit: Visit,
  patient: Patient,
  language: string,
  onText: (t: string) => void,
  signal?: AbortSignal,
) {
  const ctx = await visitContext(visit, patient);
  const p = await getProfile();
  return run({
    system: await systemPrompt(),
    effort: "low",
    onText,
    signal,
    messages: [
      {
        role: "user",
        content: `Write a short, warm WhatsApp message in ${language} from ${p.doctorName || "the doctor"}${p.clinicName ? ` (${p.clinicName})` : ""} to the patient explaining, in simple non-technical words: what was found, what was done today, how to take the medicines, care instructions, and the next step. Use the patient's first name. No markdown. Max 150 words. Only use facts from the record.

${ctx}`,
      },
    ],
  });
}

export interface SecondOpinion {
  image_quality: string;
  findings: { tooth: string; condition: string; location: string; certainty: "low" | "moderate" | "high"; rationale: string }[];
  disagreements_with_detector: string[];
  overall_impression: string;
  recommended_next_steps: string[];
}

const SECOND_OPINION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["image_quality", "findings", "disagreements_with_detector", "overall_impression", "recommended_next_steps"],
  properties: {
    image_quality: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tooth", "condition", "location", "certainty", "rationale"],
        properties: {
          tooth: { type: "string", description: "FDI number(s) or region, e.g. '36' or 'lower left molar region'" },
          condition: { type: "string" },
          location: { type: "string", description: "e.g. distal surface, periapical, furcation" },
          certainty: { type: "string", enum: ["low", "moderate", "high"] },
          rationale: { type: "string" },
        },
      },
    },
    disagreements_with_detector: { type: "array", items: { type: "string" } },
    overall_impression: { type: "string" },
    recommended_next_steps: { type: "array", items: { type: "string" } },
  },
};

async function blobToJpegBase64(blob: Blob, maxSide = 1568): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const url = c.toDataURL("image/jpeg", 0.9);
  return url.slice(url.indexOf(",") + 1);
}

export async function secondOpinion(
  image: Blob,
  kind: string,
  detectorFindings: string[],
  patient: Patient | undefined,
  complaint: string,
  signal?: AbortSignal,
): Promise<SecondOpinion> {
  const data = await blobToJpegBase64(image);
  const text = await run({
    system: await systemPrompt(),
    effort: "high",
    signal,
    jsonSchema: SECOND_OPINION_SCHEMA,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
          {
            type: "text",
            text: `This is a dental ${kind} radiograph${patient ? ` of a ${ageOf(patient) ?? "?"}-year-old ${patient.gender || "patient"}` : ""}.${complaint ? ` Chief complaint: ${complaint}.` : ""}
An on-device detector reported: ${detectorFindings.length ? detectorFindings.join("; ") : "nothing above threshold"}.
Give an independent radiographic read as a second opinion for the dentist. Use FDI numbering (patient's right is on the image left for panoramic films). Be honest about uncertainty and image-quality limits; list where you disagree with the detector. Do not guess tooth numbers you cannot see.`,
          },
        ],
      },
    ],
  });
  try {
    return JSON.parse(text) as SecondOpinion;
  } catch {
    throw new ClaudeError("Claude returned an unreadable answer. Please try again.");
  }
}

export interface RxCheck {
  safe: boolean;
  issues: { severity: "high" | "medium" | "low"; drug: string; problem: string; suggestion: string }[];
}

export async function checkPrescription(patient: Patient, visit: Visit, signal?: AbortSignal): Promise<RxCheck> {
  const text = await run({
    system: await systemPrompt(),
    effort: "medium",
    signal,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["safe", "issues"],
      properties: {
        safe: { type: "boolean" },
        issues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "drug", "problem", "suggestion"],
            properties: {
              severity: { type: "string", enum: ["high", "medium", "low"] },
              drug: { type: "string" },
              problem: { type: "string" },
              suggestion: { type: "string" },
            },
          },
        },
      },
    },
    messages: [
      {
        role: "user",
        content: `Check this dental prescription for this patient: allergies, contraindications, interactions with current medications, pregnancy/lactation, paediatric/geriatric dosing, renal/hepatic issues, duplicate therapy, and dose/frequency/duration errors. Report only real issues.

${patientSummary(patient)}
Diagnosis: ${visit.diagnosis || visit.chiefComplaint || "not recorded"}
Prescription:
${visit.prescriptions.map((r, i) => `${i + 1}. ${r.drug} — ${r.dose}, ${r.frequency}, ${r.duration}${r.instructions ? `, ${r.instructions}` : ""}`).join("\n")}`,
      },
    ],
  });
  try {
    return JSON.parse(text) as RxCheck;
  } catch {
    throw new ClaudeError("Claude returned an unreadable answer. Please try again.");
  }
}

export async function chat(
  history: { role: "user" | "assistant"; content: string }[],
  patientContext: string | null,
  onText: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const extra = patientContext ? `\n\nThe dentist is asking in the context of this patient:\n${patientContext}` : "";
  return run({
    system: await systemPrompt(
      extra +
        "\n\nFormat answers for a phone screen: short paragraphs or bullet lists using '-', no tables, no markdown headings. Give doses explicitly when asked about drugs.",
    ),
    effort: "medium",
    onText,
    signal,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
}

/** Turn a piece of negative feedback into a short standing preference (learned memory). */
export async function distillPreference(aiText: string, comment: string): Promise<string> {
  const text = await run({
    system: "You turn a dentist's feedback on an AI answer into one short, general, reusable instruction for future answers. Reply with the instruction only (max 25 words), or NONE if the feedback is not generalisable.",
    effort: "low",
    maxTokens: 2000,
    messages: [{ role: "user", content: `AI answer:\n${aiText.slice(0, 3000)}\n\nDentist's feedback: ${comment}` }],
  });
  const t = text.trim().replace(/^["'-]+|["']+$/g, "");
  return /^none\.?$/i.test(t) ? "" : t;
}

export async function testKey(): Promise<string> {
  return run({ system: "Reply with exactly: OK", effort: "low", maxTokens: 1000, messages: [{ role: "user", content: "ping" }] });
}
