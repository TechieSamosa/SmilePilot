import { useState } from "react";
import { DEFAULT_PROFILE, setSetting } from "../db";
import { PRESET } from "../preset";
import type { ClinicProfile } from "../types";
import { ToothLogo } from "../ui/icons";
import { Field } from "../ui/kit";
import { hashPin } from "./Lock";

const LANGS = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu", "Odia"];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<ClinicProfile>({ ...DEFAULT_PROFILE, ...PRESET.profile });
  const [pin, setPin] = useState("");
  const [agree, setAgree] = useState(false);
  const set = (k: keyof ClinicProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });

  const finish = async () => {
    await setSetting("profile", p);
    if (pin.length === 4) await setSetting("pinHash", await hashPin(pin));
    await setSetting("onboarded", true);
    onDone();
  };

  return (
    <div className="app">
      <main className="content no-tabs" style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">
            <ToothLogo />
          </div>
          <div>
            <div className="bold" style={{ fontSize: 20 }}>{PRESET.appName}</div>
            <div className="small muted">{PRESET.welcome ?? "Your AI dental clinic assistant"}</div>
          </div>
        </div>
        <div className="progress" style={{ marginBottom: 18 }}>
          <i style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>

        {step === 0 && (
          <div className="card">
            <h2>Welcome, Doctor 👋</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              These details appear on prescriptions, reports and WhatsApp messages. You can change them later in Settings.
            </p>
            <Field label="Your name (as on prescription)">
              <input className="input" value={p.doctorName} onChange={set("doctorName")} placeholder="Dr. Sowmya B." autoComplete="name" />
            </Field>
            <Field label="Qualification">
              <input className="input" value={p.qualification} onChange={set("qualification")} placeholder="BDS, MDS (Endodontics)" />
            </Field>
            <Field label="Dental Council registration no.">
              <input className="input" value={p.registrationNo} onChange={set("registrationNo")} placeholder="e.g. A-12345" />
            </Field>
            <Field label="Clinic name">
              <input className="input" value={p.clinicName} onChange={set("clinicName")} placeholder="Smile Dental Care" />
            </Field>
            <Field label="Clinic address">
              <input className="input" value={p.address} onChange={set("address")} />
            </Field>
            <div className="row">
              <Field label="Clinic phone">
                <input className="input" value={p.phone} onChange={set("phone")} inputMode="tel" />
              </Field>
              <Field label="Country code">
                <input className="input" value={p.countryCode} onChange={set("countryCode")} inputMode="numeric" style={{ width: 90 }} />
              </Field>
            </div>
            <Field label="Language for patient messages">
              <select className="input" value={p.patientLanguage} onChange={set("patientLanguage")}>
                {LANGS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <button className="btn primary block" disabled={!p.doctorName.trim()} onClick={() => setStep(1)}>
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <h2>Protect patient data 🔒</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              All patient records and X-rays stay on this phone. Set a 4-digit PIN so nobody else can open them.
            </p>
            <Field label="4-digit PIN (optional, recommended)">
              <input
                className="input"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                type="password"
                placeholder="••••"
              />
            </Field>
            <div className="btn-grid">
              <button className="btn" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn primary" disabled={pin.length > 0 && pin.length < 4} onClick={() => setStep(2)}>
                {pin.length === 4 ? "Continue" : "Skip"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <h2>You're all set ✅</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Everything in {PRESET.appName} is free and works on this phone without internet: patients, X-ray AI, tooth chart, prescriptions with
              safety checks, case records, WhatsApp messages, bills and appointments. Your patients' data never leaves this phone.
            </p>
            <label className="row small" style={{ alignItems: "flex-start", margin: "6px 0 14px" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
              <span>
                I understand {PRESET.appName} is a <b>decision-support tool</b>. AI findings can be wrong and must be verified clinically; diagnosis
                and treatment decisions remain my responsibility.
              </span>
            </label>
            <div className="btn-grid">
              <button className="btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn primary" disabled={!agree} onClick={finish}>
                Start using {PRESET.appName}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
