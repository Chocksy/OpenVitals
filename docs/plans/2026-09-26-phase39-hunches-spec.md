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

---

# Build (main agent, 2026-09-26)

The owner approved: 54 Casefile (the Worth a look shelf on Today) plus
55 Corridors (the Blood tab), one case and one How we know reached from
both; the glance button is a neutral **Answer** that opens the chips in
place, never a pre-picked answer; forecasts use least squares over the
last three draws. The web moves to 53 in a separate spec,
`2026-09-26-phase40-web-hybrid-spec.md`. Three builds: **39S** server,
then **39I** iOS and **40W** web in parallel against 39S's fixtures.

Seams checked in the code (explore pass 2026-09-26): there is no
`lab_providers` table in `apps/simple` and readings carry no lab, so the
lab-change guard falls back to a change of reference range or unit on the
same draw; `planMetricIdentity` (`lib/curator.ts:688`) never looks at
`_pct`/`_percentage` pairs; `infogain.nextMoves` scores catalog hypotheses
only, so B3 gets its own small scorer; the 12 systems are `SYSTEMS` in
`lib/graph.ts:155` (ids `lipids metabolic liver kidney thyroid
sex_hormones adrenal inflammation blood iron vitamins lifestyle`), with
folate as `folic_acid`.

## 39S. Server (`apps/simple`)

### S1. `lib/personal.ts` (pure, tested)

Input: `MetricRow.points` filtered to lab rows (`source == null`, as
`todayGoals` does), same-day values averaged.

```ts
export interface Band { median: number; sd: number; n: number; provisional: boolean }
bandOf(points, { excludeLast = true }): Band | undefined   // n>=5 full, n==4 provisional, else undefined
zOf(value, band): number
stepOf(points): { dir: "up" | "down"; since: string; k: number; priorMax: number; priorMin: number } | undefined
recentSlope(points, today): { perYear: number; n: 3; from: string; to: string } | undefined  // least squares, last 3 draws, all inside 24 months
labChange(row): boolean  // last draw's ref range or unit differs from the previous draw's
```

`sd = max(1.4826 × MAD, ASSAY_CV[code] ?? 0.05) × median`, where the CV floor
is relative. `ASSAY_CV` is a small table with sources (CRP, ferritin, TSH,
eosinophils, LDL, HbA1c at least), and the default is labelled
`// ponytail:`.

### S2. `lib/signals.ts` (pure, tested)

`signalsOf(input): { raised: Signal[]; unraised: Signal[] }`, where input is
the metric rows, the goals, the genome facts, the graph and today.

```ts
type Kind =
  | "left_band"
  | "step"
  | "drift"
  | "discordance"
  | "cluster"
  | "gap"
  | "good_news";
interface Signal {
  key: string; // stable: kind + codes, e.g. "cluster:iron:ferritin,vitamin_b12,vitamin_d,homocysteine"
  kind: Kind;
  codes: string[];
  system: SystemId | null;
  dir: "up" | "down" | null;
  since: string | null; // first draw the rule fires on
  numbers: Record<string, number | string>; // everything the rule used, for How we know
  rule: string[]; // the rule's steps as short sentences with the numbers in them (depth 3 "The rule that fired")
  why: "graph" | "cluster" | "goal" | null; // the guard that let it through; null => unraised
}
```

Rules exactly as Part B1 plus the four findings:

- `left_band` needs |z| ≥ 2.5 on a full band. A provisional band only counts
  inside a cluster.
- `drift` reads `recentSlope` against `DRIFT_MIN[code]`, per year. The table
  is sourced where a threshold exists; the rest are labelled C.
- A goal marker (a row in `goals`) is always read by drift and distance to
  goal, never by band.
- `cluster` fires on markers of one system, or of the vitamins+iron pair,
  when all sit on the same "worse" side of their own middle on the same last
  draw and at least one member passes its own rule.
- `gap` comes from `GAP_RULES`, a sourced table from gene call or condition
  to a never-measured code (MTHFR het → `folic_acid`; TCF7L2 risk →
  `insulin` with `glucose` on the same day). A gap is dropped once the code
  has a reading.
