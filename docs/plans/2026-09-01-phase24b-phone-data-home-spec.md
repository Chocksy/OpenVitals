# Phase 24b: phone data gets its own home

From the UX audit (finding 3). Everything in `apps/simple`. Ponytail.
Verified facts: `getDraws` (`lib/daily-data.ts:387`) groups all readings
by day with no `source` filter → "3266 blood draws";
`FACT_FROM_READING` (`lib/healthkit.ts:910`) rewrites `resting_hr` as a
dated fact whenever the value changes, i.e. daily, spamming
`profile_fact_history`; Today shows partial-day aggregates with no "so
far"; the consistency heatmap counts any daily_logs row.

## 1. Draws are labs

`getDraws` filters `source is null` (lab draws) — wearables never appear
as draws. Subtitle stays "N blood draws". Test: a fixture with lab and
healthkit rows on the same day yields one draw with only the lab
readings.

## 2. A "Phone" tab under Labs

Fourth tab `PHONE` (`/labs/phone`): one row per wearable metric with a
90-day daily line (reuse `MiniSparkline`/`trend-chart` pieces; no new
lib), latest value with its band chip, and the count + span ("776
nights since 2022-05-29"). Rows: resting HR, HRV, sleep, SpO2,
respiratory rate, walking HR, VO2max, weight, body fat, waist, wrist
temp, glucose (device), steps, exercise, active kcal, workouts. Tapping
a metric opens `/m/<code>`, which for wearable codes draws a **daily
line** over the period (not dots), with the same band, and a range
switch 30 / 90 / 365 / all. The Biomarkers tab keeps listing them (they
are biomarkers) but their row says "from your phone" in the source
column.

## 3. System facts stop writing history

Continuous signals (`resting_hr`, `vo2max_est`, `waist_cm` from the
scale/tape, `exercise_days_week`) are **derived at read time** for the
engine, not written as dated facts on every sync:

- `buildModelInput` overlays `profile[key]` from the trailing 7-day
  median of the corresponding wearable readings when no _user_ fact is
  newer than 30 days (user answers still win).
- The sync stops calling `writeFact` for these keys. Existing
  `system`-sourced history rows from the last two days of churn get one
  cleanup script (`scripts/collapse-system-facts.ts`, idempotent): keep
  the first and the latest row per key, mark the rest deleted? No — the
  history table has no soft delete; delete the intermediate
  `source='system'` rows for these four keys only, keeping first and
  last. Print counts. Owner OK'd cleanup of this kind of noise in
  principle; still print before/after and stop if any non-system row
  would be touched.
- `exercise_days_week` keeps a monthly system write (it is a bucket,
  not a stream) — unchanged from 23c, but the write is at most once per
  28 days.

Tests: the overlay picks the median and yields to a fresh user answer;
a simulated daily sync writes zero fact-history rows.

## 4. Today tells the truth about time

- Partial day: header "so far · synced 06:18" on the strip; a second
  strip above it for **yesterday** (complete) when today is < 12 h old
  or has < 1,000 steps. Sleep shown belongs to last night and says so.
- Quick Numbers read the same daily row the cards read (sleep filled
  when `sleepHours` exists), so the two never disagree.
- Consistency heatmap counts **human** input only (habit ticks, quick
  numbers typed, notes, posts); a small toggle "phone" shows wearable
  coverage instead. Streak follows the human count.

Tests on the pure day-selection and heatmap counting.

## 5. History lane

The facts lane hides `system`-sourced facts by default (a toggle "show
phone-derived") so the lane is what the person said, not what the watch
measured. Markers lane unchanged.

## 6. Verification

typecheck; vitest (higher than baseline); `eval:journeys` 25/25;
screenshots to `/tmp/p24b/`: Draws (labs only), the Phone tab,
`/m/sleep_duration` daily line, Today with yesterday + "so far",
History with system facts hidden. Report: files changed, the cleanup
script's before/after counts on the local DB, deviations.
