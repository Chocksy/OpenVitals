# prod-init: filling the knowledge tables after the Coolify cutover

Phase 17b, step 2. Run this **once**, after the `openvitals` app is deployed
from `/docker-compose.simple.yml` and the `web` container is healthy.

Nothing here touches person rows. The production `pgdata` volume already holds
every `readings`, `uploads`, `users` and `profile_facts` row, and
`apps/simple/Dockerfile` runs `db:migrate && import-legacy` on boot, so the
schema and the legacy import are already done by the time you read this.

Prerequisites: shell on the Hetzner host (Tailscale), and the container name.

```sh
CID=$(docker ps --filter "label=com.docker.compose.service=web" \
                --filter "name=j44wow4ogcg88w8gk480cwg4" -q | head -1)
docker exec -it "$CID" sh -lc 'cd /app/apps/simple && pwd && node -v'
```

Everything below runs from `/app/apps/simple`. `psql` is not in the web image;
run SQL through the `postgres` container instead:

```sh
PGC=$(docker ps --filter "label=com.docker.compose.service=postgres" \
                --filter "name=j44wow4ogcg88w8gk480cwg4" -q | head -1)
psql() { docker exec -i "$PGC" psql -U postgres -d openvitals "$@"; }
```

The one thing the boot depends on, worth checking before anything else:

```sh
psql -c "select to_regclass('public.users'), to_regclass('public.observations'),
                to_regclass('public.metric_definitions'),
                to_regclass('public.source_artifacts'),
                to_regclass('public.import_jobs');"
```

All five must be non-null. `drizzle/0000_typical_black_bolt.sql` adds
`FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")`, and `users` lives
in `db/auth-schema.ts`, which `drizzle.config.ts` tells drizzle-kit never to
manage, so `db:migrate` needs `public.users` to already exist. The other four
are what `lib/import-legacy.ts` reads on every boot. Prod's `pgdata` has all
five (`packages/database/src/schema/`), which is exactly why the flip works
and why a blank Postgres would crash-loop.

---

## Step 0 — which tables are actually empty

Run this first. Every later step branches on the answer. Do **not** assume
prod is empty; the app has been up and `instrumentation.ts` runs a background
knowledge tick five minutes after every boot, so some of these may already
have rows.

```sql
select 'hkb_conditions'      t, count(*) from hkb_conditions
union all select 'hkb_features',        count(*) from hkb_features
union all select 'hkb_evidence',        count(*) from hkb_evidence
union all select 'hkb_tests',           count(*) from hkb_tests
union all select 'hkb_condition_tests', count(*) from hkb_condition_tests
union all select 'hkb_prior_modifiers', count(*) from hkb_prior_modifiers
union all select 'hkb_interventions',   count(*) from hkb_interventions
union all select 'hkb_priors',          count(*) from hkb_priors
union all select 'hkb_terms',           count(*) from hkb_terms
union all select 'hkb_annotations',     count(*) from hkb_annotations
union all select 'hkb_revisions',       count(*) from hkb_revisions
union all select 'hkb_import_runs',     count(*) from hkb_import_runs
union all select 'kg_nodes',            count(*) from kg_nodes
union all select 'kg_edges',            count(*) from kg_edges
order by 1;
```

Local reference numbers (2026-09-01, the DB this repo was built against). Use
them as the "populated" target:

| table                 | local rows         | filled by                       |
| --------------------- | ------------------ | ------------------------------- |
| `hkb_terms`           | 51 943             | `hkb:import`                    |
| `hkb_annotations`     | 285 455            | `hkb:import`                    |
| `hkb_conditions`      | ring 1 + ring 2    | `hkb:seed`, `hkb:ring2:build`   |
| `hkb_features`        | catalog            | `hkb:seed`                      |
| `hkb_evidence`        | catalog + research | `hkb:seed`, `hkb:import`        |
| `hkb_tests`           | catalog            | `hkb:seed`                      |
| `hkb_condition_tests` | catalog            | `hkb:seed`                      |
| `hkb_prior_modifiers` | catalog            | `hkb:seed`                      |
| `hkb_priors`          | catalog + NCD-RisC | `hkb:seed`, `hkb:import:priors` |
| `kg_nodes`            | catalog            | `kg:seed`                       |
| `kg_edges`            | catalog + Monarch  | `kg:seed`, `kg:import:monarch`  |

Branch:

- **All zero** → the app has never run a knowledge pass in prod. Go to
  **Path A**.
- **`hkb_conditions` and `kg_nodes` non-zero, `hkb_terms` zero** → the
  in-process tick seeded the catalog but the 159 MB ontology import never ran.
  Skip the seed steps, run only the ontology + ring-2 + Monarch steps.
- **Everything non-zero and close to the numbers above** → nothing to do.
  Confirm with `select script, ran_at, rows from hkb_import_runs order by
ran_at desc limit 20;` and stop here.

