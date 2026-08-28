# Phase 10: hypothesis knowledge base in Postgres, information-gain next step, the diagnostic tree on /brain

Approved 2026-08-28. Steps 1 to 3 of the architecture agreed in
brainstorming: move the hypothesis catalog into tables (engine unchanged),
choose the next question or test by expected information gain across the
whole differential, and draw the diagnostic tree as a beam search on
`/brain` with simulate-by-branch. Imports (HPO, MONDO, GBD), symptom set,
prices and pgvector are phases 11+.

Everything in `apps/simple`. Migration additive. Ponytail rules; no new
deps. The engine stays pure and testable: the DB is only where the
catalog lives.

## 1. Tables (migration 0006, CREATE only)

```ts
hkb_conditions  { id text pk /* "insulin_resistance", later MONDO ids */, name, summary, management, parent_id text null,
                  burden_daly real null, in_catalog boolean default true, lenses jsonb /* {lifespan:{w,grade},...} */,
                  applies_to jsonb null /* {sex, minAge, maxAge} */, requires jsonb null /* {condition, minState} */,
                  confirm_at_lr_pos real null, pattern_id text null, created_at, updated_at }
hkb_features    { id text pk /* "metric:ferritin" | "derived:tgHdl" | "fact:snoring" | "event:..." | "hypothesis:x" */,
                  kind text /* symptom|sign|lab|derived|fact|event|hypothesis */, name text, unit text null, how_to text null }
hkb_priors      { id uuid, condition_id fk, country text null, sex text null, age_min int null, age_max int null,
                  prevalence real, source text, unique(condition_id, country, sex, age_min, age_max) }
hkb_prior_modifiers { id uuid, condition_id fk, feature_id fk, condition_on jsonb /* {equals|includes|above|below|sex|minAge|maxAge} */,
                  times real, why text, grade text, source text }
hkb_evidence    { id uuid, condition_id fk, feature_id fk, condition_on jsonb /* {above|below|equals|includes|aboveOptimal|belowOptimal|status} */,
                  lr_pos real, lr_neg real null, grade text, source text, population text null,
                  confounded_by jsonb null, status text default 'accepted' /* seed|proposed|accepted|rejected */,
                  created_at, unique(condition_id, feature_id, condition_on) }
hkb_tests       { id text pk /* "fasting_insulin" */, name, feature_ids jsonb /* metric codes */, cost int /* 1..4 */,
                  cost_by_country jsonb null, invasiveness int null, lr_pos real, lr_neg real, typical_pos jsonb null, typical_neg jsonb null,
                  repeatable boolean default false, how_to text null }
hkb_condition_tests { condition_id fk, test_id fk, primary key(condition_id, test_id) }
```

Seed: `lib/hkb-seed.ts` exports the current `HYPOTHESES`, `CONFOUNDERS`
and discriminators as rows; `pnpm --filter simple hkb:seed` upserts them
(idempotent, `ON CONFLICT DO UPDATE`). `lib/hkb.ts` exports
`loadCatalog(): Promise<Catalog>` (cached in module scope for 60 s) that
returns the same `Hypothesis[]` shape the engine consumes today, so
`scoreHypotheses` and its tests do not change. Keep `HYPOTHESES` in
`lib/hypotheses.ts` as the offline fallback used by tests and evals when
no DB is present (`loadCatalog` falls back to it when `DATABASE_URL` is
unset or the tables are empty).

Confounders stay in code (`CONFOUNDERS`); they are 9 rows and rarely change.

## 2. Information gain across the differential (`lib/infogain.ts`)

```ts
export interface Belief {
  id: string;
  p: number;
} // one per catalog condition, plus "other" = 1 - Σ if the catalog is partial (skip for now)
export interface Move {
  kind: "question" | "test";
  featureId: string; // the feature answered or the test's primary feature
  testId?: string;
  cost: number; // questions 0, tests from hkb_tests.cost (later €)
  outcomes: { label: string; prob: number; beliefs: Belief[] }[]; // positive/negative, or per band
  entropyBefore: number;
  entropyAfter: number; // expected
  gain: number; // entropyBefore - entropyAfter
  ratio: number; // gain / max(cost, 0.5)  ponytail: questions are not free of attention; 0.5 keeps them from dominating
  moves: { id: string; from: number; to: number }[]; // expected movement per condition (abs), top 5
}
export function nextMoves(
  m: ModelInput,
  catalog: Catalog,
  opts?: { lens?: Lens; exclude?: string[]; max?: number },
): Move[];
```

