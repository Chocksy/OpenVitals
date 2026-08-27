# Phase 7b: stop the review flood, fix ranges and units deterministically

After the production copy the curator queued 239 questions for two users:
foreign_reading 76, optimal_range 73, implausible 54, unit_unknown 27. Almost
all come from four mechanical causes. Fix the causes, re-run the curator, and
the queue should drop to a few dozen genuine calls.

## 1. Diagnosis (from the live rows)

| Symptom                             | Example                                                                                                                                          | Cause                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| implausible + foreign on CBC counts | platelets `224 K/uL` with ref `150000 – 370000`; rbc `4.02 M/uL` ref `3900000 – 5200000`; eosinophils `0.25 K/uL` ref `20 – 500`, raw text `250` | The value is right (K/uL, M/uL) but the lab range stayed in cells/µL. Ratio is exactly 10^3 or 10^6.   |
| foreign on albumin                  | `5.349 g/dL` ref `35 – 53` (g/L), raw `53.49`                                                                                                    | Value converted to g/dL, range not. Ratio 10.                                                          |
| foreign "Negativ"                   | glucose, wbc, total_protein with `valueText = "Negativ"` and a blood range                                                                       | Urine strip lines mapped onto the blood metric by the old extractor.                                   |
| unit_unknown                        | `10^3/ul`, `x10^3/uL` → K/uL; `mm/h`, `mm la 1h`, `/ mm/h` → mm/hr; `μm 3` → fL; `pg/cell` → pg                                                  | Spelling only; same unit.                                                                              |
| unit_unknown, real conversions      | apoB `g/L` → mg/dL (×100); Lp(a) `g/L` (mass) vs nmol/L (molar); prolactin `uIU/mL` → ng/mL (÷21.2)                                              | Missing factors.                                                                                       |
| unit_unknown, different measurand   | pdw `fL` vs `%`                                                                                                                                  | PDW-SD (fL) and PDW-CV (%) are two measures, not one unit.                                             |
| optimal_range × 73                  | "Set optimal for Eosinophils % to 0–6 % (Function Health)?"                                                                                      | Every proposal is queued even when it sits inside the lab's own range and comes from a trusted source. |

## 2. Fixes, all in `lib/curator.ts` and `lib/units.ts`, tested

### 2.1 `ref_scale` check (new, runs before implausible and foreign)

For each reading with a numeric value and a numeric range where the value is
outside the range: for factor `f` in `[10, 100, 1000, 1e6, 0.1, 0.01, 0.001, 1e-6]`,
if `refLow*f ≤ value ≤ refHigh*f` (with 5 % slack) and no other factor also
brackets, rescale `refLow` and `refHigh` by `f`, add flag
`{ ref_rescaled: { factor: f, orig: [refLow, refHigh] } }`. Extra evidence
that makes it safe: the same metric's other readings for this user bracket
their own ranges at the value's magnitude (median ratio of value to refHigh
between 0.2 and 1.5). If the value is still outside after the only bracketing
factor, leave the row alone (that is the CRP 15.8 case, a real high value).
Idempotent: skip rows already flagged `ref_rescaled`.

### 2.2 Urine strip results (new check `urine_text`)

Reading with `value == null`, `valueText` matching
`/^(negativ|negative|absent|pozitiv|positive|trace|urme|prezent|present)/i`,
on a metric whose unit is a blood concentration (glucose, wbc, rbc, protein,
total*protein, ketones, bilirubin, urobilinogen, nitrites, hemoglobin): move
the reading to `urine*<code>`(create the metric with category "Urinalysis",
unit null, no ranges, if missing), clear`refLow/refHigh`, flag `moved_urine`.
No question. Existing open `foreign_reading`items for those rows are closed
as`applied` with answer "auto: moved to urinalysis".

### 2.3 Unit synonyms and factors (`lib/units.ts`)

Synonyms (identity): `10^3/ul`, `x10^3/ul`, `10³/µl`, `x10e3/ul`, `k/µl` →
`K/uL`; `10^6/ul`, `x10^6/ul`, `10⁶/µl` → `M/uL`; `mm/h`, `mm la 1h`,
`/ mm/h`, `mm/1h` → `mm/hr`; `μm 3`, `µm3`, `um^3` → `fL`; `pg/cell` → `pg`;
`g/dl` stays; `ui/ml`, `iu/ml` → `IU/mL`.
Factors: `g/l → mg/dl` ×100 for `apolipoprotein_b`, `apolipoprotein_a1`,
`lp_a`; `uiu/ml → ng/ml` ÷21.2 for `prolactin` (WHO 3rd IS, 1 ng/mL = 21.2
mIU/L); `mg/dl → mg/l` ×10 for `crp` (exists? verify). Lp(a): if the metric's
canonical unit is `nmol/L`, change it to `mg/dL` in the catalog seed and in
`SEX_RANGES`/vectors if referenced; molar ↔ mass is not convertible and mass
is what the labs here report.
PDW: readings in `fL` move to a new metric `pdw_sd` ("Platelet distribution
width (SD)", unit fL); `%` stays on `pdw`. Done in the `unit_unknown` planner
as an automatic move, flag `split_measurand`.

### 2.4 Optimal range auto-accept

In `planMissingOptimal` (the LLM proposal step): when the proposal's source
is in `TRUSTED_OPTIMAL_SOURCES = ["Attia/Outlive", "Function Health",
"Endocrine Society", "AHA", "ESC", "ADA", "KDIGO", "ATA"]`, the proposal's
unit equals the metric unit, and the proposed optimal band lies inside the
lab reference band of the latest reading that has one (or the metric has no
lab range anywhere), apply it directly: `optimalLow/High`, `optimalSource =
"auto:<source>"`, `needsReview = false`. Otherwise queue as today. Existing
open `optimal_range` items that now meet the rule are applied and closed
with answer "auto: inside lab range, trusted source". Every metric page keeps
its manual override, so nothing is locked in.

### 2.5 Implausible bounds sanity

`planImplausible` must compare in the reading's unit: if a bound table exists
in cells/µL for CBC, convert it to the canonical K/uL / M/uL, or express the
table in canonical units. Add a test with platelets 224 K/uL (fine) and
224000 K/uL (implausible).

## 3. Order of checks in `runCurator`

unit_spelling → unit_convert → ref_scale → urine_text → missing_range →
metric_identity → missing_optimal (with auto-accept) → implausible_value →
foreign_reading → goal_check. Each planner stays pure and tested.

## 4. Verification

```
command pnpm --filter simple typecheck
command pnpm --filter simple test
command pnpm --filter simple curate            # both users
```

Before/after counts by kind from
`select kind, count(*) from review_items where status='open' group by kind`.
Target: unit_unknown ≤ 5, implausible ≤ 10, foreign_reading ≤ 15,
optimal_range ≤ 25. Paste the remaining rows by metric so we can see what is
genuinely left. Also paste `select flags::text, count(*) from readings where
flags is not null group by 1` to show what was auto-fixed, and spot-check
five rescaled rows against the raw text in `uploads.raw_text` (the PDF text
is there) to prove the value and range now match the lab sheet.

Do not touch `/review` UI. Do not delete readings; moves and rescales only,
always flagged with the original.
