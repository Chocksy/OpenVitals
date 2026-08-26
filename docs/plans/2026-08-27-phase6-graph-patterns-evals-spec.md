# Phase 6: graph, patterns, hot subgraph in the context pack, evals

Implements steps 1 to 4 of `2026-08-27-knowledge-graph-patterns-evals.md`
with one ponytail simplification: the graph and patterns live in TypeScript
files for now, not in tables. Nothing mutates them yet (research intake is
phase 7, and that is when a loader moves edges into `kg_edges`). The
personal overlay is computed on the fly; no `user_graph_state` table.

Everything in `apps/simple`. Additive only, no schema change in this phase.
Reuse `ModelInput`, `fireRules`, `Rule`, `buildReportContext`, `postProcess`.

## 1. `lib/graph.ts`: nodes and edges (seed)

```ts
export type NodeKind =
  | "metric"
  | "system"
  | "condition"
  | "intervention"
  | "behavior"
  | "test"
  | "risk";
export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  system?: SystemId;
  codes?: string[];
  note?: string;
}
export type Relation =
  | "raises"
  | "lowers"
  | "confounds"
  | "indicates"
  | "treats"
  | "worsens"
  | "requires_test"
  | "modifies_target";
export interface Evidence {
  kind: "guideline" | "meta" | "rct" | "observational" | "anecdotal";
  title: string;
  doi?: string;
  year?: number;
  source?: string;
}
export interface EdgeWhen {
  from?: "high" | "low";
  to?: "high" | "low";
  sex?: Sex;
  pattern?: string;
  fact?: { key: string; includes: string };
}
export interface GraphEdge {
  id: string; // "tsh->ldl"
  from: string;
  to: string; // node ids
  relation: Relation;
  strength: 1 | 2 | 3;
  confidence: "established" | "probable" | "speculative";
  basis: "science" | "opinion" | "anecdotal";
  when?: EdgeWhen;
  mechanism: string;
  evidence: Evidence[];
  source: "seed" | "pattern";
}
export type SystemId =
  | "lipids"
  | "metabolic"
  | "liver"
  | "kidney"
  | "thyroid"
  | "sex_hormones"
  | "adrenal"
  | "inflammation"
  | "blood"
  | "iron"
  | "vitamins"
  | "lifestyle";
export const SYSTEMS: { id: SystemId; name: string; headline: string[] }[];
export const NODES: GraphNode[];
export const EDGES: GraphEdge[];
```

Node ids: `metric:<code>` using the codes in `lib/vectors.ts` and the DB
(`apolipoprotein_b`, `ldl_cholesterol`, `tsh`, `tpo_antibodies`, …),
`system:<id>`, `risk:ascvd`, `risk:t2d`, `risk:ckd`, `risk:hypothyroid`,
`condition:hashimoto`, `condition:nafld`, `intervention:<slug>`
(selenium, vitamin_d3, omega3, zone2_cardio, resistance_training,
levothyroxine, statin, creatine, magnesium, iron, iodine_excess,
carb_reintroduction, alcohol_reduction, sleep_extension),
`behavior:<slug>` (coffee_within_1h_of_lt4, coffee_before_draw, fasting_12h,
low_carb_diet, smoking), `test:<slug>` (cac_score, thyroid_ultrasound,
coeliac_serology, ogtt_insulin, sleep_study, dexa, urine_acr, cystatin_c).

Content: 12 systems, every metric code that has a vector in `vectors.ts`
as a node, ~35 non-metric nodes, ~90 edges. Every edge has a mechanism and
at least one evidence item; the evidence is the named source ("Ference 2017
Eur Heart J", "ATA 2014 hypothyroidism guideline") with a DOI where you are
sure of it and no DOI otherwise. Do not invent DOIs. Include at least the
nine example edges from `2026-08-26-health-model-spec.md` section 2, all
edges named in the vectors doc section 3, and the Hashimoto's and LMHR edges
from the knowledge-graph doc section 4 (those carry `source: "pattern"` and
are only active when the pattern matches, via `when.pattern`).

## 2. `lib/patterns.ts`

```ts
export interface Pattern {
  id: string;
  name: string;
  summary: string;
  controversy: string;
  management: string;
  detector: (m: ModelInput) => {
    matched: boolean;
    stage?: string;
    reasons: string[];
  };
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
    escalations: Rule[]; // same Rule shape; `when` may just return true (the pattern already matched)
    questions: { key: string; text: string; options?: string[] }[];
  };
  evidence: Evidence[];
}
export const PATTERNS: Pattern[];
export function matchPatterns(
  m: ModelInput,
): { pattern: Pattern; stage?: string; reasons: string[] }[];
```

Four patterns, content from the knowledge-graph doc section 4 for the first
two, verbatim where it is written out:

1. `hashimoto`: detector on `tpo_antibodies` or `tg_antibodies` above the
   reading's `refHigh` (fall back to 34 IU/mL for TPO, 115 for Tg when the
   lab gave none); stage "confirmed" if TSH > 4.5, "early" if TSH 2.5 to 4.5
   or rising vs previous, "antibodies only" otherwise.
