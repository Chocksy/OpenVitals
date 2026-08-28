# Phase 13: genome file and any medical document as evidence

Two new input kinds for the same engine: a consumer genome raw file
(23andMe, AncestryDNA) and arbitrary medical documents (imaging reports,
discharge letters, specialist notes, DEXA, ECG, sleep study, stool test,
scans). Everything in `apps/simple`. Migration additive. Ponytail; no new
deps. Every extracted item carries a source, a confidence, and the
document excerpt it came from; nothing enters inference silently.

## 1. Upload kinds

`uploads.kind text default 'lab'` (migration 0009): `lab` | `genome` |
`document`. The upload route sniffs: `.txt` starting with `# rsid` or
`rsid\tchromosome` or the AncestryDNA header → `genome`; PDF whose text
matches the lab-report detector (existing `extractFromPdf` finds ≥ 5
readings) → `lab`; else `document`. A user can override the kind on the
upload detail page (re-analyze with the chosen kind).

`/labs` Uploads tab shows the kind chip; genome and document rows link to
their own detail views (below).

## 2. Genome (`lib/genome.ts`, seed in `lib/genome-catalog.ts`)

Parser: tab-separated `rsid chromosome position genotype` (23andMe) and
the AncestryDNA variant (`rsid chromosome position allele1 allele2`);
skip comments; ~600k rows; stream, keep only the rsids in the catalog
(no full-array storage). Store into `genome_variants { user_id, rsid,
genotype, chromosome, position, upload_id, unique(user_id, rsid) }`.

Catalog (`GENOME_CATALOG`): curated SNPs with effect and evidence grade,
each a row in `hkb_features` (kind `genetic`, id `snp:<rsid>` or
`gene:<name>`), each with prior modifiers or evidence rows in the HKB
seed, sources named:

| gene / rsids                               | condition effect                                                                             | grade |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ----- |
| APOE rs429358 + rs7412 (ε2/ε3/ε4)          | ascvd_risk prior ×1.3 (ε4 carrier), lipid target note; dementia risk fact (no condition yet) | A     |
| LPA rs10455872, rs3798220                  | lpa_elevated LR 4 (carrier)                                                                  | A     |
| HFE rs1800562 (C282Y), rs1799945 (H63D)    | haemochromatosis: C282Y homozygous LR 50, compound heterozygous LR 5                         | A     |
| HLA-DQ2.5 tag rs2187668, DQ8 tag rs7454108 | coeliac_disease: carrier ×3 prior, absent both → lrNeg 0.1                                   | A     |
| TCF7L2 rs7903146                           | type2_diabetes ×1.4 per T allele                                                             | A     |
| MTHFR rs1801133 (C677T)                    | folate_deficiency / homocysteine: TT ×1.5, labelled weak                                     | C     |
| CYP1A2 rs762551                            | fact `caffeine_slow_metaboliser` (AC/CC) → confounder for cortisol, BP note                  | B     |
| LCT/MCM6 rs4988235                         | fact `lactase_nonpersistent` (GG) → bowel symptom interpretation                             | A     |
| FTO rs9939609                              | insulin_resistance ×1.2 per A allele                                                         | B     |
| HLA-DR3/DR4 tags rs2187668 / rs660895      | hashimoto ×1.5, atrophic_gastritis ×1.5                                                      | B     |
| G6PD rs1050828                             | fact for haemolysis risk under `anaemia_other`                                               | A     |
| SLCO1B1 rs4149056                          | fact `statin_myopathy_risk` for the doctor dossier                                           | A     |

Sources: ClinVar, PharmGKB, published GWAS or guideline per row. Each
variant the user carries becomes a profile fact `genome:<gene>` with the
genotype and the plain-language meaning; the context pack lists them in
PROFILE FACTS; the hypothesis engine reads them as prior modifiers or
evidence through the usual rules.

