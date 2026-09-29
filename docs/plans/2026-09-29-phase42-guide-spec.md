# Phase 42: guide the person, and change our mind when science does

Date: 2026-09-29. Branch `simple`. Status: approved by the owner ("do
these yes", on the six review items, plus a longer differential and
"very important" on papers moving beliefs). Everything in `apps/simple`
unless a slice says otherwise.

## Why

The owner asked for a review of the site against the goal: the person
understands their health, knows what to change, is guided as things
evolve, and the app changes its mind on new data and new papers. The
review (web as the owner, API as case A) found:

| Finding                                 | Evidence                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First action repeats a failed treatment | Case A: "Ferrous sulfate 65 mg every other day" while `treatments` holds oral iron 2024-09-01 to 2026-09-01 (ferritin never rose) and IV iron since 2026-09-01. `lib/actions.ts` never reads treatments. |
| Most common cause gets 0 %              | Heavy menstrual bleeding is a model-only `outside:1` explanation, weight 0, hidden in "other 63 %". The catalog has no condition for it or for low intake.                                               |
| New papers never move a belief          | 48 `paper_watch` rows on prod; the condition rows were graded but moved under `MOVE_FLOOR`, none became a rule, none was seen. Case research runs only after an upload.                                  |
| Two hunches for one problem             | `chronic:ferritin` and `cause:iron_deficiency` ask different questions and name different tests. `cause` and `chronic` are not in `STORY`, so Watch (cap 5) drops them.                                  |
| Wrong case text                         | Every `predicts` names the one chosen test. Option `reason` is LLM text that never saw the order ("less likely but possible" on the top option). "She carries DQ2.5" addressed to her.                   |
| Genome ignored in a test choice         | Owner: HLA says coeliac is essentially excluded, yet the iron cluster's GI option (0.606) picks tTG-IgA (195 RON) and there is no "other".                                                               |
| Duplicate draws                         | Case A: 2025-12-09 and 2026-08-18 twice; charts print "was 8.2 … 0 %".                                                                                                                                   |

Verified on prod and dropped from the list: the coeliac option citing
Annibale 2001 is correct (4 coeliac of 71; saved share 0.056).

## Principles kept (phase 41)

- Detection, scoring and test choice are code. The model proposes and
  writes sentences. A number reaches the engine only with a DOI, a
  verbatim quote and a grade.
- Population prevalence is the base; the person's data moves it.
- A differential, never a diagnosis: options with shares, an "other"
  remainder, the test that splits them.
- Every line carries its origin: paper, catalog, model, you.

## 42A. Actions read the treatment history

Files: `lib/actions.ts`, `lib/actions.test.ts`, `lib/report.ts`,
`app/(app)/page.tsx` only if the call needs a new argument.

1. `actionsForAll` builds the model input once (`buildModelInput`) and,
   for each card's marker codes, computes `noResponse(input, code)`
   (`lib/hypotheses.ts:1843`) and `treatedWith`. It passes a pure
   `failed: { code: string; routes: string[] }[]` and
   `active: { code; routes }[]` into `pickActions`.
2. `pickActions` drops a non-test action whose title or dose matches the
   code's `TREATMENT_TARGETS` regex on a failed route (no IV wording
   counts as oral). Tests are exempt (the regex also matches "Iron
   saturation"). An action already active (same target, same route) is
   dropped too: it is "already doing", not "to do".
3. When a drop happens for a failed route, the card gains one line in
   the list's place: "Oral iron did not raise ferritin (Sep 2024 to Sep
   2026). The next step is finding the cause." It uses the dates from
   the treatment. No new action is invented.
