# Phase 15: autonomous knowledge, admin windows, fact history

Approved 2026-08-29. Principles 1, 2 and 4 of `ROADMAP.md` made real.
Everything in `apps/simple`. Migrations additive. No new deps. Ponytail.
Two independent halves; build A first, B second, verify each.

## A. Autonomous knowledge

### A1. Grades and weights (`lib/hypotheses.ts`, `lib/research.ts`)

`Grade = "A" | "B" | "C" | "D" | "E"`. Assignment in the extractor:
meta-analysis or guideline → A; RCT, or cohort/cross-sectional with
n ≥ 500 → B; other human studies → C; case report, case series ≤ 10,
n-of-1, self-experiment → D; animal, in vitro, computational → E.
Downgrades: retracted (Europe PMC `retracted` flag or Crossref update
type) → dropped; unresolved DOI → C at best; citation count 0 and older
than 3 years → one grade down; venue unknown to Semantic Scholar → one
grade down.

Scoring weight: A and B full LR; C `lr^0.5` (shrunk toward 1,
`GRADE_SHRINK = { C: 0.5 }` constant); D and E never enter
`scoreHypotheses` (filtered in `loadCatalog`).

### A2. Acceptance policy (`lib/hkb-policy.ts`, pure, tested)

`decide(proposal): "accepted" | "review" | "rejected"`:

- rejected: retracted; feature unmappable and unmintable; unit present
  but not convertible to the feature unit; quote does not contain the
  number; condition not in catalog.
- review: two verified rows for the same (condition, feature,
  condition_on) disagree by more than 3× in LR; or an LR > 100 or < 0.01
  outside a meta-analysis.
- accepted: everything else, with grade set by A1. Applied at insert
  time by `research.ts` and once to every existing `proposed` row
  (a script `hkb:policy --apply` with a dry-run default that prints the
  decision per row).

`review` rows still score at their pooled value (below) and are flagged
`needs_look` for the admin view; nothing waits on a click.

### A3. Pooling (`lib/hkb-pool.ts`, pure, tested)

Several accepted rows on the same (condition, feature, condition_on):
effective `ln LR = Σ wᵢ ln LRᵢ / Σ wᵢ`, `wᵢ = gradeWeight × ln(n+2)` with
gradeWeight A 3, B 2, C 1 (C already shrunk). `loadCatalog` returns one
pooled rule per key with `sources[]` listing the papers; the page shows
the pooled number and the list. Unit test: two A papers 5 and 7 → ~5.9;
an A at 5 and a C at 20 → close to 5.

### A4. Feature minting (`lib/research.ts`)

When the extractor returns a feature with `featureId = null` but a name
and unit, create `hkb_features { id: "metric:<slug>", kind: "lab",
name, unit, how_to: null, minted_from: doi }` (add `minted_from text`
column, migration 0011) and use it. Also create a `hkb_tests` row with
`cost` guessed from a small table by test class (serology 1, special
chemistry 2, imaging 3, invasive 4; default 2) and `lr_pos/lr_neg` from
the paper, `feature_ids = [id]`. The curator's metric-identity step
already merges duplicates by normalised name; run the same normaliser
before minting so "anti-endomysial antibodies" and "EmA IgA" collapse.

### A5. Intervention and horizon searches (`lib/research.ts`)

Per condition, two more queries:

- interventions: `"<condition>" AND (treatment OR supplementation OR
intervention) AND (randomized OR "meta-analysis")`, last 15 years →
  extraction schema `{ intervention, dose?, duration?, outcomeFeature?,
effectSize?, direction, population, studyType, quote }` → rows in a new
  table `hkb_interventions { id, condition_id, name, dose, duration,
outcome_feature_id, effect, direction, grade, paper jsonb, quote,
status, created_at }` (migration 0011).
- horizon: same terms plus `(case report OR pilot OR "n-of-1" OR animal
OR mice OR "in vitro")`, last 3 years → same table, grades D/E.

The plan prompt gets the condition's interventions in a `WHAT MIGHT HELP`
section: A/B as candidate actions, C as "early", D/E as "experimental"
with the rule "an experimental item is only offered with a measurement
plan (which marker, when)". `ReportAction.tier: "established" | "early" |
"experimental"` (jsonb, optional) and a chip on the card.

### A6. Schedule and triggers (`instrumentation.ts`)

Monthly: `hkb:research` over every catalog condition with
`--max-papers 10`, then `hkb:policy --apply`. On demand: when a user's
hypothesis first reaches `possible` and its condition has no research
run in 90 days, queue that condition (dedupe). Yearly: priors and
prices importers. All runs logged in `hkb_import_runs`.

### A7. `/hkb` as a window

Tabs stay. Evidence tab: default filter "all", columns add pooled LR and
`sources` count, `needs_look` chip; Accept/Reject buttons become a single
**Override** (set LR, grade, or exclude, with a note) behind a "…" menu.
New tab **Interventions** (per condition: tier, name, dose, effect,
grade, paper). New tab **Activity**: the last 100 knowledge changes
(rows accepted, minted features, pooled updates, runs) as a feed with
timestamps, so the owner can watch ingestion. Admin nav: add Brain, HKB,
Admin as a "System" group in the primary nav when `isAdmin()`; users
never see it.

## B. Fact history: changed vs corrected

### B1. Data (migration 0011)

`profile_fact_history { id, user_id, key, value jsonb, valid_from date,
valid_to date null, change_kind text /* 'initial' | 'changed' |
'corrected' */, note text null, source text /* user | document | genome |
system */, created_at }`. `profile_facts` stays the current view; every
write to it also writes a history row:

- `changed`: close the previous row (`valid_to = valid_from − 1 day`) and
  open a new one from the given date (default today).
- `corrected`: mark the previous row `change_kind = 'corrected'` with the
  note and open the new one with the previous `valid_from` (the old value
  never held).

`factAt(userId, key, date)` reads the value that held on a date; the
confounder tagging for old draws and the context pack use it. Cycle day
is a fact per draw: `cycle_day` with `valid_from = draw date`; the
symptom answers keep their date too.

### B2. UI

Every fact edit surface (`/feel`, inline questions, Not right? → fact,
Tracker facts) offers two buttons on an existing value: **This changed**
(date picker defaults to today) and **I was wrong** (note optional).
`/feel` gets a small history line per item ("since 2026-03: no; before:
yes"). A `/history` page under the avatar lists the timeline: facts
(with change kind), life events, uploads, adopted actions, on one axis.

### B3. Engine use

`buildModelInput` takes an optional `asOf` date; the ledger's
"what changed" uses fact history to explain flips ("hypertension rose
because home BP entered 2026-09-01"). Draw-context confounders: for each
reading, life events overlapping its date add confounder tags via the
existing `CONFOUNDERS` map (illness → acute_illness, surgery → post_viral
equivalent, heavy training → heavy_training, pregnancy → its own tag).

## C. Tests

`hkb-policy.test.ts` (every branch), `hkb-pool.test.ts`, minting
normaliser test, grade assignment table test, fact history: changed vs
corrected sequences and `factAt`, confounder-from-events test.

## D. Verification

typecheck, tests, migration 0011, `hkb:policy` dry-run then `--apply`
(paste the decision counts), one real `hkb:research` over 5 conditions
with interventions and horizon (paste per-condition counts and 5 sample
intervention rows with grades D/E labelled), `/hkb` screenshots (Evidence
with pooled column, Interventions, Activity), admin nav visible for the
admin and absent for the test user, `/feel` "This changed / I was wrong"
flow on the test user with the resulting history rows, `/history` page.
Report files changed, outputs, deviations.
