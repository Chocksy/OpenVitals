/**
 * The static half of the health model: what is worth measuring (`VECTORS`),
 * when to escalate (`RULES`), which optimal bands change with sex
 * (`SEX_RANGES`) and which doses the app refuses to print (`CEILINGS`).
 *
 * Plain data on purpose. Everything here is hand-reviewable against
 * `docs/plans/2026-08-26-health-vectors.md` sections 3, 6 and 7. Nothing in
 * this file touches the database.
 */
import type { ModelInput } from "./coverage";
import type { Grade, Lens } from "./hypotheses";
import { SYMPTOMS } from "./symptoms";

export type Sex = "male" | "female";

export interface Vector {
  /** "apob", "lpa", "bp_home", ... */
  id: string;
  name: string;
  /** 0 interview/home, 1 annual core, 2 conditional. */
  tier: 0 | 1 | 2;
  /** Metric codes that satisfy it; any one is enough. */
  codes?: string[];
  /** Or a profile fact key that satisfies it (tier 0 and a few tier 2). */
  fact?: string;
  /** 365 for annual labs, ONCE for once-in-a-life. */
  staleDays: number;
  appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
  /** How good the evidence for this vector is, from the vectors doc section 3. */
  grade: Grade;
  /** Which of the four lenses this vector moves. */
  lenses: Lens[];
  why: string;
}

/** Once in a life: never goes stale. */
const ONCE = 99999;
const YEAR = 365;

/**
 * Order is priority order: `profileQuestions` asks for the missing tier-0
 * facts from the top down, so sex and birth year always come first.
 */
