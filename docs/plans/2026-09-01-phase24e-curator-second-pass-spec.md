# Phase 24e: the curator's second pass — settle it before asking

From the UX audit (finding 2, the `/review` "values the lab sheet did
not settle" list). Ten rows on the owner's account read "sheet: not
found" and ask the person to Keep / Discard a stored reading. The owner
was promised a smarter second pass settles these. `apps/simple`.
Ponytail.

## 1. What a "not found" really is

`lib/raw-verify.ts` (phase 7) checks each extracted reading against the
raw sheet text; when the value string is not found on the page it
queues a `review_items` row of kind `confirm_value`. Most misses are
OCR/format artefacts: comma decimals ("5,82"), thousand dots, unit
tokens glued to numbers, a value split across a line break, a Romanian
label ("Numar eritrocite") the matcher does not associate with the
metric, or a value that genuinely was never on the sheet (hallucinated
by the extractor).

## 2. The second pass (`lib/second-pass.ts`)

Before anything reaches the person:

1. **Deterministic re-match** (pure, tested): normalise both sides
   (decimal comma ↔ point, strip thousands separators, collapse spaces,
   join hyphenated line breaks), search the page text for the value
   within ±3 lines of any known synonym of the metric (reuse
   `merge-metrics`/curator synonym data and the `metrics` table names;
   add the Romanian aliases the fixtures show). A hit with the right
   unit settles it as **verified** with the matched line stored as the
   evidence.
2. **Model re-read with the crop**: for the rest, one call with the
   page image crop (the upload's page render; if only text exists,
   the ±10-line text window) and a closed schema: `{ found: boolean,
value: number | null, unit: string | null, line: string }`. A
   `found` answer whose value equals the stored one (within unit
   tolerance) settles it as verified; a different value with high
   confidence becomes a **correction proposal** (stored value + proposed
   value + line) and applies automatically when the difference is an
   obvious artefact (decimal shift ×10/×100/×1000 with the corrected
   value inside the metric's `BOUNDS`) — otherwise it stays for the
   person; `found: false` twice (two runs) marks the reading
   `unverified` and hides it from the engine (`flags: ["unverified"]`,
   the engine already respects flags for confounders — extend to skip
   unverified) instead of asking.
3. **Only genuine ties reach the person**: a found value that differs
   and is not an artefact. They arrive as ONE Today-card style item
   ("The sheet says 5.82, we stored 58.2 — which is right?") with the
   sheet line quoted, never a table.

The curator's daily run calls the second pass on every open
`confirm_value`; the extractor calls it inline at upload time so new
uploads never create the queue in the first place.

## 3. Evidence in the window

`/hkb` Activity (or the curator's admin page) lists second-pass runs:
settled by re-match, settled by model, corrected, unverified, left for
the person — with the lines. Principle 1: a window, not a queue.

## 4. Locks

- `second-pass.test.ts`: normalisation cases (comma decimals, thousand
  dots, split lines, Romanian aliases), the ×10 artefact rule and its
  BOUNDS guard, "found twice false → unverified".
- `evals/second-pass/cases.json` + `eval:second-pass`: the owner's 10
  current rows (copy their stored value + sheet excerpt from the local
  DB into fixtures) → expected outcome per row; report how many the
  deterministic pass alone settles, how many the model settles, how
  many remain. Model layer runs only in the eval, not in vitest.
- The engine skips `unverified` readings (test).

## 5. Verification

typecheck, vitest higher, `eval:second-pass` with the table, run the
pass on the LOCAL DB copy against the owner's rows and paste the
outcome per row; `/review` for the test user should drop from 10 rows
to the genuine ties only. Do not edit `app/(app)/review/**` rendering
(another agent owns it); expose the surviving ties through the same
`review_items` rows with a new `settled_by`/`evidence_line` in the
existing jsonb payload so the page can show the line later.