Re-running any step is safe. Every importer is an upsert (`hkb-seed.ts`: "one
upsert per row, keyed on something stable, so running it twice changes
nothing"; `hkb-ring2-build.ts` and `kg-import-monarch.ts` say the same).

---

## Path A (recommended) — copy the knowledge tables from the local database

**Why this one.** The import path needs ~159 MB of ontology downloads plus a
16 MB Orphanet XML inside the prod container, parses MONDO whole at about
700 MB of heap, and takes tens of minutes. The local database already holds
the exact rows those imports produce, verified by `hkb-sanity.test.ts`. One
`pg_dump | psql` is faster, reproducible, and cannot half-finish on a flaky
`purl.obolibrary.org` redirect.

Run from the Mac, over the Tailscale link to the Hetzner host.

```sh
# 1. The knowledge tables, and only the knowledge tables.
KTABLES="
  -t hkb_conditions -t hkb_features -t hkb_evidence
  -t hkb_tests -t hkb_condition_tests
  -t hkb_priors -t hkb_prior_modifiers -t hkb_interventions
  -t hkb_terms -t hkb_annotations
  -t hkb_revisions -t hkb_import_runs
  -t kg_nodes -t kg_edges
"

# 2. Dump data only, no ownership, no ACLs.
docker exec -i openvitals-postgres-1 \
  pg_dump -U postgres -d openvitals --data-only --no-owner --no-acl $KTABLES \
  | gzip > /tmp/ov-knowledge.sql.gz

# 3. Sanity-check the dump before it goes anywhere near prod.
zcat /tmp/ov-knowledge.sql.gz | grep -c '^COPY '        # expect 14
zcat /tmp/ov-knowledge.sql.gz \
  | grep -E '^COPY public\.(readings|uploads|metrics|"user"|users|sessions|accounts|profile_facts|checkins|daily_logs|projections|belief_snapshots|user_conditions|genome_variants|document_items|reports)' \
  && { echo "PERSON ROWS IN THE DUMP — STOP"; exit 1; }
ls -lh /tmp/ov-knowledge.sql.gz
```

**The table list is the whole safety story.** Nothing person-shaped is in it.
Explicitly excluded, and they must stay excluded: `users`, `sessions`,
`accounts`, `verifications`, `readings`, `metrics`, `uploads`,
`genome_variants`, `document_items`, `life_events`, `profile_facts`,
`profile_fact_history`, `checkins`, `checkin_posts`, `daily_logs`,
`habit_logs`, `goals`, `protocol_items`, `projections`,
`intervention_outcomes`, `belief_snapshots`, `calibration_events`,
`review_items`, `reports`, `simple_insights`, `user_conditions`,
`journey_runs`, `curator_runs`, `optimal_overrides`.

`user_conditions` is the one that looks like knowledge and is not: it is the
per-person ring-2 wake list. Leave it out.

Load it:

```sh
zcat /tmp/ov-knowledge.sql.gz \
  | ssh hetzner "docker exec -i \$(docker ps --filter \
      'label=com.docker.compose.service=postgres' -q | head -1) \
      psql -U postgres -d openvitals -v ON_ERROR_STOP=1 --single-transaction"
```

`--single-transaction` matters: a duplicate-key error rolls the whole thing
back instead of leaving half a knowledge base. If it does fail on a duplicate,
that table was not empty — re-check step 0 and drop that `-t` from the list.

Then fix the one sequence in the set (`hkb_revisions.id` is a `serial`; every
other id is `text` or `uuid`):

```sql
select setval(pg_get_serial_sequence('hkb_revisions','id'),
              coalesce((select max(id) from hkb_revisions), 1));
```

Verify with the step-0 query. The counts must match the local ones.

---

## Path B (fallback) — run the importers inside the container

Use this if the dump is refused or the local copy has drifted. Ordered; each
step needs the one before it.

MONDO is parsed whole, so give Node room first:

```sh
docker exec -it "$CID" sh -lc 'cd /app/apps/simple && \
  export NODE_OPTIONS=--max-old-space-size=2048 && node -e "console.log(1)"'
```

Prefix every command below with `docker exec -it "$CID" sh -lc 'cd
/app/apps/simple && export NODE_OPTIONS=--max-old-space-size=2048 && ...'`.

| #   | command                  | what it writes                                                                                                            | needs                               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `pnpm db:migrate`        | schema                                                                                                                    | — (already run on boot)             |
| 2   | `pnpm hkb:seed`          | `hkb_conditions`, `hkb_features`, `hkb_evidence`, `hkb_tests`, `hkb_condition_tests`, `hkb_priors`, `hkb_prior_modifiers` | in-code catalog, no network         |
| 3   | `pnpm kg:seed`           | `kg_nodes`, `kg_edges`                                                                                                    | in-code catalog, no network         |
| 4   | `pnpm hkb:import`        | `hkb_terms`, `hkb_annotations`, proposed `hkb_evidence`                                                                   | 3 downloads, ~159 MB                |
| 5   | `pnpm hkb:ring2:build`   | ring-2 `hkb_conditions` + `hkb_priors`                                                                                    | step 4, plus a 16 MB download       |
| 6   | `pnpm hkb:import:priors` | `hkb_priors`                                                                                                              | 3 CSVs from ncdrisc.org             |
| 7   | `pnpm hkb:import:prices` | `hkb_tests.cost_by_country`                                                                                               | `data/hkb/prices-ro.csv`, committed |
| 8   | `pnpm kg:import:monarch` | `kg_edges`                                                                                                                | step 2, live Monarch API            |

Downloads land in `/app/apps/simple/data/hkb/` and are cached until deleted.
That path is **not** on a volume, so a redeploy throws them away — which is
fine, because this runs once.

Sources and sizes, all open, no login (from the script headers):

- `https://purl.obolibrary.org/obo/hp.json` — 22 MB, 20 464 terms
- `https://purl.obolibrary.org/obo/mondo.json` — 103 MB, 32 104 live terms
- `https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa` — 34 MB, 285 598 rows
- `https://www.orphadata.com/data/xml/en_product9_prev.xml` — 16 MB (ring 2)
- three NCD-RisC CSVs (hypertension, diabetes, BMI) from `ncdrisc.org/downloads/...`;
  that host answers 421 to roughly one request in three without a Referer, and
  `lib/hkb-import.ts:download` already retries five times with one set

Two things Path B cannot do:

- **GBD prevalence** needs an IHME login. `hkb-import-priors.ts` reads
  `data/hkb/gbd-prevalence.csv` if it is there and skips silently if it is
  not. Not required.
- **`hkb:research`** (the papers) is not in this list. It is a monthly job,
  costs OpenRouter tokens, and `instrumentation.ts` fires it on its own five
  minutes after boot when `hkb_import_runs` says it is due.

---

## Step 3 — after either path

```sql
select script, ran_at, rows, notes
  from hkb_import_runs order by ran_at desc limit 20;
```

Then, in the browser as the `ADMIN_EMAIL` user:

- `/hkb` — the catalog page renders and the import table shows the runs
- `/graph` — nodes and edges draw
- `/brain` — the engine instrumentation loads
- upload one small PDF and confirm the file survives a
  `docker restart "$CID"` (proves the `simple_uploads` volume is mounted)
- open one legacy upload's file link (proves `blobdata` is mounted read-only)

## Step 4 — Coolify scheduled tasks

**Almost nothing needs a cron.** `apps/simple/instrumentation.ts` already runs
an in-process daily tick (first at boot + 5 min, then every 24 h) that does the
curator pass for every user, the stale plan refresh, the Monday weekly review,
the monthly `hkb:research` sweep + `hkb:policy`, the monthly Monarch import,
and the yearly priors/prices imports. Every branch is guarded by
`hkb_import_runs`, so a restart never re-runs what already ran.

Create exactly one task on the `openvitals` app:

| name              | command                                                 | cron           | why                                                                                                                                         |
| ----------------- | ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `guideline-watch` | `cd /app/apps/simple && pnpm hkb:research --guidelines` | `0 6 15 */3 *` | The quarterly guideline sweep. It is a separate `--guidelines` branch in `scripts/hkb-research.ts` and `instrumentation.ts` never calls it. |

Set the container/service to `web`.

Three tasks the phase-17b spec asked about, and why they are **not** created:

- `research-monthly` — `instrumentation.ts:knowledge()` already runs
  `researchRun` over the whole catalog when `dueAgain("hkb-research", 30)`,
  then `runPolicy({apply:true})`, then Monarch. A cron would duplicate it and
  burn OpenRouter tokens. Add it only if the app is ever scaled past one
  replica, and delete the in-process timer in the same commit.
- `projections-remake` — `lib/ledger.ts:333-338` calls `resolveProjections`
  then `makeProjections` inside `recordBeliefs`, and `recordBeliefs` is on
  every write path that could change a projection: `/api/upload` (the new
  draw), `/api/plan/adopt`, `/api/plan/dismiss`, `/api/facts`, `/api/review`,
  `/api/ask`, `/api/compose`. There is no state where a projection needs
  re-making and no request has happened, so no CLI and no cron.
- `questions-requeue` — `queueQuestions` runs at read time on `/plan` and
  `/graph`, and inside `runCurator`, which the daily tick already calls for
  every user (`lib/curator.ts:1341`, `1360-1366`). Per-fact revisit dates are
  computed at read time from `profile_facts.revisit_at`. No task.

## Rollback

Nothing in this runbook is destructive to person data. If the app misbehaves,
set the Coolify app's `docker_compose_location` back to
`/docker-compose.prod.yml` and `git_branch` back to `main`, then redeploy. The
`pgdata` volume is shared and unchanged; the knowledge tables the simple app
added are invisible to `apps/web`.