- `good_news` fires when a marker that once had |z| ≥ 2.5, or sat outside
  the lab range, came back and stayed for 2 draws.
- `discordance` generalises the ApoB–LDL rule only over `kg_edges` pairs
  marked same-direction. When there are none, leave the kind implemented
  and unused.
- The lab-change guard marks a signal unraised with `why: null` and
  `numbers.labChange = true`.

Test fixture: the owner's real series from the round fifteen DATA pack. The
test asserts these are raised:

- eosinophils `step` up since 2024-11-20 (first fires 2025-12-09);
- the iron/vitamins `cluster` (fires 2026-04-23);
- LDL `drift` on the goal (+16.0/yr);
- `gap` folic_acid;
- `good_news` CRP.

It also asserts that a flat healthy series raises nothing. Unraised signals
are kept, for `/brain`.

### S3. Metric identity

Add the suffix pairs (`_pct`/`_percentage`, `_abs`/`_absolute` and
similar) to what `planMetricIdentity` considers: queue `merge_metric`
review items, and never merge silently. The existing `applyAnswer` branch
does the merge on the owner's yes.

### S4. `hunches` table (migration 0030, add-only)

Columns:

- `id` uuid
- `user_id`
- `key` (the signal key; unique with user)
- `kind`, `codes` text[], `system`
- `signal` jsonb: the last Signal
- `explanations` jsonb: `Explanation[]`
- `question` jsonb: `{ text, chips: { id, label, favours: string[] }[] } | null`
- `answer` text: chip id
- `test` jsonb: `{ code | null, name, eur, currency, price } | null`
- `predictions` jsonb: `{ explanationId, text }[] | null`
- `written_at`
- `state`: `open | testing | closed`
- `outcome`: `confirmed | ruled_out | faded | null`
- `outcome_line` text
- `seen_at`: good news "Got it"
- `opened_at`, `closed_at`, `updated_at`

```ts
interface Explanation {
  id: string;
  text: string;
  grade: "A" | "B" | "C" | "D" | "E";
  basis: "science" | "opinion" | "anecdotal" | "hypothesis";
  source: string | null;
  conditionId: string | null;
  weight: number;
  predicts: string | null;
}
```

### S5. `lib/hunches.ts` (the lifecycle; the DB and model live here)

`refreshHunches(userId)` does, in order:

1. It computes signals.
2. It upserts one row per raised key, never duplicating one. A key that was
   closed and fires again on a newer draw reopens its row.
3. It closes rows as `faded` when the key no longer fires on a newer draw.
4. It closes `testing` rows when a reading of `test.code` newer than
   `written_at` arrives. The outcome comes from `predictions` in code: each
   prediction stores a machine-checkable `check: { code, op: "<"|">"|"between", value | [lo,hi] }`
   next to its text. One explanation matches: `confirmed`. None matches:
   `ruled_out`. It then writes a `calibration_events` row through a new
   exported writer in `lib/calibration.ts`, with resolver `hunch:<id>`.
5. It fills explanations only for new rows, or rows without them. That is
   the one model call per hunch, which the next list describes.

The model call (explanations):

- It follows the `extractClaim` pattern in `lib/trends.ts:319`: one
  `generateObject` with a zod schema.
- The closed list is the graph conditions with an edge to any of the
  signal's codes, from `loadGraph()` edges into `metric:<code>`, with their
  grade and source from the edge evidence.
- It returns two to four explanations from the list (ids checked; unknown
  ids dropped as in `pickActs`), plus at most two outside the list. Those
  are stored as grade E, basis `hypothesis`.
- It also returns one question with three to five chips, each chip naming
  the explanation ids it favours, and one `check` per explanation for the
  candidate test.
- With no key, or when the call fails, a rules fallback takes the top three
  graph conditions by edge grade, adds no question, and sets the test from
  S6.

Weights are code, never the model:

- An explanation with an engine belief (`conditionId` scored in the ledger)
  takes that probability.
