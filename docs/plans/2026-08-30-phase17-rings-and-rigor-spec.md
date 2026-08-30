# Phase 17: knowledge rings, ring-2 waking, correlation guards, trends, KB versioning, calibration

Design approved in brainstorming 2026-08-30 (rings, triggers including the
user's "consider this", correlation guards, trend evidence, KB
versioning, calibration logging). This document is the spec; the owner
reviews it before implementation. Everything in `apps/simple`, additive
migrations, ponytail, ROADMAP principles apply.

## 0. Why Hashimoto's shows up for a man today, and what changes

Today the catalog is one flat ring of 32 conditions; every one is scored
for everyone and every one is _displayed_ (the mockup shows even
ruled-out rings). Two fixes fall out of this phase:

- **Sex-and-prior-aware display.** A condition whose posterior is under
  0.05 (ruled out) is hidden everywhere by default, behind a "show ruled
  out (N)" toggle. A condition whose `applies_to` excludes the person
  (PCOS for a man) is never shown at all. Hashimoto's for a man with
  negative antibodies sits at ~2 % and disappears behind the toggle; it
  still exists in the engine, which is correct (men do get it, prior
  ~5× lower).
- **The catalog stops feeling static** because ring 2 makes every named
  disease reachable (below), and the monthly research job keeps growing
  ring 1.

## 1. Rings

```
hkb_conditions.ring int default 1      -- migration 0013, ALTER ADD
user_conditions { user_id, condition_id, ring_woken_at timestamptz,
                  trigger text, trigger_detail jsonb,
                  status text default 'awake' /* awake | dismissed */,
                  unique(user_id, condition_id) }    -- CREATE
```

- **Ring 1 — scored.** Today's 32, grown toward ~300 by GBD burden ×
  testability (phase 18 imports). Always in everyone's differential.
- **Ring 2 — dormant, wakeable.** Every MONDO disease that has HPOA
  phenotype annotations or an OMIM gene link (~7,000 after the import we
  already ran; a `hkb:ring2:build` script materialises them as
  `hkb_conditions` rows with `ring = 2`, `in_catalog = false`, name,
  MONDO id, and a rarity-class prior: common 1e-3, rare 1e-5, ultra-rare
  1e-7, from Orphanet prevalence classes when present). No lens weights,
  no discriminator costs until woken.
- **Ring 3 — names only.** The `hkb_terms` table as it stands;
  searchable and linkable, never scored.

`scoreHypotheses` scores ring 1 plus the person's awake ring-2 rows.
Waking is per person and reversible ("dismiss" puts it back to sleep,
kept in `user_conditions` for audit).

## 2. Waking triggers (all five)

Evaluated by `wakeConditions(userId)` which runs inside the same hooks
that recompute beliefs (upload curated, fact answered, document item
accepted, genome imported, action adopted/dismissed) — the "keeps
reconsidering without a re-run" the owner asked for is exactly these
hooks; no new scheduler needed.

1. **Document diagnosis.** An accepted document diagnosis whose
   `mondoGuess` resolves to a ring-2 term wakes it with the document as
   `trigger_detail` (status confirmed → evidence LR 20 as today).
2. **Genome variant.** A catalog variant tied to a ring-2 disease (HFE
   homozygous already ties to ring-1 haemochromatosis; the tier-2 genome
   catalog will tie to ring-2 entries) wakes it.
3. **Pathognomonic lab.** A small table `WAKE_LABS` in code: findings
   that alone demand a rare-disease look (ferritin > 1000 twice,
   tryptase, paraprotein/M-spike from a document, eosinophils > 1.5
   persistent, calcium > 11.5, platelets < 50 …), each mapping to the
   ring-2 MONDO ids it implicates, each with a source.
4. **Unresolved investigation → phenotype match.** When ring 1 ends
   "unresolved" for a finding, match the person's HPO-coded findings
   (symptom facts map to HPO ids already; abnormal markers map via a
   small table) against `hkb_annotations`, rank ring-2 diseases by a
   frequency-weighted overlap score, wake the top 3 with the match as
   `trigger_detail`. This is the needle-in-the-haystack path, and it is
   where the HPOA data is finally used for what it is good at.
5. **The user asks.** Not a button: an input on Home and `/brain`
   ("Ask about anything — a disease, a symptom, a word"). Free text →
   embedding/nearest-name match over `hkb_terms` (pgvector if present,
   else trigram via Postgres `pg_trgm`, else normalised-name LIKE — pick
   the cheapest that works, note it) → the system replies in place:
   what it matched, current status for this person (ring, woken or not,
   probability if scored), the questions or tests that would move it,
   and a "Consider this for me" action that wakes it with
   `trigger = "user"`. The reply is deterministic (engine data) with one
   optional LLM sentence of plain language. A woken user-triggered
   condition that stays under 1 % after its discriminators resolve is
   auto-dismissed with a note in the ledger.

