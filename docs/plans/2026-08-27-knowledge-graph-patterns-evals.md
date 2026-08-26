# A graph that grows: nodes, edges, patterns, research intake, evals

Follows `2026-08-26-health-model-spec.md` (the systems graph) and
`2026-08-26-health-vectors.md` (vectors and escalation). This document turns
the static `lib/systems.ts` idea into a graph that lives in the database,
gains weight per person from their data and actions, carries nuance as
**patterns**, pulls in new research on a schedule, and can be measured with
evals.

Two worked examples run through it: Hashimoto's (a woman with rising TSH and
positive TPO antibodies) and the lean-mass hyper-responder (a lean, low-carb
man with LDL over 200 and otherwise excellent markers).

## 1. Why the static file is not enough

`lib/systems.ts` is a seed. Three things it cannot do:

- Nuance. "High LDL is bad" is an edge. "High LDL in a lean low-carb person
  with HDL 90 and TG 50 is contested and needs a CAC before anyone talks
  about a statin" is a **pattern** that rewrites edges when it matches.
- Growth. New papers, guideline updates and the person's own experiments
  should change edge weights. A TS file changes only when someone edits it.
- Depth. The LLM should reason on the part of the graph that is hot for this
  person, in detail, not skim 100 edges at equal weight.

## 2. Data model

Five tables. Seeded from TS files on first run, then mutated only through
the review queue or the person's own data.

```ts
kg_nodes {
  id: text pk            // "metric:tsh", "system:thyroid", "condition:hashimoto",
                         // "intervention:selenium", "behavior:coffee_with_lt4", "test:thyroid_ultrasound", "risk:ascvd"
  kind: "metric" | "system" | "condition" | "intervention" | "behavior" | "test" | "risk" | "pattern"
  name, description
  meta: jsonb            // metric: codes, sex/age ranges; intervention: dose range, ceiling, form
}

kg_edges {
  id uuid
  from, to: node id
  relation: "raises" | "lowers" | "confounds" | "indicates" | "treats" | "worsens" | "requires_test" | "modifies_target"
  strength: 1..3
  confidence: "established" | "probable" | "speculative"
  basis: "science" | "opinion" | "anecdotal"        // the same three labels as the plan
  when: jsonb            // condition for the edge to be active: { "from": "high", "sex": "female", "pattern": "hashimoto" }
  mechanism: text
  evidence: jsonb        // [{ kind, title, doi, year, source }]
  source: "seed" | "proposal" | "experiment"        // how it got here
  status: "active" | "proposed" | "rejected"
  created_at, reviewed_at
}

kg_patterns {
  id: text pk            // "lmhr", "hashimoto", "insulin_resistance_early", "iron_deficiency_no_anemia"
  name, summary, controversy: text
  detector: jsonb        // rule over ModelInput, see section 4
  effects: jsonb         // edge overrides, target overrides, escalations, questions, evidence bundle
  evidence: jsonb
  status: "active" | "proposed"
}

kg_proposals {           // research intake and LLM suggestions land here, never directly in the graph
  id uuid
  kind: "edge" | "pattern" | "evidence" | "target"
  payload: jsonb
  rationale: text
  sources: jsonb         // resolved DOIs only
  status: "open" | "accepted" | "rejected"
  created_at
}

user_graph_state {       // the personal overlay, recomputed by a job, never edited by hand
  user_id, node_id
  importance: real       // 0..1, section 3
  active: boolean
  reasons: jsonb         // ["tsh 3.9 above optimal 2.5", "pattern:hashimoto", "family: mother hypothyroid"]
  updated_at
  pk (user_id, node_id)
}
```

Everything the person answers or measures stays in the tables that exist
(`readings`, `profile_facts`, `protocol_items`, `experiments`, `reports`).
The graph never stores personal data; `user_graph_state` is the only join.

## 3. Importance: how the graph grows for one person

`recomputeGraphState(userId)` runs after every upload, every answered
question, every adopted or dismissed action, and daily. For each node:

```
importance = clamp(
    severity(node)            // metric: distance outside optimal, 0..0.4; worse if trend is worsening
  + pattern_boost(node)       // 0.3 if a matched pattern names this node
  + modifier_boost(node)      // family history, condition, medication, 0..0.2
  + focus_boost(node)         // 0.2 if the person's focus fact names this system or node
  + action_boost(node)        // 0.1 while an adopted experiment targets it
  + recency_decay             // −0.1 if the last reading is stale beyond the vector's staleDays
, 0, 1)
```

An edge is **active** when both ends have importance > 0.15 and its `when`
condition holds. Active edges propagate: a node gains 0.5 × strength × the
source's importance from each active incoming edge, one pass, so a hot
thyroid warms lipids. The result is a weighted subgraph. The context pack
takes the top 25 nodes and every active edge among them, with reasons. That
is how the LLM goes deeper: it gets the hot neighbourhood in full and the
rest as one line per system.