export const VECTORS: Vector[] = [
  // ── Tier 0: the interview and the bathroom ────────────────────────────
  {
    id: "sex",
    grade: "A",
    lenses: ["lifespan"],
    name: "Sex",
    tier: 0,
    fact: "sex",
    staleDays: ONCE,
    why: "Half the optimal ranges and most of the screening rules depend on it.",
  },
  {
    id: "birth_year",
    grade: "A",
    lenses: ["lifespan"],
    name: "Year of birth",
    tier: 0,
    fact: "birth_year",
    staleDays: ONCE,
    why: "Age drives kidney and liver maths and every screening date.",
  },
  {
    id: "country",
    grade: "A",
    lenses: ["lifespan"],
    name: "Country",
    tier: 0,
    fact: "country",
    staleDays: ONCE,
    why: "Base rates for diabetes, blood pressure and obesity differ threefold between countries, and so do the test prices.",
  },
  {
    id: "ancestry",
    grade: "A",
    lenses: ["lifespan"],
    name: "Ancestry",
    tier: 0,
    fact: "ancestry",
    staleDays: ONCE,
    why: "Haemochromatosis, thalassaemia trait, Lp(a) and the diabetes risk at a given waist all track ancestry.",
  },
  {
    id: "height_cm",
    grade: "B",
    lenses: ["weight"],
    name: "Height",
    tier: 0,
    fact: "height_cm",
    staleDays: ONCE,
    why: "Turns weight and waist into ratios that predict risk.",
  },
  {
    id: "smoking",
    grade: "A",
    lenses: ["lifespan", "energy"],
    name: "Smoking",
    tier: 0,
    fact: "smoking",
    staleDays: YEAR,
    why: "The single largest modifiable risk there is.",
  },
  {
    id: "family_history",
    grade: "A",
    lenses: ["lifespan"],
    name: "Family history",
    tier: 0,
    fact: "family_history",
    staleDays: ONCE,
    why: "An early heart attack or bowel cancer in the family moves your screening dates forward.",
  },
  {
    id: "conditions",
    grade: "A",
    lenses: ["lifespan"],
    name: "Known conditions",
    tier: 0,
    fact: "conditions",
    staleDays: YEAR,
    why: "A diagnosis tightens the targets and changes which markers matter.",
  },
  {
    id: "medications",
    grade: "B",
    lenses: ["lifespan"],
    name: "Medications",
    tier: 0,
    fact: "medications",
    staleDays: 180,
    why: "Drugs move blood values; without the list the readings get misread.",
  },
  {
    id: "supplements",
    grade: "C",
    lenses: ["lifespan"],
    name: "Supplements",
    tier: 0,
    fact: "supplements",
    staleDays: 180,
    why: "Stops the plan doubling a dose you already take.",
  },
  {
    id: "waist_cm",
    grade: "A",
    lenses: ["lifespan", "weight"],
    name: "Waist",
    tier: 0,
    fact: "waist_cm",
    staleDays: 180,
    why: "Belly fat predicts risk better than weight or BMI.",
  },
  {
    id: "bp_home",
    grade: "A",
    lenses: ["lifespan"],
    name: "Home blood pressure",
    tier: 0,
    fact: "bp_home",
    staleDays: 180,
    why: "Blood pressure carries more attributable risk than any lab value.",
  },
  {
    id: "resting_hr",
    grade: "A",
    lenses: ["lifespan", "energy"],
    name: "Resting heart rate",
    tier: 0,
    fact: "resting_hr",
    staleDays: 180,
    why: "A cheap stand-in for fitness, measured in bed.",
  },
  {
    // ponytail: one question covers grip and a VO2max estimate; the answer
    // says which. `vo2max_est` stays a separate fact for a future device sync.
    id: "grip_kg",
    grade: "A",
    lenses: ["lifespan", "energy"],
    name: "Grip strength or VO2max",
    tier: 0,
    fact: "grip_kg",
    staleDays: YEAR,
    why: "Fitness and muscle are the strongest predictors that never appear on a lab sheet.",
  },
  {
    id: "sleep_snoring",
    grade: "B",
    lenses: ["lifespan", "energy", "mood"],
    name: "Snoring",
    tier: 0,
    fact: "sleep_snoring",
    staleDays: YEAR,
    why: "Snoring plus short sleep is the cheapest screen for sleep apnoea.",
  },
  {
    id: "screening_dates",
    grade: "A",
    lenses: ["lifespan"],
    name: "Screening dates",
    tier: 0,
    fact: "screening_dates",
    staleDays: YEAR,
    why: "Colonoscopy, mammography, cervical and skin checks are the cancers we can catch early.",
  },
  {
    id: "cycle_phase_at_last_draw",
    grade: "C",
    lenses: ["mood"],
    name: "Cycle phase at the last draw",
    tier: 0,
    fact: "cycle_phase_at_last_draw",
    staleDays: 90,
    appliesTo: { sex: "female", maxAge: 55 },
    why: "Female hormone results only compare within the same phase of the cycle.",
  },
  {
    id: "menopause_status",
    grade: "B",
    lenses: ["lifespan", "mood"],
    name: "Menopause status",
    tier: 0,
    fact: "menopause_status",
    staleDays: YEAR,
    appliesTo: { sex: "female", minAge: 40 },
    why: "It changes the hormone, bone and lipid picture completely.",
  },

  // ── Tier 1: the annual core panel ─────────────────────────────────────
  {
    id: "apob",
    grade: "A",
    lenses: ["lifespan"],
    name: "ApoB",
    tier: 1,
    codes: ["apolipoprotein_b"],
    staleDays: YEAR,
    why: "The count of the particles that build plaque. Beats LDL cholesterol.",
  },
  {
    id: "lipids",
    grade: "A",
    lenses: ["lifespan"],
    name: "Lipid panel",
    tier: 1,
    codes: ["ldl_cholesterol", "hdl_cholesterol", "triglycerides"],
    staleDays: YEAR,
    why: "The standard cholesterol picture ApoB is read against.",
  },
  {
    id: "hba1c",
    grade: "A",
    lenses: ["lifespan", "weight"],
    name: "HbA1c",
    tier: 1,
    codes: ["hba1c"],
    staleDays: YEAR,
    why: "Three months of blood sugar in one number.",
  },
  {
    id: "glucose",
    grade: "A",
    lenses: ["lifespan", "weight"],
    name: "Fasting glucose",
    tier: 1,
    codes: ["glucose"],
    staleDays: YEAR,
    why: "The morning snapshot of blood sugar.",
  },
  {
    id: "insulin",
    grade: "A",
    lenses: ["lifespan", "weight", "energy"],
    name: "Fasting insulin",
    tier: 1,
    codes: ["insulin"],
    staleDays: YEAR,
    why: "Rises years before glucose does. The early warning.",
  },
  {
    id: "creatinine",
    grade: "A",
    lenses: ["lifespan"],
    name: "Creatinine",
    tier: 1,
    codes: ["creatinine"],
    staleDays: YEAR,
    why: "The number eGFR is computed from.",
  },
  {
    id: "liver",
    grade: "B",
    lenses: ["lifespan", "energy"],
    name: "Liver enzymes",
    tier: 1,
    codes: ["alt", "ast"],
    staleDays: YEAR,
    why: "Fatty liver is the commonest liver finding and it is silent.",
  },
  {
    id: "ggt",
    grade: "B",
    lenses: ["lifespan", "energy"],
    name: "GGT",
    tier: 1,
    codes: ["ggt"],
    staleDays: YEAR,
    why: "Tracks alcohol and liver stress better than ALT alone.",
  },
  {
    id: "alp",
    grade: "B",
    lenses: ["lifespan"],
    name: "Alkaline phosphatase",
    tier: 1,
    codes: ["alp"],
    staleDays: YEAR,
    why: "Bile ducts and bone, and one of the nine PhenoAge inputs.",
  },
  {
    id: "albumin",
    grade: "B",
    lenses: ["lifespan"],
    name: "Albumin",
    tier: 1,
    codes: ["albumin"],
    staleDays: YEAR,
    why: "A broad marker of nutrition and liver output, and a PhenoAge input.",
  },
  {
    id: "cbc",
    grade: "A",
    lenses: ["lifespan", "energy"],
    name: "Blood count",
    tier: 1,
    codes: ["hemoglobin", "rbc", "wbc", "platelets", "mcv", "rdw"],
    staleDays: YEAR,
    why: "Anaemia, infection and, through RDW, general resilience.",
  },
  {
    id: "crp",
    grade: "B",
    lenses: ["lifespan", "energy"],
    name: "hs-CRP",
    tier: 1,
    codes: ["hs_crp", "crp"],
    staleDays: YEAR,
    why: "Background inflammation, which travels with heart risk.",
  },
  {
    id: "tsh",
    grade: "B",
    lenses: ["energy", "mood", "weight"],
    name: "TSH",
    tier: 1,
    codes: ["tsh"],
    staleDays: YEAR,
    why: "The thyroid dial. Off thyroid changes the whole lipid story.",
  },
  {
    id: "vitamin_d",
    grade: "B",
    lenses: ["lifespan", "mood"],
    name: "Vitamin D",
    tier: 1,
    codes: ["vitamin_d"],
    staleDays: YEAR,
    why: "Common, cheap to fix, and it drifts with the seasons.",
  },
  {
    id: "ferritin",
    grade: "B",
    lenses: ["energy", "mood"],
    name: "Ferritin",
    tier: 1,
    codes: ["ferritin"],
    staleDays: YEAR,
    why: "Iron stores. Low drains energy, high can mean iron overload.",
  },
  {
    id: "transferrin_saturation",
    grade: "B",
    lenses: ["energy"],
    name: "Iron saturation",
    tier: 1,
    codes: ["transferrin_saturation"],
    staleDays: YEAR,
    why: "Tells iron overload apart from inflammation.",
  },
  {
    id: "uric_acid",
    grade: "B",
    lenses: ["lifespan"],
    name: "Uric acid",
    tier: 1,
    codes: ["uric_acid"],
    staleDays: YEAR,
    why: "Gout, kidney stones, and a marker of metabolic load.",
  },
  {
    id: "urine_acr",
    grade: "A",
    lenses: ["lifespan"],
    name: "Urine albumin/creatinine",
    tier: 1,
    codes: [],
    staleDays: YEAR,
    why: "Catches kidney damage years before creatinine moves.",
  },
  {
    id: "b12",
    grade: "B",
    lenses: ["energy", "mood"],
    name: "Vitamin B12",
    tier: 1,
    codes: ["vitamin_b12"],
    staleDays: YEAR,
    why: "Nerves and blood cells. Vegetarians and metformin users run low.",
  },
  {
    id: "folate",
    grade: "B",
    lenses: ["energy", "mood"],
    name: "Folate",
    tier: 1,
    codes: ["folic_acid"],
    staleDays: YEAR,
    why: "Works with B12; low folate shows up as large red cells.",
  },
  {
    id: "homocysteine",
    grade: "C",
    lenses: ["lifespan"],
    name: "Homocysteine",
    tier: 1,
    codes: ["homocysteine"],
    staleDays: YEAR,
    why: "Usually just a B-vitamin gap, and easy to close.",
  },
  {
    id: "lpa",
    grade: "A",
    lenses: ["lifespan"],
    name: "Lp(a)",
    tier: 1,
    codes: ["lp_a"],
    staleDays: ONCE,
    why: "Inherited and fixed for life. Measure it once, then you know.",
  },

  // ── Tier 2: conditional ───────────────────────────────────────────────
  {
    id: "psa",
    grade: "A",
    lenses: ["lifespan"],
    name: "PSA",
    tier: 2,
    codes: ["psa_total"],
    staleDays: YEAR,
    appliesTo: { sex: "male", minAge: 45 },
    why: "The prostate cancer conversation starts with this number.",
  },
  {
    id: "hormones_male",
    grade: "C",
    lenses: ["energy", "mood"],
    name: "Testosterone",
    tier: 2,
    codes: ["testosterone"],
    staleDays: YEAR,
    appliesTo: { sex: "male" },
    why: "Energy, muscle and mood, and a sign of other problems when it is low.",
  },
  {
    id: "hormones_female",
    grade: "C",
    lenses: ["mood", "energy"],
    name: "Estradiol, FSH, LH",
    tier: 2,
    codes: ["estradiol", "fsh", "lh"],
    staleDays: YEAR,
    appliesTo: { sex: "female", maxAge: 55 },
    why: "The cycle and the run-up to menopause, read together.",
  },
  {
    id: "tpo_antibodies",
    grade: "B",
    lenses: ["energy", "mood", "weight"],
    name: "TPO antibodies",
    tier: 2,
    codes: ["tpo_antibodies"],
    staleDays: ONCE,
    why: "Says whether a wobbly thyroid is autoimmune.",
  },
  {
    id: "cystatin_c",
    grade: "A",
    lenses: ["lifespan"],
    name: "Cystatin C",
    tier: 2,
    codes: ["cystatin_c"],
    staleDays: YEAR,
    why: "A second, muscle-independent view of kidney function.",
  },
  {
    id: "cac_score",
    grade: "A",
    lenses: ["lifespan"],
    name: "Coronary calcium score",
    tier: 2,
    fact: "cac_score",
    staleDays: ONCE,
    appliesTo: { minAge: 40 },
    why: "Shows the plaque itself instead of guessing at it from a risk score.",
  },
  {
    id: "dexa",
    grade: "A",
    lenses: ["lifespan", "weight"],
    name: "DEXA scan",
    tier: 2,
    fact: "dexa",
    staleDays: ONCE,
    appliesTo: { minAge: 40 },
    why: "Muscle, visceral fat and bone density, measured rather than estimated.",
  },
  {
    id: "colonoscopy",
    grade: "A",
    lenses: ["lifespan"],
    name: "Colonoscopy",
    tier: 2,
    fact: "screening_dates",
    staleDays: 3650,
    appliesTo: { minAge: 45 },
    why: "The one screening test that removes the cancer while it looks.",
  },
  {
    id: "mammography",
    grade: "A",
    lenses: ["lifespan"],
    name: "Mammography",
    tier: 2,
    fact: "screening_dates",
    staleDays: 730,
    appliesTo: { sex: "female", minAge: 40 },
    why: "Breast cancer found early is a different disease.",
  },
];

