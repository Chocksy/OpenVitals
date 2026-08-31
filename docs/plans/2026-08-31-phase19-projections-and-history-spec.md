# Phase 19: projections with expectation, and the history of a person as a path

Owner ask (2026-08-31): show that facts and interview history are properly
kept and used; when someone changes behaviour (less sugar, more protein,
weight down, walking) or takes something, project where a marker should
land by the next draw, then compare projection with the real result and
let that play out as a path. Make it feel like being on the right track.
Everything in `apps/simple`. No new deps. Ponytail. ROADMAP principles.

## 1. What a projection is

For a marker with a target (HbA1c 6.0, goal < 5.7) and a set of adopted
actions (protocol items linked to interventions), the engine predicts
the value at a horizon using the intervention effect sizes already in
`hkb_interventions` (effect, direction, duration, grade), combined
additively in the marker's unit with grade shrink (A/B full, C half, D/E
excluded), bounded by physiology (a `MAX_CHANGE` per marker per 12 weeks
in a small table, sourced), and an uncertainty band from the grades.

```ts
// lib/projection.ts (pure, tested)
export interface Projection {
  code: string;
  unit: string;
  from: number;
  fromDate: string;
  horizonWeeks: number;
  expected: number;
  low: number;
  high: number;
  contributions: {
    intervention: string;
    delta: number;
    grade: Grade;
    source: string;
    adherence?: number;
  }[];
  assumptions: string[]; // "assumes 80 % adherence (last 30 days: 74 %)", "HbA1c reflects ~12 weeks"
  retestAt: string; // the date the marker can be judged (HbA1c 12 w, ferritin 12 w, lipids 8 w, TSH 6 w, insulin 6 w)
}
export function project(marker, actions, adherence, horizonWeeks): Projection;
```

Adherence comes from `habit_logs` / protocol adherence (exists) and
scales each contribution. When the intervention table has no effect
size for a pair (e.g. "walk after meals → HbA1c") the projection says so
and the research job is queued for that pair (`hkb:research --effects
<intervention> <marker>`), so gaps fill themselves.

Storage: `projections { id, user_id, code, made_at, horizon_weeks,
expected, low, high, contributions jsonb, assumptions jsonb, retest_at,
resolved_value real null, resolved_at date null, verdict text null
/* better | as_expected | worse | unmeasured */ }` (migration, CREATE).
A projection is made when an action is adopted or its adherence changes
materially (±20 %), and re-made monthly until resolved. Resolution: the
next reading of that marker after `retest_at − 2 weeks` sets
`resolved_value` and the verdict by the band (inside band → as expected;
better than `low`/`high` in the good direction → better; else worse).
Each resolution also writes a `calibration_events`-style row for the
intervention pair (`intervention_outcomes { pair, predicted_delta,
observed_delta, adherence }`) so effect sizes can later be pooled with
the person's own history.

## 2. The history as a path (the showcase)

`/history` becomes a timeline with three lanes: **facts** (with
`changed` / `corrected` markers and the value before and after),
**actions and adherence** (protocol items as bars with adherence shading),
**markers** (readings as dots with the projection bands drawn ahead of
each adopted action and the verdict chip where a retest landed). Hover
on a fact change shows which conclusions it moved at that time (from
`belief_snapshots` around that date). A "replay" control steps through
time and re-runs the ledger at each snapshot, so the owner can watch a
person's beliefs move as facts, actions and draws arrive.

A **history journey** eval (`evals/journeys/history_t2d_path_m45.json`)
scripts this: man 45, HbA1c 6.0 at day 0, adopts "cut added sugar",
"walk 30 min after the largest meal", "resistance training twice a
week" with 80 % adherence; at week 12 the truth returns HbA1c 5.6; at
week 24, 5.5 with weight −5 kg entered as a fact `changed`; then a
`corrected` edit of height (typo) that must not alter the path. Expect:
projection at day 0 covers 5.6 (band), verdict `as_expected` at week 12,
`type2_diabetes` belief falls below possible by week 24, the corrected
height produces no belief change and shows as a struck-through entry.
A second history journey plays the disappointing case: same actions,
adherence 30 %, HbA1c 6.1 at week 12 → verdict `worse`, and the plan's
next report must say adherence, not the intervention, is the likely
reason (assert the CONCLUSIONS section carries "adherence 30 %").

## 3. Where it shows

- `/m/[code]`: the trend chart draws the projection band from the
  adoption date to `retest_at`, the expected point, and the verdict
  chip on the resolving reading. Under it: "Expected 5.6 (5.4–5.8) by
  2026-11-20 if you keep 80 %: cut sugar −0.3 (A), walking −0.1 (B),
  resistance training −0.1 (B)".
- Home ledger card for the condition: one line "On track: HbA1c
  expected 5.6 by Nov 20, retest then" or "Retest due: HbA1c" or the
  verdict after the draw ("Better than expected: 5.5 vs 5.6"). This is
  the gamified part, kept factual.
- `/plan`: adopting an action shows the projection inline before
  confirming ("this alone: −0.3 HbA1c in 12 weeks, grade A").
- `/brain` Journeys: the two history journeys render with the marker
  lane and the band, so the eval is visible like the others.

## 4. Verification

typecheck, tests (`projection.test.ts`: additive with grade shrink,
MAX_CHANGE bound, adherence scaling, band widening with lower grades;
resolution verdicts), the two history journeys pass in `eval:journeys`,
`/m/hba1c` for the test user with an adopted action shows the band,
`/history` shows the three lanes and a `corrected` entry struck through,
screenshots to `/tmp/p19/`. Report files changed, outputs, deviations,
and every effect size used with its source and grade.
