export type ID = string;

export interface ClinicProfile {
  doctorName: string;
  qualification: string;
  registrationNo: string;
  clinicName: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  countryCode: string; // for WhatsApp links, e.g. "91"
  patientLanguage: string; // default language for patient-friendly explanations
}

export interface Patient {
  id: ID;
  name: string;
  phone: string;
  gender: "" | "Female" | "Male" | "Other";
  dob?: string; // yyyy-mm-dd
  age?: number; // used when dob unknown
  email?: string;
  address?: string;
  allergies: string[];
  conditions: string[]; // medical history e.g. Diabetes, Hypertension, Pregnancy
  medications: string;
  notes: string;
  ortho?: OrthoCase;
  createdAt: number;
  updatedAt: number;
}

export const ORTHO_APPLIANCES = [
  "Clear aligners",
  "Metal braces",
  "Ceramic braces",
  "Self-ligating braces",
  "Lingual braces",
  "Functional appliance",
  "Removable appliance",
  "Retainers only",
] as const;
export type OrthoAppliance = (typeof ORTHO_APPLIANCES)[number];

export interface OrthoCase {
  appliance: OrthoAppliance;
  status: "active" | "retention" | "completed";
  startDate: string; // yyyy-mm-dd
  estMonths: number;
  // clear aligners
  alignerTotal?: number;
  alignerCurrent?: number;
  alignerDays?: number; // days per aligner
  alignerSince?: string; // yyyy-mm-dd the current aligner was started
  // braces
  archwire?: string;
  retainer?: string;
  fee?: number;
  notes?: string;
  updatedAt: number;
}

export interface OrthoExam {
  angleClass?: string;
  overjet?: string;
  overbite?: string;
  crowdingUpper?: string;
  crowdingLower?: string;
  crossbite?: string;
  midline?: string;
  profile?: string;
  habits: string[];
  procedure?: string; // what was done today (e.g. wire change 0.016 NiTi, aligners 7–8 given)
  elastics?: string;
  notes?: string;
}

export type ToothCondition =
  | "caries"
  | "filling"
  | "crown"
  | "rct"
  | "missing"
  | "implant"
  | "extraction_needed"
  | "mobility"
  | "fracture"
  | "impacted"
  | "periapical"
  | "sensitivity";

export interface Rx {
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface PlanItem {
  id: ID;
  tooth?: number;
  procedure: string;
  cost: number;
  status: "planned" | "done";
}

export interface Visit {
  id: ID;
  patientId: ID;
  date: number;
  chiefComplaint: string;
  history: string;
  examination: string;
  diagnosis: string;
  treatmentDone: string;
  notes: string;
  toothChart: Record<string, ToothCondition[]>;
  prescriptions: Rx[];
  plan: PlanItem[];
  advice: string;
  ortho?: OrthoExam;
  report: string; // final clinician-approved report
  reportDraft: string; // last AI draft (kept for learning from edits)
  paid: number;
  status: "open" | "finalized";
  createdAt: number;
  updatedAt: number;
}

export type ImageKind = "OPG" | "IOPA" | "Bitewing" | "CBCT slice" | "Cephalogram" | "Intraoral photo" | "Extraoral photo" | "Other";

export interface XrayImage {
  id: ID;
  visitId: ID;
  patientId: ID;
  kind: ImageKind;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  createdAt: number;
  analyzedAt?: number;
  modelVersion?: string;
  inferenceMs?: number;
  aiSummary?: string; // Claude second opinion text
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FindingStatus = "pending" | "confirmed" | "rejected" | "corrected";
export type FindingSource = "ai" | "dentist" | "claude";

export interface Finding {
  id: ID;
  imageId: ID;
  visitId: ID;
  patientId: ID;
  label: string;
  box?: Box; // image pixels; absent for tooth-level notes from Claude
  confidence: number; // 0..1 (1 for dentist-added)
  tooth?: number; // FDI
  source: FindingSource;
  status: FindingStatus;
  originalLabel?: string;
  originalBox?: Box;
  note?: string;
  modelVersion?: string;
  createdAt: number;
  reviewedAt?: number;
}

export interface Appointment {
  id: ID;
  patientId: ID;
  start: number;
  durationMin: number;
  procedure: string;
  notes: string;
  status: "scheduled" | "done" | "cancelled" | "no-show";
  notificationId?: number;
  createdAt: number;
}

export interface Feedback {
  id: ID;
  kind: "report" | "chat" | "rx-check" | "second-opinion";
  rating: 1 | -1 | 0;
  prompt?: string;
  aiText: string;
  finalText?: string;
  comment?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: ID;
  threadId: ID;
  role: "user" | "assistant";
  content: string;
  rating?: 1 | -1;
  patientId?: ID;
  createdAt: number;
}

export interface Preference {
  id: ID;
  text: string; // e.g. "Prefer Indian brand names for drugs"
  source: "manual" | "learned";
  createdAt: number;
}

export interface CustomModel {
  task: "pathology" | "teeth";
  data: ArrayBuffer;
  meta: ModelMeta;
  importedAt: number;
}

export interface ModelMeta {
  task: string;
  imgsz: number;
  classes: string[];
  version?: string;
  test_map50?: number;
  per_class_map50?: Record<string, number>;
}