/**
 * The question the review queue asks for each tier-0 fact, and how many days
 * later it is worth asking again (`revisitDays`).
 *
 * Phase 20. `0` means never on a clock: sex and ancestry do not move, so only
 * a correction ever touches them. Everything else carries a one-line reason
 * for its number, because "ask me again in 90 days" is a claim about how fast
 * the world changes and not a preference.
 */
const ASKED: Record<
  string,
  {
    question: string;
    options?: string[];
    free?: boolean;
    /** days until this answer is worth re-asking; 0 = never on a clock */
    revisitDays?: number;
  }
> = {
  sex: {
    question: "What is your biological sex?",
    options: ["Female", "Male"],
    revisitDays: 0, // does not change
  },
  birth_year: {
    question: "Which year were you born?",
    free: true,
    revisitDays: 0, // does not change
  },
  country: {
    question: "Which country do you live in?",
    free: true,
    revisitDays: 0, // a move is an edit, not a cadence
  },
  ancestry: {
    question: "Which ancestry describes you best?",
    options: [
      "European",
      "South Asian",
      "East Asian",
      "South-East Asian",
      "Middle Eastern / North African",
      "Sub-Saharan African",
      "Latin American",
      "Mixed / other",
      "Prefer not to say",
    ],
    revisitDays: 0, // does not change
  },
  height_cm: {
    question: "How tall are you, in centimetres?",
    free: true,
    revisitDays: 0, // adults stop growing
  },
  smoking: {
    question: "Do you smoke?",
    options: ["Never", "Former", "Current"],
    revisitDays: 180, // quitting and relapsing both happen on this scale
  },
  family_history: {
    question:
      "Any heart attack, stroke, diabetes, dementia or cancer in your parents or siblings? List them with ages, separated by commas.",
    free: true,
    revisitDays: 365, // a parent's diagnosis is news once a year at most
  },
  conditions: {
    question:
      "Which conditions have you been diagnosed with? Separate with commas.",
    free: true,
    revisitDays: 180,
  },
  medications: {
    question:
      "Which medications do you take, and at what dose? Separate with commas.",
    free: true,
    revisitDays: 90, // a prescription changes faster than anything else here
  },
  supplements: {
    question:
      "Which supplements do you take, and at what dose? Separate with commas.",
    free: true,
    revisitDays: 90,
  },
  waist_cm: {
    question: "What is your waist, in centimetres, measured at the navel?",
    free: true,
    revisitDays: 90, // a measurable change takes about a season
  },
  bp_home: {
    question:
      "What is your home blood pressure, averaged over 7 days? Write it as 120/80.",
    free: true,
    revisitDays: 90,
  },
  resting_hr: {
    question: "What is your resting heart rate, in beats per minute?",
    free: true,
    revisitDays: 90,
  },
  grip_kg: {
    question:
      "What is your grip strength in kilograms, or your VO2max estimate? Say which one.",
    free: true,
    revisitDays: 90,
  },
  sleep_snoring: {
    question: "Do you snore?",
    options: ["No", "Sometimes", "Most nights"],
    revisitDays: 90,
  },
  screening_dates: {
    question:
      "When did you last have a colonoscopy, mammography, cervical screen or skin check? List the ones you have had, with dates.",
    free: true,
    revisitDays: 365, // screening intervals are years, so a year is the floor
  },
  cycle_phase_at_last_draw: {
    question: "Where in your cycle were you at your last blood draw?",
    options: ["Follicular", "Luteal", "On the pill", "Don't know"],
    revisitDays: 0, // per draw, not per clock: `dueFacts` re-asks it on a new draw
  },
  menopause_status: {
    question: "Where are you with menopause?",
    options: ["Pre", "Peri", "Post"],
    revisitDays: 365, // and never again once the answer is "Post"
  },
  // Two answers a rule has always read and nobody has ever been able to give.
  // Neither is a vector, so the interview never asks them cold; they are here
  // so the composer and `/api/facts` can write them and the rule can fire.
  // Phase 21.
  neck_cm: {
    question: "What is your neck circumference, in centimetres?",
    free: true,
    // Chung 2008 Anesthesiology (STOP-Bang): the collar-size item, 43 cm in
    // men and 41 in women.
    revisitDays: 365,
  },
  // Phase 23c. Not a vector: nothing screens on it and it has no graded
  // likelihood ratio anywhere, so no evidence rule reads it. It is here so the
  // interview, the composer and the HealthKit sync can all write the same
  // answer, and so the review queue can re-ask it on a sane clock.
  exercise_days_week: {
    question: "How many days a week do you exercise on purpose?",
    options: ["0", "1–2", "3–4", "5+"],
    // WHO 2020 physical activity guideline: 150-300 minutes of moderate
    // activity a week, which is three to five sessions for most people. A
    // training habit moves over seasons, not weeks.
    revisitDays: 180,
  },
  diet: {
    question: "How would you describe the way you eat?",
    options: [
      "Omnivore",
      "Pescatarian",
      "Vegetarian",
      "Vegan",
      "Low-carb or keto",
      "Mediterranean",
    ],
    revisitDays: 365, // people change how they eat about once a year, at most
  },

  cac_score: {
    question:
      "Have you ever had a coronary calcium (CAC) score? Give the number and the year.",
    free: true,
    revisitDays: 365,
  },
  dexa: {
    question: "Have you ever had a DEXA scan? Give the year and the result.",
    free: true,
    revisitDays: 365,
  },

  // The four timing and habit answers the phase-16 conditional edges read.
  // They are not vectors: nothing screens on them, and `lib/ask.ts` only
  // queues them when an edge is one answer away from applying to this person.
  coffee_last_hour: {
    question:
      "What time do you usually have your last coffee or caffeinated drink? Write it as 15:00.",
    free: true,
    revisitDays: 180,
  },
  last_meal_hour: {
    question:
      "What time do you usually finish your last meal? Write it as 21:00.",
    free: true,
    revisitDays: 180,
  },
  bedtime_hour: {
    question: "What time do you usually go to bed? Write it as 23:00.",
    free: true,
    revisitDays: 180,
  },
  dairy_daily: {
    question: "Do you have milk, yoghurt or cheese most days?",
    options: ["Yes", "No"],
    revisitDays: 180,
  },

  // ── phase 20: the clarifiers the composer asks after a post ────────────
  // One more detail each, and each one feeds a rule or an edge. Nothing here
  // is ever asked cold by the interview: `lib/compose.ts` asks them, once,
  // about something the person has just written.
  energy_when: {
    question: "When in the day are you most tired?",
    options: ["Mornings", "Afternoons", "Evenings", "All day"],
    revisitDays: 90,
  },
  sym_energy_duration: {
    question: "How long has the tiredness been going on?",
    options: ["Under a month", "Over a month"],
    revisitDays: 90,
  },
  sym_weight_amount: {
    question: "How much weight, and over how long?",
    options: [
      "Under 3 kg",
      "3 to 6 kg over 6 months",
      "More than 6 kg over 6 months",
    ],
    revisitDays: 180,
  },
  sleep_apnoea_witnessed: {
    question: "Has anyone seen you stop breathing while you sleep?",
    options: ["No", "Yes", "Nobody has watched"],
    revisitDays: 180,
  },
  cycle_length_days: {
    question:
      "How many days from the first day of one period to the first day of the next?",
    options: ["Under 21", "21 to 35", "Over 35", "It varies a lot"],
    revisitDays: 180,
  },
  glucose_when: {
    question: "Was that glucose fasting, or after a meal?",
    options: ["Fasting", "After a meal"],
    revisitDays: 0, // it describes one reading, not a standing habit
  },
  finding_since: {
    question: "Since when have you noticed it?",
    options: ["This week", "This month", "Over a month", "Years"],
    revisitDays: 0, // asked about a specific finding, never on a clock
  },
};

