import { useEffect, useState } from "react";
import { db, getProfile, uid } from "../db";
import { fmtDateTime, toLocalInput, whatsappUrl } from "../lib/format";
import { addToCalendar, cancelReminder, scheduleReminder } from "../lib/notify";
import { isNative, openExternal } from "../lib/platform";
import type { Appointment, Patient } from "../types";
import { IconCalendar, IconTrash, IconWhatsApp } from "../ui/icons";
import { Field, Sheet, useConfirm, useToast } from "../ui/kit";
import { ORTHO_PROCEDURES } from "../lib/ortho";
import { useOrtho } from "../ui/useOrtho";

export const PROCEDURES = [
  "Consultation",
  "Follow-up / Review",
  "Scaling & polishing",
  "Restoration (filling)",
  "Root canal treatment",
  "RCT follow-up / obturation",
  "Extraction",
  "Surgical extraction (3rd molar)",
  "Crown preparation",
  "Crown / bridge cementation",
  "Impression",
  "Implant",
  "Orthodontic adjustment",
  "Denture trial / insertion",
  "Suture removal",
  "Paediatric treatment",
];

export function AppointmentSheet({
  open,
  onClose,
  patient,
  appointment,
}: {
  open: boolean;
  onClose: () => void;
  patient?: Patient;
  appointment?: Appointment;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState(30);
  const [procedure, setProcedure] = useState(PROCEDURES[0]!);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Appointment["status"]>("scheduled");
  const ortho = useOrtho();
  const procedures = ortho ? [...ORTHO_PROCEDURES, ...PROCEDURES] : PROCEDURES;

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setStart(toLocalInput(appointment.start));
      setDuration(appointment.durationMin);
      setProcedure(appointment.procedure);
      setNotes(appointment.notes);
      setStatus(appointment.status);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(10, 0, 0, 0);
      setStart(toLocalInput(d.getTime()));
      setDuration(30);
      setProcedure(ortho && patient?.ortho ? (patient.ortho.appliance === "Clear aligners" ? "Aligner check / next trays" : "Wire change / adjustment") : "Follow-up / Review");
      setNotes("");
      setStatus("scheduled");
    }
  }, [open, appointment]);

  const save = async (sendWhatsApp: boolean) => {
    if (!patient) return;
    const t = new Date(start).getTime();
    if (!t) return toast("Pick a date and time");
    const a: Appointment = {
      id: appointment?.id ?? uid(),
      patientId: patient.id,
      start: t,
      durationMin: duration,
      procedure,
      notes,
      status,
      createdAt: appointment?.createdAt ?? Date.now(),
      notificationId: appointment?.notificationId,
    };
    await cancelReminder(appointment?.notificationId);
    a.notificationId = status === "scheduled" ? await scheduleReminder(a, patient) : undefined;
    await db.appointments.put(a);
    toast(appointment ? "Appointment updated" : "Appointment booked");
    onClose();
    if (sendWhatsApp && patient.phone) {
      const p = await getProfile();
      const msg = `Hello ${patient.name.split(" ")[0]}, your dental appointment (${procedure}) is confirmed for ${fmtDateTime(t)}${p.clinicName ? ` at ${p.clinicName}` : ""}${p.address ? `, ${p.address}` : ""}. Please reply to reschedule. — ${p.doctorName}`;
      openExternal(whatsappUrl(patient.phone, p.countryCode, msg));
    }
  };

  const remove = async () => {
    if (!appointment || !(await confirm({ title: "Delete appointment?", ok: "Delete", danger: true }))) return;
    await cancelReminder(appointment.notificationId);
    await db.appointments.delete(appointment.id);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${appointment ? "Edit" : "Book"} appointment${patient ? ` · ${patient.name}` : ""}`}>
      <Field label="Date & time">
        <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Procedure">
          <input className="input" list="procedures" value={procedure} onChange={(e) => setProcedure(e.target.value)} />
          <datalist id="procedures">
            {procedures.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Minutes">
          <select className="input" value={duration} onChange={(e) => setDuration(+e.target.value)} style={{ width: 96 }}>
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. bring previous X-rays, fasting not needed" />
      </Field>
      {appointment && (
        <Field label="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Appointment["status"])}>
            <option value="scheduled">Scheduled</option>
            <option value="done">Completed</option>
            <option value="no-show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
      )}
      <div className="stack">
        {patient?.phone && (
          <button className="btn primary block" onClick={() => save(true)}>
            <IconWhatsApp /> Save & send WhatsApp confirmation
          </button>
        )}
        <div className="btn-grid">
          <button className={`btn ${patient?.phone ? "" : "primary"}`} onClick={() => save(false)}>
            Save
          </button>
          {!isNative() && appointment ? (
            <button className="btn" onClick={async () => addToCalendar(appointment, patient, (await getProfile()).clinicName)}>
              <IconCalendar /> Add to Calendar
            </button>
          ) : appointment ? (
            <button className="btn danger" onClick={remove}>
              <IconTrash /> Delete
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
        {!isNative() && appointment && (
          <button className="btn danger block" onClick={remove}>
            <IconTrash /> Delete
          </button>
        )}
        {isNative() && <p className="tiny muted center">You will get a phone reminder 1 hour before.</p>}
      </div>
    </Sheet>
  );
}
