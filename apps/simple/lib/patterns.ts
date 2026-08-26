/**
 * Patterns are where the nuance lives. A pattern is a detector over
 * `ModelInput` plus the effects it has: which system jumps the queue, which
 * edges change confidence, which targets are suspended, what to escalate and
 * what to ask.
 *
 * The detectors are pure, so every one of them is unit-tested against a
 * matching and a non-matching person. The escalations reuse the `Rule` shape
 * from `vectors.ts`, so `postProcess` guarantees a test action for each of
 * them exactly the way it does for the fired rules.
 */
import type { ModelInput } from "./coverage";
import type { Evidence, GraphEdge, SystemId } from "./graph";
import { statusOf } from "./status";
import type { Rule } from "./vectors";

export interface PatternQuestion {
  key: string;
  text: string;
  options?: string[];
}

export interface DetectorResult {
  matched: boolean;
  stage?: string;
  reasons: string[];
  /** Asked when the detector needs a fact it does not have. */
  pendingQuestions?: PatternQuestion[];
}

export interface Pattern {
  id: string;
  name: string;
  summary: string;
  controversy: string;
  management: string;
  detector: (m: ModelInput) => DetectorResult;
  effects: {
    systemPriority?: Partial<Record<SystemId, 1 | 2 | 3>>;
    edgeOverrides?: {
      edgeId: string;
      confidence?: GraphEdge["confidence"];
      note: string;
    }[];
    targets?: Record<
      string,
      { optimal?: [number, number]; suspendGoal?: boolean; note: string }
    >;
    /** `when` may just return true: the pattern already matched. */
    escalations: Rule[];
    questions: PatternQuestion[];
  };
  evidence: Evidence[];
}

export interface PatternMatch {
  pattern: Pattern;
  matched: boolean;
  stage?: string;
  reasons: string[];
  pendingQuestions?: PatternQuestion[];
}

const val = (m: ModelInput, code: string): number | null =>
  m.latest[code]?.value ?? null;

const fact = (m: ModelInput, key: string): string => {
  const v = m.profile[key];
  if (v == null) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
};

/** Rules that pattern escalations use: the pattern matched, so `when` is true. */
const esc = (
  id: string,
  suggest: string,
  why: string,
  tier: 1 | 2 | 3,
  ref: string,
): Rule => ({
  id,
  when: () => true,
  suggest,
  why,
  tier,
  basis: "science",
  ref,
});

/** Above the lab's upper limit, or above `fallback` when the lab printed none. */
function aboveLimit(
  m: ModelInput,
  code: string,
  fallback: number,
): { over: boolean; reason: string } {
  const row = m.latest[code];
  if (row?.value == null) return { over: false, reason: "" };
  const limit = row.refHigh ?? fallback;
  return {
    over: row.value > limit,
    reason: `${code} ${row.value}${row.unit ? ` ${row.unit}` : ""} above ${limit}`,
  };
}