- The rest share the remainder equally.
- An answered chip multiplies the explanations it favours by `CHIP_LR = 3`
  (ponytail, labelled). Weights are then renormalised.
- The screen calls them "share of this hunch, not a diagnosis".

S6, choosing the test, is code:

- Candidates are the markers that appear in the explanations' checks.
- A candidate scores by how many explanations predict a different outcome
  on it, divided by `priceOf` in EUR (the `lib/prices.ts` floor applies).
- The question is free and is asked first. Once it is answered, the test is
  offered.

`refreshHunches` runs after `saveReadings` (the upload path), in the daily
pass, and lazily from `GET /api/hunches` when the user has never been
refreshed.

### S7. API (Next routes plus `lib/api-contract.ts` types plus fixtures)

- `GET /api/hunches`: `HunchesBody { open: HunchRow[]; goodNews: HunchRow[]; closed: HunchRow[] }`. `HunchRow` is the glance:
  - `id`, `kind`, `stamp`, `system`, `line` (one plain sentence, from a code
    template, no z, no percentages);
  - `number: { value, unit }`;
  - `mini: { band: Band | null; lab: [lo, hi] | null; last: number; goal: [lo, hi] | null }`;
  - `action: { kind: "answer" | "book" | "got_it" | "result"; label }`;
  - `state`.
- `GET /api/hunches/[id]`: `HunchCase`, which is the HunchRow plus:
  - `say`;
  - `series: { date, value, file: string | null }[]`, where the file is
    `uploads.file_name` via `readings.upload_id`, and null means "imported
    from the old app";
  - `bandAt: { date, median, sd }[]`, the band as it stood before each draw,
    for the corridor ribbon and the replay;
  - `explanations` with weights;
  - `question`, `answer`, `test`, `predictions`, `writtenAt`, `outcome`,
    `outcomeLine`;
  - `rule: string[]`;
  - `unknowns: string[]`;
  - `firedAt: string[]`, the draw dates the rule fired on, for the replay
    dots.
- `POST /api/hunches/[id]/answer {chip}` re-weights and returns `HunchCase`.
- `POST /api/hunches/[id]/test` writes the predictions, sets `writtenAt` and
  `state: testing`, and returns `HunchCase`. It also adds the test code to
  the next draw plan, the same path as "Plan retest".
- `POST /api/hunches/[id]/seen` is good news "Got it".
- `GET /api/markers` gains, per marker:
  - `band: Band | null`;
  - `z: number | null`;
  - `signal: { kind, hunchId } | null`;
  - the list order is unchanged; clients sort.
- `GET /api/today` gains:
  - `hunches: HunchRow[]`: open ones first, then unseen good news, at most 5;
  - `heading: { id, name, word: "toward"|"holding"|"away"|"unmeasured", why }[]`
    for the 12 `SYSTEMS`. A goal marker moving away makes its system
    `away`. A raised adverse signal makes it `away`. A good_news or goal
    moving toward makes it `toward`. A system with no lab draw is
    `unmeasured`. Everything else is `holding`;
  - `confidence: { lastDraw, days, measured, total, open }`.
- Every `TodayGoal` gains `recentSlope` and `landing: { date, value } | null`,
  the least-squares line extended to the goal's due date.

Fixtures: add `hunches.json` and `hunch.json` (the iron cluster case) and
regenerate `today.json` and `markers.json` with `scripts/p32a-fixtures.ts`
against the local DB, owner account, with the model layer on if
`OPENROUTER_API_KEY` works, else the rules fallback (say which). Add the
names to `NAMES` in `lib/api-contract.test.ts`, plus contract tests per
route.

### S8. `/brain` window

A third `PillTabs` value `"signals"` in `components/brain.tsx`:

- A person picker as on the other tabs.
- The raised and unraised signals in two tables. Each row shows kind,
  codes, the rule lines, `why`, and `labChange`.
- The hunches rows with state and outcome.
- A "Refresh" button that runs `refreshHunches`.

This is the window from finding 4. Never remove other tabs.

### S9. `eval:hunches`

