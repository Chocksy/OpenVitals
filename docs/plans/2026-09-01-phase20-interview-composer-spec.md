# Phase 20: the interview as a relationship, and the composer

Owner ask (2026-08-31): the interview should ask based on past answers,
never repeat a settled question (coffee) without a reason, take free text
anywhere, and be always reachable: a big "+" button that opens a modal
like X's post composer. While the person types, chips show what was
understood and keep updating. Follow-up questions only when the engine
needs more ("I feel tired" → when in the day; coffee time unknown → ask
it, then answer with the mechanism and one suggestion). Everything in
`apps/simple`. No new deps. Ponytail. ROADMAP principles, especially 3
(inference in code, prose by the LLM) and 4 (every input is dated and
disputable).

## 0. What exists, what is missing

Exists: `lib/facts.ts` (dated history, `changed` vs `corrected`,
`writeFact`), `PROFILE_QUESTIONS` + `SYMPTOMS` (options, gates),
`lib/ask.ts` (`symptomAsks` by information gain in the live band,
`conditionalAsks` for `coffee_last_hour` / `bedtime_hour` /
`last_meal_hour` / `dairy_daily`), `lib/lookup.ts` (`searchTerms` over
HPO/MONDO with pg_trgm, `answerAsk`, one LLM sentence), `/api/facts`,
`AnswerQuestion` + `FactEditButtons`, `/feel`, the ask box on Home,
`/chat` (free LLM chat, no memory, no writes).

Missing: (a) a revisit cadence per fact, so a settled answer is not asked
again until it can have changed or something made it matter; (b) "still
true?" one-tap re-asks; (c) free text → dated facts, readings, life
events, phenotypes; (d) engine-chosen follow-ups; (e) a reply that uses
what the person said before; (f) one entry point that is always there.

## 1. Cadence: when a fact is asked again

Add `revisitDays` to every asked fact, next to its question (in
`ASKED` in `lib/vectors.ts` and in `SYMPTOMS`). Rule of thumb, adjust
per fact with a one-line reason in the source:

| Facts                                                 | revisitDays |
| ----------------------------------------------------- | ----------- |
| sex, ancestry, country                                | never (`0`) |
| family_history, screening_dates, cac_score, dexa      | 365         |
| menopause_status (never once "post")                  | 365         |
| smoking, conditions                                   | 180         |
| medications, supplements                              | 90          |
| waist_cm, bp_home, resting_hr, grip_kg                | 90          |
| the 12 symptom items                                  | 90          |
| coffee_last_hour, bedtime_hour, last_meal_hour, dairy | 180         |
| cycle_phase_at_last_draw                              | per draw    |

Migration (additive): `profile_facts.revisit_at date null`,
`profile_facts.confirmed_at date null`. `writeFact` sets `revisit_at =
validFrom + revisitDays` (null for never). Confirming sets
`confirmed_at = today` and pushes `revisit_at` forward; no history row
is written because the value did not change, but `/history` draws a
small tick on the fact lane at each `confirmed_at` (store the ticks in a
`jsonb confirmations` column on `profile_fact_history` for the open row,
so the lane has them without a new table). Skipping sets `revisit_at =
today + 30`.

```ts
// lib/revisit.ts (pure, tested)
export interface DueFact {
  key: string;
  question: string; // re-ask wording: "Still tired most days?"
  options: string[];
  current: string; // the value on file
  since: string; // validFrom of the open row
  why: "due" | "draw" | "action" | "event" | "gain";
}
export function dueFacts(
  m: ModelInput,
  rows: {
    key: string;
    value: unknown;
    validFrom: string;
    revisitAt: string | null;
  }[],
  triggers: {
    newDrawSince?: string;
    adopted?: string[];
    eventTags?: string[];
    gainKeys?: string[];
  },
  today: string,
  max = 2,
): DueFact[];
```

