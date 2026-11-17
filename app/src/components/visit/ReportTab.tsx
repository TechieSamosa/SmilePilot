import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { db, getProfile, uid } from "../../db";
import { distillPreference, draftReport, isClaudeConfigured, patientExplanation } from "../../lib/ai/claude";
import { buildCaseRecord, buildPatientMessage, OFFLINE_LANGS, type OfflineLang } from "../../lib/offline";
import { safeFileName, whatsappUrl } from "../../lib/format";
import { prescriptionPdf, xrayReportPdf } from "../../lib/pdf";
import { openExternal, shareFile, shareText } from "../../lib/platform";
import type { VisitPatch } from "../../screens/VisitScreen";
import type { Patient, Visit } from "../../types";
import { IconCheck, IconFile, IconShare, IconSparkle, IconThumbDown, IconThumbUp, IconWhatsApp } from "../../ui/icons";
import { AutoTextarea, Sheet, Spinner, useConfirm, useToast } from "../../ui/kit";

const LANGS = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu", "Odia"];

export function ReportTab({ visit, patient, patch, flush }: { visit: Visit; patient: Patient; patch: VisitPatch; flush: () => Promise<void> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const profile = useLiveQuery(getProfile, []);
  const [online, setOnline] = useState(false); // optional Claude key present
  useEffect(() => {
    isClaudeConfigured().then(setOnline);
  }, []);
  const [busy, setBusy] = useState<"" | "draft" | "msg" | "pdf" | "xpdf">("");
  const [msg, setMsg] = useState("");
  const [lang, setLang] = useState<string | null>(null);
  const [rating, setRating] = useState<1 | -1 | 0>(0);
  const [askWhy, setAskWhy] = useState(false);
  const [why, setWhy] = useState("");
  const abort = useRef<AbortController | null>(null);
  const languages: string[] = online ? LANGS : [...OFFLINE_LANGS];
  const preferred = lang ?? profile?.patientLanguage ?? "English";
  const language = languages.includes(preferred) ? preferred : "English";
  const imgCount = useLiveQuery(() => db.images.where("visitId").equals(visit.id).count(), [visit.id]);

  const draft = async () => {
    await flush();
    setBusy("draft");
    abort.current = new AbortController();
    try {
      const text = await draftReport(visit, patient, (t) => patch({ report: t }), abort.current.signal);
      patch({ report: text, reportDraft: text });
      setRating(0);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const quickRecord = async () => {
    await flush();
    if (visit.report.trim() && !(await confirm({ title: "Replace the case record?", message: "The current text will be replaced with a fresh record built from this visit.", ok: "Replace" }))) return;
    const fresh = (await db.visits.get(visit.id)) ?? visit;
    patch({ report: await buildCaseRecord(fresh, patient), reportDraft: "" });
  };

  const saveFeedback = async (r: 1 | -1 | 0, comment?: string) => {
    await db.feedback.add({
      id: uid(),
      kind: "report",
      rating: r,
      aiText: visit.reportDraft,
      finalText: visit.report,
      comment,
      createdAt: Date.now(),
    });
  };

  const rate = async (r: 1 | -1) => {
    setRating(r);
    if (r === -1) setAskWhy(true);
    else {
      await saveFeedback(1);
      toast("Thanks — future reports will follow this style");
    }
  };

  const submitWhy = async () => {
    setAskWhy(false);
    await saveFeedback(-1, why);
    if (why.trim()) {
      try {
        const pref = await distillPreference(visit.reportDraft, why);
        if (pref) {
          await db.preferences.add({ id: uid(), text: pref, source: "learned", createdAt: Date.now() });
          toast(`Learned: “${pref}”`);
        }
      } catch {
        await db.preferences.add({ id: uid(), text: why.trim(), source: "learned", createdAt: Date.now() });
      }
    }
    setWhy("");
  };

  const finalize = async () => {
    // record the (AI draft -> dentist final) pair: the strongest learning signal
    if (visit.reportDraft && visit.report && rating === 0) await saveFeedback(visit.report.trim() === visit.reportDraft.trim() ? 1 : 0);
    patch({ status: "finalized" });
    await flush();
    toast("Visit finalized");
  };

  const makeMsg = async () => {
    await flush();
    setBusy("msg");
    try {
      const fresh = (await db.visits.get(visit.id)) ?? visit;
      if ((OFFLINE_LANGS as readonly string[]).includes(language)) setMsg(await buildPatientMessage(fresh, patient, language as OfflineLang));
      else setMsg(await patientExplanation(fresh, patient, language, setMsg));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const pdf = async (kind: "pdf" | "xpdf") => {
    await flush();
    setBusy(kind);
    try {
      const fresh = (await db.visits.get(visit.id)) ?? visit;
      const blob = kind === "pdf" ? await prescriptionPdf(fresh, patient) : await xrayReportPdf(fresh, patient);
      await shareFile(blob, `${kind === "pdf" ? "Summary" : "Xray_Report"}_${safeFileName(patient.name)}_${new Date(visit.date).toISOString().slice(0, 10)}.pdf`, "Report");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="card">
        <h2>
          <IconFile style={{ width: 18, height: 18 }} /> Case record
        </h2>
        <button className="btn primary block" style={{ marginBottom: 8 }} onClick={quickRecord} disabled={visit.status === "finalized" || busy === "draft"}>
          <IconFile /> {visit.report ? "Rebuild case record from this visit" : "Create case record from this visit"}
        </button>
        {online &&
          (busy === "draft" ? (
            <button className="btn block" style={{ marginBottom: 10 }} onClick={() => abort.current?.abort()}>
              <Spinner /> Writing… tap to stop
            </button>
          ) : (
            <button className="btn block" style={{ marginBottom: 10 }} onClick={draft} disabled={visit.status === "finalized"}>
              <IconSparkle /> Write it in prose with online AI
            </button>
          ))}
        <AutoTextarea
          value={visit.report}
          onChange={(e) => patch({ report: e.target.value })}
          placeholder="Tap the button above to build the record from your notes, chart, X-ray findings and prescription — then edit freely."
          readOnly={visit.status === "finalized"}
          style={{ minHeight: 160 }}
        />
        {visit.reportDraft && busy !== "draft" && (
          <div className="row small" style={{ marginTop: 8 }}>
            <span className="grow muted">Was the AI draft useful?</span>
            <button className={`icon-btn${rating === 1 ? "" : ""}`} style={rating === 1 ? { color: "var(--primary)" } : undefined} onClick={() => rate(1)} aria-label="Good">
              <IconThumbUp />
            </button>
            <button className="icon-btn" style={rating === -1 ? { color: "var(--danger)" } : undefined} onClick={() => rate(-1)} aria-label="Bad">
              <IconThumbDown />
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>
          <IconWhatsApp style={{ width: 18, height: 18 }} /> Message for the patient
        </h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <select className="input grow" value={language} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button className="btn" onClick={makeMsg} disabled={busy === "msg"}>
            {busy === "msg" ? <Spinner /> : <IconWhatsApp />} Write
          </button>
        </div>
        {msg && (
          <>
            <AutoTextarea value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="btn-grid" style={{ marginTop: 8 }}>
              <button className="btn primary" disabled={!patient.phone} onClick={() => openExternal(whatsappUrl(patient.phone, profile?.countryCode ?? "91", msg))}>
                <IconWhatsApp /> WhatsApp
              </button>
              <button className="btn" onClick={() => shareText(msg)}>
                <IconShare /> Share
              </button>
            </div>
          </>
        )}
      </div>

      <div className="stack">
        <button className="btn block" onClick={() => pdf("pdf")} disabled={!!busy}>
          {busy === "pdf" ? <Spinner /> : <IconShare />} Case summary + Rx PDF
        </button>
        {!!imgCount && (
          <button className="btn block" onClick={() => pdf("xpdf")} disabled={!!busy}>
            {busy === "xpdf" ? <Spinner /> : <IconShare />} X-ray report PDF (annotated)
          </button>
        )}
        {visit.status !== "finalized" ? (
          <button className="btn primary block" onClick={finalize}>
            <IconCheck /> Finalize visit
          </button>
        ) : (
          <button className="btn block" onClick={() => patch({ status: "open" })}>
            Reopen visit for editing
          </button>
        )}
      </div>

      <Sheet open={askWhy} onClose={() => setAskWhy(false)} title="What should the AI do differently?">
        <p className="small muted" style={{ marginTop: 0 }}>
          This becomes a standing instruction for all future drafts (you can edit it in More → AI memory).
        </p>
        <AutoTextarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Keep it shorter; always mention tooth numbers in the diagnosis; use 'wrt' notation" />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={submitWhy}>
          Save feedback
        </button>
      </Sheet>
    </>
  );
}
