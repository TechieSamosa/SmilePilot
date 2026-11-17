import type { VisitPatch } from "../../screens/VisitScreen";
import type { Visit } from "../../types";
import { AutoTextarea, Field } from "../../ui/kit";
import { ORTHO_COMPLAINTS, ORTHO_DIAGNOSES } from "../../lib/ortho";
import { useOrtho } from "../../ui/useOrtho";

const COMPLAINTS = ["Toothache", "Sensitivity", "Swelling", "Bleeding gums", "Broken tooth", "Food lodgement", "Bad breath", "Loose tooth", "Missing teeth", "Discolouration", "Routine check-up", "Braces consult", "Wisdom tooth pain", "Ulcer"];
const DIAGNOSES = [
  "Dental caries",
  "Reversible pulpitis",
  "Symptomatic irreversible pulpitis",
  "Pulp necrosis",
  "Acute apical periodontitis",
  "Chronic apical periodontitis",
  "Acute apical abscess",
  "Chronic generalised gingivitis",
  "Chronic periodontitis",
  "Pericoronitis",
  "Dentine hypersensitivity",
  "Cracked tooth",
  "Impacted third molar",
  "Partial edentulism",
  "Aphthous ulcer",
];

function appendChip(current: string, chip: string): string {
  if (current.toLowerCase().includes(chip.toLowerCase())) return current;
  return current ? `${current.replace(/[,\s]+$/, "")}, ${chip}` : chip;
}

export function NotesTab({ visit, patch }: { visit: Visit; patch: VisitPatch }) {
  const ortho = useOrtho();
  const complaints = ortho ? [...ORTHO_COMPLAINTS, ...COMPLAINTS] : COMPLAINTS;
  const diagnoses = ortho ? [...ORTHO_DIAGNOSES, ...DIAGNOSES] : DIAGNOSES;
  return (
    <>
      <div className="card">
        <Field label="Chief complaint">
          <AutoTextarea value={visit.chiefComplaint} onChange={(e) => patch({ chiefComplaint: e.target.value })} placeholder="Pain in lower right back tooth since 3 days" rows={2} />
        </Field>
        <div className="chips" style={{ marginTop: -4, marginBottom: 12 }}>
          {complaints.map((c) => (
            <button key={c} type="button" className="chip" onClick={() => patch({ chiefComplaint: appendChip(visit.chiefComplaint, c) })}>
              {c}
            </button>
          ))}
        </div>
        <Field label="History of present illness">
          <AutoTextarea value={visit.history} onChange={(e) => patch({ history: e.target.value })} placeholder="Onset, duration, nature of pain, aggravating/relieving factors…" rows={2} />
        </Field>
        <Field label="Clinical examination">
          <AutoTextarea value={visit.examination} onChange={(e) => patch({ examination: e.target.value })} placeholder="Deep carious lesion wrt 46, TOP +ve, no mobility…" />
        </Field>
      </div>
      <div className="card">
        <Field label="Diagnosis">
          <AutoTextarea value={visit.diagnosis} onChange={(e) => patch({ diagnosis: e.target.value })} rows={2} />
        </Field>
        <div className="chips" style={{ marginTop: -4, marginBottom: 12 }}>
          {diagnoses.map((c) => (
            <button key={c} type="button" className="chip" onClick={() => patch({ diagnosis: appendChip(visit.diagnosis, c) })}>
              {c}
            </button>
          ))}
        </div>
        <Field label="Treatment done today">
          <AutoTextarea value={visit.treatmentDone} onChange={(e) => patch({ treatmentDone: e.target.value })} placeholder="Access opening wrt 46, BMP, CaOH dressing" rows={2} />
        </Field>
        <Field label="Other notes">
          <AutoTextarea value={visit.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} />
        </Field>
        <p className="tiny muted" style={{ margin: 0 }}>
          Tip: use the 🎤 microphone on your keyboard to dictate notes. Everything is saved automatically.
        </p>
      </div>
    </>
  );
}