Order: `gain` first (a symptom or conditional fact that `nextMoves` puts
in the top moves right now), then `draw` (cycle phase, coffee before the
draw, when a reading arrived after the fact's `validFrom`), `action`
(an adopted protocol item that touches the fact: "cut coffee after 14:00"
→ `coffee_last_hour`), `event` (a life event tag: pregnancy → cycle,
menopause, weight; illness → symptoms), then plain `due`. Never more
than `max` a day; never a fact whose `revisit_at` is in the future
unless the reason is `gain`, `draw` or `event`. Re-ask wording is
derived, not written per fact: "Still {value-lowercased}?" for options,
"Still {value}?" for numbers, with the original question one tap away.

## 2. "Still true?" one tap

On the Home check-in card and inside the composer (section 3), a due
fact renders as one line: question, then three chips: **Still yes /
Still 16:00** (confirm), **Changed** (opens the options inline; saving
calls `/api/facts` with `kind: "changed"` and a date defaulting to today
with "since when?" as a date input), **Not now** (skip 30 days). Confirm
and skip go through a new `POST /api/facts/revisit { key, action:
"confirm" | "skip" }`.

## 3. The composer

A round "+" button, always visible: fixed bottom-right on desktop, the
centre slot of the mobile bottom bar in `top-nav.tsx`. It opens a modal
(native `<dialog>`, `showModal()`; ponytail: no portal library) titled
"What's new?" with a textarea (auto-grow, placeholder: "a symptom, a
habit, a number, something a doctor said…"), the chip strip under it,
and a Post button. Esc or backdrop closes; an unsent draft survives in
`sessionStorage`.

### 3.1 Live "understood" chips

While typing, after 400 ms idle and ≥ 6 characters, `POST /api/compose
{ text, draft: true }`. The server runs `understand(text, m)` and returns
chips:

```ts
// lib/compose.ts
export interface Chip {
  kind: "fact" | "symptom" | "reading" | "event" | "phenotype" | "unknown";
  key: string; // fact key, metric code, life-event kind, HP id
  label: string; // "tired · afternoons", "glucose 98 mg/dL", "last coffee 16:00"
  value: unknown;
  date: string; // YYYY-MM-DD the fact starts holding (today unless the text says otherwise)
  quote: string; // the words it came from
  confidence: number; // 0–1
  by: "rule" | "model";
}
export function understandRules(
  text: string,
  m: ModelInput,
  today: string,
): Chip[]; // pure, tested
export async function understand(
  text: string,
  m: ModelInput,
  opts?: { model?: boolean },
): Promise<Chip[]>;
```

Two layers, rules first, the model only for what rules left:

1. **Rules** (pure): numbers with units mapped through `lib/units.ts`
   and the metric catalog ("glucose 98", "weight 82 kg", "BP 128/82",
   "slept 6h", "waist 94"); clock times against the timing facts
   ("coffee at 16", "last coffee 4pm", "in bed by 23:30"); relative and
   absolute dates ("since Monday", "for two weeks", "yesterday", "on 12
   Aug") → `date`; option words for every `PROFILE_QUESTIONS` entry
   (a small synonym list per option, e.g. `sym_energy: Yes ← tired,
exhausted, no energy, fatigue`); symptom phrases the rules do not
   know → `searchTerms` (HPO only, score ≥ 0.6) → `phenotype` chips.
2. **Model** (only when the draft has words no rule consumed): one
   `generateObject` call with a zod schema whose keys are closed
   (`enum` of fact keys, metric codes, life-event kinds, plus `HP:`
   ids from the `searchTerms` candidates passed in), each chip with a
   verbatim `quote` that must appear in the text (server-checked; chips
   with a missing quote are dropped). Never invents a key. Skipped when
   the model is off; the box works on rules alone.

Chips render with a dashed outline while `draft`, solid once posted.
Tapping a chip opens a tiny editor (value from the fact's options or a
number input, date input, remove). A `phenotype` chip shows the HPO name
and "a finding the engine reads".

### 3.2 Posting

`POST /api/compose { text, chips }` writes, in one transaction:

- `fact` and `symptom` chips → `writeFact(userId, key, value, { date,
source: "user", note: quote })`, `kind: "changed"` (a corrected edit
  stays on the fact's own edit buttons; the composer never rewrites the
  past).
- `reading` chips → `readings` with `source: "self_reported"` (the
  existing `sourceKind`/flags column; check `db/schema.ts`), dated by
  the chip, so a home glucose or a bathroom-scale weight is a real dot on
  `/m/[code]` with a hollow marker.
- `event` chips → `life_events`.
- `phenotype` chips → `writeFact(userId, \`hp:${id}\`, "present", { date })`;
`lib/wake.ts`trigger 4 (HPOA) must read`hp:_`facts as phenotypes
alongside symptom features (check`lib/hpoa.ts`; add if it only reads
`sym\__` today).
- the post itself → `checkin_posts { id, user_id, text, chips jsonb,
follow_up jsonb null, reply text null, created_at }` (migration).

Then `recordBeliefs(userId)`, and the reply (3.3, 3.4).

### 3.3 Follow-up: only when it changes something

```ts
// lib/compose.ts
export function followUp(
  chips: Chip[],
  m: ModelInput,
  catalog: Catalog,
  graph: Graph,
): FactQuestion | null;
```

At most one question per post, chosen in this order, first hit wins:

1. **Clarifier**: a small table `CLARIFIERS: Record<factKey, { key,
question, options, when: (chips, m) => boolean }>` for facts whose
   meaning depends on one more detail and that detail feeds a rule or an
   edge. Start with six: `sym_energy` → `energy_when`
   (Mornings / Afternoons / Evenings / All day) and, if the text gave
   no duration, `sym_energy_duration` (Under a month / Over a month;
   "over" is what sets `sym_energy = Yes`, "under" stores the post but
   not the symptom); `sym_weight` → amount and since when; `sleep_snoring`
   → witnessed apnoea; `sym_cycle` → cycle length; a `reading` of
   glucose → fasting or after a meal (`glucose` vs `glucose_pp`); a
   `phenotype` chip → "since when?" when the text gave no date.
2. **Conditional**: `conditionalAsks(m, graph)` filtered to edges whose
   nodes touch what the post changed (tired in the afternoon + no
   `coffee_last_hour` on file → ask coffee; the `energy_when` answer
   is what makes the edge relevant, so add `when_.fact` clauses on the
   caffeine edges: `energy_when in [Afternoons, All day]`).
3. **Gain**: `nextMoves(m, catalog, { max: 6 })` questions whose feature
   is linked (via `hkb_evidence`) to a condition whose belief moved
   ≥ 5 points because of this post, and whose gain is above the QUIET
   floor. Nothing else: a post about a bruise must not trigger the whole
   questionnaire.

The follow-up shows inside the modal as one line with option chips.
Answering it calls `/api/facts` (or `/api/compose` again with the answer
as text, when free), updates `checkin_posts.follow_up`, and re-runs the
reply.

### 3.4 The reply: computed first, then one paragraph with memory

`replyPack(userId, post)` collects, all from code: the chips written with
their dates; which conclusions moved (`ledger` diff before/after, with
the KB features that did it); the graph edges that became active or
changed because of this post (`computeGraphState` diff; e.g.
`behavior:coffee_after_15` with its mechanism text and source from
`kg_edges`); one suggestion, chosen as the highest-grade
`hkb_interventions` row or edge action for the moved node, with its
grade and basis; and **memory**: the last five `checkin_posts` (text and
chips) and every fact on file that the reply touches, with the date it
was said ("you said on 12 Aug: last coffee 16:00").

The LLM gets the pack and writes ≤ 3 sentences: acknowledge in the
person's own words, one mechanism sentence from the edge text, one
suggestion with its grade. Prompt rules: only numbers, names and dates
from the pack; no diagnosis words the ledger does not carry; no
questions (the follow-up is separate). Model off → the pack rendered as
three plain lines. Stored in `checkin_posts.reply`.

Example the owner gave: "I feel tired" → follow-up "When in the day?" →
"Afternoons" → `coffee_last_hour` unknown → "What time is your last
coffee?" → "16:00" → edges: caffeine half-life ~5 h (CYP1A2 slow allele
if on file: longer), late caffeine cuts deep sleep (Drake 2013), the
14–16 h circadian dip, a large lunch's glucose dip → reply names the
likeliest of these for this person and suggests moving the last coffee
before 14:00 for two weeks and posting how the afternoons feel. Add the
mechanism edges that are missing for this path to `lib/graph.ts` or
`kg_edges` with sources and grades (caffeine → adenosine receptor
blockade; caffeine → sleep latency and slow-wave sleep; CYP1A2 rs762551
→ caffeine clearance; post-prandial glucose dip → fatigue; caffeine →
appetite/ghrelin only if a graded human source is found, otherwise leave
it out).

## 4. Home: the check-in card

The first card in the cockpit, above the ledger, titled "Today":

- the due re-asks from `dueFacts` (max 2) as one-tap lines (section 2);
- the last post's reply, if any, in one line with its date, and "Post"
  which opens the composer;
- nothing else. When nothing is due and there is no post, the card is
  one line: "Nothing to ask today. Post anything with +."

`/history`: posts appear in the list as kind `POST` (text, chips
count) and on the facts lane as small dots; confirmations as ticks.

## 5. Evals

- `lib/compose.test.ts`: `understandRules` on 25 fixed sentences
  (numbers with units, times, relative dates, option synonyms, two HPO
  phrases against a fixed term list, one sentence that must produce no
  chip), `followUp` on the tired/afternoon/coffee path and on "bruise"
  (no follow-up), `dueFacts` ordering and caps.
- `lib/revisit.test.ts`: cadence math, never-facts, draw/action/event
  triggers, the daily cap.
- `evals/compose/cases.json` + `pnpm --filter simple eval:compose`: 12
  free-text posts with expected chips and expected follow-up key, run
  twice (rules only; rules + model), results to `evals/results/`,
  pass when the model layer adds chips without contradicting any rule
  chip. Two cases are for Ramona's account shape (female facts).
- One journey: `evals/journeys/interview_fatigue_coffee_m41.json`
  where the truth answers `sym_energy` Yes, `energy_when` Afternoons,
  `coffee_last_hour` 16:00 and every lab typicalNeg; expect no condition
  above possible, the coffee edge active, and the journey to stop
  `exhausted` within 5 steps (the engine must not chase fatigue into
  labs when the timing explains it).

## 6. Verification

typecheck, full test suite, `eval:compose`, `eval:journeys` (21/21),
screenshots to `/tmp/p20/`: the "+" button on Home (desktop and 390 px),
the modal with draft chips while typing "tired in the afternoons since
last week, last coffee at 4pm", the follow-up line, the reply, the Today
card with one "still true?" line, `/history` with a POST row. Report
files changed, outputs, deviations, every edge added with source and
grade, and the exact prompt used for the reply.
