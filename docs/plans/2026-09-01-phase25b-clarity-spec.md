# Phase 25b: clarity — would your mother get it?

Owner review of phase 24 (2026-09-01). The structure is right; the
words, the type and a few layouts still assume the reader is the
engine's author. Runs AFTER 25a. `apps/simple`. Ponytail. Design
references: the two motion/interface skills already in the repo, plus
`ui-lego` for borrowing a tooltip/popover pattern from shadcn (copy
CSS, no library).

## 1. A glossary, everywhere a term appears

`lib/glossary.ts`: one entry per term the pages print — ALP, ALT, AST,
GGT, TSH, free T4/T3, TPO antibodies, HbA1c, HOMA-IR, fasting insulin,
hs-CRP, ApoB, Lp(a), LDL, HDL, non-HDL, triglycerides, ferritin, RDW,
RBC, cortisol, creatinine, eGFR, vitamin D, B12, folate, AMH, SHBG,
PhenoAge, likelihood ratio, grade A–E, "risk state", each with:
`what` (one plain sentence), `why` (one sentence, reuse the vector's
`why` where it exists), `unit` and `where` ("on any basic blood panel").
`<Term>` component: dotted underline, 40 px hit area, tooltip on hover
and on tap (mobile), positioned with the shadcn tooltip CSS. Every
metric code and abbreviation rendered on Home, Plan, Graph, Labs, /m
goes through `<Term>`; a test walks `glossary` keys against the
metric catalog names to catch missing terms. The biological-age line
becomes: "Missing one number: <Term>ALP</Term>, a liver enzyme on any
basic blood panel. Upload a lab."

## 2. Type discipline

Two families, four styles, one rule: **monospace is for numbers,
units, codes and dates only — never for a sentence.** Effect lines
("moves Hashimoto's 93 → 95"), "matters most for energy (A)", "was
likely → likely", "On track: …", "Never measured: …", "Next: …" all
become sans body text with the numbers in mono spans. Define the four
styles in `globals.css` as utility classes (`.t-title`, `.t-body`,
`.t-meta` (muted sans, 13 px), `.t-num` (mono, tabular)) and replace
ad-hoc `font-mono text-[10px] text-neutral-400` combinations across
`components/`. Lock: a vitest that fails on any `font-mono` class
applied to an element whose text content is not a number/unit/code in
the rendered Home for the test user (render to string, walk mono
spans, regex).

## 3. Systems row

12 cards in one row truncate names and values. Layout: a wrapping grid
(6 per row on desktop, 3 on mobile), each card: ring, full system name,
the one marker that drives the colour on its own line with its value
and unit (no truncation), status chip. Tap → `/m/<code>` of that
marker. Mobile Home is crowded: cockpit tiles stack 2×2, key trends
collapse to one chart with a switcher.

## 4. Words a person understands

- `WHY` / `NOT RIGHT?` → one row of two quiet buttons with icons:
  "Why?" and "Something's off?" (40 px, `.t-meta`).
- Plan: "NOT YET" → "Test that would confirm it: OGTT with insulin";
  "The whole pattern" → "See how this connects"; the patterns block
  gets a one-line intro "Two or more findings that usually travel
  together". "8 of 18 facts" → "8 of 18 questions answered".
- Ask result: lead with the sentence about _you_ ("Type 2 diabetes is
  unlikely for you: 13 %, up from a 9 % base rate"), then "What would
  settle it" as three short rows; ring/MONDO/base-rate lines go under a
  "details" disclosure. Never "Ring 1: scored for everybody".
- Today card: section labels "Still true?" / "One question" / "You
  noted"; the re-asks show the question text (25a) and the buttons say
  "Still yes" / "It changed" / "Skip".
- "Since Aug 31: 2 new" → "2 new since yesterday".

## 5. One place to ask or tell

The composer becomes "Ask or tell": typed text that is a question gets
the grounded answer from 25a inside the modal; a statement gets chips
as today. The Home "Ask" box moves to the top of the page as a single
line that opens the same composer with the text prefilled (one asking
surface, principle from 24a, now also for questions). Discuss on a
card opens the composer prefilled with "About <condition>: " so it is
the same chat with the same memory.

## 6. Lock and verify

typecheck, vitest (higher), eval:journeys 25/25, eval:compose 14/14,
the glossary coverage test and the mono-discipline test; screenshots to
`/tmp/p25b/`: Home desktop and 390 px, a tooltip open, systems grid,
Plan patterns block, the Ask-or-tell modal answering "how do I avoid
type 2 diabetes?" with the grounded answer; a Before | After table of
every copy change.