/** The four answers only a conditional edge asks for. */
export const CONDITIONAL_FACTS = new Set([
  "coffee_last_hour",
  "last_meal_hour",
  "bedtime_hour",
  "dairy_daily",
]);

/**
 * The interview, plus the twelve symptom items. Symptoms live in
 * `lib/symptoms.ts` because the evidence rules read them too; they are merged
 * here so `saveFact`, the review queue and `lib/infogain.ts` need to know
 * about one map and not two.
 */
export const PROFILE_QUESTIONS: Record<
  string,
  {
    question: string;
    options?: string[];
    free?: boolean;
    /** days until this answer is worth re-asking; 0 = never on a clock */
    revisitDays?: number;
  }
> = {
  ...ASKED,
  ...Object.fromEntries(
    SYMPTOMS.map((s) => [
      s.key,
      {
        question: s.question,
        options: s.options,
        // A symptom is a claim about the last few weeks, so a season is the
        // honest cadence. `SYMPTOMS` may override it per item.
        revisitDays: s.revisitDays ?? 90,
      },
    ]),
  ),
};

/** Facts stored as arrays: the answer is split on commas. */
export const LIST_FACTS = new Set([
  "family_history",
  "medications",
  "supplements",
  "screening_dates",
  "conditions",
]);

export interface Rule {
  id: string;
  /** Pure function over the coverage/model input. */
  when: (m: ModelInput) => boolean;
  suggest: string;
  why: string;
  tier: 1 | 2 | 3;
  /** Rules are always science-labelled. */
  basis: "science";
  ref?: string;
}

