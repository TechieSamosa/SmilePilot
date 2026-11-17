/**
 * Dental formulary + offline safety rules. These rules work without internet and run
 * on every prescription; the optional Claude check adds a broader review.
 * Doses are typical adult doses used in Indian dental practice — always verify.
 */
import type { Patient, Rx } from "../types";
import { ageOf } from "./format";

export type DrugClass =
  | "penicillin"
  | "cephalosporin"
  | "macrolide"
  | "nitroimidazole"
  | "lincosamide"
  | "tetracycline"
  | "fluoroquinolone"
  | "nsaid"
  | "cox2"
  | "paracetamol"
  | "opioid"
  | "ppi"
  | "h2"
  | "antifungal"
  | "antiviral"
  | "antiseptic"
  | "steroid"
  | "enzyme"
  | "vitamin"
  | "anxiolytic"
  | "other";

export interface Drug {
  name: string;
  classes: DrugClass[];
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
  childNote?: string;
}

export const FORMULARY: Drug[] = [
  { name: "Amoxicillin 500 mg", classes: ["penicillin"], dose: "1 cap", frequency: "1-1-1", duration: "5 days", instructions: "After food", childNote: "Child: 20–40 mg/kg/day in 3 divided doses" },
  { name: "Amoxicillin + Clavulanic acid 625 mg", classes: ["penicillin"], dose: "1 tab", frequency: "1-0-1", duration: "5 days", instructions: "After food", childNote: "Child: 25–45 mg/kg/day (amoxicillin) in 2 doses" },
  { name: "Metronidazole 400 mg", classes: ["nitroimidazole"], dose: "1 tab", frequency: "1-1-1", duration: "5 days", instructions: "After food. Strictly no alcohol during and 48 h after", childNote: "Child: 7.5 mg/kg three times daily" },
  { name: "Tinidazole 500 mg", classes: ["nitroimidazole"], dose: "1 tab", frequency: "1-0-1", duration: "3 days", instructions: "After food. No alcohol" },
  { name: "Azithromycin 500 mg", classes: ["macrolide"], dose: "1 tab", frequency: "1-0-0", duration: "3 days", instructions: "1 hour before or 2 hours after food", childNote: "Child: 10 mg/kg once daily" },
  { name: "Clindamycin 300 mg", classes: ["lincosamide"], dose: "1 cap", frequency: "1-1-1", duration: "5 days", instructions: "After food with a full glass of water" },
  { name: "Cefixime 200 mg", classes: ["cephalosporin"], dose: "1 tab", frequency: "1-0-1", duration: "5 days", instructions: "After food" },
  { name: "Cefuroxime 500 mg", classes: ["cephalosporin"], dose: "1 tab", frequency: "1-0-1", duration: "5 days", instructions: "After food" },
  { name: "Doxycycline 100 mg", classes: ["tetracycline"], dose: "1 cap", frequency: "1-0-1", duration: "5 days", instructions: "After food, upright, not with milk/antacids" },
  { name: "Ibuprofen 400 mg", classes: ["nsaid"], dose: "1 tab", frequency: "1-1-1", duration: "3 days", instructions: "After food", childNote: "Child: 5–10 mg/kg every 6–8 h" },
  { name: "Aceclofenac 100 mg + Paracetamol 325 mg", classes: ["nsaid", "paracetamol"], dose: "1 tab", frequency: "1-0-1", duration: "3 days", instructions: "After food" },
  { name: "Aceclofenac + Paracetamol + Serratiopeptidase", classes: ["nsaid", "paracetamol", "enzyme"], dose: "1 tab", frequency: "1-0-1", duration: "3 days", instructions: "After food" },
  { name: "Diclofenac 50 mg", classes: ["nsaid"], dose: "1 tab", frequency: "1-0-1", duration: "3 days", instructions: "After food" },
  { name: "Ketorolac 10 mg (DT)", classes: ["nsaid"], dose: "1 tab", frequency: "SOS", duration: "3 days (max 5)", instructions: "After food, for severe pain only" },
  { name: "Etoricoxib 90 mg", classes: ["cox2"], dose: "1 tab", frequency: "1-0-0", duration: "3 days", instructions: "After food" },
  { name: "Paracetamol 650 mg", classes: ["paracetamol"], dose: "1 tab", frequency: "1-1-1", duration: "3 days", instructions: "After food. Max 4 g/day", childNote: "Child: 15 mg/kg every 6 h (max 60 mg/kg/day)" },
  { name: "Tramadol 50 mg + Paracetamol 325 mg", classes: ["opioid", "paracetamol"], dose: "1 tab", frequency: "SOS", duration: "3 days", instructions: "May cause drowsiness; avoid driving" },
  { name: "Pantoprazole 40 mg", classes: ["ppi"], dose: "1 tab", frequency: "1-0-0", duration: "5 days", instructions: "Empty stomach, 30 min before breakfast" },
  { name: "Rabeprazole 20 mg", classes: ["ppi"], dose: "1 tab", frequency: "1-0-0", duration: "5 days", instructions: "Before breakfast" },
  { name: "Chlorhexidine 0.2% mouthwash", classes: ["antiseptic"], dose: "10 ml", frequency: "1-0-1", duration: "14 days", instructions: "Rinse 30 s, do not dilute or swallow; no food for 30 min" },
  { name: "Povidone-iodine 2% gargle", classes: ["antiseptic"], dose: "10 ml", frequency: "1-1-1", duration: "7 days", instructions: "Gargle and spit" },
  { name: "Benzydamine mouthwash", classes: ["antiseptic"], dose: "15 ml", frequency: "1-1-1", duration: "5 days", instructions: "Rinse, do not swallow" },
  { name: "Orthodontic relief wax", classes: ["other"], dose: "Small pea-size piece", frequency: "SOS", duration: "As needed", instructions: "Press over the bracket/wire that is rubbing" },
  { name: "Lignocaine 2% gel / Choline salicylate gel", classes: ["other"], dose: "Apply thin layer", frequency: "1-1-1", duration: "5 days", instructions: "Apply on ulcer before food" },
  { name: "Triamcinolone 0.1% oral paste", classes: ["steroid"], dose: "Apply thin layer", frequency: "1-0-1", duration: "7 days", instructions: "Apply on lesion after food and at bedtime" },
  { name: "Clotrimazole 1% mouth paint", classes: ["antifungal"], dose: "Apply", frequency: "1-1-1", duration: "14 days", instructions: "Apply on lesions" },
  { name: "Fluconazole 150 mg", classes: ["antifungal"], dose: "1 tab", frequency: "Once weekly", duration: "2 weeks", instructions: "" },
  { name: "Acyclovir 400 mg", classes: ["antiviral"], dose: "1 tab", frequency: "5 times a day", duration: "5 days", instructions: "" },
  { name: "Vitamin B-complex", classes: ["vitamin"], dose: "1 cap", frequency: "1-0-0", duration: "15 days", instructions: "After food" },
  { name: "Desensitising toothpaste (Potassium nitrate)", classes: ["other"], dose: "Pea-size", frequency: "1-0-1", duration: "4 weeks", instructions: "Brush gently; leave a film on sensitive area" },
  { name: "Alprazolam 0.25 mg", classes: ["anxiolytic"], dose: "1 tab", frequency: "Night before procedure", duration: "1 day", instructions: "Do not drive; needs escort" },
];