`evals/hunches.ts` plus `evals/hunches/cases.json`, with the five personas
from the Evals section, offline (signals only, no model) so it runs in CI.
The judge part runs only with `--judge` and a key.

### Verify (39S)

```
cd apps/simple
pnpm typecheck
pnpm test          # was 1938 green; all green after
pnpm db:generate   # emits 0030 only, add-only
pnpm db:migrate    # against the local DB (docker compose up -d postgres, port 5433)
pnpm eval:hunches
pnpm exec tsx --env-file=.env scripts/p32a-fixtures.ts razvan.ciocanel@gmail.com
curl the four new routes with the dev server and a session, or call the body functions from a tsx script, and print the owner's open hunches
```

The owner's real result must show the five raised signals named in S2 and
nothing absurd. Paste the list into "As built".

## 39I. iOS (`apps/ios`), after 39S's fixtures exist

Designs: `docs/mockups/v4/ios-variations/54-casefile.html` (Today shelf,
case sheet, How we know) and `55-corridors.html` (Blood tab). The
prototypes win ties with this text, except:

- the glance button is **Answer**, which opens the chips in place under
  the row, and one chip tap sends it; it is never a pre-picked answer;
- every number comes from the API.

Seams (explore pass 2026-09-26):

- The `OpenVitals/` folder is file-system synchronised, so a new `.swift`
  file joins the target.
- Hybrid tokens live in `Hy` (`HybridToday.swift:13`). `HShelf`,
  `ShelfTitle` and `hyCard` live in `Shelves.swift` / `HyChrome.swift`. The
  custom overlay sheet pattern is `TodaySheet` + `TodaySheetHost`
  (`MealEditSheet.swift`, `HybridToday.swift:968-1086`). Motion goes through
  `Motion.animate` with `Curve`.
- The Blood tab is `BloodView.swift`, and markers come through
  `Api.markers` (`Api.swift:780-869, 1432`).
- To add a fixture: copy the JSON files into `apps/ios/Tests/Fixtures/`,
  run `scripts/gen-fixtures.py`, and add the names to `ContractTests.names`.
- Hybrid screens use the render-test pattern in `BloodTests.swift:55-140`,
  not reference PNGs.

### I1. Models and Api

- In `Api.swift`, add `HunchRow`, `HunchCase`, `HunchesBody`, the `Today`
  additions (`hunches`, `heading`, `confidence`, and goal `recentSlope` /
  `landing`) and the `Marker` additions (`band`, `z`, `signal`). All the new
  fields are optional in decoding, so old caches still decode.
- Add the calls `hunches()`, `hunch(id)`, `answer(id, chip)`,
  `acceptTest(id)` and `seen(id)`, with `Fixtures.canned` first as the
  other calls do.
- Add the contract tests for the four fixtures.

### I2. The corridor view (one component, reused everywhere)

- `Corridor.swift`: `MiniCorridor` for the glance. It shows the own band as
  a soft fill (dashed when provisional), the lab range as thin lines behind
  it, the goal band in green, and the last dot coloured by state.
- `CorridorChart` for the case. It shows the draws, the band as it stood
  (`bandAt` ribbon), the lab lines, the step or previous max marked, and a
  dashed landing line for goal markers.
- The chart draws in with `Curve.ease` on appear.

### I3. Today: Worth a look shelf

- In `Shelves.swift`, add a slim shelf of rows (not cards) between Today so
  far and Where it's heading, and only when `today.hunches` is non-empty.
- Each row shows the line, the number with its unit, the `MiniCorridor` and
  one button: **Answer**, **Book the test**, **Got it** or **See result**.
- Answer expands the chips under the row. A chip calls `answer`, and the row
  settles to "Noted" with the check drawn in.
- Tapping the row opens the case as a new `TodaySheet.hunch(id)` in
  `TodaySheetHost`. Do not add a system sheet.

### I4. The case sheet (depth 2) and How we know (depth 3)

