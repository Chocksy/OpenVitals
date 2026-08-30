# Phase 16: the picture: graph in the DB, Monarch edges, mechanism extraction, personal conditional edges, pathograph

Approved 2026-08-30. The relations chart the owner asked for: "poor sleep
raises insulin and triglycerides", "coffee affects sleep, but not for you
before 15:00 because CYP1A2 fast metaboliser". Everything in
`apps/simple`. Additive migrations. No new deps. Ponytail. Principles 1–3
of `ROADMAP.md` apply: the graph page is a window; every edge is graded and
sourced; the LLM extracts edges with quotes and never invents weights.

## 1. Graph moves into Postgres (migration 0012, CREATE only)

```
kg_nodes  { id text pk, kind, name, system_id null, codes jsonb null, note null, source text /* seed|monarch|research|minted */, created_at }
kg_edges  { id text pk, from_id fk, to_id fk, relation, strength int, confidence text, grade text, basis text,
            when_ jsonb null, mechanism text, evidence jsonb, source text /* seed|pattern|monarch|research */,
            status text default 'active', created_at, unique(from_id, to_id, relation, coalesce(when_::text,'')) }
```

`lib/graph.ts` becomes the seed (`pnpm --filter simple kg:seed`, idempotent,
also seeds the pattern-gated edges) and `lib/kg.ts` exports
`loadGraph(): Promise<{ nodes, edges }>` with a 60 s cache and the in-code
fallback when the tables are empty or `DATABASE_URL` is unset.
`computeGraphState` takes the graph as a parameter (default: loaded).
Minted HKB features become `kg_nodes` (kind metric) on creation.

## 2. Monarch edges (`scripts/kg-import-monarch.ts`)

Monarch API v3, no key: for every catalog condition with a MONDO id,
`GET https://api.monarchinitiative.org/v3/api/association?subject=<MONDO>&category=biolink:DiseaseToPhenotypicFeatureAssociation&limit=200`
and `...category=biolink:CausalGeneToDiseaseAssociation` (and
`CorrelatedGeneToDiseaseAssociation`). Store phenotype associations as
edges `condition → phenotype` (relation `indicates`, grade B, source
`monarch`, evidence = the association id and the publication list) and
gene associations as `gene → condition` (relation `raises`, grade A for
causal, B for correlated). Phenotype nodes map to our `fact:sym_*` features
where an HPO id matches the symptom set (a small map in the script), else
become `kg_nodes` of kind `phenotype` with the HPO id (display only, not
scored). Genes become `kg_nodes` of kind `gene`; where the gene matches
the genome catalog (APOE, HFE, TCF7L2 …) the edge links to the existing
`fact:genome:<gene>` node so the personal state colours it. `--offline`
uses a fixture. Idempotent. Record the run in `hkb_import_runs`.

## 3. Mechanism-edge extraction (`lib/research.ts`, third search)

Per condition and per hot metric: query `"<X>" AND ("increases" OR
"decreases" OR "raises" OR "lowers" OR "associated with") AND "<Y>"`
built from the condition's evidence features and the 12 systems' headline
markers, `PUB_TYPE review OR meta-analysis`, last 15 years, 10 papers.
Extraction schema: `{ edges: { from: string; fromId?: string; to: string;
toId?: string; relation: "raises"|"lowers"|"confounds"|"treats"|"worsens";
effect?: string /* "+0.3 mmol/L per 1 h less sleep" */; condition?: string
/* "only in fast metabolisers" | "only when taken within 6 h of bedtime" */;
population; studyType; quote }[] }` with the node list provided. Verified
(DOI) edges become `kg_edges` with `source = research`, grade by study
type (same A–E table), `strength` from effect size where stated
(large 3, moderate 2, small or unstated 1). The `condition` text, when
present, is mapped to a `when_` clause by a small parser for the known
shapes: genotype facts (`fact:genome:<gene>` equals value), timing facts
(`fact:<key>` above/below hours), sex, age; unparseable conditions are
kept as text in `mechanism` and the edge gets `confidence: speculative`.
Dedupe on (from, to, relation, when). Run it in the monthly job after the
evidence and intervention searches.

