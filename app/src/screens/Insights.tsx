import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db";
import { computeStats, getThresholds, recalibrate, thresholdFor } from "../lib/ai/calibration";
import { datasetSummary, exportDataset } from "../lib/ai/dataset";
import { labelInfo } from "../lib/labels";
import { shareFile } from "../lib/platform";
import { IconChart, IconShare } from "../ui/icons";
import { Empty, ListItem, Screen, Spinner, TopBar, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";
import { PRESET } from "../preset";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default function Insights() {
  const nav = useNav();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const stats = useLiveQuery(computeStats, []);
  const ds = useLiveQuery(datasetSummary, []);
  const fb = useLiveQuery(async () => {
    const all = await db.feedback.toArray();
    return {
      up: all.filter((f) => f.rating === 1).length,
      down: all.filter((f) => f.rating === -1).length,
      edits: all.filter((f) => f.kind === "report" && f.finalText && f.aiText && f.finalText.trim() !== f.aiText.trim()).length,
    };
  }, []);
  const toReview = useLiveQuery(async () => {
    const t = await getThresholds();
    const imgs = await db.images.filter((i) => !!i.analyzedAt).toArray();
    const out = [];
    for (const i of imgs) {
      const n = await db.findings.where("imageId").equals(i.id).filter((f) => f.source === "ai" && f.status === "pending" && f.confidence >= thresholdFor(f.label, t)).count();
      if (n) out.push({ img: i, n, patient: await db.patients.get(i.patientId) });
    }
    return out;
  }, []);

  const totals = (stats ?? []).reduce((a, s) => ({ c: a.c + s.confirmed, r: a.r + s.rejected + s.relabeled, m: a.m + s.missed }), { c: 0, r: 0, m: 0 });

  const exportData = async () => {
    setBusy("Preparing…");
    try {
      const blob = await exportDataset(setBusy);
      await shareFile(blob, `dentalos_training_${new Date().toISOString().slice(0, 10)}.zip`, "DentalOS training data");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar back title="AI accuracy & learning" />
      <Screen tabs={false}>
        <p className="small muted" style={{ marginTop: 0 }}>
          Every time you confirm, correct, reject or add a finding, {PRESET.appName} learns the confidence level that matches your judgement for each
          finding type, and builds a training set to make the next model more accurate.
        </p>
        <div className="stat-grid">
          <div className="stat">
            <div className="v" style={{ color: "var(--ok)" }}>{totals.c}</div>
            <div className="l">AI correct</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: "var(--danger)" }}>{totals.r}</div>
            <div className="l">AI wrong</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: "var(--warn)" }}>{totals.m}</div>
            <div className="l">AI missed</div>
          </div>
        </div>

        {toReview && toReview.length > 0 && (
          <>
            <div className="section-title">Waiting for your review</div>
            <div className="list">
              {toReview.slice(0, 10).map(({ img, n, patient }) => (
                <ListItem key={img.id} title={patient?.name ?? "Patient"} sub={`${img.kind} · ${n} finding${n > 1 ? "s" : ""} to review`} onClick={() => nav.push({ name: "xray", id: img.id })} />
              ))}
            </div>
          </>
        )}

        <div className="section-title">Per-finding accuracy (from your reviews)</div>
        {stats && stats.length ? (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Finding</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th style={{ paddingRight: 12 }}>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.label} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: labelInfo(s.label).color, marginRight: 6 }} />
                      {labelInfo(s.label).name}
                      <div className="tiny muted">
                        ✓{s.confirmed} ✗{s.rejected + s.relabeled} missed {s.missed}
                      </div>
                    </td>
                    <td>{pct(s.precision)}</td>
                    <td>{pct(s.recall)}</td>
                    <td style={{ paddingRight: 12 }}>
                      {Math.round(s.threshold * 100)}%{s.learned ? <span className="badge primary" style={{ marginLeft: 4 }}>learned</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<IconChart />} title="No reviews yet">
            Analyse an X-ray and tap ✓ or ✗ on each AI finding.
          </Empty>
        )}
        <button
          className="btn block"
          style={{ marginBottom: 12 }}
          onClick={async () => {
            await recalibrate();
            toast("Thresholds re-learned from all reviews");
          }}
        >
          Re-learn thresholds now
        </button>

        <div className="section-title">Improve the model (training data)</div>
        <div className="card">
          <p className="small" style={{ marginTop: 0 }}>
            <b>{ds?.images ?? 0}</b> fully reviewed X-rays with <b>{ds?.boxes ?? 0}</b> verified findings are ready. Export them and send the zip to
            your developer to fine-tune the model (instructions are inside the zip). Then import the improved model in Settings.
          </p>
          {ds && Object.keys(ds.perClass).length > 0 && (
            <div className="chips" style={{ marginBottom: 10 }}>
              {Object.entries(ds.perClass).map(([k, v]) => (
                <span key={k} className="badge">
                  {labelInfo(k).name}: {v}
                </span>
              ))}
            </div>
          )}
          <button className="btn primary block" onClick={exportData} disabled={!!busy || !ds?.images}>
            {busy ? (
              <>
                <Spinner /> {busy}
              </>
            ) : (
              <>
                <IconShare /> Export training data
              </>
            )}
          </button>
          <p className="tiny muted">The export contains X-ray images without patient names. Share only with people you trust.</p>
        </div>

        <div className="section-title">Assistant feedback</div>
        <div className="card small">
          👍 {fb?.up ?? 0} helpful · 👎 {fb?.down ?? 0} not helpful · ✏️ {fb?.edits ?? 0} reports you edited. Your edited reports are used as style
          examples for new drafts, and 👎 comments become standing instructions in <a onClick={() => nav.push({ name: "preferences" })}>AI memory</a>.
        </div>
      </Screen>
    </>
  );
}
