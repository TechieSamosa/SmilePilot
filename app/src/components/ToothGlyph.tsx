/**
 * Anatomical tooth drawing for the chart. Shape follows the tooth type (incisor, canine,
 * premolar, molar; upper roots up, lower roots down) and conditions are drawn on it.
 */
import type { ToothCondition } from "../types";

const C = {
  enamel: "var(--surface)",
  outline: "var(--muted)",
  caries: "#ef4444",
  filling: "#22c55e",
  crown: "#06b6d4",
  rct: "#3b82f6",
  periapical: "#f97316",
  implant: "#64748b",
  extract: "#b91c1c",
  impacted: "#a855f7",
};

export function ToothGlyph({ fdi, conditions }: { fdi: number; conditions: ToothCondition[] }) {
  const q = Math.floor(fdi / 10);
  const t = fdi % 10;
  const upper = q === 1 || q === 2 || q === 5 || q === 6;
  const primary = q >= 5;
  const type = primary ? (t <= 2 ? "incisor" : t === 3 ? "canine" : "molar") : t <= 2 ? "incisor" : t === 3 ? "canine" : t <= 5 ? "premolar" : "molar";
  const has = (c: ToothCondition) => conditions.includes(c);
  const missing = has("missing");
  const implant = has("implant");

  // Drawn in a 24x48 box with the crown at the bottom (lower jaw orientation); flipped for upper.
  const crownW = type === "molar" ? 20 : type === "premolar" ? 16 : type === "canine" ? 13 : 12;
  const cx = 12;
  const crownTop = 26;
  const crownBot = 44;
  const crown =
    type === "molar"
      ? `M${cx - crownW / 2},${crownTop} Q${cx - crownW / 2 - 1},${crownBot - 2} ${cx - crownW / 2 + 3},${crownBot} L${cx - 2},${crownBot - 2} L${cx + 2},${crownBot} L${cx + crownW / 2 - 3},${crownBot} Q${cx + crownW / 2 + 1},${crownBot - 2} ${cx + crownW / 2},${crownTop} Z`
      : type === "canine"
        ? `M${cx - crownW / 2},${crownTop} Q${cx - crownW / 2},${crownBot - 4} ${cx},${crownBot + 1} Q${cx + crownW / 2},${crownBot - 4} ${cx + crownW / 2},${crownTop} Z`
        : `M${cx - crownW / 2},${crownTop} L${cx - crownW / 2 + 1},${crownBot} Q${cx},${crownBot + 1.5} ${cx + crownW / 2 - 1},${crownBot} L${cx + crownW / 2},${crownTop} Z`;
  const rootLen = type === "canine" ? 24 : type === "molar" ? 19 : 21;
  const roots =
    type === "molar"
      ? [`M${cx - crownW / 2 + 1},${crownTop} Q${cx - 8},${crownTop - rootLen / 2} ${cx - 6},${crownTop - rootLen} Q${cx - 3},${crownTop - rootLen / 2} ${cx - 1},${crownTop}`, `M${cx + 1},${crownTop} Q${cx + 3},${crownTop - rootLen / 2} ${cx + 6},${crownTop - rootLen} Q${cx + 8},${crownTop - rootLen / 2} ${cx + crownW / 2 - 1},${crownTop}`]
      : [`M${cx - crownW / 2 + 1.5},${crownTop} Q${cx - 2},${crownTop - rootLen} ${cx},${crownTop - rootLen} Q${cx + 2},${crownTop - rootLen} ${cx + crownW / 2 - 1.5},${crownTop}`];
  const rootTips = type === "molar" ? [cx - 6, cx + 6] : [cx];
  const crownFill = has("crown") ? C.crown : C.enamel;

  return (
    <svg viewBox="0 0 24 48" width="100%" height="100%" aria-hidden style={{ transform: upper ? "scaleY(-1)" : undefined, opacity: missing ? 0.3 : 1 }}>
      {implant ? (
        <g stroke={C.implant} strokeWidth="1.4" fill="none">
          <path d={`M${cx - 3},${crownTop} L${cx - 2},${crownTop - 20} L${cx + 2},${crownTop - 20} L${cx + 3},${crownTop} Z`} fill="#cbd5e1" />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={cx - 3.5} x2={cx + 3.5} y1={crownTop - 3 - i * 4} y2={crownTop - 4 - i * 4} />
          ))}
        </g>
      ) : (
        roots.map((d, i) => <path key={i} d={d} fill={C.enamel} stroke={C.outline} strokeWidth="1" strokeDasharray={missing ? "2 2" : undefined} />)
      )}
      {has("rct") && !implant && rootTips.map((x, i) => <line key={i} x1={x} x2={cx + (x - cx) * 0.3} y1={crownTop - rootLen + 2} y2={crownTop + 2} stroke={C.rct} strokeWidth="2.2" strokeLinecap="round" />)}
      {has("periapical") && rootTips.map((x, i) => <circle key={i} cx={x} cy={crownTop - rootLen} r="3.6" fill={C.periapical} opacity="0.75" />)}
      <path d={crown} fill={crownFill} stroke={has("crown") ? C.crown : C.outline} strokeWidth="1.1" strokeDasharray={missing ? "2 2" : undefined} />
      {has("filling") && <rect x={cx - crownW / 4} y={crownTop + 9} width={crownW / 2} height="6" rx="2" fill={C.filling} />}
      {has("caries") && <circle cx={cx + crownW / 4} cy={crownTop + 10} r="3.2" fill={C.caries} />}
      {has("fracture") && <path d={`M${cx - 4},${crownBot - 1} L${cx},${crownTop + 8} L${cx - 2},${crownTop + 11} L${cx + 3},${crownTop + 3}`} stroke="#db2777" strokeWidth="1.6" fill="none" />}
      {has("extraction_needed") && (
        <g stroke={C.extract} strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="42" />
          <line x1="21" y1="6" x2="3" y2="42" />
        </g>
      )}
      {has("impacted") && <circle cx={cx} cy="24" r="10.5" fill="none" stroke={C.impacted} strokeWidth="1.5" strokeDasharray="3 2" />}
      {has("mobility") && <path d={`M2,${crownTop + 6} l2,-2 M2,${crownTop + 6} l2,2 M22,${crownTop + 6} l-2,-2 M22,${crownTop + 6} l-2,2`} stroke="#eab308" strokeWidth="1.5" />}
      {has("sensitivity") && <path d={`M${cx + 7},${crownTop + 1} l-2,4 l3,0 l-2,4`} stroke="#0ea5e9" strokeWidth="1.3" fill="none" />}
    </svg>
  );
}
