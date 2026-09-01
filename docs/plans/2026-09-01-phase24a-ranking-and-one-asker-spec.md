# Phase 24a: rank by certainty, ask in one place

From the UX audit (`2026-09-01-ux-audit.md`, findings 1 and 2). Owner
approved the order 2026-09-01. Everything in `apps/simple`. Ponytail.

## 1. Ranking respects certainty

Today `lib/ledger.ts` sorts conclusions by `matters = score × lensWeight`
(lines ~195 and ~828). Under the default lifespan lens a 49 % risk score
with weight 3 outranks a 92.6 % confirmed iron deficiency.

New rule, pure and tested (`rankKey(c)`):

1. **State band first**: confirmed › likely › possible › marker-off ›
   unlikely. (Ruled-out stays hidden as today.)
2. **Within a band**: `score × lensWeight`, then probability, then title.
3. **Risk-states** (`ascvd_risk`, `cancer_screening_due`,
   `low_fitness_sarcopenia`, and any condition whose catalog row is
   flagged `kind: "risk"` — add that optional flag to the catalog shape
   and set it on those three with a one-line reason each) never outrank
   a _disease_ in the same band; they sort after diseases of equal
   band.

The "spear" (first card) follows the same order. Journeys and evals do
not read the ledger order, so nothing there moves; `ledger.test.ts`
gets: confirmed-beats-possible under every lens; risk-state-after-disease
in the same band; lens still reorders within a band.

## 2. Risk grammar

Risk-states render with a `RISK` chip in place of the state chip and a
title of the form "Cardiovascular risk: raised" / "Screening: overdue" /
"Fitness: low", never "Atherosclerotic risk: possible". The state word
map for risk-states: possible → "raised", likely → "high", confirmed →
"very high", unlikely → "low". One map in `lib/ledger.ts`, used by Home,
`/graph` panel and `/plan`. Test the map.

The `/graph` page sizes condition bubbles by belief × lens and sizes
test bubbles by information gain; the legend must say so
("test size = how much it would settle"), and the OGTT bubble gets the
"worth testing" outline colour rather than the condition outline.

## 3. One asking surface

Rules:

- **The Today card on Home is the only place that renders an input for
  a question.** It shows the single best question by information gain
  (existing `dueFacts` / `nextMoves` question logic), with the combined
  effect line: "moves Insulin resistance 64 → 81, High blood pressure
  35 → 49, MASLD 40 → 20" (sum the per-condition deltas the graph panel
  already computes; dedupe by question key).
- **Every other place** (condition cards on Home, `/plan` "answer these
  first", `/graph` "questions that change the picture", `/review`
  profile questions) renders the question as one line with the effect
  and a link/anchor to the Today card: "1 answer would move this →
  Answer". Never a second input. `/feel` keeps its full questionnaire
  (it is the "answer all twelve now" page and says so).
- **Counters unify**: the Home counter becomes "N questions worth
  answering" where N = the engine's current ask list length (the union
  the Today card draws from), and links to the Today card. Remove the
  "each one changes a conclusion" wording when N = 0 (show nothing).
- **HBP card duplicate**: the "(free)" test chip that repeats the same
  question is removed wherever a question move duplicates a fact
  question already shown.
- **Graph panel dedupe**: one entry per question key with all deltas.

Lock: a render-level test (React Testing Library is not installed —
use a pure helper `askSurfaces(pageModel)` that returns
`{ inputs: string[], links: string[] }` for a page and assert at most
one input per question key across Home; the page components read the
same helper so the test is real), plus the ledger tests above.

## 4. Verification

typecheck, vitest (985 baseline; higher), `eval:journeys` 25/25
(unchanged), screenshots to `/tmp/p24a/`: Home top for the test user
(one Today question with the combined line, cards showing the link
form), `/graph` panel deduped, `/plan` with the link form, a risk card
with the RISK chip. Report files changed, the exact rank function,
before/after order for the owner's and Ramona's belief sets (compute
from `belief_snapshots` in the local DB copy), deviations.