const HASHIMOTO: Pattern = {
  id: "hashimoto",
  name: "Autoimmune thyroiditis (Hashimoto's)",
  summary:
    "The immune system is attacking the thyroid. TSH climbs slowly over years; antibodies show it before TSH does.",
  controversy:
    "Whether to treat subclinical hypothyroidism (TSH 4.5–10, normal fT4) is debated; most guidelines say treat if TSH > 10, symptomatic, pregnant or planning pregnancy, or antibody-positive with rising TSH.",
  management:
    "Track TSH, fT4 and antibodies every 6 months. Keep ferritin above 50 and vitamin D 40–60. Stop iodine supplements. Selenium 200 µg/day is a reasonable 6-month trial with antibodies as the outcome. Treat with levothyroxine when TSH passes 10, or earlier if symptomatic, antibody-positive with rising TSH, or planning pregnancy. If treated: dose 30–60 min before coffee and 4 h away from iron and calcium. Symptoms and antibodies are the outcomes to watch, not TSH alone.",
  detector: (m) => {
    const tpo = aboveLimit(m, "tpo_antibodies", 34);
    // ponytail: the metrics table calls thyroglobulin antibodies
    // `anti_thyroglobulin`; the spec calls them `tg_antibodies`. Accept both.
    const tg = aboveLimit(m, "tg_antibodies", 115);
    const tg2 = aboveLimit(m, "anti_thyroglobulin", 115);
    const positive = [tpo, tg, tg2].filter((r) => r.over);
    if (!positive.length) return { matched: false, reasons: [] };

    const reasons = positive.map((r) => r.reason);
    const tsh = m.latest.tsh;
    const value = tsh?.value ?? null;
    const rising = value != null && tsh?.prev != null && value > tsh.prev;

    let stage = "antibodies only";
    if (value != null && value > 4.5) {
      stage = "confirmed";
      reasons.push(`tsh ${value} above 4.5`);
    } else if (value != null && value >= 2.5) {
      stage = "early";
      reasons.push(
        `tsh ${value} above optimal 2.5${rising ? `, up from ${tsh!.prev}` : ""}`,
      );
    } else if (rising) {
      stage = "early";
      reasons.push(`tsh ${value} rising from ${tsh!.prev}`);
    }
    return { matched: true, stage, reasons };
  },
  effects: {
    systemPriority: { thyroid: 1 },
    targets: {
      ferritin: {
        optimal: [50, 200],
        note: "Hashimoto's: ferritin under 50 blunts hormone synthesis, so the floor moves up.",
      },
      vitamin_d: {
        optimal: [40, 60],
        note: "Hashimoto's: hold vitamin D at 40–60 ng/mL rather than merely above the deficiency line.",
      },
    },
    escalations: [
      esc(
        "hashimoto_full_panel",
        "Free T4, free T3, anti-Tg antibodies with the next TSH",
        "TSH alone misses early failure; anti-Tg catches the 10 % who are TPO-negative.",
        1,
        "ATA 2014 hypothyroidism guideline",
      ),
      esc(
        "hashimoto_ultrasound",
        "Thyroid ultrasound once",
        "Confirms the diagnosis and baselines nodules; Hashimoto's raises nodule frequency.",
        2,
        "ATA 2014 hypothyroidism guideline",
      ),
      esc(
        "hashimoto_coeliac",
        "Coeliac serology (tTG-IgA with total IgA)",
        "Coeliac disease is 4–5× more common with Hashimoto's and changes the diet advice from speculative to required.",
        2,
        "BSG coeliac disease guideline",
      ),
      esc(
        "hashimoto_b12_ferritin",
        "B12 and ferritin every 12 months",
        "Pernicious anaemia and iron deficiency cluster with thyroid autoimmunity.",
        1,
        "BSG iron deficiency guideline",
      ),
      esc(
        "hashimoto_repeat_tsh",
        "Repeat TSH every 6 months while antibody-positive and untreated",
        "Progression to overt hypothyroidism runs 2–5 % per year; catch it early.",
        1,
        "Rodondi 2010 JAMA",
      ),
      esc(
        "hashimoto_pregnancy",
        "If pregnant or planning: TSH target below 2.5 and an endocrinology visit now",
        "TPO-positive women have higher miscarriage and preterm risk; ATA 2017 recommends treatment thresholds change in pregnancy.",
        3,
        "ATA 2017 thyroid in pregnancy guideline",
      ),
    ],
    questions: [
      {
        key: "thyroid_symptoms",
        text: "Any fatigue, cold intolerance, hair loss, constipation, weight gain or brain fog in the last 3 months?",
      },
      {
        key: "autoimmune_family",
        text: "Anyone in the family with thyroid disease, coeliac disease, type 1 diabetes or vitiligo?",
      },
      {
        key: "iodine_intake",
        text: "Are you taking iodine, kelp, or a multivitamin with iodine?",
        options: ["No", "Yes", "Not sure"],
      },
      {
        key: "pregnancy_plans",
        text: "Planning a pregnancy in the next 12 months?",
        options: ["No", "Yes", "Maybe"],
      },
      {
        key: "cycle_regularity",
        text: "Cycle regularity and last period date (thyroid changes shift cycles).",
      },
    ],
  },
  evidence: [
    {
      kind: "guideline",
      title: "ATA 2014 hypothyroidism guideline",
      year: 2014,
    },
    { kind: "meta", title: "Rodondi 2010 JAMA", year: 2010 },
    {
      kind: "meta",
      title: "Wichman 2016 Thyroid",
      year: 2016,
      doi: "10.1089/thy.2016.0256",
    },
  ],
};