The systems map draws node size from importance and only active edges. The
3D mockup already encodes this; it just needs real numbers.

## 4. Patterns: where the nuance lives

A pattern is a detector plus effects. Detectors are pure functions over
`ModelInput` (same shape `fireRules` uses), so they are unit-testable.

### 4.1 Hashimoto's thyroiditis

```ts
{
  id: "hashimoto",
  name: "Autoimmune thyroiditis (Hashimoto's)",
  detector: tpo_antibodies > lab upper limit  OR  tg_antibodies > lab upper limit,
            with strength "confirmed" if TSH > 4.5 on two draws, "early" if TSH 2.5–4.5 or rising
  summary: "The immune system is attacking the thyroid. TSH climbs slowly over years; antibodies show it before TSH does.",
  controversy: "Whether to treat subclinical hypothyroidism (TSH 4.5–10, normal fT4) is debated; most guidelines say treat if TSH > 10, symptomatic, pregnant or planning pregnancy, or antibody-positive with rising TSH.",
  effects: {
    systems: { thyroid: { priority: 1 } },
    edges_add: [
      { from: "intervention:selenium", to: "metric:tpo_antibodies", relation: "lowers", strength: 1, confidence: "probable", basis: "science",
        mechanism: "Selenoproteins limit peroxide damage in thyroid tissue; 200 µg/day selenomethionine lowered TPO-Ab in several RCTs, effect on TSH or symptoms inconsistent.",
        evidence: [{ kind: "meta", title: "Wichman 2016 Thyroid", doi: "10.1089/thy.2016.0256" }] },
      { from: "intervention:iodine_excess", to: "condition:hashimoto", relation: "worsens", strength: 3, confidence: "established", basis: "science",
        mechanism: "Iodine excess raises thyroid autoimmunity; kelp, high-dose iodine supplements and some multivitamins are the usual sources." },
      { from: "metric:vitamin_d", to: "metric:tpo_antibodies", relation: "lowers", strength: 1, confidence: "probable", when: { from: "low" }, basis: "science",
        mechanism: "Low vitamin D associates with higher TPO-Ab; correction trials small and mixed." },
      { from: "metric:ferritin", to: "metric:free_t4", relation: "raises", strength: 2, confidence: "established", when: { from: "low" }, basis: "science",
        mechanism: "Thyroid peroxidase is iron-dependent; ferritin below 30 impairs hormone synthesis and blunts levothyroxine response." },
      { from: "behavior:coffee_within_1h_of_lt4", to: "intervention:levothyroxine", relation: "confounds", strength: 3, confidence: "established", basis: "science",
        mechanism: "Coffee, calcium, iron and PPIs cut levothyroxine absorption; take on an empty stomach 30–60 min before, or at bedtime." },
      { from: "intervention:gluten_free_diet", to: "metric:tpo_antibodies", relation: "lowers", strength: 1, confidence: "speculative", basis: "science",
        mechanism: "One small trial (Krysiak 2019) in women without coeliac disease; unreplicated." },
      { from: "intervention:myo_inositol_selenium", to: "metric:tsh", relation: "lowers", strength: 1, confidence: "speculative", basis: "science",
        mechanism: "Two small Italian trials (Nordio); not in any guideline." },
      { from: "behavior:gluten_free_diet", to: "metric:tpo_antibodies", relation: "lowers", strength: 1, confidence: "speculative", basis: "anecdotal",
        evidence: [{ kind: "anecdotal", source: "r/Hashimotos recurring reports; no controlled data" }] }
    ],
    escalations: [
      { suggest: "Free T4, free T3, anti-Tg antibodies with the next TSH", tier: 1, why: "TSH alone misses early failure; anti-Tg catches the 10 % who are TPO-negative." },
      { suggest: "Thyroid ultrasound once", tier: 2, why: "Confirms the diagnosis and baselines nodules; Hashimoto's raises nodule frequency." },
      { suggest: "Coeliac serology (tTG-IgA with total IgA)", tier: 2, why: "Coeliac disease is 4–5× more common with Hashimoto's and changes the diet advice from speculative to required." },
      { suggest: "B12 and ferritin every 12 months", tier: 1, why: "Pernicious anaemia and iron deficiency cluster with thyroid autoimmunity." },
      { suggest: "Repeat TSH every 6 months while antibody-positive and untreated", tier: 1, why: "Progression to overt hypothyroidism runs 2–5 % per year; catch it early." },
      { suggest: "If pregnant or planning: TSH target below 2.5 and an endocrinology visit now", tier: 3, why: "TPO-positive women have higher miscarriage and preterm risk; ATA 2017 recommends treatment thresholds change in pregnancy." }
    ],
    questions: [
      "Any fatigue, cold intolerance, hair loss, constipation, weight gain or brain fog in the last 3 months?",
      "Anyone in the family with thyroid disease, coeliac disease, type 1 diabetes or vitiligo?",
      "Are you taking iodine, kelp, or a multivitamin with iodine?",
      "Planning a pregnancy in the next 12 months?",
      "Cycle regularity and last period date (thyroid changes shift cycles)."
    ],
    management: "Track TSH, fT4 and antibodies every 6 months. Keep ferritin above 50 and vitamin D 40–60. Stop iodine supplements. Selenium 200 µg/day is a reasonable 6-month trial with antibodies as the outcome. Treat with levothyroxine when TSH passes 10, or earlier if symptomatic, antibody-positive with rising TSH, or planning pregnancy. If treated: dose 30–60 min before coffee and 4 h away from iron and calcium. Symptoms and antibodies are the outcomes to watch, not TSH alone."
  }
}
```

