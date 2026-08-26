# Health model, systems view and AI doctor: design spec

Status: draft for discussion. Builds on `2026-08-25-simple-app-spec.md`.
Everything lives in `apps/simple`. Legacy tables stay untouched.

## 1. The idea in one paragraph

The app keeps one structured picture of the person (the health model). A static
knowledge graph says how biomarkers and body systems influence each other. The
app evaluates that graph against the person's data and renders it as a zoomable
systems map. The LLM never sees raw tables; it sees a compact "context pack"
built from the same model, and it returns a structured report: ranked actions,
each tied to the biomarkers it should move, with a date to measure again and
real references. Adopted actions become experiments. The next labs close the
loop and the report says what worked.

## 2. Knowledge graph (static, curated once)

File: `lib/systems.ts`. Plain TypeScript data, no DB. Drafted by the LLM once,
reviewed by hand, versioned in git.

```ts
type System = {
  id:
    | "lipids"
    | "metabolic"
    | "liver"
    | "kidney"
    | "thyroid"
    | "sex_hormones"
    | "adrenal"
    | "inflammation"
    | "blood"
    | "iron"
    | "vitamins"
    | "lifestyle";
  name: string;
  members: string[]; // metric codes; lifestyle members are daily_logs fields
  headline: string[]; // 2-4 codes that define the system score (apob, ldl, hdl, tg)
};

type Edge = {
  from: string; // metric code, daily_logs field, or profile fact key
  to: string;
  direction: "raises" | "lowers" | "confounds";
  strength: 1 | 2 | 3; // how much it moves the target when active
  confidence: "established" | "probable" | "speculative";
  when?: { from?: "high" | "low"; to?: "high" | "low" }; // condition for the edge to be "active"
  mechanism: string; // one sentence
  refs: string[]; // DOIs or guideline URLs
};
```

Examples that should be in the first version:

| from                                  | to                 | dir                   | conf        | note                                        |
| ------------------------------------- | ------------------ | --------------------- | ----------- | ------------------------------------------- |
| tsh (high)                            | ldl (high)         | raises                | established | hypothyroidism lowers LDL receptor activity |
| hba1c (high)                          | tg (high)          | raises                | established | insulin resistance                          |
| crp (high)                            | ferritin (high)    | confounds             | established | ferritin is an acute phase reactant         |
| alcohol (daily log, units/week)       | ggt, tg            | raises                | established |                                             |
| sleep (< 6.5 h avg)                   | cortisol, glucose  | raises                | probable    |                                             |
| exercise minutes                      | hdl                | raises                | established |                                             |
| vitamin_d (low)                       | testosterone (low) | raises when corrected | speculative | small RCTs, mixed                           |
| coffee before labs (profile)          | cortisol, glucose  | confounds             | probable    |                                             |
| iron supplement with coffee (profile) | ferritin           | lowers absorption     | established |                                             |

Size target: 12 systems, ~70 metric codes, ~100 edges. Enough to be useful,
small enough to review by hand.

Supplement interactions live next to it in `lib/interactions.ts`:

```ts
{ a: "magnesium", b: "zinc", rule: "separate by 2 h", why: "compete for absorption" }
{ a: "iron", b: "coffee", rule: "iron 1 h before or 2 h after", why: "polyphenols bind iron" }
{ a: "vitamin_d", b: "fat_meal", rule: "take with fat", why: "fat soluble" }
```

## 3. Evaluating the graph for one person (runtime)

`lib/health-model.ts`, one function `buildHealthModel(userId)`:

1. For each metric: latest value, unit, normal and optimal range, status, delta
   vs previous, 12-month slope, days since, goal if any. This already exists in
   `lib/data.ts`; reuse.
2. For each lifestyle input: 30-day aggregate from `daily_logs` (sleep avg,
   steps avg, alcohol units/week, exercise min/week, fasting h avg).
3. System score = share of headline members in optimal (0-100), plus worst
   member and trend (improving / stable / worsening from slopes).
4. Edge is **active** when its `when` condition holds on the person's data.
   Active edges get an `impact = strength × confidenceWeight` (3/2/1) so the UI
   and the LLM can rank them.
5. Output: `{ systems[], metrics[], activeEdges[], lifestyle, profile }`.

No LLM call here. Deterministic and fast, so every page can call it.

## 4. Presentation: zoom levels

### Level 0: `/systems` (the map)

A grid of 12 system tiles. Each tile: name, score ring, worst member with its
range bar, trend arrow. Between tiles, SVG arcs for active edges only. Encoding:

- line style: solid = established, dashed = probable, dotted = speculative
- width: strength
- colour: red = raising something bad, green = helping
- hover: mechanism sentence and reference count

Fixed grid layout, no force-directed graph. Ten tiles and a handful of arcs
read better than a hairball. The lifestyle tile sits at the bottom and feeds
the others.

