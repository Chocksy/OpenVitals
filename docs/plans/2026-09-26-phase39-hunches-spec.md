# Phase 39: you against you, hunches, and one clear view

Date: 2026-09-26. Branch `simple`. Status: draft. The mockups in round
fifteen (`2026-09-05-phase36-variations-brief.md`, files 49 to 53) come
first; the owner picks, then this spec is cut to what was picked.

## Why

The engine compares a person to the population: priors, likelihood
ratios, reference bands. Most people are "not sick", so most of what it
reads ends in silence. The owner has 16 draws over 14 years (582
readings, 130 markers), and the engine reads that history as a slope on
three catalog rules only (`lib/derived.ts` `slopePerYear`, five-year
window).

Small data becomes interesting when a person is compared to themselves.
Every value below sits inside the lab range, and every one is worth a
look:

| Signal                        | The numbers (owner, local copy)                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Eosinophils stepped up        | 0.05–0.13 K/µL for ten years; 0.25, 0.17, 0.19 in the last three draws (Nov 2024 on) |
| Ferritin falling              | 154 → 111 → 115 → 94 → 80 ng/mL since Oct 2021, −14/yr                               |
| LDL moving away from the goal | 106 → 117 → 131 mg/dL in 17 months; goal ≤ 100 by 2026-12-01                         |
| Homocysteine creeping back    | 8.1 → 8.4 → 8.8 → 9.6 µmol/L, MTHFR C677T het, folate never measured                 |
| Vitamin D halved              | 61.8 (2021) → 32.7 ng/mL                                                             |
| CRP settled                   | 15.8 (2023) → 0.5–0.6 for three draws                                                |
| Genes outvoted                | TCF7L2 CT and FTO AA; HbA1c 5.7 → 5.0, fasting insulin 2.7–5.7                       |

The same query also printed noise: `atypical_lymphocytes_abs` at z = 107
on three prior draws, and duplicate codes (`eosinophils_pct` and
`eosinophils_percentage`, `lymphocytes_pct` and `lymphocytes_percentage`).
The guards in B1 exist because of those rows.

## Principles kept

Principle 3 holds: detection, scoring and the choice of test are code.
The LLM proposes explanations and writes sentences. A hunch never touches
a probability until a test result arrives; then the ordinary engine reads
the result like any other.

## Part A: the personal band

`lib/personal.ts`, pure.

- `bandOf(points, excludeLast)`: median and MAD of the person's own draws
  (one value per day, duplicates averaged), `sd ≈ 1.4826 × MAD`, floored
  at the assay's analytical variation (`ASSAY_CV` table, sourced, default
  5 % of the median). Needs 5 prior draws; fewer returns `undefined`.
- `zOf(value, band)`.
- `stepOf(points)`: the last `k ≥ 2` draws all above the prior maximum or
  all below the prior minimum. Reads a change of level without a z-score,
  so it works on the flat, low-variance markers where MAD is tiny.
- `recentSlope(points, today)`: slope over the last three draws inside 24
  months, beside the existing five-year one. LDL reads +15/yr here and
  +1.8/yr over five years; the goal needs the first.
- A lab change guard: a jump that coincides with a new `lab_providers` row
  and no other marker moving is labelled "lab change?" and not raised.

Metric identity first: the curator's LLM metric-identity step runs over the
codes that differ only by suffix (`_pct`/`_percentage`), with an owner-OK
merge, before any band is computed.

## Part B: hunches

### B1. Signals (code)

A signal is `{ marker, kind, numbers, since }`. Kinds:

1. `left_band`: |z| ≥ 2.5 on the last draw, band from ≥ 5 draws.
2. `step`: `stepOf` fired.
3. `drift`: `recentSlope` beyond the marker's `DRIFT_MIN` per year (a
   table, sourced where a threshold exists, labelled C where it does not).
4. `discordance`: two markers that the graph says move together, moving
   apart (the ApoB–LDL rule made general over `kg_edges` with a same-sign
   effect).
5. `cluster`: three or more signals in one system or on one pathway in the
   same window (ferritin, B12, vitamin D and homocysteine together read as
   one intake or absorption question, not four).
6. `gap`: a marker the graph ranks high for this person's genome or
   conditions that was never measured (MTHFR het with no folate; TCF7L2
   with no HOMA-IR pair on the same day).
7. `good_news`: a marker that returned into the band and stayed for two
   draws (CRP). Hunches are not only worries.

Multiple testing: 130 markers × 7 kinds will always find something. A
signal is raised only when it clears its own threshold **and** one of:
a graph edge from the marker to a condition or pathway, a cluster, or the
person's goal. The rest go to `/brain` as unraised signals, visible and
counted.

### B2. Explanations (LLM proposes, code keeps)

