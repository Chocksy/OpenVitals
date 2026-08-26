# Phase 5: the plan slice (profile → coverage → AI plan → /plan)

A vertical slice of `2026-08-26-health-model-spec.md` and
`2026-08-26-health-vectors.md`, built to test three things: can we gather the
missing data with questions, can jobs run over data we have and data we do not
have, and can the result be shown so it is simple to act on and adapts to sex
and age. Visuals: reuse the existing card/badge/button kit. No 3D, no graph.

Everything lives in `apps/simple`. Legacy tables untouched. Migrations are
additive. Ponytail rules apply: fewest files, reuse `lib/data.ts`,
`lib/daily-data.ts`, `components/ui-kit.tsx`, `components/tracker.tsx`
(`AdoptButton`), the review queue and `applyAnswer`.

## 1. Data

Migration `0003` (generate with `pnpm --filter simple db:generate`, then
inspect the SQL; it must only CREATE):

```ts
// db/schema.ts
export const profileFacts = pgTable(
  "profile_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // "sex", "birth_year", "family_history", ...
    value: jsonb("value").$type<unknown>().notNull(), // string | number | string[]
    source: text("source").default("user").notNull(), // "user" | "inferred"
    answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("profile_facts_user_key").on(t.userId, t.key)],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(), // "manual" | "upload" | "daily"
  body: jsonb("body").$type<ReportBody>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

`review_items` gets two new `kind` values, no schema change:
`profile_question` (subject `{ key, factKey, options?, free?: true }`) and
`check_in` (subject `{ key, reportId, actionIndex, ask }`).

## 2. Static knowledge: `lib/vectors.ts`

One file, plain data, hand-reviewable. Three exports.

```ts
export type Sex = "male" | "female";

export interface Vector {
  id: string; // "apob", "lpa", "bp", "vo2max", ...
  name: string;
  tier: 0 | 1 | 2; // 0 interview/home, 1 annual core, 2 conditional
  codes?: string[]; // metric codes that satisfy it (any one)
  fact?: string; // or a profile fact key that satisfies it (tier 0)
  staleDays: number; // 365 for annual labs, 99999 for once-in-life (lpa)
  appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
  why: string; // one line, plain language
}
```

Vectors, in this order (derive `codes` from the codes in the local DB; the
list of existing codes is in the vectors doc section 7):

Tier 0 facts: `sex`, `birth_year`, `height_cm`, `smoking`, `family_history`,
`conditions`, `medications`, `supplements`, `waist_cm`, `bp_home` (systolic/
diastolic 7-day avg), `resting_hr`, `grip_kg` or `vo2max_est`,
`sleep_snoring`, `screening_dates` (colonoscopy, mammography, cervical, skin),
`cycle_phase_at_last_draw` (female only, maxAge 55), `menopause_status`
(female, minAge 40).

Tier 1 labs (365 d): apob (`apolipoprotein_b`), lipids (`ldl_cholesterol`,
`hdl_cholesterol`, `triglycerides`), hba1c, glucose, insulin, creatinine (for
eGFR), liver (`alt`,`ast`), ggt, alp, albumin, cbc (`hemoglobin` or `rbc`,
`wbc`, `platelets`, `mcv`, `rdw`), crp, tsh, vitamin_d, ferritin,
transferrin_saturation, uric_acid, urine_acr (no code yet; will read as
"never"), b12 (`vitamin_b12`), folate (`folic_acid`), homocysteine.
Once in life: lpa (no code yet, "never").

Tier 2 conditional: `psa` (male, minAge 45), `hormones_male`
(`testosterone`, male), `hormones_female` (`estradiol`,`fsh`,`lh`, female,
maxAge 55), `tpo_antibodies`, `cystatin_c`, `cac_score` (fact, minAge 40),
`dexa` (fact, minAge 40), `colonoscopy` (fact via screening_dates, minAge 45),
`mammography` (female, minAge 40).

```ts
export interface Rule {
  id: string;
  when: (m: ModelInput) => boolean; // pure function over the coverage/model input
  suggest: string; // "Measure Lp(a) once"
  why: string;
  tier: 1 | 2 | 3;
  basis: "science"; // rules are always science-labelled
  ref?: string; // guideline or paper name
}
```

At least these rules (thresholds from the vectors doc, section 6):
lpa_once, apob_on_every_draw (apob stale > 365 while lipids current),
cac_if_risk (age >= 40 and (apob > 90 or family MI < 55 or lpa > 50)),
ogtt_if_insulin_resistant (hba1c >= 5.7 or insulin > 10 or tg/hdl > 2),
thyroid_workup (tsh > 2.5 rising, or tpo positive), ferritin_low (< 30),
ferritin_high (> 300 male / > 200 female with sat > 45), liver_workup (alt >
30 male / > 20 female or ggt above optimal), kidney_two_markers (egfr < 90 or
acr never), crp_source (crp > 3), homocysteine_high (> 12),
testosterone_low (male, < 300), bp_log (bp_home missing or >= 130/80),
sleep_study (snoring + sleep < 6.5), fitness_baseline (age >= 40 and no
grip/vo2max), colonoscopy_age (>= 45, or >= 40 with family colorectal),
psa_discuss (male >= 50, or >= 45 with family), mammography_age (female >=
40), cycle_phase_missing (female <= 55, hormones present, phase fact
missing), vitamin_d_refresh (stale > 365 or < 30).

`SEX_RANGES`: optimal overrides by sex for `ferritin`, `hemoglobin`, `alt`,
`testosterone`, `creatinine`, `uric_acid`. Applied in coverage, not written to
`metrics`.

## 3. The job: `lib/coverage.ts`

```ts
export interface ModelInput {
  today: string;
  profile: Record<string, unknown>; // facts by key
  sex?: Sex;
  age?: number;
  latest: Record<
    string,
    {
      value: number | null;
      unit: string | null;
      date: string;
      status: Status;
      optimalLow;
      optimalHigh;
      refLow;
      refHigh;
      prev?: number | null;
    }
  >;
  derived: {
    egfr?: number;
    homaIr?: number;
    tgHdl?: number;
    nonHdl?: number;
    fib4?: number;
    phenoAge?: number;
  };
}
export interface CoverageRow {
  vector: Vector;
  state: "current" | "stale" | "never" | "n/a";
  lastDate?: string;
  detail?: string;
}