- `HunchCaseView.swift` has:
  - the stamp (STEP, CLUSTER, DRIFT, GAP, GOOD NEWS), the title and `say`;
  - the `CorridorChart`, or four stacked lanes for a cluster;
  - explanation bars with the evidence glyph and the label "share of this
    hunch, not a diagnosis". The glyph follows the app's evidence rule
    (● science, ◐ opinion, ○ anecdotal or hypothesis), as settled in the
    phase 40 conflicts table. After `answer`, the bars re-order with an
    animation;
  - the question with its chips;
  - the test with its price, and **Write it down** (`acceptTest`). It
    writes the predictions in and stamps "written down <date>";
  - the outcome block when the case is closed.
- How we know sits under the case. Its sections are closed by default and
  expand in place:
  - the rule that fired (`rule` lines);
  - the draws, newest first: date, value, and file name or "imported from
    the old app";
  - the evidence per explanation (grade, basis, source);
  - what is not known (`unknowns`);
  - the replay scrubber over `series` and `bandAt`, with a dot per
    `firedAt`.

### I5. Blood tab (55)

- `BloodView` opens on hunches first (the same rows as I3, from
  `Api.hunches()`), then every marker as a slim corridor row.
- Sort order: markers outside their band on top, then signals, then the
  rest. Keep the existing search and filter chips.
- A row expands in place (matched geometry) into the corridor chart and the
  case summary. **How we know** pushes the full case.
- Keep `MarkerView` reachable from the expanded row ("Marker details"): the
  goal editing and the history must not be lost.
- Keep "Where it's heading" (`ProjectionCard`).
- Today keeps one line, "N things worth a look in your blood", which
  switches to the Blood tab.

### I6. Heading in the header

- `ScoreHeader`'s expanded state gains a Heading block: the 12 systems as
  small tiles with a word and an arrow, from `today.heading`.
- It also gains the confidence line "Last draw N days ago · M of 12
  systems · K open".
- The phase 37 content stays.

### Verify (39I)

```
cd apps/ios && python3 scripts/gen-fixtures.py
xcodebuild -scheme OpenVitals -destination 'generic/platform=iOS Simulator' build
xcodebuild test -scheme OpenVitals -destination 'platform=iOS Simulator,name=iPhone 17 Pro'   # was ~318, all green after
```

Also:

- Add render tests (the `BloodTests` window pattern) for the shelf, the case
  sheet at depth 3 and the Blood glance.
- Take simulator screenshots with `-OVFixtures YES` of Today (the shelf),
  the case, How we know expanded and the Blood tab. Save them to
  `/tmp/p39i/`, and compare them by eye with 54 and 55.
- Reduce Motion must still work.

## As built (39S), 2026-09-26

Tests: 1938 before, 1992 after, all green. `pnpm db:generate` emits only
`0030_bizarre_exiles.sql`, which is add-only (`CREATE TABLE hunches` plus
its FK to `users`). `pnpm eval:hunches`: 5 of 5 personas pass. No commits,
no deploys.

### Files

New:

- `lib/personal.ts` and `lib/personal.test.ts`: `bandOf`, `zOf`, `stepOf`,
  `fitOf`, `recentSlope`, `labPoints`, `labChange`, and the `ASSAY_CV` table.
- `lib/signals.ts` and `lib/signals.test.ts`: `signalsOf`, `readMarker`, and
  the `WORSE`, `DRIFT_MIN` and `GAP_RULES` tables.
- `lib/hunches.ts` and `lib/hunches.test.ts`: the closed list, weights,
  `chooseTest`, `priceTest`, predictions, outcome, `refreshHunches`,
  `answerHunch`, `acceptTest` and `seeHunch`.
- `app/api/hunches/route.ts`, `[id]/route.ts`, `[id]/answer/route.ts`,
  `[id]/test/route.ts` and `[id]/seen/route.ts`.
- `drizzle/0030_bizarre_exiles.sql` and its snapshot.
- `evals/hunches.ts`, `evals/hunches/cases.json` and
  `evals/results/hunches-2026-09-26.json`.
- `fixtures/api/hunches.json` and `fixtures/api/hunch.json` (the iron
  cluster case).

Changed:

