# OpenVitals "simple" app spec

Goal: a caltrack-style personal biomarker tracker. Upload lab PDF → readings → trends → AI lifestyle insights + retest plan + check-ins. Google or email login. Lives in `apps/simple`, runs against the SAME Postgres as the old app, never drops or alters old tables.

## Hard constraints
- New Next.js 16 app at `apps/simple` (App Router, TS strict, Tailwind 4, drizzle-orm, better-auth, `ai` + `@openrouter/ai-sdk-provider`, `pdfjs-dist`, `recharts`). No tRPC, no turbo deps on other workspace packages. Copy code in; do not import `@openvitals/*`.
- Target ≤ 3,500 LOC total. Fewest files. No UI kit; plain Tailwind.
- DB: same `DATABASE_URL` (local: `postgresql://postgres:postgres@localhost:5433/openvitals`). Reuse existing better-auth tables `users, sessions, accounts, verifications` exactly as they exist (match column names in `packages/database/src/schema/users.ts`; do NOT add columns). Existing user `chocksy@gmail.com` must still log in with email+password.
- New tables only (drizzle migrations in `apps/simple/drizzle`, run via `pnpm db:migrate` script using `drizzle-kit migrate`). NEVER write `DROP`/`ALTER` on any pre-existing table.
- Old tables read only for the one-time import (below).

## Schema (new tables)
```
metrics      code text PK, name text, category text, unit text, aliases jsonb (string[]), optimal_low real, optimal_high real, sort_order int default 0
uploads      id uuid PK default gen_random_uuid(), user_id text FK users.id cascade, file_name text, status text default 'pending' (pending|done|failed), error text, created_at timestamptz default now()
readings     id uuid PK, user_id text FK users.id cascade, upload_id uuid FK uploads.id null, metric_code text FK metrics.code, value real, value_text text, unit text, ref_low real, ref_high real, observed_at date not null, created_at timestamptz default now()
             index (user_id, metric_code, observed_at)
insights     id uuid PK, user_id text FK, kind text ('lifestyle'|'retest'), body jsonb, created_at timestamptz default now()
checkins     id uuid PK, user_id text FK, insight_id uuid FK insights.id cascade, item_index int, answer text ('did'|'didnt'|'skip'), note text, created_at timestamptz default now()
```
`insights.body` for `lifestyle`: `{ items: [{ text, why, metricCodes: string[] }] }`. For `retest`: `{ dueAt: 'YYYY-MM-DD', tests: [{ code, name, why }], summary }`.

## One-time import (idempotent, runs on `pnpm import-legacy`, also auto-runs on first request if `readings` is empty)
1. `metrics`: for each row of `metric_definitions` insert on conflict do nothing (code=id, name, category, unit, aliases, sort_order). Then set `optimal_low/high` from `optimal_ranges` where `sex is null` (fallback: any row for that metric).
2. `readings`: `INSERT INTO readings (id, user_id, metric_code, value, value_text, unit, ref_low, ref_high, observed_at, created_at) SELECT id, user_id, metric_code, value_numeric, value_text, unit, reference_range_low, reference_range_high, observed_at::date, created_at FROM observations WHERE status <> 'extracted' OR true` — import all 565 rows, `ON CONFLICT (id) DO NOTHING`. Skip rows whose `metric_code` is not in `metrics` (log count). Skip rows with `metadata_json->>'source' = 'calculated'` (we compute derived at read time).
3. Log counts. Verify locally: `readings` should have ~540 rows (565 minus 25 calculated).

