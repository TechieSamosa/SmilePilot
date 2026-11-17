import { useEffect, useState } from "react";
import { db, uid } from "../db";
import { COMMON_ALLERGIES, COMMON_CONDITIONS } from "../lib/drugs";
import type { Patient } from "../types";
import { Field, Screen, TagInput, TopBar, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";

const blank = (): Patient => ({
  id: uid(),
  name: "",
  phone: "",
  gender: "",
  allergies: [],
  conditions: [],
  medications: "",
  notes: "",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export default function PatientForm({ id }: { id?: string }) {
  const nav = useNav();
  const toast = useToast();
  const [p, setP] = useState<Patient | null>(id ? null : blank());
  const [ageText, setAgeText] = useState("");

  useEffect(() => {
    if (!id) return;
    db.patients.get(id).then((x) => {
      if (x) {
        setP(x);
        setAgeText(x.age !== undefined ? String(x.age) : "");
      }
    });
  }, [id]);

  if (!p) return null;
  const set = <K extends keyof Patient>(k: K, v: Patient[K]) => setP({ ...p, [k]: v });

  const save = async () => {
    if (!p.name.trim()) return toast("Please enter the patient's name");
    const age = ageText.trim() ? parseInt(ageText, 10) : undefined;
    const rec: Patient = { ...p, name: p.name.trim(), phone: p.phone.trim(), age: isNaN(age as number) ? undefined : age, updatedAt: Date.now() };
    await db.patients.put(rec);
    toast(id ? "Patient updated" : "Patient added");
    if (id) nav.back();
    else nav.replace({ name: "patient", id: rec.id });
  };

  return (
    <>
      <TopBar
        back
        title={id ? "Edit patient" : "New patient"}
        actions={
          <button className="btn sm primary" onClick={save}>
            Save
          </button>
        }
      />
      <Screen tabs={false}>
        <div className="card">
          <Field label="Full name *">
            <input className="input" value={p.name} onChange={(e) => set("name", e.target.value)} autoFocus={!id} autoComplete="off" />
          </Field>
          <Field label="Mobile number">
            <input className="input" value={p.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" />
          </Field>
          <div className="row">
            <Field label="Gender">
              <select className="input" value={p.gender} onChange={(e) => set("gender", e.target.value as Patient["gender"])}>
                <option value="">—</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Age">
              <input className="input" value={ageText} onChange={(e) => setAgeText(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" style={{ width: 90 }} />
            </Field>
          </div>
          <Field label="Date of birth (optional, overrides age)">
            <input className="input" type="date" value={p.dob ?? ""} onChange={(e) => set("dob", e.target.value || undefined)} />
          </Field>
        </div>

        <div className="card">
          <h2>⚠️ Allergies</h2>
          <TagInput value={p.allergies} onChange={(v) => set("allergies", v)} suggestions={COMMON_ALLERGIES} placeholder="Other allergy…" />
        </div>

        <div className="card">
          <h2>🩺 Medical history</h2>
          <TagInput value={p.conditions} onChange={(v) => set("conditions", v)} suggestions={COMMON_CONDITIONS} placeholder="Other condition…" />
          <div className="spacer" />
          <Field label="Current medications">
            <textarea className="input" value={p.medications} onChange={(e) => set("medications", e.target.value)} placeholder="e.g. Metformin 500 mg, Ecosprin 75 mg" />
          </Field>
        </div>

        <div className="card">
          <Field label="Email">
            <input className="input" type="email" value={p.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Address">
            <input className="input" value={p.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Notes">
            <textarea className="input" value={p.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anxious patient, prefers morning slots…" />
          </Field>
        </div>
        <button className="btn primary block" onClick={save}>
          Save patient
        </button>
      </Screen>
    </>
  );
}
