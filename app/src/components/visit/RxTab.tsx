import { useEffect, useMemo, useState } from "react";
import { db, uid } from "../../db";
import { checkPrescription, isClaudeConfigured, type RxCheck } from "../../lib/ai/claude";
import { ADVICE, checkRxRules, FORMULARY, FREQUENCIES, rxFromDrug, TEMPLATES } from "../../lib/drugs";
import { prescriptionPdf } from "../../lib/pdf";
import { shareFile } from "../../lib/platform";
import { safeFileName } from "../../lib/format";
import type { VisitPatch } from "../../screens/VisitScreen";
import type { Patient, Rx, Visit } from "../../types";
import { IconAlert, IconPill, IconPlus, IconSearch, IconShare, IconSparkle, IconX } from "../../ui/icons";
import { AutoTextarea, Field, Sheet, Spinner, useConfirm, useToast } from "../../ui/kit";



export function RxTab({ visit, patient, patch }: { visit: Visit; patient: Patient; patch: VisitPatch }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const [ai, setAi] = useState<RxCheck | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    isClaudeConfigured().then(setOnline);
  }, []);
  const warnings = useMemo(() => checkRxRules(patient, visit.prescriptions), [patient, visit.prescriptions]);

  const setRx = (rx: Rx[]) => {
    patch({ prescriptions: rx });
    setAi(null);
  };
  const update = (i: number, p: Partial<Rx>) => setRx(visit.prescriptions.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = (r: Rx) => setRx([...visit.prescriptions, r]);

  const applyTemplate = (name: string) => {
    const t = TEMPLATES.find((x) => x.name === name);
    if (!t) return;
    const existing = new Set(visit.prescriptions.map((r) => r.drug));
    const items = t.items.filter((n) => !existing.has(n)).map((n) => rxFromDrug(FORMULARY.find((d) => d.name === n)!, patient));
    setRx([...visit.prescriptions, ...items]);
    toast(`Added “${name}” — review doses`);
  };

  const runAi = async () => {
    setAiBusy(true);
    try {
      const r = await checkPrescription(patient, visit);
      setAi(r);
      await db.feedback.add({ id: uid(), kind: "rx-check", rating: 0, aiText: JSON.stringify(r), prompt: JSON.stringify(visit.prescriptions), createdAt: Date.now() });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const sharePdf = async () => {
    const high = warnings.filter((w) => w.severity === "high");
    if (
      high.length &&
      !(await confirm({
        title: `${high.length} high-risk warning${high.length > 1 ? "s" : ""}`,
        message: [...high.map((w) => `• ${w.drug}: ${w.message}`), "", "Create the prescription anyway?"].join("\n"),
        ok: "Create anyway",
        danger: true,
      }))
    )
      return;
    setPdfBusy(true);
    try {
      const blob = await prescriptionPdf(visit, patient);
      await shareFile(blob, `Rx_${safeFileName(patient.name)}_${new Date(visit.date).toISOString().slice(0, 10)}.pdf`, "Prescription");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };

  const results = FORMULARY.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      {warnings.length > 0 && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <h2 style={{ color: "var(--danger)" }}>
            <IconAlert style={{ width: 18, height: 18 }} /> Safety check
          </h2>
          {warnings.map((w, i) => (
            <div key={i} className={`alert ${w.severity === "high" ? "danger" : w.severity === "medium" ? "warn" : "info"}`}>
              <b>{w.drug}:</b> {w.message}
            </div>
          ))}
        </div>
      )}

      {visit.prescriptions.map((r, i) => (
        <div className="card" key={i}>
          <div className="row" style={{ marginBottom: 8 }}>
            <IconPill style={{ width: 20, height: 20, color: "var(--primary)" }} />
            <input className="input grow bold" value={r.drug} onChange={(e) => update(i, { drug: e.target.value })} />
            <button className="icon-btn" onClick={() => setRx(visit.prescriptions.filter((_, j) => j !== i))} aria-label="Remove">
              <IconX />
            </button>
          </div>
          <div className="row">
            <input className="input" value={r.dose} onChange={(e) => update(i, { dose: e.target.value })} placeholder="Dose" />
            <input className="input" list="freqs" value={r.frequency} onChange={(e) => update(i, { frequency: e.target.value })} placeholder="1-0-1" />
            <input className="input" value={r.duration} onChange={(e) => update(i, { duration: e.target.value })} placeholder="5 days" />
          </div>
          <input className="input" style={{ marginTop: 8 }} value={r.instructions} onChange={(e) => update(i, { instructions: e.target.value })} placeholder="Instructions (after food…)" />
        </div>
      ))}
      <datalist id="freqs">
        {FREQUENCIES.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <div className="btn-grid" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setSearch(true)}>
          <IconPlus /> Add medicine
        </button>
        <select className="input" value="" onChange={(e) => applyTemplate(e.target.value)} aria-label="Templates">
          <option value="">Templates…</option>
          {TEMPLATES.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <Field label="Advice / instructions for patient">
          <AutoTextarea value={visit.advice} onChange={(e) => patch({ advice: e.target.value })} rows={2} />
        </Field>
        <div className="chips">
          {ADVICE.map((a) => (
            <button key={a} type="button" className="chip" style={{ textAlign: "left" }} onClick={() => !visit.advice.includes(a) && patch({ advice: (visit.advice ? visit.advice.trim() + "\n" : "") + "• " + a })}>
              + {a.length > 42 ? a.slice(0, 40) + "…" : a}
            </button>
          ))}
        </div>
      </div>

      {visit.prescriptions.length > 0 && (
        <div className="stack">
          {online && (
            <button className="btn block" onClick={runAi} disabled={aiBusy}>
              {aiBusy ? <Spinner /> : <IconSparkle />} Extra online AI safety check
            </button>
          )}
          {ai && (
            <div className="card">
              {ai.issues.length === 0 ? (
                <div className="alert ok">AI found no issues with this prescription for this patient.</div>
              ) : (
                ai.issues.map((x, i) => (
                  <div key={i} className={`alert ${x.severity === "high" ? "danger" : x.severity === "medium" ? "warn" : "info"}`}>
                    <b>{x.drug}:</b> {x.problem}
                    {x.suggestion && <div className="small" style={{ marginTop: 4 }}>→ {x.suggestion}</div>}
                  </div>
                ))
              )}
              <div className="tiny muted">AI check — verify against standard references.</div>
            </div>
          )}
          <button className="btn primary block" onClick={sharePdf} disabled={pdfBusy}>
            {pdfBusy ? <Spinner /> : <IconShare />} Prescription PDF (share / print)
          </button>
        </div>
      )}

      <Sheet open={search} onClose={() => setSearch(false)} title="Add medicine">
        <div className="search" style={{ marginBottom: 10 }}>
          <IconSearch />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type any medicine" />
        </div>
        {q.trim() && !results.some((d) => d.name.toLowerCase() === q.trim().toLowerCase()) && (
          <button
            className="btn block"
            style={{ marginBottom: 10 }}
            onClick={() => {
              add({ drug: q.trim(), dose: "1 tab", frequency: "1-0-1", duration: "5 days", instructions: "After food" });
              setSearch(false);
              setQ("");
            }}
          >
            <IconPlus /> Add “{q.trim()}”
          </button>
        )}
        <div className="list">
          {results.map((d) => (
            <button
              key={d.name}
              className="list-item"
              onClick={() => {
                add(rxFromDrug(d, patient));
                setSearch(false);
                setQ("");
              }}
            >
              <div className="grow">
                <div className="bold">{d.name}</div>
                <div className="small muted">
                  {d.dose} · {d.frequency} · {d.duration}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