## Ingestion (in-process, `POST /api/upload`, route handler, `maxDuration = 120`)
1. Save nothing to disk; read the multipart file into a Buffer. Insert `uploads` row (pending).
2. Extract text with the ported `extractTextFromPdf` from `services/ingestion-worker/src/lib/pdf.ts` (copy verbatim, pdfjs legacy build). If text < 50 chars, send the PDF base64 to `AI_OCR_MODEL` (default `google/gemini-2.5-flash`) via OpenRouter chat/completions exactly as `services/ingestion-worker/src/parsers/lab-pdf.ts` does.
3. One `generateObject`-style call (use `generateText` + JSON.parse with code-fence strip, ported `stripCodeFences`) with the prompt from `packages/ai/src/prompts/extract-labs.ts` PLUS: the full list of `metrics` as `code | name | unit | aliases` and the instruction: "For each result set `code` to the best matching metric code from the list, or null. Convert `value` to that metric's unit when the lab used a different unit; report the converted `unit`." This replaces normalizer + unit_conversions + flagged_extractions.
4. Rows with `code` null: create a metric on the fly (`code = slugify(analyte)`, name=analyte, category='other', unit as given), then insert.
5. Insert readings; mark upload done with count, or failed with error. Return JSON `{ uploadId, count }`.
Model: `AI_DEFAULT_MODEL` env via `createOpenRouter({ apiKey: OPENROUTER_API_KEY })`. Drop the gateway fallback.

## AI (`POST /api/insights`, body `{ kind }`)
Context: for each metric the user has, latest 5 readings (value, unit, date), ref range, optimal range. Plus previous insights + checkin answers (last 3 insights).
- `lifestyle`: system prompt: give 3-7 concrete, trackable lifestyle changes (sleep, food, exercise, supplements) tied to specific out-of-optimal metrics; each item `text` ≤ 120 chars, `why` ≤ 200 chars, `metricCodes`. JSON only.
- `retest`: reuse the spirit of `packages/ai/src/prompts/lab-panel-suggestion.ts` but output `{ dueAt, tests: [{code,name,why}], summary }`, 5-15 tests, dueAt based on how bad things are (6-16 weeks), account for what the user said they did in checkins. Codes must come from the metrics list.
Store in `insights`. Return the row.

## Pages (all server components except where noted; session via better-auth, redirect to `/login` if none)
- `/login`: email+password form + "Continue with Google" button (better-auth `socialProviders.google` only registered when `GOOGLE_CLIENT_ID` set). Sign-up on same page.
- `/` dashboard: upload button (client component, POST to `/api/upload`, shows spinner + result). Then list of metrics grouped by category, each row: name, latest value + unit, date, status dot (red if outside ref range, amber if outside optimal, green else), tiny sparkline (recharts `LineChart` 80×24, no axes). Row links to `/m/[code]`.
- `/m/[code]`: trend chart (port the essentials of `apps/web/components/health/trend-chart.tsx`: line + `ReferenceArea` for ref and optimal bands) + table of readings. Derived metrics: compute at read time only for `homa_ir` (glucose*insulin/405) and `non_hdl` if both inputs share a date; show them as extra rows in the dashboard list. Nothing stored.
- `/insights`: two buttons "Generate lifestyle plan" / "Plan next bloodwork". Shows latest of each kind. Lifestyle items each have three buttons: Did it / Didn't / Skip → `POST /api/checkins`. Retest plan shows dueAt, tests list, summary.
- `/uploads`: list of uploads with status/error/count. Delete upload (deletes its readings; own uploads only).

## Auth
better-auth with drizzle adapter, `emailAndPassword: { enabled: true }`, `socialProviders.google` conditional. Secret/URL from `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Copy the working config from the old app (`apps/web`; find with `grep -rl betterAuth apps/web --include=*.ts`).

## Dev / run
- `apps/simple/package.json` scripts: `dev` (next dev -p 3001), `build`, `start`, `db:migrate`, `import-legacy`, `typecheck`, `test`.
- `apps/simple/.env.example` with DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, OPENROUTER_API_KEY, AI_DEFAULT_MODEL, AI_OCR_MODEL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
- `apps/simple/Dockerfile` (standalone output, node:20-alpine) and `docker-compose.simple.yml` at repo root: `postgres` service identical to `docker-compose.prod.yml` (same `pgdata` volume name) + `web` built from `apps/simple/Dockerfile` that runs `db:migrate && import-legacy && start`. No worker, no migrate service.
- README section in `apps/simple/README.md`: local run steps, cutover notes for Coolify (switch branch to `simple`, compose file to `docker-compose.simple.yml`, keep env vars, old tables stay).

## Tests (vitest, minimal)
- `lib/extract.test.ts`: `stripCodeFences` + response→readings transform on a fixture JSON (port the relevant cases from `services/ingestion-worker/src/parsers/lab-pdf.test.ts`).
- `lib/status.test.ts`: status dot logic (ref vs optimal).

## Verification commands (must pass)
```
pnpm install
pnpm --filter simple typecheck
pnpm --filter simple test
pnpm --filter simple db:migrate && pnpm --filter simple import-legacy
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d openvitals -Atc "select count(*) from readings; select count(*) from metrics; select count(*) from observations;"   # observations count must still be 565
pnpm --filter simple build
```
Then `pnpm --filter simple dev` and curl `http://localhost:3001/login` → 200.

