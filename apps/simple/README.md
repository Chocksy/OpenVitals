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

## Pages

`/` home dashboard, `/biomarkers` searchable list, `/m/[code]` trend + history,
`/insights` AI retest panel and lifestyle plan, `/chat` streaming Q&A over your
own numbers, `/uploads` import history, `/review` the curator's open questions,
`/admin` data state (admin only). Everything except `/login` lives in the
`app/(app)` route group, whose layout always renders the nav.

## Tables

New: `metrics`, `uploads`, `readings`, `simple_insights`, `checkins`,
`review_items`, `curator_runs`.
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
