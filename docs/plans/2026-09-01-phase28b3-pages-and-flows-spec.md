# Phase 28b-3: the pages and the flows, in the new language

Owner, 2026-09-01, after 28b-2 was dispatched: "continue more
components. What about the graph, the labs page, the uploads page, the
menu, the mobile app structure, how we ask questions and discuss those
questions and results, how we plan blood work next, genome explanation,
research papers, anecdotal evidence? And the hero gradient works but
should adapt to what the data shows; we might not need orange for
all."

Still mockups. No app code. Companion to 28b-2 (`elements-v3.html`
covers single elements; this file covers whole pages and multi-step
flows). 28c implements what gets picked.

## Files

- `docs/mockups/pages-v3.html` + `docs/mockups/pages-v3.css`. Link
  `docs/mockups/v3.css` (created by 28b-2; do not edit it, wait for it
  to exist, put page-specific rules in `pages-v3.css`). Openable from
  disk. Dark toggle as in 28b-2. Anchors per section.
- Screenshots to `/tmp/p28b3/`, `NN-section.png`, 1440 wide light, the
  mobile ones at 390, dark for Blood and Graph.

## Rules carried over

No decorative data (every mark is nameable; illustrative numbers
declared once in a footnote with real shapes and units). Mono for
numbers, one accent per screen, CSS/SVG only. Real test-user values for
labs (as in home-v3). `/brain`, `/hkb`, `/admin` are windows and stay
as they are; they are not in this mockup.

## 1. Shell and menu

Three navigation variants, each shown once at 1440 and once at 390:

- **Top pills** (today's four: Home · Plan · Labs · Graph) restyled as
  tonal pills, with the rename **Labs → Blood** and a fifth **Body**
  (Apple Health) so the two data sources stop sharing one page.
- **Left rail**: Home / Body / Blood / Plan / Graph with the systems
  list underneath (status word each), the inspiration's layout; the
  content column stays at max 1040 px.
- **Mobile tab bar**: Home · Body · Blood · Plan with the **+** in the
  centre. Graph lives under Home on mobile ("See the map").

The **+ sheet** (what the floating button opens): four tonal rows with
glyphs, "Photo of a result", "PDF", "Photo of a meal", "Tell me
something" (opens the Ask pill in statement mode). The avatar menu:
theme, Apple Health status ("synced 2 min ago · 25 types"), sign out.

## 2. Blood (the labs page)

One page, not four tabs. Top: a **draws timeline** (dated diamonds with
marker counts, the same dot language as the hero strip; the next planned
draw as a hollow diamond in the future, "in 12 wk · 4 markers"). Then
**filter pills** (Off 7 · Borderline 4 · All 26 · By system). Then the
**markers grid** from 28b-2 grouped by system, each a compact card with
the mini ruler. Tapping one opens a **marker drawer** on the right (390
wide): the full ruler, the history as dots on a dated axis with the
projected target pace zone, "what it feeds" (conditions with the
change it would make), the retest cadence ("due every 12 wk · last
Aug 1"), Plan retest and Ask about this as pills. Phone data leaves
this page for Body. Uploads leaves for its own archive (§3). Show the
page, the drawer open, and the 390 stacked version.

## 3. Uploads (the archive)

A quiet list: each row a type glyph (PDF · photo · genome · phone
batch), the file name, the date, what was extracted ("15 markers · 2
worth a second look"), and a status word (read · reading · failed).
No approval gate anywhere (standing principle): the "second look" is a
count that opens a **detail view** with the source page image on the
left and the extracted values on the right, each with a small "fix"
affordance and the OCR confidence as a soft bar. Genome uploads get
their own row style ("612 variants read · 9 that change something for
you") linking to §7. A phone batch row reads "Apple Health · Aug 31 ·
1 214 samples · 25 types" and links to Body.

## 4. Graph (the bubbles)

Tonal circles sized by likelihood, coloured as light (green / amber /
rose gradient fills, no chips), labels inside the big ones and beside
the small ones; edges as thin lines at 20 % that brighten on hover with
the mechanism text in a small card ("TSH ↑ → Hashimoto's: LR 4.2 ● B,
Wichman 2016"). Filter pills: Conditions · Markers · Tests · Actions.
Tapping a node opens the same right drawer as §2: a condition shows
state, %, drivers, what to do; a marker shows its ruler; a test shows
"would settle" ("CAC: 43 % → 20 % if 0, → 70 % if > 100"). Mobile: the
graph as a list with tiny bubbles as bullets, drawer becomes a bottom
sheet. Show desktop with a drawer open and the 390 list.

## 5. Ask and Discuss: a thread, not a form

The Ask pill grows a **thread** below it. Show the flow as five frames:

1. **Idle**: the pill.
2. **Asked**: the person's line small and right-aligned; the answer
   block: "Right now: Hashimoto's — confirmed, 95 %", prose with inline
   glyphs, the **Sources** chips (name · year · grade), **Act on it**
   chips (Add · Plan retest · Answer · Ask your doctor · copy).
3. **Follow-up chips** under the answer, generated from the kind:
   "Why?", "What does the research say?", "What would change this?",
   "What test settles it?", "I already do this". Tapping one continues
   the same thread; the previous turn collapses to one line.
4. **Discuss from a card**: the condition pinned as a removable
   **context chip** in the pill ("About Hashimoto's ×"); the answer
   grounded in that card's plan.
5. **The engine asks back**: when a fact would change the answer, the
   answer ends with one question and quick-answer chips inline
   ("Family history of thyroid disease? Yes · No · Not sure"), and the
   next turn shows the **receipt card**: "Recorded: mother, Hashimoto's
   · moved Hashimoto's prior ×1.8 · Thyroid cancer screening unchanged".

Also a **statement** frame ("I already train 3× a week") with its
receipt ("Recorded: exercise 3 days/week · since today · Fitness low
28 % → 12 %, T2D 53 % → 47 %"), and a **thread history** list (past
questions, dated, one line each, reopen on tap). Mobile: the thread is
the whole screen, pill docked above the tab bar.

## 6. Plan blood work (the next draw)

A builder, one screen:

- **Suggested markers** from information gain, each a row: name,
  "what it settles" with the two-way delta ("HbA1c: T2D 53 % → 92 % if
  ≥ 6.5, → 5 % if < 5.7"), cost band (€ · €€ · €€€), fasting flag,
  a checkbox pill; grouped **Worth it now** / **Due by cadence** (with
  "due since …") / **Can wait**.
- **When**: a pill row (In 4 wk · 8 wk · 12 wk · Pick a date) with the
  date printed; the retest cadence explains the default.
- **Order sheet**: a printable/copyable card for the doctor with the
  marker names, the reason in one line each, and fasting instructions;
  a "Copy" pill.
- After planning: the **goal card** ("Next draw · Nov 24 · 4 markers ·
  HbA1c, fasting insulin, TSH, TPO") that the Home Next-draw tile shows,
  with "Add more" and "Done, upload the result" that opens the + sheet.

Show desktop and 390.

## 7. Genome explanation

Summary tile (variants read · with a known effect · that moved a
prior). A **gene card** per variant that matters: gene · rsid · your
genotype (mono) · how common ("31 % of Europeans") · effect glyph with
grade · **what it changes for you** in plain words · which priors it
moved ("T2D prior ×1.3, MASLD ×1.1") · the paper chip. Filter pills:
Moved something · Protective · All. A quiet caveat block in one
sentence ("A variant shifts a starting point; your numbers decide the
rest."). Show one full card, the list, and the 390 version.

## 8. Research papers (the science rows)

An **evidence card**: title, first author and year, journal, design in
plain words ("RCT, n = 62, 12 weeks" / "meta-analysis, k = 9"), grade
glyph, the effect as a tiny two-sided ruler (favours ← → against, with
the CI as the band and the point as the marker), the quote, **applies
to you because** (one line from the person's data: "your TPO is 320;
the trial's mean was 480"), freshness word (guideline · pooled ·
contested · horizon), and the link out. A **stack** header per
condition ("Hashimoto's · 12 rows · ● A 2 · ● B 4 · ● C 6 · ◐ 3"). Show
the card, a stack of three, and how the same card looks when it is the
source behind an Act-on-it chip (a compact inline version).

## 9. Opinion and anecdotal evidence

The two weaker tiers must look honest, not hidden:

- **Opinion** (◐): "who says it" line (podcast / clinician / book),
  the claim, the dose if stated, "what would upgrade this" (the study
  that would move it to ●), and the person's own outcome hook.
- **Anecdotal** (○): the source kind (forum · N=1 · testimonial), the
  claim, the same upgrade line.
- **Your own outcome outranks both**: when the person tried it, an
  **outcome card** ("You: selenium 200 µg · 12 weeks · TPO 320 → 280,
  −12 %") sits above the opinion row and is marked "you" with a
  distinct glyph.
- The **horizon shelf** (28b-2's sardines row) shown as a small row of
  three claims with their freshness words and the "why it's here" line.

## 10. Hero gradient adapts to the data

The hero tile's light is a state, not a colour choice. Show the tile in
every state, in a row, light and dark:

- **On track**: green (the app's green, softened) with "On track · 26
  markers, 2 to watch".
- **Attention**: amber (today's), "3 things to fix".
- **Act now**: rose, only for a confirmed state with an overdue action
  or a critical value, "1 needs a doctor this week".
- **Improving**: green with the pill and a movement word, when the
  30-day metric moved the right way.
- **No data yet**: neutral tonal grey, no gradient, "Connect Apple
  Health or upload a draw" with the two pills.
- **Stale**: the state's colour desaturated, "Last draw 9 months ago ·
  plan the next one".

Rule printed under the row: the gradient's hue follows the worst state
band on the ledger, its saturation follows freshness, and text and
status words carry the meaning without colour.

## 11. Mobile app structure

One frame per screen at 390, in the order of the tab bar: **Home**
(hero C · Body today · Blood summary · top condition · Plan · Ask pill
docked), **Body** (day tile, recovery, workouts week, sleep, body, last
sync row), **Blood** (draws timeline, filters, markers grid; drawer as
bottom sheet), **Plan** (actions with habit dots, next draw goal card,
questions worth answering), the **+ sheet**, a **thread** screen (§5),
and three **notification** rows as they would appear on the lock screen
("Retest due: HbA1c, TSH · plan it", "One question would change your
plan: family history", "A new pooled trial moved selenium ◐ → ● B").
Settings: HealthKit permissions state, sign out, nothing else.

## Report

File list, screenshot list, and for each place with variants (menu:
pills / rail / tab bar; graph drawer vs bottom sheet; thread collapse
style) one sentence recommending one and why. Name anything the engine
does not produce yet that a page assumes (e.g. cost bands, "applies to
you because" lines, the improving metric), so 28c knows the data work.
No effort estimates or timelines.