/* ── small readers over ModelInput, so the rules stay one line each ───── */

const val = (m: ModelInput, code: string): number | null =>
  m.latest[code]?.value ?? null;

const prev = (m: ModelInput, code: string): number | null =>
  m.latest[code]?.prev ?? null;

const has = (m: ModelInput, code: string) => m.latest[code] != null;

const fact = (m: ModelInput, key: string): string => {
  const v = m.profile[key];
  if (v == null) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
};

const missing = (m: ModelInput, key: string) => fact(m, key).trim() === "";

/** Does the family history mention this, and was it early enough to matter? */
const family = (m: ModelInput, what: RegExp, before = 200): boolean => {
  const raw = m.profile.family_history;
  const entries = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
  return entries.some((e) => {
    if (!what.test(e)) return false;
    const age = e.match(/\b(\d{2})\b/);
    return age ? Number(age[1]) < before : true;
  });
};

/** hs-CRP in mg/L whichever of the two codes carried it. */
const crpMgL = (m: ModelInput): number | null => {
  for (const code of ["hs_crp", "crp"]) {
    const row = m.latest[code];
    if (row?.value == null) continue;
    return /mg\/dl/i.test(row.unit ?? "") ? row.value * 10 : row.value;
  }
  return null;
};

/** Lp(a) is reported in mg/dL or nmol/L; 50 mg/dL is about 125 nmol/L. */
const lpaAboveThreshold = (m: ModelInput): boolean => {
  const row = m.latest.lp_a;
  if (row?.value == null) return false;
  return row.value > (/nmol/i.test(row.unit ?? "") ? 125 : 50);
};

const daysSince = (m: ModelInput, code: string): number | null => {
  const date = m.latest[code]?.date;
  if (!date) return null;
  return Math.floor(
    (new Date(m.today).getTime() - new Date(date).getTime()) / 86_400_000,
  );
};

const stale = (m: ModelInput, code: string, days = 365): boolean => {
  const since = daysSince(m, code);
  return since == null || since > days;
};

/** "128/78" from the home BP fact. */
export const parseBp = (text: string): [number, number] | null => {
  const hit = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return hit ? [Number(hit[1]), Number(hit[2])] : null;
};

const age = (m: ModelInput) => m.age ?? -1;

/**
 * The escalation ladder from the vectors doc, section 6, as code. The report
 * job fires these; the model explains them, it never decides what to order.
 */
