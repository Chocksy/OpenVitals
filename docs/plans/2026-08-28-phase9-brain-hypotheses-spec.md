# Phase 9: the hypothesis engine and the `/brain` view

Approved in brainstorming on 2026-08-28. Goal: see into the engine for any
patient state, and walk a simulated case: partial tests → what we would
ask → the person "gets" the tests → hypotheses move → conclusion or not,
with confidence scores and lens weights (lifespan, quality of life, mood).

Everything in `apps/simple`. No schema change. Engine pure and tested;
the page is a thin client over one API route. Ponytail rules.

## 1. `lib/hypotheses.ts`: scored hypotheses (data + engine)

```ts
export type Lens = "lifespan" | "energy" | "mood" | "weight";
export type Grade = "A" | "B" | "C" | "D"; // D = anecdotal only
export type HState =
  | "ruled_out"
  | "unlikely"
  | "possible"
  | "likely"
  | "confirmed";

export interface EvidenceRule {
  id: string;
  /** what it reads: a metric code, a derived key, a profile fact, or a life event tag */
  input: {
    metric?: string;
    derived?: keyof ModelInput["derived"];
    fact?: string;
    event?: string;
  };
  /** condition on the input value */
  when: {
    above?: number;
    below?: number;
    equals?: string;
    includes?: string;
    status?: "red" | "amber";
  };
  /** likelihood ratio when the condition holds; < 1 argues against. Absent input = no change. */
  lr: number;
  /** likelihood ratio when the input is present and the condition does NOT hold (e.g. a negative antibody argues against). Optional. */
  lrNeg?: number;
  grade: Grade;
  source: string;
  /** markers whose weight is discounted on a confounded draw (see confounders) */
  confoundedBy?: string[];
}

export interface Discriminator {
  test: string; // human name, "Fasting insulin", "Anti-TPO antibodies", "Parietal cell antibodies"
  codes: string[]; // metric codes that satisfy it
  cost: 1 | 2 | 3 | 4; // 1 cheap blood test, 2 special blood test, 3 imaging/functional, 4 invasive
  /** expected LR if positive and if negative, used for "expected movement" */
  lrPos: number;
  lrNeg: number;
  howTo?: string;
}

export interface Hypothesis {
  id: string;
  name: string;
  summary: string;
  priors: {
    base: number;
    modifiers: {
      when: EvidenceRule["input"] & {
        equals?: string;
        includes?: string;
        sex?: Sex;
        minAge?: number;
        maxAge?: number;
      };
      times: number;
      why: string;
    }[];
  };
  evidence: EvidenceRule[];
  discriminators: Discriminator[];
  /** impact weights 0..3 per lens with a grade each, e.g. lifespan: {w: 3, grade: "A"} */
  lenses: Partial<Record<Lens, { w: 0 | 1 | 2 | 3; grade: Grade }>>;
  /** what would resolve it and what to suggest once likely/confirmed: reuse Pattern.management text */
  management: string;
  patternId?: string; // link to lib/patterns.ts when one exists
}

export const CONFOUNDERS: {
  tag: string;
  markers: string[];
  discount: number;
  why: string;
}[];
// tags: "acute_illness", "heavy_training", "not_fasted", "poor_sleep", "acute_stress", "luteal_phase", "winter", "dehydration", "post_viral"

export const HYPOTHESES: Hypothesis[]; // first eight, section 2

export interface HypothesisResult {
  id: string;
  name: string;
  prior: number;
  score: number; // score = posterior odds → probability 0..1
  state: HState;
  for: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: Grade;
    discounted?: number;
  }[];
  against: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: Grade;
  }[];
  missing: { rule: string; input: string }[]; // evidence that could not be evaluated
  confounded: { input: string; tag: string }[];
  nextTests: {
    test: string;
    cost: number;
    expectedShift: number;
    ratio: number;
    howTo?: string;
  }[]; // sorted by ratio desc
  lenses: Hypothesis["lenses"];
  lensWeight: number; // Σ w × gradeWeight, used for ranking across hypotheses
}

export function scoreHypotheses(
  m: ModelInput,
  opts?: {
    confounderTags?: Record<
      string,
      string[]
    > /* metric code → tags on its latest draw */;
    lens?: Lens;
  },
): HypothesisResult[];
```