---

# Phase 2: bring back the design, the home dashboard, rich AI, and merge duplicate metrics

The phase-1 app works but is visually bare and the AI surface is too thin. This phase ports the old app's look and AI depth WITHOUT porting its data model. Same rules: no `@openvitals/*` imports, copy code in, never touch old tables. LOC ceiling rises to 7,000.

## 2.1 Design system + layout
- Copy `apps/web/app/globals.css` verbatim into `apps/simple/app/globals.css` (keep the `@import "tailwindcss"` and all tokens: accent, secondary, neutral, health-normal/warning/critical/info, fonts). If it references font packages (`geist`), add that dep.
- Copy `apps/web/lib/utils.ts` (`cn`). Add deps `clsx`, `tailwind-merge`, `lucide-react`, `geist` (only if globals.css needs it).
- Port `apps/web/features/layout/top-nav/{index,logo,primary-nav,mobile-nav,nav-config}.tsx` into `apps/simple/components/top-nav.tsx` (one file). Drop nav-search, feedback-popover, more-dropdown. Nav items: Home `/`, Biomarkers `/biomarkers`, Insights `/insights`, Chat `/chat`, Uploads `/uploads`. Show user avatar/initial + sign out. If it depends on radix dropdown, replace with a plain `<details>` menu.
- Port the shadcn primitives actually used by ported components (`components/ui/{card,button,badge,skeleton}.tsx`) but strip radix imports; `class-variance-authority` is allowed.
- Wrap pages in the old `MainLayout` container (`max-w-[1400px] mx-auto px-3 py-6 md:px-6 md:py-8`).
- Port `components/health/status-badge.tsx` and the full `components/health/trend-chart.tsx` (with the status stroke tokens and reference/optimal bands) into `apps/simple/components/`.

## 2.2 Home dashboard (`/`) — port from `apps/web/app/(dashboard)/(main)/home/page.tsx`
Server component fetches readings+metrics once and passes plain data to client components. Port and adapt these (read each source file first):
- `components/home/greeting-header.tsx`
- `components/home/health-score.tsx` (`calculateHealthScore`)
- `components/home/dashboard-stats.tsx`
- `components/home/attention-metrics.tsx` (out-of-range first, sorted by severity)
- `components/home/health-insights.tsx` + its `generateInsights` (rule-based improvement/decline/alert/milestone from trends)
- `components/home/what-changed.tsx` (deltas between last two draws)
- `components/home/upcoming-retests.tsx` fed from the latest `retest` insight (tests + dueAt); empty state links to `/insights`.
- `components/home/biomarker-panel-card.tsx` + `panel-section-header.tsx` + `lib/panel-config.ts` (PANELS: metabolic, cardiovascular, inflammation, thyroid, nutrients…) — render the core panels as cards like the old home.
- Port `lib/health-utils.ts` (`deriveStatus`, `formatRange`, `isTrendImproving`) and replace `useDynamicStatus` with a pure function over `{ref_low, ref_high, optimal_low, optimal_high}` from the reading/metric (extend `lib/status.ts`).
Skip: onboarding checklist, medications, conditions, import-job widgets, triage mutation.
- Move the current flat all-metrics list to `/biomarkers` (grouped by category, with the sparkline, search box filtering by name client-side). Put microbiology/susceptibility/urine categories last.

