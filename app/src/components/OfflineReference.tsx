import { useState } from "react";
import { CARE_SHEETS, FORMULARY, TEMPLATES } from "../lib/drugs";
import { shareText } from "../lib/platform";
import { IconPill, IconSearch, IconShare } from "../ui/icons";
import { Segmented } from "../ui/kit";
import { useOrtho } from "../ui/useOrtho";

/** Free, offline clinical quick-reference (shown in the Assistant tab when no online AI is set up). */
export function OfflineReference() {
  const [tab, setTab] = useState<"drugs" | "sets" | "care">("drugs");
  const [q, setQ] = useState("");
  const ortho = useOrtho();
  const isOrthoSheet = (t: string) => /braces|aligner|retainer/i.test(t);
  const sheets = ortho ? [...CARE_SHEETS.filter((c) => isOrthoSheet(c.title)), ...CARE_SHEETS.filter((c) => !isOrthoSheet(c.title))] : CARE_SHEETS;
  const drugs = FORMULARY.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.classes.some((c) => c.includes(q.toLowerCase())));
  return (
    <>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "drugs", label: "Medicines" },
          { value: "sets", label: "Rx sets" },
          { value: "care", label: "Care sheets" },
        ]}
      />
      {tab === "drugs" && (
        <>
          <div className="search" style={{ marginBottom: 10 }}>
            <IconSearch />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicine or group (e.g. nsaid, penicillin)" />
          </div>
          {drugs.map((d) => (
            <div className="card" key={d.name}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <IconPill style={{ width: 20, height: 20, color: "var(--primary)", flex: "none", marginTop: 2 }} />
                <div className="grow">
                  <div className="bold">{d.name}</div>
                  <div className="small">
                    {d.dose} · {d.frequency} · {d.duration}
                    {d.instructions ? ` · ${d.instructions}` : ""}
                  </div>
                  {d.childNote && <div className="small muted">{d.childNote}</div>}
                  <div className="chips" style={{ marginTop: 6 }}>
                    {d.classes.map((c) => (
                      <span key={c} className="badge">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <p className="tiny muted center">Typical adult doses used in Indian dental practice — always verify for the individual patient.</p>
        </>
      )}
      {tab === "sets" &&
        TEMPLATES.map((t) => (
          <div className="card" key={t.name}>
            <h2>{t.name}</h2>
            {t.items.map((n) => {
              const d = FORMULARY.find((x) => x.name === n);
              return (
                <div key={n} className="small" style={{ marginBottom: 4 }}>
                  • <b>{n}</b>
                  {d ? ` — ${d.dose}, ${d.frequency}, ${d.duration}` : ""}
                </div>
              );
            })}
            <p className="tiny muted" style={{ marginBottom: 0 }}>Add it in a visit: Rx tab → Templates.</p>
          </div>
        ))}
      {tab === "care" &&
        sheets.map((c) => (
          <div className="card" key={c.title}>
            <div className="row">
              <h2 className="grow" style={{ margin: 0 }}>
                {c.title}
              </h2>
              <button className="btn sm" onClick={() => shareText(`${c.title}\n\n${c.lines.map((l) => `• ${l}`).join("\n")}`, c.title)}>
                <IconShare /> Share
              </button>
            </div>
            <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
              {c.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
    </>
  );
}