Scoring: odds = prior/(1−prior) × Π lr (each lr discounted toward 1 by
the confounder discount when its input is tagged); probability =
odds/(1+odds). States by fixed cut-offs: < 0.05 ruled_out, < 0.25 unlikely,
< 0.6 possible, < 0.9 likely, ≥ 0.9 confirmed; "confirmed" also requires a
discriminator with `lrPos ≥ 10` to have been positive. `expectedShift` for
a discriminator = |p(after positive) − p| × 0.5 + |p(after negative) − p| ×
0.5; `ratio = expectedShift / cost`. Ranking across hypotheses for the
view: `score × lensWeight` for the selected lens, default lifespan.

Everything is printable: the result carries the numbers the page shows.
Unit tests: a fixture per hypothesis for a matching and a non-matching
input, confounder discount changes the score, expectedShift ordering
puts the cheap blood test ahead of imaging when both move the score.

## 2. The first eight hypotheses (data, with graded sources)

Fill each from the docs already in the repo (`health-vectors.md`,
`knowledge-graph-patterns-evals.md` §4, `patterns.ts`). Weights: use
published likelihood ratios where they exist and say where they come
from; otherwise a curated LR with grade C and a one-line rationale.
Keep every hypothesis generic (no person in mind).

1. **insulin_resistance** (lifespan A w3, energy B w2, weight A w3). Evidence:
   fasting insulin > 10 (LR 3, B), HOMA-IR > 2 (LR 3, B), TG/HDL > 2 (LR 2,
   B) and < 1.5 (lrNeg 0.6), HbA1c ≥ 5.7 (LR 4, A) and < 5.4 (0.7),
   glucose > 100 (LR 2, A), waist/height > 0.5 (LR 2.5, A), family T2D (prior
   ×2, A), ALT > 30 (LR 1.5, B). Discriminators: fasting insulin (cost 1,
   3/0.5), OGTT with insulin (2, 6/0.2), HbA1c (1), CGM 14 d (3, 2/0.7).
2. **hashimoto** (lifespan B w1, energy A w3, mood B w2, weight B w2).
   TPO-Ab positive (LR 10, A), Tg-Ab positive (LR 5, A), both negative
   (lrNeg 0.3), TSH > 4.5 (LR 3, A), TSH 2.5–4.5 (1.5, B), fT4 low (2, A),
   female (prior ×5, A), family thyroid/autoimmune (×2, B), HLA-DR3/4 fact
   (×1.5, C). Discriminators: anti-TPO (1, 10/0.3), anti-Tg (1, 5/0.6),
   ultrasound (3, 4/0.5), TSH repeat 6 months (1).
3. **iron_deficiency** (energy A w3, mood B w2, lifespan B w1). Ferritin
   < 30 (LR 20, A), < 15 (50), transferrin sat < 20 % (3, A), MCV < 80 (2,
   A), RDW > 14.5 (1.5, B), haemoglobin low (2, A), CRP high (confounds
   ferritin; discount 0.5). Discriminators: ferritin (1, 20/0.1),
   transferrin sat (1), reticulocyte Hb (2).
4. **iron_deficiency_cause_gi** (a cause hypothesis; only scored when
   iron_deficiency ≥ possible; lifespan B w2, energy w1). Male (×3, A),
   post-menopausal (×3, A), H. pylori positive (LR 3, B), coeliac serology
   positive (LR 8, A), parietal-cell or intrinsic-factor antibodies (LR 8,
   B), low B12 with low ferritin (LR 2, B), gastrin high / pepsinogen I low
   (LR 5, B), FOBT positive (LR 6, A). Discriminators: tTG-IgA + total IgA
   (1, 8/0.3), H. pylori stool antigen (1, 3/0.5), parietal-cell Ab (2,
   8/0.4), FOBT (1, 6/0.7), gastroscopy (4, 20/0.1).
