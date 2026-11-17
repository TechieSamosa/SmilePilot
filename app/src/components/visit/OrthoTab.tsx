import type { VisitPatch } from "../../screens/VisitScreen";
import type { OrthoExam, Patient, Visit } from "../../types";
import { AutoTextarea, ChipToggle, Field, FieldGroup } from "../../ui/kit";
import { progressText } from "../../lib/ortho";

const one = (label: string, value: string | undefined, options: string[], set: (v: string) => void) => (
  <FieldGroup label={label}>
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={`chip${value === o ? " on" : ""}`} onClick={() => set(value === o ? "" : o)}>
          {o}
        </button>
      ))}
    </div>
  </FieldGroup>
);

/** Orthodontic examination & today's ortho procedure. */
export function OrthoTab({ visit, patient, patch }: { visit: Visit; patient: Patient; patch: VisitPatch }) {
  const ex: OrthoExam = visit.ortho ?? { habits: [] };
  const set = (p: Partial<OrthoExam>) => patch({ ortho: { ...ex, ...p } });
  return (
    <>
      {patient.ortho && (
        <div className="alert info small">
          <b>{patient.ortho.appliance}</b> — {progressText(patient.ortho)}
        </div>
      )}
      <div className="card">
        <h2>Today's orthodontic procedure</h2>
        <Field label="Done today">
          <AutoTextarea
            value={ex.procedure ?? ""}
            onChange={(e) => set({ procedure: e.target.value })}
            rows={2}
            placeholder="e.g. Wire change to 0.016 NiTi upper & lower · Aligners 7–9 given, attachments checked"
          />
        </Field>
        <div className="chips" style={{ marginTop: -4, marginBottom: 12 }}>
          {["Wire change", "Elastics given", "Bracket rebonded", "Aligners given", "IPR done", "Attachments placed", "Retainer check", "Scan taken"].map((c) => (
            <button key={c} type="button" className="chip" onClick={() => set({ procedure: ex.procedure ? `${ex.procedure.replace(/[,\s]+$/, "")}, ${c}` : c })}>
              + {c}
            </button>
          ))}
        </div>
        <Field label="Elastics">
          <input className="input" value={ex.elastics ?? ""} onChange={(e) => set({ elastics: e.target.value })} placeholder="e.g. Class II, 3/16 medium, full-time" />
        </Field>
      </div>

      <div className="card">
        <h2>Orthodontic assessment</h2>
        {one("Molar relation (Angle)", ex.angleClass, ["Class I", "Class II div 1", "Class II div 2", "Class III"], (v) => set({ angleClass: v }))}
        <div className="row">
          <Field label="Overjet (mm)">
            <input className="input" inputMode="decimal" value={ex.overjet ?? ""} onChange={(e) => set({ overjet: e.target.value })} />
          </Field>
          <Field label="Overbite (mm / %)">
            <input className="input" value={ex.overbite ?? ""} onChange={(e) => set({ overbite: e.target.value })} />
          </Field>
        </div>
        {one("Crowding — upper", ex.crowdingUpper, ["None", "Mild", "Moderate", "Severe", "Spacing"], (v) => set({ crowdingUpper: v }))}
        {one("Crowding — lower", ex.crowdingLower, ["None", "Mild", "Moderate", "Severe", "Spacing"], (v) => set({ crowdingLower: v }))}
        {one("Crossbite", ex.crossbite, ["None", "Anterior", "Posterior — right", "Posterior — left", "Bilateral"], (v) => set({ crossbite: v }))}
        {one("Profile", ex.profile, ["Straight", "Convex", "Concave"], (v) => set({ profile: v }))}
        <Field label="Midline">
          <input className="input" value={ex.midline ?? ""} onChange={(e) => set({ midline: e.target.value })} placeholder="e.g. Lower midline 2 mm to right" />
        </Field>
        <FieldGroup label="Habits">
          <ChipToggle options={["Thumb sucking", "Mouth breathing", "Tongue thrust", "Lip biting", "Bruxism", "Nail biting"]} value={ex.habits} onChange={(v) => set({ habits: v })} />
        </FieldGroup>
        <Field label="Notes">
          <AutoTextarea value={ex.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </>
  );
}

export function orthoSummary(ex?: OrthoExam): string[] {
  if (!ex) return [];
  return [
    ex.angleClass && `Molar relation: Angle's ${ex.angleClass}`,
    ex.overjet && `Overjet: ${ex.overjet} mm`,
    ex.overbite && `Overbite: ${ex.overbite}`,
    (ex.crowdingUpper || ex.crowdingLower) && `Crowding: upper ${ex.crowdingUpper || "—"}, lower ${ex.crowdingLower || "—"}`,
    ex.crossbite && ex.crossbite !== "None" && `Crossbite: ${ex.crossbite}`,
    ex.midline && `Midline: ${ex.midline}`,
    ex.profile && `Profile: ${ex.profile}`,
    ex.habits.length > 0 && `Habits: ${ex.habits.join(", ")}`,
    ex.notes,
  ].filter(Boolean) as string[];
}
