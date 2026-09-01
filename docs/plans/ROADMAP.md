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

| Phase | What                                                                                                                                                                                               | Key commits                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1–4   | Lean app, curator, review queue, tracker, protocol, goals, trends, dark mode                                                                                                                       | `ab1df30`…`9c45242`             |
| 5     | Profile facts, vectors and coverage, escalation rules, AI plan with labels and doses, `/plan`, discuss                                                                                             | `c3644d2`                       |
| 6     | Knowledge graph (99 nodes, 112 edges), patterns, personal graph state, persona evals                                                                                                               | `82b55e0`, `c7e5a02`            |
| 7     | Uploads with state and re-analyze, curator range/unit repair, raw-sheet verification, per-user optimal bands                                                                                       | `e26d6df`, `2383468`, `36b1fb0` |
| 8     | Four-destination nav, Labs tabs, tracker under avatar                                                                                                                                              | `0f6a6f8`                       |
| 9–10  | Hypothesis engine, scenarios, `/brain`, HKB tables, information gain, diagnostic tree                                                                                                              | `9beaee3`, `2d4b111`, `02ea7b2` |
| 11    | 32-condition catalog, HPO/MONDO/HPOA import, NCD-RisC priors, symptom set, RO prices, `/hkb`                                                                                                       | `768919d`, `c8ea074`            |
| 12    | Home as cockpit + conclusion ledger, belief snapshots                                                                                                                                              | `91c89cb`                       |
| 13    | Genome parser (12 genes), any-document extraction with review, life_events table                                                                                                                   | `1d807c8`                       |
| 14    | Research intake (Europe PMC, DOI-verified), importer fix, rare-disease proposals rejected                                                                                                          | `2e7954d`                       |
| 15    | Autonomous knowledge (grades A–E, policy, pooling, minting, interventions and horizon, schedule, `/hkb` window, System nav) and fact history (changed vs corrected, `/history`, event confounders) | `ed91fac`                       |

Findings from phase 15 worth remembering: diagnostic-accuracy searches
now mostly return papers already ingested (dedupe works); the yield lever
is minting features the model names without a unit (11 dropped in one
run); Semantic Scholar keyless API returns 429 most of the time, so venue
downgrades rarely fire (an API key would fix it); interventions land
easily (26 rows in one run, A 12 / B 2 / C 5 / D 7).

