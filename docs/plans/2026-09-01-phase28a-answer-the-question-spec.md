# Phase 28a: answer the question that was asked, and quieter labels

Owner, after phase 27 (2026-09-01). `apps/simple`. Ponytail.

## 1. The answer ignores the question

"Will I ever be able to solve this? What does the research say?" got the
numbers → actions → measure template, i.e. the same answer as "how do I
fix it?". The prompt forces one shape on every question. Fix:

- **Question kinds**, decided in code (`lib/ask-intent.ts`, pure,
  tested): `status` ("what's my X", "am I ok"), `howto` ("how do I",
  "what should I do"), `prognosis` ("will I ever", "can this be
  cured/reversed", "is this permanent", "what happens if"), `research`
  ("what does the research/science say", "is there evidence", "how
  strong"), `why` ("why is X high", "what causes"), `next-test` ("what
  test next", "what should I measure"). Default `howto`.
- **Shape per kind.** `status`: numbers + one line of meaning, no
  actions unless asked. `howto`: today's shape. `prognosis`: what the
  literature says about the course (reversible / manageable / chronic
  with what kind of control), what in _their_ numbers argues either
  way, then at most one action. `research`: the strongest graded rows
  for the named condition — evidence rules and interventions with
  grade, source (paper/guideline name, year) and effect where known —
  in two or three sentences, plus how sure the field is (A/B vs C–E),
  no actions unless asked. `why`: the mechanism edges from the graph
  (`kg_edges` mechanism text) that touch the marker, in plain words.
  `next-test`: the top information-gain moves with what each would
  settle ("HbA1c: T2D 30 % → 92 % if high, → 5 % if normal") — this is
  the case the eval scored 2/5.
- **Candidates per kind.** `research`/`prognosis` prompts receive
  `hkb_evidence` rows (feature, LR, grade, source) and
  `hkb_interventions` (name, effect, grade, source) for the named
  condition, top 8 by grade; `why` receives the graph edges; the model
  may only cite what it is given (guard as in 27: every source string
  in the prose must appear in the candidates, else it is dropped from
  the "Sources" line the UI shows under the answer).
- **UI**: a "Sources" line under research/prognosis answers listing the
  cited papers/guidelines (name · year · grade), each a `<Term>`-style
  hover with the quote when the row has one.
- **Eval**: `evals/ask/cases.json` gains one case per new kind
  (prognosis and research for Hashimoto's, why for LDL, status for
  ferritin, next-test stays). Judge rubric gains "answers the question
  that was asked (not a template)". Re-run the table.

## 2. Labels: icon, not the word

`[opinion]` / `[science, A]` printed after every action is noise. One
`<EvidenceChip>`: a small glyph + optional grade letter, colour by
basis, tooltip from the glossary ("Science, grade A: meta-analysis or
guideline"). Glyphs: science → filled circle, opinion → half circle,
anecdotal → hollow circle; grade letter beside it for science only.
Replace every printed bracket label (answers, Act-on-it chips,
What-to-do lines, plan cards, horizon shelf) with the chip. The answer
prose from the model keeps its bracket labels internally (the guard
reads them) but the renderer swaps them to chips inline. Test: no
rendered Home/Plan string contains `[opinion]` or `[science`.

## 3. Focus ring

The textarea's 2 px blue ring is loud. One focus style for every
input/textarea in `globals.css`: 1 px border darkening one step plus a
soft 3 px outer glow at 20 % of the accent, `transition-property:
border-color, box-shadow`. Keep `:focus-visible` for keyboard users
(same look, so nothing is lost).

## 4. The Ayurveda row

`hkb_interventions` holds "whole system Ayurveda protocol" for
hashimoto at grade B, so answers offer it as science. Read the paper
row (PMID 39798266) and the policy in `lib/hkb-policy.ts`: if the
design is a small single-centre trial, the policy should have said C;
if the policy is right and the trial is a real RCT, leave the grade but
make the intake record `population`/`n` so the answer can say "one
trial, n=…". Report which it is; change the policy rule, not the row
by hand, if the policy is wrong.

## 5. Verification

typecheck; vitest (1240 baseline, higher); eval:journeys 25/25;
eval:compose 15/15; eval:ask with the new kinds (paste the table);
browser: "will I ever be able to solve this? what does the research
say?" on Hashimoto's → a prognosis/research answer with a Sources line
and no template; "what test next?" → the settles-what answer; a card
with chips instead of brackets; the focus ring. Screenshots to
`/tmp/p28a/`.