const DIET_KEYS = ["diet", "dietary_habits"];
const DIET_QUESTION: PatternQuestion = {
  key: "diet",
  text: "What does a typical day of eating look like? Low-carb, keto, Mediterranean, mixed?",
};

/** BMI from a measured value, from height and weight, or waist over height. */
function lean(m: ModelInput): { lean: boolean; reason: string } {
  const heightCm = Number(fact(m, "height_cm").match(/\d+(\.\d+)?/)?.[0]);
  const bmi =
    val(m, "bmi") ??
    (Number.isFinite(heightCm) && val(m, "weight") != null
      ? val(m, "weight")! / (heightCm / 100) ** 2
      : null);
  if (bmi != null && bmi < 25)
    return { lean: true, reason: `bmi ${Math.round(bmi * 10) / 10} under 25` };

  const waist = Number(fact(m, "waist_cm").match(/\d+(\.\d+)?/)?.[0]);
  if (
    Number.isFinite(waist) &&
    Number.isFinite(heightCm) &&
    waist / heightCm < 0.5
  )
    return {
      lean: true,
      reason: `waist ${waist} cm over height ${heightCm} cm is ${Math.round((waist / heightCm) * 100) / 100}`,
    };
  return { lean: false, reason: "" };
}

const LMHR: Pattern = {
  id: "lmhr",
  name: "Lean-mass hyper-responder",
  summary:
    "Very high LDL that appears when a lean person eats very low carb. HDL and triglycerides are excellent. The LDL is real; the question is whether it carries the usual risk.",
  controversy:
    "Lipid-energy model (Norwitz 2022) argues the LDL rise is metabolic, not pathological. KETO-CTA (2025) followed 100 LMHRs for a year and found plaque progression in many, with baseline plaque, not ApoB, predicting progression. Guideline bodies treat ApoB as causal regardless of phenotype.",
  management:
    "Measure before arguing: ApoB, Lp(a), CAC. Zero CAC and normal Lp(a): the person can stay low-carb with imaging every 2–3 years, knowing the evidence is unsettled. Any CAC, or Lp(a) above 50, or family history: treat ApoB like anyone else, and the cheapest lever is adding carbohydrate back.",
  detector: (m) => {
    const ldl = val(m, "ldl_cholesterol");
    const hdl = val(m, "hdl_cholesterol");
    const tg = val(m, "triglycerides");
    const triad =
      ldl != null &&
      ldl >= 200 &&
      hdl != null &&
      hdl >= 80 &&
      tg != null &&
      tg <= 70;
    if (!triad) return { matched: false, reasons: [] };

    const reasons = [
      `ldl_cholesterol ${ldl} at or above 200`,
      `hdl_cholesterol ${hdl} at or above 80`,
      `triglycerides ${tg} at or below 70`,
    ];
    const diet = DIET_KEYS.map((k) => fact(m, k)).join(" ");
    if (!diet.trim())
      return { matched: false, reasons, pendingQuestions: [DIET_QUESTION] };
    if (!/low.?carb|keto|carnivore/i.test(diet))
      return { matched: false, reasons };

    const body = lean(m);
    if (!body.lean) return { matched: false, reasons };
    return {
      matched: true,
      reasons: [...reasons, body.reason, `diet: ${diet.trim()}`],
    };
  },
  effects: {
    systemPriority: { lipids: 1 },
    edgeOverrides: [
      {
        edgeId: "ldl_cholesterol->ascvd",
        confidence: "probable",
        note: "contested in this phenotype; ApoB and imaging decide",
      },
    ],
    targets: {
      ldl_cholesterol: {
        suspendGoal: true,
        note: "Judge by CAC and ApoB, not LDL alone",
      },
      apolipoprotein_b: {
        optimal: [0, 80],
        note: "guideline target still applies",
      },
    },
    escalations: [
      esc(
        "lmhr_apob_lpa",
        "ApoB and Lp(a) now",
        "ApoB counts particles; Lp(a) is inherited and changes the risk story entirely.",
        1,
        "EAS 2022 consensus on Lp(a)",
      ),
      esc(
        "lmhr_cac",
        "CAC score now, and if zero, CCTA in 2–3 years",
        "KETO-CTA: existing plaque, not lipid level, predicted progression. Zero CAC is reassuring; any CAC ends the debate.",
        2,
        "KETO-CTA 2025",
      ),
      esc(
        "lmhr_carb_trial",
        "Trial: add 50–100 g/day carbohydrate for 6 weeks, retest lipids",
        "In LMHR the LDL usually falls fast with modest carbs; if it does, the phenotype is confirmed and the person can choose.",
        1,
        "Norwitz 2022 Metabolites (lipid energy model)",
      ),
    ],
    questions: [
      {
        key: "low_carb_duration",
        text: "How long on low-carb, and grams of carbohydrate per day?",
      },
      {
        key: "family_early_heart_disease",
        text: "Any family history of early heart disease?",
      },
      { key: "body_composition", text: "Body fat or waist measurement?" },
    ],
  },
  evidence: [
    {
      kind: "observational",
      title: "Norwitz 2022 Metabolites (lipid energy model)",
      year: 2022,
    },
    { kind: "observational", title: "KETO-CTA 2025", year: 2025 },
    {
      kind: "guideline",
      title: "Ference 2017 Eur Heart J (EAS consensus)",
      year: 2017,
    },
  ],
};