export const RULES: Rule[] = [
  {
    id: "lpa_once",
    when: (m) => !has(m, "lp_a"),
    suggest: "Measure Lp(a) once",
    why: "Lp(a) is inherited and barely moves in a lifetime, so one measurement settles it for good. Yours has never been measured.",
    tier: 1,
    basis: "science",
    ref: "EAS 2022 consensus on Lp(a)",
  },
  {
    id: "apob_on_every_draw",
    // The second half needs a fresh LDL, so this never fires for someone with
    // no labs, and "add to the next draw" reads the same either way.
    when: (m) => stale(m, "apolipoprotein_b") && !stale(m, "ldl_cholesterol"),
    suggest: "Add ApoB to the next lipid draw",
    why: "Your lipid panel is current but ApoB is not, and ApoB counts the particles that actually build plaque.",
    tier: 1,
    basis: "science",
    ref: "Sniderman 2019 JAMA Cardiol",
  },
  {
    id: "cac_if_risk",
    when: (m) =>
      age(m) >= 40 &&
      ((val(m, "apolipoprotein_b") ?? 0) > 90 ||
        family(m, /\b(mi|heart attack|infarct|cardiac)\b/i, 55) ||
        lpaAboveThreshold(m)),
    suggest: "Get a coronary calcium (CAC) score",
    why: "With raised ApoB, raised Lp(a) or an early heart attack in the family, the plaque itself decides when to start treatment, not a risk score.",
    tier: 2,
    basis: "science",
    ref: "ACC/AHA 2018 cholesterol guideline",
  },
  {
    id: "ogtt_if_insulin_resistant",
    when: (m) =>
      (val(m, "hba1c") ?? 0) >= 5.7 ||
      (val(m, "insulin") ?? 0) > 10 ||
      (m.derived.tgHdl ?? 0) > 2,
    suggest: "Ask for a 2-hour OGTT with insulin",
    why: "HbA1c, fasting insulin or the triglyceride to HDL ratio already point at insulin resistance, which shows up on an OGTT years before HbA1c moves.",
    tier: 2,
    basis: "science",
    ref: "ADA Standards of Care",
  },
  {
    id: "thyroid_workup",
    when: (m) => {
      const tsh = val(m, "tsh");
      const rising =
        tsh != null &&
        tsh > 2.5 &&
        (prev(m, "tsh") == null || tsh > prev(m, "tsh")!);
      const tpo = m.latest.tpo_antibodies;
      const positive =
        tpo?.value != null &&
        tpo.value > (tpo.optimalHigh ?? tpo.refHigh ?? Infinity);
      return rising || positive;
    },
    suggest: "Repeat TSH with free T4, free T3 and anti-TPO",
    why: "A TSH above 2.5 that is climbing, or positive thyroid antibodies, changes how the lipid and energy picture should be read.",
    tier: 2,
    basis: "science",
    ref: "Rodondi 2010 JAMA",
  },
  {
    id: "ferritin_low",
    when: (m) => (val(m, "ferritin") ?? Infinity) < 30,
    suggest: "Find the cause of the low ferritin",
    why: "Ferritin under 30 means the iron stores are empty; the question is where the iron is going, not just how to top it up.",
    tier: 2,
    basis: "science",
    ref: "BSG iron deficiency guideline",
  },
  {
    id: "ferritin_high",
    when: (m) => {
      const f = val(m, "ferritin");
      const sat = val(m, "transferrin_saturation");
      const cap = m.sex === "female" ? 200 : 300;
      return f != null && f > cap && sat != null && sat > 45;
    },
    suggest: "Check HFE genotype and repeat ferritin with CRP",
    why: "High ferritin with iron saturation over 45% is the pattern of iron overload rather than of inflammation.",
    tier: 2,
    basis: "science",
    ref: "EASL haemochromatosis guideline",
  },
  {
    id: "liver_workup",
    when: (m) => {
      const alt = val(m, "alt");
      const cap = m.sex === "female" ? 20 : 30;
      const ggt = m.latest.ggt;
      const ggtHigh =
        ggt?.value != null &&
        ggt.optimalHigh != null &&
        ggt.value > ggt.optimalHigh;
      return (alt != null && alt > cap) || ggtHigh;
    },
    suggest: "Work up the liver: hepatitis serology, ferritin and FIB-4",
    why: "ALT above the sex-specific limit, or GGT above optimal, usually means fat in the liver, and FIB-4 says whether it has started to scar.",
    tier: 2,
    basis: "science",
    ref: "AASLD NAFLD guidance",
  },
  {
    id: "kidney_two_markers",
    when: (m) => (m.derived.egfr ?? 999) < 90 || !has(m, "urine_acr"),
    suggest: "Add a urine albumin/creatinine ratio",
    why: "Kidneys are graded on two numbers, filtration and leak. You have creatinine but no urine albumin, so half the picture is missing.",
    tier: 1,
    basis: "science",
    ref: "KDIGO 2024 CKD guideline",
  },
  {
    id: "crp_source",
    when: (m) => (crpMgL(m) ?? 0) > 3,
    suggest: "Repeat hs-CRP in two weeks and look for the source",
    why: "An hs-CRP above 3 mg/L twice is background inflammation with a cause: gums, sleep apnoea, an infection or belly fat.",
    tier: 2,
    basis: "science",
    ref: "Ridker 2023 Lancet",
  },
  {
    id: "homocysteine_high",
    when: (m) => (val(m, "homocysteine") ?? 0) > 12,
    suggest: "Check B12, folate and MMA",
    why: "Homocysteine over 12 µmol/L is almost always a B-vitamin gap, and it is cheap to close.",
    tier: 2,
    basis: "science",
    ref: "Refsum 2004 Clin Chem",
  },
  {
    id: "testosterone_low",
    when: (m) => m.sex === "male" && (val(m, "testosterone") ?? Infinity) < 300,
    suggest: "Repeat testosterone fasted in the morning, with LH, FSH and SHBG",
    why: "A single low testosterone means little; the repeat plus the pituitary hormones says whether the cause is treatable.",
    tier: 2,
    basis: "science",
    ref: "Endocrine Society 2018 testosterone guideline",
  },
  {
    id: "bp_log",
    when: (m) => {
      const bp = parseBp(fact(m, "bp_home"));
      return bp == null || bp[0] >= 130 || bp[1] >= 80;
    },
    suggest: "Log your blood pressure at home for 7 days",
    why: "Blood pressure carries more attributable risk than any lab value, and a clinic reading is not the number that counts.",
    tier: 1,
    basis: "science",
    ref: "Lewington 2002 Lancet",
  },
  {
    id: "sleep_study",
    when: (m) => {
      const snore = fact(m, "sleep_snoring");
      // `sleep_duration` is stored in minutes — the catalog row says `min`,
      // the composer writes minutes and so does the HealthKit sync. This rule
      // used to compare it against 6.5, so short sleep never counted and the
      // watch's nightly reading did nothing here.
      const minutes = val(m, "sleep_duration");
      return (
        snore === "Most nights" ||
        (snore === "Sometimes" && minutes != null && minutes < 6.5 * 60)
      );
    },
    suggest: "Do a home sleep study",
    why: "Snoring most nights, or snoring on short sleep, is the profile of sleep apnoea, which roughly doubles cardiovascular risk.",
    tier: 2,
    basis: "science",
    ref: "Marin 2005 Lancet",
  },
  {
    id: "fitness_baseline",
    when: (m) =>
      age(m) >= 40 && missing(m, "grip_kg") && missing(m, "vo2max_est"),
    suggest: "Measure grip strength or estimate VO2max",
    why: "Fitness and muscle are the strongest predictors of how long you live and they never appear on a blood test.",
    tier: 1,
    basis: "science",
    ref: "Mandsager 2018 JAMA Netw Open",
  },
  {
    id: "colonoscopy_age",
    when: (m) =>
      age(m) >= 45 ||
      (age(m) >= 40 && family(m, /\b(colorectal|colon|bowel|rectal)\b/i)),
    suggest: "Book a colonoscopy",
    why: "Screening starts at 45, or at 40 when a close relative had bowel cancer. It is the one test that removes the problem while it looks.",
    tier: 2,
    basis: "science",
    ref: "USPSTF 2021 colorectal screening",
  },
  {
    id: "psa_discuss",
    when: (m) =>
      m.sex === "male" &&
      (age(m) >= 50 || (age(m) >= 45 && family(m, /\bprostate\b/i))),
    suggest: "Have the PSA conversation with a doctor",
    why: "From 50, or from 45 with prostate cancer in the family, PSA is a shared decision rather than an automatic test.",
    tier: 2,
    basis: "science",
    ref: "USPSTF 2018 prostate screening",
  },
  {
    id: "mammography_age",
    when: (m) => m.sex === "female" && age(m) >= 40,
    suggest: "Book a mammogram on the guideline interval",
    why: "From 40, regular mammography is the screening with the clearest benefit for women.",
    tier: 2,
    basis: "science",
    ref: "USPSTF 2024 breast screening",
  },
  {
    id: "cycle_phase_missing",
    when: (m) =>
      m.sex === "female" &&
      age(m) <= 55 &&
      (has(m, "estradiol") || has(m, "fsh") || has(m, "lh")) &&
      missing(m, "cycle_phase_at_last_draw"),
    suggest: "Record which cycle phase the hormone draw was in",
    why: "Estradiol, FSH and LH only mean anything when compared inside the same phase of the cycle.",
    tier: 1,
    basis: "science",
    ref: "Endocrine Society female hormone testing",
  },
  // Never measured and gone stale are two different sentences. `stale()` is
  // true for both, so the rule that says "retest" has to check for a reading
  // first, or a person with no labs is told to repeat a test they never had.
  {
    id: "vitamin_d_measure",
    when: (m) => !has(m, "vitamin_d"),
    suggest: "Measure vitamin D",
    why: "Vitamin D has never been measured, and it is the cheapest deficiency there is to find and to fix.",
    tier: 1,
    basis: "science",
    ref: "Endocrine Society 2011 vitamin D guideline",
  },
  {
    id: "vitamin_d_refresh",
    when: (m) =>
      has(m, "vitamin_d") &&
      (stale(m, "vitamin_d") || (val(m, "vitamin_d") ?? 99) < 30),
    suggest: "Retest vitamin D",
    why: "Vitamin D drifts with the seasons and yours is either over a year old or below 30 ng/mL, which is the deficiency line.",
    tier: 1,
    basis: "science",
    ref: "Endocrine Society 2011 vitamin D guideline",
  },
];

