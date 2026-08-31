# Phase 23c: workouts in, and windows for the data the phone already sent

Owner feedback (2026-09-01): "I do not see any exercise and food data…
I actually am doing exercises 3 times a week for years. Can we make
sure we get more of the data?" Verified against prod: 862 wearable days
and 65 nutrition days are stored but almost nowhere rendered, and
HKWorkout (the thing "exercise 3×/week" actually is in Apple Health) is
not synced at all. Three fixes: sync workouts, render what we have,
and let exercise feed the engine.

Runs AFTER phase 23b lands (same files: HealthSync.swift, the sync
route). Two halves again: `apps/ios` and `apps/simple`.

## 1. iOS: workouts and the two distance types

- Add `HKObjectType.workoutType()` to the sync with its own anchor
  book, background delivery like the others. Wire shape stays the
  existing sample: `type: "HKWorkout"`, `unit`: the activity name
  (`strengthTraining`, `running`, `walking`, `cycling`, `swimming`,
  `yoga`, `hiit`, else the raw `HKWorkoutActivityType` name),
  `value`: duration in minutes, `start`/`end` with local offsets, and a
  second sample `type: "HKWorkoutEnergy"`, same start/end, `unit:
"kcal"`, `value`: active energy of the workout when present. Two flat
  samples beat changing the wire shape.
- Move `DistanceWalkingRunning` (km) and `FlightsClimbed` (count) from
  seen-not-used into the daily aggregates.
- Tests: workout sample building (name mapping, minutes, the paired
  energy sample), anchors per type as before.

## 2. Server: store, tick, and mint the exercise fact

- `lib/healthkit.ts`: `HKWorkout`/`HKWorkoutEnergy` → the day's
  `daily_logs.wearable.workouts: [{ type, min, kcal? }]` (merge by
  overlapping start/end); distance and flights into `wearable`.
- **Habit ticks**: a workout auto-ticks a habit whose name matches the
  activity (the mindful-session matcher pattern: strength/gym/lift,
  run/jog, walk, cycle/bike, swim, yoga). Adherence is what projections
  read, so training now counts without manual ticking.
- **The exercise fact**: mint `exercise_days_week` as an ASKED entry
  (question "How many days a week do you exercise on purpose?",
  options 0 / 1–2 / 3–4 / 5+, `revisitDays: 180`, sourced: WHO 2020
  activity guideline). The sync refreshes it as `source: "system"`
  from the trailing 28 days of workouts (≥ 20 min counts a day),
  writing only when the bucket changes so history stays clean. A
  system write must not fight a manual answer: manual (`source:
"user"`) wins for its revisit period, the sync only fills gaps or
  updates system-sourced values.
- Check what reads it: `low_fitness_sarcopenia` and the lifestyle
  lens; add one graded evidence rule only if a source exists (e.g.
  self-reported inactivity as a weak marker of low CRF — grade C with
  an honest source line), otherwise leave it as a vector/fact the
  report and graph read. Do not invent LRs.

## 3. Windows: show what the phone sends

- **`/today`**: a wearable strip on the day view: steps, exercise
  minutes, active kcal, distance, flights, sleep with stages, and the
  day's workouts by name and minutes; a nutrition line (kcal + macros,
  "estimate" label when `estimated`) when the day has one. Reuse the
  tracker's visual language; no new chart lib.
- **Home**: the Lifestyle system card should reflect fresh wearable
  data (resting HR, sleep, exercise days) instead of "never measured"
  — verify the new readings/facts flow into the vectors there and fix
  the wiring if a code mismatch hides them (claim-verification rule:
  read `lib/vectors.ts` codes vs what the sync writes: resting HR
  lands as `resting_heart_rate` readings and `resting_hr` fact — make
  sure the vector reads the one that is actually written).
- **`/m/[code]`** for the wearable metrics: hrv_sdnn, resting HR,
  sleep_duration, wrist_temp already have readings; confirm they list
  under Labs/Biomarkers and have sensible ref ranges (add `BOUNDS` /
  optimal bands with sources for the new codes where missing).

## 4. Verification

Server: typecheck, tests (baseline from post-23b; higher), a fixture
sync batch with two workouts + energy + distance + flights → paste the
daily_logs row and the habit tick; `exercise_days_week` fact refresh
proven (28-day fixture → "3–4"). eval:journeys and eval:compose
unchanged. Screenshots to `/tmp/p23c/`: /today with the wearable strip
and a workout, Home Lifestyle card. iOS: xcodebuild build + test green;
state plainly what needs the owner's device. Report the usual.
