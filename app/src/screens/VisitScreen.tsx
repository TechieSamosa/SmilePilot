import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToothChart } from "../components/ToothChart";
import { BillTab } from "../components/visit/BillTab";
import { NotesTab } from "../components/visit/NotesTab";
import { OrthoTab } from "../components/visit/OrthoTab";
import { useOrtho } from "../ui/useOrtho";
import { ReportTab } from "../components/visit/ReportTab";
import { RxTab } from "../components/visit/RxTab";
import { XraysTab } from "../components/visit/XraysTab";
import { db, getSetting, uid } from "../db";
import { fmtDate } from "../lib/format";
import type { Patient, Visit } from "../types";
import { IconTrash } from "../ui/icons";
import { Screen, Segmented, TopBar, useConfirm, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";

type Tab = "notes" | "ortho" | "chart" | "xrays" | "rx" | "bill" | "report";

export type VisitPatch = (p: Partial<Visit>) => void;

export default function VisitScreen({ id, initialTab }: { id: string; initialTab?: string }) {
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || "notes");
  const dirty = useRef<Visit | null>(null);
  const timer = useRef<number>(undefined);
  const ortho = useOrtho();
  const imgCount = useLiveQuery(() => db.images.where("visitId").equals(id).count(), [id]);

  useEffect(() => {
    (async () => {
      const v = await db.visits.get(id);
      if (!v) return;
      setVisit(v);
      setPatient((await db.patients.get(v.patientId)) ?? null);
    })();
  }, [id]);

  // keep patient fresh (allergies edited elsewhere)
  useLiveQuery(async () => {
    if (visit) setPatient((await db.patients.get(visit.patientId)) ?? null);
  }, [visit?.patientId]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (dirty.current) {
      const v = dirty.current;
      dirty.current = null;
      await db.visits.put(v);
    }
  }, []);

  useEffect(() => () => void flush(), [flush]);
  useEffect(() => {
    const h = () => void flush();
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [flush]);

  const patch: VisitPatch = useCallback(
    (p) => {
      setVisit((v) => {
        if (!v) return v;
        const nv = { ...v, ...p, updatedAt: Date.now() };
        dirty.current = nv;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 600);
        return nv;
      });
    },
    [flush],
  );

  if (!visit || !patient) return null;
  const locked = visit.status === "finalized";

  const addPlan = async (tooth: number, procedure: string) => {
    const fees = await getSetting<Record<string, number>>("fees", {});
    patch({ plan: [...visit.plan, { id: uid(), tooth, procedure, cost: fees[procedure] ?? 0, status: "planned" }] });
    toast(`Added: #${tooth} ${procedure}`);
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete this visit?", message: "Notes, X-rays and findings of this visit will be deleted.", ok: "Delete", danger: true }))) return;
    await db.transaction("rw", [db.visits, db.images, db.findings], async () => {
      await db.findings.where("visitId").equals(id).delete();
      await db.images.where("visitId").equals(id).delete();
      await db.visits.delete(id);
    });
    dirty.current = null;
    nav.back();
  };

  return (
    <>
      <TopBar
        back
        title={patient.name}
        sub={`Visit · ${fmtDate(visit.date)}${locked ? " · finalized" : ""}`}
        actions={
          <button className="icon-btn" onClick={remove} aria-label="Delete visit">
            <IconTrash />
          </button>
        }
      />
      <Screen tabs={false}>
        {patient.allergies.length > 0 && (
          <div className="alert danger small">
            <b>Allergies:</b> {patient.allergies.join(", ")}
          </div>
        )}
        <Segmented<Tab>
          className={ortho ? "grid7" : "grid6"}
          value={tab}
          onChange={async (t) => {
            await flush();
            setTab(t);
          }}
          options={[
            { value: "notes", label: "Notes" },
            ...(ortho ? [{ value: "ortho" as Tab, label: "Ortho" }] : []),
            { value: "chart", label: "Chart" },
            { value: "xrays", label: <>X-rays{imgCount ? <span className="count">{imgCount}</span> : null}</> },
            { value: "rx", label: <>Rx{visit.prescriptions.length ? <span className="count">{visit.prescriptions.length}</span> : null}</> },
            { value: "bill", label: "Bill" },
            { value: "report", label: "Report" },
          ]}
        />
        {locked && tab !== "report" && (
          <div className="alert info small row">
            <span className="grow">This visit is finalized (read-only).</span>
            <button className="btn sm" onClick={() => patch({ status: "open" })}>
              Reopen
            </button>
          </div>
        )}
        <fieldset disabled={locked && tab !== "report" && tab !== "xrays"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {tab === "notes" && <NotesTab visit={visit} patch={patch} />}
          {tab === "ortho" && <OrthoTab visit={visit} patient={patient} patch={patch} />}
          {tab === "chart" && (
            <div className="card">
              <ToothChart chart={visit.toothChart} onChange={(c) => patch({ toothChart: c })} onAddPlan={addPlan} disabled={locked} />
            </div>
          )}
          {tab === "xrays" && <XraysTab visit={visit} patient={patient} />}
          {tab === "rx" && <RxTab visit={visit} patient={patient} patch={patch} />}
          {tab === "bill" && <BillTab visit={visit} patient={patient} patch={patch} />}
          {tab === "report" && <ReportTab visit={visit} patient={patient} patch={patch} flush={flush} />}
        </fieldset>
      </Screen>
    </>
  );
}