- `db/schema.ts`: the `hunches` table and its JSON types.
- `lib/api-contract.ts`: `HunchRow`, `HunchCase`, `HunchesBody`,
  `hunchesBody`, `hunchBody` and `headingOf`. Today gains `hunches`,
  `heading` and `confidence`. `TodayGoal` gains `recentSlope` and
  `landing`. Markers gain `personalBand`, `z` and `signal`.
- `lib/api-contract.test.ts`: `hunches` and `hunch` are added to the names
  list and the number check, with contract tests per route and two
  `headingOf` tests.
- `lib/calibration.ts`: `recordHunchCalibration`, with resolver `hunch:<id>`.
- `lib/curator.ts` and its test: `planSuffixPairs` (S3) queues
  `merge_metric` for `_pct`/`_percentage` and `_abs`/`_absolute` pairs.
  `runCurator` calls `refreshHunches` at the end. Every upload route
  already calls `runCurator`, so this also covers the upload path.
- `lib/graph.ts` and its test: the `eosinophils_abs` metric, the
  conditions atopy, drug reaction and parasitic infection, and three
  `raises` edges (Kuang 2020, Valent 2012). `pnpm kg:seed` gives 140 nodes
  and 125 edges.
- `lib/glossary.ts`: an `eosinophils_abs` entry, which the glossary test
  requires for every catalog metric.
- `app/api/brain/route.ts` and `components/brain.tsx`: the S8 Signals tab
  and the `signals`/`refresh` modes. Both are admin only. The Engine and
  Journeys tabs are unchanged.
- `scripts/p32a-fixtures.ts`: writes `hunches` and `hunch`.
- `package.json`: the `eval:hunches` script.
- `fixtures/api/today.json` and `markers.json` were regenerated.
  - The script also rewrote four other fixtures from local drift. The
    local DB has lost its research topics, so `research-topics` came out
    empty.
  - Those four (`plan-today`, `research`, `research-topics`, `score-days`)
    were put back from HEAD, because this build does not own them.

### The owner's real signals (local DB, as of the draw of 2026-04-23)

Raised (5):

| Key | Line (from the code template) | Test |
|---|---|---|
| `cluster:iron` | 4 iron and vitamin markers moved the worse way together, led by Ferritin. | tTG-IgA with total IgA |
| `drift:ldl_cholesterol` | LDL Cholesterol is moving away from your goal, up 16 mg/dL a year. | repeat LDL (fallback) |
| `step:eosinophils_abs` | Eosinophils (Absolute) moved to a higher level in Nov 2024. | repeat eosinophils (fallback) |
| `gap:folic_acid` | MTHFR C677T heterozygous makes Folic Acid (Vitamin B9) worth a check; last measured May 2024. | Serum folate |
| `good_news:crp` | CRP is back in your usual range since May 2024. | none |

More detail on each raised signal:

- `cluster:iron`:
  - The cluster fired on 2026-04-23 only.
  - Members: homocysteine, ferritin, vitamin D and B12.
  - Ferritin and homocysteine are lit. Ferritin's band is provisional
    (4 draws).
- `drift:ldl_cholesterol`: least squares gives +16.0 a year and lands
  near 137.3 on 2026-12-01.
- `step:eosinophils_abs`: the step began on 2024-11-20 with k = 3. It
  fired on 2025-12-09 and 2026-04-23.
- `good_news:crp`: CRP was 15.8 on 2023-03-17, and the 4 draws since are
  back inside.

Unraised (22):

- 7 `good_news` with no cause on the graph: wbc, neutrophils_abs,
  lymphocytes_pct, monocytes_pct, monocytes_abs, basophils_abs and
  total_protein.
- 8 steps and band exits in the benign direction or with no cause on the
  graph (the Signals tab shows which): mchc, mpv, neutrophils_pct,
  lymphocytes_abs, eosinophils_pct, pct, bun and calcium.
- Folded:
  - `left_band:eosinophils_abs` folds into its step.
  - `step:ferritin`, `drift:ferritin`, `drift:homocysteine` and `step:iron`
    fold into `cluster:iron`.
