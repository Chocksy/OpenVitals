# OpenVitals `simple`: roadmap and principles

Living document. Updated at the end of every phase. Branch `simple`,
app `apps/simple`. Detailed specs live next to this file as
`YYYY-MM-DD-phaseNN-*.md`.

## Principles (decided with the owner, do not re-litigate)

1. **Admin pages are windows, not queues.** `/brain`, `/hkb`, `/graph`
   deep view, `/admin` show what the system ingested, how it scored, and
   why. They never require approval to make data count. They stay in the
   nav for the admin. Never removed (see memory `keep-brain-hkb-pages`).
2. **Everything enters, everything is labelled.** Grades A–E (meta or
   guideline, RCT or large cohort, small human, case report or n=1,
   animal or in vitro). A/B score at full weight, C shrunk toward 1, D/E
   never touch probabilities and live in the "horizon" as experimental
   ideas with a measurement plan. Basis on every claim: science,
   opinion, anecdotal. Confidence on every edge.
3. **Inference in code, prose by the LLM.** Priors × likelihood ratios →
   states; next step by information gain per euro. The LLM maps text to
   features, extracts numbers with quotes, and writes sentences. It never
   picks thresholds or orders.
4. **Every input is disputable and versioned.** Facts have a history.
   Two kinds of edit: _changed_ (a new value from a date; the old one
   stays true for its period) and _corrected_ (the old value was wrong;
   it is replaced retroactively). Readings are never deleted; moves and
   rescales carry the original in a flag. Old draws get context from the
   life-events timeline, not from questions.
5. **User pages are actionable and short.** Home: biological age,
   counters, systems, the spear, the ledger. Questions appear where they
   change a conclusion. Manual data entry moves to the phone app.
6. **Evals before opinions.** Persona cases with assertions and a judge;
   model choice by score and price; results in git.
7. **Ponytail.** Fewest files, no new deps, additive migrations, tests on
   every pure function, `// ponytail:` on deliberate shortcuts.

## Done (commits on `simple`)

| Phase | What                                                                                                         | Key commits                     |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 1–4   | Lean app, curator, review queue, tracker, protocol, goals, trends, dark mode                                 | `ab1df30`…`9c45242`             |
| 5     | Profile facts, vectors and coverage, escalation rules, AI plan with labels and doses, `/plan`, discuss       | `c3644d2`                       |
| 6     | Knowledge graph (99 nodes, 112 edges), patterns, personal graph state, persona evals                         | `82b55e0`, `c7e5a02`            |
| 7     | Uploads with state and re-analyze, curator range/unit repair, raw-sheet verification, per-user optimal bands | `e26d6df`, `2383468`, `36b1fb0` |
| 8     | Four-destination nav, Labs tabs, tracker under avatar                                                        | `0f6a6f8`                       |
| 9–10  | Hypothesis engine, scenarios, `/brain`, HKB tables, information gain, diagnostic tree                        | `9beaee3`, `2d4b111`, `02ea7b2` |
| 11    | 32-condition catalog, HPO/MONDO/HPOA import, NCD-RisC priors, symptom set, RO prices, `/hkb`                 | `768919d`, `c8ea074`            |
| 12    | Home as cockpit + conclusion ledger, belief snapshots                                                        | `91c89cb`                       |
| 13    | Genome parser (12 genes), any-document extraction with review, life_events table                             | `1d807c8`                       |
| 14    | Research intake (Europe PMC, DOI-verified), importer fix, rare-disease proposals rejected                    | `2e7954d`                       |

| 15 | Autonomous knowledge (grades A–E, policy, pooling, minting, interventions and horizon, schedule, `/hkb` window, System nav) and fact history (changed vs corrected, `/history`, event confounders) | `ed91fac` |

Findings from phase 15 worth remembering: diagnostic-accuracy searches
now mostly return papers already ingested (dedupe works); the yield lever
is minting features the model names without a unit (11 dropped in one
run); Semantic Scholar keyless API returns 429 most of the time, so venue
downgrades rarely fire (an API key would fix it); interventions land
easily (26 rows in one run, A 12 / B 2 / C 5 / D 7).

## In progress

Phase 15 follow-ups: mint unit-less features as "unit unknown" so the
finding is kept; optional `SEMANTIC_SCHOLAR_API_KEY`.

## Next

| #   | Phase                                                                                                                                    | Why                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 16  | The picture: Monarch KG edges, mechanism-edge extraction, personal conditional edges (genome, facts, timing), `/graph/[node]` pathograph | the relations chart the owner asked for |
| 17  | Prod cutover to Coolify (branch `simple`, compose, volumes, seeds, imports)                                                              | Ramona on her phone                     |
| 18  | GBD priors (owner downloads one CSV), NCD-RisC to more conditions, prices from a second lab                                              | better empty-user starts                |
| 19  | Wearables via the phone app (resting HR, sleep, HRV, steps) and Apple Health; food photos later                                          | the tier-0 vectors blood cannot see     |
| 20  | Genome tier 2 (~40 SNPs, polygenic scores, ancestry-matched), microbiome report parser                                                   | more evidence for the same engine       |

## Open cleanups (need owner OK)

- `git worktree remove /private/tmp/ov-head`; `/tmp/phase11-scratch/`;
  `apps/simple/lib/panel-config.ts` (unused); test-user leftovers
  (fake NAFLD document, `doc:nafld` evidence row).

## Owner inputs still wanted

Family history, home BP, waist, the 12 symptom answers, life events,
both genome uploads on the real accounts, the loose PDFs as documents,
GBD CSV download.
