/**
 * "Pro" AI agent (optional, needs the dentist's own Claude API key).
 * Claude can look things up and act inside the app through these tools. Everything runs
 * against the local database on the phone; any change asks the dentist to confirm first.
 */
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { db, getProfile, uid } from "../../db";
import { ageOf, fmtDateTime } from "../format";
import { labelInfo } from "../labels";
import { scheduleReminder } from "../notify";
import { alignerReminder, daysToChange, nextAlignerChange, progressText, todayISO } from "../ortho";
import type { Appointment, Patient } from "../../types";
import { client, ClaudeError, friendlyError, systemPrompt } from "./claude";

export interface AgentHooks {
  status: (text: string) => void;
  /** Ask the dentist to approve a change. Resolve true to proceed. */
  confirm: (title: string, detail: string) => Promise<boolean>;
  /** A ready-to-send WhatsApp message (the dentist taps Send herself). */
  whatsapp: (patient: Patient, text: string) => void;
  signal?: AbortSignal;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

export const TOOLS: BetaTool[] = [
  {
    name: "search_patients",
    description: "Find patients by (part of) name or phone number. Returns ids needed by other tools.",
    input_schema: obj({ query: { type: "string" } }, ["query"]),
  },
  {
    name: "get_patient",
    description: "Full record of one patient: demographics, allergies, medical history, orthodontic treatment, recent visits (complaint, diagnosis, treatment, prescriptions, confirmed X-ray findings), appointments and balance due.",
    input_schema: obj({ patient_id: { type: "string" } }, ["patient_id"]),
  },
  {
    name: "list_appointments",
    description: "Appointments between two dates (inclusive), with patient names.",
    input_schema: obj({ from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, ["from", "to"]),
  },
  {
    name: "aligner_changes_due",
    description: "Patients with clear aligners whose next aligner change is due within N days (or overdue).",
    input_schema: obj({ within_days: { type: "number" } }, ["within_days"]),
  },
  {
    name: "clinic_summary",
    description: "Clinic numbers for a date range: visits, new patients, appointments (by status), fees collected, outstanding dues, active orthodontic patients.",
    input_schema: obj({ from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, ["from", "to"]),
  },
  {
    name: "book_appointment",
    description: "Book an appointment (asks the dentist to confirm).",
    input_schema: obj(
      {
        patient_id: { type: "string" },
        start: { type: "string", description: "Local date-time YYYY-MM-DDTHH:mm" },
        procedure: { type: "string" },
        duration_min: { type: "number" },
        notes: { type: "string" },
      },
      ["patient_id", "start", "procedure"],
    ),
  },
  {
    name: "update_aligners",
    description: "Update a clear-aligner patient's aligner number / total / days per aligner (asks the dentist to confirm). Set switched_today=true when the patient starts the given aligner today.",
    input_schema: obj(
      {
        patient_id: { type: "string" },
        current_aligner: { type: "number" },
        total_aligners: { type: "number" },
        days_per_aligner: { type: "number" },
        switched_today: { type: "boolean" },
      },
      ["patient_id"],
    ),
  },
  {
    name: "prepare_whatsapp",
    description: "Prepare a WhatsApp message to a patient. It is shown to the dentist with a Send button; nothing is sent automatically. Use kind='aligner_reminder' to generate the standard aligner reminder.",
    input_schema: obj(
      { patient_id: { type: "string" }, message: { type: "string" }, kind: { type: "string", enum: ["custom", "aligner_reminder"] } },
      ["patient_id"],
    ),
  },
];

const LABELS: Record<string, string> = {
  search_patients: "Looking up patients…",
  get_patient: "Reading the patient record…",
  list_appointments: "Checking the schedule…",
  aligner_changes_due: "Checking aligner schedules…",
  clinic_summary: "Adding up clinic numbers…",
  book_appointment: "Booking appointment…",
  update_aligners: "Updating aligners…",
  prepare_whatsapp: "Preparing WhatsApp message…",
};

const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime();
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);

async function needPatient(id: unknown): Promise<Patient> {
  const p = await db.patients.get(str(id));
  if (!p) throw new Error("No patient with that id — search_patients first.");
  return p;
}

async function exec(name: string, input: Record<string, unknown>, hooks: AgentHooks): Promise<unknown> {
  switch (name) {
    case "search_patients": {
      const q = str(input.query).toLowerCase().trim();
      const all = await db.patients.toArray();
      return all
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
        .slice(0, 15)
        .map((p) => ({ id: p.id, name: p.name, age: ageOf(p), gender: p.gender, phone: p.phone, ortho: p.ortho ? `${p.ortho.appliance} (${p.ortho.status})` : null }));
    }
    case "get_patient": {
      const p = await needPatient(input.patient_id);
      const visits = (await db.visits.where("patientId").equals(p.id).reverse().sortBy("date")).slice(0, 6);
      const findings = await db.findings.where("patientId").equals(p.id).toArray();
      const appts = await db.appointments.where("patientId").equals(p.id).sortBy("start");
      const balance = visits.reduce((s, v) => s + v.plan.filter((x) => x.status === "done").reduce((a, x) => a + (x.cost || 0), 0) - (v.paid || 0), 0);
      return {
        id: p.id,
        name: p.name,
        age: ageOf(p),
        gender: p.gender,
        phone: p.phone,
        allergies: p.allergies,
        medical_history: p.conditions,
        medications: p.medications,
        notes: p.notes,
        orthodontic_treatment: p.ortho ? { ...p.ortho, summary: progressText(p.ortho), next_aligner_change: nextAlignerChange(p.ortho) ? fmtDateTime(nextAlignerChange(p.ortho)!) : null } : null,
        balance_due: balance,
        recent_visits: visits.map((v) => ({
          date: new Date(v.date).toDateString(),
          complaint: v.chiefComplaint,
          diagnosis: v.diagnosis,
          treatment_done: v.treatmentDone,
          ortho: v.ortho,
          prescriptions: v.prescriptions.map((r) => `${r.drug} ${r.dose} ${r.frequency} ${r.duration}`),
          xray_findings: findings
            .filter((f) => f.visitId === v.id && (f.status === "confirmed" || f.status === "corrected" || f.source !== "ai"))
            .map((f) => `${labelInfo(f.label).name}${f.tooth ? ` #${f.tooth}` : ""}`),
        })),
        appointments: appts.map((a) => ({ id: a.id, when: fmtDateTime(a.start), procedure: a.procedure, status: a.status })),
      };
    }
    case "list_appointments": {
      const from = dayStart(str(input.from));
      const to = dayStart(str(input.to)) + 86400000;
      if (isNaN(from) || isNaN(to)) throw new Error("Use YYYY-MM-DD dates.");
      const list = await db.appointments.where("start").between(from, to).sortBy("start");
      const pats = new Map((await db.patients.bulkGet(list.map((a) => a.patientId))).filter(Boolean).map((p) => [p!.id, p!]));
      return list.map((a) => ({ when: fmtDateTime(a.start), patient: pats.get(a.patientId)?.name, patient_id: a.patientId, procedure: a.procedure, minutes: a.durationMin, status: a.status, notes: a.notes }));
    }
    case "aligner_changes_due": {
      const within = num(input.within_days) ?? 3;
      const all = await db.patients.filter((p) => !!p.ortho).toArray();
      return all
        .map((p) => ({ p, d: daysToChange(p.ortho) }))
        .filter((x) => x.d !== null && x.d <= within)
        .map(({ p, d }) => ({ patient_id: p.id, name: p.name, phone: p.phone, next_aligner: (p.ortho!.alignerCurrent ?? 0) + 1, total: p.ortho!.alignerTotal, days_until_change: d }));
    }
    case "clinic_summary": {
      const from = dayStart(str(input.from));
      const to = dayStart(str(input.to)) + 86400000;
      if (isNaN(from) || isNaN(to)) throw new Error("Use YYYY-MM-DD dates.");
      const visits = await db.visits.where("date").between(from, to).toArray();
      const appts = await db.appointments.where("start").between(from, to).toArray();
      const newPatients = await db.patients.filter((p) => p.createdAt >= from && p.createdAt < to).count();
      const allVisits = await db.visits.toArray();
      const dues = allVisits.reduce((s, v) => s + Math.max(0, v.plan.filter((x) => x.status === "done").reduce((a, x) => a + (x.cost || 0), 0) - (v.paid || 0)), 0);
      const activeOrtho = await db.patients.filter((p) => p.ortho?.status === "active").count();
      const byStatus: Record<string, number> = {};
      for (const a of appts) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      const profile = await getProfile();
      return { currency: profile.currency, visits: visits.length, new_patients: newPatients, appointments: byStatus, fees_collected: visits.reduce((s, v) => s + (v.paid || 0), 0), outstanding_dues_all_time: dues, active_orthodontic_patients: activeOrtho };
    }
    case "book_appointment": {
      const p = await needPatient(input.patient_id);
      const start = new Date(str(input.start)).getTime();
      if (isNaN(start)) throw new Error("start must be YYYY-MM-DDTHH:mm");
      const appt: Appointment = {
        id: uid(),
        patientId: p.id,
        start,
        durationMin: num(input.duration_min) ?? 30,
        procedure: str(input.procedure) || "Review",
        notes: str(input.notes),
        status: "scheduled",
        createdAt: Date.now(),
      };
      if (!(await hooks.confirm("Book this appointment?", `${p.name}\n${fmtDateTime(start)} · ${appt.durationMin} min\n${appt.procedure}${appt.notes ? `\n${appt.notes}` : ""}`)))
        return { done: false, reason: "The dentist declined." };
      appt.notificationId = await scheduleReminder(appt, p);
      await db.appointments.add(appt);
      return { done: true, appointment_id: appt.id, when: fmtDateTime(start) };
    }
    case "update_aligners": {
      const p = await needPatient(input.patient_id);
      const o = p.ortho;
      if (!o || o.appliance !== "Clear aligners") throw new Error("This patient has no clear-aligner treatment recorded.");
      const next = {
        ...o,
        alignerCurrent: num(input.current_aligner) ?? o.alignerCurrent,
        alignerTotal: num(input.total_aligners) ?? o.alignerTotal,
        alignerDays: num(input.days_per_aligner) ?? o.alignerDays,
        alignerSince: input.switched_today ? todayISO() : o.alignerSince,
        updatedAt: Date.now(),
      };
      const desc = `${p.name}: aligner ${o.alignerCurrent ?? "?"}→${next.alignerCurrent ?? "?"} of ${next.alignerTotal ?? "?"}, every ${next.alignerDays ?? "?"} days${input.switched_today ? ", started today" : ""}`;
      if (!(await hooks.confirm("Update aligners?", desc))) return { done: false, reason: "The dentist declined." };
      await db.patients.update(p.id, { ortho: next, updatedAt: Date.now() });
      return { done: true, now: progressText(next) };
    }
    case "prepare_whatsapp": {
      const p = await needPatient(input.patient_id);
      if (!p.phone) throw new Error("This patient has no phone number.");
      const profile = await getProfile();
      const text =
        str(input.kind) === "aligner_reminder" && p.ortho
          ? alignerReminder(p, profile.clinicName, profile.doctorName, profile.patientLanguage)
          : str(input.message);
      if (!text.trim()) throw new Error("message is empty");
      hooks.whatsapp(p, text);
      return { shown_to_dentist: true };
    }
  }
  throw new Error(`Unknown tool ${name}`);
}

const AGENT_PROMPT = `

You can act inside the clinic app with tools. Its data lives only on this phone.
- Use tools to look things up instead of guessing; search_patients first to get ids.
- Changes (booking, aligner updates) are confirmed by the dentist in the app — just call the tool.
- WhatsApp messages are only prepared; the dentist sends them.
- Keep replies short for a phone screen: plain sentences or '-' bullets, no tables or markdown headings.`;

/** Run one user turn through the agent loop. Returns the final text and the updated API history. */
export async function runAgent(history: BetaMessageParam[], hooks: AgentHooks): Promise<{ text: string; messages: BetaMessageParam[] }> {
  const { c, model } = await client();
  const system = (await systemPrompt(AGENT_PROMPT)) + `\nToday is ${new Date().toDateString()} (${todayISO()}).`;
  const messages = [...history];
  try {
    for (let step = 0; step < 10; step++) {
      hooks.status(step === 0 ? "Thinking…" : "Working…");
      const resp = await c.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          system,
          tools: TOOLS,
          messages,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
        },
        { signal: hooks.signal },
      );
      messages.push({ role: "assistant", content: resp.content as BetaContentBlockParam[] });
      if (resp.stop_reason === "refusal") throw new ClaudeError("Claude declined this request. Try rephrasing it.");
      if (resp.stop_reason === "pause_turn") continue;
      const uses = resp.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || uses.length === 0) {
        return { text: resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim(), messages };
      }
      const results: BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        hooks.status(LABELS[u.name] ?? "Working…");
        try {
          const out = await exec(u.name, (u.input ?? {}) as Record<string, unknown>, hooks);
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: u.id, content: (e as Error).message, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return { text: "I stopped after several steps — please ask a narrower question.", messages };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw friendlyError(e);
  }
}

export const AGENT_STARTERS = [
  "Who needs to change aligners this week? Prepare reminders.",
  "What does my schedule look like tomorrow?",
  "Summarise this month: visits, new patients, collections and dues",
  "Book Priya for an aligner check next Monday at 11am",
  "Open the record of my last patient and summarise the treatment",
];

