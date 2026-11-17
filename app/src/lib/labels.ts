/** Pathology classes detected by the on-device model (order == model class ids). */
export const PATHOLOGY_CLASSES = [
  "implant",
  "crown_bridge",
  "filling",
  "root_canal_treatment",
  "caries",
  "bone_loss",
  "impacted_tooth",
  "periapical_lesion",
  "root_fragment",
  "furcation_lesion",
  "apical_surgery",
  "root_resorption",
  "orthodontic_device",
  "surgical_device",
] as const;

export type Severity = "existing" | "watch" | "treat" | "urgent";

interface LabelInfo {
  name: string;
  color: string;
  severity: Severity;
  hint: string;
}

const INFO: Record<string, LabelInfo> = {
  caries: { name: "Caries", color: "#ef4444", severity: "treat", hint: "Radiolucency suggestive of carious lesion — confirm clinically (probe, transillumination)." },
  periapical_lesion: { name: "Periapical lesion", color: "#f97316", severity: "urgent", hint: "Periapical radiolucency / apical periodontitis — check vitality, percussion, consider RCT." },
  bone_loss: { name: "Bone loss", color: "#eab308", severity: "treat", hint: "Alveolar bone resorption — correlate with probing depths and mobility." },
  furcation_lesion: { name: "Furcation involvement", color: "#f59e0b", severity: "treat", hint: "Furcation radiolucency — grade with Nabers probe." },
  root_resorption: { name: "Root resorption", color: "#dc2626", severity: "urgent", hint: "Internal/external resorption suspected — consider CBCT." },
  root_fragment: { name: "Retained root", color: "#b91c1c", severity: "treat", hint: "Retained root fragment — evaluate for extraction." },
  impacted_tooth: { name: "Impacted tooth", color: "#a855f7", severity: "watch", hint: "Impaction — assess angulation, relation to IAN canal / sinus." },
  filling: { name: "Filling", color: "#22c55e", severity: "existing", hint: "Existing restoration — check margins for secondary caries." },
  crown_bridge: { name: "Crown / bridge", color: "#06b6d4", severity: "existing", hint: "Existing fixed prosthesis — check marginal fit." },
  root_canal_treatment: { name: "Root canal treated", color: "#3b82f6", severity: "existing", hint: "Endodontically treated tooth — check obturation length and density." },
  implant: { name: "Implant", color: "#64748b", severity: "existing", hint: "Dental implant — check crestal bone levels." },
  apical_surgery: { name: "Apical surgery", color: "#8b5cf6", severity: "existing", hint: "Signs of previous apicoectomy." },
  orthodontic_device: { name: "Orthodontic appliance", color: "#14b8a6", severity: "existing", hint: "Brackets / wires / retainer." },
  surgical_device: { name: "Surgical device", color: "#94a3b8", severity: "existing", hint: "Plates, screws or other surgical hardware." },
};

export function labelInfo(label: string): LabelInfo {
  return (
    INFO[label] ?? {
      name: label.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      color: "#e11d48",
      severity: "watch",
      hint: "",
    }
  );
}

export const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, treat: 1, watch: 2, existing: 3 };

/** Default per-class display thresholds (overridden by learned calibration). */
export const DEFAULT_THRESHOLD = 0.3;

export const TOOTH_CONDITIONS: { key: string; label: string; color: string }[] = [
  { key: "caries", label: "Caries", color: "#ef4444" },
  { key: "filling", label: "Filling", color: "#22c55e" },
  { key: "crown", label: "Crown", color: "#06b6d4" },
  { key: "rct", label: "RCT done", color: "#3b82f6" },
  { key: "periapical", label: "Periapical", color: "#f97316" },
  { key: "extraction_needed", label: "Extract", color: "#b91c1c" },
  { key: "missing", label: "Missing", color: "#94a3b8" },
  { key: "implant", label: "Implant", color: "#64748b" },
  { key: "impacted", label: "Impacted", color: "#a855f7" },
  { key: "mobility", label: "Mobile", color: "#eab308" },
  { key: "fracture", label: "Fracture", color: "#db2777" },
  { key: "sensitivity", label: "Sensitive", color: "#0ea5e9" },
];

/** Map AI finding labels onto tooth-chart conditions. */
export const FINDING_TO_CONDITION: Record<string, string> = {
  caries: "caries",
  filling: "filling",
  crown_bridge: "crown",
  root_canal_treatment: "rct",
  periapical_lesion: "periapical",
  implant: "implant",
  impacted_tooth: "impacted",
  root_fragment: "extraction_needed",
};