On waking, a ring-2 condition gets: prior from rarity class ×
sex/age applicability from HPOA onset/sex fields when present; evidence
rows generated from its HPOA frequencies (grade C, source HPOA, the
phase-14 rule "only the disease's own term" already enforced); its OMIM
gene links as genome evidence when the person has a genome. The
research job may then be queued for it (once, `--max-papers 5`).

## 3. Correlation guards

`hkb_evidence.correlation_group text null` (migration 0013). Groups in
the seed: `glycaemia` (glucose, HbA1c, insulin, HOMA-IR, TG/HDL for the
IR/T2D conditions), `iron_panel` (ferritin, transferrin sat, iron, MCV,
RDW), `lipid_panel` (LDL, non-HDL, ApoB, total), `thyroid_axis` (TSH,
fT4, fT3), `bp` (systolic, diastolic), `liver_enzymes` (ALT, AST, GGT).
Scoring within one hypothesis: the strongest matching rule in a group
counts at full LR; each additional matching rule in the same group
counts at `lr^0.3` (constant `CORR_DAMP = 0.3`). Superseded-style line
in the result (`correlated` list) so the card shows why. Tests: glucose
126 + HbA1c 6.6 together must yield less than the naive product and
more than either alone; two independent groups multiply unchanged.

## 4. Trend evidence

`EvidenceRule.when` gains `slopePerYear: { above?, below? }`, evaluated
from the metric's readings (least squares over up to 5 years, ≥ 3
points; helper in `lib/derived.ts`). Seed rules (grade B/C, sourced):
TSH slope > +0.5/yr → hashimoto LR 1.5; ferritin slope < −15/yr →
iron_deficiency LR 1.5 and cause hypotheses LR 1.3; eGFR slope <
−3/yr → ckd LR 2 (KDIGO defines rapid progression); fasting insulin
slope > +2/yr → insulin_resistance LR 1.3; ApoB/LDL slope > +10 mg/dL/yr
→ ascvd_risk LR 1.2. The card prints "rising: +0.8/yr over 3 years".

## 5. KB versioning in "what changed"

`hkb_revisions { id serial, changed_at, summary text }` — one row per
mutation batch (research run, policy apply, seed, override, wake-rule
change), written by those code paths. `belief_snapshots` gains
`kb_revision int` (ALTER ADD). The ledger's `since` computes two diffs:
data-driven (same KB revision, different inputs) and knowledge-driven
(same inputs, different revision), and the "what changed" line says
which: "Hashimoto's 5 % → 8 %: the evidence for anti-Tg was updated
(pooled with Sheppard 2022), your data did not change."

## 6. Calibration logging

`calibration_events { id, user_id, condition_id, predicted real,
predicted_at, resolved real /* 1 confirmed, 0 excluded */, resolved_at,
resolver text /* test id or document */ }`. Written when a discriminator
with `lrPos ≥ 10` resolves a condition (either direction) or a document
diagnosis confirms/excludes one. `/hkb` gets a small Calibration tab:
predicted-band vs observed-rate table once ≥ 20 events exist; before
that it shows the count and "too few to read". No behaviour change from
it yet; it is the measuring stick.

## 7. Order of work and verification

1. Migration 0013 + rings + `hkb:ring2:build` (counts by rarity class).
2. Waking triggers 1–4 with tests (pathognomonic table sourced;
   phenotype-match scorer pure with a fixture: a person with
   "fatigue + high ferritin + arthralgia" must rank haemochromatosis
   and Still's disease above noise).
3. Trigger 5, the ask box (search resolution offline-tested; the
   Consider action; auto-dismiss rule).
4. Correlation guards + tests; re-run the six persona evals and report
   probability shifts (expect IR and T2D to drop somewhat; assert no
   state flips in healthy_male_28).
5. Trend evidence + tests (fixtures from Ramona's real TSH/ferritin
   history shapes).
6. KB versioning + ledger wording; calibration table + tab.
7. Display rule: ruled-out hidden behind a toggle app-wide; `applies_to`
   exclusions never rendered. Update the bubbles mockup note.

Verify each stage: typecheck, tests, then for the whole phase: wake
haemochromatosis for the test user via a simulated ferritin 1200,
wake a user-typed rare disease via the ask box and show its questions,
run `/brain` for both real users and paste the differential before and
after correlation guards. Screenshots to `/tmp/p17/`.
