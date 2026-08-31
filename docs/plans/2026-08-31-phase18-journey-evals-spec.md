# Phase 18: journey evals, from start to discovery, 0–100

Owner ask (2026-08-31): "do some testing like evals and present them in
the app so I can select and analyse them; make it clear, state 1–100 from
start to discovery." Everything in `apps/simple`. No new deps. Admin
only. Ponytail.

## 1. What a journey is

A **journey** is a scripted person with a hidden truth, run through the
engine step by step where **the engine chooses every step itself**
(the top information-gain move under an optional budget), and the world
answers from the hidden truth. We record, per step, the whole belief
vector. The result is a curve from the starting prior to the moment the
true condition crosses "likely", plus everything that went wrong on the
way (false alarms, wasted euros, questions that did not move anything).

```ts
// evals/journeys/<id>.json
{
  "id": "hashimoto_from_scratch_f34_ro",
  "title": "Hashimoto's from an empty account, woman 34, Romania",
  "start": { "facts": { "sex": "female", "birth_year": 1992, "country": "RO" }, "readings": [] },
  "truth": {
    "conditions": ["hashimoto", "iron_deficiency"],            // what she really has
    "answers": { "sym_energy": "Yes", "sym_cold": "Yes", "family_history": "mother hypothyroid", "sym_cycle": "Heavy", "sleep_snoring": "No" },
    "labs": { "tsh": 3.9, "free_t4": 1.1, "tpo_antibodies": 320, "ferritin": 18, "hemoglobin": 12.8, "vitamin_d": 19,
              "glucose": 84, "hba1c": 5.1, "insulin": 5, "ldl_cholesterol": 105, "hdl_cholesterol": 62, "triglycerides": 70, "crp": 0.8 },
    "defaultAnswer": "No", "defaultLab": "typicalNeg"           // anything not listed: negative / in range
  },
  "budget": 120,                                                // euros, optional
  "maxSteps": 12,
  "expect": { "discover": ["hashimoto", "iron_deficiency"], "withinSteps": 8, "withinEur": 80, "noFalseLikely": true }
}
```

Ten journeys to start: the six existing personas rewritten as journeys
(healthy_male_28 must _never_ discover anything and must stop
"exhausted" within 4 steps), plus: Hashimoto's from scratch (above),
LMHR man 38 (truth: no disease; expect ApoB, Lp(a), CAC ordered and
`ascvd_risk` staying under likely), iron deficiency with a gut cause
(coeliac positive) for a man of 45, and haemochromatosis via a
pathognomonic ferritin (ring-2 wake path: the truth includes ferritin
1200 twice; expect the wake within 2 steps).

## 2. Runner (`lib/journey.ts`, pure over the engine; `evals/journeys.ts` CLI)

```ts
export interface JourneyStep {
  n: number;
  move: Move;
  outcome: string;
  costEur: number;
  cumEur: number;
  beliefs: Record<string, number>;
  woken: string[];
  note?: string;
}
export interface JourneyResult {
  id: string;
  steps: JourneyStep[];
  discoveredAt: Record<string, number | null>;
  falseLikely: { id: string; step: number; p: number }[];
  totalEur: number;
  stop: "discovered" | "exhausted" | "budget" | "maxSteps";
  pass: boolean;
  failed: string[];
}
export async function runJourney(
  j: Journey,
  catalog?: Catalog,
): Promise<JourneyResult>;
```

Loop: build `ModelInput` from start + overlay → `scoreHypotheses` →
record → `nextMoves` (budget-aware) → take the first move → answer it
from `truth` (question: `answers[key]` or `defaultAnswer`; test: for
every code in the test's `feature_ids`, `labs[code]` if present, else
the discriminator's `typical_neg`) → apply to the overlay → run wake
checks (`wakeConditions` on the overlay input, in memory, no DB
writes) → repeat until all `expect.discover` are ≥ 0.6, or no move has
gain ≥ 0.01, or budget, or maxSteps. `pass` = every expectation met.
Deterministic; no LLM. Reuse `evals/persona.ts`, `lib/sample.ts`
overlay, `lib/infogain.ts`, `lib/wake.ts` (add an in-memory mode if it
only writes to the DB today).

CLI: `pnpm --filter simple eval:journeys [id ...]` prints a table
(steps, €, discovered at, false likely, pass) and writes
`evals/results/journeys-<date>.json`. Vitest: two journeys run offline
in the suite as regression (hashimoto_from_scratch passes; healthy never
discovers).

## 3. The view: `/brain` → "Journeys" tab (admin)

Top: a **select** of journeys (title, pass/fail chip, steps, €), a
"Run all" button (server route, results cached in `hkb_import_runs`-style
table `journey_runs { id, journey_id, ran_at, kb_revision, result jsonb }`
so history is kept and a change in the knowledge base shows as a change
in the curve), and a "compare with previous run" toggle.

Main panel, one journey:

1. **Discovery track, 0–100.** A horizontal band per condition that ever
   exceeds 5 % or is in `expect.discover`: x = step (0 … n), y = 0–100 %,
   drawn as a stepped line with the state bands shaded behind (ruled
   out < 5, unlikely < 25, possible < 60, likely < 90, confirmed). The
   true conditions are solid and coloured; every other condition is a
   thin grey line; a false alarm (a non-true condition crossing 60)
   turns red at the crossing. A vertical marker where each true
   condition crosses 60 with "discovered at step N, €X".
2. **Step strip** under the track: one card per step in order: the move
   (question or test, cost), the answer the world gave, and the top
   three belief movements at that step (`insulin_resistance 30 → 12`),
   plus any wake ("woke haemochromatosis: ferritin 1200 twice"). Hover
   or tap a step highlights its column on the track.
3. **Verdict box**: pass/fail with each expectation on its own line
   (discovered within 8 steps: yes, 6; within €80: yes, €52; no false
   likely: no, `ascvd_risk` hit 61 % at step 4), total euros, stop
   reason, kb revision.
4. **Budget slider** (0 to 300 €) and **"what if"** toggles per truth
   fact (flip an answer, re-run in place) so the owner can probe the
   path without editing JSON.

All numbers come from `JourneyResult`; the page draws them with the
same SVG helpers as `graph-map.tsx` (no chart library).

## 4. Home tie-in (small)

Nothing user-facing changes. The journeys are the regression suite for
"does the €40 path find the needle"; a failing journey is what tells us
a knowledge-base change broke discovery.

## 5. Verification

typecheck, tests (two journeys in the suite), `eval:journeys` over all
ten with the table pasted, screenshots of the Journeys tab for
`hashimoto_from_scratch_f34_ro`, `healthy_male_28`, and the
haemochromatosis wake journey to `/tmp/p18/`, plus one "what if" flip
(set `tpo_antibodies` to 5 in the Hashimoto journey and show the curve
change). Report files changed, outputs, deviations.