## 4. Personal conditional edges (`lib/graph-state.ts`)

`when_` gains `fact: { key, equals?, includes?, above?, below? }`,
`genome: { gene, genotype }`, `hoursBefore: { eventFact, threshold }` in
addition to the existing `from/to/sex/pattern`. Evaluation reads
`ModelInput.profile` (genome facts included). Seed five hand-written
conditional edges to prove the shape, each sourced:

- `behavior:coffee_after_15 → metric:sleep_duration` lowers, strength 2, B,
  `when: { genome: { gene: "CYP1A2", genotype: "slow" } }` (Drake 2013 J
  Clin Sleep Med: 400 mg caffeine 6 h before bed cuts sleep by 1 h; effect
  modified by CYP1A2, grade B) and the mirror edge with `fast` at strength
  1, confidence probable.
- `metric:sleep_duration (low) → metric:insulin` raises, strength 2, A
  (Spiegel 1999 Lancet; Reutrakul 2018 meta).
- `metric:sleep_duration (low) → metric:triglycerides` raises, 1, B.
- `behavior:late_meal → metric:glucose` raises, 1, B, `when: { hoursBefore:
{ eventFact: "last_meal_hour", threshold: 3 } }`.
- `fact:genome:LCT non-persistent → fact:sym_bowel` raises, 2, A, when
  `fact: { key: "dairy_daily", equals: "Yes" }`.

New tier-0 facts asked only when a conditional edge could apply:
`coffee_last_hour`, `last_meal_hour`, `dairy_daily`, `bedtime_hour`.

## 5. `/graph/[node]`: the pathograph

Server page, admin and user (it is a window; users see their own
colouring). Layout left to right, three columns, SVG connectors as in
`components/graph-map.tsx`:

- **Causes** (depth 2 upstream): nodes with an edge into the selected
  node, then their causes; personal state colours each node (red / amber
  / green / grey unknown), edge style by confidence (solid / dashed /
  dotted), width by strength, colour by direction, a grade chip, and a
  chip "not for you" when a `when_` clause fails for this person (edge
  drawn faint) or "for you: …" when it holds with the reason (e.g. "fast
  metaboliser, last coffee 13:00").
- **The node**: name, current value with range bar (metric), fact value
  (fact/genome), plain-language what-it-is (catalog summary or the
  feature `how_to`), mechanism sentences of the strongest 3 edges.
- **Effects** (depth 2 downstream), same encoding.

Hover or tap an edge: mechanism, effect size, quote, paper link, grade,
source (seed / monarch / research). Click a node to re-centre;
breadcrumb with the path. A search box (name or code) at the top. The
`/graph` page gains a "Pathograph" link on every tile and marker. Prune:
≤ 12 nodes per column by |strength × confidence weight|, "+N more"
expands. Deep view shows the `when_` clause raw and the evidence list.

## 6. Tests

`kg.test.ts` (seed round-trip, fallback), `graph-state.test.ts`
additions (genome and hoursBefore conditions on and off), research
mechanism extraction with a fixture (condition text → `when_` parse, and
an unparseable one → speculative), Monarch importer offline fixture,
pathograph layout pure function (`lib/pathograph.ts`: upstream/downstream
depth 2, prune, dedupe) with a fixture.

## 7. Verification

typecheck, tests, migration, `kg:seed` twice (identical counts),
`kg:import:monarch` (real; counts per condition; time), `hkb:research
--mechanisms insulin_resistance sleep_apnoea` (real; edges extracted,
verified, stored; 5 samples with quotes and `when_`), then as the admin
(read-only): `/graph/metric:sleep_duration`, `/graph/fact:genome:CYP1A2`,
`/graph/metric:insulin` screenshots to `/tmp/p16/`, plus one node with a
"not for you" edge shown faint. Report files changed, outputs,
deviations.