/**
 * Optimal bands that differ by sex. Applied on top of `metrics.optimal_low` /
 * `optimal_high` when the model input is built; never written back to the
 * `metrics` table, and never allowed to change what the lab printed.
 */
export const SEX_RANGES: Record<
  string,
  Record<Sex, [number | null, number | null]>
> = {
  // ng/mL
  ferritin: { male: [50, 300], female: [30, 200] },
  // g/dL
  hemoglobin: { male: [13.8, 17.2], female: [12.1, 15.1] },
  // U/L
  alt: { male: [null, 30], female: [null, 20] },
  // ng/dL
  testosterone: { male: [500, 900], female: [15, 70] },
  // mg/dL
  creatinine: { male: [0.8, 1.1], female: [0.6, 0.9] },
  // mg/dL
  uric_acid: { male: [3.5, 6], female: [3, 5.5] },
};

/**
 * What a living person can read, in the metric's own canonical unit. A CBC
 * count inside these bounds is never implausible however the lab printed its
 * range, and one outside them always is. Everything else falls back to 50x
 * outside the printed range.
 */
export const BOUNDS: Record<string, [number, number]> = {
  wbc: [0.5, 100], // K/uL
  rbc: [1, 10], // M/uL
  platelets: [5, 2000], // K/uL
  neutrophils_abs: [0.01, 80], // K/uL
  lymphocytes_abs: [0.05, 60], // K/uL
  monocytes_abs: [0.01, 20], // K/uL
  eosinophils_abs: [0.001, 20], // K/uL
  basophils_abs: [0.001, 10], // K/uL
  hemoglobin: [2, 25], // g/dL
  hematocrit: [10, 70], // %

  // Phase 23c: the codes a watch writes. Same numbers as the `plausible`
  // guard `lib/healthkit.ts` applies on the way in, so a device artefact
  // caught by one is caught by the other, and the curator's unit check has a
  // canonical band to read for a metric no lab ever prints a range for.
  resting_heart_rate: [25, 140], // bpm
  hrv_sdnn: [1, 400], // ms
  walking_hr_avg: [40, 200], // bpm
  hr_recovery_1min: [1, 120], // bpm
  respiratory_rate: [4, 60], // breaths/min
  spo2: [50, 100], // %
  sleep_duration: [30, 1080], // min — the catalog stores minutes, not hours
  vo2max_est: [10, 90], // mL/kg/min
  wrist_temp: [28, 42], // C
  body_fat_pct: [2, 70], // %
  waist_cm: [40, 200], // cm
};

