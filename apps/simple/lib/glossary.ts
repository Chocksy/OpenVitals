/**
 * What the words mean.
 *
 * The owner read the ledger and asked "what is ALP?". Every page prints lab
 * shorthand — ALP, ApoB, HOMA-IR, LR, grade C — because the engine speaks that
 * way, and nothing on screen ever said what any of it was. So: one entry per
 * term the pages print, four fields each, and a `<Term>` that shows them.
 *
 * `why` is not written twice. `lib/vectors.ts` already says why a marker is
 * worth measuring, so an entry with no `why` of its own borrows the vector's.
 *
 * Pure data plus two pure functions. No database, no clock, no model:
 * `lib/glossary.test.ts` walks these keys against the metric catalog in
 * `lib/graph.ts` so a new marker cannot ship without its sentence.
 */
import { VECTORS } from "./vectors";

export interface GlossaryEntry {
  /** the key: a metric code where one exists, else a slug */
  id: string;
  /** the label the pages print: "ALP", "HbA1c", "Lp(a)" */
  label: string;
  /** the full name, when the label is shorthand for one */
  full?: string;
  /** other spellings the pages print for the same thing */
  aliases?: string[];
  /** one plain sentence: what the thing is */
  what: string;
  /** one sentence: why it is worth knowing. Defaults to the vector's own. */
  why: string;
  /** the unit it is measured in, when it has one */
  unit?: string;
  /** where a person would get it: "on any basic blood panel" */
  where: string;
  /** true when the label is shorthand, so prose scanning marks it up */
  abbrev?: boolean;
}

/** What the entries below are written as, before the vector fills the gaps. */
type Draft = Omit<GlossaryEntry, "why"> & { why?: string };

/** metric code → the sentence `lib/vectors.ts` already wrote for it. */
const VECTOR_WHY = new Map<string, string>();
for (const v of VECTORS) {
  for (const code of v.codes ?? [])
    if (!VECTOR_WHY.has(code)) VECTOR_WHY.set(code, v.why);
  if (v.fact && !VECTOR_WHY.has(v.fact)) VECTOR_WHY.set(v.fact, v.why);
}

const BLOOD = "on any basic blood panel";
const LIPIDS = "on a lipid panel";
const LIVER = "on a liver panel";
const THYROID = "on a thyroid panel";
const CBC = "on a full blood count";
const COMPUTED = "computed from numbers you already have";

