# Phase 21: the defect sweep, and the sanity suite that keeps it swept

Owner ask (2026-09-01): find more defects like the mammography-for-a-man
one, fix each, and lock every fix with a test or an eval so existing
paths keep working when future agents touch the catalog. Everything in
`apps/simple`. No new deps. Ponytail. ROADMAP principles.

Every defect below was verified by probing the live catalog (transcript
2026-09-01); nothing here is speculative. Fix them in order; the sanity
suite (section 6) is the deliverable that outlives the fixes.

## 1. Discriminators have no gates (the mammography defect)

`Discriminator` in `lib/hypotheses.ts` has no `appliesTo`, so
`cancer_screening_due` (a both-sex condition) offers **Mammography** and
a **PSA discussion** to everyone, and **Low-dose CT** to never-smokers.
Confirmed live: `interview_fatigue_coffee_m41` ordered mammography at
step 5.

Fix: add to the `Discriminator` interface

```ts
appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
/** the fact that has to hold before the test makes sense at all */
requiresFact?: { fact: string; includes: string };
```

Gate the three rows: Mammography `{ sex: "female", minAge: 40 }`; PSA
discussion `{ sex: "male", minAge: 45 }` (USPSTF 2018: 55–69 routine,
45 with family history; use 45 and let the howTo say the rest); Low-dose
CT `requiresFact: { fact: "smoking", includes: "current|former" }`,
`minAge: 50` (USPSTF 2021). Sweep the rest of the catalog and
`lib/hkb-rare.ts` for other discriminators that need a gate; from the
probe, none besides these three (FSH/estradiol and testosterone live
inside already sex-gated conditions), but look with fresh eyes.

Enforce the gate in **every** consumer: `lib/infogain.ts` test
candidates, `lib/tree.ts`, `lib/journey.ts` (the world must not answer a
gated-out test), and `lib/brain.ts`/`components/brain.tsx` if they list
discriminators. One shared `discriminatorApplies(d, m)` helper in
`hypotheses.ts`, used everywhere, tested.

Locks: unit test (m45 never sees Mammography/PSA in `nextMoves` with
`cancer_screening_due` at 0.8; f45 never sees PSA; never-smoker never
sees LDCT; f52 smoker DOES see Mammography and LDCT so the gate is not
overshooting). Add `notOrders: ["Mammography", "PSA discussion"]` to
`interview_fatigue_coffee_m41` and `notOrders: ["Low-dose CT"]` where a
journey has a never-smoker; add one new journey
`screening_f52_smoker.json` (truth: screening never done, 30 pack-years;
expect `cancer_screening_due` discovered and Mammography + LDCT among
the ordered tests, PSA never).

## 2. Sex-blind numeric thresholds

`EvidenceRule.when` has no `sex`, so three rules use the male cut for
women:

| rule                                  | today          | should be        | source                                                                                                                                                                     |
| ------------------------------------- | -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `haemochromatosis/hfe_ferritin_high`  | ferritin > 300 | > 300 M, > 200 F | EASL 2022 Clinical Practice Guidelines on haemochromatosis (J Hepatol): ferritin above 200 µg/L in women, 300 in men, with raised TSAT, is the phenotypic case definition. |
| `gout_hyperuricaemia/gout_urate_high` | uric acid > 7  | > 7 M, > 6 F     | The saturation-referenced hyperuricaemia definition (Bardin 2014 Curr Opin Rheumatol; ACR usage): 7 mg/dL men, 6 women.                                                    |
| `sleep_apnoea/osa_hematocrit`         | hct > 50       | > 49 M, > 48 F   | WHO 2016 polycythaemia thresholds (Arber 2016 Blood): hct 49 % men, 48 % women mark absolute erythrocytosis.                                                               |

Fix: add `sex?: Sex` to `EvidenceRule.when`, AND'd with the other keys
in the matcher (a rule with `sex` and no `m.sex` is missing, not false).
Split each of the three into two rows with the right cut and the source
above. Check `iron_ferritin_*` and stop there: the deficiency cuts (15, 30) are deliberately sex-independent (WHO 2020 ferritin guideline), say
so in a comment.

Locks: `hypotheses.test.ts` cases: woman ferritin 250 + TSAT 48 scores
haemochromatosis higher than a man at ferritin 250 does; woman urate
6.5 fires `gout_urate_high`, man 6.5 does not. One journey
`haemochromatosis_female_47.json`: ferritin 260, TSAT 52, everything
else typicalNeg; expect haemochromatosis discovered (this is exactly the
patient the 300 cut misses).

## 3. Orphan facts: rules that can never fire

These evidence rules read `input.fact` keys that no question asks, the
composer cannot write (`/api/facts` rejects unknown keys), and
`syntheticFact` does not compute. They have been dead since they were
written:

- `pcos/pcos_cycles` reads `cycle_regularity`; `pcos/pcos_hirsutism`
  reads `hirsutism_acne` — two of the three Rotterdam criteria, so PCOS
  is effectively undiagnosable from the interview.
- `sleep_apnoea/osa_sleepiness` reads `daytime_sleepiness`, but the
  interview and the composer write `sym_sleepiness`. Duplicate key.
- `sleep_apnoea/osa_neck` reads `neck_cm`.
- `b12_deficiency/b12_diet_negative` and the two `diet` rules in
  `lib/hypotheses.ts` (~lines 1265, 1301) read `diet`.

