import Dexie, { type Table } from "dexie";
import type {
  Appointment,
  ChatMessage,
  ClinicProfile,
  CustomModel,
  Feedback,
  Finding,
  Patient,
  Preference,
  Visit,
  XrayImage,
} from "./types";

interface Setting {
  key: string;
  value: unknown;
}

class DentalDB extends Dexie {
  patients!: Table<Patient, string>;
  visits!: Table<Visit, string>;
  images!: Table<XrayImage, string>;
  findings!: Table<Finding, string>;
  appointments!: Table<Appointment, string>;
  feedback!: Table<Feedback, string>;
  chat!: Table<ChatMessage, string>;
  preferences!: Table<Preference, string>;
  models!: Table<CustomModel, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super("dentalos");
    this.version(1).stores({
      patients: "id, name, phone, updatedAt",
      visits: "id, patientId, date, status",
      images: "id, visitId, patientId, createdAt",
      findings: "id, imageId, visitId, patientId, label, status, source",
      appointments: "id, patientId, start, status",
      feedback: "id, kind, createdAt",
      chat: "id, threadId, createdAt",
      preferences: "id, createdAt",
      models: "task",
      settings: "key",
    });
  }
}

export const db = new DentalDB();

export const uid = (): string =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export const DEFAULT_PROFILE: ClinicProfile = {
  doctorName: "",
  qualification: "BDS",
  registrationNo: "",
  clinicName: "",
  address: "",
  phone: "",
  email: "",
  currency: "₹",
  countryCode: "91",
  patientLanguage: "English",
};

export async function getProfile(): Promise<ClinicProfile> {
  return { ...DEFAULT_PROFILE, ...(await getSetting<Partial<ClinicProfile>>("profile", {})) };
}

/** Ask the browser not to evict our data (important for iPhone PWAs). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

export function newVisit(patientId: string): Visit {
  const now = Date.now();
  return {
    id: uid(),
    patientId,
    date: now,
    chiefComplaint: "",
    history: "",
    examination: "",
    diagnosis: "",
    treatmentDone: "",
    notes: "",
    toothChart: {},
    prescriptions: [],
    plan: [],
    advice: "",
    report: "",
    reportDraft: "",
    paid: 0,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
}

/** Deletes a patient and everything that belongs to them. */
export async function deletePatientCascade(patientId: string): Promise<void> {
  await db.transaction("rw", [db.patients, db.visits, db.images, db.findings, db.appointments], async () => {
    await db.findings.where("patientId").equals(patientId).delete();
    await db.images.where("patientId").equals(patientId).delete();
    await db.visits.where("patientId").equals(patientId).delete();
    await db.appointments.where("patientId").equals(patientId).delete();
    await db.patients.delete(patientId);
  });
}
