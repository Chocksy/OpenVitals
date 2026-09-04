# Phase 35: what helps, on file from day one

Date: 2026-09-05. Owner: "Interventions are never seeded. Lets fix it,
propose a solution." and "I still wanna know the latest paper on a
supplement I might wanna take, like creatine: cognitive function at higher
doses, resistance training at lower doses, and correlation papers related to
cancer. We need to weigh in and have an amazing component giving papers
grades based on how they were made and relevancy."

Three parts. A is content plus a seed path. B is an intervention-first
research watch. C is the page that shows it. A and B ship without the
owner; C is drawn first (`docs/mockups/v4/topic.html`) and built to the
drawing.

## What exists (read these before touching anything)

- `db/schema.ts:985` `hkb_interventions`: one thing a paper says helps a
  condition. `conditionId` is a foreign key to `hkb_conditions`. Grades
  A–E; nothing here multiplies a probability. Rows are minted only by
  `lib/research.ts:1752 researchInterventions` (per condition, from Europe
  PMC) and `lib/trends.ts:559` (the owner's pasted claims, grade E).
- Consumers, all filter `status = 'accepted'`: `lib/actions.ts:332`
  (`pickActions`, plan lines with `source: "papers"`), `lib/lookup.ts:860`
  (`sourcesFor`, the ask box's citations), `lib/report.ts:663`
  (`helpLines`, at most 20 rows into the plan prompt), `lib/projections.ts`
  (`matchIntervention` by name, `toEffect` → `project()`), `lib/adopt.ts`,
  `lib/compose.ts`, `app/(app)/hkb/page.tsx`.
- `lib/projection.ts:221 parseEffect` reads the first number in `effect`
  as the point estimate in the marker's own unit; a relative percent
  returns null. `MAX_CHANGE` and `RETEST_WEEKS` name the markers a
  projection is ever made about and their units (LDL in mg/dL, vitamin D in
  ng/mL, HbA1c in %, ferritin in ng/mL, TSH in mIU/L, BP in mmHg).
- `lib/vectors.ts:1320 CEILINGS`: doses the plan never exceeds.
- `lib/research.ts:580 baseGrade` / `:626 gradeOf`: A meta/guideline, B
  RCT (C when n < `RCT_B_FLOOR`) or cohort ≥ 500, C small cohort, D case
  reports and n-of-1, E animal/in-vitro. `STUDY_TYPES` at `:117`.
- `lib/hkb-seed.ts`: the in-code catalog into Postgres, one upsert per row,
  keyed on a stable id, never deletes. `pnpm hkb:seed`.
- `lib/research-watch.ts`: the per-person feed (`paper_watch`), condition
  first, 90-day cooldown, `runWatchForUser` inside the daily curator
  (`lib/curator.ts:1386`), `searchOnlyWatch` when the model cannot run.
- `components/research-panel.tsx`, `app/api/research/route.ts`,
  `docs/mockups/v4/research.html` and `system.html` section 15: the paper
  row as it prints today.
- Catalog conditions: `CATALOG.map(h => h.id)` from `lib/hkb-catalog.ts`
  (24 there plus the 8 in `lib/hypotheses.ts`). Feature ids for outcomes:
  `metric:<code>` and `derived:<code>` as `lib/hkb.ts featureIdOf` mints
  them; the `metrics` table has the canonical unit per code.

## A. The seeded interventions catalog

### A1. Content: `lib/hkb-interventions.ts`

One in-code list, `INTERVENTIONS: SeedIntervention[]`, in the style of
`lib/hkb-catalog.ts` (a comment above each condition saying where the
numbers come from). For every catalog condition, three to eight rows: the
things guidelines and meta-analyses say move that condition or its scored
markers. Drugs, supplements, diet, exercise, sleep, behaviour and procedures
are all fair; a drug row is what a doctor would prescribe, labelled as such.

```ts
interface SeedIntervention {
  conditionId: string; // a catalog id, checked by the test
  name: string; // "Ezetimibe", "Plant sterols 2 g/day", "Resistance training"
  kind:
    | "drug"
    | "supplement"
    | "diet"
    | "exercise"
    | "sleep"
    | "behaviour"
    | "procedure";
  dose: string | null; // as a person would take it: "10 mg/day", "2 g/day with meals"
  duration: string | null; // the paper's own: "12 weeks"
  outcomeFeatureId: string | null; // "metric:ldl_cholesterol"; null for a condition-level outcome
  effect: string | null; // absolute, in the marker's unit, first number = point estimate:
  //   "-18 mg/dL (95% CI -22 to -14)"; relative only when no unit exists
  direction: "up" | "down" | "none";
  grade: "A" | "B"; // seeded rows are the established tier only
  studyType: "meta" | "guideline" | "rct";
  population: string; // "adults on statin therapy, n = 2,382"
  caution: string | null; // one sentence: who should not, or what to check first
  paper: {
    doi: string;
    pmid?: string;
    title: string;
    year: number;
    journal: string;
  };
  quote: string; // a sentence from the abstract or the guideline that carries the number
}
```

Rules for the content:

- Every row cites one real paper by DOI. The verification step below
  resolves each DOI against Europe PMC and the run fails on any miss. A row
  whose DOI does not resolve is removed, not guessed at. No fabricated
  quotes: the quote is a sentence from that abstract, checked against the
  abstract Europe PMC returns (case-insensitive substring after whitespace
  normalisation; for a guideline whose abstract does not carry the number,
  the quote is the guideline's own recommendation sentence and the row is
  marked `quoteChecked: false` in the verification output, at most 15 % of
  rows).
- Effects for the markers in `MAX_CHANGE` are absolute and in that unit,
  so `parseEffect` reads them and a projection can be drawn. mmol/L in the
  source gets converted (LDL, HDL, TC: × 38.67; TG: × 88.57; glucose:
  × 18.02) and the conversion is stated in the row's comment.
- Doses respect `CEILINGS`. Potassium and niacin have a ceiling of 0 there:
  never seed them as supplements.
- Grade by `baseGrade` semantics: meta/guideline → A, RCT → B. Nothing
  seeded is C or below.
- LDL / ASCVD / FH get the full ladder: statin (moderate and high
  intensity), ezetimibe, bempedoic acid, PCSK9 inhibitor, plant sterols,
  soluble fibre (psyllium, oats), saturated fat replaced by unsaturated,
  weight loss, Mediterranean diet, aerobic exercise. Type 2 diabetes and
  insulin resistance: metformin, weight loss, low-carbohydrate and
  Mediterranean diets, resistance and aerobic training, sleep extension,
  GLP-1 RA. Iron, B12, folate, vitamin D: repletion regimens with the
  expected rise. Thyroid: levothyroxine, selenium (Hashimoto's), iodine
  caution. Hypertension: DASH, sodium, potassium-rich foods (food, not
  pills), alcohol, aerobic exercise, the drug classes. Gout: allopurinol,
  febuxostat, low-purine diet, weight loss, cherry extract only if a trial
  carries it. Osteoporosis: resistance training, calcium from food, vitamin
  D, bisphosphonates. Sarcopenia and low fitness: resistance training,
  protein 1.2–1.6 g/kg/day, creatine 3–5 g/day. Depression: exercise,
  CBT, SSRIs, omega-3 with the meta-analysis grade. Sleep apnoea: CPAP,
  weight loss, positional therapy. The remaining conditions at the same
  standard.

### A2. Schema: migration 0027, add-only

`hkb_interventions` gains `kind text` (nullable) and `caution text`
(nullable) and `source text not null default 'research'` (`seed` for the
seeded rows). Edit `db/schema.ts` and write `drizzle/0027_*.sql` by hand in
the style of 0026; no column drops, no renames.

### A3. Seed path

- `interventionRows(): InterventionRow[]` in `lib/hkb-interventions.ts`,
  pure: id `seed_<conditionId>_<slug(name)>_<slug(outcome or 'condition')>`
  (≤ 120 chars), `status: "accepted"`, `source: "seed"`, `paper` as
  `HkbPaper` (url from the DOI), `quote` as given.
- `seedHkb` in `lib/hkb-seed.ts` upserts them after the evidence rows,
  `onConflictDoUpdate` on id for every column but `createdAt`, and records a
  revision the way it does for the other tables. Running it twice changes
  nothing. Research rows are never touched.
- `scripts/hkb-verify-seed.ts` (`pnpm hkb:verify:seed`): resolves every
  DOI via `epmc('DOI:"…"')` from `lib/research.ts` at one request per
  200 ms, checks the quote against the abstract, prints one line per
  failing row and exits 1 when any DOI fails. Network only; no model.

### A4. Where the seed shows

- The ask box: `sourcesFor` and `actionsFor` already read accepted rows,
  so "How can I improve my LDL" gets the ladder. `helpLines` caps at 20:
  sort seeded A before research B so the prompt sees the established
  ladder first (a one-line sort change, if the current sort does not
  already do it).
- The HKB admin page lists `source` per row and a count of seeded rows.
- `lib/actions.ts` `labelOf` prints "guideline" for a seeded A row and
  "trial" for a B, if it does not already say so.

### A5. Tests (vitest, no DB)

`lib/hkb-interventions.test.ts`:

- every `conditionId` is in the catalog;
- every `outcomeFeatureId` is a feature the catalog mints, or null;
- every row with an outcome in `MAX_CHANGE` has `parseEffect` returning a
  number whose sign matches `direction`, and `|effect| ≤ MAX_CHANGE`
  for a twelve-week duration or less;
- every dose passes `overCeiling`;
- every grade is A or B and matches `baseGrade({ studyType })`;
- every DOI matches `/^10\.\d{4,9}\/\S+$/`;
- ids are unique and ≤ 120 chars;
- at least three rows per condition;
- `pickActions` with the LDL rows and no plan actions returns the statin
  and ezetimibe lines with `source: "papers"`.

## B. Topic watch: the supplement-first feed

The condition-first watch never asks about creatine. A topic is a named
thing a person takes, does, or wonders about: `creatine`, `omega-3`,
`cold exposure`, `psyllium`. The watch asks Europe PMC about the topic,
reads what the trials found per outcome, grades each by design, and keeps
the contrary evidence beside the supporting evidence.

### B1. Where topics come from

- `topic_watch` table (migration 0027, add-only): `id uuid`, `userId`,
  `topic text` (normalised, lower-case), `label text` (as typed),
  `origin text` (`adopted` | `goal` | `asked` | `typed`), `lastRunAt`,
  `createdAt`; unique on (userId, topic).
- Filled by: the person's active `protocol_items` whose title names a
  supplement or drug (`matchIntervention` against the seed and research
  rows gives the canonical name; otherwise the first noun phrase); a
  "Watch a topic" input on the Research section (`POST /api/research/topics
{ label }`); an ask-box question that names a substance not on file
  (`origin: asked`, only when the ask pipeline already extracts the
  subject, do not add a model call for this).

### B2. The run

`lib/topic-watch.ts`, same shape as `research-watch.ts`, pure where it can
be:

- `topicQueries(topic, since)`: `"<topic>" AND (randomized OR "randomised"
OR "meta-analysis" OR "systematic review" OR cohort) AND (FIRST_PDATE:[since
TO now])`; a second query with `("adverse" OR "risk" OR "cancer" OR
"safety")` so the contrary side is asked for on purpose.
- Pre-rank before the model sees anything: Europe PMC's `pubTypeList`
  (meta-analysis, systematic review, randomized controlled trial first;
  editorial, letter, comment last), then `citedBy`, then year. Only the top
  `TOPIC_PAPERS = 12` per query go to extraction.
- Extraction reuses `INTERVENTION_PROMPT` / `interventionExtraction` with
  the topic as the "condition" (`ConditionRef { id: "topic:<topic>",
inCatalog: false }`) and the full feature list, plus one extra field on
  the item schema: `outcomeText` (the outcome as the abstract names it,
  "working memory", "1RM bench press", "prostate cancer incidence") so
  non-marker outcomes survive.
- Grade with `gradeOf` (study type, n, DOI resolved, citations). A cohort
  or cross-sectional study gets B/C by size, a correlational claim is
  labelled `studyType` so the page can say "association, not a trial".
- Rows go to `topic_findings` (migration 0027, add-only, shared across
  users because it is knowledge, not a person): `id text` pk, `topic`,
  `name`, `dose`, `duration`, `outcomeText`, `outcomeFeatureId`, `effect`,
  `direction`, `grade`, `studyType`, `n`, `population`, `paper jsonb`,
  `quote`, `createdAt`; unique (topic, paper external id, outcomeText).
  `onConflictDoNothing`. Nothing here writes `hkb_interventions` and nothing
  here moves a probability.
- The feed row: each run also writes the papers to `paper_watch` with
  `conditionId = "topic:<topic>"`, `finding` = the first item's quote, the
  grade, `moves: null`, so the existing Research list and the phone show
  them with no new plumbing. `listWatch` / `toApiPaper` must tolerate the
  `topic:` prefix (the label is the topic's `label`).
- Cadence: `TOPIC_DAYS = 30` per topic, inside `runWatchForUser` after the
  condition watch, under the same token budget; search-only when the key
  cannot run, like `searchOnlyWatch`.
- `POST /api/research { topic }` runs one topic now, same as it runs one
  condition now.

### B3. Relevance

`relevanceOf(topic, person)` → one sentence, no model: "you take it"
(adopted), "you are moving <marker>" (a goal whose marker is an outcome
feature of a finding), "<condition> is <state> for you" (a finding's
outcome feature is scored by a loud condition), else "you asked". Stored
nowhere; computed for the page.

### B4. Tests

`lib/topic-watch.test.ts`: queries carry the topic and the date window;
pre-rank orders a meta-analysis above an RCT above a cohort above a letter;
extraction rows keep `outcomeText`; grading of a cross-sectional n = 300
is C and the page label says association; `relevanceOf` for the four
origins; `listWatch` with a `topic:` row returns the label. Fixture
abstracts under `evals/fixtures/hkb/` like the existing research fixture.

## C. The topic page

`docs/mockups/v4/topic.html` (mockup agent, `system.css` classes only,
never touches `apps/`), then `app/(app)/plan/research/[topic]/page.tsx`
and a `TopicCard` on the phone later. The page, top to bottom:

1. Title: the topic as typed; under it the relevance sentence and "N papers
   read, last run <day>".
2. Verdict strip: one line per outcome, grouped by direction, best grade
   first: "Cognition · up · 3 trials, grade A · 10–20 g/day". Direction is
   good/bad by the outcome, not by up/down (an adverse outcome going up is
   `off`). The strip is a table with `system.css` state words, no badges.
3. The two columns on desktop, stacked on the phone: "What the trials
   found" and "What is only an association". A finding row is the paper row
   from section 15 plus: dose, duration, population with n, the study type
   in words ("randomised, n = 46"), the effect, the quote as the one
   sentence. Association rows carry a `StateWord` "association" and a
   sentence: "a survey of what people ate, not a trial; it cannot say
   creatine causes it".
4. "For you": the relevance sentence expanded with the person's own number
   where a marker is involved, and the projection line when
   `previewLines` can make one.
5. "Watch this" / "Stop watching", "Research now", "Discuss" (opens the
   thread with the topic as subject, like `DiscussPaper`).
6. Empty state when the key cannot run: the papers found, "found, not read
   yet", the reason, as `research.html` already says it.

Add the topics list to the Research section (`ResearchSection`): one row
per topic with the outcome count and the last run day, and the "Watch a
topic" input. The phone's Research screen gets the same rows later
(parked, phase 36).

## Contract additions (`lib/api-contract.ts`, fixtures under `fixtures/api/`)

- `GET /api/research/topics` → `{ topics: [{ topic, label, origin, lastRunAt,
outcomes: number, papers: number }] }`
- `POST /api/research/topics { label }` → the topic row; `DELETE` by topic.
- `GET /api/research/topics/[topic]` → `{ topic, label, relevance,
verdicts: [{ outcomeText, outcomeFeatureId, direction, tone, grade,
trials, doseRange }], trials: ApiFinding[], associations: ApiFinding[],
papers: ApiPaper[] }`.
- `paper_watch` rows with `conditionId` starting `topic:` come back from
  `GET /api/research` with `condition: { id, name: label }` unchanged in shape.

## Verification (the implementer runs; the orchestrator re-runs)

```
cd apps/simple
pnpm typecheck
pnpm vitest run                       # every existing test plus the new ones
pnpm hkb:verify:seed                  # every DOI resolves; quotes checked
DATABASE_URL=<local> pnpm hkb:seed    # twice; the second run writes 0 changes
psql <local> -c "select source, grade, count(*) from hkb_interventions group by 1,2 order by 1,2"
psql <local> -c "select condition_id, count(*) from hkb_interventions where source='seed' group by 1 order by 2"  # every catalog condition ≥ 3
pnpm dev (port 3001) → /plan?tab=research shows the topics list; /plan/research/creatine renders the empty state; /hkb shows seeded counts
```

The model-backed half (an actual topic run, the ask box answering LDL with
the ladder) is verified when the OpenRouter key is topped up: `POST
/api/research { topic: "creatine" }`, then the page; and
`pnpm eval:ask -- "How can I improve my LDL"`.

## Hard constraints

- Migrations add-only. Never delete or rewrite research rows.
- No manual approval gating: seeded rows are `accepted`.
- Dosing is allowed and labelled; ceilings from `lib/vectors.ts` hold.
- Nothing in `docs/mockups/` is edited by the implementation agent; the
  mockup agent never edits `apps/`.
- No commits, no pushes from agents. No secrets printed.
- Keep /brain, /hkb, /graph, /admin and the evals.
