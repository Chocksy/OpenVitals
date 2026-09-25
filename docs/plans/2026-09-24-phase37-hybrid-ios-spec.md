# Phase 37: the Hybrid home on the phone

Date: 2026-09-24. Branch `simple`. Handoff: `/tmp/openvitals-handoff-hybrid-ios.md`.

Owner: build variation 48 Hybrid as the real Today screen in `apps/ios`. He
likes every animation and detail, the Dynamic Island included. "Make a proper
tech decision from the start."

Read with this file:

- `docs/plans/2026-09-24-phase37-hybrid-motion-reference.md`: every size,
  colour, curve and timing, measured from the prototype. Views copy it.
- `docs/mockups/v4/ios-variations/48-hybrid.html`: the prototype. It wins
  any tie with the reference.
- `docs/plans/2026-09-05-phase36-variations-brief.md`, rounds 12 to 14:
  the owner's verdicts and the island rules.

## Decisions (owner, 2026-09-24)

1. **The score is computed on the server.** One pure function,
   `lib/score.ts`. `/api/today` carries the inputs and the result; a new
   `/api/score/days` returns the history. The phone runs a Swift port of the
   same function only to preview a change before the server answers (a tick,
   a portion). Both sides pass the same test vectors file.
2. **Food targets: derived, and the person can override.** Mifflin-St Jeor
   from weight, height, age and sex, labelled estimated. A value the person
   sets wins. With no inputs and no override there is no target: the ring
   shows kcal with no "of", and the two rows leave the Lifestyle average.
3. **The Hybrid look is the new design, web included.** Its tokens go into
   `docs/mockups/v4/system.css`, so `gen-design.py` feeds iOS and the web
   reads the same file. This phase moves the phone's Today only. Blood,
   Body, Plan and the web home follow in the shelf pattern later. Nobody
   uses the apps yet, so the tabs may look mixed for a while. We handle it
   as we go.

## Tech decisions (main agent, 2026-09-24)

- **SwiftUI, iOS 17, no new dependencies.** Every motion ports with
  platform APIs:
  - CSS `cubic-bezier(a,b,c,d)` → `Animation.timingCurve(a,b,c,d, duration:)`,
    verbatim. No spring guessing, so the feel matches the prototype.
  - Count-ups → `.contentTransition(.numericText(value:))`, driven by the
    same curve.
  - Keyframe loops (beat, flash, bob, pulse) → `keyframeAnimator` /
    `phaseAnimator`.
  - Confetti → one `Canvas` inside `TimelineView(.animation)`.
  - Swipes → `DragGesture`; the fly to the header → frames from anchor
    preferences in one named coordinate space, `"today"`.
  - Haptics → `.sensoryFeedback`: `.success` on a tick, `.selection` when a
    drag crosses 89, `.impact(weight: .light)` on Later.
  - Video → `AVPlayerLayer` in a `UIViewRepresentable`, SwiftUI `.blur(21)`
    and `.blendMode(.screen)` on top.
  - Grain → one 128×128 `CGImage` made once from the seeded generator,
    tiled with `Image(decorative:).resizable(resizingMode: .tile)`.
- **Reduce Motion is honoured everywhere.** One helper
  (`Motion.animate`) swaps any curve for a 200 ms opacity crossfade when
  `accessibilityReduceMotion` is on. Loops stop. The video shows its first
  frame. Swipes still work; cards move without tilt and without confetti.
- **Custom overlays, not system sheets, for Focus and the meal sheet.**
  Focus opens by clipping from the stack's own rectangle, and the score
  header must stay above the meal sheet's veil. `.sheet` and
  `.fullScreenCover` can do neither. Both live in the Today `ZStack`.