5. **pcos** (female, 15–50; quality of life A w3, weight A w2, lifespan B
   w1, mood B w2). Irregular cycles fact (LR 4, A), hirsutism/acne fact
   (LR 3, A), LH/FSH > 2 (LR 2, B), total or free testosterone high (LR 4,
   A), SHBG low (1.5, B), fasting insulin > 10 (1.5, B), AMH high (LR 3,
   B). Rotterdam: 2 of 3 criteria → confirmed via discriminator
   "ovarian ultrasound" (3, 4/0.4). Discriminators: androgens (1),
   LH/FSH (1), AMH (2), ultrasound (3).
6. **sleep_apnoea** (lifespan A w3, energy A w3, mood B w2). Snoring fact
   (LR 3, A), daytime sleepiness fact (LR 2, A), BMI > 30 or neck > 43 cm
   (LR 3, A), male (×2, A), hypertension (LR 2, A), haematocrit high (1.5,
   B), resting HR high from wearable (1.3, C). Discriminators: STOP-Bang
   questions (cost 1, 3/0.3), home sleep study (3, 10/0.1).
7. **nafld** (lifespan B w2, energy C w1). ALT > 30 male / > 20 female
   (LR 2.5, B), GGT above optimal (2, B), TG > 150 (1.5, B), waist/height
   > 0.5 (2, A), insulin_resistance likely (LR 2, B), FIB-4 > 1.3 (LR 3, A
   > for fibrosis). Discriminators: liver ultrasound (3, 5/0.3), FibroScan
   > (3, 8/0.2).
8. **b12_deficiency** (energy A w2, mood B w2, lifespan B w1). B12 < 200
   (LR 10, A), 200–300 (LR 2, B), MCV > 100 (LR 3, A), homocysteine > 12
   (LR 3, B), MMA high (LR 8, A), vegetarian/vegan fact (×3, A), metformin
   or PPI fact (×2, A), parietal-cell Ab positive (LR 5, B).
   Discriminators: MMA (2, 8/0.3), holotranscobalamin (2), B12 repeat (1).

Add a `HYPOTHESES` integrity test: every metric code exists in the
catalog or the DERIVED map or the allowlist from `graph.test.ts`; every
rule has a source; lenses non-empty.

## 3. `lib/sample.ts`: scenarios

```ts
export type Scenario =
  | { kind: "empty"; sex?: Sex; age?: number }
  | { kind: "user"; userId: string }
  | {
      kind: "sampled";
      userId: string;
      seed: number;
      mask: "last_draw" | "random_pct" | "panels" | "before_year";
      pct?: number;
      panels?: string[];
      year?: number;
    }
  | { kind: "persona"; id: string }; // evals/cases
export interface Overlay {
  // what the simulation adds on top
  readings: { code: string; value: number; unit?: string; date: string }[];
  facts: Record<string, unknown>;
  confounders: Record<string, string[]>; // metric code → tags
}
export async function buildScenarioInput(
  s: Scenario,
  overlay?: Overlay,
): Promise<ModelInput>;
```

Sampling is deterministic from the seed (mulberry32). `panels` uses the
metric `category`. The overlay's readings replace the latest value for
that code (so "the person got the test" is one click).

## 4. `lib/brain.ts`: the full run, one function

```ts
export interface BrainRun {
  scenario: Scenario;
  overlay: Overlay;
  pillars: {
    vector: Vector;
    state: CoverageRow["state"];
    grade: string;
    distance: number;
    trend: "up" | "down" | "flat" | "n/a";
    rank: number;
    lenses: Lens[];
  }[];
  hypotheses: HypothesisResult[];
  path: {
    step: number;
    test: string;
    cost: number;
    moves: { id: string; shift: number }[];
    howTo?: string;
  }[]; // greedy: best ratio first, then recompute assuming the test is still unknown, dedupe by codes
  patterns: ReturnType<typeof matchPatterns>;
  graph: { hot: NodeState[]; activeEdges: number };
  pack: { section: string; text: string; tokens: number }[]; // from buildContextFromInput split at its headings, plus a HYPOTHESES section
  totalTokens: number;
}
export async function runBrain(
  s: Scenario,
  overlay?: Overlay,
  lens?: Lens,
): Promise<BrainRun>;
```