- Sums: `left_band:total_cholesterol` and `step:non_hdl_cholesterol`.

Today's Heading:

- away: lipids, blood, iron and vitamins.
- toward: inflammation.
- unmeasured: lifestyle.
- holding: the other 6.

The confidence line is "last draw 2026-04-23, 156 days, 11 of 12 systems,
4 open".

**Explanations came from the model** (`OPENROUTER_API_KEY` works) for the
cluster, the LDL drift and the eosinophil step. Gap and good news take no
explanations by design, so they show as "rules". Every weight, check, test
and price is code.

### Deviations from S7 (field names and shapes)

- Markers carry `personalBand` rather than `band`, because `band` already
  holds the lab range and renaming it would break the phone.
- The cluster key is `cluster:<group>` (`cluster:iron`), not the member
  codes. That keeps it stable when a member joins or drops out.
- A gap fires when the code is missing from the last three draws. It does
  not require "never measured": the owner's folate was measured in 2021
  and 2024.
- Extra fields:
  - `HunchExplanation.check` and `HunchPrediction.check`: the code-owned
    threshold.
  - `HunchTest.estimated`: true when there is no country price.
  - `HunchCase.markers[]`: one lane per cluster member.
- `number.value` and `mini.last` are nullable.
- `recentSlope.from` is a date, so the contract test's number check skips
  keys under `recentSlope.`.
- The checks come from the hkb evidence rows (the strongest plain
  above/below per condition), not from the model. The model only picks
  ids, writes the text and words the question.
- `HunchRow` has no separate title. `line` is the title and `say` is the
  sentence under it.
- Testing rows show the action `{ kind: "result", label: "Waiting for the result" }`.
- The POST routes return the case (`answer`, `test`) or `{ ok }` (`seen`).
  - They were verified by typecheck only.
  - They were not run against the owner, because they write the owner's
    state and `acceptTest` inserts a goal row.

### Ponytail notes

- `ASSAY_CV` falls back to 5 % for codes not in the table.
- `CHIP_LR = 3` has no study behind it.
- There is one graph alias (`crp` → `hs_crp`). A kg condition finds its hkb
  twin by the `_disease` suffix.
- hkb rows that end in `_risk` are consequences, not causes, and are
  skipped.
- Good news shows for at most 4 draws after the exit.
- When nothing on the list names an unmeasured marker, the test is a repeat
  of the lead marker. For the owner this is the case for the LDL drift and
  the eosinophil step.
  - It confirms the move and does not split the explanations.
  - For LDL, the only split left is familial hypercholesterolaemia at over
    250.
- `acceptTest` plans the test as a goal row due in 4 weeks. A test code
  with no metric row is skipped.
- `GET /api/hunches` treats "no rows" as "never refreshed", so a person
  with no signals pays one refresh per call. Add a refreshed-at column if
  that shows.
- The discordance rule exists but is idle, because no kg pair is marked
  same-direction.
- Owner prices are estimates (10 EUR band) because the owner has no
  `country` fact.

### Review (main agent, 2026-09-26)

- Re-ran typecheck and tests: clean, 1993 green. Migration 0030 only
  creates `hunches` and its FK.
- `weightsOf`: an unscored explanation took the whole leftover share, so
  the cluster's grade-E diet guess held 0.49, then 0.87 once the model
  named only scored causes. A grade-E guess is now capped at half the top
  graph explanation. The owner's cluster reads malabsorption 0.61, diet
  guess 0.30, SIBO 0.07, gastritis 0.03.
- `hunchesBody` sorts open hunches cluster, drift, step, left_band,
  discordance, gap. Before, it sorted by open time, and the folate gap led
  the shelf.
- The owner's three model-explained hunches were re-explained once so the
  new weights apply; fixtures regenerated, the four unrelated fixtures kept.

## As built (39I)

iOS, `apps/ios`. 334 tests pass on the iPhone 17 Pro simulator (318 before; 16 new in `Tests/HunchTests.swift`).

Files:

