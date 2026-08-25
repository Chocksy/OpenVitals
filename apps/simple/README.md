# simple

A lean personal biomarker tracker. Upload a lab PDF, get readings, trends, an AI
lifestyle plan and a retest plan. It runs against the same Postgres as the old
`apps/web` app and never touches the old tables except to read them once.

## Local run

```bash
cp apps/simple/.env.example apps/simple/.env   # fill in OPENROUTER_API_KEY
pnpm install
pnpm --filter simple db:migrate                # creates the 5 new tables only
pnpm --filter simple import-legacy             # copies metric_definitions + observations
pnpm --filter simple dev                       # http://localhost:3001
```

`import-legacy` is idempotent. It also runs automatically on the first request
if `readings` is empty.

Duplicate legacy codes for the same biomarker (`mch` and
`mean_corpuscular_hemoglobin`, `alt` and `alt_tgp`, ...) collapse onto one
canonical code, see `lib/merge-metrics.ts`. To re-apply the mapping to a
database that was imported earlier:

```bash
pnpm --filter simple import-legacy --reset     # truncates readings + metrics only
```

That flag touches nothing but the two tables the importer owns. `uploads`,
`simple_insights` and `checkins` survive. Readings that came from a PDF upload
are deleted with everything else in `readings`, so re-upload any PDF you
imported since the last reset.

## The curator

`lib/curator.ts` keeps metric identity, units and ranges healthy. It runs after
every upload, once a day from `instrumentation.ts`, and on demand:

```bash
pnpm --filter simple curate                    # all users, trigger 'manual'
```

Six checks. Three fix themselves (unit spelling, known unit conversions, a
missing reference range copied from the same metric's previous draw). Three ask
you first, in `/review`: a unit it cannot convert, a minted metric that may
duplicate a catalog one, an optimal range it looked up, a value 50x outside its
range. It never deletes a reading on its own; the one delete path is you
answering "Delete this reading".

Every run writes a `curator_runs` row with per-check `{checked, fixed, queued}`.
`/admin` (visible only to `ADMIN_EMAIL`) shows the data state, the last 20 runs,
the remaining unit mismatches and the minted metrics.

## The self-improvement loop

Labs tell you where you are. The tracker is how you move.

- `/today` is the fast screen: tick the protocol off, type six numbers, pick
  energy and mood 1-5. Everything autosaves on blur. Arrows walk back a day
  (`?d=YYYY-MM-DD`). A streak counter and a 52-week consistency heatmap sit on
  the same page.
- `/protocol` holds what you have decided to do. Items arrive from a lifestyle
  plan ("Add to protocol" on `/insights`) or by hand. Each shows its 30-day
  adherence strip. The first time the page loads empty, every lifestyle item you
  answered "Did it" is adopted for you.
- `/goals` is one target band per biomarker. Set it from `/m/[code]`; the band
  is drawn on the trend chart and the curator closes the goal when a reading
  lands inside it.
- `/trends` charts sleep, weight, steps, exercise, alcohol and energy/mood over
  30, 90 or 365 days with a 7-day rolling average, and marks your blood draws in
  red so you can see what you were doing before each one.
- `/labs` is one card per draw: date, result count, flagged dots, source file,
  and the full list on click.
- The weekly review (`kind = 'weekly'` in `simple_insights`) is an honest coach
  reading your week against the one before it: 3 wins, 3 concerns, 3 actions you
  can adopt into the protocol in one click, plus adherence and per-metric notes.
  The Monday timer in `instrumentation.ts` writes one per user per week; the
  button on `/insights` writes one on demand.

## Export

`GET /api/export.csv` is every reading with its flags. `GET /api/export-daily.csv`
is the daily log. Buttons on `/uploads` and `/admin`. Nothing here is a lock-in.

## Pages

`/` home dashboard, `/today` the tracker, `/biomarkers` searchable list,
`/labs` the draw timeline, `/trends` daily-log charts, `/protocol` your habits,
`/goals` target bands, `/m/[code]` trend + history + goal, `/insights` weekly
review, AI retest panel and lifestyle plan, `/chat` streaming Q&A over your own
numbers, `/uploads` import history, `/review` the curator's open questions,
`/admin` data state (admin only). Everything except `/login` lives in the
`app/(app)` route group, whose layout always renders the nav. Below 1280px the
Labs / Trends / Protocol / Goals links fold into a "More" menu.

## Tables

New: `metrics`, `uploads`, `readings`, `simple_insights`, `checkins`,
`review_items`, `curator_runs`, `daily_logs`, `protocol_items`, `habit_logs`,
`goals`.
Reused as-is: `users`, `sessions`, `accounts`, `verifications`.
Read once, never written: `metric_definitions`, `optimal_ranges`, `observations`.

The AI plans live in `simple_insights` rather than `insights`, because the old
app already owns an `insights` table with an incompatible shape and this app is
not allowed to alter it.

`db/auth-schema.ts` is deliberately excluded from `drizzle.config.ts` so
`drizzle-kit` can never generate CREATE, ALTER or DROP for the auth tables.

## Cutover on Coolify

1. Point the application at the `simple` branch.
2. Change the compose file to `docker-compose.simple.yml`.
3. Keep the existing env vars. Add `AI_OCR_MODEL` if you want a different OCR
   model, `ADMIN_EMAIL` for the `/admin` page, and set `BETTER_AUTH_URL` to the
   public URL.
4. Deploy. The `web` container runs `db:migrate && import-legacy` before
   starting, so the new tables are created and backfilled on the first boot.
5. The old tables stay in place. Roll back by pointing the app at `main` and
   `docker-compose.prod.yml`; nothing was dropped.
