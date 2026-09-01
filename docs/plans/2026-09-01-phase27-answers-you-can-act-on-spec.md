# Phase 27: answers you can act on

Owner, after phase 26 (2026-09-01): the answers are good now; make
them actionable — "add supplements to plan", "add lifestyle change",
plan the next blood markers — with buttons that are dynamic per answer.
Plus one bug: while the question is being asked, the question line AND
the textarea (still holding the text) both show. `apps/simple`.
Ponytail. Principle 3: the model chooses from candidates the engine
gives it; the engine owns every button.

## 1. The duplicate while loading

When the composer auto-submits (or the person presses Ask), the
textarea is hidden and only the question line + a spinner show; after
the answer, the textarea stays hidden until "Ask another" (which
restores and focuses it, empty). Test in the composer's pure
state helper.

## 2. Structured answers

`answerQuestion` switches from `generateText` to `generateObject`:

```ts
{
  prose: string,                       // the six-sentence answer, unchanged rules
  actions: string[],                   // ids of candidate actions the prose used
  tests: { code: string; weeks: number }[],   // markers the prose says to measure
  questions: string[],                 // fact keys the prose says would help (optional)
}
```

Candidates come from what the prompt already receives: `actionsFor`
rows get stable ids (`plan:<reportId>:<index>` or `int:<interventionId>`),
the moves list carries codes and fact keys, `RETEST_WEEKS` gives the
default weeks per marker. Server-side guard: any id/code/key not in the
candidate set is dropped (and counted in the eval as a violation).
`AskAnswer` gains `acts: { actions: Action[]; tests: …; questions: … }`
with the human labels the UI needs (title, dose, label, target;
marker name; question text).

## 3. The "Act on it" row

Under the prose, one row of chips, dynamic per answer:

- **Add: Selenium 200 µg/day [opinion]** → `POST /api/plan/adopt` (the
  same call the What-to-do block uses), chip flips to ADDED, toast with
  undo; **Add all** when ≥ 2.
- **Plan retest: HbA1c in 12 weeks** → the existing retest-planning
  path (the "Plan retest" button on cards uses it; find the route,
  reuse it), chip flips to PLANNED; the Next draw tile updates on the
  next render.
- **Answer: family history** → closes the composer and opens the Today
  card on that question (`askHref(key)`).
- A test the person cannot self-order shows "Ask your doctor for: OGTT
  with insulin" with a copy-to-clipboard of the exact test name.

Same row under Discuss answers (they go through the same route). The
row is a client component; no DOM mutation (the 25a lock stays green).

## 4. Evals and locks

- `eval:ask` judge gains: every `actions[]` id ∈ candidates, every
  `tests[].code` ∈ candidates, prose mentions each returned action by
  name (string containment on the title's first three words), and a
  penalty when an action named in the prose is missing from
  `actions[]` (so the buttons match the words). Re-run the 3-model
  table; keep or change `AI_ASK_MODEL` by the result.
- `ask-answer.test.tsx`: the row renders one chip per act with the
  right verb; nothing renders when `acts` is empty.
- Guard unit tests for the closed-set filter.

## 5. Verification

typecheck; vitest (1201 baseline, higher); eval:journeys 25/25;
eval:compose 14/14; eval:ask table; browser session as test-newuser
(`feel-the-app-1`) on the dev server: ask "how do I increase my
ferritin?" → chips "Add: iron 60 mg…", "Add: vitamin D3 4000 IU",
"Plan retest: Ferritin in 12 weeks" → click Add on one → toast + it
appears on `/protocol`; click Plan retest → Next draw tile shows it;
screenshot the loading state (no duplicated text) and the answer with
its row to `/tmp/p27/`. Report the usual, plus the eval table.