- `Api.swift`: `PersonalBand`, `HunchRow`, `HunchesBody`, `HunchCheck`, `HunchCase` (with `answered(_:)` and `written(on:)`); `Today.hunches/heading/confidence`; `Goal.recentSlope/landing`; `Marker.personalBand/z/signal`. Calls `hunches()`, `cachedHunches()`, `hunch(id:)`, `answer(id:chip:)`, `acceptTest(id:)`, `seen(id:)`. Every new field decodes as optional or with a default.
- `Corridor.swift` (new): `HunchInk` (ink per kind, glyph per basis), `CorridorScale`, `MiniCorridor`, `CorridorChart` (the draws, the `bandAt` ribbon, lab lines, the earlier edge a step broke, the dashed landing, the replay cut-off). It draws in on `Curve.ease`.
- `Hunches.swift` (new): `HunchDesk` (cases, settled rows, open chips; the four calls are seams), `HunchActions` in the environment, `WorthALook`, `HunchRowView`.
- `HunchCaseView.swift` (new): the case and `HowWeKnow` (five folds, closed by default, Open all, and a replay slider with a dot per `firedAt`).
- `Shelves.swift`: Worth a look between Today so far and Where it's heading, only when `today.hunches` has rows. It shows 3 rows, then the line "N things worth a look in your blood ›", which sets the tab to Blood.
- `MealEditSheet.swift`: `TodaySheet.hunch(id)`. The host has no 610 cap for a case, and `-OVScreen hunch-how` scrolls to How we know.
- `HybridToday.swift`: `TodayModel.desk`, the `hunchActions` environment, and `-OVScreen hunch|hunch-how`.
- `BloodView.swift`: Worth a look first. Needs a look, Where it's heading, search, filter chips, the `MarkerView` sheet and the footnote all stay. Every marker is now a `CorridorRow`. The case pushes as a page from the trailing edge with "‹ Blood". A test init takes `hunches:` and `pushed:`.
- `ScoreHeader.swift`: `HeadingBlock` (12 tiles, 4 columns, and the confidence line) under the 13-week grid. `-OVScreen heading` opens it.
- Tests: `ContractTests.names` gains `hunches` and `hunch`. `Tests/HunchTests.swift` has decode tests (for today, markers, hunches and hunch, plus an old server and a thin case), the reweighting and write-down tests, the corridor order, the scale, the desk seams, and render tests (shelf, chips, case, How we know, written-down case, corridor rows, heading, Blood, Blood pushed). The PNGs are in `/tmp/p39i/test-*.png`.

Deviations:

- `today.json` is not the web's regenerated file. The web copy drifted from the other fixtures (plan "0 / 4" against plan-today's "1 / 6", no projection, null sleep, score day 2026-09-26, streak 0), and it broke 21 existing tests. The iOS copy is the HEAD file plus the web's `hunches`, `heading`, `confidence` and goal `recentSlope`/`landing`, copied as they are. `markers.json`, `hunches.json` and `hunch.json` are the web files unchanged. Please regenerate `simple/fixtures/api/today.json` against the same seed as plan-today.
- The Blood list is no longer grouped by system. The 55 sort (outside your band, then signals, then the rest) replaces it. `BloodView.grouped` stays, because the header count and a test use it. `MarkerLine` and `BloodView.total` are unused now; they stay for the owner to delete.
- A fixture run has one full case (the iron cluster). Any other row opens as its row: the title, the glance corridor drawn large, and the sentence.
- The row button for `result` shows the server's label, "Waiting for the result", greyed out, where the spec says "See result". There is no result yet to see.
- The matched geometry runs from the row's glance corridor to the open chart. The card itself grows on the spring.
- Hunch numbers print with `Design.digits` (0.19). `Design.number` would print 0.2.
- `HunchCase` is one flat struct that decodes the row from the same object. There is no inheritance in Codable.

Ponytail notes:

- Today shows 3 rows. The rest wait behind the line to Blood.
- The case uses `row.mini.lab` for the lab lines. Cluster lanes carry no lab range, so they have none.
- Each screen has its own desk. An answer on Today shows on Blood after the next load, not at once.