4. `pickActions` also drops ids in `dismissed_actions` ("Not for me").
5. `report.ts` `factLines`: print array-of-object facts as readable
   lines (`treatments`: "iron, oral, 2024-09-01 to 2026-09-01"), and add
   one line per `no_response:<code>` ("oral iron failed to raise
   ferritin"). The prompt tells the model not to propose a treatment
   that failed.

Verify: unit tests for the drop (failed oral, active IV, test exempt,
dismissed). A tsx one-off on the local DB prints case A's card actions
before and after; oral iron is gone.

## 42B. A longer differential, grounded in population data

Files: `lib/hunches.ts` (differential only), `lib/hypotheses.ts`
(catalog priors), `lib/hkb-catalog.ts`, `lib/symptoms.ts`,
`lib/api-contract.ts` (differential shape), `components/hunch-board.tsx`,
iOS `HunchCaseView.swift` and fixtures, tests.

1. `DIFFERENTIAL_SIZE = 10`. Options under 1 % after scaling are not
   listed; they count in "other". `MIN_OTHER` stays 0.1. The UI lists
   every option; after the first 4 it folds the rest behind "N more"
   (web: a disclosure; iOS: a row that expands).
2. New cause conditions for iron deficiency, each with an age and sex
   prior, a share among people with iron deficiency, a test or question
   that separates it, and a real source:
   - `heavy_menstrual_bleeding`: female, 12 to 55.
   - `low_iron_intake`: diet (vegetarian, vegan, low red meat).
   - `blood_donation_loss`: regular donors.
   - `pregnancy_postpartum`: female, pregnancy or birth in 2 years.
     Each share comes from a paper found through `epmc()`/`pubmed()`, with
     a DOI and a quote that holds the number, checked with the existing
     `verify()` against the abstract. The implementer prints each quote
     and its verify result in the report. No number without a quote. If a
     cause has no quotable share, it is left out and reported.
3. A new symptom `sym_heavy_periods` (female, max age 55): "Do your
   periods last more than 7 days, soak a pad or tampon every 1 to 2
   hours, or pass clots bigger than a coin?" Options No, Yes, Not sure.
   Source: NICE NG88 definition. `sym_cycle` stays as it is (its options
   are exclusive; "Irregular" and "Heavy" can both be true).
   `heavy_menstrual_bleeding` reads it with `lr` and `lrNeg` so both
   answers move it. The existing `iron_heavy_periods` rule on
   `iron_deficiency` moves to the new symptom too.
4. The cause hunch's question: when the differential holds a
   question-only option (heavy periods, intake, donation), the chips are
   built in code from those options' symptoms first, so "heavy periods"
   is the first chip for case A. The model still words the question.
5. The replay (`evals/replay.ts`) expectations: the heavy-periods option
   is present for case A with a share over 5 %; atrophic gastritis stays
   in the list; other is at least 10 %. Update
   `evals/replay/cases.example.json` to match (no real data in it).

Verify: `pnpm test` green; `eval:hunches` passes; `eval:journeys` 25/25
(report any flip with its cause); one `eval:replay` run with research
(the owner's OpenRouter budget: stop at $4 for this run).

## 42C. One case per problem, and correct text

Files: `lib/hunches.ts` (not the differential), `lib/signals.ts` if the
fold lives there, `lib/api-contract.ts` (`todayHunches`, `reasonOf`,
`withShares`), web and iOS only if a field changes, tests.

1. **Merge.** When a `cause:<X>` signal is raised and a `chronic`,
   `cluster`, `step` or `drift` signal's codes are all marker codes the
   condition X is scored on, the cause hunch absorbs it: one row, the
   cause key, the other signal's markers shown in the case, the other
   key closed with outcome `merged`. Case A shows one iron case.
2. **Watch.** `STORY` gains `cause` first and `chronic` after `cluster`.
   An open cause hunch is always in Watch.
3. **Predicts.** `predictionsOf` uses each explanation's own `check`
   (or its condition's first discriminator). An explanation with no own
   check says "Not settled by <test>" instead of a borrowed range. No
   lowercased sentence glued to a range.
4. **Reason text.** `EXPLAIN_PROMPT` receives each option's share and
   rank, and a rule: address the reader as "you", never "she" or "he";
   never contradict the share ("less likely" only for the lower ones).
   Bump the prompt version so cached text refreshes.
5. **Genome.** The fact line the model sees carries the catalog
   `meaning`. `checksOf` skips a check whose condition is below 1 %
   after the genome rule (tTG-IgA for the owner). Cluster and chronic
   hunches keep an "other" remainder of at least `MIN_OTHER` in
   `weightsOf`, the same as the differential.

Verify: unit tests for merge, `STORY`, predicts, genome skip, remainder.
The local DB shows case A with one iron case in Watch and the owner's
iron cluster with no tTG-IgA.

## 42D. New papers change beliefs, and the person sees what moved

Files: `lib/curator.ts` (daily branch), `lib/cases.ts` (run summary,
moves), `lib/ledger.ts` only if `changeOf` needs the new summary shape,
`lib/research-watch.ts`, `lib/api-contract.ts` (one additive field),
`components/hunch-board.tsx` (one block), `components/research-panel.tsx`,
iOS `HunchCaseView.swift` (one block), tests.

1. **Weekly re-run.** In the daily curator pass, run `researchCase` for
   a user when `dueAgain("case-run", 7, "<userId>:")` holds and the user
   has an open `cause` hunch or a confirmed or likely belief. Same
   in-process guard as the upload hook. Budget per run stays
   `CASE_BUDGET_USD`.
2. **The watch feeds the case.** When the condition watch files a
   graded paper for a condition in the user's open cause differential,
   the next daily pass runs the case at once (ignore the 7 days, keep
   the 1-day guard). The paper's DOI is passed as a seed so it is read
   first.
3. **What moved.** `researchCase` takes the user's beliefs before and
   after the save (`beliefsAt` or the scored input) and stores, in the
   `case-run` row, `moves: { conditionId, name, from, to, dois[] }[]`
   for each change of at least 2 points. The revision summary starts
   with the moved condition ids and the DOIs, so `changeOf` reports it as
   `knowledge`.
4. **Show it.** `/api/hunches/[id]` gains `research: { at, moves }` for
   the latest run that moved an option in this case. The case shows one
   block above the options: "New research, 29 Sep: Annibale 2001 moved
   atrophic gastritis from 12 % to 29 %." Each DOI is a link. When a run
   moved nothing, the block says "Checked 12 new papers on 29 Sep.
   Nothing moved." (Honest, and it shows the app keeps looking.)
5. **Seen.** Opening the research panel on web PATCHes `seen` for the
   rows it shows, as iOS already can.

Verify: unit tests (weekly due, watch-triggered run, moves above 2
points only, summary names the condition). One dry run on the local DB
for case A prints the moves. Cost of one run printed.

## 42E. One draw, one row

Files: `lib/uploads.ts`, `lib/uploads.test.ts`, `lib/data.ts`,
`scripts/repair-readings.ts`, `lib/documents.ts` (document path uses the
same check), tests.

1. `planInsert`: dedupe inside the fresh batch too (same metric, day,
   value). Compare values with a relative tolerance of 1e-4. When the
   stored row lacks ranges and the fresh one has them, update the stored
   row's ranges instead of skipping silently.
2. `planSupersede` keeps the older row's ranges when the newer row has
   none.
3. Serialize saves per user with `pg_advisory_xact_lock(hashtext(userId))`
   at the start of the save transaction.
4. `getMetricRows` collapses same-day same-value rows (keep the one
   with ranges) as a fallback.
5. `repair-readings` step 5 orders ranged rows first and partitions on
   `round(value::numeric, 4)`; before deleting, it copies ranges onto
   the kept row.

Verify: unit tests for each rule; `repair:readings` dry run on the
local DB prints case A's duplicate pairs for 2025-12-09 and 2026-08-18.

## Order and parallelism

- Round 1, in parallel (disjoint files): 42A + 42E (one implementer),
  42B + 42C (one implementer, they share `hunches.ts` and
  `api-contract.ts`).
- Round 2: 42D, after 42B/42C land (it adds a block to the same case
  view and a field to the same contract).
- The main agent reviews each diff, re-runs the verify lines, then asks
  the owner before commit, deploy and the prod `repair:readings --apply`.

## Not in this phase

Hormone hunches (the one-off FSH 38 in Oct 2024). The Body page's raw
HealthKit identifiers and time-of-day comparisons. The Plan's duplicate
rows. These are logged for the next review.