### 4.2 Lean-mass hyper-responder

```ts
{
  id: "lmhr",
  name: "Lean-mass hyper-responder",
  detector: ldl >= 200 AND hdl >= 80 AND triglycerides <= 70 AND (bmi < 25 OR waist_to_height < 0.5) AND diet fact includes "low-carb" or "keto",
  summary: "Very high LDL that appears when a lean person eats very low carb. HDL and triglycerides are excellent. The LDL is real; the question is whether it carries the usual risk.",
  controversy: "Lipid-energy model (Norwitz 2022) argues the LDL rise is metabolic, not pathological. KETO-CTA (2025) followed 100 LMHRs for a year and found plaque progression in many, with baseline plaque, not ApoB, predicting progression. Guideline bodies treat ApoB as causal regardless of phenotype.",
  effects: {
    edges_modify: [
      { from: "metric:ldl_cholesterol", to: "risk:ascvd", confidence: "established" → "probable", note: "contested in this phenotype; ApoB and imaging decide" }
    ],
    targets: { ldl_cholesterol: { suspend_goal: true, note: "Judge by CAC and ApoB, not LDL alone" }, apolipoprotein_b: { optimal: [0, 80], note: "guideline target still applies" } },
    escalations: [
      { suggest: "ApoB and Lp(a) now", tier: 1, why: "ApoB counts particles; Lp(a) is inherited and changes the risk story entirely." },
      { suggest: "CAC score now, and if zero, CCTA in 2–3 years", tier: 2, why: "KETO-CTA: existing plaque, not lipid level, predicted progression. Zero CAC is reassuring; any CAC ends the debate." },
      { suggest: "Trial: add 50–100 g/day carbohydrate for 6 weeks, retest lipids", tier: 1, why: "In LMHR the LDL usually falls fast with modest carbs; if it does, the phenotype is confirmed and the person can choose." }
    ],
    questions: ["How long on low-carb, and grams of carbohydrate per day?", "Any family history of early heart disease?", "Body fat or waist measurement?"],
    management: "Measure before arguing: ApoB, Lp(a), CAC. Zero CAC and normal Lp(a): the person can stay low-carb with imaging every 2–3 years, knowing the evidence is unsettled. Any CAC, or Lp(a) above 50, or family history: treat ApoB like anyone else, and the cheapest lever is adding carbohydrate back."
  }
}
```

The two labels, `controversy` and the edge `confidence`, are how the app
stays honest without hedging: the plan says "contested, here is what
decides it, here is the test".

Other patterns for the first batch: insulin resistance before HbA1c moves,
iron deficiency without anaemia (women), subclinical hypothyroidism without
antibodies, high ferritin from inflammation vs iron overload, athlete's low
WBC and high CK, PCOS, perimenopause, post-menopause lipid shift, MTHFR-style
high homocysteine, low testosterone secondary to sleep apnoea.

## 5. Research intake: staying current per active condition

A monthly job per pattern or condition that is active for at least one user,
plus on demand from the pattern page.

1. Query Europe PMC (free, covers PubMed, has full-text and citation
   counts) and Semantic Scholar for the pattern's search terms, last 24
   months, filtered to RCT, meta-analysis, guideline, large cohort. The
   `paper-search` MCP already wraps these locally; in the app it is two
   fetches.
2. For each hit above a citation or journal threshold: fetch the abstract,
   ask the LLM for a structured verdict: which existing edge it supports,
   contradicts or would add; proposed confidence change; one-sentence
   mechanism; effect size if stated.
3. Write `kg_proposals`. Nothing touches `kg_edges` without a human
   accepting it on `/review` (a new kind, `graph_proposal`, with Accept /
   Reject / Edit-confidence).
4. Anecdotal intake stays opt-in and browser-driven: a saved search of
   r/Hashimotos or X for a term, captured with the browser tool, summarised
   into proposals labelled `anecdotal`. Never automatic.

