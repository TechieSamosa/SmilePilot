import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { XrayViewer } from "../components/XrayViewer";
import { AI_KINDS, KINDS } from "../components/visit/XraysTab";
import { db, getSetting, uid } from "../db";
import { getThresholds, isVisible, recalibrate, thresholdFor } from "../lib/ai/calibration";
import { isClaudeConfigured, secondOpinion, type SecondOpinion } from "../lib/ai/claude";
import { analyzeImage, engineName, iou } from "../lib/ai/detector";
import { isValidTooth, toothName } from "../lib/fdi";
import { rotateImage } from "../lib/image";
import { FINDING_TO_CONDITION, labelInfo, PATHOLOGY_CLASSES, SEVERITY_ORDER } from "../lib/labels";
import type { Box, Finding, ImageKind, ToothCondition } from "../types";
import { IconCheck, IconEdit, IconRotate, IconSparkle, IconTooth, IconTrash, IconX } from "../ui/icons";
import { AutoTextarea, Field, Screen, Sheet, Spinner, TopBar, useConfirm, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";

interface EditState {
  finding?: Finding;
  box?: Box;
  label: string;
  tooth: string;
  note: string;
}

export default function XrayReview({ id }: { id: string }) {
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const image = useLiveQuery(() => db.images.get(id), [id]);
  const visit = useLiveQuery(async () => (image ? db.visits.get(image.visitId) : undefined), [image?.visitId]);
  const patient = useLiveQuery(async () => (image ? db.patients.get(image.patientId) : undefined), [image?.patientId]);
  const all = useLiveQuery(() => db.findings.where("imageId").equals(id).toArray(), [id]);
  const thresholds = useLiveQuery(getThresholds, [all]);
  const [showLow, setShowLow] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [opinion, setOpinion] = useState<SecondOpinion | null>(null);
  const [opBusy, setOpBusy] = useState(false);
  const [claudeOk, setClaudeOk] = useState(false);
  const started = useRef(false);
  const recalTimer = useRef<number>(undefined);

  useEffect(() => {
    isClaudeConfigured().then(setClaudeOk);
  }, []);

  const visible = useMemo(() => {
    if (!all || !thresholds) return [];
    return all
      .filter((f) => isVisible(f, thresholds, showLow))
      .sort((a, b) => SEVERITY_ORDER[labelInfo(a.label).severity] - SEVERITY_ORDER[labelInfo(b.label).severity] || b.confidence - a.confidence);
  }, [all, thresholds, showLow]);
  const hiddenCount = all && thresholds ? all.filter((f) => f.source === "ai" && f.status === "pending" && f.confidence < thresholdFor(f.label, thresholds)).length : 0;
  const pendingVisible = visible.filter((f) => f.status === "pending");

  const scheduleRecal = () => {
    clearTimeout(recalTimer.current);
    recalTimer.current = window.setTimeout(() => recalibrate(), 1500);
  };
  useEffect(() => () => {
    clearTimeout(recalTimer.current);
    void recalibrate();
  }, []);

  const analyze = async () => {
    if (!image) return;
    setProgress("Starting AI…");
    try {
      const numberTeeth = await getSetting<boolean>("numberTeeth", true);
      const res = await analyzeImage(image.blob, { numberTeeth: numberTeeth && image.kind !== "Intraoral photo", onProgress: setProgress });
      const existing = await db.findings.where("imageId").equals(id).toArray();
      const reviewed = existing.filter((f) => f.status !== "pending" || f.source !== "ai");
      const now = Date.now();
      const fresh: Finding[] = res.findings
        .filter((d) => !reviewed.some((r) => r.box && r.label === d.label && iou(r.box, d.box) > 0.5))
        .map((d) => ({
          id: uid(),
          imageId: id,
          visitId: image.visitId,
          patientId: image.patientId,
          label: d.label,
          box: d.box,
          confidence: d.confidence,
          tooth: d.tooth,
          source: "ai",
          status: "pending",
          modelVersion: res.modelVersion,
          createdAt: now,
        }));
      await db.transaction("rw", [db.findings, db.images], async () => {
        await db.findings.bulkDelete(existing.filter((f) => f.source === "ai" && f.status === "pending").map((f) => f.id));
        await db.findings.bulkAdd(fresh);
        await db.images.update(id, { analyzedAt: now, modelVersion: res.modelVersion, inferenceMs: Math.round(res.ms) });
      });
      const t = await getThresholds();
      const shown = fresh.filter((f) => f.confidence >= thresholdFor(f.label, t)).length;
      const secs = (res.ms / 1000).toFixed(1);
      toast(
        shown
          ? `${shown} finding${shown > 1 ? "s" : ""} to review (${secs} s)`
          : reviewed.length
            ? `No new findings beyond the ${reviewed.length} you already reviewed (${secs} s)`
            : "No findings above threshold — check the image yourself or use the AI second opinion",
      );
    } catch (e) {
      console.error(e);
      toast(`Analysis failed: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  useEffect(() => {
    if (image && !image.analyzedAt && !started.current && AI_KINDS.includes(image.kind)) {
      started.current = true;
      void analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  if (!image || !all) return null;

  const review = async (f: Finding, status: "confirmed" | "rejected") => {
    await db.findings.update(f.id, { status, reviewedAt: Date.now() });
    if (selected === f.id) setSelected(null);
    scheduleRecal();
  };

  const confirmAll = async () => {
    const now = Date.now();
    await db.transaction("rw", db.findings, async () => {
      for (const f of pendingVisible) await db.findings.update(f.id, { status: "confirmed", reviewedAt: now });
    });
    scheduleRecal();
    toast(`${pendingVisible.length} confirmed`);
  };

  const openEdit = (f?: Finding, box?: Box) =>
    setEdit({ finding: f, box, label: f?.label ?? "caries", tooth: f?.tooth ? String(f.tooth) : "", note: f?.note ?? "" });

  const saveEdit = async () => {
    if (!edit) return;
    const tooth = edit.tooth ? parseInt(edit.tooth, 10) : undefined;
    if (tooth !== undefined && !isValidTooth(tooth)) return toast("Use FDI numbering, e.g. 36");
    const now = Date.now();
    if (edit.finding) {
      const f = edit.finding;
      const changedLabel = edit.label !== f.label;
      const changedBox = !!edit.box;
      await db.findings.update(f.id, {
        label: edit.label,
        tooth,
        note: edit.note,
        box: edit.box ?? f.box,
        status: f.source === "ai" && (changedLabel || changedBox || tooth !== f.tooth) ? "corrected" : f.source === "ai" ? "confirmed" : f.status,
        originalLabel: f.originalLabel ?? (changedLabel ? f.label : undefined),
        originalBox: f.originalBox ?? (changedBox ? f.box : undefined),
        reviewedAt: now,
      });
    } else if (edit.box) {
      // Did the AI see this but below threshold? Promote it instead of counting a miss.
      const hidden = all.find((f) => f.source === "ai" && f.status === "pending" && f.label === edit.label && f.box && iou(f.box, edit.box!) > 0.3);
      if (hidden) {
        await db.findings.update(hidden.id, { status: "corrected", originalBox: hidden.box, box: edit.box, tooth, note: edit.note, reviewedAt: now });
        toast(`The AI had flagged this at ${Math.round(hidden.confidence * 100)}% — threshold will adapt`);
      } else {
        await db.findings.add({
          id: uid(),
          imageId: id,
          visitId: image.visitId,
          patientId: image.patientId,
          label: edit.label,
          box: edit.box,
          confidence: 1,
          tooth,
          note: edit.note,
          source: "dentist",
          status: "confirmed",
          createdAt: now,
          reviewedAt: now,
        });
      }
    }
    setEdit(null);
    scheduleRecal();
  };

  const syncChart = async () => {
    if (!visit) return;
    const chart = { ...visit.toothChart };
    let n = 0;
    for (const f of all) {
      if (!(f.status === "confirmed" || f.status === "corrected" || (f.source !== "ai" && f.status !== "rejected")) || !f.tooth) continue;
      const cond = FINDING_TO_CONDITION[f.label] as ToothCondition | undefined;
      if (!cond) continue;
      const cur = chart[String(f.tooth)] ?? [];
      if (!cur.includes(cond)) {
        chart[String(f.tooth)] = [...cur, cond];
        n++;
      }
    }
    await db.visits.update(visit.id, { toothChart: chart, updatedAt: Date.now() });
    toast(n ? `Tooth chart updated (${n})` : "Tooth chart already up to date");
  };

  const runOpinion = async () => {
    setOpBusy(true);
    try {
      const det = visible.filter((f) => f.status !== "rejected").map((f) => `${labelInfo(f.label).name}${f.tooth ? ` #${f.tooth}` : ""} (${f.source === "ai" ? `${Math.round(f.confidence * 100)}%` : "dentist"})`);
      const r = await secondOpinion(image.blob, image.kind, det, patient, visit?.chiefComplaint ?? "");
      setOpinion(r);
      const summary = `${r.overall_impression}${r.findings.length ? "\n" + r.findings.map((f) => `- ${f.tooth}: ${f.condition} (${f.location}, ${f.certainty} certainty)`).join("\n") : ""}`;
      await db.images.update(id, { aiSummary: summary });
      await db.feedback.add({ id: uid(), kind: "second-opinion", rating: 0, aiText: JSON.stringify(r), createdAt: Date.now() });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOpBusy(false);
    }
  };

  const acceptOpinion = async (o: SecondOpinion["findings"][number]) => {
    const tooth = parseInt(o.tooth, 10);
    const label = (PATHOLOGY_CLASSES as readonly string[]).find((c) => o.condition.toLowerCase().includes(c.replace(/_/g, " ").split(" ")[0]!)) ?? o.condition.toLowerCase().replace(/\s+/g, "_");
    await db.findings.add({
      id: uid(),
      imageId: id,
      visitId: image.visitId,
      patientId: image.patientId,
      label,
      confidence: o.certainty === "high" ? 0.9 : o.certainty === "moderate" ? 0.6 : 0.3,
      tooth: isValidTooth(tooth) ? tooth : undefined,
      note: `${o.location}. ${o.rationale}`,
      source: "claude",
      status: "confirmed",
      createdAt: Date.now(),
      reviewedAt: Date.now(),
    });
    toast("Added to findings");
  };

  const rotate = async () => {
    if (all.some((f) => f.status !== "pending") && !(await confirm({ title: "Rotate image?", message: "Rotating clears the findings on this image.", ok: "Rotate" }))) return;
    const r = await rotateImage(image.blob, 1);
    await db.findings.where("imageId").equals(id).delete();
    await db.images.update(id, { ...r, analyzedAt: undefined });
    started.current = false;
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete this image?", message: "The image and its findings will be deleted.", ok: "Delete", danger: true }))) return;
    await db.findings.where("imageId").equals(id).delete();
    await db.images.delete(id);
    nav.back();
  };

  const sel = all.find((f) => f.id === selected);

  return (
    <>
      <TopBar
        back
        title={`${image.kind} review`}
        sub={patient?.name}
        actions={
          <>
            <button className="icon-btn" onClick={rotate} aria-label="Rotate">
              <IconRotate />
            </button>
            <button className="icon-btn" onClick={remove} aria-label="Delete image">
              <IconTrash />
            </button>
          </>
        }
      />
      <Screen tabs={false}>
        <XrayViewer
          blob={image.blob}
          width={image.width}
          height={image.height}
          findings={visible}
          selectedId={selected}
          onSelect={setSelected}
          drawMode={drawMode}
          onDrawMode={setDrawMode}
          onDrawn={(box) => {
            const target = redrawTarget.current;
            redrawTarget.current = null;
            openEdit(target ?? undefined, box);
          }}
          showBoxes={showBoxes}
          onShowBoxes={setShowBoxes}
        />
        <div className="row" style={{ margin: "10px 0" }}>
          <select className="input" style={{ width: "auto" }} value={image.kind} onChange={(e) => db.images.update(id, { kind: e.target.value as ImageKind })} aria-label="Image type">
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <span className="grow" />
          {image.analyzedAt && (
            <button className="btn sm" onClick={analyze} disabled={!!progress}>
              Re-analyse
            </button>
          )}
        </div>

        {progress && (
          <div className="card row">
            <Spinner />
            <div className="grow">
              <div className="bold">{progress}</div>
              <div className="tiny muted">Runs on this phone — X-rays never leave the device. First run downloads the model once.</div>
            </div>
          </div>
        )}
        {!image.analyzedAt && !progress && AI_KINDS.includes(image.kind) && (
          <button className="btn primary block" style={{ marginBottom: 12 }} onClick={analyze}>
            <IconSparkle /> Analyse with on-device AI
          </button>
        )}
        {!image.analyzedAt && !progress && !AI_KINDS.includes(image.kind) && (
          <div className="alert info small">
            Saved as a {image.kind.toLowerCase()} record. The X-ray AI is for radiographs — change the type above if this is an OPG/IOPA/bitewing.
          </div>
        )}

        {sel && (
          <div className="card" style={{ borderColor: labelInfo(sel.label).color }}>
            <div className="row">
              <div className="grow">
                <div className="bold">
                  {labelInfo(sel.label).name}
                  {sel.tooth ? ` · #${sel.tooth}` : ""}
                </div>
                <div className="small muted">{sel.tooth ? toothName(sel.tooth) : "Tooth not assigned"}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                <IconX />
              </button>
            </div>
            {labelInfo(sel.label).hint && <p className="small" style={{ margin: "8px 0" }}>{labelInfo(sel.label).hint}</p>}
            <div className="btn-grid">
              <button className="btn primary" onClick={() => review(sel, "confirmed")}>
                <IconCheck /> Correct
              </button>
              <button className="btn danger" onClick={() => review(sel, "rejected")}>
                <IconX /> Wrong
              </button>
            </div>
          </div>
        )}

        {image.analyzedAt && (
          <>
            <div className="section-title row">
              <span className="grow">
                Findings ({visible.length}){pendingVisible.length ? ` · ${pendingVisible.length} to review` : ""}
              </span>
            </div>
            {visible.length > 0 ? (
              <div className="list">
                {visible.map((f) => {
                  const info = labelInfo(f.label);
                  return (
                    <div key={f.id} className={`finding${f.id === selected ? " sel" : ""}${f.status === "rejected" ? " rejected" : ""}`} onClick={() => setSelected(f.id)}>
                      <span className="swatch" style={{ background: info.color }} />
                      <div className="grow">
                        <div className="bold">
                          {info.name}
                          {f.tooth ? ` · #${f.tooth}` : ""}
                        </div>
                        <div className="tiny muted">
                          {f.source === "ai" ? `AI ${Math.round(f.confidence * 100)}%` : f.source === "claude" ? "AI second opinion" : "Added by you"}
                          {f.status === "confirmed" ? " · ✓ confirmed" : f.status === "corrected" ? " · ✓ corrected" : ""}
                          {f.note ? ` · ${f.note.slice(0, 50)}` : ""}
                        </div>
                        {f.source === "ai" && (
                          <div className="conf-bar">
                            <i style={{ width: `${Math.round(f.confidence * 100)}%`, background: info.color }} />
                          </div>
                        )}
                      </div>
                      {f.status === "pending" ? (
                        <>
                          <button className="icon-btn" style={{ color: "var(--ok)" }} onClick={(e) => (e.stopPropagation(), review(f, "confirmed"))} aria-label="Confirm">
                            <IconCheck />
                          </button>
                          <button className="icon-btn" style={{ color: "var(--danger)" }} onClick={(e) => (e.stopPropagation(), review(f, "rejected"))} aria-label="Reject">
                            <IconX />
                          </button>
                        </>
                      ) : null}
                      <button className="icon-btn" onClick={(e) => (e.stopPropagation(), openEdit(f))} aria-label="Edit">
                        <IconEdit />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card small muted">No findings shown. The AI may have missed something — draw a box with the ▢ tool to add it.</div>
            )}
            <div className="stack">
              {pendingVisible.length > 1 && (
                <button className="btn block" onClick={confirmAll}>
                  <IconCheck /> Confirm all {pendingVisible.length} remaining
                </button>
              )}
              <div className="btn-grid">
                <button className="btn" onClick={() => setDrawMode(true)}>
                  ▢ Add missed finding
                </button>
                <button className="btn" onClick={syncChart}>
                  <IconTooth /> Update tooth chart
                </button>
              </div>
              {hiddenCount > 0 && (
                <label className="row small">
                  <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} style={{ width: 20, height: 20 }} />
                  <span>Show {hiddenCount} low-confidence suggestion{hiddenCount > 1 ? "s" : ""} (reviewing these teaches the AI faster)</span>
                </label>
              )}
            </div>
          </>
        )}

        {claudeOk && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>
            <IconSparkle style={{ width: 18, height: 18 }} /> AI second opinion
          </h2>
          {(
            <>
              <button className="btn block" onClick={runOpinion} disabled={opBusy}>
                {opBusy ? <Spinner /> : <IconSparkle />} {opinion ? "Ask again" : "Get second opinion"}
              </button>
              {opinion && (
                <div style={{ marginTop: 10 }}>
                  <div className="small muted">Image quality: {opinion.image_quality}</div>
                  <p className="small">{opinion.overall_impression}</p>
                  {opinion.findings.map((o, i) => (
                    <div key={i} className="row small" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <div className="grow">
                        <b>{o.tooth}</b>: {o.condition} <span className={`badge ${o.certainty === "high" ? "danger" : o.certainty === "moderate" ? "warn" : ""}`}>{o.certainty}</span>
                        <div className="tiny muted">
                          {o.location} — {o.rationale}
                        </div>
                      </div>
                      <button className="btn sm" onClick={() => acceptOpinion(o)}>
                        Add
                      </button>
                    </div>
                  ))}
                  {opinion.disagreements_with_detector.length > 0 && (
                    <div className="alert warn small" style={{ marginTop: 8 }}>
                      <b>Disagrees with detector:</b>
                      <br />
                      {opinion.disagreements_with_detector.join("\n")}
                    </div>
                  )}
                  {opinion.recommended_next_steps.length > 0 && (
                    <div className="small">
                      <b>Next steps:</b>
                      <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                        {opinion.recommended_next_steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        )}
        <p className="tiny muted center">
          {image.modelVersion ? `Model ${image.modelVersion}` : ""}
          {image.inferenceMs ? ` · ${(image.inferenceMs / 1000).toFixed(1)} s on this phone (${engineName()})` : ""}. AI suggestions are not a diagnosis.
        </p>
      </Screen>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.finding ? "Edit finding" : "Add finding"}>
        {edit && (
          <>
            <Field label="Finding">
              <select className="input" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })}>
                {PATHOLOGY_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {labelInfo(c).name}
                  </option>
                ))}
                {!(PATHOLOGY_CLASSES as readonly string[]).includes(edit.label) && <option value={edit.label}>{labelInfo(edit.label).name}</option>}
              </select>
            </Field>
            <Field label="Tooth (FDI)">
              <input className="input" inputMode="numeric" value={edit.tooth} onChange={(e) => setEdit({ ...edit, tooth: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="e.g. 36" />
            </Field>
            {edit.tooth.length === 2 && isValidTooth(+edit.tooth) && <div className="tiny muted" style={{ marginTop: -8, marginBottom: 10 }}>{toothName(+edit.tooth)}</div>}
            <Field label="Note">
              <AutoTextarea value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} rows={2} placeholder="e.g. distal, approaching pulp" />
            </Field>
            <div className="btn-grid">
              {edit.finding?.box ? (
                <button
                  className="btn"
                  onClick={() => {
                    const f = edit.finding!;
                    setEdit(null);
                    setSelected(f.id);
                    setDrawMode(true);
                    toast("Draw the corrected box");
                    redrawTarget.current = f;
                  }}
                >
                  ▢ Redraw box
                </button>
              ) : (
                <button className="btn" onClick={() => setEdit(null)}>
                  Cancel
                </button>
              )}
              <button className="btn primary" onClick={saveEdit}>
                Save
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

// A finding whose box is being redrawn (set from the edit sheet).
const redrawTarget: { current: Finding | null } = { current: null };
