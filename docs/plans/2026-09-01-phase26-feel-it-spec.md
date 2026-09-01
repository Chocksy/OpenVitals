# Phase 26: I used the app. Here is what hurt.

Main agent, 2026-09-01, signed in as test-newuser on the dev server and
did what a curious person does. Every item below was reproduced, not
inferred. `apps/simple`. Ponytail, but the answers must become useful.

## What hurt, in the order a person meets it

1. **Top line → no submit.** Typing "what's my cholesterol?" and
   pressing Ask opens the composer with the text and the hint "That
   reads like a question. Press Ask." — a second click. Same from
   Discuss. Fix: opening with a prefilled question submits immediately
   (show the question as a chat line, then the answer); "Ask another"
   clears and focuses; Enter submits; the top line's own button is
   the only Ask the person presses.
2. **Every question answer starts with a lie.** The question route
   still runs the ontology lookup on the extracted term and the UI
   prints its header: "Hypocholesterolemia: nothing in your data has
   been scored against it yet", "combined low LDL and fibrinogen: …",
   "Hashimoto thyroiditis: nothing in your data has been scored…" on
   a person whose Hashimoto's is _confirmed_ one card below. Fix: on
   the question route, render ONLY the answer (and, when a catalog
   condition was named, one row "Right now: Hashimoto's — confirmed,
   95 %" from `scoreHypotheses`, never the HPO/MONDO header). The
   lookup header stays for the term route.
3. **The answers say nothing.** "…reviewing these lab trends with a
   healthcare provider is the best way to determine an individualized
   plan." That is the `QUESTION_SYSTEM` prompt doing what it was told
   ("do not prescribe, do not name a dose"), which contradicts the
   owner's standing principle (dosing allowed, labelled). Rewrite:
   - **Ground it in the plan.** The prompt gets: the person's current
     plan actions for the named condition/marker (`reports` latest,
     `actions[]` with `kind`, `dose`, `timing`, `basis`, `evidence`,
     `targets`), the graded `hkb_interventions` rows for that condition
     (name, dose, duration, effect, grade, basis), the projections on
     file, and the same conclusions block as now.
   - **Answer like a sharp friend who is a doctor**, in this order and
     no more than 6 sentences: (1) what your numbers say, with the
     numbers; (2) what to do — 2 or 3 concrete actions from the plan
     or the interventions table, each with its label in brackets
     ("[science, A]", "[opinion]") and the dose when the source has
     one; (3) what to measure and when. No "discuss with your
     provider" filler unless the action genuinely needs a prescriber,
     and then say which one and why.
   - **Pick the model by eval, not vibes** (principle 6):
     `evals/ask/cases.json` with 8 questions on the test account
     (cholesterol, LDL how-to, "am I going to get T2D?", "how do I fix
     Hashimoto's?", "what should I eat?", "why am I tired?", "is my
     iron ok?", "what test next?") and a judge rubric (uses the
     person's numbers · gives concrete labelled actions · no invented
     values · ≤ 6 sentences · no filler). Run the current model, the
     strongest OpenRouter model available under ~$5/M output, and one
     mid-tier (list them from the OpenRouter models endpoint at run
     time; include `x-ai/grok-4.20` since it was prod's default);
     print the score table; set `AI_ASK_MODEL` to the winner (new env,
     falls back to `AI_DEFAULT_MODEL`). Report the table.

4. **Discuss plants a fake fact.** Discuss prefills "About Autoimmune
   thyroiditis (Hashimoto's): " and the composer's draft chips read the
   condition name as a _phenotype_ ("Hashimoto thyroiditis · a finding
   the engine reads · AI") — one tap of Post would write an `hp:` fact
   the person never stated. Fix: Discuss opens the composer in question
   mode with the condition as hidden context (`about: <conditionId>`),
   not as text; draft chips never run on a prefilled question; the
   answer is grounded in that condition's plan actions.
5. **"Add to protocol" does nothing you can see.** On the Hashimoto's
   card: no toast, no change, `/protocol` still shows only the three
   old items. A condition card has no plan action to add, so the
   button silently no-ops. Fix: the button reads what it will do —
   "Add 3 actions to your protocol" with the titles on hover/expand —
   and when the condition has no actions yet it reads "Get actions"
   and generates them (the report route scoped to that condition),
   then shows them. Always a toast with the count and an undo.
6. **Cards tell you what is wrong, not what to do.** "Selenium trial
   justified; keep ferritin >50 and vitamin D 40–60" is catalog
   shorthand. Add a **What to do** block to every likely/confirmed
   card: the top 3 actions for that condition (plan actions first,
   else graded interventions), each one line — action · dose/how ·
   label · what it should move by when — with "Add" per line and "Add
   all". The catalog `management` line stays as a quieter "Doctor's
   note". This is the same data the answers in item 3 read; one
   helper `actionsFor(userId, conditionId)` serves both.
7. **Plan → Answer is a one-way trip.** The link lands on Home, you
   answer, and you are still on Home with no toast. Fix: Plan's
   "Answer these first" answers inline (Plan is a legitimate asking
   surface; the one-input rule is per page, not per app). Home cards
   keep linking to the Today card. If a link ever crosses pages it
   carries `from=` and returns after the save.
8. **Tooltips clip at the edges.** Pure CSS centering. Fix: on
   hover/focus measure once and add `data-edge="left|right"` classes
   that shift the bubble and its arrow; also flip below when there is
   no room above. Tiny client hook, no library.
9. **The range bar lies by omission.** The value is not part of the
   scale (marks are the band bounds only) so 320 on a 0–34 band paints
   at the far edge with no number. Fix: include the value in the scale
   with a compressed tail beyond 2× the band (a visible axis break),
   and print the value beside the marker ("320 IU/mL") always, not on
   hover.
10. **Unmeasured test bubbles are dead ends.** CAC score: "Nothing
    drawn here pushes it / follows from it." Fix: a test bubble's
    panel says what it would settle ("Cardiovascular risk 43 % → 20 %
    if 0, → 70 % if > 100"), its cost band, and how to get it; test
    bubbles with no linked condition are hidden unless "worth testing".
11. **"Post" on the Today card** opens the composer but says nothing
    about what it is. Rename to "Tell or ask" or drop it (the top line
    exists).

## Locks

- `ask-answer` render test: on `route: "question"` the output contains
  no HPO/MONDO header string and no "nothing in your data has been
  scored".
- Composer: a test that a prefilled question never produces draft
  chips and that opening with `autoAsk` posts once.
- `actionsFor` unit tests (plan first, interventions fallback, grade
  order, dose passthrough); the ask eval table in `evals/results/`.
- Range-bar tests for the compressed tail and the label; tooltip edge
  helper tests; Plan inline-answer test in `asking.test.ts`.

## Verification

typecheck; vitest (1140 baseline, higher); eval:journeys 25/25;
eval:compose 14/14; eval:ask-intent 6/6; the new `eval:ask` table with
the chosen model; then repeat MY session on the dev server with
`agent-browser` as test-newuser (password `feel-the-app-1`) and paste
the dialog text for: "what's my cholesterol?" from the top line (one
click), "what should I do to lower my LDL?", Discuss on Hashimoto's
"how do I fix it?", "Add to protocol" on the Hashimoto's card (toast +
/protocol after), Plan → answer inline, hover a term at the left edge
(rect inside the viewport), the CAC bubble panel. Screenshots to
`/tmp/p26/`.
