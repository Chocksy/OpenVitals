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

| 24 | The UX audit series (`2026-09-01-ux-audit.md`): 24a certainty-first ranking + one asking surface; 24b phone data home (draws lab-only, Phone tab, read-time wearable facts, honest Today, human heatmap); 24c findings surface where they act (genome card, sentence FOR/AGAINST); 24d composition + motion (chart void fixed, filler collapsed, in-place answers with pop-in/swap/FLIP/toast, checklist applied); 24e curator second pass (owner 10/10 settled by re-match, Ramona 9/20 settled, 1 true tie, 10 pending a second look); 24f sync truthfulness (server totals, progress, retry, resumed); 1082 web tests, 75 XCTests, 25/25 journeys | `7ea5e36`…this |

Prod follow-through done 2026-09-01: history churn collapsed on the
owner's account (7 rows), second pass run for Ramona. Parked from the
series: zinc mg/L ↔ µg/dL conversion (the one "tie" is a unit); the
`raw_confirmed` flag should clear on re-analyze; `/api/ledger`
recomputes on every answer (cache if rapid-fire); genome card does not
re-open when the catalog gains a variant the file carries; the prod
chart void, if it ever recurs, now shows a skeleton (the signal to chase).

| 25 | Owner review of 24: 25a hotfix (React-safe motion with a no-DOM-mutation lock, bubble taps, Answer links carry the key, re-asks in words, Discuss answer shown, Not-for-me undo, ask box answers questions grounded in the ledger, counter paths) and 25b clarity (55-term glossary with tooltips on every marker, mono-for-numbers type discipline enforced by a render test, systems grid, plain words on Home/Plan/Ask, one ask-or-tell entry) | `1fc83d3`…this |

