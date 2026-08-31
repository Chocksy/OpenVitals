# Phase 21b: gates that move with the person, and criteria that move with the evidence

Owner ask (2026-09-01): screening gates must not be absolute years — a
family history of colon cancer means colonoscopy before 45; mammography
must not be fixed either. And fluid diagnoses (PCOS above all) need
their rules to keep updating as new data shows up, because the criteria
themselves are not exact. Everything in `apps/simple`. No new deps.
Ponytail.

## 1. Relative gates: `earlierWhen`

Extend the discriminator gate (phase 21, `lib/hypotheses.ts`):

```ts
appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
requiresFact?: { fact: string; includes: string };
/** clauses that lower minAge when they match; first match wins */
earlierWhen?: { fact: string; includes: string; minAge: number; source: string }[];
```

`discriminatorApplies` stays the single gate: evaluate `earlierWhen`
first (case-insensitive `includes` over the fact text, same matcher the
evidence rules use), take the matched clause's `minAge`, else the base.
A clause never _raises_ the age.

Rows, each with its source in the clause:

- **Colonoscopy** (base 45, USPSTF 2021): `family_history` includes
  `colorectal|colon|bowel` → **minAge 40**. Source: USPSTF 2021 /
  US Multi-Society Task Force 2017: first-degree relative → start at 40
  or 10 years before the relative's diagnosis, whichever is earlier.
  `// ponytail:` fixed 40; the "10 years before the relative's dx" term
  needs a dx age nobody asks yet — name that ceiling in the comment.
- **Mammography** (base 40, USPSTF 2024): `family_history` includes
  `breast` → **minAge 30**. Source: ACS high-risk guideline (Saslow
  2007, reaffirmed): annual screening from 30 for women with strong
  family history; NICE CG164 moderate-risk from 40. Use 30 and let
  `howTo` say a genetics referral decides MRI.
- **PSA discussion**: base moves 45 → **50** (USPSTF 2018 shared
  decision 55–69; 50 is the common conversation start), with
  `earlierWhen`: `family_history` includes `prostate` → **45**
  (USPSTF 2018: higher-risk groups may benefit from starting at 45),
  and `ancestry` includes `african|black` → **45** (same source: Black
  men carry roughly double the mortality risk). Two clauses, first
  match wins, order them family-history first.
- Low-dose CT unchanged.

Sweep: no other discriminator needs a clause today; say so in the
report if the sweep agrees.

Update sanity check 6 so a screening test may satisfy the age
requirement via base `minAge` or `earlierWhen` (every clause must carry
`minAge` and `source`). Add a check-6 assertion that every
`earlierWhen.minAge` is strictly below its base `minAge`.

Locks: unit tests in `hypotheses.test.ts`/`infogain.test.ts`: m42 with
"father colon cancer" sees Colonoscopy in `nextMoves`, m42 without does
not, m39 with it still does not; f33 with "mother breast cancer" sees
Mammography, f33 without does not; m46 with "father prostate cancer"
sees the PSA discussion, plain m46 does not, plain m52 does. One new
journey `crc_family_history_m42.json`: truth carries
`family_history: "father colon cancer at 52"`, `screening_dates:
"none"`, all labs typicalNeg; expect `cancer_screening_due` discovered
and Colonoscopy among the ordered tests, Mammography and PSA never.
Journeys 24 → 25, all passing.

## 2. Contested criteria: the watch list

The research schedule (`scripts/hkb-research.ts`) picks the ten
_thinnest_ conditions, so a condition whose rules were just revived
(PCOS) stops being revisited exactly when its contested criteria most
need fresh papers. Add to `lib/research.ts`:

```ts
/** Conditions whose diagnostic criteria are themselves in motion, so the
 *  monthly run always includes them regardless of how thick they look.
 *  Each entry says why, with the citation that calls the criteria contested. */
export const CONTESTED: { id: string; why: string }[] = [
  {
    id: "pcos",
    why: "Rotterdam vs AE-PCOS vs the 2023 international guideline disagree on which two of three criteria suffice; AMH keeps moving in and out (Teede 2023 J Clin Endocrinol Metab).",
  },
  {
    id: "mast_cell_activation",
    why: "Consensus-1 vs consensus-2 diagnostic criteria are openly disputed (Valent 2019 vs Afrin 2020).",
  },
  {
    id: "sibo",
    why: "Breath-test cutoffs and the role of the microbiome panel are unsettled (Rezaie 2017 North American consensus vs later critiques).",
  },
];
```

`thinnestConditions` (or its caller) appends the CONTESTED ids to every
run, deduped, after the thin ones, inside the same token budget. Rows
still land through the existing policy (auto-accept by grade, pooling
merges LRs, D/E to the horizon) — nothing new in how evidence enters,
only in what gets looked at. `/hkb` Activity already shows the runs, so
the owner can watch the criteria move.

Locks: a unit test that the pick list contains the three ids even when
they are the thickest conditions in the table, and that dedupe holds
when one is also thin.

## 3. Bookkeeping

- The dead `hkb_evidence` row `pcos_cycles` was deleted by the owner's
  OK (2026-09-01, main agent, SQL). Nothing to do; noted here so the
  history has one place that says why the row is gone.
- Sanity-suite posture stays: checks are structural (rules fire, gates
  exist, LRs sane), never exact values, so research updates and pooled
  LRs never fight the tests. State this in a comment at the top of
  `hkb-sanity.test.ts` if it is not already there.

## 4. Verification

typecheck; vitest (≥ 859 + new); `eval:journeys` 25/25; re-seed
(`hkb:seed`) and verify the gates round-trip through `loadCatalog`
(TEST_GATES by name must carry `earlierWhen` too). Paste: the m42
family-history journey's ordered tests; the unit-test names; the pick
list from the CONTESTED test. Report files changed, deviations, open
questions.
