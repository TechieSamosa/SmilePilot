import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db, getProfile } from "../db";
import { whatsappUrl } from "../lib/format";
import { blobUrlCache } from "../lib/image";
import { alignerReminder, changeLabel, daysToChange, isAligner, progress, progressText, todayISO } from "../lib/ortho";
import { openExternal } from "../lib/platform";
import { ORTHO_APPLIANCES, type OrthoCase, type Patient } from "../types";
import { IconEdit, IconPlus, IconWhatsApp } from "../ui/icons";
import { Field, Segmented, Sheet, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";

const PHOTO_KINDS = ["Intraoral photo", "Extraoral photo", "Cephalogram", "OPG"];

export function OrthoCard({ patient }: { patient: Patient }) {
  const nav = useNav();
  const toast = useToast();
  const profile = useLiveQuery(getProfile, []);
  const [edit, setEdit] = useState<OrthoCase | null>(null);
  const urls = useMemo(() => blobUrlCache(), []);
  useEffect(() => () => urls.clear(), [urls]);
  const photos = useLiveQuery(
    () => db.images.where("patientId").equals(patient.id).filter((i) => PHOTO_KINDS.includes(i.kind)).sortBy("createdAt"),
    [patient.id],
  );
  const o = patient.ortho;

  const save = async (oc: OrthoCase) => {
    await db.patients.update(patient.id, { ortho: { ...oc, updatedAt: Date.now() }, updatedAt: Date.now() });
    setEdit(null);
    toast("Orthodontic treatment saved");
  };

  const nextAligner = async () => {
    if (!o) return;
    const cur = (o.alignerCurrent ?? 0) + 1;
    await db.patients.update(patient.id, { ortho: { ...o, alignerCurrent: cur, alignerSince: todayISO(), updatedAt: Date.now() } });
    toast(`Now on aligner ${cur}${o.alignerTotal ? ` of ${o.alignerTotal}` : ""}`);
  };

  const remind = () => {
    if (!patient.phone) return toast("Add the patient's phone number first");
    openExternal(whatsappUrl(patient.phone, profile?.countryCode ?? "91", alignerReminder(patient, profile?.clinicName ?? "", profile?.doctorName ?? "", profile?.patientLanguage)));
  };

  const start = () =>
    setEdit({ appliance: "Clear aligners", status: "active", startDate: todayISO(), estMonths: 12, alignerDays: 14, alignerCurrent: 1, alignerSince: todayISO(), updatedAt: Date.now() });

  const due = daysToChange(o);
  return (
    <>
      <div className="card ortho-card">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            😁 Orthodontic treatment
          </h2>
          {o && (
            <button className="icon-btn" onClick={() => setEdit({ ...o })} aria-label="Edit treatment">
              <IconEdit />
            </button>
          )}
        </div>
        {!o ? (
          <button className="btn block" style={{ marginTop: 10 }} onClick={start}>
            <IconPlus /> Start braces / aligner treatment
          </button>
        ) : (
          <>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="badge primary">{o.appliance}</span>
              <span className={`badge ${o.status === "active" ? "ok" : ""}`}>{o.status}</span>
              <span className="small muted grow" style={{ textAlign: "right" }}>
                since {new Date(o.startDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </span>
            </div>
            <div className="small" style={{ margin: "10px 0 4px" }}>
              {progressText(o)}
            </div>
            <div className="progress">
              <i style={{ width: `${Math.round(progress(o) * 100)}%` }} />
            </div>
            {isAligner(o) && o.status === "active" && (
              <>
                {changeLabel(o) && (
                  <div className={`alert ${due !== null && due <= 0 ? "warn" : "info"} small`} style={{ marginTop: 10 }}>
                    {changeLabel(o)?.replace(/^./, (c) => c.toUpperCase())}
                  </div>
                )}
                <div className="btn-grid" style={{ marginTop: 6 }}>
                  <button className="btn" onClick={nextAligner}>
                    ✓ Switched to #{(o.alignerCurrent ?? 0) + 1}
                  </button>
                  <button className="btn" onClick={remind}>
                    <IconWhatsApp /> Remind
                  </button>
                </div>
              </>
            )}
            {o.notes && <p className="small muted pre" style={{ marginBottom: 0 }}>{o.notes}</p>}
          </>
        )}
        {photos && photos.length > 0 && (
          <>
            <div className="small bold muted" style={{ margin: "12px 0 6px" }}>
              Progress photos & records
            </div>
            <div className="photo-strip">
              {photos.map((p) => (
                <button key={p.id} className="thumb" onClick={() => nav.push({ name: "xray", id: p.id })}>
                  <img src={urls.get(p.id, p.thumb)} alt={p.kind} />
                  <span className="badge">{new Date(p.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Orthodontic treatment">
        {edit && (
          <>
            <Field label="Appliance">
              <select className="input" value={edit.appliance} onChange={(e) => setEdit({ ...edit, appliance: e.target.value as OrthoCase["appliance"] })}>
                {ORTHO_APPLIANCES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Segmented
              value={edit.status}
              onChange={(v) => setEdit({ ...edit, status: v })}
              options={[
                { value: "active", label: "Active" },
                { value: "retention", label: "Retention" },
                { value: "completed", label: "Completed" },
              ]}
            />
            <div className="row">
              <Field label="Started on">
                <input className="input" type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} />
              </Field>
              <Field label="Est. months">
                <input className="input" inputMode="numeric" value={edit.estMonths || ""} onChange={(e) => setEdit({ ...edit, estMonths: +e.target.value.replace(/\D/g, "") || 0 })} style={{ width: 90 }} />
              </Field>
            </div>
            {edit.appliance === "Clear aligners" ? (
              <>
                <div className="row">
                  <Field label="Current aligner">
                    <input className="input" inputMode="numeric" value={edit.alignerCurrent ?? ""} onChange={(e) => setEdit({ ...edit, alignerCurrent: +e.target.value.replace(/\D/g, "") || undefined })} />
                  </Field>
                  <Field label="Total aligners">
                    <input className="input" inputMode="numeric" value={edit.alignerTotal ?? ""} onChange={(e) => setEdit({ ...edit, alignerTotal: +e.target.value.replace(/\D/g, "") || undefined })} />
                  </Field>
                </div>
                <div className="row">
                  <Field label="Days per aligner">
                    <select className="input" value={edit.alignerDays ?? 14} onChange={(e) => setEdit({ ...edit, alignerDays: +e.target.value })}>
                      {[7, 10, 14, 21].map((d) => (
                        <option key={d} value={d}>
                          {d} days
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Current aligner since">
                    <input className="input" type="date" value={edit.alignerSince ?? ""} onChange={(e) => setEdit({ ...edit, alignerSince: e.target.value })} />
                  </Field>
                </div>
              </>
            ) : (
              edit.appliance !== "Retainers only" && (
                <Field label="Current archwire / stage">
                  <input className="input" list="archwires" value={edit.archwire ?? ""} onChange={(e) => setEdit({ ...edit, archwire: e.target.value })} placeholder="0.014 NiTi" />
                  <datalist id="archwires">
                    {["0.012 NiTi", "0.014 NiTi", "0.016 NiTi", "0.018 NiTi", "0.016x0.022 NiTi", "0.017x0.025 NiTi", "0.019x0.025 NiTi", "0.019x0.025 SS", "Finishing & detailing"].map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </Field>
              )
            )}
            {edit.status !== "active" && (
              <Field label="Retainer">
                <input className="input" list="retainers" value={edit.retainer ?? ""} onChange={(e) => setEdit({ ...edit, retainer: e.target.value })} />
                <datalist id="retainers">
                  {["Fixed lingual retainer", "Essix (clear) retainer", "Hawley retainer", "Vivera retainer"].map((w) => (
                    <option key={w} value={w} />
                  ))}
                </datalist>
              </Field>
            )}
            <Field label="Notes">
              <textarea className="input" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Extraction plan, elastics, attachments, IPR schedule…" />
            </Field>
            <button className="btn primary block" onClick={() => save(edit)}>
              Save
            </button>
            {patient.ortho && (
              <button
                className="btn ghost block"
                style={{ marginTop: 6 }}
                onClick={async () => {
                  await db.patients.update(patient.id, { ortho: undefined });
                  setEdit(null);
                }}
              >
                Remove orthodontic treatment
              </button>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
