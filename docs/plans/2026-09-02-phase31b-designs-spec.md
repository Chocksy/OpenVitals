# Phase 31b: designs for what makes the app useful, for review tomorrow

Date: 2026-09-02, evening. Mockups only, under `docs/mockups/v4/`, in the
approved design system (`system.html`, `system.css`). Nothing under `apps/`
changes in this slice. The owner reviews in the morning; every page ends
with "Where the numbers come from" and a "Build cost" note (what data
exists, what does not, what the engine must gain).

Owner's words, verbatim intent: the genome ledger is hard to understand and
does not answer whether to test for coeliac disease; the upload detail
looks good but says nothing about what to do; the plan should be
actionable ("today and over the next month I need to train like this and
eat that and take these supplements"); show new papers relevant to the
person or lifestyle, with real research flowing in; move the iOS app to
the design system as a native app with exactly this data, not a webview;
the app uploads Apple Health and food photos, show those; "let's move the
usefulness of the thing further".

## Pages to draw

1. `research.html`: the research surface. A "New for you" panel (Home and
   Plan carry a compact version): papers and guideline updates matched to
   the person's conditions, markers and adopted actions, each with title,
   journal, date, the grade the intake gave it, one sentence of what it
   found, and "what it would move" (which conclusion, which direction, by
   how much, or "nothing for you"). A per-condition "Research" tab on the
   Plan pattern disclosure. A "Research now" control (the HKB research run
   that already exists, run for one condition). A source line naming the
   feed (the existing HKB research runs today; PubMed / OpenAlex / bioRxiv
   watch lists as the build-cost note explains). Empty state: "no new
   papers since Aug 1 for your conditions".
2. `plan-month.html`: the actionable plan. A month strip with today, each
   day carrying its dots (training, supplement, food rule, draw, check-in
   due); a day column "Today" listing what to do in order with times
   (morning sunlight, breakfast + selenium, walk after the largest meal,
   resistance session, evening D3), each a tick; "This week" with the
   three training sessions placed; "Every day" rules (protein and fibre
   first, 10 000 steps); "Supplements" as a schedule table (what, dose,
   when, with what, until); "Coming up" (draw on Nov 24, retest TSH). Ticks
   feed the existing 30-cell adherence strip. A 390 frame where Today is
   the screen.
3. `genome.html` (revise the existing page): answer first. One card per
   condition the genome speaks to: "Coeliac disease: essentially excluded ·
   no test needed" with the reason in one line; "Type 2 diabetes: +40 %
   background risk from one TCF7L2 allele · lifestyle erases most of it".
   Then the gene list with verdict, gene, and the rsids / genotype behind a
   hover tooltip or a disclosure. The Home ledger card "What your genome
   changed" shows only the three verdicts that moved something.
4. `blood.html` upload detail (revise the section): a read receipt: file,
   what was read (16 variants, 11 with a known effect), what it moved, and
   one line "nothing for you to do" or the one thing to do; the genome
   table per 3; the date once.
5. `ios.html`: the native app. Phone frames for: Today (the sentence, the
   Status / Body / Blood / Plan cards as native cards, the rail), Body (the
   Apple Health day list with sources), Meals (what a food photo becomes: a
   meal card with the photo, recognised items, an estimate label on every
   number, what it moves, "not a scale"), Capture (photo of a lab, photo of
   food, ask or tell), Plan (the Today column of 2), Settings (Health
   permissions per system section 03). A data contract table: screen →
   endpoint → fields, marking which endpoints exist (`/api/sync/healthkit`,
   `/api/capture`, the pages' loaders) and which must be added.
6. `chart-hover.html`: the hover card on chart marks and rulers (date,
   value, unit, state word, "was"), desktop hover and phone tap.

Also add these to `system.html`: the meal card, the paper row, the month
strip and day column, the schedule table, the verdict row.

## Constraints

Plain HTML + CSS on `system.css`, hand-drawn SVG, lucide inline icons, no
seeds, no decorative data (reuse the owner's real values from the existing
pages), contrast AA, screenshots at 1440 and 390 into `/tmp/p31b/`, looked
at. Link every page from `index.html` under "Next". Report: files, what each
page needs from the engine that does not exist yet, and the open questions
for the owner.