export const FREQUENCIES = ["1-0-1", "1-1-1", "1-0-0", "0-0-1", "1-1-1-1", "SOS", "Once weekly", "5 times a day", "Night before procedure"];

export const TEMPLATES: { name: string; items: string[] }[] = [
  { name: "Post-extraction", items: ["Amoxicillin 500 mg", "Aceclofenac 100 mg + Paracetamol 325 mg", "Pantoprazole 40 mg", "Chlorhexidine 0.2% mouthwash"] },
  { name: "Acute abscess / pulpitis", items: ["Amoxicillin + Clavulanic acid 625 mg", "Metronidazole 400 mg", "Aceclofenac 100 mg + Paracetamol 325 mg", "Pantoprazole 40 mg"] },
  { name: "Post-RCT pain", items: ["Ibuprofen 400 mg", "Pantoprazole 40 mg"] },
  { name: "Pericoronitis", items: ["Amoxicillin 500 mg", "Metronidazole 400 mg", "Paracetamol 650 mg", "Povidone-iodine 2% gargle"] },
  { name: "Post-scaling / gingivitis", items: ["Chlorhexidine 0.2% mouthwash", "Vitamin B-complex"] },
  { name: "Aphthous ulcer", items: ["Triamcinolone 0.1% oral paste", "Benzydamine mouthwash", "Vitamin B-complex"] },
  { name: "Penicillin-allergic infection", items: ["Azithromycin 500 mg", "Metronidazole 400 mg", "Paracetamol 650 mg"] },
  { name: "Dentine hypersensitivity", items: ["Desensitising toothpaste (Potassium nitrate)"] },
  { name: "Ortho soreness (after bonding / adjustment)", items: ["Paracetamol 650 mg", "Orthodontic relief wax", "Benzydamine mouthwash"] },
  { name: "Ulcer from braces", items: ["Orthodontic relief wax", "Lignocaine 2% gel / Choline salicylate gel", "Benzydamine mouthwash"] },
];

