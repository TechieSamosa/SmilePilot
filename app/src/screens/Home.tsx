import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, getProfile, getSetting, newVisit } from "../db";
import { getThresholds, thresholdFor } from "../lib/ai/calibration";
import { fmtMoney, fmtTime, initials, startOfDay, whatsappUrl } from "../lib/format";
import { alignerReminder, changeLabel, daysToChange } from "../lib/ortho";
import { openExternal } from "../lib/platform";
import { useOrtho } from "../ui/useOrtho";
import type { Appointment, Patient } from "../types";
import { AppointmentSheet } from "../components/AppointmentSheet";
import { PatientPicker } from "../components/PatientPicker";
import { IconCalendar, IconChat, IconImage, IconPlus, IconUsers, IconWhatsApp, ToothLogo } from "../ui/icons";
import { ListItem, Screen, TopBar } from "../ui/kit";
import { useNav } from "../ui/nav";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const nav = useNav();
  const profile = useLiveQuery(getProfile, []);
  const [pick, setPick] = useState<null | "visit" | "xray" | "appt">(null);
  const [apptFor, setApptFor] = useState<Patient | null>(null);

  const today = startOfDay();
  const appts = useLiveQuery(
    () => db.appointments.where("start").between(today, today + 86400000).sortBy("start"),
    [today],
  );
  const patients = useLiveQuery(() => db.patients.toArray(), []);
  const pmap = new Map((patients ?? []).map((p) => [p.id, p]));
  const recent = useLiveQuery(() => db.patients.orderBy("updatedAt").reverse().limit(5).toArray(), []);
  const pendingReview = useLiveQuery(async () => {
    const t = await getThresholds();
    const imgs = await db.images.filter((i) => !!i.analyzedAt).toArray();
    let n = 0;
    for (const i of imgs)
      if (await db.findings.where("imageId").equals(i.id).filter((f) => f.status === "pending" && f.source === "ai" && f.confidence >= thresholdFor(f.label, t)).count()) n++;
    return n;
  }, []);
  const dues = useLiveQuery(async () => {
    const visits = await db.visits.toArray();
    let total = 0;
    let count = 0;
    for (const v of visits) {
      const bal = v.plan.filter((x) => x.status === "done").reduce((s, x) => s + (x.cost || 0), 0) - (v.paid || 0);
      if (bal > 0) {
        total += bal;
        count++;
      }
    }
    return { total, count };
  }, []);
  const todayVisits = useLiveQuery(() => db.visits.where("date").aboveOrEqual(today).count(), [today]);
  const ortho = useOrtho();
  const orthoInfo = useLiveQuery(async () => {
    const all = await db.patients.filter((p) => !!p.ortho).toArray();
    const due = all
      .map((p) => ({ p, d: daysToChange(p.ortho) }))
      .filter((x): x is { p: Patient; d: number } => x.d !== null && x.d <= 2)
      .sort((a, b) => a.d - b.d);
    return { active: all.filter((p) => p.ortho!.status === "active").length, due };
  }, []);
  const backupDue = useLiveQuery(async () => {
    const last = await getSetting<number>("lastBackupAt", 0);
    return (await db.patients.count()) >= 3 && Date.now() - last > 7 * 86400000;
  }, []);

  const onPicked = async (p: Patient) => {
    const what = pick;
    setPick(null);
    if (what === "appt") {
      setApptFor(p);
      return;
    }
    const v = newVisit(p.id);
    await db.visits.add(v);
    await db.patients.update(p.id, { updatedAt: Date.now() });
    nav.push({ name: "visit", id: v.id, tab: what === "xray" ? "xrays" : "notes" });
  };

  const name = profile?.doctorName?.replace(/^dr\.?\s*/i, "") ?? "";
  return (
    <>
      <TopBar
        leading={
          <div className="brand-mark">
            <ToothLogo />
          </div>
        }
        title={`${greeting()}${name ? `, Dr. ${name.split(" ")[0]}` : ""}`}
        sub={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      />
      <Screen>
        <div className="stat-grid">
          <div className="stat">
            <div className="v">{appts?.filter((a) => a.status !== "cancelled").length ?? 0}</div>
            <div className="l">Appointments today</div>
          </div>
          <div className="stat">
            <div className="v">{ortho ? (orthoInfo?.active ?? 0) : (todayVisits ?? 0)}</div>
            <div className="l">{ortho ? "In braces / aligners" : "Visits today"}</div>
          </div>
          <div className="stat" onClick={() => nav.push({ name: "patients" })}>
            <div className="v">{patients?.length ?? 0}</div>
            <div className="l">Patients</div>
          </div>
        </div>

        <div className="btn-grid" style={{ marginBottom: 12 }}>
          <button className="btn primary" onClick={() => setPick("visit")}>
            <IconPlus /> New visit
          </button>
          <button className="btn" onClick={() => setPick("xray")}>
            <IconImage /> Analyse X-ray
          </button>
          <button className="btn" onClick={() => nav.push({ name: "patientForm" })}>
            <IconUsers /> New patient
          </button>
          <button className="btn" onClick={() => nav.tab({ name: "assistant" })}>
            <IconChat /> Reference
          </button>
        </div>

        {backupDue && (
          <div className="alert danger" onClick={() => nav.push({ name: "backup" })}>
            <b>Back up your records.</b> Patient data lives only on this phone — tap to save a backup to Drive/WhatsApp.
          </div>
        )}

        {ortho && orthoInfo && orthoInfo.due.length > 0 && (
          <>
            <div className="section-title">Aligner changes due</div>
            <div className="list">
              {orthoInfo.due.map(({ p, d }) => (
                <div key={p.id} className="list-item">
                  <div className="avatar">{initials(p.name)}</div>
                  <button className="grow" style={{ textAlign: "left", background: "none", border: 0, padding: 0 }} onClick={() => nav.push({ name: "patient", id: p.id })}>
                    <div className="bold ellipsis">{p.name}</div>
                    <div className={`small ${d < 0 ? "" : "muted"}`} style={d < 0 ? { color: "var(--warn)" } : undefined}>
                      #{(p.ortho!.alignerCurrent ?? 0) + 1}
                      {p.ortho!.alignerTotal ? ` of ${p.ortho!.alignerTotal}` : ""} · {changeLabel(p.ortho)}
                    </div>
                  </button>
                  {p.phone && (
                    <button
                      className="icon-btn"
                      style={{ color: "var(--primary)" }}
                      aria-label="WhatsApp reminder"
                      onClick={() => openExternal(whatsappUrl(p.phone, profile?.countryCode ?? "91", alignerReminder(p, profile?.clinicName ?? "", profile?.doctorName ?? "", profile?.patientLanguage)))}
                    >
                      <IconWhatsApp />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {!!pendingReview && (
          <div className="alert warn" onClick={() => nav.push({ name: "insights" })}>
            <b>{pendingReview} X-ray{pendingReview > 1 ? "s" : ""}</b> {pendingReview > 1 ? "have" : "has"} AI findings waiting for your review. Reviewing them makes the AI more
            accurate for you.
          </div>
        )}

        <div className="section-title row">
          <span className="grow">Today's schedule</span>
          <button className="btn sm ghost" onClick={() => nav.push({ name: "appointments" })}>
            <IconCalendar /> All
          </button>
        </div>
        {appts && appts.length > 0 ? (
          <div className="list">
            {appts.map((a: Appointment) => {
              const p = pmap.get(a.patientId);
              return (
                <ListItem
                  key={a.id}
                  icon={<div className="avatar" style={{ fontSize: 13 }}>{fmtTime(a.start).replace(/\s/g, "")}</div>}
                  title={p?.name ?? "Unknown patient"}
                  sub={`${a.procedure}${a.notes ? ` · ${a.notes}` : ""}`}
                  right={a.status !== "scheduled" ? <span className={`badge ${a.status === "done" ? "ok" : "danger"}`}>{a.status}</span> : undefined}
                  onClick={() => p && nav.push({ name: "patient", id: p.id })}
                />
              );
            })}
          </div>
        ) : (
          <div className="card small muted row">
            <span className="grow">No appointments today.</span>
            <button className="btn sm" onClick={() => setPick("appt")}>
              <IconPlus /> Book
            </button>
          </div>
        )}

        {dues && dues.total > 0 && (
          <>
            <div className="section-title">Pending payments</div>
            <div className="card row">
              <div className="grow">
                <div className="bold" style={{ fontSize: 20 }}>{fmtMoney(dues.total, profile?.currency ?? "₹")}</div>
                <div className="small muted">due across {dues.count} visit{dues.count > 1 ? "s" : ""}</div>
              </div>
            </div>
          </>
        )}

        <div className="section-title">Recent patients</div>
        {recent && recent.length ? (
          <div className="list">
            {recent.map((p) => (
              <ListItem key={p.id} icon={<div className="avatar">{initials(p.name)}</div>} title={p.name} sub={p.phone} onClick={() => nav.push({ name: "patient", id: p.id })} />
            ))}
          </div>
        ) : (
          <div className="card small muted">Add your first patient to get started.</div>
        )}
      </Screen>
      <PatientPicker
        open={!!pick}
        onClose={() => setPick(null)}
        onPick={onPicked}
        title={pick === "appt" ? "Book appointment for…" : pick === "xray" ? "X-ray for which patient?" : "New visit for…"}
      />
      <AppointmentSheet open={!!apptFor} patient={apptFor ?? undefined} onClose={() => setApptFor(null)} />
    </>
  );
}
