/**
 * Unit hygiene for readings. Two jobs:
 *
 *  - `normalizeUnit` folds the spelling noise real labs emit (`UI/l`, `μg/dL`,
 *    `FI`, `x10^3/uL`, a stray leading `/ `) onto one canonical string, so the
 *    curator can tell "same unit, typed differently" from "different unit".
 *  - `convert` knows the small set of factors that actually show up in this
 *    data set. Anything it does not know returns null and becomes a question
 *    for the user instead of a silent guess.
 */

/** Whole-string equivalences that survive the cleanup below. */
const ALIASES: Record<string, string> = {
  // international units per litre: labs write U/L, UI/L, IU/L and U/I
  "ui/l": "u/l",
  "iu/l": "u/l",
  "u/i": "u/l",
  "ui/i": "u/l",
  "iu/i": "u/l",
  "u/ml": "u/ml",
  "ui/ml": "u/ml",
  "iu/ml": "u/ml",
  // micro-international units: μUI/mL and uUI/mL are uIU/mL
  "uui/ml": "uiu/ml",
  "uui/l": "uiu/l",
  "miu/l": "uiu/ml",
  // femtolitres: "FI" is an OCR'd "fL"
  fi: "fl",
  // cells per cubic millimetre
  mmc: "/mm3",
  "/mmc": "/mm3",
  mm3: "/mm3",
  "cel/ul": "/ul",
  "cells/ul": "/ul",
  "celule/ul": "/ul",
  // grams
  "gr/dl": "g/dl",
  "g%": "g/dl",
  // micro spellings
  "mcg/dl": "ug/dl",
  "mcg/l": "ug/l",
  "mcg/ml": "ug/ml",
  "mcmol/l": "umol/l",
  // percent
  "%": "%",
  procent: "%",
  // Counts: "K/uL" and "M/uL" are the catalog spellings of the same two units
  // the labs also print as 10^3/uL and 10^6/uL.
  "k/ul": "10^3/ul",
  "m/ul": "10^6/ul",
  // ESR, one hour, spelled six ways.
  "mm/h": "mm/hr",
  "mm/1h": "mm/hr",
  mmla1h: "mm/hr",
  // Cell volume: "μm 3" and "um^3" are femtolitres.
  um3: "fl",
  "um^3": "fl",
  // Mean corpuscular haemoglobin is picograms per cell.
  "pg/cell": "pg",
};

/** Lowercase, de-noise, fold Unicode. `"/ UI/l"` and `"U/I"` both give `u/l`. */
export function normalizeUnit(u: string | null | undefined): string {
  if (!u) return "";
  const s = String(u)
    // labs print the range column as "/ mg/dl"; the slash is layout, not a unit
    .replace(/^\s*\/\s+/, "")
    .toLowerCase()
    .replace(/[μµ]/g, "u")
    .replace(/10³/g, "10^3")
    .replace(/10⁶/g, "10^6")
    .replace(/³/g, "3")
    .replace(/⁶/g, "6")
    .replace(/\*\*/g, "^")
    .replace(/\s+/g, "")
    .replace(/^x(?=\d)/, "")
    .replace(/x10\^/g, "10^")
    .replace(/10e(\d)/g, "10^$1");
  return ALIASES[s] ?? s;
}

interface Rule {
  from: string;
  to: string;
  factor: number;
  /** Molar conversions depend on the analyte's molecular weight. */
  metrics?: string[];
}

