import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, uid } from "../db";
import { IconBrain, IconTrash } from "../ui/icons";
import { Empty, Screen, TopBar } from "../ui/kit";

const SUGGESTED = [
  "Use Indian brand names along with generic names",
  "Write doses in 1-0-1 notation",
  "Keep answers short and in bullet points",
  "Always mention FDI tooth numbers",
  "Prefer composite over amalgam in recommendations",
];

export default function Preferences() {
  const prefs = useLiveQuery(() => db.preferences.orderBy("createdAt").toArray(), []);
  const [text, setText] = useState("");
  const add = async (t: string) => {
    if (!t.trim()) return;
    await db.preferences.add({ id: uid(), text: t.trim(), source: "manual", createdAt: Date.now() });
    setText("");
  };
  return (
    <>
      <TopBar back title="AI memory" />
      <Screen tabs={false}>
        <p className="small muted" style={{ marginTop: 0 }}>
          The assistant follows these instructions in every report, chat and check. Items marked <span className="badge primary">learned</span> came from your 👎 feedback.
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an instruction…" onKeyDown={(e) => e.key === "Enter" && add(text)} />
          <button className="btn primary" onClick={() => add(text)}>
            Add
          </button>
        </div>
        {prefs && prefs.length > 0 ? (
          <div className="list">
            {prefs.map((p) => (
              <div key={p.id} className="list-item">
                <div className="grow">
                  <input
                    className="input"
                    style={{ border: 0, padding: 0, minHeight: 30, background: "transparent" }}
                    defaultValue={p.text}
                    onBlur={(e) => e.target.value.trim() && db.preferences.update(p.id, { text: e.target.value.trim() })}
                  />
                  {p.source === "learned" && <span className="badge primary">learned</span>}
                </div>
                <button className="icon-btn" onClick={() => db.preferences.delete(p.id)} aria-label="Delete">
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={<IconBrain />} title="No instructions yet" />
        )}
        <div className="section-title">Suggestions</div>
        <div className="chips">
          {SUGGESTED.filter((s) => !prefs?.some((p) => p.text === s)).map((s) => (
            <button key={s} className="chip" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      </Screen>
    </>
  );
}