Pillar `distance` = how far the latest value is outside the optimal band,
in units of the band width, 0 when inside, `n/a` when missing. Pillar
`grade` from the vectors doc table (add a `grade` field to `Vector` in
`lib/vectors.ts`, A/B/C, and `lenses`). Token counts: use a cheap
approximation (chars / 4) behind a `countTokens()` helper, marked
`// ponytail: swap for a real tokenizer when we pick the model for good`.

The context pack gains a `HYPOTHESES` section (top 5 by score with state,
for/against one-liners, next test) and `buildContextFromInput` uses it in
production too. The plan prompt gets one line: "HYPOTHESES are scored by
the app; do not re-score them, explain them and order tests by the path
given."

## 5. `/brain` page (admin only, `isAdmin()`), plus `POST /api/brain`

Client page, state in the URL query (scenario, seed, mask, lens) and the
overlay in `localStorage` keyed by scenario. Layout, all reusing the card
and chip kit, Simple/Deep switch reused for the pack panel:

1. **Scenario bar**: kind picker, user picker (the two real users and the
   test users, by email), seed input + Reroll, mask select with its
   parameter, persona select, lens select (lifespan / energy / mood /
   weight). "Run" button posts to `/api/brain` and renders the run.
2. **Pillars**: ranked table: rank, vector, grade chip, state chip, distance
   bar, trend arrow, lens chips. Never-measured rows dimmed.
3. **Hypotheses**: one card per hypothesis, ranked by `score × lensWeight`:
   name, probability as a big number with a state chip (colour by state),
   lens chips with grades, "For" list (input, value, LR, grade, discounted),
   "Against", "Missing", "Confounded", and "Next tests" with expected shift
   and cost. Each next test has a **Simulate** button: a small inline form
   (value + unit, or "typical positive" / "typical negative" buttons that
   use the discriminator's typical values: put `typicalPos` / `typicalNeg`
   on `Discriminator`) that adds a reading to the overlay, re-runs, and
   shows the delta on every card ("insulin_resistance 0.41 → 0.72").
4. **Path**: the ordered test list with the hypotheses each moves.
5. **Facts & events**: the profile facts and life events the run used, with
   an "Add fact" inline (key, value) and a "Tag draw" inline (metric code,
   confounder tag) that go into the overlay.
6. **Context pack**: sections with token counts; a stacked bar of tokens by
   section at the top; each section collapsible; Deep shows the text.
7. **Generate plan** (button, one LLM call): the plan rendered with the
   existing action cards, and the eval assertions if the scenario is a
   persona (reuse `evals/assert.ts`).
8. **Compare**: a "Pin" button stores the current run; with a pin, the
   page shows a diff column: pillars that changed rank, hypotheses whose
   state changed, path changes, token delta.
9. **Reset overlay**.

Nav: not in the four; reachable from the avatar menu under Data, admin
only.

## 6. Verification

```
command pnpm --filter simple typecheck
command pnpm --filter simple test
```

Browser (admin session is the real user; the page is read-only over
their data and writes only to localStorage): run these and screenshot each
to `/tmp/brain/`:

1. `empty`, female 34: pillars all never, every hypothesis at its prior,
   path = the tier-0 questions and Lp(a)/ApoB/ACR/BP.
2. `user` Razvan, lens lifespan, then lens energy: note the reorder.
3. `sampled` Razvan, mask `panels = ["Lipids"]`: insulin_resistance should
   sit at possible on TG/HDL alone with fasting insulin as next test.
   Simulate "typical positive" insulin → likely; simulate HbA1c 5.0 →
   drops back; record both numbers.
4. `sampled` Ramona, mask `last_draw`: hashimoto and iron_deficiency states,
   then simulate anti-TPO positive, then tTG-IgA positive, watch
   iron_deficiency_cause_gi rise; record numbers.
5. `persona` healthy_male_28: everything ruled_out or unlikely; path short.
6. Token panel for Razvan full: paste the per-section counts.

Report: files changed, tests, the six recorded runs with numbers, the
token table, deviations (expect zero; explain any).
