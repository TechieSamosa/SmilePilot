import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { isClaudeConfigured } from "../lib/ai/claude";
import { AppointmentSheet } from "../components/AppointmentSheet";
import { OrthoCard } from "../components/OrthoCard";
import { useOrtho } from "../ui/useOrtho";
import { db, deletePatientCascade, getProfile, newVisit } from "../db";
import { ageOf, fmtDate, fmtDateTime, fmtMoney, initials, intlPhone, whatsappUrl } from "../lib/format";
import { openExternal } from "../lib/platform";
import type { Appointment } from "../types";
import { IconCalendar, IconChat, IconEdit, IconPhone, IconPlus, IconTrash, IconWhatsApp } from "../ui/icons";
import { Empty, ListItem, Screen, TopBar, useConfirm, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";

export default function PatientDetail({ id }: { id: string }) {
  const nav = useNav();
  const confirm = useConfirm();
  const toast = useToast();
  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  const profile = useLiveQuery(getProfile, []);
  const visits = useLiveQuery(() => db.visits.where("patientId").equals(id).reverse().sortBy("date"), [id]);
  const appts = useLiveQuery(() => db.appointments.where("patientId").equals(id).reverse().sortBy("start"), [id]);
  const images = useLiveQuery(() => db.images.where("patientId").equals(id).count(), [id]);
  const [apptSheet, setApptSheet] = useState<{ open: boolean; appt?: Appointment }>({ open: false });
  const ortho = useOrtho();
  const [online, setOnline] = useState(false);
  useEffect(() => {
    isClaudeConfigured().then(setOnline);
  }, []);

  if (patient === undefined) return null;
  if (!patient) {
    return (
      <>
        <TopBar back title="Patient" />
        <Screen tabs={false}>
          <Empty title="Patient not found" />
        </Screen>
      </>
    );
  }
  const age = ageOf(patient);
  const cur = profile?.currency ?? "₹";
  const balance = (visits ?? []).reduce((s, v) => s + v.plan.filter((x) => x.status === "done").reduce((a, x) => a + (x.cost || 0), 0) - (v.paid || 0), 0);

  const startVisit = async () => {
    const v = newVisit(id);
    await db.visits.add(v);
    await db.patients.update(id, { updatedAt: Date.now() });
    nav.push({ name: "visit", id: v.id });
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${patient.name}?`, message: "All visits, X-rays, findings and appointments of this patient will be permanently deleted.", ok: "Delete", danger: true }))) return;
    await deletePatientCascade(id);
    toast("Patient deleted");
    nav.back();
  };

  return (
    <>
      <TopBar
        back
        title={patient.name}
        sub={[age !== undefined ? `${age} y` : "", patient.gender, patient.phone].filter(Boolean).join(" · ")}
        actions={
          <button className="icon-btn" onClick={() => nav.push({ name: "patientForm", id })} aria-label="Edit">
            <IconEdit />
          </button>
        }
      />
      <Screen tabs={false}>
        <div className="card row">
          <div className="avatar" style={{ width: 54, height: 54, fontSize: 20 }}>
            {initials(patient.name)}
          </div>
          <div className="grow">
            <div className="bold" style={{ fontSize: 18 }}>{patient.name}</div>
            <div className="small muted">Patient since {fmtDate(patient.createdAt)}{images ? ` · ${images} X-ray${images > 1 ? "s" : ""}` : ""}</div>
          </div>
        </div>

        {patient.phone && (
          <div className="btn-grid" style={{ marginBottom: 12 }}>
            <button className="btn" onClick={() => openExternal(`tel:+${intlPhone(patient.phone, profile?.countryCode ?? "91")}`)}>
              <IconPhone /> Call
            </button>
            <button className="btn" onClick={() => openExternal(whatsappUrl(patient.phone, profile?.countryCode ?? "91", `Hello ${patient.name.split(" ")[0]}, `))}>
              <IconWhatsApp /> WhatsApp
            </button>
          </div>
        )}

        {(patient.allergies.length > 0 || patient.conditions.length > 0 || patient.medications) && (
          <div className="card">
            {patient.allergies.length > 0 && (
              <div className="alert danger" style={{ marginBottom: 8 }}>
                <b>Allergies:</b> {patient.allergies.join(", ")}
              </div>
            )}
            {patient.conditions.length > 0 && (
              <div className="small" style={{ marginBottom: 4 }}>
                <b>Medical history:</b> {patient.conditions.join(", ")}
              </div>
            )}
            {patient.medications && (
              <div className="small">
                <b>Medications:</b> {patient.medications}
              </div>
            )}
          </div>
        )}
        {patient.notes && <div className="card small pre">{patient.notes}</div>}

        {(ortho || patient.ortho) && <OrthoCard patient={patient} />}

        {balance > 0 && <div className="alert warn">Outstanding balance: <b>{fmtMoney(balance, cur)}</b></div>}

        <div className="btn-grid">
          <button className="btn primary" onClick={startVisit}>
            <IconPlus /> New visit
          </button>
          <button className="btn" onClick={() => setApptSheet({ open: true })}>
            <IconCalendar /> Book
          </button>
        </div>

        <div className="section-title">Visits</div>
        {visits?.length ? (
          <div className="list">
            {visits.map((v) => (
              <ListItem
                key={v.id}
                title={v.chiefComplaint || v.diagnosis || "Visit"}
                sub={`${fmtDate(v.date)}${v.treatmentDone ? ` · ${v.treatmentDone}` : ""}`}
                right={v.status === "finalized" ? <span className="badge ok">Done</span> : <span className="badge primary">Open</span>}
                onClick={() => nav.push({ name: "visit", id: v.id })}
              />
            ))}
          </div>
        ) : (
          <div className="card small muted">No visits yet.</div>
        )}

        <div className="section-title">Appointments</div>
        {appts?.length ? (
          <div className="list">
            {appts.map((a) => (
              <ListItem
                key={a.id}
                title={a.procedure}
                sub={fmtDateTime(a.start)}
                right={<span className={`badge ${a.status === "scheduled" ? (a.start > Date.now() ? "primary" : "warn") : a.status === "done" ? "ok" : "danger"}`}>{a.status === "scheduled" && a.start < Date.now() ? "past" : a.status}</span>}
                onClick={() => setApptSheet({ open: true, appt: a })}
              />
            ))}
          </div>
        ) : (
          <div className="card small muted">No appointments.</div>
        )}

        <div className={online ? "btn-grid" : ""} style={{ marginTop: 16 }}>
          {online && (
            <button className="btn" onClick={() => nav.push({ name: "assistant", patientId: id })}>
              <IconChat /> Ask AI about patient
            </button>
          )}
          <button className={`btn danger${online ? "" : " block"}`} onClick={remove}>
            <IconTrash /> Delete patient
          </button>
        </div>
      </Screen>
      <AppointmentSheet open={apptSheet.open} appointment={apptSheet.appt} patient={patient} onClose={() => setApptSheet({ open: false })} />
    </>
  );
}
