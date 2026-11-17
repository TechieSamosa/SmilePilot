import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db, uid } from "../../db";
import { getThresholds, isVisible } from "../../lib/ai/calibration";
import { blobUrlCache, importImage } from "../../lib/image";
import type { ImageKind, Patient, Visit } from "../../types";
import { IconCamera, IconImage } from "../../ui/icons";
import { Sheet, Spinner, useFilePicker, useToast } from "../../ui/kit";
import { useNav } from "../../ui/nav";

export const KINDS: ImageKind[] = ["OPG", "IOPA", "Bitewing", "Cephalogram", "CBCT slice", "Intraoral photo", "Extraoral photo", "Other"];
/** Image types the X-ray AI is meant for (photos & cephs are kept as records only). */
export const AI_KINDS: ImageKind[] = ["OPG", "IOPA", "Bitewing", "CBCT slice", "Other"];

export function XraysTab({ visit, patient }: { visit: Visit; patient: Patient }) {
  const nav = useNav();
  const toast = useToast();
  const [pending, setPending] = useState<File[] | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useMemo(() => blobUrlCache(), []);
  useEffect(() => () => urls.clear(), [urls]);

  const images = useLiveQuery(() => db.images.where("visitId").equals(visit.id).sortBy("createdAt"), [visit.id]);
  const counts = useLiveQuery(async () => {
    const t = await getThresholds();
    const fs = await db.findings.where("visitId").equals(visit.id).toArray();
    const m: Record<string, { shown: number; pending: number }> = {};
    for (const f of fs) {
      const c = (m[f.imageId] ??= { shown: 0, pending: 0 });
      if (isVisible(f, t, false)) {
        c.shown++;
        if (f.status === "pending") c.pending++;
      }
    }
    return m;
  }, [visit.id]);

  const pickCamera = useFilePicker("image/*", (f) => setPending(f), { capture: true });
  const pickFile = useFilePicker("image/*,.dcm,.dicom,application/dicom", (f) => setPending(f), { multiple: true });

  const save = async (kind: ImageKind) => {
    if (!pending) return;
    setBusy(true);
    try {
      let lastId = "";
      for (const file of pending) {
        const img = await importImage(file);
        lastId = uid();
        await db.images.add({ id: lastId, visitId: visit.id, patientId: patient.id, kind, ...img, createdAt: Date.now() });
      }
      setPending(null);
      if (pending.length === 1) nav.push({ name: "xray", id: lastId });
      else toast(`${pending.length} images added — tap each to analyse`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="btn-grid" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={pickCamera}>
          <IconCamera /> Camera
        </button>
        <button className="btn" onClick={pickFile}>
          <IconImage /> Gallery / file
        </button>
      </div>
      <p className="tiny muted" style={{ marginTop: -4 }}>
        Best results: export the X-ray from the RVG/OPG software (JPEG, PNG or DICOM) or forward the image from WhatsApp. If you photograph a
        monitor, hold the phone parallel to the screen and avoid glare.
      </p>
      {images && images.length > 0 ? (
        <div className="thumbs">
          {images.map((img) => {
            const c = counts?.[img.id];
            return (
              <button key={img.id} className="thumb" onClick={() => nav.push({ name: "xray", id: img.id })}>
                <img src={urls.get(img.id, img.thumb)} alt={img.kind} />
                <span className={`badge ${!img.analyzedAt ? "" : c?.pending ? "warn" : "ok"}`}>
                  {img.kind}
                  {img.analyzedAt ? ` · ${c?.shown ?? 0}${c?.pending ? " to review" : ""}` : " · not analysed"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card small muted center">No X-rays or photos in this visit yet.</div>
      )}
      <Sheet open={!!pending} onClose={() => !busy && setPending(null)} title="What type of image is this?">
        {busy ? (
          <div className="row center" style={{ justifyContent: "center", padding: 20 }}>
            <Spinner /> Preparing image…
          </div>
        ) : (
          <div className="btn-grid">
            {KINDS.map((k) => (
              <button key={k} className="btn" onClick={() => save(k)}>
                {k}
              </button>
            ))}
          </div>
        )}
        <p className="tiny muted">The AI detector is trained on panoramic (OPG) films; on IOPA/bitewings its suggestions are less reliable — use the AI second opinion and your judgement.</p>
      </Sheet>
    </>
  );
}
