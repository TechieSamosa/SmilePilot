import { useEffect, useState } from "react";
import { bundledMeta } from "../lib/ai/detector";
import { labelInfo } from "../lib/labels";
import type { ModelMeta } from "../types";
import { Screen, TopBar } from "../ui/kit";
import { PRESET } from "../preset";

export default function Help() {
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  useEffect(() => {
    bundledMeta("pathology").then(setMeta);
  }, []);
  return (
    <>
      <TopBar back title="Help & safety" />
      <Screen tabs={false}>
        <div className="card">
          <h2>Daily workflow</h2>
          <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Today → <b>New visit</b> → pick or add the patient.</li>
            <li>Notes: chief complaint, examination, diagnosis (tap the chips to type less).</li>
            <li>Chart: tap teeth to mark caries, fillings, missing teeth; add treatments with fees.</li>
            <li>X-rays: take or pick the image → the AI marks findings → tap ✓ or ✗ on each, draw boxes for anything missed.</li>
            <li>Rx: add medicines or a template; safety warnings appear automatically.</li>
            <li>Report: draft the case record with AI, edit it, then share the PDF / WhatsApp message and finalize.</li>
          </ol>
        </div>
        <div className="card">
          <h2>How the AI learns from you</h2>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li><b>X-ray detector</b> (on-device): your ✓/✗/corrections tune the confidence threshold for each finding type, and become a training set you can export to retrain the model (More → AI accuracy).</li>
            <li><b>Case records & patient messages</b> are built offline from exactly what you entered — nothing is invented. Edit them freely.</li>
            <li>Only if you ever add the optional online AI: your edits and 👎 comments also become instructions for it (More → AI memory).</li>
          </ul>
        </div>
        <div className="card">
          <h2>Privacy</h2>
          <p className="small" style={{ margin: 0 }}>
            All records stay on this phone and everything works offline, free of cost. X-ray detection runs on the phone. There is no {PRESET.appName} server
            and no account. Nothing is sent anywhere unless you share a file yourself (or add the optional online AI in Settings). Make regular backups.
          </p>
        </div>
        <div className="card">
          <h2>Limitations — please read</h2>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li>{PRESET.appName} is decision support, not a diagnostic device. Verify every AI finding clinically.</li>
            <li>The detector was trained on adult panoramic radiographs (OPG). On IOPA/bitewing films and children it is less reliable.</li>
            <li>
              Caries and periapical lesions are the hardest findings: on films from a new clinic the AI flags only about 1 in 4 affected teeth at first
              (about 2 in 3 of its caries suggestions are correct). Absence of a box is not absence of disease. It gets better for your films as you review.
            </li>
            <li>Drug suggestions and checks may be incomplete; confirm doses for children, pregnancy and medically compromised patients.</li>
          </ul>
        </div>
        {meta && (
          <div className="card small">
            <h2>Built-in model</h2>
            <div>Input {meta.imgsz}px · {meta.classes.length} finding types{meta.test_map50 ? ` · overall test mAP50 ${(meta.test_map50 * 100).toFixed(0)}%` : ""}</div>
            {meta.per_class_map50 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {Object.entries(meta.per_class_map50).map(([k, v]) => (
                  <span key={k} className="badge">
                    {labelInfo(k).name} {(v * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
            <p className="tiny muted">mAP50 = detection accuracy on held-out test films (higher is better). Lower-scoring types need more caution.</p>
          </div>
        )}
        <div className="card small">
          <h2>Installing on another phone</h2>
          <p style={{ margin: 0 }}>
            <b>Android:</b> install the {PRESET.appName} APK. <b>iPhone:</b> open the {PRESET.appName} web link in Safari → Share → “Add to Home Screen”. Move records
            between phones with Backup → Restore.
          </p>
        </div>
      </Screen>
    </>
  );
}