export async function buildModelInput(userId): Promise<ModelInput>; // getMetricRows + profile_facts
export function coverage(input: ModelInput): CoverageRow[]; // pure
export function fireRules(input: ModelInput): Rule[]; // pure
export function profileQuestions(
  input: ModelInput,
): { key; question; options?; free? }[]; // pure: tier-0 facts that are missing, in priority order, filtered by appliesTo
```

Derived: eGFR by CKD-EPI 2021 (creatinine, age, sex; needs sex and age),
HOMA-IR (exists), TG/HDL, non-HDL (exists), FIB-4 (age, AST, ALT, platelets),
PhenoAge (Levine 2018; inputs albumin g/L, creatinine µmol/L, glucose
mmol/L, CRP mg/L (ln), lymphocyte %, MCV, RDW, ALP, WBC, age; convert units
from what the DB has; return undefined if any input is missing). Put the
formulas in `lib/derived.ts` with a unit test each against one known vector.

`n/a` when `appliesTo` excludes the person (e.g. PSA for a woman). Unknown
sex or age: tier-0 questions `sex` and `birth_year` come first and every
sex/age-gated vector shows `n/a` with detail "answer sex and age first".

`sex` question options: "Female", "Male". Store lowercase. Free-text facts
(`birth_year`, `height_cm`, `waist_cm`, `bp_home`, `family_history`,
`medications`, `supplements`, `screening_dates`) use `free: true`; the review
UI shows a text input for them. Multi-choice facts use options:
`smoking` ("Never", "Former", "Current"), `sleep_snoring` ("No", "Sometimes",
"Most nights"), `menopause_status` ("Pre", "Peri", "Post"),
`cycle_phase_at_last_draw` ("Follicular", "Luteal", "On the pill", "Don't
know").

Queueing: `queueProfileQuestions(userId)` inserts the top 3 missing facts as
`review_items` kind `profile_question` (dedupe on subject.key like the
curator does). Call it from `runCurator` at the end of each run (import from
coverage, one line) and from the `/plan` page load when no report exists.

`applyAnswer` gets a branch for `profile_question`: upsert into
`profile_facts` (`key = subject.factKey`, value = note for free-text, answer
otherwise; `family_history`, `medications`, `supplements` and
`screening_dates` split on commas into string arrays). Branch for
`check_in`: store the answer on the review item only (status "applied").

## 4. The AI: `lib/report.ts`

`generateReport(userId, trigger)`:

1. `input = await buildModelInput(userId)`; `cov = coverage(input)`;
   `rules = fireRules(input)`; protocol + 30-day tracker summary via
   `getTrackerSummary`; previous report summary if any; open profile
   questions.
2. Build the context pack as text (≤ 8k tokens): profile facts with ages,
   metrics grouped by tier-1 vector with value / ranges (sex-adjusted) /
   status / delta / date, derived values, coverage rows that are `never` or
   `stale`, fired rules (the model must include each as a `test` action,
   basis `science`, with the rule's `why` and `ref`), protocol adherence,
   tracker aggregates, previous summary.
3. `generateObject` (from `ai`) with a zod schema (zod is a dependency of
   `ai`; import from `zod`). Schema = `ReportBody`:

```ts
{
  summary: string[];                     // ≤ 3 lines, plain
  eli5: string;                          // 2 sentences, one metaphor
  systems: { id: string; name: string; verdict: string; eli5: string; priority: 1|2|3 }[];
  actions: {
    title: string;
    kind: "supplement"|"food"|"exercise"|"sleep"|"test"|"doctor"|"stop"|"habit";
    weight: 1|2|3|4|5;
    basis: "science"|"opinion"|"anecdotal";
    why: string;
    reasoning: string;                   // opinion: the exact values and facts used; else ""
    dose?: { amount: string; form?: string; schedule: string; duration?: string; ceiling?: string };
    timing?: string;
    interactions?: { with: string; rule: string }[];
    targets: { code: string; direction: "up"|"down"; expect: string; measureAfterWeeks: number }[];
    evidence: { kind: "guideline"|"meta"|"rct"|"observational"|"anecdotal"; title: string; source?: string }[];
    followUp: { afterDays: number; ask: string }[];
  }[];
  questions: { key: string; text: string; why: string; options?: string[] }[];   // ≤ 3
}
```

System prompt (write it in the file, keep it under 60 lines). Must say: act
as this person's physician; commit to doses, schedules, durations and
expected changes with numbers and dates; label every action with exactly one
basis; `opinion` only when `reasoning` cites values from the context, and if
a needed value is missing, emit a `test` action to measure it instead;
`science` needs at least one evidence item that is a guideline, meta, RCT or
observational; `anecdotal` needs a `source`; never exceed these ceilings
(list: vitamin D 10000 IU/day, vitamin A 3000 µg/day, iron only if ferritin
< 50, potassium supplements never, zinc 40 mg/day, magnesium 400 mg/day
elemental, niacin never without a doctor); for prescription drugs use kind
`doctor`, say what to ask for and the usual dose range; adapt to sex and age
using the sex-adjusted ranges given; prefer the cheapest lever first; put
every fired rule in as a `test` action; end with ≤ 3 questions whose answers
would change the plan most.

4. Post-process in code: drop any action whose dose exceeds a ceiling in
   `CEILINGS` (in `lib/vectors.ts`, `{ substance regex, max, unit }`) and
   replace it with a question; ensure every rule id appears in a test action
   (append missing ones deterministically with basis science); cap actions
   at 8, sorted by weight desc.
5. Insert into `reports`. Queue `questions` as `profile_question` review
   items (key = question.key). Return the row.

Evidence resolution (PubMed lookup) is out of scope for this slice; keep the
`evidence` items as the model wrote them, rendered as text.

Triggers: `POST /api/plan` (manual, returns the row), fire-and-forget after
`runCurator` completes for an `upload` trigger (one line in the upload route
next to `runCurator`), and in `instrumentation.ts` daily tick: for each user,
if the newest report is older than 30 days, generate with trigger `daily`.

Adopting an action: `POST /api/plan/adopt` `{ reportId, actionIndex }` →
insert `protocol_items` (text = title + dose summary, why, metricCodes =
targets codes, cadence from schedule: "weekly" if it contains "week" else
"daily"), insert one `review_items` kind `check_in` per `followUp` with
`createdAt = now + afterDays` (set explicitly), and for each target insert or
update a `goals` row when `expect` parses to a number (regex for the first
number; direction gives targetLow or targetHigh). Return `{ ok: true }`.
"Not for me": `POST /api/plan/dismiss` `{ reportId, actionIndex }` → store
`profile_facts` key `dismissed_actions` (array of titles); the context pack
lists them so the model does not repeat them.

## 5. The page: `/plan`

`app/(app)/plan/page.tsx`, server component, `force-dynamic`. Nav: add
`{ name: "Plan", href: "/plan", icon: Stethoscope }` right after Today.

Layout, top to bottom, all with existing card/badge/button styles:

1. **Header**: "Your plan", date of the latest report, `Generate` button
   (client, POST /api/plan, then `router.refresh()`), and a `Simple / Deep`
   toggle (client, localStorage `planView`, default simple; toggles a
   `data-view` attribute on the page root; CSS `[data-view=simple] .deep {
display:none }`).
2. **Profile strip**: sex, age, and the count of tier-0 facts answered
   ("7 of 15 facts"). If sex or birth_year is missing, render the two
   questions inline here using `ReviewItem` (they are already queued) and
   skip the rest with the text "Answer these two first; the plan depends on
   them."
3. **ELI5 box** (simple) / **summary lines** (deep).
4. **Do this first**: action cards, sorted by weight. Card: title, weight
   chip, basis chip (science = solid border, opinion = accent border,
   anecdotal = dotted), dose line if present, why (simple) plus reasoning,
   targets, timing, interactions, evidence, follow-ups (deep). Buttons:
   `Add to protocol` (calls /api/plan/adopt, then shows "Adopted"), `Not for
