# Health sums: history in one pass, quiet when locked

## Why

`b8208d0` sends summed types (steps, active energy, exercise minutes, distance,
flights, dietary) as Health's own per-day sums, and drops their anchors once so
the history resends. But with no anchor, `HealthSyncModel.sync(spec)` still
walks every raw sample through `HKAnchoredObjectQuery` (2000 per page, 200 pages
per run) only to learn which days changed. The Watch writes active energy about
once a minute, so 2017 to now is millions of samples: the owner's first sync
never got past 2026-09-03 for active energy. For a summed type the raw walk is
pointless when there is no anchor: every day with data needs sending anyway.

Second: a background run on a locked phone fails every type with "Protected
health data is inaccessible" (`HKError.errorDatabaseInaccessible`). Each type
then shows a red error line in Settings although nothing is wrong.

## Change (apps/ios/OpenVitals/HealthSync.swift only, plus tests)

1. **Summed type with no anchor** (`HK.isCumulative(spec)` and
   `state.anchorData(id) == nil`), inside `sync(spec)` before the page loop:
   - Take the anchor first: an `HKAnchoredObjectQuery` with anchor nil,
     limit `HKObjectQueryNoLimit`, predicate
     `HKQuery.predicateForSamples(withStart: Date(), end: nil, options: [])`
     (so it returns next to nothing) and keep its `newAnchor`. Taking it
     _before_ reading sums means a sample written during the read is caught by
     the next anchored run, not lost.
   - Read sums for every day from `store.earliestPermittedSampleDate()` to now,
     reusing the existing statistics path (`readSums`) with one window over the
     whole span, one-day buckets anchored at local midnight. Buckets with no
     sum are skipped already.
   - `post(...)` them (it batches whole days), then
     `state.commit(id, anchor: thatAnchor, sent: n, resumed: ..., at: Date())`
     and return. No page loop.
   - If the anchor query returns nil anchor, fall through to the existing page
     loop (today's behaviour).
   - The "recent 7 days first" pass in `run` stays as is.
2. **Locked phone:** in `run`, when a type's error is `HKError` with code
   `.errorDatabaseInaccessible`, do not `state.fail` it and do not add it to
   `outcome.failed`; stop the run (the other types would fail the same way),
   and set `status` to a short line such as "Waiting for the phone to be
   unlocked." Anchors are untouched, so the next run picks up. Apply the same
   rule in the recent-7-days loop. Add a pure helper
   (e.g. `Retry.locked(_ error: Error) -> Bool`) and a unit test for it.
   Keep one-sentence comments in the file's voice.

## Hard constraints

- No server change. No commit, no push, no TestFlight upload.
- Do not change non-summed types' path.
- Keep the diff small; no new files other than tests if needed.

## Verify

- `cd apps/ios && xcodebuild test -project OpenVitals.xcodeproj -scheme OpenVitals -destination 'platform=iOS Simulator,name=iPhone 17'`
  must pass (336 now, plus new tests).
