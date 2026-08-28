# Phase 14: research intake, importer fix, proposal cleanup

Approved 2026-08-29. Everything in `apps/simple`. No new deps. Ponytail.
Goal: the catalog's likelihood ratios come from papers and guidelines with
verified citations, through proposals the admin accepts on `/hkb`, instead
of hand-drafted rows or rare-disease frequencies.

## 1. Cleanup and importer fix

- Set every `hkb_evidence` row with `status = 'proposed'` and source
  starting `HPOA` to `rejected` with `review_note = 'rare-disease frequency
mapped onto a common condition; not applicable'` (add `review_note text`
  and `reviewed_at` columns, migration 0010, ALTER ADD only). Set the one
  accepted HPOA row (`hpoa_hypothyroidism_HP_0000716`) to `rejected` with
  the same note.
- `scripts/hkb-import-ontology.ts`: propose from an HPOA annotation only
  when the annotated disease id resolves (via MONDO xrefs) to the catalog
  condition's own MONDO id or to a MONDO term whose `parents` contain it
  within ONE level and whose name contains the condition name's head word
  (e.g. "hypothyroidism"). No descendant walk beyond that. Re-run must
  produce 0 new proposals for the current catalog; say how many it would
  have produced under the old rule.

## 2. Research intake (`lib/research.ts`, `scripts/hkb-research.ts`)

Per condition, on demand and monthly:

1. **Search.** Europe PMC REST (`https://www.ebi.ac.uk/europepmc/webservices/rest/search`, no key) with queries built from the condition name plus each feature the condition has or could have as evidence: `"<condition>" AND ("likelihood ratio" OR "sensitivity" OR "specificity" OR "diagnostic accuracy") AND ("<feature name>")`, `PUB_TYPE:"review" OR "meta-analysis" OR "guideline"`, last 15 years, `resultType=lite`, 25 hits per query. Semantic Scholar Graph API (`/graph/v1/paper/search`, no key, respect the 100 req/5 min limit) as a second source for citation counts. Dedupe on DOI / PMID. Keep hits with an abstract.
2. **Extract.** One `generateObject` call per paper abstract (batch 5 abstracts per call to save tokens), schema:
   `{ items: { feature: string; featureId?: string /* from a provided list */; condition: string; direction: "present"|"absent"|"above"|"below"; threshold?: number; unit?: string; lrPos?: number; lrNeg?: number; sensitivity?: number; specificity?: number; population: string; n?: number; studyType: "meta"|"rct"|"cohort"|"case_control"|"guideline"|"other"; quote: string /* verbatim from the abstract */ }[] }`.
   The prompt lists the catalog's features for that condition (id, name) so the model maps to `featureId` when it can; unmapped features are kept with `featureId = null`.
3. **Derive.** If LRs are absent but sensitivity and specificity are present, compute LR+ = sens/(1−spec), LR− = (1−sens)/spec. Grade: meta/guideline → A, RCT/cohort with n ≥ 500 → B, else C.
4. **Verify.** Resolve the DOI through Europe PMC (`search?query=DOI:<doi>`) and require the title to match; drop anything unresolved; store `pmid`, `doi`, `title`, `year`, `journal`, `url`.
5. **Propose.** Insert `hkb_evidence` rows with `status = 'proposed'`, `source = '<first author> <year> <journal>; doi:<doi>; quote: "<quote>"'`, `grade`, `population`, and the `condition_on` built from direction/threshold. Skip when an identical (condition, feature, condition_on) already exists in any status. Record the run in `hkb_import_runs` with hits, extracted, verified, proposed counts and tokens used.

CLI: `pnpm --filter simple hkb:research [conditionId ...] [--max-papers 20]`.
Default set when no ids: the 10 conditions with the fewest accepted/seed
evidence rows. Cost guard: stop a run when estimated LLM tokens pass
200k; print the estimate first.

## 3. `/hkb` Evidence tab

- Proposed rows show the paper (title, year, journal, link) and the quote
  under the source; Accept / Reject / **Edit LR** (inline number fields,
  saves then accepts). Filter by condition. A "Research" button per
  condition on the Conditions tab runs the job for that condition (admin
  API route, async, shows the run row when done).
- Imports tab lists research runs with their counts.

## 4. Genome page polish (`components/genome-table.tsx`)

- Rows whose call produced no effect for this person read "no effect for
  you" in the effect column, with the catalog effect in grey below.
- rs2187668 appears once: merge the HLA-DQ2.5 and DR3 tag rows into one
  "HLA DR3-DQ2.5 haplotype tag" row listing both effects (coeliac prior;
  hashimoto and gastritis prior).

## 5. Verification

typecheck, tests (network mocked with 3 fixture abstracts: one with LRs,
one with sens/spec, one unresolvable DOI), migration, `hkb:import` re-run
(0 new proposals, count under old rule reported), `hkb:research` for the
10 thinnest conditions with `--max-papers 10` (real network + LLM; report
per condition: hits, verified, proposed, tokens, and paste 8 sample
proposed rows with their quotes). `/hkb` screenshots to `/tmp/hkb14/`:
proposed rows with quotes, Edit LR open, the Imports tab. Genome table
screenshot for the test user fixture showing "no effect for you".

Report: files changed, outputs, deviations (expect zero).