Entropy: Shannon entropy over the belief vector treated as independent
binary beliefs (Σ H(p_i)), which is what a naive-Bayes differential is.
Outcome probability for a feature: for a binary test, `P(pos) = Σ_i p_i ·
sens_i + (1 − p_i) · (1 − spec_i)` approximated from LR+ and LR− of the
strongest condition that reads it (ponytail; note it). For an unanswered
question feature, outcomes are its options with P from the same formula.
For a lab with bands, two outcomes: "in optimal" and "out of optimal".
Candidate moves: every unanswered tier-0 fact that any evidence rule
reads, and every `hkb_tests` row whose feature is not measured (or is
repeatable and stale). Score each by simulating both outcomes with
`scoreHypotheses` on a copy of the input (the overlay mechanism from
`lib/sample.ts`). Sort by `ratio`; ties by gain.

`runBrain` replaces the per-hypothesis `path` with `nextMoves(...).slice(0, 10)`
and keeps per-card next tests as they are. Unit tests: a two-condition
fixture where the shared cheap test has higher ratio than the
condition-specific expensive one; a question that splits the differential
outranks a test that only confirms the leader; excluded features are not
proposed.

## 3. The tree (`lib/tree.ts` and the `/brain` panel)

```ts
export interface TreeNode {
  id: string;
  depth: number;
  mass: number; // probability of reaching this node
  beliefs: Belief[]; // top 8 + "rest"
  chosen?: Move; // the move taken from this node
  branches: { label: string; prob: number; child: TreeNode }[];
  stop?: "likely" | "confirmed" | "exhausted" | "pruned";
}
export function buildTree(
  m: ModelInput,
  catalog: Catalog,
  opts: {
    depth: number /* default 4 */;
    prune: number /* default 0.05 */;
    lens?: Lens;
    budget?: number;
  },
): TreeNode;
```

Beam: at each node take the top move by ratio, branch on its outcomes,
recurse with the overlay extended by the outcome (typical_pos /
typical_neg values or the question's option), stop when any condition
passes 0.75, when no move has gain > 0.01, when depth is reached, or when
`mass < prune`. Deterministic; no LLM.

Panel on `/brain`, above Hypotheses, titled "Path": columns left to right
by depth. Node = a small card with the top 5 conditions as horizontal bars
(probability, colour by state) and "rest"; the chosen move as the card
title with cost chip; outcome branches as labelled connectors to the next
column with width proportional to `prob` (SVG connectors, reuse the
measuring approach from `components/graph-map.tsx`). Clicking a branch
applies its outcome to the overlay (same as Simulate) and re-runs, so the
branch becomes the new root; a breadcrumb shows the taken outcomes with
an undo. The "stop" reason renders as a chip on leaf nodes. Simple view
shows depth 2, Deep shows the full tree. Width overflow scrolls
horizontally.

## 4. `/brain` additions

- Scenario bar gains **Budget** (number, optional): when set, moves with
  `cost` above the remaining budget are excluded and the tree shows
  "budget reached" as a stop.
- Hypothesis cards: unlikely and ruled_out collapse into one footer line
  "N unlikely, M ruled out (show)". Cards show a "why in the catalog"
  line: `burden_daly` and prior source when present, else "seed".
- "Compare" (pin) keeps working with the new path.

## 5. Verification

```
command pnpm --filter simple typecheck
command pnpm --filter simple test
command pnpm --filter simple db:generate && command pnpm --filter simple db:migrate   # CREATE only
command pnpm --filter simple hkb:seed        # run twice; second run changes nothing
```

Then, logged in as the admin (read-only over data; overlay only in
localStorage), screenshots to `/tmp/brain10/`:

1. `empty` female 34: the first column must be questions; report the top
   5 moves with gain and ratio.
2. `sampled` Ramona `last_draw`: the tree's root chosen move and its two
   branches with the belief bars; click the positive branch of the first
   test and confirm the breadcrumb and the re-rooted tree.
3. `user` Razvan, budget 2: which tests get excluded.
4. `persona` healthy_male_28: tree is a single node with stop "exhausted".
5. Paste the eight conditions' rows from `hkb_conditions` and the evidence
   count per condition from `hkb_evidence`, to prove the engine now reads
   the DB (temporarily change one LR in the DB via SQL, re-run, see the
   probability move, then restore it).

Report: files changed, all outputs, screenshots, deviations (expect zero;
explain any).
