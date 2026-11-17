import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getSetting, setSetting } from "../db";
import { createBackup, restoreBackup, storageEstimate } from "../lib/backup";
import { fmtDateTime } from "../lib/format";
import { shareFile } from "../lib/platform";
import { IconDownload, IconUpload } from "../ui/icons";
import { Screen, Segmented, Spinner, TopBar, useConfirm, useFilePicker, useToast } from "../ui/kit";
import { PRESET } from "../preset";

export default function Backup() {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const last = useLiveQuery(() => getSetting<number>("lastBackupAt", 0), [busy]);
  const est = useLiveQuery(storageEstimate, []);

  const backup = async () => {
    setBusy("Preparing backup…");
    try {
      const blob = await createBackup(false, setBusy);
      const name = `${PRESET.appName.replace(/\s+/g, "")}_backup_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.zip`;
      await shareFile(blob, name, `${PRESET.appName} backup`);
      await setSetting("lastBackupAt", Date.now());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pick = useFilePicker(".zip,application/zip", async (files) => {
    if (mode === "replace" && !(await confirm({ title: "Replace all data?", message: "Everything currently on this phone will be replaced by the backup.", ok: "Replace", danger: true }))) return;
    setBusy("Reading backup…");
    try {
      const r = await restoreBackup(files[0]!, mode, setBusy);
      toast(`Restored ${r.patients} patients and ${r.images} images`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  });

  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  return (
    <>
      <TopBar back title="Backup & restore" />
      <Screen tabs={false}>
        <div className={`alert ${days === null || days > 7 ? "warn" : "ok"}`}>
          {last ? `Last backup: ${fmtDateTime(last)}` : "You have never made a backup."} Records live only on this phone — if the phone is lost or the app is
          uninstalled, data can only be recovered from a backup.
        </div>
        <div className="card">
          <h2>Create backup</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Creates one .zip with all patients, visits, X-rays and settings (not your API key or PIN). Save it to Google Drive, email it to yourself
            or keep it on WhatsApp “Message yourself”. Do this weekly.
          </p>
          <button className="btn primary block" onClick={backup} disabled={!!busy}>
            {busy ? <Spinner /> : <IconDownload />} {busy ?? "Back up now"}
          </button>
        </div>
        <div className="card">
          <h2>Restore</h2>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "merge", label: "Merge with current" },
              { value: "replace", label: "Replace everything" },
            ]}
          />
          <p className="small muted" style={{ marginTop: 0 }}>
            Use this on a new phone, or to move records between devices (e.g. from your Android phone to an iPhone).
          </p>
          <button className="btn block" onClick={pick} disabled={!!busy}>
            <IconUpload /> Choose backup file
          </button>
        </div>
        {est && (
          <p className="tiny muted center">
            Using {est.usedMB} MB of {est.quotaMB > 0 ? `${est.quotaMB} MB` : "available"} storage.
          </p>
        )}
      </Screen>
    </>
  );
}