const INSULIN_RESISTANCE: Pattern = {
  id: "insulin_resistance_early",
  name: "Insulin resistance before HbA1c moves",
  summary:
    "The pancreas is compensating: insulin is already high while HbA1c still reads normal. This is the decade where the trajectory is easiest to change.",
  controversy:
    "Fasting insulin has no agreed cut-off and is not in most guidelines; the ADA screens on HbA1c and glucose, which move years later.",
  management:
    "Confirm with a 2-hour OGTT that measures insulin, not just glucose. Then the levers in order: resistance training twice a week, protein and fibre at the start of meals, a walk after the largest meal, and enough sleep. Retest fasting insulin and TG/HDL in 12 weeks, not HbA1c.",
  detector: (m) => {
    const hba1c = val(m, "hba1c");
    if (hba1c == null || hba1c >= 5.7) return { matched: false, reasons: [] };
    const insulin = val(m, "insulin");
    const homa = m.derived.homaIr ?? null;
    const tgHdl = m.derived.tgHdl ?? null;

    const reasons: string[] = [];
    if (insulin != null && insulin > 10)
      reasons.push(`insulin ${insulin} above 10`);
    if (homa != null && homa > 2) reasons.push(`HOMA-IR ${homa} above 2`);
    if (tgHdl != null && tgHdl > 2)
      reasons.push(`triglyceride/HDL ${tgHdl} above 2`);
    if (!reasons.length) return { matched: false, reasons: [] };
    return {
      matched: true,
      reasons: [`hba1c ${hba1c} still under 5.7`, ...reasons],
    };
  },
  effects: {
    systemPriority: { metabolic: 1 },
    escalations: [
      esc(
        "ir_ogtt",
        "2-hour OGTT with insulin, not glucose alone",
        "The compensation shows on an OGTT with insulin years before HbA1c or fasting glucose move.",
        1,
        "ADA Standards of Care",
      ),
    ],
    questions: [
      {
        key: "waist_cm",
        text: "What is your waist, in centimetres, measured at the navel?",
      },
      {
        key: "family_t2d",
        text: "Type 2 diabetes in a parent or sibling? Say who and at what age.",
      },
    ],
  },
  evidence: [
    { kind: "guideline", title: "ADA Standards of Care" },
    {
      kind: "observational",
      title: "DeFronzo 2009 Diabetes (insulin resistance)",
      year: 2009,
    },
  ],
};

