# Phase 31a: what the owner hit on the first evening with the rewrite

Date: 2026-09-02, evening. Branch `simple`, app `apps/simple`. Owner tested
on localhost:3001 in the dark theme. Every item here is a bug or a reading
defect to fix in code; the designs for the new pieces are in
`2026-09-02-phase31b-designs-spec.md` and are not part of this slice.

## 1. The thread fails on the second turn

Two threads (`1115b1bc…` "What is my LDL and how can i improve it?" and
`4a33e246…` "why am i still at risk…") stored a plain-text first answer and
then an **empty** assistant row for the follow-up ("how can i improve it?",
"what should they be? … what is the reference?"). The client showed "An
error occurred." Nothing reached the dev log because the server was
restarted after. Reproduce on the owner's account on the local database
(mint a session cookie the way earlier slices did, restore afterwards),
replay the same two turns against `POST /api/chat`, capture `[thread]
failed:` with the full error and provider response. Likely suspects, in
order: a tool (`offer`, `plan_retest`, `record_fact`) throwing on real
data that the fixture never had; the follow-up shape making the model emit
something the OpenRouter/Gemini path rejects; a stored `user` row whose
`model` content is a string rather than parts. Fix the cause, and make the
failure visible: on error the client prints the server's message, the
server logs the provider body, and the assistant row is not saved empty
(save nothing, so a retry starts clean). Add an `eval:thread` case that
runs the owner's two turns on the fixture and asserts a second answer.

## 2. "There are no interventions on file for improving your LDL"

The composer's one-shot answer to "how can I improve my LDL?" said there
were no interventions, while Home lists three for LDL under Cardiovascular
risk. Cause: `askCandidates` / `MAX_TESTS` in `lib/lookup.ts` fills the
closed set from moves before the marker asked about (parked from 28c, now
in scope). Fix: when the question names a marker or a condition, reserve
slots for every intervention and test tied to that marker's system and to
the conditions it feeds, before the general moves fill the rest. Add
`eval:ask` cases: "how can I improve my LDL?" must name at least two
interventions from the LDL / cardiovascular set; "what should my fasting
insulin be?" must print the optimal band and the reference range.

## 3. "Answer →" on a card does nothing

Clicking Answer on "Are you unusually thirsty…" (Insulin resistance card)
went nowhere. `AskLink` builds `/?ask=<key>#today-question` and Home renders
the box only when `homeAskPlan` picks the key. Reproduce with the real key
from the card, find why the box does not render or scroll, fix, and add a
test: for every ask the ledger prints, the link's key yields a rendered
question box on Home.

## 4. Family history is asked again on Plan

Plan's "Answer these" shows "Any heart attack, stroke, diabetes, dementia or
cancer in your parents or siblings?" although the answer exists (it is the
FOR line on the Insulin resistance card). Find why `queueQuestions` or
`profileQuestions` still lists `family_history` when a fact exists and its
`revisitDays` (365) has not passed; fix; test with a fact dated today.

## 5. The LDL goal is a range, the ruler draws a point

Goal 70–100 by Dec 1 2026. The ruler hatched from 131 to 100 and labelled
"target 100". The owner expects the goal band itself. Fix in `Ruler` and
`HistoryChart`: a goal with both bounds draws as a band ("target 70–100 ·
Dec 1 2026"), the hatched stretch runs from the value to the nearer edge of
the band, the projection aims at that edge, the legend says "target 70–100
mg/dL by Dec 1 2026". A one-sided goal keeps the tick. Tests for both.

## 6. Chart marks have no hover

Every diamond and ruler mark gets a `<title>` ("Apr 23 2026 · 131 mg/dL ·
off") so a hover shows the value, and a CSS-only hover label (`.hist
.mark:hover + .lbl` or equivalent, no JS) prints date and value next to the
mark. Reduced-motion safe; the locks stay green.

## 7. The chart's left gutter

The `mini` chart keeps the y gutter even though it prints no ticks, so its
plot starts 55 px in while the right edge is flush. `mini` gets no left
gutter; the full chart's gutter is exactly the width of its widest tick
label plus 8 px, measured from the label's character count.

## 8. "needs a check" on an upload with nothing to check

`needs_review` is set only by `import-legacy.ts` and nothing reads or
clears it. Stop printing it as a state; an upload's state is `parsed`,
`failed`, or `reading`. The upload row prints the date once: the draw date
if the file carries one, else the read date, never both.

## 9. The genome ledger card and the genome table

Home's "What your genome changed" and the upload's genome table print
"HLA no DQ2.5 or DQ8 tag", "rs429358 · rs7412", "e2/e3", and an LR sentence.
Per 31b's design (approved tomorrow), the code side now: each gene row gets
a verdict line first, written from the catalogue's effect and the person's
call ("Coeliac disease: essentially excluded, no test needed"), the rsids
and genotype move behind a disclosure or a `<Term>` tooltip, and the
"what it moved" column becomes the verdict. Do not wait for the mockup for
the data shape; expose `verdict`, `detail`, `rsids`, `genotype` on the row
so the 31b markup can bind to it.

## 10. "Popular right now" shows sardines twice

Two trend rows from two of the owner's own posts are the same claim. Merge
trend rows whose claim normalises to the same subject; print "mentioned
twice" instead of two cards.

## Constraints

Same as phase 30: no `docs/mockups` edits, no commit or push, no new
dependencies, locks green, no secrets printed, `pnpm typecheck` and `pnpm
test` green, `pnpm eval:ask` and `pnpm eval:thread` run and reported.
Screenshots of every touched surface at 1440 and 390 into `/tmp/p31a/`,
looked at. Report per item: cause, fix, test.
