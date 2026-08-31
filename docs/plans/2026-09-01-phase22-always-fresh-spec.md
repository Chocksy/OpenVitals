# Phase 22: always fresh — staleness, the trends inbox, the guideline watch, your own effect sizes

Owner ask (2026-09-01): "in reality all should be constantly updated,
because we also suggest lifestyle changes — sardines is popular now so
it can be a suggestion." Everything in the knowledge base gets a shelf
life; popular claims get a door in, a label, and a measurement plan.
Everything in `apps/simple`. No new deps. Ponytail. Principles 2
(everything enters, everything is labelled) and 6 (evals before
opinions) are the whole design.

## 1. Staleness-driven scheduling (`lib/freshness.ts`, pure)

Today `thinnestConditions` picks by row count plus the CONTESTED
appendix (21b). Generalise: every ring-1 condition gets a freshness
score and the monthly run takes the stalest.

```ts
export type RefreshClass = "contested" | "horizon" | "pooled" | "guideline";
export const REFRESH_DAYS: Record<RefreshClass, number> = {
  contested: 0, // always stale (the 21b CONTESTED list)
  horizon: 90, // D/E rows and trend claims: popularity moves fast
  pooled: 365, // pooled RCT effects: a year between looks
  guideline: 730, // guideline-anchored rules: they move on revision cycles
};
export function conditionClass(
  rows: { grade: string; sources?: unknown }[],
  contested: Set<string>,
  id: string,
): RefreshClass;
export function staleness(
  lastLookedAt: string | null,
  cls: RefreshClass,
  today: string,
): number; // daysSince / refreshDays; null or <3 rows = Infinity
export function pickConditions(
  all: ConditionFreshness[],
  n: number,
): ConditionRef[];
```

`lastLookedAt` comes from `hkb_import_runs` (the last research run that
covered the condition), falling back to the newest `hkb_evidence.created_at`
for it. A condition with fewer than 3 accepted rows is infinitely stale,
so the thin-first behaviour survives as a special case. `conditionClass`
is the _most volatile_ class present among the condition's rows
(contested list wins, then any D/E row, then any pooled row, then
guideline). `withContested` from 21b folds into this: contested ids get
class `contested` and therefore always rank first. `scripts/hkb-research.ts`
replaces its pick with `pickConditions`; the CLI prints each pick with
its class and staleness score so `/hkb` Activity explains itself.

Locks: pure tests for class assignment, the Infinity cases, pick order
(contested first, then by score, dedupe), and that a fresh run resets
the score.

## 2. The trends inbox (sardines get a door)

A popular claim does not need to be true to enter; it needs to be
labelled and testable.

**Intake, two mouths, one pipe:**

- **`/hkb` "Drop a claim" box** (admin window, next to the ask box
  pattern): free text, e.g. "sardines are everywhere right now — omega-3,
  protein, low mercury, people eat 3 tins a week".
