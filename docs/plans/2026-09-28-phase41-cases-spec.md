# Phase 41: cases, the app reads you

Date: 2026-09-28. Branch `simple`. Status: approved by the owner ("go
ahead, do the proper steps"). Everything in `apps/simple` unless a slice
says otherwise.

## Why

Case A (a prod user, 38, female) has had
ferritin under 30 on 12 of 13 draws since 2018. Oral iron failed, and IV
iron started in September 2026. She has no symptoms. The owner and she
worked out the angles by hand. The app should have got there first.

Her own data already points at a cause nobody named:

| Finding                     | Numbers                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Iron stores low for 8 years | ferritin 9.8 (2018) … 8.2 (Aug 2026); antecedent 10.7 on 29.07.2026 after months of oral iron |
| Red cells never shrank      | MCV 92 to 98 on every draw                                                                    |
| B12 was low once            | 172 pg/mL, Dec 2021; 350 to 414 since                                                         |
| Thyroid antibodies high     | anti-Tg 65 (May 2024), 205 (May 2025, stored as `globulin`), 111 (Apr 2026), 137 (Aug 2026)   |
| Genes                       | HLA DQ2.5 and DR3                                                                             |
| Coeliac serology            | tTG-IgA 2 and tTG-IgG negative (2023); total IgA never measured                               |
| Cycle                       | irregular; LH 2.89, progesterone 14.72, estrone 16.3 (below 19.5) on 18.08.2026               |

Autoimmune atrophic gastritis explains the first four rows together:
Hershko 2007 (Blood Cells Mol Dis, doi 10.1016/j.bcmd.2007.03.006)
finds it in 20 to 27 % of refractory iron deficiency, 4 to 6 times more
often than coeliac disease, "female predominance, relatively young age,
increased prevalence of thyroid disease"; Dottori 2023 (Nutrients, doi
10.3390/nu15194199): its iron deficiency "rarely responds to oral
therapy", IV ferric carboxymaltose works, 55 % relapse at about two
years. Boutzios 2022 (Front Endocrinol, doi 10.3389/fendo.2022.860880):
21.4 % of 840 Hashimoto patients carry parietal cell antibodies. The
engine scores it at 3 %.

Three investigations on 2026-09-28 found why. Each finding below is
verified against the code and prod rows.

**The data never arrived.**

1. `lib/extract.ts:13` caps model output at 8192 tokens. The final
   18.08.2026 report (10 pages) and 23.04.2026 return `finishReason:
length`, `parse_failed`, 0 rows. `uploads.ts:261-278` then saves the
   file as a document silently. Estrone 16.3 got `code: null` and
   `documents.ts:301` dropped it.
2. `reanalyze/route.ts:64` deletes readings before re-extracting.
3. Bioclinica sheets carry an ANTECEDENT column (previous value and its
   date). Prompt rule 8 discards it. Her 25.09.2025 draw (ferritin 9.6,
   progesterone 22.01, HbA1c 5.3, a blood count) and 29.07.2026 (ferritin
   10.7, iron 136) exist only as antecedents.
4. 27 legacy `flagged_extractions` were never imported
   (`import-legacy.ts` reads `observations` only): absolute lymphocytes on
   five dates, anti-Tg 110.9, ESR, electrophoresis, FT4.
5. Legacy mis-codes: anti-Tg 205.3 IU/mL stored as `globulin`
   (2025-05-30); `atypical_lymphocytes_abs` holds absolute lymphocyte
   counts (hers and the owner's; this is the "z = 107" noise from phase
   39).
6. Same report uploaded twice with different bytes doubles 10 metrics on
   2025-12-09. A partial report ("Analize în curs de execuție: Estrona")
   has no way to be replaced by the final one.
7. Password-protected PDFs (`40487_1_…`, `17.03.2023`) fail silently.

**The knowledge was there and never fired.**

8. `ATROPHIC_GASTRITIS` has a Hashimoto ×3 prior modifier, but it reads a
   `conditions` profile fact that no user on prod has. Result: 0.02 × 1.5
   (DR3) = 0.03.
9. `inDependencyOrder` (`lib/hkb.ts:203-229`) orders only by `requires`
   and `hypothesis:` evidence, alphabetically otherwise. A `hypothesis:`
   prior modifier on a condition that sorts first reads `null`. So even a
   fixed gastritis modifier on `hashimoto` would silently never fire.