Follow-ups done (`fe675b3`): unit-less minting (10 features landed:
EmA/DGP serology, VCTE, HRI, FAST, MAST, DXA model), Semantic Scholar key
with 429 retry. Known gap: minted synonyms ("EmA IgA" vs "IgA endomysial
antibodies") are separate features until the curator's LLM metric-identity
step also runs over `hkb_features`.

| 16 | The picture, data layers: graph in Postgres, Monarch edges (same-term filter), mechanism-edge extraction with `when_`, personal conditional edges, pathograph helper (page held for the bubbles mockup) | `42cfe43` |
| 17 | Knowledge rings (10,597 dormant diseases), waking on five triggers incl. the ask box (pg_trgm), correlation guards, trend evidence, KB revisions in what-changed, calibration logging, ruled-out hidden app-wide | `4283893` |

| 18 | Journey evals (18 scripted personas incl. 8 rare-disease paths: Addison's, Wilson, Gilbert, A1AT, pernicious anaemia, Fabry via exome, MCAS, SIBO via microbiome), 0–100 discovery track with percentages, Journeys tab on `/brain`; the evals found and we fixed four engine defects (threshold units, missing negative LRs, unknown≠negative, stopping floor); budget is a guide; special-path tests | `a484e69`, `42eb271` |

Findings from phase 18: 15/18 journeys pass; the three failures share
one cause, symptom-only rules stacking multiplicatively (hypothyroidism
89 % on symptoms + TSH band alone). Also: the lipid correlation guard
hides ApoB after LDL is known, which is wrong exactly in the LMHR case
(discordance is the signal). Both are decided and go into phase 19.

| 19 | Projections with expectation (graded effect sizes, adherence, bands, resolution better/as-expected/worse, intervention outcomes), three-lane `/history` with replay, band on `/m/[code]`, on-track ledger line; symptom LR cap and prior-modifier caps; ApoB–LDL discordance; 20/20 journeys pass, 746 tests | `d6ee0da` |

| 20 | The composer and the interview as a relationship: per-fact revisit cadence with triggers, still-true one-tap re-asks, always-present "+" modal with understood chips (rules first, closed-key model layer with verified quotes), one follow-up per post, replies computed in code and phrased with memory, Today card, `hp:*` phenotype facts wake ring 2, four sourced caffeine/glucose edges; compose evals 12/12, journeys 21/21, 819 tests | `ee62c3e` |

Findings from phase 20: the rules layer alone covers every eval chip (the
model only adds clarifier answers); a pre-existing defect surfaced, not
fixed: `Discriminator` in `lib/hkb-catalog.ts` has no sex gate, so the
engine offers mammography to a 41-year-old man. Left undone: hollow
markers for self-reported readings on `/m/[code]`; the composer chip
strip stacks one chip per row.

| 21 | Defect sweep and sanity suite: discriminator gates (mammography defect and family), sex-split thresholds (haemochromatosis ferritin, gout urate, OSA haematocrit), five orphan facts revived (PCOS Rotterdam, OSA sleepiness/neck, B12 diet), no-op AUDIT rule fixed, quiet floor only held open by movable beliefs; `hkb-sanity.test.ts` with 29 catalog invariants; three new journeys, 24/24, 859 tests | `04b8c57` |

Findings from phase 21 worth remembering: the gated m41 now exhausts at
zero steps (was five draws ending in a mammography); the seed itself
caught two duplicate evidence rows once the sanity suite mirrored the
`hkb_evidence` unique key. Open questions parked: `hashimoto`'s
`hla_type` prior modifier reads a fact no question asks (orphan, on a
modifier); a dead `pcos_cycles` row sits in `hkb_evidence` (delete needs
owner OK); `cancer_screening_due` could take a sexed condition gate
instead of relying on per-test gates.

| 21b | Relative gates and the contested watch: `earlierWhen` clauses (family history brings colonoscopy to 40, mammography to 30, PSA to 45, ancestry clause; condition-level clause so the under-40 case is scored at all), CONTESTED list (PCOS, MCAS, SIBO) always in the research run, sanity suite 34 checks, `crc_family_history_m42` journey; 25/25, 875 tests | `964f1a9` |

Parked from 21b: `osteoporosis_risk` could take an `earlierWhen` for
fragility fracture or steroids; the ancestry option list has no
"Black / African diaspora" answer for the PSA clause to match; the
"ten years before the relative's diagnosis" term needs a diagnosis-age
fact nobody asks yet.

| 22 | Always fresh: staleness-driven research picks (contested/horizon/pooled/guideline classes), the trends inbox (sardines: claim → graded science via marker-directed search + horizon E row with measurement plan; /hkb claim box, /plan horizon shelf, composer claim chips), guideline watch as review rows, personal effect multipliers in projections; eval:trends 5/5, 928 tests | `5efbd6e` |
| 16b | Bubbles page on /graph per the approved mockup: deterministic server-side force layout (no d3), lens re-scoring, belief bubbles, waiting-on edges, ruled-out toggle, systems map kept | `faa7090` |
| 17b-prep | Compose healthcheck + legacy blob mount, prod-init runbook (silent-migrate landmine documented, pg_dump path A with person-table guard), only one cron needed (guideline watch; research is an in-process tick) | `d0b2965` |

Small notes parked: horizon shelf has no dismiss; hba1c claims land under
insulin_resistance (alphabetical pick); `applyPatternTargets` mutates its
input (test-fixture landmine); one seeded intervention_outcomes dev row on
the test account makes the personal multiplier visible.

| 17b | Cutover executed 2026-08-31: pushed, Coolify app flipped to branch `simple` + `/docker-compose.simple.yml`, envs set (ADMIN_EMAIL, models aligned to the evals), deployed, boot migrations + legacy import ran (2 users, 1,198 readings intact), knowledge tables loaded via runbook path A (51,943 terms, 285,455 annotations, 10,637 conditions, 15,449 priors), guideline-watch task created (`0 6 15 */3 *`), vitals.chocksy.com serves the new app; old compose kept for rollback | live |

Cutover notes: the owner's prod profile has no sex/birth-year facts yet,
so /graph asks its two bootstrap questions (working as designed; the
"owner inputs wanted" list now shows up in the product itself). Server
SSH is Tailscale SSH with a browser check-in.

| 23 | The iOS companion: server half (22-type healthkit mapping with server-side aggregation and lab-draw priority, /api/capture photo→chips for meals/labels/lab sheets, composer photo button; eval:capture 8/8, 968 tests) and the SwiftUI app (Today webview, Capture, Sync; 25 types, anchored queries, background delivery; 29 XCTests) | server pushed, app in `apps/ios` |

Needs the owner to ship the app: pick a DEVELOPMENT_TEAM in Xcode once,
install on the phone, sign in, grant Health access. Open calls parked:
first-sync window is 365 days; background delivery is hourly for all
types (CGM might want immediate); MenstrualFlow counts any sample as a
bleeding day; respiratory rate is sent as breaths/min because the
server drops count/min.

| 23c | Workouts in and windows on the data: **the batch-boundary bug fixed** (day-aligned batches plus a held-back newest day, so a day never straddles two POSTs — a 620-sample day stored 2,400 steps instead of 12,400 before), HKWorkout + paired energy + distance + flights synced, workouts into `daily_logs.wearable` with auto habit ticks, minted `exercise_days_week` (system-sourced from 28 days, a manual answer wins), /today wearable strip and nutrition line, optimal bands with sources for resting HR / sleep / HR recovery, `sleep_study` unit bug fixed; 985 tests, 52 XCTests, journeys 25/25, compose 14/14 | `apps/ios` + `apps/simple` |

The batching fix has to be on the phone **before** the owner taps
"Resync full history", or every day whose samples cross a batch or page
edge is stored short. The client contract is now written down in both
halves: one POST carries whole days, and every server write replaces
rather than adds.

`exercise_days_week` has no evidence rule. Nothing published gives a
likelihood ratio for self-reported exercise days against measured
fitness, so it stays a fact the interview, the composer and the sync all
write, and no LR was invented to make it look busier.

## In progress

**Phase 24, the UX audit series** (`2026-09-01-ux-audit.md`): done and
pushed: 24a certainty-first ranking + one asking surface, 24b phone data
home, 24e curator second pass (owner's 10 rows settled without a human),
24f sync truthfulness. Running: 24c findings surface where they act
(genome sentences, human FOR/AGAINST); then 24d home composition +
motion (answers animate without a reload).


## Next

| #   | Phase                                                                                                                                           | Why                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 16b | The picture, page: bubbles view on `/graph` per the approved mockup (state fills, kind outlines, faint not-for-you, ask box), mobile card stack | the relations chart the owner asked for |
| 17b | Prod cutover to Coolify (branch `simple`, compose, volumes, seeds, imports) — owner said not to rush it                                         | Ramona on her phone                     |
| 18  | GBD priors (owner downloads one CSV), NCD-RisC to more conditions, prices from a second lab                                                     | better empty-user starts                |
| 19  | Wearables via the phone app (resting HR, sleep, HRV, steps) and Apple Health; food photos later                                                 | the tier-0 vectors blood cannot see     |
| 20  | Genome tier 2 (~40 SNPs, polygenic scores, ancestry-matched), microbiome report parser                                                          | more evidence for the same engine       |

## Open cleanups (need owner OK)

- `git worktree remove /private/tmp/ov-head`; `/tmp/phase11-scratch/`;
  `apps/simple/lib/panel-config.ts` (unused); test-user leftovers
  (fake NAFLD document, `doc:nafld` evidence row).

## Owner inputs still wanted

Family history, home BP, waist, the 12 symptom answers, life events,
both genome uploads on the real accounts, the loose PDFs as documents,
GBD CSV download.