### Level 1: `/systems/[id]` (one system)

- Header: score, verdict sentence from the latest report.
- Range bars for every member: value marked on the normal band, optimal band
  drawn inside it, previous value as a ghost dot, goal as a tick.
- Small multiples: one sparkline per member, 24 months, protocol start dates as
  vertical markers ("started omega-3").
- Influences panel, two columns:
  - "What may be pushing this": incoming active edges, ranked by impact, each
    with confidence chip and mechanism.
  - "What this affects": outgoing active edges.
- Actions from the report that target this system.

### Level 2: `/m/[code]` (one biomarker, exists today)

Add: range bar, connections list (all edges touching this code, active ones
first), the report's note for this marker, and the experiments that target it
with their measured effect.

### Home

Replace the flat "Needs attention" list with the top 3 systems by problem
and the top 3 actions by weight. Keep the health score gauge.

## 5. What the AI needs to know: the context pack

`lib/context.ts`, one function `buildContextPack(userId)`; ~6-10k tokens.
Same pack feeds the report, the chat, and the MCP tool. Sections, in order:

1. **Profile facts** from a new `profile_facts` table (key, value jsonb,
   asked_at, answered_at, stale_after_days): age, sex, height, medications,
   supplements with dose and timing, diet pattern, coffee habit, breakfast
   habit, alcohol pattern, training, known conditions, family history, stated
   goals. Each fact has an age so the LLM knows what is stale.
2. **Systems** from `buildHealthModel`: score, trend, members with value,
   ranges, status, delta, slope, days since.
3. **Active edges**, ranked. The LLM reasons on these instead of inventing.
4. **Behaviour**: protocol items with 30-day adherence, lifestyle aggregates.
5. **Experiments**: what was started, when, what it targeted, what the next
   labs showed. This is how the AI learns what works for this person.
6. **Open questions** and recent answers.
7. **Previous report summary** (so it can say what changed).

Nothing about identity: no name, email, or ids beyond metric codes.

## 6. The report

Trigger via the existing scheduler in `instrumentation.ts`:

- after an upload finishes curation
- weekly if a protocol item changed or adherence data exists
- every 30 days with no new labs: a "check-in" report that mostly asks
  questions

Model call: `generateObject` with a strict schema.

```ts
type Report = {
  summary: string[]; // max 3 lines
  systems: { id; verdict: string; priority: 1 | 2 | 3 }[];
  actions: {
    title: string;
    kind:
      | "supplement"
      | "food"
      | "exercise"
      | "sleep"
      | "test"
      | "doctor"
      | "stop";
    weight: 1 | 2 | 3 | 4 | 5; // importance for this person now
    why: string; // ties to specific values
    targets: {
      code;
      direction: "up" | "down";
      expect: string;
      measureAfterWeeks: number;
    }[];
    timing?: string; // "morning with fat", "evening"
    interactions?: { with: string; rule: string }[];
    evidence: {
      kind: "guideline" | "meta" | "rct" | "observational" | "anecdotal";
      title;
      doi?;
      url?;
    }[];
    confidence: "established" | "probable" | "speculative";
  }[];
  questions: { key: string; text: string; why: string; options?: string[] }[];
};
```

Evidence pipeline: the LLM proposes titles; the server resolves each through
PubMed and Semantic Scholar (free APIs; the `paper-search` MCP already wraps
them for local use). Unresolved references are dropped, not shown. Anecdotal
items are allowed but labelled and never counted as support.

Storage: `reports` table (id, user_id, created_at, trigger, json). Keep every
version; the UI shows the diff since the previous one.

Questions become `review_items` with kind `profile_question`. Answering writes
`profile_facts`. Same queue and badge as the curator uses today. No wizard.

## 7. Closing the loop: experiments

Adopting an action creates a `protocol_items` row (exists) plus an
`experiments` row: action, started_at, targets (from the report), retest_due.
The retest plan page lists these dates. When new readings for a target land
after `started_at`, the model computes the effect (before vs after, and vs the
prior slope) and shows it on the biomarker page and in the next report:
"omega-3 since March: TG 145 → 110, HDL unchanged".

## 8. Charts to add (in order of value)

1. Range bar (normal band, optimal band, value, ghost previous, goal tick).
   One component, used everywhere.
2. Trend with intervention markers (protocol start dates as vertical lines).
3. System score ring and tile.
4. Systems map arcs.
5. Adherence strip per action (exists for protocol).
6. Daily stacked bars for the tracker, caltrack style.

## 9. Chat and MCP

Chat stays as is; it now receives the context pack as its system prompt and
nothing else changes. MCP server: one route, five read tools
(`get_health_context`, `list_metrics`, `get_readings`, `get_protocol`,
`get_daily_logs`), token auth. No writes from outside.