const IRON_DEFICIENCY: Pattern = {
  id: "iron_deficiency_no_anemia",
  name: "Iron deficiency without anaemia",
  summary:
    "The iron stores are empty but the blood count still looks fine. Fatigue, hair loss and breathlessness arrive at this stage, long before haemoglobin drops.",
  controversy:
    "Labs call ferritin normal from 15, and many doctors will not treat a normal blood count. Fatigue improves in trials at ferritin thresholds nearer 30 to 50.",
  management:
    "Find the cause before topping it up: periods, gut losses, coeliac disease. Then iron 60–100 mg elemental on alternate days with vitamin C, away from coffee, tea and calcium, and retest ferritin at three months. Stop once ferritin passes 50.",
  detector: (m) => {
    const ferritin = val(m, "ferritin");
    if (ferritin == null || ferritin >= 30)
      return { matched: false, reasons: [] };
    const hb = m.latest.hemoglobin;
    if (hb?.value == null) return { matched: false, reasons: [] };
    const inRange =
      (hb.refLow == null || hb.value >= hb.refLow) &&
      (hb.refHigh == null || hb.value <= hb.refHigh);
    if (!inRange) return { matched: false, reasons: [] };
    return {
      matched: true,
      reasons: [
        `ferritin ${ferritin} under 30`,
        `hemoglobin ${hb.value} inside the lab range ${hb.refLow ?? "-"}..${hb.refHigh ?? "-"}`,
      ],
    };
  },
  effects: {
    edgeOverrides: [
      {
        edgeId: "iron->ferritin",
        note: "Only while ferritin is below 50; stop and retest at three months.",
      },
    ],
    escalations: [
      esc(
        "iron_saturation",
        "Iron saturation and TIBC with the next ferritin",
        "Saturation separates empty stores from inflammation hiding them, and it responds first when iron is working.",
        1,
        "BSG iron deficiency guideline",
      ),
      esc(
        "iron_coeliac",
        "Coeliac serology (tTG-IgA with total IgA)",
        "Coeliac disease is the commonest silent cause of iron loss in an otherwise healthy adult.",
        2,
        "BSG iron deficiency guideline",
      ),
    ],
    questions: [
      {
        key: "menstrual_heaviness",
        text: "How heavy are your periods: how many days, and do you flood or pass clots?",
        options: ["Light", "Moderate", "Heavy", "Not applicable"],
      },
      {
        key: "gut_symptoms",
        text: "Any blood in the stool, black stools, or regular ibuprofen or aspirin?",
        options: ["No", "Yes"],
      },
    ],
  },
  evidence: [
    { kind: "guideline", title: "BSG iron deficiency guideline" },
    { kind: "rct", title: "Stoffel 2017 Lancet Haematol", year: 2017 },
  ],
};

export const PATTERNS: Pattern[] = [
  HASHIMOTO,
  LMHR,
  INSULIN_RESISTANCE,
  IRON_DEFICIENCY,
];

/**
 * Every pattern that matched, plus any that only needs one more fact to
 * decide (`matched: false` with `pendingQuestions`). Callers that want the
 * matched ones filter on `matched`.
 */
export function matchPatterns(m: ModelInput): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (const pattern of PATTERNS) {
    let result: DetectorResult;
    try {
      result = pattern.detector(m);
    } catch {
      continue;
    }
    if (result.matched || result.pendingQuestions?.length)
      out.push({ pattern, ...result });
  }
  return out;
}

/**
 * Targets a matched pattern overrides, written onto the model input before the
 * prompt is built, so the ranges the model sees already reflect the pattern.
 * Mutates `input.latest` in place; the lab's own reference range never moves.
 */
export function applyPatternTargets(
  input: ModelInput,
  matches: PatternMatch[] = matchPatterns(input),
): ModelInput {
  for (const { pattern, matched } of matches) {
    if (!matched) continue;
    for (const [code, target] of Object.entries(
      pattern.effects.targets ?? {},
    )) {
      const row = input.latest[code];
      if (!row) continue;
      if (target.suspendGoal) {
        row.optimalLow = null;
        row.optimalHigh = null;
      } else if (target.optimal) {
        [row.optimalLow, row.optimalHigh] = target.optimal;
      }
      row.note = `${pattern.id}: ${target.note}`;
      row.status = statusOf(row);
    }
  }
  return input;
}