For each raised signal: the graph returns the conditions and life causes
connected to the marker (`kg_edges`, `hkb_evidence`). The LLM gets the
signal, the person's facts and that closed list, and returns two or three
explanations, each with a one-line why. It may add one explanation not on
the list; that one is stored grade E, `basis: hypothesis`, and shown with
the ○ glyph. Code attaches, to each explanation, the prior from the
engine where one exists.

### B3. The test that separates them (code)

`infogain` runs over the explanations of one hunch instead of the whole
differential: which one question, marker or daily measurement splits them
most per euro. Questions are free, so a question wins a tie ("A new pet or
a move since late 2024?" before total IgE).

### B4. Written down before

When the person accepts the test, the hunch stores what each explanation
predicts ("if intake: folate < 6 ng/mL; if absorption: folate normal,
tTG-IgA …"). This is the projection pattern from phase 19 applied to a
diagnosis instead of a habit.

### B5. Closed

The result closes the hunch: **confirmed** (one explanation, the engine
takes it from here), **ruled out** (all explanations fail, the signal is
kept as "seen, unexplained"), **faded** (the next draw came back into the
band). `calibration_events` gets a row, so `/hkb` can print how often
hunches were right.

### Data

Migration, add-only: `hunches` (id, user_id, signal jsonb, explanations
jsonb, test jsonb, predictions jsonb, state `open|testing|closed`,
outcome `confirmed|ruled_out|faded|null`, opened_at, closed_at). One row
per signal cluster, reopened not duplicated.

## Part C: one clear view

The phase 37 score mixes today's habits with a draw five months old. The
view has three levels, each with its date, and one line about how sure the
picture is.

1. **Today**: the phase 37 rows (sleep, moves, kcal, protein). Unchanged.
2. **Heading**: per goal and per system, one word and an arrow:
   toward, holding, away. From `recentSlope`, the projection and the
   personal band. The LDL goal reads "away: +15/yr, 31 over, retest due".
3. **Watch**: the two or three open hunches and the one or two engine
   beliefs that matter, each with its evidence glyph.

Under it: "Last draw 156 days ago · 7 of 12 systems measured · 4 hunches
open". The number that decays with time is the draw's age, not the score.

API: `/api/today` gains `heading[]` and `hunches[]`; `/api/hunches/[id]`
returns the full card; `POST /api/hunches/[id]/test` accepts the test.
Fixtures in `fixtures/api/`.

## Order

A (band, guards, metric identity) → B1 signals with a `/brain` window
(raised and unraised, so the owner can judge the thresholds on real data)
→ C Heading on `/api/today` → B2 to B5 → the screens the owner picks from
round fifteen.

## Evals

`eval:hunches`: five persona histories (the owner's real series
anonymised, a flat healthy series that must raise nothing, an iron-loss
series, a new-lab jump that must be labelled a lab change, a coeliac
series whose cluster must lead to tTG-IgA). Assertions on which signals
are raised and which test is picked; a judge scores the explanations.

## Not in this phase

n-of-1 on/off experiments on wearable data (needs the phone sync on prod
first); life-event overlays (the owner has zero `life_events` rows; the
hunch's first question often asks for one, which starts filling them).

## Findings from the round-fifteen mockups (2026-09-26)

The builders ran the Part A rules in JS on the owner's real draws. Four
changes follow:

1. **A provisional band from 4 draws.** Ferritin and homocysteine have
   only 4 prior draws, so the 5-draw rule hides the ferritin fall, the
   clearest story in the data. Allow a band at 4, drawn dashed and
   labelled provisional, that can raise a signal only inside a cluster.
2. **Goal markers are read against the goal and the recent slope, not the
   band.** LDL 131 sits at z 1.56 inside its own band (the band moved up
   with it) while it walks away from the goal at +15 to +16/yr. The
   Heading arrow for a goal marker comes from `recentSlope` and the
   distance to the goal only.
3. **A cluster reads direction, not size.** B12 and vitamin D are at z
   −0.6 and −0.5 on their own; what makes the Store Room is four markers
   on the same side of their middles on the same draw. `cluster` fires
   on direction agreement across a pathway, with at least one member
   past its own threshold.
4. **Thresholds need the `/brain` window before users see them.** On the
   same history the rules also raise an HDL drift (−7/yr at Dec 2025), a
   B12 step up (May 2024, supplements) and CRP leaving its band (2023).
   Some are real and some are noise; the owner judges them in the window
   first. `recentSlope` is least squares over the last three draws (LDL
   +16.0/yr; the 15.2 in the data pack came from a different fit).

## Owner picks (2026-09-26)

- **Web: 53 Web** ("exceptional"). The web redesign comes after the iOS
  work. Rule for that phase: every existing page and component is
  translated into the 53 look. Simplify a component only where the new
  design needs it; never remove in bulk. The phase starts from a fresh
  inventory (last one `2026-09-02-ui-inventory.md`) with a row per
  component and its new form; any removal is listed for owner OK.
- **iOS: Casebook × Corridor**, simpler to read and act on at first, with
  detail and provenance one tap deeper. Round sixteen, files 54 and 55.