- **The composer**: `understandRules` gets a `claim` chip kind for
  hearsay phrasing ("I heard/read/saw that X does Y", "everyone is
  doing X") — the sentence is about the world, not the person, so it
  must NOT write a fact; it routes to the same pipe. The chip renders
  as `CLAIM · sardines → triglycerides`.

**The pipe (`lib/trends.ts`):**

```ts
export interface Claim {
  text: string;
  intervention: string; // "sardines, ~3 tins a week"
  markers: string[]; // ["triglycerides", "omega_3_index"]
  direction: "down" | "up";
  sourceKind: "podcast" | "social" | "article" | "friend" | "unknown";
}
export async function extractClaim(text: string): Promise<Claim | null>; // LLM, documents.ts style: closed marker codes, verbatim quote, null when it is not a claim
export async function fileClaim(claim: Claim): Promise<FiledClaim>;
```

`fileClaim` does two things, and this split is the point:

1. **The science part**: run the existing intervention research
   (`researchInterventions`) for the mechanism pair the claim implies
   (EPA/DHA → triglycerides). Whatever comes back flows through the
   normal policy: graded, pooled, auto-accepted by grade. If the
   literature already has the row (omega-3 lowers TG, grade A,
   ~15–30 %), nothing new is invented — the claim just made the engine
   look.
2. **The claim itself**: an `hkb_interventions` row for the _specific
   popular form_ ("sardines ~3 tins/week"), grade **E**, basis
   **anecdotal**, status **horizon**, with the claim text as the quote,
   `sourceKind` in `population`, and a measurement plan derived from
   the marker (retest interval from `RETEST_WEEKS`, the marker's good
   direction from `BETTER_LOW`/`BETTER_HIGH`). Horizon rows never touch
   probabilities (existing policy) — this row exists so the suggestion
   can be _shown, labelled, adopted and measured_.

**Where it surfaces:** `/plan` gets a small **Horizon shelf** ("Popular
right now — labelled, unproven, measurable"): name, the label chips
(anecdotal · E · from a podcast), the science neighbour when one exists
("the omega-3 inside it: grade A for triglycerides"), and Adopt. Adopting
creates a protocol item and a projection; when the pair has no effect
size the projection already says so and queues research (phase 19
behaviour). The sardines suggestion is therefore: adopt → expect TG
direction from the graded omega-3 row, the sardine-specific form stays
anecdotal → retest in 8 weeks → better/as-expected/worse. Popularity
enters, the label never lies, the draw decides.

Locks: `evals/trends/cases.json` + `eval:trends` CLI (5 claims: sardines;
"berberine is nature's ozempic"; "cold plunges fix cortisol"; one
non-claim that must return null; one claim about a marker we do not
track, which files with `markers: []` and no projection). Each case
asserts the split: which part lands as graded science, which as horizon
E. A policy unit test that a horizon row STILL never reaches
`scoreHypotheses` even when adopted. Compose test: the hearsay sentence
produces a claim chip and zero fact writes.

## 3. The guideline watch

Quarterly, `hkb:research --guidelines`: for each ring-1 condition,
Europe PMC search restricted to publication-type guideline/practice
guideline/consensus since the last watch run. A hit does NOT change
anything by itself: it lands as an `hkb_evidence`-adjacent review row
(`status: "review"`, `needs_look: true`, the paper attached, note
"guideline watch: check gates and thresholds for <condition>") so it
shows on `/hkb` with the existing needs-look surfacing. Gates and
thresholds live in code and change with eyes on them — this is the
mechanism that makes sure the eyes are called.

Locks: unit test on the search-window arithmetic (since last watch run,
from `hkb_import_runs`), and that a hit writes a review row and touches
no accepted row. No live LLM needed — the watch is search + filing.

## 4. Your own effect sizes (`lib/personal-effects.ts`, pure)

`intervention_outcomes` already stores predicted vs observed per pair.
Fold repeated personal outcomes back into the person's own projections:

```ts
/** Empirical-Bayes multiplier toward 1: with n resolved outcomes for the
 *  pair averaging ratio r = observed/predicted, personal = 1 + (r−1)·n/(n+2),
 *  clamped to [0.25, 4]. Needs n ≥ 2; adherence-weighted mean of r. */
export function personalMultiplier(
  outcomes: { predicted: number; observed: number; adherence: number }[],
): { times: number; n: number } | null;
```

`project()` applies it per contribution with an assumption line the
card shows: "your own last 2 responses ran 1.6× the literature (n=1
evidence, weighs nothing outside your projections)". Basis label `n=1`.
It moves projections only — never beliefs, never the shared knowledge
base.

Locks: `personal-effects.test.ts` (shrinkage at n=2 vs n=5, the clamp,
null under 2 outcomes, adherence weighting); a `projection.test.ts` case
asserting the assumption line and the multiplied delta; the test user
has resolved sugar/walking outcomes, so `/m/hba1c` should show the line
live.

## 5. Verification

typecheck; vitest (≥ 875, plus the new suites); `eval:journeys` 25/25;
`eval:compose` (hearsay case added); `eval:trends` all passing with the
science/horizon split printed; one live filing of the sardines claim
end-to-end with `--max-papers 3` (budget-capped) pasted into the report;
screenshots to `/tmp/p22/`: the /hkb claim box with the filed result,
the /plan Horizon shelf with the sardines row and its labels, a
projection card showing the personal-multiplier assumption line. Report
files changed, the exact extraction schema and prompt, command outputs,
deviations, open questions.
