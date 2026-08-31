# Phase 17b: prod cutover to Coolify, with the jobs that keep it fresh

Owner ask (2026-09-01): "make the arrangements and push to coolify so
our changes are there and make sure our scheduled jobs also are setup
properly."

Facts (verified 2026-09-01): the Coolify app `openvitals`
(`j44wow4ogcg88w8gk480cwg4`, instance dash.chocksy.com) builds
`Chocksy/OpenVitals` branch `main` with build pack `dockercompose` from
`/docker-compose.prod.yml`, which builds `apps/web` + the ingestion
worker + its own `postgres:16-alpine` on the `pgdata` volume — that
volume IS the production data (our local DB is a copy of it).
`apps/simple/Dockerfile` already exists (single stage, standalone
build, `db:migrate && import-legacy && next start` on boot). Env keys
already on the app: POSTGRES*\*, BETTER_AUTH*\*, NEXT_PUBLIC_APP_URL,
OPENROUTER_API_KEY, AI_DEFAULT_MODEL, ENCRYPTION_KEY (+ legacy render
ones).

## 1. `docker-compose.simple.yml` (repo root, new file)

Services:

- `postgres`: byte-for-byte the same service and `pgdata` volume as
  `docker-compose.prod.yml` — same image, same volume name, so the
  existing production data mounts unchanged. Do not touch
  `docker-compose.prod.yml` itself (rollback = flip the compose path
  back).
- `web`: build `apps/simple/Dockerfile`, port 3000, env from the
  existing keys (DATABASE_URL composed the same way) plus
  `SEMANTIC_SCHOLAR_API_KEY` (optional, empty default). Healthcheck on
  `/api/auth/ok` or whatever cheap route exists (check; else the login
  page). Depends on postgres healthy. A named volume for uploads if
  `apps/simple` stores files on disk — read `lib/uploads.ts`/blob
  handling first and only add the volume if files actually land on the
  filesystem; if uploads live in Postgres, no volume.
- No worker service: the simple app has no ingestion worker.

`import-legacy` must be idempotent on a DB where it already ran (it is
designed to read once; verify the guard exists, and if it re-imports on
every boot, gate it behind a marker table check or an env flag).

## 2. One-time knowledge imports (`scripts/prod-init.md` — a runbook, not code)

The knowledge tables (hkb_terms 51,943, hkb_annotations 285,455,
kg Monarch edges, NCD-RisC priors, RO prices, catalog seed, ring-2
build) exist locally but NOT in prod (prod pgdata predates them —
verify with one query per table before assuming). Write the exact
ordered command list to run inside the deployed web container
(`coolify` exec or SSH + docker exec), using the existing pnpm scripts:
`db:migrate`, `hkb:seed`, `hkb:import-ontology`, `hkb:ring2-build`,
`hkb:import-priors`, `hkb:import-prices`, `kg:import-monarch`,
`kg:seed` — check each script's real name and inputs (some need
downloaded HPO/MONDO/HPOA files: say where they come from and roughly
how big). Alternative path if downloads inside the container are
painful: `pg_dump --data-only` of just the knowledge tables from the
local copy piped into prod, with the exact table list and the caveat
that local person-rows must NOT be in that list. Recommend one path.

## 3. Scheduled jobs (Coolify Scheduled Tasks on the app, via API)

List the exact tasks to create (name, command, cron), to be created by
the main agent through the Coolify API after deploy:

- `research-monthly`: `pnpm --filter simple hkb:research` — `0 6 1 * *`
  (staleness picker + CONTESTED from phases 21b/22).
- `guideline-watch`: `pnpm --filter simple hkb:research --guidelines`
  — `0 6 15 */3 *` (phase 22; only if the flag landed).
- `projections-remake`: whatever CLI phase 19/22 exposes for re-making
  open projections monthly — if none exists, add a tiny
  `scripts/projections-remake.ts` that re-makes unresolved projections
  (the pure function exists in `lib/projections.ts`) — `0 6 2 * *`.
- `questions-requeue`: if `queueQuestions`/revisit needs a daily tick
  (check whether due re-asks are computed at read time — phase 20 did
  it read-time, in which case NO task; say so).

## 4. What this phase does NOT do

No Coolify API mutations from the implementing agent (the main agent
flips `git_branch` → `simple`, `docker_compose_location` →
`/docker-compose.simple.yml`, adds the env key, creates the tasks, and
deploys). No DNS. No deletion of the old app or compose file. The old
app keeps running until the owner sees the new one on
vitals.chocksy.com and says so.

## 5. Verification (local)

`docker compose -f docker-compose.simple.yml config` parses; a local
build of the web image completes (`docker build -f apps/simple/Dockerfile .`);
typecheck and the full suite still pass (nothing in `apps/simple/lib`
should change in this phase beyond, at most, the projections-remake
script and an import-legacy guard). Report: files changed, the runbook
content, the env/task list for the main agent, verified facts about
prod tables (which knowledge tables are empty in prod), deviations.