The pattern page shows "last reviewed: date, N new papers since", so the
person can see whether the app is current on their condition.

## 6. What the LLM gets

The context pack gains two sections and loses nothing:

- `HOT GRAPH`: the top-25 nodes with importance and reasons, every active
  edge among them with relation, strength, confidence, basis, mechanism,
  and the pattern that added or modified it.
- `MATCHED PATTERNS`: for each, summary, controversy, management text,
  the escalations not yet done, the unanswered questions.

Prompt rule added: opinion actions must cite an edge or a pattern by id in
`reasoning`. That makes every personal recommendation traceable to a graph
element, which is what the evals check.

## 7. Evals: measuring whether we get close to the right outcome

Four layers, cheap to expensive. All under `apps/simple/evals/`, run with
`pnpm --filter simple eval`.

### 7.1 Deterministic (no LLM)

Detector and rule tests on fixtures. Already the style of
`coverage.test.ts`. Every pattern ships with at least one positive and one
negative persona.

### 7.2 Persona cases (LLM, graded by code and by a judge)

`evals/cases/<id>.json`: a synthetic person (facts, readings, tracker) and
a list of assertions about the plan.

```json
{
  "id": "hashimoto_early_female_36",
  "persona": {
    "facts": {
      "sex": "female",
      "birth_year": 1990,
      "family_history": ["mother hypothyroid"]
    },
    "readings": {
      "tsh": 3.9,
      "free_t4": 1.1,
      "tpo_antibodies": 320,
      "ferritin": 22,
      "vitamin_d": 19
    }
  },
  "must": [
    { "action_kind": "test", "title_matches": "anti-Tg|free T4" },
    { "action_kind": "test", "title_matches": "coeliac|tTG" },
    {
      "action": "supplement",
      "substance": "selenium",
      "dose_max_ug": 200,
      "basis": "science",
      "confidence": "probable"
    },
    {
      "action": "supplement",
      "substance": "iron",
      "reason_mentions": "ferritin 22"
    },
    { "question_matches": "pregnan" },
    { "eli5_mentions_no": ["TSH is fine"] }
  ],
  "must_not": [
    { "action_matches": "iodine|kelp" },
    { "action_matches": "levothyroxine", "unless_kind": "doctor" },
    { "dose_over_ceiling": true }
  ],
  "judge": "Would an endocrinologist accept this plan for an antibody-positive woman with TSH 3.9 and ferritin 22? Score 1-5 and name the single worst omission."
}
```

Scoring: `must` and `must_not` are checked in code (regex over titles,
doses, kinds, reasoning). The judge question goes to a second model with
the plan and the persona; its score and omission are stored. A run writes
`evals/results/<date>-<model>-<prompt-hash>.json`. The number that matters
per case: fraction of assertions met, and judge score. Per run: mean of
both, plus cost and latency per model. This is how prompt changes and model
swaps (Gemini vs Grok vs Claude) get compared instead of eyeballed.

First cases: the two above, plus insulin-resistant male 45 with normal
HbA1c, iron-deficient woman 30 with normal haemoglobin, healthy 28-year-old
(the plan must be short and must not invent problems), 70-year-old with
eGFR 55 (kidney-safe doses, no NSAID advice, metformin note).

### 7.3 Evidence checks

For every plan generated in evals and in production: resolve each
`evidence` title through Europe PMC. Report the resolve rate. For resolved
items, a judge reads the abstract and the claim and answers
supports / neutral / contradicts. Target: resolve rate above 80 %,
contradicts at 0.

### 7.4 Outcome calibration (real people, over time)

Every adopted action stores a prediction (`targets[].expect`, a number and a
date). When the retest lands, `experiments` records the measured delta. Per
intervention node, the app keeps predicted vs measured. That is the only
eval that measures health rather than plausibility, and it needs months. It
also feeds back: an intervention whose predictions keep missing gets its
edge strength proposed down.

## 8. Build order

1. Tables and seed loader; move `lib/vectors.ts` rules and the systems
   spec into `kg_nodes` / `kg_edges`; `recomputeGraphState`.
2. Patterns table with Hashimoto's and LMHR as the first two; detectors
   tested; effects applied in coverage and in the context pack.
3. Context pack sections `HOT GRAPH` and `MATCHED PATTERNS`; prompt rule
   that opinion cites graph ids.
4. Evals 7.1 and 7.2 with six personas; run against Grok and one other
   model; keep the results file in git.
5. Research intake job and `graph_proposal` review kind.
6. Pattern page (`/patterns/[id]`): summary, controversy, management,
   edges with confidence, escalations with done/not-done, last reviewed,
   new papers. This is the page your wife reads for Hashimoto's.
7. Evidence checks in the plan pipeline; outcome calibration once
   `experiments` exist.
