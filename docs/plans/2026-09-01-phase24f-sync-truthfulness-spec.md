# Phase 24f: the Sync tab tells the truth

From the UX audit (finding 7). The full resync worked (12,119 readings,
3,260 days, 776 nights of sleep) but the app said "7 things" and
"failed". `apps/ios` plus one small server addition.

## 1. Totals that match the server

- `GET /api/sync/healthkit` (new, session-auth): returns
  `{ readings, days, firstDay, lastDay, perType: { code: { count,
first, last } } }` for `source = 'healthkit'`, plus daily_logs
  wearable day count. Cheap aggregate query; cached 60 s.
- Sync tab header: "12,119 readings · 3,260 days · since 2022-05-29",
  from the server, not from the local audit. Per-type rows show the
  server count next to the local last-sent, so a type with 776 rows
  never reads as "7".

## 2. Progress while it runs

- `resyncEverything()` and the normal sync publish progress
  (`typeName`, `pagesDone`, `oldestDaySeen`, `batchesSent`,
  `batchesFailed`) to an observable; the tab shows one line: "Sleep ·
  reading 2023-04 · 41 batches sent". A determinate bar per type is
  overkill; one live line is enough.

## 3. Retry, and the word "resumed"

- A failed batch POST retries 3× with backoff (1 s, 4 s, 16 s) before
  the type is marked failed; a retry that succeeds is not an error.
- The audit line distinguishes "failed (will resume next sync)" from
  "resumed after retry". The anchor logic already never advances on
  failure; assert it in a test with a flaky transport seam.
- Background delivery frequency: `.immediate` for glucose only, `.hourly`
  for the rest (owner left this open; glucose is the one where minutes
  matter).

## 4. Verification

`xcodebuild build` + `test` (new: progress publishing, retry/backoff via
the transport seam, totals decoding). Server: vitest for the aggregate
route (fixture), typecheck. Screenshots: Sync tab against the local dev
server with fixture totals. Say plainly what needs the owner's device.