10. `input: { metric }` reads `m.latest` only (`hypotheses.ts:1714`). The
    B12 of 172 in 2021 is invisible now that she supplements.
11. "Treatment not working" is not an input. Supplements and medications
    live as profile-fact lists (`capture.ts:268`) with history in
    `profile_fact_history`; nothing compares them with the marker they
    target.
12. A confirmed condition ends the story. `iron_deficiency` is confirmed
    at 92.6 % and nothing asks why.
13. Hunches missed her ferritin: her own band (median 13.9) learned the
    deficiency as normal, and `outAt` (`signals.ts:232-243`) prefers the
    band over the lab range.

**The catalog cannot grow from a case.**

14. `decide()` (`hkb-policy.ts:167`) rejects any condition with
    `in_catalog = false` (10,598 ring-2 rows). `featuresFor`
    (`research.ts:1052`) offers only features the condition already
    reads, so intake can never propose a `hypothesis:` link or a new
    feature like "no response to iron". Research runs on staleness,
    never on a person's case.

**Nothing can test any of this on a real history.**

15. `buildModelInput(userId, asOf)` (`coverage.ts:229`) exists with no
    caller, and `getMetricRows` (`data.ts:118`) ignores the date. The
    journey evals only run invented personas. The owner does not trust
    personas; a real history replayed blind is the eval that counts.

## Principles kept

- Detection, scoring and test choice are code. The model proposes and
  writes sentences. A proposal becomes a rule only through
  `hkb-policy.decide` with a DOI, a quote and a grade.
- The base is population prevalence (priors by age and sex). The needle
  comes from the person's own data on top.
- Every line the user reads carries its origin: `paper` (DOI),
  `catalog` (rule id), `model` (grade E guess) or `you` (their answer).
