import { useState } from "react";
import { PERMANENT_LOWER, PERMANENT_UPPER, PRIMARY_LOWER, PRIMARY_UPPER, toothName } from "../lib/fdi";
import { TOOTH_CONDITIONS } from "../lib/labels";
import type { ToothCondition } from "../types";
import { ChipToggle, Segmented, Sheet } from "../ui/kit";
import { ToothGlyph } from "./ToothGlyph";


export const TREATMENTS = [
  "Restoration (composite)",
  "Restoration (GIC)",
  "Root canal treatment",
  "Crown (PFM)",
  "Crown (zirconia)",
  "Extraction",
  "Surgical extraction",
  "Scaling & root planing",
  "Pulpotomy",
  "Implant",
  "Post & core",
  "Veneer",
];

export function ToothChart({
  chart,
  onChange,
  onAddPlan,
  disabled,
}: {
  chart: Record<string, ToothCondition[]>;
  onChange: (c: Record<string, ToothCondition[]>) => void;
  onAddPlan: (tooth: number, procedure: string) => void;
  disabled?: boolean;
}) {
  const [set, setSet] = useState<"permanent" | "primary">("permanent");
  const [sel, setSel] = useState<number | null>(null);
  const upper = set === "permanent" ? PERMANENT_UPPER : PRIMARY_UPPER;
  const lower = set === "permanent" ? PERMANENT_LOWER : PRIMARY_LOWER;

  const Tooth = ({ n, upperJaw }: { n: number; upperJaw: boolean }) => {
    const conds = chart[String(n)] ?? [];
    return (
      <button
        type="button"
        className={`tooth${sel === n ? " sel" : ""}${conds.length ? " marked" : ""}`}
        onClick={() => !disabled && setSel(n)}
        aria-label={`Tooth ${n}${conds.length ? `: ${conds.join(", ")}` : ""}`}
      >
        {upperJaw && <span className="tooth-num">{n}</span>}
        <span className="tooth-svg">
          <ToothGlyph fdi={n} conditions={conds} />
        </span>
        {!upperJaw && <span className="tooth-num">{n}</span>}
      </button>
    );
  };

  const marked = Object.entries(chart).filter(([, v]) => v.length);
  return (
    <div>
      <Segmented
        value={set}
        onChange={setSet}
        options={[
          { value: "permanent", label: "Permanent" },
          { value: "primary", label: "Primary (child)" },
        ]}
      />
      <div className="tooth-chart">
        <div className="tiny muted center" style={{ marginBottom: 4 }}>
          Patient's RIGHT ← Upper → LEFT
        </div>
        <div className={`tooth-row${set === "primary" ? " primary" : ""}`}>
          {upper.map((n) => (
            <Tooth key={n} n={n} upperJaw />
          ))}
        </div>
        <div className="jaw-gap" />
        <div className={`tooth-row${set === "primary" ? " primary" : ""}`}>
          {lower.map((n) => (
            <Tooth key={n} n={n} upperJaw={false} />
          ))}
        </div>
        <div className="tiny muted center" style={{ marginTop: 4 }}>
          Lower
        </div>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        {TOOTH_CONDITIONS.map((c) => (
          <span key={c.key} className="tiny row" style={{ gap: 4, marginRight: 6 }}>
            <i className="dot" style={{ width: 8, height: 8, borderRadius: 4, background: c.color, display: "inline-block" }} />
            {c.label}
          </span>
        ))}
      </div>
      {marked.length > 0 && (
        <div className="small" style={{ marginTop: 12 }}>
          {marked
            .sort(([a], [b]) => +a - +b)
            .map(([t, v]) => (
              <div key={t}>
                <b>#{t}</b> {v.map((c) => TOOTH_CONDITIONS.find((x) => x.key === c)?.label ?? c).join(", ")}
              </div>
            ))}
        </div>
      )}
      <Sheet open={sel !== null} onClose={() => setSel(null)} title={sel ? `Tooth ${sel} · ${toothName(sel)}` : ""}>
        {sel && (
          <>
            <div className="small bold muted" style={{ marginBottom: 6 }}>
              Conditions
            </div>
            <ChipToggle
              options={TOOTH_CONDITIONS.map((c) => c.label)}
              value={(chart[String(sel)] ?? []).map((k) => TOOTH_CONDITIONS.find((c) => c.key === k)?.label ?? k)}
              onChange={(labels) =>
                onChange({
                  ...chart,
                  [String(sel)]: labels.map((l) => TOOTH_CONDITIONS.find((c) => c.label === l)!.key as ToothCondition),
                })
              }
            />
            <div className="small bold muted" style={{ margin: "14px 0 6px" }}>
              Add to treatment plan
            </div>
            <div className="chips">
              {TREATMENTS.map((t) => (
                <button key={t} className="chip" onClick={() => onAddPlan(sel, t)}>
                  + {t}
                </button>
              ))}
            </div>
            <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => setSel(null)}>
              Done
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}