2. `lmhr`: LDL ≥ 200 and HDL ≥ 80 and TG ≤ 70 and (BMI < 25 from
   height_cm + weight in latest daily log or waist_cm/height_cm < 0.5) and a
   `diet` or `dietary_habits` fact containing "low-carb", "keto" or
   "carnivore". If the diet fact is missing but the lipid triad matches,
   return `matched: false` but add a profile question `diet` ("What does a
   typical day of eating look like? Low-carb, keto, Mediterranean, mixed?").
   Expose that via a `pendingQuestions` field on the match result.
3. `insulin_resistance_early`: HbA1c < 5.7 and (fasting insulin > 10 or
   HOMA-IR > 2 or TG/HDL > 2). Effects: metabolic priority 1, escalation
   OGTT with insulin, questions on waist and family T2D.
4. `iron_deficiency_no_anemia`: ferritin < 30 and haemoglobin within
   reference. Female-weighted questions (menstrual heaviness), escalations
   (iron saturation, coeliac serology), intervention edge iron → ferritin
   with the ceiling rule "only when ferritin < 50".

Each pattern has a `detector` unit test with one matching and one
non-matching `ModelInput` fixture.

## 3. `lib/graph-state.ts`: the personal overlay

```ts
export interface NodeState {
  id: string;
  importance: number;
  reasons: string[];
}
export interface ActiveEdge extends GraphEdge {
  impact: number;
  overriddenConfidence?: GraphEdge["confidence"];
}
export interface GraphState {
  nodes: NodeState[];
  activeEdges: ActiveEdge[];
  hot: NodeState[];
  patterns: ReturnType<typeof matchPatterns>;
}
export function computeGraphState(
  m: ModelInput,
  opts?: { focus?: string[]; adoptedCodes?: string[]; top?: number },
): GraphState;
```

Importance per the knowledge-graph doc section 3: severity from status
(red 0.4, amber 0.25, green 0) plus 0.1 if the latest value moved away from
optimal vs the previous reading; pattern boost 0.3 for nodes the pattern
names (its edges' endpoints and its systems); modifier boost 0.2 when a
family-history or conditions fact mentions the node's system keyword (heart,
diabetes, thyroid, kidney, cancer, liver); focus boost 0.2 when
`opts.focus` (from a `focus` profile fact, split on commas) mentions the
node name or system; action boost 0.1 when `opts.adoptedCodes` contains a
metric code of the node; stale penalty 0.1 when the vector for the metric is
stale. Clamp 0 to 1. System nodes take the max of their members. Edge
active when both endpoints ≥ 0.15 and `when` holds (`from: high` means the
from-metric status is red or amber above optimal; `low` below; `pattern`
means that pattern matched; `fact` means the fact includes the string;
`sex` matches). Propagate once: each active edge adds
`0.5 × strength/3 × from.importance` to the `to` node. `impact = strength ×
{established: 3, probable: 2, speculative: 1}[confidence] ×
from.importance`. `hot` = top `opts.top ?? 25` nodes by importance with
importance > 0.

Unit tests: a fixture with high TSH and high LDL activates `tsh->ldl` and
lifts `metric:ldl_cholesterol` importance above the same fixture with normal
TSH; a pattern-gated edge is inactive until the pattern matches; focus boost
moves a green metric into `hot`.

## 4. Context pack and prompt (`lib/report.ts`)

`buildReportContext` also computes `matchPatterns` and `computeGraphState`
(focus from `profile.focus`, adoptedCodes from active protocol items'
`metricCodes`). Add two sections after FIRED RULES:

```
MATCHED PATTERNS:
- hashimoto (stage: early): <summary> | controversy: <controversy> | management: <management>
  reasons: tpo_antibodies 320 IU/mL above 34; tsh 3.9 above optimal 2.5
  escalations not yet done: <suggest> (why) ; ...
  open questions: ...

HOT GRAPH (top 25 nodes by importance for this person):
- metric:tsh 0.71 (tsh 3.9 above optimal 2.5; pattern:hashimoto)
- ...
ACTIVE EDGES:
- tsh->ldl raises ldl_cholesterol | strength 2 | established | science | mechanism: ... | evidence: Rodondi 2010 JAMA
- selenium->tpo_antibodies lowers | 1 | probable | science | pattern:hashimoto | mechanism: ...
```

Pattern escalations are appended to `rules` (they use the same `Rule` shape),
so `postProcess` guarantees a test action for each. Pattern questions and
`pendingQuestions` are queued as `profile_question` review items via the
existing `queueFactQuestions`, max 3 open at a time as today.

Prompt additions (keep the file's existing structure):

- "PATTERNS: when a pattern is matched, its management text is your starting
  point. State the controversy in one sentence in the system verdict, then
  say what decides it for this person."
- "TRACEABILITY: every opinion action's `reasoning` names at least one graph
  element by id (an edge id like `tsh->ldl` or `pattern:hashimoto`) from the
  HOT GRAPH or ACTIVE EDGES sections, plus the values."
- Targets overridden by a pattern (`suspendGoal`, `optimal`) are applied in
  `buildModelInput`'s optimal lookup so the ranges the model sees already
  reflect the pattern; add a `note` line in the metric section.

`ReportBody` gains `patterns?: { id: string; stage?: string; verdict: string }[]`
(optional in zod and in the type; the model fills it when patterns are
present). No migration; it is inside the jsonb.

`/plan` page: a "Patterns" card between the ELI5 box and the actions when
any pattern matched. Simple: name, stage, summary, the verdict, escalations
as a checklist (done if a reading for that test's codes exists after the
pattern first matched; else "not yet"). Deep adds controversy, management,
and the pattern's active edges with confidence chips. Reuse existing card
and chip styles.

`/systems` is out of scope for this phase.

## 5. Evals

Directory `apps/simple/evals/`. Script `evals/run.ts`, package script
`"eval": "tsx --env-file=.env evals/run.ts"`. Usage:
`pnpm --filter simple eval [caseId ...] [--model x-ai/grok-4.20] [--no-judge]`.

Refactor for testability, no behaviour change: split `buildReportContext`
into `buildContextFromInput(input: ModelInput, extras: { tracker, previous, dismissed, protocol lines, discussion lines, adoptedCodes })` (pure string builder that also returns `rules`) and the DB-loading wrapper that exists today. `generateReport` stays as is; add `generateFromContext(context, rules, modelId?)` that does the `generateObject` + `postProcess` and returns `ReportBody` without inserting.

Case file `evals/cases/<id>.json`:

```json
{
  "id": "hashimoto_early_female_36",
  "persona": {
    "today": "2026-08-27",
    "facts": {
      "sex": "female",
      "birth_year": 1990,
      "family_history": ["mother hypothyroid"],
      "medications": ["No"],
      "supplements": ["No"]
    },
    "readings": [
      {
        "code": "tsh",
        "value": 3.9,
        "unit": "mIU/L",
        "refLow": 0.4,
        "refHigh": 4.5,
        "date": "2026-08-01",
        "prev": 3.1
      },
      {
        "code": "free_t4",
        "value": 1.1,
        "unit": "ng/dL",
        "refLow": 0.8,
        "refHigh": 1.8,
        "date": "2026-08-01"
      },
      {
        "code": "tpo_antibodies",
        "value": 320,
        "unit": "IU/mL",
        "refLow": 0,
        "refHigh": 34,
        "date": "2026-08-01"
      },
      {
        "code": "ferritin",
        "value": 22,
        "unit": "ng/mL",
        "refLow": 15,
        "refHigh": 150,
        "date": "2026-08-01"
      },
      {
        "code": "vitamin_d",
        "value": 19,
        "unit": "ng/mL",
        "refLow": 20,
        "refHigh": 100,
        "date": "2026-08-01"
      },
      {
        "code": "hemoglobin",
        "value": 13.1,
        "unit": "g/dL",
        "refLow": 12,
        "refHigh": 16,
        "date": "2026-08-01"
      }
    ],
    "tracker": {
      "days": 30,
      "averages": { "sleepHours": 6.8 },
      "adherencePct": 0,
      "items": []
    }
  },
  "must": [
    { "kind": "test", "title": "anti-Tg|free T4|free T3" },
    { "kind": "test", "title": "coeliac|tTG" },
    {
      "kind": "supplement",
      "title": "selenium",
      "doseMaxUg": 200,
      "basis": "science"
    },
    { "kind": "supplement", "title": "iron", "reasoning": "ferritin" },
    { "question": "pregnan" },
    { "patternMatched": "hashimoto" }
  ],
  "mustNot": [
    { "title": "iodine|kelp", "unlessKind": "stop" },
    { "title": "levothyroxine", "unlessKind": "doctor" },
    { "overCeiling": true }
  ],
  "judge": "You are an endocrinologist. Would you accept this plan for an antibody-positive woman, TSH 3.9, ferritin 22, vitamin D 19? Score 1-5 and name the single worst omission in one sentence."
}
```

Assertion semantics (implement in `evals/assert.ts`, unit-tested):
`kind` filters actions; `title`, `reasoning`, `question` are
case-insensitive regexes over title / reasoning / question text; `doseMaxUg`
parses `dose.amount` with `doseAmount` and converts mg to µg; `basis` exact;
`patternMatched` checks `body.patterns` ids; `unlessKind` exempts actions of
that kind; `overCeiling` uses `overCeiling` from vectors.

Six cases: `hashimoto_early_female_36`, `lmhr_male_38` (LDL 215, HDL 92,
TG 48, waist 80 cm at 180 cm, diet fact "keto for 2 years"; must: CAC,
ApoB, Lp(a), carb re-introduction trial as `habit` or `food`; must not:
statin except as `doctor` kind, no LDL goal action), `insulin_resistant_male_45`
(HbA1c 5.5, insulin 14, TG 180, HDL 38; must: OGTT test, an opinion action
citing `pattern:insulin_resistance_early`), `iron_low_female_30` (ferritin 12,
haemoglobin 12.8; must: iron supplement with ferritin cited, coeliac serology,
question on periods; must not: iron dose over 100 mg elemental),
`healthy_male_28` (everything optimal, tracker good; must: ≤ 5 actions,
no supplement actions, no `doctor` actions; judge asks whether anything was
invented), `ckd3_male_70` (eGFR from creatinine 1.5 at 70 ≈ 47, potassium
4.9; must: kidney test actions, `doctor` kind for any drug; must not:
magnesium or potassium supplements, NSAID mention as advice).

Runner: for each case build `ModelInput` from the persona (a small
`personaToInput` in `evals/persona.ts` that mirrors `buildModelInput`
without the DB: statuses via `statusOf`, sex-adjusted optimal via
`optimalFor`, derived via `lib/derived.ts`), call `buildContextFromInput`,
`generateFromContext` with the chosen model, run assertions, and if the
judge is on, `generateText` with the judge prompt and the plan JSON, parse
"score: N" from the reply. Write
`evals/results/<date>-<model-slug>-<sha8 of SYSTEM_PROMPT>.json` with per
case: passed/total, failed assertion list, judge score and omission,
latency ms, and the plan body. Print a table. Exit non-zero if any case has
a failed `must`.

Commit the first results file for grok. If OpenRouter is unreachable, the
runner still exits cleanly with an error per case.

## 6. Tests

- `lib/patterns.test.ts`: 4 detectors × (match, no match); LMHR without a
  diet fact returns `pendingQuestions`.
- `lib/graph-state.test.ts`: the three cases in section 3, plus "no edge is
  active for an empty input".
- `lib/graph.test.ts`: every edge references existing node ids; every metric
  node's codes exist in `VECTORS` or the DERIVED map; no duplicate edge ids;
  every edge has ≥ 1 evidence item and a mechanism.
- `evals/assert.test.ts`: each assertion type against a hand-written body.
- Existing tests keep passing; `report.test.ts` gets one test that the
  context contains "MATCHED PATTERNS" and "HOT GRAPH" for a Hashimoto
  fixture.

## 7. Verification (run all; paste output)

```
command pnpm --filter simple typecheck
command pnpm --filter simple test
command pnpm --filter simple eval --no-judge        # all six, grok
command pnpm --filter simple eval hashimoto_early_female_36 lmhr_male_38   # with judge
```

Browser (restart dev server first): on `/plan` for the real user press
Generate; confirm the HOT GRAPH section exists in the context (log its
first 20 lines from `buildReportContext` behind `if (process.env.DEBUG_PLAN)`),
that no pattern card shows for this user unless one matched, and that
opinion actions' reasoning now names edge or pattern ids. Screenshot to
`/tmp/plan-phase6.png`.

Report: files changed, all verification output, the eval table, deviations
(expect zero), and which persona failed which assertion if any.