- **The Dynamic Island has two halves.**
  - _In the app:_ an island-shaped overlay drawn by us. It sits on `Shell`
    so every tab has it, ignores the safe area, and is black so it joins the
    hardware cutout. It grows out of the cutout; it never draws content
    inside it, because the camera hides those pixels. On a device without an
    island it drops as a pill from under the status bar. While it is open,
    the Today header moves down until it clears the island's bottom edge
    (island bottom + 8 − safe-area top) with the same 620 ms curve (the
    owner's note on the prototype).
  - _Outside the app:_ an ActivityKit Live Activity, for the plate read
    only. It starts on Send and ends with the result, then dismisses after
    4 s. iOS hides an app's own Live Activity while the app is in front, so
    the two halves never show at once. Tick receipts and "All done" are
    in-app only: the person is always in the app when they tick.
  - A Live Activity needs a Widget Extension target (`OpenVitalsIsland`)
    and `NSSupportsLiveActivities`. Updates come from the app while it
    runs: `beginBackgroundTask` covers the upload and the read.
    ponytail: no APNs push updates; add push-to-update when a read outlasts
    the ~30 s of background time.
  - The resting "rings and score" pill of the prototype is not drawn. On
    real hardware it would sit under the camera. A persistent all-day Live
    Activity is capped at 8 hours by iOS and is not worth it.
- **Island geometry.** Cutout 126×37, 11 from the top, centred. Island
  device: key window `safeAreaInsets.top >= 51`. The open shapes keep the
  prototype's content heights (plate 84, receipt 62) under a 37-point band
  that stays clear for the camera: 121 and 99 tall, 358 wide (screen width
  minus 32 on narrower phones). Without an island there is no band.
  ponytail: fixed cutout size; add a per-model table if a device misaligns.
- **Plate reading has no server progress.** The island's progress follows
  the prototype curve against an expected 7 s, holds at 95% until the
  response, then the items arrive one by one, 300 ms apart. The numbers are
  the real ones from the response.
- **Light only.** The Hybrid palette has no dark column. Today renders its
  own palette in both schemes. Dark comes with the web port.

## What does not ship

The prototype's placeholder data: the date, every LIFE/BLOOD/GENES row, the
seeded past days and their reasons, meals and ingredients, moves, marker
history, lever deltas, PhenoAge card numbers, the hypnogram, transcripts,
the Fix parser, the Vitamin D suggestion. The gallery mock (task 9) may
use them, because the gallery is not the app.

---

## Part A: server (`apps/simple`)

### A1. `lib/score.ts`: the arithmetic, pure

```ts
export type Row = "sleep" | "moves" | "kcal" | "protein";
export interface ScoreInput {
  sleepHours: number | null;
  moves: { done: number; due: number } | null; // null when nothing is due
  kcal: number | null; // eaten today
  proteinG: number | null;
  targets: { kcal: number | null; proteinG: number | null };
  blood: { green: number; amber: number; rose: number } | null; // null: no draw
  genes: number | null; // 0–100, null: no genome
}
export interface ScoreResult {
  score: number | null;
  word: "Strong" | "On track" | "Watch" | "Act" | null;
  life: number | null;
  blood: number | null;
  genes: number | null;
  rows: Record<Row, number | null>; // each 0–100
}
export function scoreOf(input: ScoreInput): ScoreResult;
export const WEIGHTS = { life: 0.4, blood: 0.45, genes: 0.15 } as const;
```

- `sleep`: 100 inside 7–9 h (AASM adult band), else
  `100 − 25 × hours outside the band`, floor 0.
- `moves`: `done / due × 100`.
- `kcal` (needs a target T): 100 inside `[T − 300, T]`, else
  `100 − distance / 10`, floor 0. ponytail: the prototype's band, fixed
  300 below target; make it a setting if the owner asks.
- `protein` (needs a target P): `min(100, g / P × 100)`.
- Every row is rounded. A null input or a missing target makes the row
  null.
- `life` = rounded mean of the non-null rows; null when all are null.
- `blood` = `round((green + 0.5 × amber) / (green + amber + rose) × 100)`.
- `score` = `round(Σ w × layer / Σ w)` over the non-null layers, so a
  missing layer renormalises the weights. Null when no layer exists.
- `word`: ≥ 80 Strong, ≥ 65 On track, ≥ 50 Watch, else Act.

**Test vectors** live in `apps/simple/fixtures/score-vectors.json`, an array
of `{ name, input, expected }`. `lib/score.test.ts` runs every one; the
Swift port runs the same file (task B3). At least:

| name        | input                                                                                | expected                                                 |
| ----------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| prototype   | sleep 7.5, moves 2/5, kcal 1497, protein 94, targets 1900/120, blood 4/2/1, genes 63 | rows 100/40/90/78, life 77, blood 71, score 72, On track |
| tick 3      | same, moves 3/5                                                                      | life 82, score 74                                        |
| tick 4      | moves 4/5                                                                            | life 87, score 76                                        |
| tick 5      | moves 5/5                                                                            | life 92, score 78                                        |
| no genome   | prototype with genes null                                                            | score 74                                                 |
| no targets  | targets null/null                                                                    | rows kcal and protein null, life 70                      |
| nothing     | all null                                                                             | every value null                                         |
| short sleep | sleep 5.5                                                                            | sleep row 62                                             |
| over kcal   | kcal 2200, target 1900                                                               | kcal row 70                                              |

Work out any vector not in the prototype by hand before writing it down.

### A2. `lib/targets.ts`: food targets

```ts
export interface Targets {
  kcal: number | null;
  proteinG: number | null;
  estimated: boolean;
}
export function estimateTargets(p: {
  weightKg: number | null;
  heightCm: number | null;
  birthYear: number | null;
  sex: string | null;
  year: number;
}): { kcal: number | null; proteinG: number | null };
export function resolveTargets(
  set: { kcal?: number | null; proteinG?: number | null },
  est: ReturnType<typeof estimateTargets>,
): Targets;
export async function targetsFor(userId: string, day: string): Promise<Targets>;
```

- Mifflin-St Jeor: `10 × kg + 6.25 × cm − 5 × age + (male ? 5 : −161)`,
  times 1.4, rounded to 10. ponytail: fixed light-activity factor; derive it
  from steps when the owner asks. Kcal is null if weight, height, birth year
  or sex is missing.
- Protein: `round(1.6 × kg)`; null without weight.
- A set value wins per field. `estimated` is true when any returned field
  came from the estimate.
- Set values are `profile_facts` keys `kcal_target` and `protein_target_g`
  (source "user"). Confirm the existing keys for sex, birth year and height
  (`grep -rn "birth_year\|height_cm\|\"sex\"" lib`) and the latest weight
  source (readings `weight_kg`, or `daily_logs.weightKg`). Use what exists;
  do not add new fact keys for them.
- `PUT /api/targets` `{ kcal: number | null, proteinG: number | null }`
  writes or clears the two facts and returns `Targets`. Check first whether
  a generic facts endpoint already does this; if it does, use it and skip
  the new route.
- Tests: pure tests for both functions (a 80 kg, 180 cm, 39-year-old man
  gives 2 430 kcal (1 735 × 1.4 = 2 429, to the nearest 10) and 128 g; a missing height gives kcal null).

### A3. The score on `/api/today`, and the history

Add to `TodayBody` in `lib/api-contract.ts`:

```ts
score: {
  day: string;
  input: ScoreInput;          // so the phone can preview changes
  result: ScoreResult;
  targets: Targets;
  streak: number;             // lib/daily.ts streak(), active days as lib/daily-data.ts counts them
  maxChange: Record<string, number>;  // MAX_CHANGE from lib/projection.ts, for lever previews
};
sleep: { hours: number | null; bed: string | null; wake: string | null;
         stages: { stage: "awake" | "rem" | "core" | "deep"; start: string; end: string }[] } | null;
```

Extend `TodayGoal` with the projection the Heading shelf draws:

```ts
projection: { from: number; fromDate: string; expected: number; low: number; high: number;
  horizonWeeks: number; retestAt: string | null;
  levers: { name: string; delta: number; grade: string }[];   // Projection.contributions
  history: { date: string; value: number }[] } | null;        // lab readings of this code, oldest first
```

- `input` comes from today's data: sleep from `daily_logs.sleepHours`,
  moves from the due protocol items and their `habit_logs` (the same rows
  `planTodayBody` counts, `itemId` not null), kcal and protein from today's
  meals (`dayTotals`), blood from the counts the existing `status` block
  uses (reuse that function; do not re-classify), genes from `genesLayer`.
- `genesLayer(verdicts)` in `lib/score.ts`: null with no genome file, else
  `round(100 × (1 − raised / counted))`, where `counted` are verdicts with
  `absent` false and `raised` are those with `direction "up"` and grade A
  or B. ponytail: a naive share; replace with per-condition weights when the
  owner wants the genes bar to mean more. Tested.
- `sleep.stages` from `daily_logs.wearable` if HealthKit stages are stored
  there; else `stages: []`. Read `lib/healthkit.ts` to find the shape.

New `GET /api/score/days?to=YYYY-MM-DD&n=91` (n clamped 1–91, `to` defaults
to today). It returns `ScoreDays`:

```ts
export interface ScoreDays {
  days: {
    day: string;
    score: number | null;
    life: number | null;
    blood: number | null;
    genes: number | null;
    draw: boolean; // a lab draw was observed that day
    reason: { text: string; sub: string; effect: number | null } | null;
  }[];
}
```

- `lib/score-days.ts` loads the window once (daily_logs, habit_logs with
  their items' schedules, meals, lab readings up to `to`, the genome
  verdicts) and runs `scoreOf` per day. Blood as of a day uses the latest
  lab value per code observed on or before that day, classified by the same
  function as A3. Pure part `daysFrom(rows, window)` is tested without a DB.
- `reason`: the row whose weighted contribution changed most against the
  previous day with a score. Text templates, code only (principle 3):
  `Sleep 5h 40`, `Moves 3 of 5`, `1 240 of 1 900 kcal`, `Protein 62 g`,
  and on a draw day `Blood draw: LDL 168 → 131` (the marker that moved the
  most). `sub` is the row label (`Lifestyle` or `Blood`). `effect` is
  `score − previous score`; null on the first day. Null reason when the day
  has no score.
- Days with no data at all return `score: null` and draw as future cells
  do: no fill.

### A4. Meals: edit, delete, read again

- Migration (additive): `meals.servings real not null default 1`. Totals
  are the item sums times `servings`. Change `mealRowOf`, `toApiMeal`,
  `dayTotals` accordingly; add `servings` to `ApiMeal`.
- `PATCH /api/meals/[id]` `{ label?, time?, servings?, items? }`:
  - `servings` in steps of 0.5, from 0.5 to 4, else 400.
  - `items` replaces the list (the phone sends the list after a removal).
    Each item passes the same zod shape as `MealItem`. An empty list is 400;
    delete the meal instead.
  - Owner check as `api/habits` does it. Returns `ApiMeal`.
- `DELETE /api/meals/[id]`: deletes the row and its photo file. Returns
  `{ ok: true }`.
- `POST /api/meals/[id]/reread` `{ note: string }` (1–500 chars): reads the
  stored photo again with `classifyPhoto(buffer, name, note)` and replaces
  items and label; servings reset to 1. 422 when the read finds no plate;
  the meal stays unchanged. Returns `ApiMeal`.
- After every write, the day's capture nutrition in `daily_logs.nutrition`
  is rebuilt from all capture meals of that day through `mergeNutrition`
  with `replaceSource` (read `lib/healthkit.ts:1099` and `addToDay` in
  `lib/meals.ts:233` first). A meal moved to another day rebuilds both days.
  HealthKit nutrition stays as it was.
- Tests: pure tests for servings arithmetic and the rebuild input;
  source-string checks on the three route files (the house pattern, see
  `lib/thread-turn.test.ts:164`); `classifyPhoto` mocked for the reread
  logic.

### A5. Contract fixtures

- Add the new fields to `apps/simple/fixtures/api/today.json` and
  `meals.json`, and add `score-days.json` (91 days), by running
  `scripts/p32a-fixtures.ts` against a real account if the local DB is up.
  If it is not, write them by hand from the types. Real shapes, plausible
  values, no prototype strings.
- `lib/api-contract.test.ts` validates the new fixtures with its existing
  rules.

**Part A verify** (in `apps/simple`): `pnpm test` and `pnpm typecheck`
both green. `pnpm drizzle-kit generate` produces exactly one new
migration, `servings` only.

---

## Part B: iOS foundation (`apps/ios`)

### B1. Tokens, type and motion

- Add the Hybrid tokens to `docs/mockups/v4/system.css` in a new `:root`
  section headed `/* Hybrid (phase 37) */`: the colours, layer colours,
  status colours, and the three curves from the reference, under new names
  (`--plum-0`, `--plum`, `--plum-2`, `--plum-3`, `--mist`, `--paper`,
  `--paper-2`, `--paper-3`, `--card`, `--cream`, `--life`, `--life-lt`,
  `--blood`, `--blood-lt`, `--gene`, `--gene-lt`, `--h-green`,
  `--h-green-soft`, `--h-amber`, `--h-amber-soft`, `--h-rose`,
  `--h-rose-soft`, `--h-lime`, `--ease-spring`, `--ease-ispring`,
  `--ease-fly`). Keep every existing token. Run
  `python3 apps/ios/scripts/gen-design.py`; extend the script only if it
  cannot type a new kind (the curves).
- Space Grotesk (SIL OFL) from github.com/floriankarsten/space-grotesk,
  the variable TTF plus its licence, in `apps/ios/OpenVitals/Fonts/`. Add
  it to `UIAppFonts` in `Info.plist`. `Font.grotesk(_ size:, _ weight:)` in
  `Design.swift`, with tabular digits (`.monospacedDigit()`), scaling with
  Dynamic Type like `ovType`.
- `Motion.swift`: `enum Curve { ease, spring, ispring, fly, confetti }` as
  `timingCurve` factories taking a duration; `Motion.animate(_:reduce:)`,
  the Reduce Motion swap; `Mulberry32` (the prototype's generator, exact:
  seed 435 must give the same first five floats as the JS, write them into
  the test); `Grain.tile`, the 128 tile from seed 7.
- `DayColour.of(score) -> Color`: the hue and lightness rule, saturation
  68%. HSL to RGB by hand; test three scores against values computed from
  the CSS `hsl()`.

### B2. Api models and the old defects

- `Api.swift`: `Today.score`, `Today.sleep`, `Today.Goal.projection`,
  `ScoreDays`, `Meal.servings`; `Api.scoreDays(to:n:)`,
  `Api.patchMeal(id:label:time:servings:items:)`, `Api.deleteMeal(id:)`,
  `Api.reread(id:note:)`, `Api.setTargets(kcal:proteinG:)`.
- Fixed now because Hybrid needs them: `Design.clock` accepts fractional
  seconds (try `.withFractionalSeconds` first, then without). A test uses
  `"2026-09-01T07:18:24.094Z"`.
- Copy the new server fixtures into `apps/ios/Tests/Fixtures/` (and
  `score-vectors.json`), run `python3 apps/ios/scripts/gen-fixtures.py`,
  add the new names to `ContractTests`.

### B3. `Score.swift`: the port

`Score.of(_ input: ScoreInput) -> ScoreResult`, a line-by-line port of A1.
`ScoreTests` loads `score-vectors.json` and checks every vector. JS
`Math.round` rounds .5 up; use `(x + 0.5).rounded(.down)` so both sides
agree.

**Part B verify:**

```
cd apps/ios
xcodebuild -scheme OpenVitals -destination 'generic/platform=iOS Simulator' build
xcodebuild test -scheme OpenVitals -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Both green. `DesignTokensTests` and `ContractTests` pass.

---

## Part C: the Hybrid Today (`apps/ios`)

One model, `TodayModel` (`@Observable`, `@MainActor`), owns `today`,
`plan`, `meals`, `days`, the Do queue order, the previewed score, and the
island state. Views read it; they do not call `Api` themselves. Every
server write is optimistic: preview with `Score.of`, send, then reload
`today` and reconcile. A failed write rolls the preview back and shows a
receipt in the island ("Couldn't save · try again"); nothing fails silently.

Files, one responsibility each:

| file                  | holds                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `HybridToday.swift`   | `HybridTodayView` (the ZStack: header, shelves, Focus, sheet), `TodayModel`              |
| `ScoreHeader.swift`   | score, word, pill, layer bars, 21-day strip, 13-week grid, tooltip, `PlumClip` video     |
| `DoShelf.swift`       | pips, Focus button, the fanned stack, stamps, fly-to-header                              |
| `FocusDeck.swift`     | the full-screen table, stamps, chips, empty state, `Confetti`                            |
| `Shelves.swift`       | Today so far (food ring, sleep, moves) and Where it's heading (projection cards, levers) |
| `MealEditSheet.swift` | the sheet                                                                                |
| `Island.swift`        | `IslandModel`, `IslandOverlay`, `PlateActivityAttributes` (shared with the extension)    |
| `OpenVitalsIsland/`   | the Widget Extension: Live Activity views                                                |

Mount: `Shell` shows `HybridTodayView()` for the Today tab. `TodayView.swift`
stays in the repo, unmounted, until the owner says delete it.
`TodayViewRedesign.swift` is untracked and not ours: never edit or delete
it.

Data mapping:

- **Header:** `today.score.result` (score, word, layers); the three bars
  are life, blood, genes (a null layer draws an empty track and the word
  "no data"). Strip = last 21 of `days`; grid = 13 weeks ending on today's
  week; today's cell uses the live score. Why line: the run rule from the
  reference. Tooltip from `days[i].reason`.
- **Do now:** `plan.rows` where `itemId != nil && !done`, in plan order.
  Later moves a card to the back, locally. ponytail: the Later order is not
  saved; save it when the owner asks. Pips: all `itemId` rows; a tap on a
  done pip unticks it (`Api.tick(done: false)`). "for …" chip: the row's
  `why`. Glyph by `tag`: protocol `pills`, goal `target`, every day
  `figure.walk`.
- **Tick gain (+N):** `Score.of` with moves done + 1, minus the current
  score.
- **Today so far:** the food ring against `score.targets.kcal`; "estimated"
  under the number when `targets.estimated`; with no target the ring is
  full-track and the centre says kcal only. Protein rail against
  `targets.proteinG`. Meal thumbs from `meals` (photo via the existing
  photo URL). Sleep card from `today.sleep`, the hypnogram only when
  `stages` is not empty. Moves card from `plan.rows`.
- **Where it's heading:** goals with a `projection`, sorted by
  `|expected − from| / from`, descending. Chart: `history` then the dotted
  line to `expected` at `from + horizonWeeks`. Levers: each
  `projection.levers` row is a pill, all on at first. Toggling one moves the
  landing to `from + Σ enabled deltas`, clamped to `±maxChange[code] ×
horizonWeeks / 12`. X scale in days from the first history date; Y scale
  from the reference formula.
- **Meal sheet:** opens on a meal thumb. Portion stepper calls
  `patchMeal(servings:)` after 600 ms without a tap (one call per burst).
  Remove row → `patchMeal(items:)`; the last row cannot be removed (Delete
  is the way). Fix results → `reread(note:)`; the shimmer runs until the
  answer. Delete → confirm → `deleteMeal`. Name and time commit on submit.
  The live chip uses `Score.of` with the edited kcal and protein.
- **Target entry:** when `targets.kcal` is null, the food card shows "Set a
  target", which opens a small inline form in the meal sheet's style (two
  number fields, Save → `setTargets`). The same form opens from a long
  press on the ring.

### C1. Header and shelves (no interactions yet beyond scroll and calendar)

`HybridTodayView` with `ScoreHeader` (strip, calendar expand, tooltip,
video, scroll-shrink of the score), `Shelves.swift` both shelves with lean
and lag, the Do shelf drawn static (stack fanned, no drag), the glass tab
bar unchanged from `Shell`. Grain on cream surfaces only.

### C2. Do shelf and Focus

Drag, stamps, thresholds, Later, the fly to the header, `settleScore` with
every step in the reference order, the pill, today's cell flash, the moves
row landing, confetti on an empty pile, haptics. `FocusDeck` opens from the
stack rectangle and closes back into it; after close, `settleScore`.

### C3. Meal sheet and targets

As in the data mapping. Ingredient row swipe with the reference
thresholds. Removal collapses in 320 ms. Delete confirm inline.

### C4. The island

- `IslandModel` (on `Shell`, in the environment): `show(_ activity:)` with
  one of `.reading(ReadingState)`, `.receipt(title:sub:score:)`,
  `.allDone(streak:)`, `.failed(message:)`. A new activity replaces the
  current one. Receipts collapse after 2.6 s; a finished read holds 2.6 s.
  `islandPush: CGFloat` is how far the Today header moves down: until it
  clears the island's bottom edge (island bottom + 8 − safe-area top).
- `IslandOverlay` draws the shapes and timings from the reference and the
  geometry above.
- Capture: move `send()` out of `CaptureView` into a `CaptureRun` on the
  island model. Send dismisses the sheet at once; the island reads; the
  result lands in the island and `TodayModel` reloads. A failure keeps the
  photo and text, and a tap on the failed island reopens `CaptureView` with
  them. Questions (`Api.ask`) keep today's in-sheet answer; they are not a
  plate.
- Live Activity: new target `OpenVitalsIsland` (Widget Extension, iOS 17,
  bundle id `com.chocksy.OpenVitals.Island`), embedded in the app. Add it
  by editing `project.pbxproj` with a synchronized folder, like the existing
  targets. `INFOPLIST_KEY_NSSupportsLiveActivities = YES` on the app.
  `PlateActivityAttributes.ContentState { phase: reading/done/failed,
progress: Double, title: String, sub: String }`. Views: Lock Screen
  banner; Dynamic Island compact (leading `fork.knife` in lime, trailing the
  percent or the kcal), minimal (the ring), expanded (title, sub, the bar),
  all plum and lime on black. Started in `CaptureRun` on Send when
  `ActivityAuthorizationInfo().areActivitiesEnabled`, updated with the
  progress, ended with the result, `dismissalPolicy: .after(now + 4 s)`.

### C5. Gallery mock and screenshots

- `Mock.hybrid` in `Gallery.swift`: `HybridTodayView` fed a fixture
  `TodayModel` built from the prototype's data (score 72, the three meals,
  five moves with two done). This is the only place prototype data lives.
- `SnapshotTests`: a render test that `Mock.hybrid` produces a non-empty
  390-wide image and `testWriteTheScreenshots` dumps it. No pixel diff
  against the HTML: the video, grain and fonts differ by design.
  ponytail: visual check by eye against the HTML; add a pixel diff of the
  header once it is stable.

**Part C verify:** the Part B commands, both green. Then run the app with
fixtures on the iPhone 17 Pro simulator (`-OVFixtures YES`), screenshot
Today, and compare it by eye with `48-hybrid.html` in Safari: header,
shelves, a tick with the fly, Focus open, the meal sheet, the island open
over a moved header. Screenshots in `/tmp/p37/`.

---

## Order and parallelism

1. **A** (server, all of A1 to A5) and **B1** (tokens, font, motion) run in
   parallel: they touch different trees.
2. **B2 + B3** after A5 (they need the new fixtures).
3. **C1**, then **C2** and **C3** (C2 and C3 in parallel, different files),
   then **C4**, then **C5**.
4. The main agent reviews each diff and re-runs the verify commands before
   the next step starts.

## Review focus

The inputs no task's happy path covers, most likely to bite first:

1. **A new user with no data.** Score null, no targets, no plan rows, no
   days. The header shows "—" and "no score yet"; the Do shelf shows the
   empty card with "Nothing planned today"; no view crashes on an empty
   array. C1 adds a fixture test for it.
2. **A tick that fails offline.** The card has flown and the score counted
   up. The rollback must return the card to the front and the score to the
   old number, and the island says so. C2 tests the model path.
3. **Two fast ticks.** The second starts while the first flies. The queue
   and score must end right; `settleScore` runs per tick, not per burst.
   C2 tests two ticks in a row on the model.
4. **A meal edit racing a reload.** A portion burst while `today` reloads
   must not snap the stepper back. The model keeps the edited meal until
   its PATCH returns. C3 tests it.
5. **A day with no score in the middle of the strip.** It draws as an
   empty cell, the run counts stop there, and the tooltip says "No data".
   A3 has a pure test for a gap; C1 renders one in the gallery mock.

## Later (not this phase)

- The web home in the Hybrid look, using the same system.css tokens.
- Blood, Body and Plan tabs in the shelf pattern.
- Dark mode for the Hybrid palette.
- The rest of the phase 36 defects: 44 pt ticks on Plan, Adopt, suggestion
  dedupe, `itemId` on goal moves, workouts on Body.
- Push updates for the Live Activity.

## As built (Part A, 2026-09-24)

- `sleep.stages` is always `[]`, and `bed` and `wake` are null. HealthKit
  stores minutes per stage, not intervals. The sleep card shows hours only
  until the sync stores intervals.
- A meal can't move to another day. `PATCH` has no `day` field.
- `genesLayer` returns null when no verdict counts.
- Reason rule: each row costs `w × (100 − row)`, where one Lifestyle row
  weighs 0.4 / 4. The row whose cost moved most since the previous scored
  day wins. Blood competes only on a draw day.
- A day scores only with sleep hours, a tick, a meal or a draw.
- `PUT /api/targets` accepts kcal 800–6 000 and protein 10–400.
- Risk accepted: an edit rebuilds the day's capture entries from the
  `meals` rows. Capture entries from before the `meals` table have no meal
  row, so they drop on the day of an edit. HealthKit entries stay. Nobody
  uses the app yet.

## As built (Part C, 2026-09-24)

- The status bar hides while the island is open on an island phone. The
  time would draw over the black shape. On a phone without an island the
  pill sits under the status bar, so it stays.
- A failed read collapses after 2.6 s, like a receipt. `IslandModel` keeps
  the photo and the words as `draft`. A tap on the failed island while it
  is open, or the next tap on +, opens `CaptureView` with them. Once it is
  collapsed the header push is back to 0 and the status bar shows.
- Today's score and the calendar's last cell share one input builder,
  `inputOn` in `lib/score-days.ts`. Blood is `bloodAsOf` over `labsOf` (the
  newest reading per marker on or before the day); moves are `movesOn` over
  the items `occurrenceItemOf` maps (an item counts from its start, else
  the day it was adopted). The Status block keeps the ledger's counters.
- A tick buzzes `.success` only when it lands with its write still good. A
  write that fails before the card lands rolls back and lands with no
  haptic. Focus settles only at the close, so it buzzes when the server
  confirms each tick.
