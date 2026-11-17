import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, getProfile, getSetting, setSetting } from "../db";
import { invalidateThresholds, resetCalibration } from "../lib/ai/calibration";
import { DEFAULT_MODEL, testKey } from "../lib/ai/claude";
import { bundledMeta, prefetchModels, resetModel, type ModelTask } from "../lib/ai/detector";
import type { ClinicProfile, ModelMeta } from "../types";
import { Field, Screen, Spinner, TopBar, useConfirm, useFilePicker, useToast } from "../ui/kit";
import { hashPin } from "./Lock";
import { IS_ORTHO_PRESET, PRESET } from "../preset";
import { isNative, openExternal } from "../lib/platform";

const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 — best quality (recommended)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — faster, cheaper" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — fastest, cheapest" },
];

export default function Settings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState<ClinicProfile | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [pin, setPin] = useState("");
  const [testing, setTesting] = useState(false);
  const [dl, setDl] = useState(false);
  const theme = useLiveQuery(() => getSetting<string>("theme", "system"), []);
  const numberTeeth = useLiveQuery(() => getSetting<boolean>("numberTeeth", true), []);
  const orthoOn = useLiveQuery(() => getSetting<boolean>("orthoTools", IS_ORTHO_PRESET), []);
  const hasPin = useLiveQuery(async () => !!(await getSetting<string>("pinHash", "")), []);
  const custom = useLiveQuery(() => db.models.toArray(), []);
  const [bundled, setBundled] = useState<Record<string, ModelMeta | null>>({});
  const [pendingOnnx, setPendingOnnx] = useState<{ task: ModelTask; file: File } | null>(null);

  useEffect(() => {
    getProfile().then(setP);
    getSetting<string>("anthropicKey", "").then(setKey);
    getSetting<string>("claudeModel", DEFAULT_MODEL).then(setModel);
    Promise.all([bundledMeta("pathology"), bundledMeta("teeth")]).then(([a, b]) => setBundled({ pathology: a, teeth: b }));
  }, []);

  const pickOnnx = useFilePicker(".onnx,application/octet-stream", async (files) => {
    const f = files[0]!;
    const task: ModelTask = /teeth|tooth|enum/i.test(f.name) ? "teeth" : "pathology";
    setPendingOnnx({ task, file: f });
    toast(`Now pick the matching ${task}.json`);
  });
  const pickJson = useFilePicker(".json,application/json", async (files) => {
    if (!pendingOnnx) return;
    try {
      const meta = JSON.parse(await files[0]!.text()) as ModelMeta;
      if (!Array.isArray(meta.classes) || !meta.imgsz) throw new Error("Invalid model .json (needs classes and imgsz)");
      const task = (meta.task as ModelTask) || pendingOnnx.task;
      await db.models.put({ task, data: await pendingOnnx.file.arrayBuffer(), meta: { ...meta, version: meta.version ?? pendingOnnx.file.name }, importedAt: Date.now() });
      await resetModel(task);
      invalidateThresholds();
      toast(`New ${task} model installed`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPendingOnnx(null);
    }
  });

  if (!p) return null;
  const set = (k: keyof ClinicProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });

  const saveProfile = async () => {
    await setSetting("profile", p);
    toast("Clinic details saved");
  };

  const saveKey = async () => {
    await setSetting("anthropicKey", key.trim());
    await setSetting("claudeModel", model);
    if (!key.trim()) return toast("AI key removed");
    setTesting(true);
    try {
      await testKey();
      toast("✓ Claude is connected");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const savePin = async () => {
    if (pin.length !== 4) return toast("PIN must be 4 digits");
    await setSetting("pinHash", await hashPin(pin));
    setPin("");
    toast("PIN set");
  };

  return (
    <>
      <TopBar back title="Settings" />
      <Screen tabs={false}>
        <div className="section-title">Clinic & letterhead</div>
        <div className="card">
          <Field label="Doctor name">
            <input className="input" value={p.doctorName} onChange={set("doctorName")} />
          </Field>
          <Field label="Qualification">
            <input className="input" value={p.qualification} onChange={set("qualification")} />
          </Field>
          <Field label="Registration no.">
            <input className="input" value={p.registrationNo} onChange={set("registrationNo")} />
          </Field>
          <Field label="Clinic name">
            <input className="input" value={p.clinicName} onChange={set("clinicName")} />
          </Field>
          <Field label="Address">
            <input className="input" value={p.address} onChange={set("address")} />
          </Field>
          <div className="row">
            <Field label="Phone">
              <input className="input" value={p.phone} onChange={set("phone")} inputMode="tel" />
            </Field>
            <Field label="Country code">
              <input className="input" value={p.countryCode} onChange={set("countryCode")} style={{ width: 80 }} />
            </Field>
          </div>
          <Field label="Email">
            <input className="input" value={p.email} onChange={set("email")} type="email" />
          </Field>
          <div className="row">
            <Field label="Currency symbol">
              <input className="input" value={p.currency} onChange={set("currency")} style={{ width: 80 }} />
            </Field>
            <Field label="Patient message language">
              <input className="input" value={p.patientLanguage} onChange={set("patientLanguage")} />
            </Field>
          </div>
          <button className="btn primary block" onClick={saveProfile}>
            Save clinic details
          </button>
        </div>

        <div className="section-title">✨ Pro AI agent (optional, paid by you)</div>
        <div className="card pro-card">
          <p className="small" style={{ marginTop: 0 }}>
            Everything in the app already works free and offline. Adding your own Claude key turns on an <b>AI agent</b> that can:
          </p>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 0 }}>
            <li>answer clinical questions and draft reports in prose (any Indian language)</li>
            <li>find patients, read records, check your schedule and clinic numbers</li>
            <li>book appointments, update aligner numbers and prepare WhatsApp reminders — always asking you first</li>
            <li>give a second opinion on X-rays and double-check prescriptions</li>
          </ul>
          <details className="small" open={!key}>
            <summary className="bold" style={{ cursor: "pointer", marginBottom: 6 }}>
              How to get your key (5 minutes)
            </summary>
            <ol style={{ paddingLeft: 18, marginTop: 6 }}>
              <li>
                Tap <b>Open Anthropic Console</b> below and sign up (you can use “Continue with Google”).
              </li>
              <li>
                Go to <b>Billing</b> → <b>Buy credits</b>. $5 (about ₹450) is enough to start; most requests cost ₹1–5.
                <br />
                <span className="muted">
                  Note: a “Claude Pro” subscription on claude.ai is different and does <b>not</b> include a key — you need Console credits.
                </span>
              </li>
              <li>
                Optional but wise: <b>Settings → Limits</b> → set a monthly spend limit (e.g. $10).
              </li>
              <li>
                Go to <b>API keys</b> → <b>Create key</b> → name it “{PRESET.appName} app” → <b>Copy</b> (it starts with <code>sk-ant-</code>).
              </li>
              <li>
                Come back here, paste it below and tap <b>Save & test</b>. ✅
              </li>
            </ol>
            <button className="btn block" style={{ marginBottom: 10 }} onClick={() => openExternal("https://console.anthropic.com/settings/keys")}>
              Open Anthropic Console ↗
            </button>
          </details>
          <p className="tiny muted">
            Your key stays only on this phone. When you use an AI feature, that request's text/image goes directly to Anthropic — never to us. You can
            remove the key any time by clearing the field and saving.
          </p>
          <Field label="API key">
            <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} type="password" />
          </Field>
          <Field label="Model">
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn primary block" onClick={saveKey} disabled={testing}>
            {testing ? <Spinner /> : null} Save & test connection
          </button>
        </div>

        <div className="section-title">On-device X-ray AI</div>
        <div className="card">
          {(["pathology", "teeth"] as const).map((t) => {
            const c = custom?.find((m) => m.task === t);
            const b = bundled[t];
            return (
              <div key={t} className="small" style={{ marginBottom: 10 }}>
                <b>{t === "pathology" ? "Findings detector" : "Tooth numbering"}:</b>{" "}
                {c ? `custom (${c.meta.version}, imported ${new Date(c.importedAt).toLocaleDateString()})` : b ? `built-in${b.test_map50 ? ` · test mAP50 ${(b.test_map50 * 100).toFixed(0)}%` : ""}` : "not available"}
                {c && (
                  <button
                    className="btn sm ghost"
                    onClick={async () => {
                      await db.models.delete(t);
                      await resetModel(t);
                      invalidateThresholds();
                      toast("Reverted to built-in model");
                    }}
                  >
                    Revert
                  </button>
                )}
              </div>
            );
          })}
          <label className="row small" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={numberTeeth ?? true} onChange={(e) => setSetting("numberTeeth", e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>Number teeth automatically (FDI)</span>
          </label>
          {isNative() && <p className="tiny muted" style={{ marginTop: -4 }}>The AI models are built into this app and work fully offline.</p>}
          <div className={isNative() ? "" : "btn-grid"}>
            <button
              className="btn"
              style={isNative() ? { display: "none" } : undefined}
              disabled={dl}
              onClick={async () => {
                setDl(true);
                try {
                  await prefetchModels();
                  toast("Models saved for offline use");
                } catch {
                  toast("Download failed — check internet");
                } finally {
                  setDl(false);
                }
              }}
            >
              {dl ? <Spinner /> : null} Download for offline
            </button>
            {pendingOnnx ? (
              <button className="btn primary" onClick={pickJson}>
                Step 2: pick {pendingOnnx.task}.json
              </button>
            ) : (
              <button className={`btn${isNative() ? " block" : ""}`} onClick={pickOnnx}>
                Import improved model
              </button>
            )}
          </div>
          <button
            className="btn ghost block"
            style={{ marginTop: 8 }}
            onClick={async () => {
              if (await confirm({ title: "Reset learned thresholds?", message: "Your review history is kept; thresholds return to defaults until re-learned.", ok: "Reset" })) {
                await resetCalibration();
                toast("Thresholds reset");
              }
            }}
          >
            Reset learned thresholds
          </button>
        </div>

        <div className="section-title">Clinic tools</div>
        <div className="card">
          <label className="row small">
            <input type="checkbox" checked={orthoOn ?? IS_ORTHO_PRESET} onChange={(e) => setSetting("orthoTools", e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>
              <b>Orthodontic tools</b> — aligner & braces tracking, aligner-change reminders, ortho examination, ortho procedures and fees
            </span>
          </label>
        </div>

        <div className="section-title">Security & display</div>
        <div className="card">
          <Field label={hasPin ? "Change 4-digit PIN" : "Set a 4-digit PIN"}>
            <div className="row">
              <input className="input grow" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" placeholder="••••" />
              <button className="btn" onClick={savePin}>
                Save
              </button>
            </div>
          </Field>
          {hasPin && (
            <button
              className="btn ghost block"
              onClick={async () => {
                await setSetting("pinHash", "");
                toast("PIN removed");
              }}
            >
              Remove PIN
            </button>
          )}
          <Field label="Theme">
            <select className="input" value={theme ?? "system"} onChange={(e) => setSetting("theme", e.target.value)}>
              <option value="system">Follow phone</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </div>
      </Screen>
    </>
  );
}