me` (calls /api/plan/dismiss). Tests and doctor actions show `Plan retest`
   instead of `Add to protocol`: it links to `/insights` for now.
5. **Coverage**: one row per vector that applies, grouped by tier, with a
   state chip: current (green), stale (amber, "last 2024-05"), never (red).
   `n/a` rows hidden in simple, shown greyed in deep. This is the "data we
   do not have" view.
6. **Questions**: open `profile_question` review items rendered with
   `ReviewItem` (extend it: when `options` is empty, show a text input and
   a Save button that posts `{ answer: "text", note: value }`).
7. **Check-ins due**: open `check_in` items whose `createdAt <= now`, with
   Yes / No / text.

Home page: add one card "Plan" showing the top 2 actions' titles and the
count of `never` tier-1 vectors, linking to `/plan`. Nothing else on home
changes.

## 6. Tests (vitest, keep to one file per module)

- `lib/derived.test.ts`: eGFR CKD-EPI 2021 (creatinine 1.0 mg/dL, male, 40 →
  ≈ 96), FIB-4 (age 40, AST 28, ALT 28, platelets 235 → ≈ 0.90), PhenoAge
  returns undefined when an input is missing, and a finite number for a full
  vector.
- `lib/coverage.test.ts`: female of 30 → psa is `n/a`, mammography `n/a`,
  hormones_female applies; male of 41 with apob dated 2024-05 → `stale`;
  lpa `never`; `profileQuestions` puts `sex` first when missing; rules:
  `lpa_once` fires when lpa never measured; `ferritin_high` uses the sex
  threshold; `cac_if_risk` needs age ≥ 40.
- `lib/report.test.ts`: post-processing drops a vitamin D 20000 IU action and
  appends missing rule tests. Mock the model (do not call OpenRouter in
  tests).

## 7. Verification (run all; paste output)

```
pnpm --filter simple typecheck
pnpm --filter simple test
pnpm --filter simple db:generate   # inspect drizzle/0003_*.sql: CREATE only
pnpm --filter simple db:migrate    # against DATABASE_URL in apps/simple/.env (local docker postgres on 5433)
```

Then with the dev server (`pnpm --filter simple dev`, http://localhost:3001):

- `/plan` before answering anything shows the sex and birth-year questions
  inline and nothing else below the profile strip.
- Answer sex = Male, birth_year = 1985 via the UI (or `POST /api/review/:id`).
- `/plan` now shows coverage with `lpa` never, `apolipoprotein_b` stale,
  `psa` n/a hidden in simple; PSA appears greyed in deep.
- Click Generate. Expect a report row; the page shows ≤ 8 actions, every
  action has a basis chip; at least one `test` action for `lpa_once`; every
  `opinion` action has non-empty reasoning.
- Adopt one supplement action → appears on `/protocol`; `check_in` rows exist
  with future `created_at`; a goal exists if `expect` had a number.
- Temporarily set sex = Female in `profile_facts` (SQL), reload `/plan`: PSA
  and hormones_male are n/a, `mammography` and `hormones_female` appear.
  Set it back to male.
- `curl -X POST localhost:3001/api/admin/curate` still works and queues
  `profile_question` items for remaining tier-0 facts (max 3 open at a time).

Report: files changed, verification output, deviations from this spec
(expect zero), and the raw JSON of the generated report (trim to 60 lines).
