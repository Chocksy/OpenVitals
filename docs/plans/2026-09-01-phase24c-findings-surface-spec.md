# Phase 24c: findings surface where they act

From the UX audit (finding 4, and the token-language part of 5). Runs
AFTER 24a lands (shares `lib/ledger.ts`, `components/home.tsx`,
`lib/bubbles.ts`). `apps/simple`. Ponytail.

## 1. "What your genome changed" (and any document)

The upload detail already writes the sentences (APOE, TCF7L2, FTO,
CYP1A2, LCT, HLA, HFE, MTHFR, G6PD, SLCO1B1, LPA: "Coeliac disease is
essentially excluded", "TCF7L2 CT: about 40 % above background risk…").
They live in `lib/genome-catalog.ts` per variant with an `effect`
line. Surface them:

- **Ledger card "What your genome changed"** for 14 days after a genome
  upload (and again when the catalog gains a variant the file carries):
  the three sentences with the biggest effect on this person (by the
  prior multiplier they apply or the condition they exclude), a "see all
  11" link to the upload page. Same card kind for document uploads
  ("What your discharge note changed": the accepted items and the
  conditions they moved).
- **Condition cards' FOR / AGAINST in sentences.** Replace token lines
  (`tgHdl 2.12`, `hypothesis:insulin_resistance 0.637`,
  `family_history no`, `genome:tcf7l2 CT`) with the human form the
  evidence rule already knows: metric name + value + unit + direction
  word ("triglyceride/HDL ratio 2.1, for"), facts as the question's
  short label ("no family history, against"), genome rows as the
  catalog's sentence ("TCF7L2 CT raises the prior ×1.4, for"),
  chained hypotheses as "insulin resistance likely (64 %), for". One
  pure `explainInput(evidence)` in `lib/ledger.ts`, tested, used by
  Home, `/graph` panel and `/plan`.
- **Graph gene bubbles** show the catalog sentence in the panel.

## 2. Lock

- `ledger.test.ts`: `explainInput` for each input kind; a snapshot-ish
  assertion that no FOR/AGAINST string contains `hypothesis:`,
  `genome:`, `fact:` or an underscore-joined code.
- A journey does not apply; a unit test that the genome card appears
  for 14 days after an upload and lists the top-three by effect.

## 3. Verification

typecheck, vitest higher, `eval:journeys` 25/25, screenshots to
`/tmp/p24c/`: Home with the genome card for the owner's local copy,
a condition card with sentence FOR/AGAINST, the graph panel for a gene
bubble.