export function findDrug(name: string): Drug | undefined {
  const n = name.toLowerCase();
  return FORMULARY.find((d) => d.name.toLowerCase() === n) ?? FORMULARY.find((d) => n.includes(d.name.toLowerCase().split(" ")[0]!));
}

export function rxFromDrug(d: Drug, patient?: Patient): Rx {
  const age = patient ? ageOf(patient) : undefined;
  return {
    drug: d.name,
    dose: d.dose,
    frequency: d.frequency,
    duration: d.duration,
    instructions: age !== undefined && age < 12 && d.childNote ? `${d.instructions}${d.instructions ? ". " : ""}${d.childNote}` : d.instructions,
  };
}

/** Classes for a free-typed drug name (keyword based so custom entries are still checked). */
export function classesOf(drug: string): DrugClass[] {
  const known = findDrug(drug);
  const n = drug.toLowerCase();
  const out = new Set<DrugClass>(known?.classes ?? []);
  const kw: [RegExp, DrugClass][] = [
    [/amox|ampic|penicil|clavul|augment|cloxa|flucloxa/, "penicillin"],
    [/cef|cephal/, "cephalosporin"],
    [/azithro|clarithro|erythro|roxithro/, "macrolide"],
    [/metronid|tinid|ornid|flagyl/, "nitroimidazole"],
    [/clinda/, "lincosamide"],
    [/doxy|tetracyc|minocyc/, "tetracycline"],
    [/floxacin/, "fluoroquinolone"],
    [/ibupro|diclo|aceclo|ketorol|naprox|aspirin|mefenam|nimesul|piroxic|indometh/, "nsaid"],
    [/etoricox|celecox/, "cox2"],
    [/paracet|acetamin|dolo|crocin|calpol/, "paracetamol"],
    [/tramad|tapentad|codein/, "opioid"],
    [/prazole/, "ppi"],
    [/dexameth|prednis|triamcin|methylpred|hydrocort/, "steroid"],
    [/alpraz|diazep|lorazep|clonazep|midazol/, "anxiolytic"],
  ];
  for (const [re, c] of kw) if (re.test(n)) out.add(c);
  return [...out];
}

export interface RxWarning {
  severity: "high" | "medium" | "low";
  drug: string;
  message: string;
}

const has = (list: string[], re: RegExp) => list.some((x) => re.test(x.toLowerCase()));

