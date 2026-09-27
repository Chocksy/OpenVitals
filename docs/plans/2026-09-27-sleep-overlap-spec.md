# Sleep: count time covered, not samples summed

## Why

The owner's night of 2026-09-26/27 was 6h 46m in Apple Health (awake 2m,
REM 1h 26m, core 4h 5m, deep 1h 15m). Halewell shows 13h 32m: exactly
twice. `aggregate` in `apps/simple/lib/healthkit.ts` adds each sleep sample's
minutes (`durationMin`) into the day's total and into `stages`. When two
sources write the same night (the Watch plus an app that copies or writes its
own stages), every minute counts twice. The same holds for any duplicate
sample in one POST. Apple Health itself shows the time covered.

## Change (server, pure, in `lib/healthkit.ts`)

For `SleepAnalysis` only (`MindfulSession` also uses `durationMin`; give it
the same union treatment only if it falls out for free, else leave it):

1. Collect the sleep samples per night (`sleepDay`) as intervals
   `{from, to, stage}` instead of adding minutes on the spot.
2. Per night, resolve overlaps by stage priority: deep, rem, core, asleep
   (unspecified), awake, inBed. A higher stage claims its time first; a lower
   stage only counts the minutes no higher stage already covers. Time covered
   by two samples of the same stage counts once. Implement as a small pure
   helper (e.g. `stageMinutes(intervals) -> Record<stage, minutes>`), sweep or
   interval union, no dependency.
3. The night's `stages` record comes from that helper (rounded minutes as
   today). The `sleep_duration` reading is deep + rem + core + asleep (the
   asleep stages only, as today), still checked against `plausible`
   `[30, 1080]`. `samples` on the reading stays the sample count.
4. Everything else in `aggregate` is unchanged. The server still replaces whole
   days per POST.

Tests in `lib/healthkit.test.ts` (match the file's style, the `sample`/`at`
helpers):

- the same night sent twice (identical samples, two different
  `sourceBundle`s) gives the one-night totals, not double;
- a Watch night plus an overlapping `asleepUnspecified` sample from another
  app: stages keep the Watch split, total does not grow past the covered time;
- the existing sleep tests still pass unchanged.

## Phone: resend sleep history once

In `apps/ios/OpenVitals/HealthSync.swift`, `HealthSyncModel.init` already
calls `state.rereadOnce(..., version: "sums1")`. Add one more call that drops
the `HKCategoryTypeIdentifierSleepAnalysis` anchor once, version `"sleep1"`,
with a one-line comment (the server now counts covered time; old nights are
stored doubled until resent). Extend the existing
`testSummedTypesAreReadAgainOnceAfterTheSwitch` or add a sibling test.

## Hard constraints

- No commit, no push, no TestFlight upload.
- No new dependencies. Minimal diff. Comments in the file's voice.

## Verify

- `cd apps/simple && npx vitest run` all pass (2030 now, plus new).
- `cd apps/ios && xcodebuild test -project OpenVitals.xcodeproj -scheme OpenVitals -destination 'platform=iOS Simulator,name=iPhone 17'`
  all pass (338 now, plus new).
