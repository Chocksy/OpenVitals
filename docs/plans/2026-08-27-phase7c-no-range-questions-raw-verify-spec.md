# Phase 7c: no more range questions, and values checked against the lab sheet

User: "I do not know the optimal ranges; to answer I would ask an LLM or
Google. Some values are obviously wrong (RBC 0.00000523). The app should
settle both itself, and only ask 'are you sure?' with evidence."

## 1. Optimal ranges: decided by the app, never asked

Today `missing_optimal` asks the LLM for a band and queues a question unless
the band is trusted and inside the lab range. Change:

1. **Per-user bands.** New table `optimal_overrides` (migration 0005,
   CREATE only): `id, user_id, metric_code, low real, high real, unit text,
source text, basis text ('science'|'opinion'), rationale text,
sex text, age_band text, created_at, updated_at, unique(user_id,
metric_code)`. `optimalFor()` in `lib/coverage.ts` and `getMetricRows`
   read the override first, then `SEX_RANGES`, then `metrics.optimal*`.
   The shared `metrics.optimal*` columns stay as the fallback and are no
   longer written by user answers (fixes the two-users-overwrite problem).
2. **The proposal step gets the person.** The LLM prompt for a missing
   band includes sex, age, the lab's reference range for the latest
   reading, the unit, and the person's last five values, and must return
   `{ low, high, unit, source, basis, rationale }` where `source` is a
   named guideline or a named author and `basis` is `science` when a
   guideline or meta-analysis is cited, else `opinion`.
3. **Apply always.** Write the override with the returned provenance.
   Sanity in code: unit must equal the metric unit (else convert with
   `lib/units.ts` or drop the proposal and log); if the band is wider than
   the lab range on both ends, clamp to the lab range and note
   "clamped to lab range" in `rationale`. No review item is ever created
   for a range. Delete the `optimal_range` review kind from the curator and
   close every open one as `applied` with answer "auto: applied with
   provenance" after writing the override for that user.
4. **Show provenance, allow override.** On `/m/[code]` the optimal band
   line reads "optimal 40 – 60 ng/mL · Endocrine Society 2011 · science"
   with an "Edit" that saves a user override with `source = "user"`. The
   old inline edit form for optimal ranges, if any, is replaced by this.
5. **Escalate only on impact.** If a new band flips the latest reading's
   status from green to red (not amber), the curator queues one
   `range_impact` item: "Your <metric> of <value> is now outside the
   optimal band <low – high> (<source>). Keep this band or use the lab's
   range?" with options "Keep optimal band", "Use lab range". That is the
   only range question left, and it carries the reason.

## 2. Raw-sheet verification (`raw_verify` check)

Every upload keeps the lab sheet text in `uploads.raw_text` (33 of 37
legacy uploads, and every new one). Use it as the source of truth.

Scope: readings with status red, plus any reading flagged `implausible`,
`foreign_reading`, `unit_converted`, `unit_relabelled`, or `ref_rescaled`,
plus the two open `implausible` items. Skip readings whose upload has no
raw text longer than 200 chars, and readings already flagged
`raw_verified` or `raw_confirmed`.

Algorithm, pure and tested in `lib/raw-verify.ts`:

1. Candidate lines: split raw text into lines; keep lines that contain the
   metric's name or any alias. Aliases come from the extraction catalog
   (`metricCatalogPrompt` names, `merge-metrics` name normalizer) plus a
   small Romanian list in the file (`Hematii|Eritrocite` → rbc,
   `Leucocite` → wbc, `Trombocite` → platelets, `Hemoglobina` →
   hemoglobin, `Proteina C reactiva|PCR` → crp, `Colesterol total`,
   `Trigliceride`, `Glicemie` → glucose, `Creatinina`, `Uree`, `Acid uric`,
   `Feritina`, `Vitamina D`, `TSH`, `FT4`, `ATPO` → tpo_antibodies,
   `ATG|Anti-TG` → anti_thyroglobulin, `Fier` → iron, `Magneziu`, `Calciu`,
   `Zinc`, `Albumina`, `Bilirubina`, `Sodiu`, `Potasiu`, `Hematocrit`,
   `VSH` → esr, `Fibrinogen`, `Insulina`, `Hemoglobina glicata|HbA1c`).
2. Parse the first number after the alias as the value and the first
   `a - b`, `a–b`, `< b`, `> a` after it as the range. Handle Romanian
   number formatting: `4.020.000` is 4,020,000; `1,26` is 1.26; `224.000`
   is 224,000 when followed by `/mm³` or when the range uses the same
   thousands pattern.
3. Compare with the stored row after unit normalisation
   (`normalizeUnit` + the factor table): value within 2 %, range within
   2 %. Outcomes:
   - match → flag `raw_confirmed`.
   - value or range differs by a clean unit factor → rescale the stored
     side to match the sheet and the metric unit, flag
     `{ raw_verified: { orig: { value, refLow, refHigh }, sheet: "<line>" } }`.
   - differs otherwise (typo-level) → replace with the sheet's numbers,
     same flag.
   - alias found but unparsable, or alias not found → queue
     `confirm_value`: "The stored <metric> is <value> <unit> on <date>. The
     lab sheet line reads: '<line or 'not found'>'. Keep it, or discard the
     reading?" with options "Keep", "Discard reading", "Note…" (the note is
     the corrected value; `applyAnswer` parses it).
4. The RBC `0.00000523 M/uL` row must come out as 5.23 M/uL with the
   original kept in the flag. The CRP `0.64 mg/L` with ref `<0.33` must end
   with the sheet's range in mg/L (0 – 3.3 if the sheet says 0.33 mg/dL).

Run order: after `ref_scale`, before `implausible_value`.

## 3. Verification

```
command pnpm --filter simple typecheck
command pnpm --filter simple test
command pnpm --filter simple db:generate && command pnpm --filter simple db:migrate   # CREATE only
command pnpm --filter simple curate
```

Report before/after `select kind, count(*) from review_items where
status='open' group by kind` (expect `optimal_range` 0, `confirm_value`
small), the number of `raw_confirmed` and `raw_verified` flags, the RBC and
CRP rows after the run, and ten random `raw_verified` rows printed next to
their sheet line. For both users, `select count(*) from optimal_overrides`
and five sample rows with source and basis. `/m/rbc` and `/m/crp` for the
user (browser is signed in as razvan.ciocanel@gmail.com; reading pages is
fine, do not answer anything) show the provenance line; screenshot
`/tmp/metric-provenance.png`.