const DRAFTS: Draft[] = [
  /* ── lipids ──────────────────────────────────────────────────────────── */
  {
    id: "apolipoprotein_b",
    label: "ApoB",
    full: "Apolipoprotein B",
    abbrev: true,
    aliases: ["apoB"],
    what: "One count of every particle in your blood that can lodge in an artery wall.",
    unit: "mg/dL",
    where: "asked for by name on a lipid panel; not always included",
  },
  {
    id: "ldl_cholesterol",
    label: "LDL cholesterol",
    full: "Low-density lipoprotein cholesterol",
    abbrev: true,
    aliases: ["LDL"],
    what: "The cholesterol carried by the particles that build up in arteries.",
    unit: "mg/dL",
    where: LIPIDS,
  },
  {
    id: "hdl_cholesterol",
    label: "HDL cholesterol",
    full: "High-density lipoprotein cholesterol",
    abbrev: true,
    aliases: ["HDL"],
    what: "The cholesterol carried back out of the artery wall.",
    unit: "mg/dL",
    where: LIPIDS,
  },
  {
    id: "triglycerides",
    label: "Triglycerides",
    what: "The fat circulating in your blood, mostly from your last few meals.",
    unit: "mg/dL",
    where: LIPIDS,
  },
  {
    id: "total_cholesterol",
    label: "Total cholesterol",
    what: "Every kind of cholesterol added together, good and bad.",
    unit: "mg/dL",
    where: LIPIDS,
    why: "On its own it says little, but it is the number most lab sheets lead with.",
  },
  {
    id: "non_hdl_cholesterol",
    label: "Non-HDL cholesterol",
    abbrev: true,
    aliases: ["non-HDL"],
    what: "Total cholesterol with the good kind taken out: everything that can clog.",
    unit: "mg/dL",
    where: COMPUTED,
    why: "It stands in for ApoB when ApoB was not measured, and needs no extra test.",
  },
  {
    id: "lp_a",
    label: "Lp(a)",
    full: "Lipoprotein(a)",
    abbrev: true,
    what: "An inherited cholesterol particle that is set at birth and barely moves.",
    unit: "nmol/L",
    where: "asked for by name, once in a lifetime",
  },

  /* ── blood sugar and insulin ─────────────────────────────────────────── */
  {
    id: "hba1c",
    label: "HbA1c",
    full: "Glycated haemoglobin",
    abbrev: true,
    what: "Your average blood sugar over about three months, read off your red cells.",
    unit: "%",
    where: BLOOD,
  },
  {
    id: "glucose",
    label: "Fasting glucose",
    what: "Your blood sugar after a night without food.",
    unit: "mg/dL",
    where: BLOOD,
  },
  {
    id: "insulin",
    label: "Fasting insulin",
    what: "How much insulin your body needs at rest to hold that blood sugar down.",
    unit: "µIU/mL",
    where: "asked for by name; not part of a standard panel",
  },
  {
    id: "homa_ir",
    label: "HOMA-IR",
    full: "Homeostatic model assessment of insulin resistance",
    abbrev: true,
    what: "Fasting sugar times fasting insulin: one number for how hard your pancreas is working.",
    where: COMPUTED,
    why: "It catches insulin resistance years before blood sugar itself goes wrong.",
  },

  /* ── liver ───────────────────────────────────────────────────────────── */
  {
    id: "alt",
    label: "ALT",
    full: "Alanine aminotransferase",
    abbrev: true,
    what: "A liver enzyme that leaks into the blood when liver cells are stressed.",
    unit: "U/L",
    where: LIVER,
  },
  {
    id: "ast",
    label: "AST",
    full: "Aspartate aminotransferase",
    abbrev: true,
    what: "A second liver enzyme, also found in muscle, so exercise can raise it.",
    unit: "U/L",
    where: LIVER,
  },
  {
    id: "ggt",
    label: "GGT",
    full: "Gamma-glutamyl transferase",
    abbrev: true,
    what: "A liver enzyme that rises with alcohol and with fatty liver.",
    unit: "U/L",
    where: LIVER,
  },
  {
    id: "alp",
    label: "ALP",
    full: "Alkaline phosphatase",
    abbrev: true,
    aliases: ["Alkaline phosphatase"],
    what: "A liver enzyme that also comes from bone.",
    unit: "U/L",
    where: BLOOD,
    why: "It is one of the nine numbers PhenoAge needs, and it separates a liver problem from a bile-duct one.",
  },
  {
    id: "albumin",
    label: "Albumin",
    what: "The main protein your liver makes and keeps in your blood.",
    unit: "g/dL",
    where: BLOOD,
    why: "It falls when the liver is failing or when you are not absorbing food, and PhenoAge reads it.",
  },

  /* ── kidneys ─────────────────────────────────────────────────────────── */
  {
    id: "creatinine",
    label: "Creatinine",
    what: "A muscle waste product your kidneys clear; it piles up when they slow down.",
    unit: "mg/dL",
    where: BLOOD,
  },
  {
    id: "egfr",
    label: "eGFR",
    full: "Estimated glomerular filtration rate",
    abbrev: true,
    what: "How much blood your kidneys filter per minute, worked out from creatinine and your age.",
    unit: "mL/min/1.73m²",
    where: COMPUTED,
    why: "It is the number kidney disease is actually staged on.",
  },
  {
    id: "cystatin_c",
    label: "Cystatin C",
    abbrev: true,
    what: "A second way to measure kidney filtering that muscle mass does not distort.",
    unit: "mg/L",
    where: "asked for by name",
  },
  {
    id: "uric_acid",
    label: "Uric acid",
    what: "The waste product that crystallises into gout when it gets high.",
    unit: "mg/dL",
    where: BLOOD,
  },

  /* ── thyroid ─────────────────────────────────────────────────────────── */
  {
    id: "tsh",
    label: "TSH",
    full: "Thyroid-stimulating hormone",
    abbrev: true,
    what: "The brain's order to the thyroid: it goes up when the thyroid is falling behind.",
    unit: "mIU/L",
    where: THYROID,
  },
  {
    id: "free_t4",
    label: "Free T4",
    full: "Free thyroxine",
    abbrev: true,
    what: "The thyroid hormone in storage form, the part not bound to protein.",
    unit: "ng/dL",
    where: THYROID,
    why: "It says whether a high TSH has already cost you thyroid hormone.",
  },
  {
    id: "free_t3",
    label: "Free T3",
    full: "Free triiodothyronine",
    abbrev: true,
    what: "The active thyroid hormone your cells actually use.",
    unit: "pg/mL",
    where: THYROID,
    why: "It is the one that drives energy, and it can be low while T4 looks fine.",
  },
  {
    id: "tpo_antibodies",
    label: "TPO antibodies",
    full: "Thyroid peroxidase antibodies",
    abbrev: true,
    aliases: ["TPO"],
    what: "Antibodies your immune system made against your own thyroid.",
    unit: "IU/mL",
    where: "asked for by name, once",
    why: "They are what turns a borderline TSH into Hashimoto's, and they are checked once.",
  },
  {
    id: "anti_thyroglobulin",
    label: "Thyroglobulin antibodies",
    abbrev: true,
    what: "A second antibody against the thyroid, checked when TPO is negative but the picture is not.",
    unit: "IU/mL",
    where: "asked for by name",
    why: "It catches the Hashimoto's that TPO antibodies alone miss.",
  },

  /* ── sex hormones ────────────────────────────────────────────────────── */
  {
    id: "testosterone",
    label: "Testosterone",
    what: "The main male sex hormone; women make it too, in smaller amounts.",
    unit: "ng/dL",
    where: "on a morning blood draw",
  },
  {
    id: "estradiol",
    label: "Estradiol",
    abbrev: true,
    what: "The main form of oestrogen in people who are still cycling.",
    unit: "pg/mL",
    where: "on a hormone panel",
  },
  {
    id: "fsh",
    label: "FSH",
    full: "Follicle-stimulating hormone",
    abbrev: true,
    what: "The brain's order to the ovaries or testes; it climbs as they wind down.",
    unit: "IU/L",
    where: "on a hormone panel",
  },
  {
    id: "lh",
    label: "LH",
    full: "Luteinising hormone",
    abbrev: true,
    what: "The second brain hormone aimed at the ovaries or testes; it triggers ovulation.",
    unit: "IU/L",
    where: "on a hormone panel",
  },
  {
    id: "psa_total",
    label: "PSA",
    full: "Prostate-specific antigen",
    abbrev: true,
    what: "A protein made by the prostate; a rising level can mean cancer, or just a big prostate.",
    unit: "ng/mL",
    where: "asked for by name",
  },
  {
    id: "amh",
    label: "AMH",
    full: "Anti-Müllerian hormone",
    abbrev: true,
    what: "A measure of how many eggs the ovaries still hold.",
    unit: "ng/mL",
    where: "asked for by name",
    why: "It is the best single read on ovarian reserve, and it is high in PCOS.",
  },
  {
    id: "shbg",
    label: "SHBG",
    full: "Sex hormone-binding globulin",
    abbrev: true,
    what: "The protein that carries sex hormones around and keeps them inactive.",
    unit: "nmol/L",
    where: "on a hormone panel",
    why: "It decides how much of your testosterone is actually free to work, and it falls with insulin resistance.",
  },

  /* ── stress, inflammation ────────────────────────────────────────────── */
  {
    id: "cortisol",
    label: "Cortisol",
    what: "The stress hormone; it peaks shortly after you wake and falls all day.",
    unit: "µg/dL",
    where: "on a morning blood draw",
    why: "The time of the draw matters more than the number, which is why it is read as a pattern.",
  },
  {
    id: "hs_crp",
    label: "hs-CRP",
    full: "High-sensitivity C-reactive protein",
    abbrev: true,
    what: "A sensitive measure of low-grade inflammation anywhere in the body.",
    unit: "mg/L",
    where: "asked for by name; the plain CRP test is not sensitive enough",
  },
  {
    id: "crp",
    label: "CRP",
    full: "C-reactive protein",
    abbrev: true,
    what: "The same inflammation protein, measured on a coarser scale for infections.",
    unit: "mg/L",
    where: BLOOD,
    why: "It answers 'is something acutely inflamed', not 'is there a slow burn'.",
  },

  /* ── blood count ─────────────────────────────────────────────────────── */
  {
    id: "hemoglobin",
    label: "Haemoglobin",
    what: "The protein in red cells that carries oxygen.",
    unit: "g/dL",
    where: CBC,
  },
  {
    id: "rbc",
    label: "RBC",
    full: "Red cell count",
    abbrev: true,
    aliases: ["Red cell count"],
    what: "How many red blood cells you have per unit of blood.",
    unit: "M/µL",
    where: CBC,
    why: "It separates 'few cells' anaemia from 'small cells' anaemia when read with MCV.",
  },
  {
    id: "wbc",
    label: "White cell count",
    abbrev: true,
    aliases: ["WBC"],
    what: "How many immune cells are circulating.",
    unit: "K/µL",
    where: CBC,
    why: "It goes up with infection and down when the marrow is struggling.",
  },
  {
    id: "platelets",
    label: "Platelets",
    what: "The cell fragments that make blood clot.",
    unit: "K/µL",
    where: CBC,
  },
  {
    id: "mcv",
    label: "MCV",
    full: "Mean corpuscular volume",
    abbrev: true,
    what: "The average size of your red blood cells.",
    unit: "fL",
    where: CBC,
    why: "Small cells point at iron, large cells at B12 or folate or alcohol.",
  },
  {
    id: "rdw",
    label: "RDW",
    full: "Red cell distribution width",
    abbrev: true,
    what: "How much your red cells vary in size from one another.",
    unit: "%",
    where: CBC,
    why: "A wide spread is one of the strongest single predictors of dying early, and PhenoAge reads it.",
  },

  /* ── iron ────────────────────────────────────────────────────────────── */
  {
    id: "ferritin",
    label: "Ferritin",
    what: "Your iron store, as opposed to the iron in use right now.",
    unit: "ng/mL",
    where: BLOOD,
  },
  {
    id: "transferrin_saturation",
    label: "Iron saturation",
    abbrev: true,
    aliases: ["transferrin saturation"],
    what: "What share of your iron-carrying protein is actually carrying iron.",
    unit: "%",
    where: "on an iron panel",
    why: "It is the number that separates iron overload from a high ferritin caused by inflammation.",
  },

  /* ── vitamins ────────────────────────────────────────────────────────── */
  {
    id: "vitamin_d",
    label: "Vitamin D",
    abbrev: true,
    aliases: ["25-OH vitamin D"],
    what: "The hormone your skin makes from sunlight, measured as its storage form.",
    unit: "ng/mL",
    where: "asked for by name",
  },
  {
    id: "vitamin_b12",
    label: "Vitamin B12",
    abbrev: true,
    aliases: ["B12"],
    what: "The vitamin nerves and red cells need, found only in animal food.",
    unit: "pg/mL",
    where: BLOOD,
  },
  {
    id: "folic_acid",
    label: "Folate",
    aliases: ["folic acid"],
    what: "The B vitamin that works alongside B12 to build red cells and DNA.",
    unit: "ng/mL",
    where: BLOOD,
  },
  {
    id: "homocysteine",
    label: "Homocysteine",
    what: "An amino acid that piles up when B12, folate or B6 run short.",
    unit: "µmol/L",
    where: "asked for by name",
  },

  /* ── lifestyle ───────────────────────────────────────────────────────── */
  {
    id: "sleep_duration",
    label: "Sleep duration",
    what: "How long you actually slept, not how long you were in bed.",
    unit: "h",
    where: "from your watch or phone",
    why: "Short sleep moves blood sugar, blood pressure and appetite within a week.",
  },
  {
    id: "bp_systolic",
    label: "Systolic blood pressure",
    abbrev: true,
    what: "The top number: the push against your artery walls as the heart beats.",
    unit: "mmHg",
    where: "from a home cuff, sitting, twice",
    why: "It is the single biggest driver of stroke risk, and it is free to measure at home.",
  },
  {
    id: "bp_diastolic",
    label: "Diastolic blood pressure",
    abbrev: true,
    what: "The bottom number: the pressure left between beats.",
    unit: "mmHg",
    where: "from a home cuff, sitting, twice",
    why: "It matters most before about 50, when a high bottom number comes first.",
  },
  {
    id: "bmi",
    label: "BMI",
    full: "Body mass index",
    abbrev: true,
    what: "Weight divided by height squared: a rough shorthand for body size.",
    unit: "kg/m²",
    where: COMPUTED,
    why: "It is crude — waist tells you more — but every published risk score still uses it.",
  },

  /* ── the engine's own words ──────────────────────────────────────────── */
  {
    id: "phenoage",
    label: "PhenoAge",
    abbrev: true,
    what: "A biological age worked out from nine routine blood numbers plus your real age.",
    unit: "years",
    where: COMPUTED,
    why: "It says whether your body is ageing faster or slower than the calendar.",
  },
  {
    id: "likelihood_ratio",
    label: "LR",
    full: "Likelihood ratio",
    abbrev: true,
    aliases: ["likelihood ratio"],
    what: "How much one finding multiplies the odds of a conclusion: above 1 raises it, below 1 lowers it.",
    where: "on every line of evidence this app prints",
    why: "It is the one number that says how much a single result should change your mind.",
  },
  {
    id: "grade",
    label: "grade",
    aliases: ["grade A", "grade B", "grade C", "grade D", "grade E"],
    what: "How good the evidence behind a line is, from A (large trials agree) down to E (one small study or an anecdote).",
    where: "next to every conclusion and every action",
    why: "A grade E line is printed so you can judge it, never so you can act on it.",
  },
  {
    id: "risk_state",
    label: "risk state",
    what: "A standing worth acting on that is not a diagnosis: raised, overdue, low.",
    where: "on the cards marked RISK",
    why: "Screening being overdue is a fact about your calendar, not a disease you have.",
  },
];