Parked from 25: Discuss answers arrive whole (make `/api/plan/discuss` stream or route through the composer's endpoint); `/api/plan/discuss` is now uncalled by the UI; Term tooltips are pure CSS (can clip at a viewport edge); "You noted: You noted, …" duplication in the stored reply text; unnamed multi-word codes (`fibroscan kpa`) need graph names.

| 26 | Main agent used the app as the test user and fixed what hurt: one-click ask, no ontology header on questions, answers grounded in the plan + graded interventions with labelled doses (model picked by `eval:ask`), Discuss without fake facts, What-to-do blocks with Add/undo/Get actions, Plan inline answers, edge-aware tooltips, honest range bar, test bubbles explain themselves; 1201 tests | `711eee3`…this |

Parked from 26: `hkb_interventions` carries a grade-B "whole system Ayurveda protocol" for hashimoto (the intake graded a small trial B; policy question, not plumbing); `protocol_items` has no dedupe; the ask-eval judge does not see the engine's conclusions block so it under-scores engine probabilities; tooltip flip-below untested live.

| 27 | Answers you can act on: structured answers with an Act-on-it row (add action, add all, plan retest feeding Next draw, answer question, ask-your-doctor copy), closed-set guard, About mode handles statements about an action (already doing → protocol + exercise fact; started/stopped/not for me/did it today) and cards say "You're already doing this since …"; eval:ask gains chip/invented checks; 1240 tests | `4b07bfc`…this |
| 28a | Answer the question asked: question kinds in code (status/howto/prognosis/research/why/next-test, ordered rules, prognosis beats research), per-kind prompt shapes and candidate sets (evidence + intervention rows, graph edges, information-gain lines), Sources line with the closed-set guard, `<EvidenceChip>` glyphs (● grade / ◐ / ○) replacing every bracket label, one quiet focus ring, RCT grade policy: n < 100 reads C (Ayurveda row regraded by migration 0021, duplicate row removed); eval:ask 12 cases, gemini-3.7-flash 0.78 12/12 clean; 1290 tests | this |

| 28c | Thread: Ask and Discuss as one thread on `ai` v7 (`threads` + `thread_messages`, migration 0022, `/chat/[id]`, "Continue this", follow-up shape decided in code, five tools through `pickActs`, OpenAI Responses compaction behind `OPENAI_API_KEY` with an OpenRouter 40-message fallback); eval:thread 3 cases, eval:ask 0.83. Home: v4 base warmed by August (cream canvas, translucent tiles, light behind the hero that follows the worst band) with Kite's card rail on the phone (Status navy, Body, Blood, Plan, one card per system, off first, coral ▲ only on what is off) and the v4 grid on desktop; `railCards` order locked by tests; twelve systems as chips; 1310 tests | `74d5b03`, `16c894c` |

Parked from 27: five duplicate Selenium protocol rows on the test account predate the idempotency guard; a Turbopack HMR staleness made Discuss open without a subject on the dev server only (watch prod); "Plan retest" cards still link to /insights rather than planning the marker directly.

Parked from 28a: `why-tired` scores 1/5 (thin fatigue edges in the graph, or the `why` shape); old RCT rows keep their B because `saveInterventions` is insert-only (a re-grade backfill needs n, which old rows never stored); the answer repeats the dose when the action title already has it; dihydromyricetin sits at grade A on the MASLD card, worth the same paper check.

| 29 | Design system: `system.html` (site map folding 24 routes into Home, Body, Blood, Plan, Graph, + sheet, System, login, chat; tokens with contrast; three button jobs; inputs; state words never a surface; cards; rows; tables; hand-drawn charts; overlays; empty states without dashes; motion; dark) on `system.css`, plus body, plan, graph, login, admin and an extended blood page; history chart rebuilt as one shared component; UI inventory | `1cdd4c4`, `251574e` |
| 30 | The rewrite, five slices: 30a foundation and shell (globals.css from the system tokens, ui-kit with ink / quiet / text buttons and StateWord, one tab control, five-pill nav with the phone tab bar, composer, login, redirects); 30b Body (Today, Check-in, How you feel, Trends; hand-drawn daily line; packed history lanes); 30c Blood and charts (shared Ruler and HistoryChart everywhere, recharts removed; Draws, Markers, Phone, Uploads, marker page and drawer, upload detail, plan a draw); 30d Plan and Home (system card anatomy, aim lines, dose lines, evidence letters, systems once, hero light; Plan folding protocol, goals, insights, review, patterns); 30e Graph, Chat, System and the sweep (ringed bubbles with placed labels, reasons formatter, chat rows, admin tables, shim and dead code deleted); 1424 tests | `23ff9d6` … this |

Parked from 28c: `MAX_TESTS` (30) in `lib/lookup.ts` fills every offered test from moves before the measured codes, so a Hashimoto's question never offers TSH or TPO and "plan the retest" fails `eval:thread` (fix belongs in `askCandidates`); Coolify needs `OPENAI_API_KEY` and `AI_THREAD_MODEL` for the compaction path; the "One question" block keeps its blue accent (`today-ask.tsx`); glossary tooltips left the rail and chips because a card is one link; a 22 px overflow at 390 from `ov-term` tooltips inside `KeyTrends`.

| 31 | 31a the first evening's ten fixes (threads keep the whole conversation and never replay Gemini thought signatures, errors reach the screen; the ask closed set reserves the marker asked about and the thread subject carries into follow-ups; Answer links re-key the question box; answered profile questions close; goals with two bounds draw as a band; hover titles; gutter; upload state; genome rows lead with the verdict; duplicate trends merge; free-text ask-backs get a text input); 31b designs (research, plan month, genome answer-first, upload read receipt, iOS native, chart hover) approved 2026-09-03 | `5988028`, `7bcacc3`, `f021c9e` |
| 32 | 32a research watch, the month with schedule columns, genome verdicts and `/blood/genome`, the read receipt, chart hover cards, meals, the API contract with fixtures (migration 0023, add-only); 32b the native iOS app on the design tokens (Today, Body, Meals, Capture, Plan, Settings; WKWebView gone; 103 tests); 1728 web tests | `f5e6b20`, `853e86e` |

Parked from 30: bubble positions in `lib/bubbles.ts` still crowd 29 nodes (seven small never-measured circles carry no label); engine codes inside model-written prose (`action.why`, `action.reasoning`) belong to the plan prompt; no per-marker retest cadence, fasting flag or upload size in the schema, so Plan a draw and the upload rows omit them; `globals.css` is 4 600 lines because the transitions.dev block and every element class live in one file; the dev server on the external volume needs `rm -rf .next` before a restart to serve fresh CSS.

Parked from 32: the OpenRouter key is at its monthly limit (chat, one-shot answers, plan generation and the research intake fail until topped up); the owner's feed holds 15 search-only papers with no grade because nothing read them; `protocol_items` has no interval column (alternate-day iron) and one tick per item-day; a research tab per pattern needs rows keyed on patterns; HFE and LPA absences read "no change" because their catalogue rules carry no negative LR; the two damaged threads from Sep 2 still hold their empty rows; iOS Month tab, Genome and Research screens not drawn yet; the owner has never synced a phone, so Body's fixture comes from the local HealthKit account.

## In progress

Nothing. Next: owner review of research, the month, genome, the read receipt and the native app; top up the OpenRouter key.

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
