import type { Appointment, Patient } from "../types";
import { fmtTime } from "./format";
import { downloadBlob, isNative, shareFile } from "./platform";

/** Schedules a phone reminder 1 hour before (Android app). Returns the notification id. */
export async function scheduleReminder(appt: Appointment, patient: Patient | undefined): Promise<number | undefined> {
  if (!isNative()) return undefined;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const r = await LocalNotifications.requestPermissions();
      if (r.display !== "granted") return undefined;
    }
    const at = appt.start - 60 * 60 * 1000;
    if (at <= Date.now()) return undefined;
    const id = Math.floor(Math.random() * 2_000_000_000);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: `Appointment at ${fmtTime(appt.start)}`,
          body: `${patient?.name ?? "Patient"} — ${appt.procedure}`,
          schedule: { at: new Date(at), allowWhileIdle: true },
        },
      ],
    });
    return id;
  } catch (e) {
    console.warn("Reminder not scheduled", e);
    return undefined;
  }
}

export async function cancelReminder(id?: number) {
  if (!id || !isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    /* ignore */
  }
}

function icsDate(t: number) {
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** iPhone: add the appointment to the Calendar app (with an alert) via an .ics file. */
export async function addToCalendar(appt: Appointment, patient: Patient | undefined, clinic: string) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DentalOS//EN",
    "BEGIN:VEVENT",
    `UID:${appt.id}@dentalos`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(appt.start)}`,
    `DTEND:${icsDate(appt.start + appt.durationMin * 60000)}`,
    `SUMMARY:${(patient?.name ?? "Patient").replace(/[,;]/g, " ")} - ${appt.procedure.replace(/[,;]/g, " ")}`,
    `DESCRIPTION:${(appt.notes || "").replace(/\n/g, "\\n").replace(/[,;]/g, " ")}`,
    clinic ? `LOCATION:${clinic.replace(/[,;]/g, " ")}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  if (isNative()) await shareFile(blob, "appointment.ics", "Add to calendar");
  else downloadBlob(blob, "appointment.ics");
}