## 2.3 Rich AI
- **Retest plan**: replace the phase-1 `retest` prompt with `packages/ai/src/prompts/lab-panel-suggestion.ts` (copy the text; drop the `corePanels`/medications/conditions inputs, keep retests/alreadyTested/optimalRanges). Output body: `{ summary, dueAt, groups: [{domain, priority, reason, rationale, metrics: string[]}], optional: {reason, metrics}, newSuggestions: [{name, code, reason}] }`. Add `dueAt` to the prompt (6-16 weeks). Context builder: for every metric the user has, last 3 readings with dates, ref range, optimal range, days since last test, plus check-in answers from the latest lifestyle plan.
- **Lifestyle plan**: keep phase-1 shape, but add to the prompt the retest plan summary if one exists, and previous plans + check-ins so it adapts.
- **`/insights` page**: render the retest plan like the old `components/testing/next-lab-panel.tsx` (read it): summary, priority-ordered domain groups with rationale and metric chips (click → `/m/[code]`), optional section, "new tests to consider". Lifestyle plan as cards with Did it / Didn't / Skip. Regenerate buttons for both. Show generation date.
- **Chat `/chat`**: `POST /api/chat` using `streamText` from `ai` with the `packages/ai/src/prompts/health-chat.ts` system prompt and a context of the user's latest reading per metric (+ ranges) and the latest two insights. Client page: message list + textarea, streaming via `useChat` from `@ai-sdk/react` (add dep). Render assistant markdown with `react-markdown` (add dep). No conversation persistence (`// ponytail:`). Model from `AI_DEFAULT_MODEL`.