Fix, ponytail order:

1. `osa_sleepiness`: point the rule at `sym_sleepiness`. No new
   question. Delete nothing else.
2. Add three `ASKED` entries in `lib/vectors.ts` with sources and
   `revisitDays`: `cycle_regularity` (female, 15–55; options like
   Regular / Irregular / Fewer than 9 a year — take the wording from the
   Rotterdam 2003 criteria), `hirsutism_acne` (female; No / Yes),
   `neck_cm` (free numeric; the STOP-Bang neck item, Chung 2008). `diet`
   (everyone; options that include Vegetarian and Vegan so the existing
   `includes` clauses match).
3. These are interview facts, so `lib/ask.ts` `symptomAsks` /
   `profileQuestions` should surface them only when they move a live
   hypothesis, which already happens once they are in `PROFILE_QUESTIONS`.
   Verify, do not rebuild.
4. Composer synonyms: add option words for the new facts to
   `understandRules` (e.g. "irregular periods" → cycle_regularity).

Locks: a **catalog invariant** in the sanity suite (section 6) that
fails on any future orphan fact. Unit test: f28 with Irregular + Yes
hirsutism moves `pcos` into the live band and `nextMoves` offers the
testosterone panel. One journey `pcos_from_interview_f28.json`: truth
Irregular cycles, hirsutism Yes, testosterone 68 ng/dL, LH 12 / FSH 5,
everything else typicalNeg; expect pcos discovered within 8 steps and
no false likely. Compose eval case: "my periods have been all over the
place and I keep breaking out" → cycle_regularity + hirsutism_acne
chips.

## 4. The no-op AUDIT rule

`alcohol_use_disorder/aud_audit_c_never` has `lr: 1, lrNeg: 1`: it does
nothing, while its own source (Bush 1998 Arch Intern Med, AUDIT-C
validation) says a Never on item 1 scores the instrument zero and
argues strongly against the disorder. Fix: `lr: 0.1`, drop `lrNeg`
(this IS the negative finding), keep the source, grade B. Lock: unit
test that `sym_alcohol = "Never"` lowers `alcohol_use_disorder` below
its prior.

## 5. Sweep the rest with the same probes, then stop

Re-run the three probes from the transcript as part of building section
6 (they become the suite): gate probe over `nextMoves` for
m45/f45/f52-smoker/m45-never-smoker with `screening_dates: "none"`;
threshold-vs-BOUNDS; option-string mismatch (`equals` is
case-insensitive in the matcher, so compare case-insensitively). Fix
only what a probe proves; anything debatable goes in the report as a
question, not a change.

## 6. The sanity suite (the deliverable that lasts)

`lib/hkb-sanity.test.ts`, pure, runs in vitest over the full merged
catalog (`CATALOG` + `RARE`) plus `PROFILE_QUESTIONS`, `SYMPTOMS`,
`BOUNDS`, and the graph:

1. **No orphan facts**: every `input.fact` is in `PROFILE_QUESTIONS`,
   or handled by `syntheticFact`, or prefixed `genome:` / `hp:`.
2. **Option strings match**: every `when.equals` on a fact with options
   equals one of them case-insensitively; every `when.includes` needle
   appears in at least one option or is a documented free-text pattern
   (family_history, screening_dates, conditions, medications and diet
   are free/list facts — skip those).
3. **LR sanity**: no rule with `lr === 1 && (lrNeg ?? 1) === 1`; where
   both exist, `lrNeg < lr`; discriminators `lrPos > 1 > lrNeg`.
4. **Thresholds plausible**: every numeric `when.above/below` on a
   metric with `BOUNDS` sits inside them.
5. **Sexed cuts declared**: for markers in a small `SEXED_MARKERS` list
   (ferritin, uric_acid, hematocrit, hemoglobin, testosterone_total),
   any rule with a raw threshold either carries `when.sex` or is on an
   allowlist with a comment naming the sex-independent guideline
   (the iron-deficiency ferritin cuts).
6. **Discriminator gates**: every discriminator whose test name or codes
   match a sex-specific list (mammography, psa, fsh, estradiol,
   testosterone, cervical) is either sex-gated itself or lives on a
   sex-gated condition; screening tests carry `minAge`; LDCT-style
   fact-dependent tests carry `requiresFact`.
7. **Graph hygiene**: every `when_.fact.key` and `facts[].key` on an
   edge is answerable (same rule as 1); every edge `codes` entry is a
   known metric code or fact.
8. **Condition gates respected**: `scoreHypotheses` on a plain m45 and
   f45 never returns a score for a condition whose `appliesTo.sex` is
   the other sex (this passed in the probe; keep it locked).

Every check prints the offending ids, so a failing import names its
rows. The suite must pass with zero allowlist entries beyond the ones
this spec names.

## 7. Verification

typecheck; full vitest (must not drop below 819 + the new tests);
`eval:compose` (13/13 with the new case); `eval:journeys` — 21 existing
plus `screening_f52_smoker`, `haemochromatosis_female_47`,
`pcos_from_interview_f28` = **24/24**. Re-run
`interview_fatigue_coffee_m41` and paste the ordered tests to show
mammography is gone. Report: files changed, every threshold changed
with its source, the sanity-suite check list with counts, deviations.