/** Offline, rule-based safety checks. */
export function checkRxRules(patient: Patient, rx: Rx[]): RxWarning[] {
  const w: RxWarning[] = [];
  const allergies = patient.allergies.map((a) => a.toLowerCase());
  const conds = patient.conditions.map((c) => c.toLowerCase());
  const meds = (patient.medications || "").toLowerCase();
  const age = ageOf(patient);
  const pregnant = has(conds, /pregnan/);
  const lactating = has(conds, /lactat|breast/);
  const anticoag = /warfarin|acitrom|acenocoum|apixaban|rivaroxaban|dabigatran|clopidogrel|heparin|aspirin|ecosprin/.test(meds) || has(conds, /anticoag|blood thinner/);
  const nsaidCount = rx.filter((r) => classesOf(r.drug).some((c) => c === "nsaid" || c === "cox2")).length;
  const paraCount = rx.filter((r) => classesOf(r.drug).includes("paracetamol")).length;

  for (const r of rx) {
    const cls = classesOf(r.drug);
    const d = r.drug;
    // allergies
    for (const a of allergies) {
      if (!a) continue;
      if ((/penicil|amox/.test(a) && cls.includes("penicillin")) || d.toLowerCase().includes(a))
        w.push({ severity: "high", drug: d, message: `Patient is allergic to ${a}. Do not prescribe.` });
      else if (/penicil/.test(a) && cls.includes("cephalosporin"))
        w.push({ severity: "medium", drug: d, message: "Penicillin allergy: ~1–2% cross-reactivity with cephalosporins. Avoid if allergy was anaphylactic." });
      else if (/sulfa|sulpha/.test(a) && /sulfa|cotrimox|septran/.test(d.toLowerCase()))
        w.push({ severity: "high", drug: d, message: "Sulfa allergy." });
      else if (/(nsaid|aspirin|ibupro|diclo)/.test(a) && (cls.includes("nsaid") || cls.includes("cox2")))
        w.push({ severity: "high", drug: d, message: `NSAID/aspirin allergy recorded (${a}). Use paracetamol instead.` });
    }
    // NSAIDs
    if (cls.includes("nsaid") || cls.includes("cox2")) {
      if (has(conds, /asthma/)) w.push({ severity: "medium", drug: d, message: "Asthma: NSAIDs can trigger bronchospasm. Prefer paracetamol." });
      if (has(conds, /ulcer|gastritis|gerd|acidity|gi bleed/)) w.push({ severity: "medium", drug: d, message: "Peptic ulcer/gastritis: add PPI or prefer paracetamol." });
      if (has(conds, /kidney|renal|ckd/)) w.push({ severity: "high", drug: d, message: "Kidney disease: avoid NSAIDs." });
      if (has(conds, /hypertens|heart|cardiac|stroke/)) w.push({ severity: "low", drug: d, message: "Hypertension/cardiac disease: NSAIDs can raise BP — shortest course, monitor." });
      if (anticoag) w.push({ severity: "high", drug: d, message: "Patient on anticoagulant/antiplatelet: NSAIDs increase bleeding risk. Prefer paracetamol." });
      if (pregnant) w.push({ severity: "high", drug: d, message: "Pregnancy: avoid NSAIDs (especially after 20 weeks). Paracetamol is preferred." });
      if (age !== undefined && age < 16 && /aspirin/.test(d.toLowerCase())) w.push({ severity: "high", drug: d, message: "Aspirin in children <16 y: risk of Reye's syndrome." });
    }
    if (cls.includes("nitroimidazole")) {
      if (/warfarin|acitrom/.test(meds)) w.push({ severity: "high", drug: d, message: "Metronidazole strongly potentiates warfarin/acenocoumarol (INR rise)." });
      if (pregnant) w.push({ severity: "medium", drug: d, message: "Pregnancy: avoid metronidazole in the first trimester." });
      if (!/alcohol/.test(r.instructions.toLowerCase())) w.push({ severity: "low", drug: d, message: "Add advice: no alcohol during and for 48 h after." });
    }
    if (cls.includes("tetracycline")) {
      if (pregnant || lactating) w.push({ severity: "high", drug: d, message: "Tetracyclines are contraindicated in pregnancy/lactation (tooth staining)." });
      if (age !== undefined && age < 12) w.push({ severity: "high", drug: d, message: "Tetracyclines are contraindicated under 12 years (tooth discolouration)." });
    }
    if (cls.includes("fluoroquinolone") && age !== undefined && age < 18) w.push({ severity: "medium", drug: d, message: "Fluoroquinolones are generally avoided under 18." });
    if (cls.includes("macrolide") && /statin|atorva|simva|rosuva/.test(meds) && /clarithro|erythro/.test(d.toLowerCase()))
      w.push({ severity: "medium", drug: d, message: "Clarithro/erythromycin with statins: myopathy risk." });
    if (cls.includes("paracetamol") && has(conds, /liver|hepat|cirrhos|alcohol/))
      w.push({ severity: "medium", drug: d, message: "Liver disease/alcohol use: limit paracetamol to 2 g/day." });
    if (cls.includes("opioid") || cls.includes("anxiolytic")) {
      if (pregnant) w.push({ severity: "medium", drug: d, message: "Pregnancy: avoid opioids/benzodiazepines unless essential." });
      if (age !== undefined && age >= 65) w.push({ severity: "low", drug: d, message: "Elderly: sedation and fall risk — use lowest dose." });
    }
    if (cls.includes("steroid") && has(conds, /diabet/) && !/paste|gel|topical|mouth/.test(d.toLowerCase()))
      w.push({ severity: "medium", drug: d, message: "Systemic steroid in diabetic: monitor blood sugar." });
    if (age !== undefined && age < 12 && !/child|kg/.test(r.instructions.toLowerCase()) && /\d{3,}\s?mg/.test(d) && !cls.includes("antiseptic"))
      w.push({ severity: "medium", drug: d, message: "Child patient: confirm weight-based paediatric dose/formulation (syrup/DT)." });
    if (!r.duration.trim()) w.push({ severity: "low", drug: d, message: "Duration missing." });
  }
  if (nsaidCount > 1) w.push({ severity: "high", drug: "NSAIDs", message: "More than one NSAID prescribed — duplicate therapy." });
  if (paraCount > 1) w.push({ severity: "medium", drug: "Paracetamol", message: "Paracetamol in more than one product — check total daily dose (max 4 g)." });
  const order = { high: 0, medium: 1, low: 2 };
  const seen = new Set<string>();
  return w
    .filter((x) => {
      const k = x.drug + x.message;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

export const COMMON_CONDITIONS = [
  "Diabetes",
  "Hypertension",
  "Heart disease",
  "Asthma",
  "Pregnancy",
  "Lactating",
  "Thyroid disorder",
  "Kidney disease",
  "Liver disease",
  "Epilepsy",
  "Bleeding disorder",
  "On blood thinners",
  "Peptic ulcer / gastritis",
  "HIV / Hepatitis",
  "Bisphosphonate therapy",
  "Smoker",
  "Tobacco / gutkha",
  "Alcohol use",
];

export const COMMON_ALLERGIES = ["Penicillin", "Sulfa drugs", "NSAIDs / Aspirin", "Local anaesthetic", "Latex", "Metronidazole", "Iodine"];

/** Common post-operative / home-care advice lines (used in Rx and the offline reference). */
export const ADVICE = [
  "Do not spit, rinse or use a straw for 24 hours.",
  "Bite firmly on the gauze for 45 minutes.",
  "Apply ice pack on the cheek 10 min on / 10 min off for the first day.",
  "Soft, cold diet today; avoid hot and spicy food.",
  "Warm saline rinses from tomorrow, 3–4 times a day.",
  "Avoid chewing on the treated side until the crown is placed.",
  "Brush twice daily with a soft brush; floss daily.",
  "Avoid smoking and tobacco for at least 72 hours.",
  "Numbness will last 2–3 hours; do not bite lips or cheek.",
  "Report immediately if swelling increases, fever or difficulty swallowing.",
];

export const CARE_SHEETS: { title: string; lines: string[] }[] = [
  { title: "After extraction", lines: [ADVICE[1]!, ADVICE[0]!, ADVICE[2]!, ADVICE[3]!, ADVICE[4]!, ADVICE[7]!, ADVICE[9]!] },
  { title: "After root canal treatment", lines: [ADVICE[5]!, ADVICE[8]!, "Mild pain for 2–3 days is normal; take the prescribed pain medicine.", ADVICE[9]!] },
  { title: "After filling", lines: [ADVICE[8]!, "Avoid very hot or cold food for 24 hours.", "Some sensitivity for a few days is normal.", ADVICE[6]!] },
  {
    title: "Braces care",
    lines: [
      "Teeth feel sore for 3–5 days after placement or tightening — soft food and paracetamol help.",
      "Avoid hard and sticky food: nuts, corn on the cob, chewing gum, toffees, hard chikki.",
      "Cut fruits into small pieces; do not bite directly into apples or guavas.",
      "Brush after every meal with an orthodontic brush; use an interdental brush around brackets.",
      "Put orthodontic wax on any bracket or wire that rubs your cheek.",
      "If a bracket comes loose or a wire pokes, call the clinic — do not wait for the next visit.",
      "Wear elastics exactly as advised; change them daily.",
    ],
  },
  {
    title: "Aligner care",
    lines: [
      "Wear aligners about 22 hours a day — remove only to eat, drink anything except water, and brush.",
      "Brush your teeth before putting the aligners back in.",
      "Clean aligners with cold water and a soft brush; never use hot water.",
      "Always keep aligners in their case when not in your mouth.",
      "Switch to the next set on the scheduled day; keep the previous set safely.",
      "Mild pressure for 1–2 days with each new set is normal.",
      "If an aligner cracks or does not fit, wear the previous one and call the clinic.",
    ],
  },
  {
    title: "Retainer care",
    lines: [
      "Wear retainers exactly as advised — usually full-time at first, then nights only.",
      "Teeth can move back if retainers are not worn.",
      "Clean retainers daily with a soft brush and cold water.",
      "Bring your retainers to every review visit.",
    ],
  },
  { title: "After scaling & polishing", lines: ["Mild gum sensitivity or bleeding for 1–2 days is normal.", ADVICE[6]!, "Use the prescribed mouthwash after brushing.", ADVICE[7]!] },
];