/** Every factor is written `from -> to`; the reverse is applied as 1/factor. */
const RULES: Rule[] = [
  // counts: cells/mm3 is cells/uL
  { from: "/mm3", to: "10^3/ul", factor: 1e-3 },
  { from: "/mm3", to: "10^6/ul", factor: 1e-6 },
  { from: "/mm3", to: "/ul", factor: 1 },
  { from: "10^9/l", to: "10^3/ul", factor: 1 },
  { from: "10^12/l", to: "10^6/ul", factor: 1 },
  { from: "10^3/ul", to: "10^6/ul", factor: 1e-3 },
  // mass concentration
  { from: "mg/l", to: "mg/dl", factor: 0.1 },
  { from: "ug/l", to: "ug/dl", factor: 0.1 },
  { from: "g/l", to: "g/dl", factor: 0.1 },
  { from: "mg/dl", to: "g/dl", factor: 0.01 },
  {
    from: "g/l",
    to: "mg/dl",
    factor: 100,
    metrics: ["apolipoprotein_b", "apolipoprotein_a1", "lp_a"],
  },
  // WHO 3rd IS: 1 ng/mL of prolactin is 21.2 mIU/L.
  { from: "uiu/ml", to: "ng/ml", factor: 1 / 21.2, metrics: ["prolactin"] },
  { from: "ug/l", to: "ng/ml", factor: 1 },
  { from: "ng/ml", to: "ug/dl", factor: 0.1 },
  { from: "ng/ml", to: "ng/dl", factor: 100 },
  { from: "ng/dl", to: "ug/dl", factor: 1e-3 },
  { from: "pg/ml", to: "ng/l", factor: 1 },
  { from: "pg/ml", to: "ng/dl", factor: 0.1 },
  // molar -> mass, per analyte
  { from: "mmol/l", to: "mg/dl", factor: 18, metrics: ["glucose"] },
  {
    from: "mmol/l",
    to: "mg/dl",
    factor: 38.67,
    metrics: [
      "total_cholesterol",
      "hdl_cholesterol",
      "ldl_cholesterol",
      "non_hdl_cholesterol",
      "vldl_cholesterol",
    ],
  },
  { from: "mmol/l", to: "mg/dl", factor: 88.57, metrics: ["triglycerides"] },
  { from: "mmol/l", to: "mg/dl", factor: 6.006, metrics: ["urea"] },
  {
    from: "mmol/l",
    to: "meq/l",
    factor: 1,
    metrics: ["sodium", "potassium", "chloride"],
  },
  { from: "umol/l", to: "mg/dl", factor: 0.0113, metrics: ["creatinine"] },
  {
    from: "umol/l",
    to: "mg/dl",
    factor: 0.0585,
    metrics: ["total_bilirubin", "direct_bilirubin", "indirect_bilirubin"],
  },
  { from: "umol/l", to: "mg/dl", factor: 0.0168, metrics: ["uric_acid"] },
  { from: "umol/l", to: "ug/dl", factor: 5.587, metrics: ["iron"] },
  { from: "nmol/l", to: "ng/ml", factor: 0.4, metrics: ["vitamin_d"] },
  { from: "nmol/l", to: "ng/ml", factor: 0.288, metrics: ["testosterone"] },
  // cortisol MW 362.5: 1 nmol/L = 0.3625 ng/mL = 0.03625 ug/dL
  { from: "nmol/l", to: "ng/ml", factor: 0.3625, metrics: ["cortisol"] },
  { from: "nmol/l", to: "ug/dl", factor: 0.03625, metrics: ["cortisol"] },
  { from: "nmol/l", to: "ng/dl", factor: 28.8, metrics: ["testosterone"] },
  { from: "pmol/l", to: "pg/ml", factor: 0.777, metrics: ["free_t4"] },
  { from: "pmol/l", to: "pg/ml", factor: 0.651, metrics: ["free_t3"] },
  { from: "pmol/l", to: "ng/dl", factor: 0.0777, metrics: ["free_t4"] },
];

/** The multiplier that takes a value from `from` into `to`, or null. */
export function conversionFactor(
  from: string | null | undefined,
  to: string | null | undefined,
  metricCode?: string,
): number | null {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);
  if (!f || !t) return null;
  if (f === t) return 1;
  for (const r of RULES) {
    if (r.metrics && (!metricCode || !r.metrics.includes(metricCode))) continue;
    if (r.from === f && r.to === t) return r.factor;
    if (r.to === f && r.from === t) return 1 / r.factor;
  }
  return null;
}

/** Six significant digits is well past lab precision and kills float dust. */
export const round = (n: number) => Number(n.toPrecision(6));

export function convert(
  value: number | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
  metricCode?: string,
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const factor = conversionFactor(from, to, metricCode);
  return factor == null ? null : round(value * factor);
}