## 10. Data changes

Three new tables: `profile_facts`, `reports`, `experiments`. Two static files:
`lib/systems.ts`, `lib/interactions.ts`. Everything else reuses existing rows.

## 11. Build order

1. `lib/systems.ts` + `lib/interactions.ts` (LLM draft, hand review).
2. `buildHealthModel` + range bar + `/systems` and `/systems/[id]`.
3. `profile_facts` + `profile_question` review items + first questions.
4. `buildContextPack` + report job + evidence resolver + `/plan` page.
5. Experiments and the effect readout.
6. MCP route.

## 12. Sex, age, conditions, family history

These are not separate features. They are **modifiers** that the model applies
before anything else runs. Stored as `profile_facts`; applied in
`buildHealthModel`.

```ts
type Modifier = {
  when: { fact: string; equals?: string; includes?: string; ageMin?: number; ageMax?: number };
  effect:
    | { kind: "range"; code: string; optimal: [number, number]; normal?: [number, number] }
    | { kind: "target"; code: string; goal: number }
    | { kind: "weight"; system: SystemId; factor: number }
    | { kind: "edge"; edge: Edge }
    | { kind: "member"; system: SystemId; add: string[] };
  why: string; refs: string[];
};
```

How each input maps:

| Input | What changes | Example |
|---|---|---|
| Sex | ranges for sex-specific markers; system membership | ferritin, hemoglobin, creatinine, testosterone, estradiol, SHBG, PSA (men only), FSH/LH (women, cycle-aware) |
| Age | ranges by band; which systems are headline | testosterone optimal drops per decade; bone markers and PSA enter after 45; women: perimenopause band flags FSH, estradiol |
| Conditions | tighter targets; new edges; new required tests | diabetes: LDL goal 70, HbA1c headline; hypothyroid on levothyroxine: TSH target 0.5-2, edge to lipids stays active; PCOS: insulin, androgens headline |
| Medications | expected effects so the AI does not "discover" them | statin: LDL down, CK to watch; metformin: B12 to watch; OCP: SHBG up, CRP up |
| Family history | system weight up and targets down; extra markers | father MI < 55: lipids ×1.5, ApoB goal 80, Lp(a) required once; T2D in parents: metabolic ×1.3, fasting insulin headline |

Women also get a `cycle_phase` fact on each upload (asked as a
`profile_question` when the draw date lands): hormone readings are stored with
the phase and compared only within the same phase. Pregnancy and lactation are
facts that suspend most optimal bands and route to "doctor" actions.

The lab-printed range on the report is still the "normal" truth. Modifiers
only change **optimal** bands and goals, never what the lab said.

Ranges by sex and age live in `lib/systems.ts` next to the graph as variants
per metric code. The curator's `missing_optimal` check proposes ranges for the
person's sex and age band, and the review question shows which band applied.

## 13. Two audiences on every screen: simple first, deep on demand

Rule: every screen answers "what do I do" above the fold in plain language,
and "why, and how sure are we" below a toggle. One global switch,
Simple / Deep, remembered per user. Default Simple.

| Layer | Simple shows | Deep adds |
|---|---|---|
| Home | 3 actions, one plain paragraph, 3 systems needing attention, 2 questions | modifiers in effect, full action list with weights, evidence chips |
| Systems map | spheres sized by problem, only active edges, colour = direction | line style = confidence, mechanism on hover, DOI links |
| System page | ELI5 paragraph, only off-range markers as range bars, actions | verdict text, all markers, incoming and outgoing edges with refs, slopes |
| Biomarker page | value, range bar, one-line meaning, what to do | trend with intervention markers, experiments and effects, connections |
| Action card | title, one "why" sentence, three buttons | targets with expected magnitude, measure-after date, timing, interactions, confidence, references |

ELI5 is a field, not a mode: the report schema gets `eli5` next to `verdict`
for each system and next to `why` for each action. Same LLM call, two
registers. The rule for the prompt: one concrete metaphor, two sentences,
no numbers unless they are the action itself ("4000 IU").

Actions are the unit of "simple to act on". Every action has exactly three
buttons: **Add to protocol** (creates the experiment and the retest date),
**Plan retest**, **Not for me** (records the refusal so it is not proposed
again, and the AI can ask why once). Nothing else on the card needs a click.

Questions are never a screen of their own. Two at a time, on the home page
and in the review queue, with Yes / No / short answer. The report decides which
two, ranked by how much the answer would change the plan.

## 14. Mockup

`docs/mockups/systems-map.html` (three.js, static data) shows the map, the
Simple / Deep toggle, the range bar, action cards, active edges with
confidence styling, and the ELI5 register. Open it in a browser; drag to orbit,
click a sphere.