/**
 * The reference top a marker has when the lab printed none.
 *
 * A serology is only readable against a cut-off, and a simulated draw, a
 * questionnaire answer and a paper's typical value all arrive without one. The
 * engine used to read "no range" as "in range", so a tTG of 68 argued against
 * coeliac disease. These are the manufacturer or guideline cut-offs, one per
 * marker, and they are only ever a fallback: a range the lab printed always
 * wins.
 *
 * A categorical test (positive/negative, written 1/0) gets 0.5, which is the
 * same statement in the only unit it has.
 */
export const DEFAULT_REF_HIGH: Record<string, number> = {
  // U/mL. Husby 2020 ESPGHAN / Rubio-Tapia 2023 ACG: the coeliac serologies
  // are read against the assay's upper limit of normal, conventionally 10.
  ttg_iga: 10,
  dgp_iga: 10,
  dgp_igg: 10,
  // IU/mL. Caturegli 2014 Autoimmun Rev: 34 IU/mL is the usual anti-TPO limit.
  tpo_antibodies: 34,
  // IU/mL. Same assay family; 115 is the conventional anti-Tg limit.
  anti_thyroglobulin: 115,
  // Categorical, reported as positive or negative.
  ema_iga: 0.5,
  antibodie_endomysial_iga: 0.5,
  hbs_ag_screening: 0.5,
  hcv_antibodies: 0.5,
  hcv_rna: 0.5,
  parietal_cell_antibodies: 0.5,
  intrinsic_factor_antibodies: 0.5,
  h_pylori_stool_antigen: 0.5,
  fobt: 0.5,
  hla_dq2_dq8: 0.5,
  hfe_genotype: 0.5,
  synovial_urate_crystals: 0.5,
  // ng/mL. Valent 2021 Blood: 11.4 is the upper reference limit for baseline
  // serum tryptase.
  tryptase: 11.4,
  // mmol/L. Kovesdy 2014 (KDIGO controversies): 5.0-5.5 is the usual upper
  // limit for serum potassium.
  potassium: 5.1,
  // mg/dL. Fevery 2008 Liver Int: the conventional upper limit for total and
  // unconjugated bilirubin.
  total_bilirubin: 1.2,
  indirect_bilirubin: 1.2,
  // µg/24h. EASL 2012: over 40 µg is abnormal, over 100 is diagnostic.
  urine_copper_24h: 40,
  // µg/g. Menees 2015 Am J Gastroenterol: 50 µg/g is the usual cut-off for
  // faecal calprotectin.
  calprotectin: 50,
  // ppm rise. Rezaie 2017 North American Consensus: 20 ppm within 90 minutes.
  breath_h2_peak: 20,
  // index 1-5. Casén 2015 Aliment Pharmacol Ther: above 2 is dysbiosis.
  dysbiosis_index: 2.5,
  // Categorical: a phenotype report is positive or negative.
  aat_phenotype: 0.5,
  // U/L. Kwo 2017 Am J Gastroenterol (ACG): the conventional laboratory upper
  // limit. The sex-specific optimal band in `SEX_RANGES` is lower and is what
  // "amber" reads; this is the line that makes a value abnormal rather than
  // merely non-optimal.
  alt: 40,
  ast: 40,
  ggt: 60,
  // mg/g. KDIGO 2024: an albumin-creatinine ratio of 30 mg/g or more is
  // albuminuria, whatever the eGFR.
  urine_albumin_creatinine_ratio: 30,
};

/**
 * The doses the app refuses to print, whatever the model says. The check is
 * blunt on purpose: match the substance in the title, read the first number in
 * the dose, compare.
 *
 * ponytail: "iron only if ferritin < 50" is a condition, not a ceiling, so it
 * lives in the prompt. Potassium and niacin get a ceiling of 0, which drops any
 * dose at all.
 */
export const CEILINGS: { substance: RegExp; max: number; unit: string }[] = [
  { substance: /vitamin\s*d|cholecalciferol|\bd3\b/i, max: 10000, unit: "IU" },
  { substance: /vitamin\s*a|retinol/i, max: 3000, unit: "µg" },
  { substance: /\bzinc\b/i, max: 40, unit: "mg" },
  { substance: /\bmagnesium\b/i, max: 400, unit: "mg elemental" },
  { substance: /\bpotassium\b/i, max: 0, unit: "mg" },
  { substance: /\bniacin\b|nicotinic acid/i, max: 0, unit: "mg" },
];

/** The first number in a dose string, with thousands separators removed. */
export const doseAmount = (text: string): number | null => {
  const hit = text.replace(/[,\s](?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/);
  return hit ? Number(hit[0]) : null;
};

/** The ceiling this action breaks, if any. */
export function overCeiling(action: {
  title: string;
  dose?: { amount: string };
}): { substance: RegExp; max: number; unit: string } | null {
  const amount = action.dose ? doseAmount(action.dose.amount) : null;
  for (const c of CEILINGS) {
    if (
      !c.substance.test(action.title) &&
      !c.substance.test(action.dose?.amount ?? "")
    )
      continue;
    if (c.max === 0) return c;
    if (amount != null && amount > c.max) return c;
  }
  return null;
}
