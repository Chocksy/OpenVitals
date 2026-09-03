# Phase 32: research, the month, genome answers, the read receipt, meals, and the native app

Date: 2026-09-03. Branch `simple`. Owner approved the phase 31b designs on
2026-09-03 ("I do like the pages you made for research, planning and
genome and upload, they look good, implement these changes including the
iOS app"). Mockups: `docs/mockups/v4/research.html`, `plan-month.html`,
`genome.html`, `blood.html` (upload detail), `ios.html`, `chart-hover.html`,
`system.html` section 15. Spec for the designs and their build-cost notes:
`docs/plans/2026-09-02-phase31b-designs-spec.md`. Constraints as in phase
30 (`2026-09-02-phase30-rewrite-spec.md`).

Two slices run in parallel on separate trees: 32a (`apps/simple`) and 32b
(`apps/ios`). They meet on the contract in section 6, which is the law for
both; neither changes it without updating this file.

## 1. Research (32a)

Data: a new table `paper_watch` (drizzle migration, new table only):
`id`, `user_id`, `condition_id`, `source` ("epmc" today), `external_id`
(PMID or DOI), `title`, `journal`, `published_at` (date), `grade`
(A–E from the intake), `finding` (one sentence, the intake's), `abstract`,
`moves` jsonb `{ conclusionId, name, direction: "up"|"down"|"none", delta
} | null`, `found_at`, `seen_at` nullable, `dismissed_at` nullable, unique
`(user_id, external_id)`.

Pipeline: `lib/research-watch.ts` runs the existing Europe PMC adapter
(`epmc()` in `lib/research.ts`) for every condition in the person's
ledger with state possible or louder, since the later of the last watch
and 90 days, grades each paper with the existing intake path, stores the
row, and computes `moves` by scoring the ledger with and without the
paper's rule when the intake produced one (use the scorer the way
`buildLedger` does; keep the delta, print it). No rule → `moves: null`,
printed "nothing for you". The curator's daily pass calls it; `POST
/api/research` runs it for one condition on demand for the signed-in user
(rate limit: one run per condition per day, the 90-day cooldown from the
mockup is the same rule). `GET /api/research` lists the person's rows,
unseen first. Marking seen and dismissed are `PATCH /api/research/:id`.

UI per `research.html`: `/plan?tab=research` is the full page (New for
you, Research now with the last-run receipt, Nothing new); the compact
three-line panel on Home under the ledger and on Plan under Do this first,
only when at least one row moves something (the empty state stays on the
Research tab); the Research tab on every pattern disclosure. Open goes to
the paper (Europe PMC URL), Discuss opens the composer about the paper.

## 2. The month (32a)

Columns on `protocol_items` (migration, add-only): `time_of_day` text
(`morning | breakfast | midday | afternoon | dinner | evening | bedtime`
or `HH:MM`), `days_of_week` smallint[] (1–7, null = every day),
`dose_amount` numeric, `dose_unit` text, `with_what` text, `ends_at` date.
`adopt()` fills them from the plan line through one pure `scheduleOf(line)`
in `lib/plan-line.ts` (tested on the owner's real lines: "Selenium 200
µg/day as selenomethionine for 6 months · capsule · once daily with
breakfast" → breakfast, 200 µg, "with breakfast", ends in 6 months;
"Resistance training 3x/week" → three days, default Mon Wed Fri; "10 000
steps daily" → every day, no time). The add-item form gets the same
fields. `occurrences(items, from, to)` is pure and tested; nothing is
materialised. `habit_logs` stays one tick per item per day (`// ponytail:
a three-dose day is one tick; per-slot ticks when someone asks`).

UI per `plan-month.html`: Plan's first two sections become Today (clock
order, tick per row, "why" line, the tag: protocol · goal · every day ·
suggested) and This month (the strip with dots, the week, the every-day
rules, the supplements schedule table, Coming up with the ruler). The
existing sections follow. On the phone, Plan tabs Today · Month · All.
"Suggested" rows exist only when the report proposed them; none are
invented. Ticks write `habit_logs` and feed the 30-cell strip.

## 3. Genome answers (32a)

`genomeVerdicts(rows, calls)` in `lib/genome.ts`, pure and tested: for
every catalogue row with a condition it returns `{ conditionId, name,
direction: "up" | "down" | "none", factor, grade, reason, testNeeded:
boolean, absent: boolean }`, where an absent haplotype for a condition
whose rule is "carrier ×3, non-carrier LR 0.1" yields `direction: down,
testNeeded: false`. `movesAnything` is replaced by it. UI per
`genome.html`: `/blood/genome` (the upload detail's genome section links
there; the Blood Uploads tab lists "Genome" first when a file exists): the
verdict cards, the gene table with the rsids behind a disclosure, the
"read but never a risk" notes; Home's ledger card shows the three verdicts
that moved something and links to the page.

## 4. The read receipt (32a)

At parse time the upload pipeline snapshots the ledger before and after
(`snapshotLedger`) and stores the diff on the upload row (`moved` jsonb:
`{ resolved, new, stronger, weaker, lines: [{ id, name, from, to }] }`).
Upload detail per `blood.html` section 05: file, what was read, what it
moved, "nothing for you to do" or the one thing, the date once, then the
kind's own table. Rows in the Uploads tab print the date once.

## 5. Chart hover (32a)

`ChartHover`: CSS-only hover and focus cards on every history mark and
ruler mark (date, value, unit, state word, "was") per `chart-hover.html`;
each mark is focusable with an `aria-label`; the card flips inside the
plot; the planned mark says "planned · no value yet". No JS, no DOM
mutation. Locks green.

## 6. The contract (32a builds, 32b consumes)

All under `/api`, JSON, session cookie auth, `401 {error}` when signed
out. Dates are `YYYY-MM-DD`, times `HH:MM`, numbers are numbers, every
number carries its unit, every estimate carries `estimated: true`.

`GET /api/today` →
```
{ sentence: { head, tail, tone: "ok"|"warn"|"bad"|"none" },
  status: { off, borderline, optimal, drawDate, since: string|null },
  body: { headline: string|null, unit: string|null, line: string },
  blood: { off, total, nextDraw: { weeks, codes: [{code,name}] } | null },
  plan: { headline: string, todo: number },
  systems: [{ id, name, word: "off"|"borderline"|"good"|"never measured",
              value: number|null, unit: string|null, marker: string|null }] }
```
`GET /api/body?d=YYYY-MM-DD` →
```
{ day, synced: { types: number, lastAt: string|null },
  rows: [{ type, name, identifier, source, value: number|null, unit,
           display: string, note: string, word, when: string }] }
```
`GET /api/plan/today?d=YYYY-MM-DD` →
```
{ day, done, total,
  rows: [{ itemId: string|null, time: "HH:MM"|null, slot: string|null,
           title, why, tag: "protocol"|"goal"|"every day"|"suggested",
           done: boolean, adherence: number|null }] }
```
`POST /api/habits` `{ itemId, day, done }` → `{ ok: true }` (exists;
verify the shape and keep it).
`GET /api/meals?d=YYYY-MM-DD` →
```
{ day, meals: [{ id, time, photo: string|null, label,
    items: [{ name, portion, kcal, protein_g, carbs_g, fat_g, estimated: true }],
    totals: { kcal, protein_g, carbs_g, fat_g, estimated: true },
    moves: [{ what, line }] }],
  totals: { kcal, protein_g, carbs_g, fat_g, estimated: true } }
```
`POST /api/meals` multipart `{ photo, day?, time? }` → the meal above.
The capture pipeline that already reads food photos into per-item macros
(`/api/capture`) is the reader; 32a adds the `meals` table (`id, user_id,
day, time, photo_key, label, items jsonb, totals jsonb, moves jsonb,
source`), keeps summing into `daily_logs.nutrition`, and stores the photo
under the existing upload storage.
`GET /api/genome` → `{ file: {name, readAt} | null, verdicts: [...as §3],
genes: [{ verdict, gene, call, grade, moved, source, rsids }] }`.
`GET /api/research?unseen=1` → `{ rows: [paper_watch rows] }`.

Fixtures: 32a writes one JSON fixture per endpoint from the owner's local
account into `apps/simple/fixtures/api/*.json` (no secrets, no ids that
matter) and a vitest that each route's output validates against the shape
above. 32b decodes the same fixtures in its unit tests.

## 7. The native app (32b, `apps/ios`)

Per `ios.html`: replace the `WKWebView` Today with native SwiftUI. Tabs:
Today, Body, + (Capture as a sheet), Meals, Plan; Settings from Today's
gear. Design tokens in one Swift file (`Design.swift`: the cream and dark
canvas, ink ladder, spectrum, navy, lime, radii 13/21/34, Fibonacci
spacing, the five type sizes on SF Pro with SF Mono for numbers). Screens:
Today (sentence, navy Status card, Body and Blood cards, the systems as
chips), Body (the day list with sources, pull to sync), Meals (meal cards
with "est." on every number, add from photo), Capture (photo of a lab,
photo of food, ask or tell, log how you feel; the existing capture flow
and chips stay), Plan (the Today column with ticks posting to
`/api/habits`; Month is a later slice), Settings (Health permissions per
type with "seen, not used"). `Api.swift` gains the GET endpoints and the
meal POST, decoding the contract with `Codable` structs; unit tests decode
`apps/simple/fixtures/api/*.json`. HealthKit sync and sign-in unchanged.
Dynamic Type, dark mode, reduce-transparency respected. Build with
`xcodebuild` for the simulator and run the tests; screenshot each tab on
an iPhone 15 simulator into `/tmp/p32b/`.

## Order and verification

32a first commits the contract fixtures and the endpoints, then the rest;
32b starts from the contract and the fixtures at once. Each slice: `pnpm
typecheck`, `pnpm test`, evals still run (32a); `xcodebuild test` green
(32b). Screenshots looked at. Reports per item with what exists, what was
added, what the mockup shows that the data still cannot, and the
migration files.