/** The glossary, with every missing `why` borrowed from `lib/vectors.ts`. */
export const GLOSSARY: GlossaryEntry[] = DRAFTS.map((d) => ({
  ...d,
  why: d.why ?? VECTOR_WHY.get(d.id) ?? "",
}));

const BY_ID = new Map(GLOSSARY.map((e) => [e.id, e]));

/** label or alias, lower-cased → the entry. Longest label wins a tie. */
const BY_LABEL = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY)
  for (const name of [e.label, e.full ?? "", ...(e.aliases ?? [])])
    if (name && !BY_LABEL.has(name.toLowerCase()))
      BY_LABEL.set(name.toLowerCase(), e);

/** By metric code first, then by anything a page prints for it. */
export function termFor(key: string): GlossaryEntry | undefined {
  return BY_ID.get(key) ?? BY_LABEL.get(key.trim().toLowerCase());
}

/**
 * The names worth marking up inside a sentence: the shorthand only.
 *
 * "Triglycerides" needs no dotted underline; "ApoB" does. Longest first, so
 * "non-HDL cholesterol" is matched before "HDL".
 */
const MARKED: [string, GlossaryEntry][] = GLOSSARY.filter((e) => e.abbrev)
  .flatMap((e): [string, GlossaryEntry][] =>
    [
      e.label,
      ...(e.aliases ?? []),
      // The engine prints its own key in a few sentences the pages carry
      // whole ("On track: hba1c expected 5.26 % by 2026-11-23"), so the
      // lower-case code is a name too. Matching is case-sensitive, so this
      // never collides with the label above it.
      ...(/^[a-z0-9]{2,6}$/.test(e.id) ? [e.id] : []),
    ].map((name) => [name, e]),
  )
  .sort((a, b) => b[0].length - a[0].length);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `(?<![A-Za-z0-9])…(?![A-Za-z0-9-])`, not `\b`: "Lp(a)" ends in a bracket and
 * "ALT" must not match inside "ALTERNATIVE" or "hs-CRP".
 */
const MARK_RE = new RegExp(
  `(?<![A-Za-z0-9-])(${MARKED.map(([n]) => escape(n)).join("|")})(?![A-Za-z0-9-])`,
  "g",
);

const MARK_BY_LOWER = new Map(MARKED.map(([n, e]) => [n.toLowerCase(), e]));

export type Piece = string | { text: string; entry: GlossaryEntry };

/**
 * One sentence, split into the plain runs and the terms worth explaining.
 *
 * `explainInput` and the catalog hand the pages whole sentences, so the only
 * way every abbreviation gets a tooltip is to scan the sentence. Pure, so the
 * test can assert on the pieces without rendering anything.
 */
export function splitTerms(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(MARK_RE)) {
    const entry = MARK_BY_LOWER.get(m[1]!.toLowerCase());
    if (!entry) continue;
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ text: m[1]!, entry });
    at = m.index + m[1]!.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