Detail view `/uploads/[id]` for a genome upload: the catalog table with
the user's genotype per row, effect, grade, source, and "not in this
array" where the rsid is absent (23andMe v5 lacks some). Never show
raw rsids outside the catalog. A "why this SNP is here" line per row.

## 3. Documents (`lib/documents.ts`)

Text: pdf.js text layer, else OCR (existing path); DOCX/TXT/JPG/PNG
accepted (image → OCR; DOCX via a minimal zip+xml read of
`word/document.xml`, no dep).

Extraction: one `generateObject` call with a strict schema:

```ts
{
  docType: "imaging" | "discharge" | "specialist_note" | "dexa" | "ecg" | "sleep_study" | "stool_test" | "pathology" | "prescription" | "other";
  date?: string; institution?: string; specialty?: string;
  findings: { text: string; excerpt: string; polarity: "abnormal" | "normal" | "unclear"; bodySystem?: string; confidence: number }[];
  measurements: { name: string; value: number; unit?: string; refLow?: number; refHigh?: number; excerpt: string; metricCodeGuess?: string }[];
  diagnoses: { text: string; icd10?: string; mondoGuess?: string; status: "confirmed" | "suspected" | "ruled_out" | "history"; excerpt: string }[];
  medications: { name: string; dose?: string; schedule?: string; excerpt: string }[];
  recommendations: { text: string; excerpt: string }[];
  events: { text: string; date?: string; excerpt: string }[];   // surgeries, hospitalisations → life events
}
```

Storage: `document_items { id, upload_id, user_id, kind (finding|measurement|diagnosis|medication|recommendation|event), payload jsonb, excerpt text, status: proposed|accepted|rejected, created_at }` (migration 0009). Everything lands `proposed`. The upload detail view lists items grouped by kind with Accept / Reject / Edit; accepting does the write:

- measurement with a metric code → a `readings` row (unit-normalised, flagged `from_document`), curator runs on it;
- diagnosis → profile fact `conditions` append (status kept), and if it maps to a catalog condition, a fixed evidence row `doc:<condition>` with LR 20 for confirmed, 3 for suspected, 0.1 for ruled_out, grade B, source = the document;
- medication → `medications` fact append;
- event → `life_events` (create the table now: `{ id, user_id, kind, text, started_at, ended_at, source, upload_id }`, the timeline from the brainstorm; the confounder tagging by date overlap is a later step);
- finding / recommendation → kept as text on the document, shown in the context pack under `DOCUMENTS` (last 5 documents, date, type, accepted diagnoses and abnormal findings, ≤ 300 tokens).

Bulk "Accept all" per kind, with the count. Rejected items stay for audit.

## 4. Engine tie-in

`buildModelInput` reads genome facts and accepted document diagnoses like
any other fact. `nextMoves` treats a missing genome as a possible move
"Upload a genome file" only when a hypothesis that has genetic evidence
is ≥ possible (cost band 2, gain from the catalog LRs). `/brain` shows
genome facts under Facts & events.

## 5. Tests

Genome parser on two 200-line fixtures (23andMe v5 header, AncestryDNA
header), APOE genotype resolution from the two rsids, HFE compound
heterozygous detection, HLA absence → lrNeg. Document extraction schema
post-processing: a measurement with `metricCodeGuess` not in the catalog
is kept as proposed with no code; a diagnosis with `status ruled_out`
yields LR 0.1. DOCX text read on a fixture.

## 6. Verification

typecheck, tests, migrations. Upload the user's own 23andMe file if they
provide the path (ask; otherwise use the fixture as the test user) and
show the catalog table. Upload one non-lab PDF as the test user (any
discharge or imaging PDF the user provides, else a synthetic one written
as text and printed to PDF is not possible without deps: use a `.txt`),
show the proposed items, accept one measurement and one diagnosis, and
show the reading and the belief change on `/brain`. Screenshots to
`/tmp/docs13/`.
