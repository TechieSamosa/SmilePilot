import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getProfile, getSetting, setSetting, uid } from "../../db";
import { fmtMoney, safeFileName } from "../../lib/format";
import { invoicePdf } from "../../lib/pdf";
import { shareFile } from "../../lib/platform";
import type { VisitPatch } from "../../screens/VisitScreen";
import type { Patient, PlanItem, Visit } from "../../types";
import { IconPlus, IconShare, IconX } from "../../ui/icons";
import { Field, Spinner, useToast } from "../../ui/kit";
import { TREATMENTS } from "../ToothChart";
import { ORTHO_TREATMENTS } from "../../lib/ortho";
import { useOrtho } from "../../ui/useOrtho";

export function BillTab({ visit, patient, patch }: { visit: Visit; patient: Patient; patch: VisitPatch }) {
  const toast = useToast();
  const profile = useLiveQuery(getProfile, []);
  const cur = profile?.currency ?? "₹";
  const [busy, setBusy] = useState(false);
  const ortho = useOrtho();
  const total = visit.plan.reduce((s, x) => s + (x.cost || 0), 0);
  const doneTotal = visit.plan.filter((x) => x.status === "done").reduce((s, x) => s + (x.cost || 0), 0);

  const update = async (i: number, p: Partial<PlanItem>) => {
    const plan = visit.plan.map((x, j) => (j === i ? { ...x, ...p } : x));
    patch({ plan });
    if (p.cost !== undefined && plan[i]!.procedure) {
      const fees = await getSetting<Record<string, number>>("fees", {});
      fees[plan[i]!.procedure] = p.cost;
      await setSetting("fees", fees);
    }
  };

  const addItem = async () => {
    patch({ plan: [...visit.plan, { id: uid(), procedure: "Consultation", cost: (await getSetting<Record<string, number>>("fees", {}))["Consultation"] ?? 0, status: "done" }] });
  };

  const share = async () => {
    setBusy(true);
    try {
      await shareFile(await invoicePdf(visit, patient), `Invoice_${safeFileName(patient.name)}_${new Date(visit.date).toISOString().slice(0, 10)}.pdf`, "Invoice");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <datalist id="treatments">
        {[...(ortho ? ORTHO_TREATMENTS : []), "Consultation", "X-ray (IOPA)", "OPG", ...TREATMENTS].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {visit.plan.map((x, i) => (
        <div className="card" key={x.id}>
          <div className="row">
            <input className="input" style={{ width: 64 }} inputMode="numeric" placeholder="#" value={x.tooth ?? ""} onChange={(e) => update(i, { tooth: e.target.value ? +e.target.value.replace(/\D/g, "") : undefined })} aria-label="Tooth" />
            <input className="input grow" list="treatments" value={x.procedure} onChange={(e) => update(i, { procedure: e.target.value })} />
            <button className="icon-btn" onClick={() => patch({ plan: visit.plan.filter((_, j) => j !== i) })} aria-label="Remove">
              <IconX />
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted bold">{cur}</span>
            <input className="input grow" inputMode="decimal" value={x.cost || ""} placeholder="0" onChange={(e) => update(i, { cost: parseFloat(e.target.value) || 0 })} />
            <button className={`btn sm ${x.status === "done" ? "primary" : ""}`} onClick={() => update(i, { status: x.status === "done" ? "planned" : "done" })}>
              {x.status === "done" ? "✓ Done" : "Planned"}
            </button>
          </div>
        </div>
      ))}
      <button className="btn block" style={{ marginBottom: 12 }} onClick={addItem}>
        <IconPlus /> Add item
      </button>
      <div className="card">
        <div className="row small">
          <span className="grow muted">Treatment plan total</span>
          <b>{fmtMoney(total, cur)}</b>
        </div>
        <div className="row small" style={{ marginTop: 4 }}>
          <span className="grow muted">Completed (billable)</span>
          <b>{fmtMoney(doneTotal, cur)}</b>
        </div>
        <div className="hr" />
        <Field label={`Amount paid (${cur})`}>
          <input className="input" inputMode="decimal" value={visit.paid || ""} placeholder="0" onChange={(e) => patch({ paid: parseFloat(e.target.value) || 0 })} />
        </Field>
        <div className="row">
          <span className="grow bold">Balance due</span>
          <b style={{ fontSize: 20, color: doneTotal - visit.paid > 0 ? "var(--danger)" : "var(--ok)" }}>{fmtMoney(doneTotal - (visit.paid || 0), cur)}</b>
        </div>
      </div>
      {visit.plan.length > 0 && (
        <button className="btn primary block" onClick={share} disabled={busy}>
          {busy ? <Spinner /> : <IconShare />} Estimate / invoice PDF
        </button>
      )}
      <p className="tiny muted center">Fees you enter are remembered for next time.</p>
    </>
  );
}