## 2.4 Merge duplicate metrics (import-time, deterministic)
The legacy catalog has ~35 duplicate groups (e.g. `absolute_basophils`/`basophils_absolute`/`basophils_abs`, `neutrophils`/`neutrophils_percent`/`neutrophils_pct`, `alt`/`alt_tgp`, `ggt`/`gamma_gt`, `platelets`/`platelet_count`, `rbc`/`red_blood_cell_count`, `mcv`/`mean_corpuscular_volume`, `mchc`/`mean_corpuscular_hemoglobin_concentration`, `mch`/`mean_corpuscular_hemoglobin`, `mpv`/`mean_platelet_volume`, `pdw`/`platelet_distribution_width`, `pct`/`plateletcrit`, `rdw`/`red_cell_distribution_width`, `ionic_calcium`/`ionized_calcium`, `magnesium`/`magnesium_serum`, `creatinine`/`creatinine_serum`, `folic_acid`/`folic_acid_vitamin_b9`, `hcv_antibodies`/`anti_hcv`, `hbs_antigen`/`hbsag_qualitative`, `h_pylori_stool_antigen`/`helicobacter_pylori_antigen_stool`, `vitamin_d`/`vitamin_d_25_hydroxyvitamin_d`, `lymphocyte_absolute`/`lymphocytes_abs`…). Query for the full picture: `select code,name,category,unit,(select count(*) from readings r where r.metric_code=m.code) from metrics m order by name`.
- Create `apps/simple/lib/merge-metrics.ts` exporting `canonicalCode(code, name): string` using (a) a name normalizer: lowercase, strip text in parentheses, `absolute count|absolute|abs` → `abs`, `percentage|percent|%|pct` → `pct`, remove non-alphanumerics; and (b) an explicit `MERGES: Record<string,string>` for the pairs above whose names differ. Canonical = the short well-known code (`alt`, `ggt`, `rbc`, `mcv`, `platelets`, `neutrophils_abs`, `neutrophils_pct`, …). Prefer `<name>_abs` / `<name>_pct` for differentials.
- `import-legacy` applies `canonicalCode` when copying observations, and inserts only canonical metrics (merge aliases from all duplicates into the canonical row's `aliases`). Provide a `pnpm --filter simple import-legacy --reset` flag that truncates ONLY `readings` and `metrics` (new tables) and re-imports, so the fix applies to the already-imported local DB. Run it.
- The upload path also passes the LLM-returned code through `canonicalCode`.
- Unit test: `lib/merge-metrics.test.ts` with 8+ pairs.
- Verify after re-import: no two metrics with readings share a normalized name; `select count(*) from readings` still 540; `observations` still 565.

## Verification (all must pass, paste output)
```
pnpm install --store-dir=/Users/razvan/Library/pnpm/store/v3
pnpm --filter simple typecheck
pnpm --filter simple test
pnpm --filter simple import-legacy --reset
PGPASSWORD=postgres command psql -h localhost -p 5433 -U postgres -d openvitals -Atc "select count(*) from readings; select count(*) from metrics; select count(*) from observations; select count(*) from (select lower(regexp_replace(name,'[^a-z0-9]','','g')) n from metrics m where exists(select 1 from readings r where r.metric_code=m.code) group by 1 having count(*)>1) d;"
pnpm --filter simple build
```
Then with the dev server on :3001 (it's already running, or start it), take screenshots with `~/.local/bin/ab open http://localhost:3001/ && ~/.local/bin/ab screenshot /tmp/simple-home.png` (log in first via the UI if `ab` shows the login page: create nothing new; use `ab fill`/`ab click` on the login form with email chocksy@gmail.com only if the password is available in env `SIMPLE_TEST_PASSWORD`; otherwise screenshot `/login` and report that the authed screenshots need the user). Save `/tmp/simple-home.png`, `/tmp/simple-insights.png`, `/tmp/simple-biomarkers.png`.

## 2.5 Nav bug (must fix)
Bug: after logging in and landing on `/`, no nav shows; it appears only after a full navigation to `/insights`. Cause: the root layout reads the session and conditionally renders the nav, and root layouts do not re-render on client-side navigation after login. Fix: move every page except `/login` into a route group `app/(app)/` with its own `layout.tsx` that ALWAYS renders `<TopNav />` (and redirects to `/login` if no session). Root layout renders only `<html><body>{children}</body></html>`. After login, do `window.location.href = "/"` (full navigation) rather than `router.push`.

## Design intent (from the user)
Keep the old app's visual theme: colors, typography, spacing, card style, status badges, chart look. Do NOT bring back the old UX complexity (sidebars, command palette, onboarding, integrations). Simple pages, same skin.

---

# Phase 3: data curation job + review queue + admin page

Goal: keep metric identity, units, and ranges healthy automatically. A curator runs after every upload and once a day, fixes what is safe, and asks the user about the rest. An admin page (only `ADMIN_EMAIL`) shows data state and the review queue. No queue infra, no worker service.

## 3.1 Schema (new tables only, drizzle migration 0001)
```
review_items  id uuid PK, user_id text FK users cascade, kind text, subject jsonb, question text, options jsonb (string[]), answer text null, status text default 'open' (open|applied|dismissed), created_at, resolved_at
curator_runs  id uuid PK, trigger text ('upload'|'daily'|'manual'), started_at, finished_at, stats jsonb, error text
metrics       + optimal_source text, + needs_review boolean default false   (ALTER on OUR table `metrics` is allowed; it is not a legacy table)
readings      + flags jsonb null   (e.g. ["unit_unknown","no_range","unit_converted"])
```

## 3.2 `lib/units.ts` (deterministic, tested)
- `normalizeUnit(u)`: lowercase, `μ`/`µ`→`u`, `ui`→`iu`, `fi`→`fl`, `/l`→`/L` style canonical casing, strip spaces, `x10^3`→`10^3`, `10³`→`10^3`, `/mm³`→`/mm3`, `mm3`→`uL`-family aware.
- `convert(value, fromUnit, toUnit, metricCode)`: a small map (~30 rows): `/mm3`↔`10^3/uL` (÷1000), `/mm3`↔`10^6/uL` (÷1e6) for rbc, `ng/mL`→`ug/dL` (×0.1), `nmol/L`→`ng/mL` per analyte where well-known (vitamin D ×0.4, testosterone ×0.288, cortisol ×0.0363), `mmol/L`→`mg/dL` for glucose ×18, cholesterol/HDL/LDL ×38.67, triglycerides ×88.57, creatinine `umol/L`→`mg/dL` ×0.0113, `g/L`→`g/dL` ×0.1, `pmol/L`→`pg/mL` (free T4 ×0.777, free T3 ×0.651). Returns `null` if unknown.
- Test: 15+ cases incl. spelling-only matches and unknown → null.

## 3.3 Curator `lib/curator.ts` — `runCurator(userId, trigger, scope?: { uploadId })`
Runs these checks over the user's readings (scope = that upload's readings when triggered by upload; all readings when daily). Each check either FIXES (safe) or QUEUES a `review_item` (unsafe). Never deletes readings. Records a `curator_runs` row with stats `{checked, fixed, queued}` per check.

1. **unit_spelling**: `normalizeUnit(reading.unit) == normalizeUnit(metric.unit)` but raw strings differ → FIX: set `reading.unit = metric.unit`.
2. **unit_convert**: units differ and `convert()` knows the factor → FIX: convert value, ref_low, ref_high; set unit; add flag `unit_converted`; keep the original in `flags` as `{"orig": {value, unit}}`. If `convert()` returns null → QUEUE kind `unit_unknown`, question "`<metric>` was reported in `<unit>`; canonical is `<metric.unit>`. What should I do?", options `["Treat as same unit", "Multiply by …" (free text via note), "Leave as is"]`.
3. **metric_identity**: metrics with `category='other'` created by upload (minted) → one LLM call per metric (batch them in one call): "Is `<name>` the same analyte as any of these? Return code or NONE." If a code comes back → QUEUE kind `merge_metric` with question "Is `<name>` the same as `<candidate name>`?" options `["Yes, merge", "No, keep separate"]`. Applying "Yes" remaps readings and deletes the minted metric. Never auto-merge.
4. **missing_range**: readings with no ref range → FIX: copy ref range from the most recent earlier reading of the same metric with the same unit; else flag `no_range`.
5. **missing_optimal**: metrics with readings and no optimal range and `needs_review=false` → one batched LLM call: "For each metric give optimal_low/high in `<unit>` and the source name (Attia/Outlive, Function Health, AHA, Endocrine Society…) or null if no consensus." For each non-null → QUEUE kind `optimal_range`, question "Set optimal range for `<metric>` to `<low>–<high> <unit>` (source: …)?", options `["Accept", "Reject"]`. Accept → write `optimal_low/high/optimal_source`. Reject → `needs_review=true` so it is not asked again. Null answers also set `needs_review=true`.
6. **implausible_value**: value > 50× the ref_high or < ref_low/50 → QUEUE kind `implausible`, options `["It's correct", "Delete this reading"]`.
LLM calls use the existing `model()` from `lib/extract.ts`; skip LLM checks when `OPENROUTER_API_KEY` is empty.

## 3.4 Triggers
- After a successful upload in `app/api/upload/route.ts`: `void runCurator(userId, 'upload', {uploadId})` (fire-and-forget, errors logged into `curator_runs.error`).
- Daily: `instrumentation.ts` → `register()` sets a `setInterval` every 24h (first run 5 min after boot) that runs `runCurator` for every user. `// ponytail: in-process timer; move to an external cron if there is ever more than one web replica.` Guard with `process.env.NEXT_RUNTIME === 'nodejs'`.
- Manual: `POST /api/admin/curate` (admin only).

## 3.5 Review queue UI
- `/review` page (any user, their own items): list open items grouped by kind, each with question + option buttons + optional note; answering calls `POST /api/review/[id]` `{answer, note}` which applies the fix (`lib/curator.ts` `applyAnswer(item, answer, note)`) and sets status. Show "All clear" state. Badge count in the top nav next to "Review" when open items > 0.
- Home: if open items > 0 show a slim banner "N data questions waiting → Review".

## 3.6 Admin page `/admin` (only when session email == `ADMIN_EMAIL` env; otherwise 404)
Server component, plain cards in the app theme:
- Data state: users, uploads by status, readings total, readings with flags by flag, readings with no range, metrics total / with optimal / needs_review / minted (`category='other'`), open review items by kind.
- Curator runs: last 20 with trigger, duration, stats, error. Button "Run curator now" → `POST /api/admin/curate`.
- Unit mismatches table: metric, canonical unit, reading unit, count (the query from the analysis).
- Minted metrics table with reading counts.
Add `ADMIN_EMAIL` to `.env.example` and `docker-compose.simple.yml` (`ADMIN_EMAIL: ${ADMIN_EMAIL:-}`); set `ADMIN_EMAIL=chocksy@gmail.com` in `apps/simple/.env`.

## 3.7 Verification (paste output)
```
pnpm --filter simple typecheck
pnpm --filter simple test           # includes lib/units.test.ts and a lib/curator.test.ts covering unit_spelling/unit_convert/missing_range on an in-memory fixture (pure functions; DB writes isolated behind a small adapter or tested via the local DB)
pnpm --filter simple db:migrate
curl -s -X POST -b <session cookie> http://localhost:3001/api/admin/curate   # or run `pnpm --filter simple curate` script that calls runCurator for all users with trigger 'manual'
PGPASSWORD=postgres command psql -h localhost -p 5433 -U postgres -d openvitals -Atc "select count(*) from readings r join metrics m on m.code=r.metric_code where r.unit is not null and m.unit is not null and lower(r.unit)<>lower(m.unit); select kind,count(*) from review_items group by 1; select trigger,stats from curator_runs order by started_at desc limit 3; select count(*) from observations; select count(*) from readings;"
pnpm --filter simple build
```
Expected: unit mismatches drop from 55 to a small remainder that is now queued as `unit_unknown`; `observations` 565; `readings` 540. Screenshots `/tmp/simple-admin.png` and `/tmp/simple-review.png` via `~/.local/bin/ab`.

---

# Phase 4: self-improvement loop (tracker, protocol, goals, weekly review, lab timeline)

Goal: turn the app from "view my labs" into "improve my numbers". Caltrack-style daily logging with heatmaps, a protocol built from the accepted lifestyle plan, per-metric goals, an AI weekly review, a lab-draw timeline, and CSV export. Same rules as before: no legacy-table changes, same theme, ≤ 11,000 LOC total, `// ponytail:` on simplifications. New tables only (migration 0002).

## 4.1 Schema
```
daily_logs   id uuid PK, user_id FK, day date NOT NULL, sleep_hours real, weight_kg real, steps int, exercise_min int, alcohol_units real, energy int (1-5), mood int (1-5), fasting_hours real, notes text, created_at, updated_at; UNIQUE(user_id, day)
protocol_items  id uuid PK, user_id FK, text text, why text, metric_codes jsonb, source_insight_id uuid null FK simple_insights, cadence text default 'daily' ('daily'|'weekly'), active bool default true, created_at
habit_logs   id uuid PK, user_id FK, item_id FK protocol_items cascade, day date, done bool default true, created_at; UNIQUE(item_id, day)
goals        id uuid PK, user_id FK, metric_code FK metrics, target_low real, target_high real, due date null, note text, created_at, achieved_at timestamptz null; UNIQUE(user_id, metric_code)
```
`simple_insights.kind` gains value `weekly` (no schema change; jsonb body `{ summary, wins: string[], concerns: string[], nextWeek: string[], adherencePct, metricNotes: [{code, note}] }`).

## 4.2 Today `/today` (the caltrack page; make this the fastest screen in the app)
- Server component loads today's `daily_logs` row (or empty), active `protocol_items` with today's `habit_logs`, and the current streak (consecutive days with any log or habit done).
- Top: date, streak flame "🔥 N day streak", left/right arrows to move by day (`?d=YYYY-MM-DD`).
- Habit checklist: each protocol item as a big tappable row with a checkbox (client component, `POST /api/habits` `{itemId, day, done}` optimistic). Items with `cadence='weekly'` show "this week" and count done in the last 7 days.
- Quick numbers: a single form row of number inputs (sleep h, weight kg, steps, exercise min, alcohol, fasting h) + two 1-5 segmented pickers (energy, mood) + notes. Autosave on blur/change via `PUT /api/daily-logs` (upsert by user+day). Show "Saved" tick.
- Bottom: 3 mini sparklines of the last 30 days (sleep, weight, steps).
- Add "Today" to the nav (first item after Home). Home page: add a "Today" card with streak + habits done x/y + link.

## 4.3 Protocol `/protocol`
- Lists active protocol items (text, why, metric chips, cadence, 30-day adherence % with a mini 30-cell strip), archive button, add-item form (text, why, cadence, optional metric codes via a datalist of metric names).
- "Adopt from plan": on `/insights`, each lifestyle item gets an "Add to protocol" button (`POST /api/protocol` with `source_insight_id`). Items answered "Did it" in check-ins are pre-adopted the first time this page loads if the user has zero protocol items (`// ponytail:` one-time bootstrap).
- The lifestyle-plan prompt gets the protocol + last 14 days of habit adherence + daily_logs averages in context, so new plans build on what the user already does.

## 4.4 Goals
- `/m/[code]`: "Set goal" inline form (target low/high prefilled from optimal range, due date, note). Goal band drawn on the trend chart as a dashed ReferenceArea in accent color; header shows "Goal: 60-80 mg/dL by 2026-12-01 · current 97 (−17 to go)". When a new reading lands inside the band, curator marks `achieved_at` (add a `goal_check` step to the curator).
- `/goals` page: all goals as cards: metric, current vs target, delta, due, progress bar (from first reading after goal creation to target), achieved ones in a separate "Done" section. Home: "Goals" card with top 3 by closest due.

## 4.5 Charts (caltrack / levels.io style, recharts + plain SVG; follow the theme tokens)
- `components/heatmap.tsx`: GitHub-style 52-week grid, one cell per day, colored by intensity; used on `/today` (below the form: "Consistency", intensity = habits done ratio) and `/protocol` (per item strips).
- `/trends` page: tabs for sleep, weight, steps, exercise, alcohol, energy/mood over 30/90/365 days, with 7-day rolling average line, plus a "Labs overlay": vertical markers on the dates of lab draws so you can see what you were doing before a draw.
- Numbers are `tabular-nums`, dates short; keep it to one component file `components/daily-charts.tsx`.

## 4.6 Weekly AI review
- `lib/ai.ts`: new kind `weekly`. Context: last 7 days of daily_logs and habit_logs vs the previous 7, protocol items, goals with current values, any readings added this week, open review items count. Prompt: honest coach; 3 wins, 3 concerns, 3 concrete actions for next week, adherence %, one note per metric that matters. JSON only.
- Trigger: the daily timer in `instrumentation.ts` also runs `weekly` for every user when `new Date().getDay() === 1` (Monday) and no weekly insight exists for the current week; manual button on `/insights` ("Generate weekly review").
- `/insights` shows the latest weekly review at the top in a card (wins green, concerns amber, next-week as a checklist that can be adopted into the protocol with one click).

## 4.7 Lab timeline `/labs`
- One card per distinct `observed_at` date: date, n readings, flagged count (red/amber dots), the upload it came from if any, and the top 3 flagged metric chips. Click expands to the full list of that draw's readings with status badges. Newest first. This replaces the need for "reports".
- Add to nav under Biomarkers as a sub-link or as its own item "Labs".

## 4.8 Export
- `GET /api/export.csv` (auth): all readings as CSV (date, metric, value, unit, ref_low, ref_high, flags). `GET /api/export-daily.csv`: daily_logs. Buttons on `/admin` and `/uploads`.

## 4.9 Nav final order
Home · Today · Biomarkers · Labs · Trends · Protocol · Goals · Insights · Chat · Uploads · Review(badge). If that overflows, put Labs/Trends/Protocol/Goals under a "More" `<details>` menu on small screens only; keep all visible ≥ 1280px.

## 4.10 Verification (paste output)
```
pnpm --filter simple typecheck
pnpm --filter simple test        # add tests: streak calculation, adherence %, goal progress %, heatmap bucketing, CSV escaping
pnpm --filter simple db:migrate  # inspect 0002 SQL first: only CREATE TABLE / indexes on new tables
PGPASSWORD=postgres command psql -h localhost -p 5433 -U postgres -d openvitals -Atc "select count(*) from observations; select count(*) from readings; select count(*) from users; \dt" 
pnpm --filter simple build
```
Seed nothing fake into the user's data. For screenshots, you may create today's daily_log and 2 protocol items for the real user through the UI (they are real, harmless entries the user can delete), then screenshot `/today`, `/trends`, `/goals`, `/labs`, `/protocol` to `/tmp/simple-<page>.png` via `~/.local/bin/ab`. Restart the dev server on :3001 after migrations and leave it running.