- Hand-written medical rules are the exception. This phase adds exactly
  one catalog change (item 8's rewire). Everything else medical must come
  out of the case research in 41C, and the replay in 41D measures
  whether it did.
- Naming the likely diagnosis is allowed and wanted. The app says "our
  best read" with the probability, the reasons, the sources and which
  doctor confirms it. No hedging beyond that one line.

## 41A. Data truth (extraction and repair)

Files: `lib/extract.ts`, `lib/uploads.ts`, `lib/documents.ts`,
`app/api/upload/**`, `app/api/uploads/**` (reanalyze), a new
`scripts/repair-readings.ts`, tests beside each.

1. **No silent truncation.** Raise the extraction output cap to 32k, or
   turn reasoning off for extraction (pick what the model supports;
   measure both on the two failing texts in `/tmp/final1808.txt` and
   `/tmp/r2304.txt`). A `parse_failed` or `finishReason: length` sets
   `uploads.status = 'failed'` with `error`, never the document fallback.
   The document fallback stays only for files that really are not lab
   reports (the model says so).
2. **Chunk long reports.** When a text is over ~12k characters, extract
   page groups separately and merge rows (dedupe on metric + date +
   value). This keeps any single call far under the cap.
3. **Reanalyze is safe.** Extract first; replace the upload's readings
   inside one transaction only when the new extraction succeeded.
4. **Antecedents.** The prompt returns `antecedent: { value, unit, date }`
   when the sheet prints a previous value with a date. Insert it as a
   reading on that date with `flags.antecedent = true` and
   `upload_id` = this upload, only when no reading exists for (user,
   metric, date). Never overwrite a real row.
5. **Unknown analytes are minted, not dropped.** A measurement with a
   name, a number and a unit but no known code creates a `metrics` row
   (`code` = slug of the English name, e.g. `estrone`) through the same
   path the curator uses for metric identity, then a reading. The
   curator's identity step can merge it later.
6. **Censored values.** `< 8,0` stores 8 with `flags.censored = "<"`.
7. **Duplicates.** Before insert, skip a row identical on (user, metric,
   observed_at, value). A second upload of the same report (same lab
   report number in `doc_meta.reportNo`, or same collection date and
   ≥ 80 % identical rows) supersedes the older one: the newer upload's
   rows win, the older upload is marked `superseded_by` in `doc_meta`,
   its rows deleted. A partial report ("în curs de execuție" or similar
   pending lines) records `doc_meta.pending: [names]`, and Today shows
   "1 result still pending from 18 Aug" until the final arrives.
8. **Password-protected PDFs.** Detect the pdfjs password error, set
   `status = 'needs_password'`, and accept `password` on the reanalyze
   route. No OCR attempt on encrypted bytes.
9. **Repair script** `pnpm repair:readings [--user id] [--apply]`, dry-run
   by default, prints every change:
   - import unresolved legacy `flagged_extractions` whose metric,
     unit and value resolve cleanly; list the rest;
   - re-code `globulin` rows with unit `IU/mL` to `anti_thyroglobulin`;
   - re-code `atypical_lymphocytes_abs` / `atypical_lymphocytes_absolute`
     to `lymphocytes_abs` when the value is in the 0.5 to 5 K/µL range
     or 500 to 5000 /mm³ (convert);
   - link readings with `upload_id` NULL to the upload of the same
     user and date when exactly one exists;
   - remove exact duplicates (user, metric, date, value), keeping the
     row with an upload.

Verify: unit tests for each rule; run the extraction locally (dev DB,
real OpenRouter call) on `/tmp/final1808.txt` and `/tmp/r2304.txt`; both
return all rows including Estrone 16.3 and the antecedent rows; the
repair dry-run on the local copy of both real users prints the changes
listed in "Why" 3 to 6.

## 41B. The engine reads history, treatments and its own beliefs

Files: `lib/hkb.ts`, `lib/hypotheses.ts`, `lib/coverage.ts`,
`lib/derived.ts`, `lib/signals.ts`, `lib/personal.ts`,
`lib/hunches.ts`, `lib/hkb-catalog.ts` (one rewire only),
`lib/hkb-seed.ts` if the seed needs it, tests.

1. **Dependency order sees modifiers.** `inDependencyOrder` adds every
   `hypothesis:` input in `priors.modifiers[].when` to `needs`. A cycle
   is reported in a test failure, not resolved by the queue head.
2. **The one catalog rewire.** The atrophic-gastritis thyroid modifier
   (Lahner 2009, grade B, ×3) fires on `hypothesis: hashimoto above 0.4`
   OR `anti_thyroglobulin` or `tpo_antibodies` above the lab range on
   any draw in the last 5 years. Keep the `conditions` fact clause too.
   Nothing else in the catalog changes in this slice.
3. **History-aware metric inputs.** `LatestValue` gains `history: { min,
minAt, max, maxAt, n, belowRef, aboveRef, years }` computed from the
   same lab points (`coverage.ts:275-293`). `holds()` accepts
   `when.ever: { below | above, years }` with its own `inputKey`
   suffix `:ever` so it never supersedes the latest-value rule. An
   `ever` rule's LR is shrunk like grade C (`lr^0.5`) unless its source
   is about past values. Add to `VALUE_KEYS`.
4. **Treatment response as a synthetic fact.** From `profile_fact_history`
   of `supplements` and `medications`, plus a new `treatments` fact
   (list of `{ what, route, started, stopped? }`; the composer's rules
   layer learns "she's on iron since March", "IV iron infusion on 12
   Sept"), build `no_response:<code>` in `syntheticFact`
   (`hypotheses.ts:1655`): a treatment whose target marker is known
   (`TREATMENT_TARGETS`: iron → ferritin; B12 → vitamin_b12; vitamin D →
   vitamin_d; folate → folic_acid; levothyroxine → tsh) has run ≥ 90
   days, and the target's draws after day 90 sit below the lab range or
   under `pre-treatment median × 1.2`. Values: `"oral"`, `"iv"`, `"any"`.
   Also `treated:<code>` = route while active. The replay (41D) can
   seed dated treatments from the case file.
5. **Chronic signal.** `signals.ts` gains kind `chronic`: a marker below
   or above its lab range on ≥ 60 % of ≥ 4 draws spanning ≥ 2 years,
   including the last draw. `outAt` stops letting the personal band
   hide a lab-range exit for this kind. `chronic` needs the same guard
   (graph edge, cluster or goal). Ferritin with its graph edges passes.
6. **A confirmed condition opens its why.** When a belief with known
   cause conditions is `likely` or `confirmed` (`causesFor` from graph
   edges into it, plus catalog conditions whose evidence reads
   `hypothesis: <it>`), `refreshHunches` opens one hunch, kind `cause`,
   key `cause:<conditionId>`, whose explanations are those causes. The
   existing S5 lifecycle, chips, weights and test chooser run
   unchanged. Her `cause:iron_deficiency` hunch lists coeliac,
   atrophic gastritis, GI loss, heavy periods and whatever else the
   graph links; the test chooser then picks the cheapest splitter.
7. **The four wiring changes must not move the 25 journeys.** Run
   `eval:journeys` before and after; any flip is reported with its
   cause.

Verify: `pnpm --filter simple test` green; `eval:journeys` 25/25;
`eval:hunches` 5/5; a tsx script (`scripts/explain-belief.ts <userId>
<conditionId>`, kept, read-only) prints prior, each modifier and each
evidence row with its LR for case A's `atrophic_gastritis` on the local
copy, before and after.

## 41C. Case research: the catalog grows from a person

Files: new `lib/cases.ts` and `lib/cases.test.ts`, `lib/research.ts`
(new exports only; existing functions untouched except `featuresFor`
gaining an option), `lib/hkb-policy.ts`, `lib/hunches.ts` (origin on
explanations), a route `app/api/cases/run/route.ts`, tests.

1. **The case summary is code.** `caseOf(input: ModelInput, signals,
beliefs): CaseSummary` lists, each with numbers and dates:
   `chronic` markers, `ever` lows and highs, `no_response:*` facts,
   rising antibodies (any `*_antibodies`, `anti_*` code with step or
   drift up), discordances (e.g. ferritin under 15 with MCV ≥ 90),
   genome facts, confirmed conditions with an open `cause` hunch,
   the top 8 beliefs with p, and what was never measured among the
   tests the catalog offers for those beliefs.
2. **Queries.** One model call turns the summary into at most 6 Europe
   PMC queries. Each must combine at least two summary items (e.g.
   "refractory iron deficiency thyroid autoimmunity", "iron deficiency
   oral iron failure normal MCV"). Code rejects single-item queries.
3. **Read.** `epmc()` + `withAbstracts()` + `verify()`, at most 12
   papers per case, pre-ranked by design (meta-analysis, cohort, trial
   first) as the topic watch does.
4. **Propose.** One model call per batch of papers returns proposals,
   each with `doi`, a verbatim `quote` holding the number, `design`, `n`:
   - `evidence`: condition id, feature, `when`, `lr`/`lrNeg`;
   - `modifier`: condition id, a `when` on another `hypothesis:`, a
     `metric` (latest or `ever`), a `fact` (incl. `no_response:*`,
     `genome:*`), `times`;
   - `condition`: a condition the summary points at that is not in
     ring 1, matched to an `hkb_conditions` row by name or MONDO id.
     `featuresFor(conditionId, { forCase: true })` offers the case's
     features (the synthetic facts, `hypothesis:` ids, `ever` inputs)
     beside the condition's own.
5. **Policy.** `decide()` learns two things: `hypothesis:` features and
   modifiers are allowed when the quote holds the number; a ring-2
   condition is promoted (`in_catalog = true`, `needs_look = true`) when
   at least one A or B rule for it is accepted in the same run. The rest
   of phase 15 policy (quote check, DOI, grades, pooling, caps) applies
   unchanged. Nothing waits on a click; `needs_look` rows show on
   `/brain`.
6. **Explanations for the case's hunches** (the `cause` hunch and any
   raised hunch) are re-filled after the run so they can name the newly
   promoted conditions. Every explanation carries
   `origin: "paper" | "catalog" | "model" | "you"` and its source.
7. **When it runs.** After a new draw lands (the curator's post-upload
   pass), at most once a day per user, and on `POST /api/cases/run`
   (owner or admin). Budget: `CASE_BUDGET_USD` per run (default 0.30),
   counted from the model responses' usage; stop cleanly when spent.
   Queries and paper reads cache in the existing research tables so a
   second user with the same pattern costs nothing.
8. **Best read.** `/api/hunches/[id]` gains `bestRead: { name, p, why:
string[], sources: { doi, title, grade }[], confirmWith: { doctor,
tests: string[] } } | null`, set when the top explanation's weight is
   ≥ 0.35 or its engine belief is `possible` or louder. The sentence
   starts "Our best read:". Web and iOS show it at the top of the case
   (41E).

Verify: unit tests with a mocked model (queries rejected when single
item; proposals with a missing quote number rejected; ring-2 promotion
only with an A/B rule; budget stop). One live run on the local copy of
case A prints the queries, the papers, each proposal with its
decision, and her `atrophic_gastritis` p before and after.

## 41D. Blind replay: the eval that counts

Files: `lib/data.ts`, `lib/coverage.ts` (asOf plumbing only; 41B owns
the rest of the file, so 41D starts after 41B), `lib/hunches.ts`
(`personOf` and `refreshHunches` gain `asOf` and `dryRun`), new
`evals/replay.ts`, `evals/replay/cases.json`, `package.json` script
`eval:replay`.

1. **asOf everywhere.** `getMetricRows(userId, { asOf })` filters
   `observed_at <= asOf`; `buildModelInput(userId, asOf)` passes it and
   sets `today = asOf`; `slopePerYear` drops points after it;
   `personOf` and `refreshHunches({ asOf, dryRun: true })` return the
   hunches without writing. Facts use `profileAt(asOf)`.
2. **Hindsight recall, no labels needed.** For each draw date D of a
   real user, run the engine as of the day before D. Collect what it
   would have asked for (top 5 `nextMoves` tests, hunch tests, gaps).
   Compare with what was actually measured for the first time on D or
   later. Report per user: tests asked before they were done, the lead
   time in days, and tests done that the engine never asked for.
3. **Open predictions.** `evals/replay/cases.json` holds real-case
   expectations the future has not answered yet, by user id:
   case A, two checkpoints, with 41C on:
   - `asOf` 2024-06-01 (before any iron; chronic low ferritin, B12 172
     in 2021, first anti-Tg 65 on 2024-05-13): `atrophic_gastritis` at
     `possible` or louder, a `cause:iron_deficiency` hunch open, and
     `parietal_cell_antibodies`, `gastrin` or `pepsinogen_i` in the top
     5 moves. This is the hard one: no treatment failure yet.
   - `asOf` 2025-06-01 (oral iron about 8 months, ferritin 6.9 on
     2025-05-28): the same, plus `no_response:ferritin = "oral"` in the
     case summary.

   Dated treatments seeded for the replay (owner, 2026-09-28): oral iron
   from 2024-09 (about two years ago) to 2026-09, then IV iron in
   September 2026. No draws after the IV yet. The same treatments are
   written as her `treatments` fact on prod after the owner's OK.

4. **Two modes.** `--no-research` runs 41A+41B only. The default runs
   41C's case research at each asOf with papers published up to that
   date only (`FIRST_PDATE:[* TO asOf]` in the Europe PMC query), so the
   replay cannot read the future. Results go to
   `evals/results/replay-<date>.json`; the table prints per asOf: top
   beliefs, top moves, raised hunches, pass/fail per expectation, cost.
5. **The synthetic journeys stay** as regression tests (removal needs an
   owner OK). `eval:replay` is the headline eval from now on.

Verify: `pnpm --filter simple eval:replay --no-research` on the local
copy prints both real users' hindsight tables; the full run is
reported with its cost. Every assertion's outcome is reported as it
came, pass or fail; a fail is a finding, not something to tune away.

## 41E. Screens

Files: web `components/hunch-*.tsx` and the case view; iOS
`HunchCaseView.swift`, `Hunches.swift`, `Api.swift`, fixtures and
contract tests on both sides.

- The case opens with **Our read** (owner, 2026-09-28: a differential, not
  one diagnosis). It shows up to 3 options from `differential`, each with its
  percent, one-line reason, sources with grade glyphs and its confirm test.
  Then "Other or unexplained NN%", and the test that splits them. For the
  top option, "See: <specialty>" comes from `bestRead`. The hunch card's
  percents come from the differential, not from `weightsOf`, so the card and
  the belief agree.
- Every explanation shows its origin glyph: paper ●, catalog ◆, model ○,
  you ✎.
- Today shows "1 result still pending from 18 Aug" when an upload has
  `pending` names.
- `fixtures/api/hunch.json` regenerated; iOS `ContractTests` green.

## 41F. Models and belief consistency (added 2026-09-28, after 41C round 3)

Owner decisions, 2026-09-28: Gemini is for OCR only. Case research uses
`anthropic/claude-opus-5.5`. Daily non-OCR calls use
`anthropic/claude-sonnet-5.5`. PDF text extraction stays on Gemini (the owner
tested it). Photo reading (`classifyPhoto`: food photos, what food is in them
and what it contains) gets a bake-off before a model is picked.

Models (41F-M):

1. `AI_DEFAULT_MODEL` and `AI_ASK_MODEL` become `anthropic/claude-sonnet-5.5`.
   `AI_CASE_MODEL` is `anthropic/claude-opus-5.5`. Every non-OCR call site
   must work on its model. Anthropic refuses large `generateObject` schemas
   ("Schema is too complex"). So the tool-call path from `lib/cases.ts`
   (`objectCall`) moves to one shared helper that every structured call
   uses. The helper uses a `submit` tool with `toolChoice: "auto"` on
   `anthropic/` models, then validates with zod. Other models keep
   `generateObject`.
2. The output cap is set per call where reasoning needs room (case research
   16k). The global default stays.
3. A photo bake-off on `evals/capture.ts` cases, over 3 or more
   non-Gemini vision models plus the current one as a baseline. It measures
   food named correctly, the quality of the nutrient estimates, cost and
   latency. It prints a table sorted by cost. No switch until the owner
   picks.
3a. Daily-model bake-off (owner, 2026-09-28): Sonnet 5.5 is provisional.
   `eval:models` (ask + thread), `eval:compose` and a hunch explain sample
   compare openai/gpt-6-luna, z-ai/glm-5.3-flash,
   deepseek/deepseek-v4.1-flash, xiaomi/mimo-v2.6-pro and
   meta/muse-spark-1.3 against Sonnet 5.5. Pick the cheapest model within
   about 5% of Sonnet's scores. The vision-capable ones also join the photo
   bake-off.
4. Every eval that exercises a switched call site still passes on the new
   model (`eval:ask`, `eval:thread`, `eval:compose`, `eval:hunches`,
   `eval:trends`, `eval:second-pass` where it applies).

Engine (41F-E):

1. Belief consistency. A cause share ("19 of 71 people with iron deficiency
   anaemia had atrophic gastritis") is a conditional P(C | X). It must not go
   through `times = share / base prior`, then the grade shrink and the ×6
   cap. Score it as a mixture: P(C) = P(C | X)·p(X) + P(C | not X)·(1 − p(X)).
   Here P(C | X) is the share, shrunk toward the base by grade, and then
   moved by this person's other modifiers on C in odds. Today the cause
   hunch gives atrophic gastritis 0.61 of the iron causes, while the belief
   says 0.12. After this change the two numbers must agree in direction and
   size.
2. Name guard on whole words. "hypothyroxinemia" must not match
   "hypothyroidism".
3. `epmc()` must flag a failed fetch (503) and not cache it as an empty
   result.
4. Differential, not diagnosis (owner, 2026-09-28). Her true cause is
   unknown, so the replay never scores a single diagnosis as truth. An open
   `cause:` hunch carries a differential: the top 3 causes with p and source,
   the test that separates them, and an "other or unexplained" remainder.
   The replay checks that the differential is grounded and that it holds the
   right question (a gastric cause after oral iron fails), not that one
   answer wins. Any stomach test named for the gastric
   option counts, intrinsic factor antibodies included.

## Order and parallelism

41A and 41B run in parallel (disjoint files). 41C and 41D start when 41B
is merged (41C reads 41B's synthetic facts and `ever` inputs; 41D
touches `coverage.ts`). 41E starts when 41C's API shape lands. The main
agent reviews each diff, re-runs the verify lines, and only then starts
the next.

## Owner steps (not code)

- OpenRouter key "Vitals" (`sk-or-v1-73f…8b1`): $30 weekly limit,
  $29.49 left on 2026-09-28. Enough for 41A's live check and 41C/41D;
  keep the full replay under about $10 a run.
- Iron history dates for the replay: when oral iron started and stopped,
  and the IV dates.
- Upload the files that never reached the app: the 18.8.2026 report
  (final, with estrone), the 24.04.2026 report (blood count with WBC
  3.48 and neutrophils 1.65), the 30.05.2019 report (glucose
  tolerance), and the two password-protected ones once 41A-8 ships.
- Prod: deploy, then `repair:readings --apply` for both users, then a
  case run for case A. Each step after the owner's OK.

## Not in this phase

A catalog revision as of a past date (the replay uses today's knowledge
with papers cut at asOf; the leak is in the rules, stated in the report).
Life-event overlays. On/off experiments on phone data.
