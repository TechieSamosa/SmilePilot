import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { AppointmentSheet } from "../components/AppointmentSheet";
import { PatientPicker } from "../components/PatientPicker";
import { db } from "../db";
import { fmtTime, startOfDay } from "../lib/format";
import type { Appointment, Patient } from "../types";
import { IconCalendar, IconPlus } from "../ui/icons";
import { Empty, ListItem, Screen, Segmented, TopBar } from "../ui/kit";

export default function Appointments() {
  const [range, setRange] = useState<"upcoming" | "past">("upcoming");
  const [pick, setPick] = useState(false);
  const [sheet, setSheet] = useState<{ patient?: Patient; appt?: Appointment } | null>(null);
  const today = startOfDay();
  const data = useLiveQuery(async () => {
    const list =
      range === "upcoming"
        ? await db.appointments.where("start").aboveOrEqual(today).sortBy("start")
        : (await db.appointments.where("start").below(today).sortBy("start")).reverse().slice(0, 200);
    const pats = new Map((await db.patients.bulkGet([...new Set(list.map((a) => a.patientId))])).filter(Boolean).map((p) => [p!.id, p!]));
    return { list, pats };
  }, [range, today]);

  const groups = new Map<string, Appointment[]>();
  for (const a of data?.list ?? []) {
    const d = new Date(a.start);
    const key = d.toDateString();
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const label = (k: string) => {
    const d = new Date(k);
    const diff = Math.round((startOfDay(d.getTime()) - today) / 86400000);
    const base = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    return diff === 0 ? `Today · ${base}` : diff === 1 ? `Tomorrow · ${base}` : base;
  };

  return (
    <>
      <TopBar back title="Appointments" />
      <Screen tabs={false}>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
        />
        {groups.size === 0 && <Empty icon={<IconCalendar />} title={range === "upcoming" ? "No upcoming appointments" : "No past appointments"} />}
        {[...groups.entries()].map(([k, list]) => (
          <div key={k}>
            <div className="section-title">{label(k)}</div>
            <div className="list">
              {list.map((a) => {
                const p = data?.pats.get(a.patientId);
                return (
                  <ListItem
                    key={a.id}
                    icon={<div className="avatar" style={{ fontSize: 12 }}>{fmtTime(a.start).replace(/\s/g, "")}</div>}
                    title={p?.name ?? "Unknown"}
                    sub={`${a.procedure} · ${a.durationMin} min`}
                    right={a.status !== "scheduled" ? <span className={`badge ${a.status === "done" ? "ok" : "danger"}`}>{a.status}</span> : undefined}
                    onClick={() => setSheet({ patient: p, appt: a })}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </Screen>
      <button className="fab" style={{ bottom: "calc(var(--safe-bottom) + 16px)" }} onClick={() => setPick(true)}>
        <IconPlus /> Book
      </button>
      <PatientPicker
        open={pick}
        onClose={() => setPick(false)}
        title="Book appointment for…"
        onPick={(p) => {
          setPick(false);
          setSheet({ patient: p });
        }}
      />
      <AppointmentSheet open={!!sheet} patient={sheet?.patient} appointment={sheet?.appt} onClose={() => setSheet(null)} />
    </>
  );
}
