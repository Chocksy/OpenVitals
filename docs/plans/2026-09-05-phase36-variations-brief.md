# Phase 36 variations: the phone as a living prototype

Owner, 2026-09-05: "make multiple variations and actually let me see the
animations and charts changing when they happen. Use the seed-string
approach: define the creative direction, colour scheme, layout and
typography from the string, look beyond the surface for subpatterns,
special numbers, anything that inspires you, and bring that direction to
life. Look at the overall screen to see how a user goes and adds his
stuff quickly: voice, a picture or several, or text. Then a quick view
like Cal AI: calories, the goal, the structure, and the expectation that
keeping the trend and the goal long enough would put LDL or HDL or a
hormone at this level. Use the same components on the website home, so we
reuse. Use real food pictures from the web, I want to be convinced."

Same rules as `2026-09-05-phase36-ios-design-brief.md` (data kept, the
six defects fixed in the drawing) plus:

## Each variation is a prototype, not a picture

One HTML file, `docs/mockups/v4/ios-variations/NN-<name>.html`, no build
step, vanilla JS, `system.css` as the base plus the variation's own
`<style>` block. Everything that moves in the app moves on the page:

- **Add flow, played.** A "Play" control runs the whole sequence on a
  timer inside the phone frame: the sheet, then either the typed sentence
  or the photo (a real photograph), the reading loader, callouts landing
  on the plate one by one as they are "detected" (Cal AI's detection
  feel, our system's look), the meal card rising with the numbers
  counting up, the receipt. Voice is one of the three inputs: a mic
  button, a waveform while it listens, the transcript appearing as the
  sentence. Several photos: a strip of thumbnails, each read in turn.
- **Ticks that tick.** Click a move chip: the check draws in, the ring
  fills, the streak flame reacts when the day completes.
- **The expectation chart.** The quick view after a meal or a tick:
  today's calories against the target, protein, the structure of the day
  (three meals, the moves), and under it the sentence and the chart:
  "Keep this eight weeks and LDL lands near 104, from 118." Toggling a
  habit or a food rule redraws the projection line and the landing
  number (the arithmetic is `lib/projection.ts`: grade-weighted effect ×
  adherence × horizon, clamped by `MAX_CHANGE`; the seeded interventions
  now carry effects, so soluble fibre, plant sterols, a post-meal walk,
  resistance sessions each have a number). The tooltip follows the
  finger on the chart.
- **Website home frame.** One 1280 px frame of the web Home built from
  the same components (the week strip, move chips, the expectation
  chart, the meal cards), to show the reuse.

## Real pictures

Download 5–8 real food photographs (free licence: Wikimedia Commons,
Unsplash direct image URLs, Pexels) into
`docs/mockups/v4/ios-variations/img/` with `curl -L`, confirm each is a
real JPEG over 30 KB with `file`, look at each with the Read tool, and
credit them in the page footer. Plates the owner actually eats: sardines
on rye, tuna with chili, pork belly with bread, a salad, eggs, oats.

## The seed

The seed string sets the direction. Read it as a designer would: letters
that repeat, digits that add up, a rhythm in the case changes, a word
hiding inside. Name the variation from it. Derive: the mood in one line,
the accent (one, within the system's rule that lime is the add control
and spectrum is state; the accent may tint surfaces, rules, the ring, the
chart), the type scale rhythm inside the five sizes, the density, the
card language (edges, hairlines, fills), the motion signature (one
easing, one duration family), and the one unusual idea the seed
suggests. Write all of that in a "Direction" block at the top of the
page, then build to it. Same data on every variation, so the owner
compares direction, not content.

## Index

`docs/mockups/v4/ios-variations/index.html` lists the variations with
the seed, the name, the mood line and a link, in the style of
`home-variations-2/index.html`.

## Round two (owner, 2026-09-05 afternoon)

"They are quite the same, just some components a little different. Try
more outlandish ones: bigger charts, pie charts, restructure the
elements, a human in 3D (male and female) showing organs, an artistic
sketching view, something that makes it fun. Remember the mascots: some
kind of sidekick that guides us."

Same data, same rules on lime and the spectrum, same interactivity
(Play, ticks, the expectation chart, a web Home frame, real photos).
Each round-two variation gets a seed and a push:

- 05 **Atlas**: the body itself is the home. An SVG figure (male and
  female, a toggle), layered organs and systems that light by state
  (thyroid loud, lipids off, iron low), pointer tilt for depth (CSS 3D
  transforms on the layers), tapping an organ opens its markers. Goals,
  moves and the expectation chart arranged around the figure.
- 06 **Sketch**: a drawn notebook. Hand-drawn strokes (SVG with a
  displacement filter, draw-on with stroke-dasharray), a handwriting
  face for annotations (Caveat or similar from Google Fonts) beside
  Geist for the numbers, charts that draw themselves as you watch, meal
  photos as pasted polaroids, the receipt as a margin note.
- 07 **Sidekick**: a mascot, in the system's palette, SVG with idle
  blink and breathing, that lives in the tab bar's add control and
  comes out for the Add flow (it "reads" the plate, holds the callouts,
  celebrates a tick, sulks at a missed day gently), and speaks the
  sentence in a bubble. The owner wanted guidance and mood; the mascot
  is the guide.
- 08 **Big charts**: data first. Full-bleed charts, a radial day (a
  24-hour ring with meals, moves and sleep on it), a donut for macros,
  the expectation chart as the hero of Today, numbers at 34 px, very
  little prose.

Defects the owner saw in round one, to avoid: a progress bar whose fill
is thicker than its track with the needle outside it; a decorative
index tick sitting on the corner of white cards ("this weird blue thing
on top of the boxes"); a tick box showing a dot inside; spacing that
does not follow the Fibonacci scale. No framework is in play: the
mockups are hand-written CSS on system.css, so every gap is a choice.

## Round three (owner, 2026-09-05 evening): evolve Ply

"I like Ply the most. Evolve from that and only work on this round-watch
thing, but differentiate the actions: sleep, meals, moves, workouts by
colour, shape, size, or something inside the arcs that signals what they
mean. The Add page needs more variation in its initial state: make the
photo button clearer, or start in camera mode with buttons to switch to
text or voice, or make the three equal. No Send until data was entered.
The donut on the plate page: text sits on top of the plate, no colour,
no structure; I love the target rails. Use icons, sketched things, or
AI-generated illustrations to signal things. No credits."

All round-three variations start from `08-ply.html` (copy it, keep its
Play, ticks, chart, web frame, self-contained build) and change:

1. **The day ring.** Four kinds of arc must read as four kinds without
   the legend: a colour family per kind within the system (sleep the
   quiet navy-grey, meals the accent, moves ink, workouts the accent
   darkened), plus a shape or size rule (sleep as one thick outer band;
   meals as plates sized by kcal, a small glyph or illustration inside
   or at the arc; moves as short ticks with a check when done; workouts
   as a bar whose width is minutes), plus a glyph on every arc long
   enough to hold one (lucide: moon, utensils, pill, footprints,
   dumbbell). Tap still opens the card.
2. **Add, initial state.** Three drawings, one per variation: (a) opens
   in camera mode with a live viewfinder frame and two small switches
   for text and voice at the bottom; (b) three equal tiles (camera, mic,
   keyboard) with one line each; (c) text field first with a large
   photo tile beside it and the mic inside the field. Send appears only
   after there is something to send, in lime, and it is the only lime.
3. **The plate donut.** Labels never sit on the arcs: they go in a
   legend row under the donut or on leader lines outside it; each macro
   gets a colour step of the accent family and a glyph (lucide: beef or
   fish for protein, wheat for carbs, droplet for fat) or a generated
   spot illustration; the target rails stay exactly as they are.
4. **Illustrations.** `ios-variations/gen-image.sh "<subject>" out.png`
   makes a flat spot illustration in the palette (~$0.04 each, cap 12
   per variation). Use them where a glyph is too small to say the
   thing: the empty Add state, the four kinds in the ring legend, the
   macros, an empty meals day. No photo credits anywhere.

## Round five (2026-09-06): the design-beyond loop

Owner brought Anshu Chimala's "How to turn your AI into a world-class
designer" (Lenny's Newsletter, 2026-09-01). Its process is now the skill
`~/.claude/skills/design-beyond` (seed strings, ambitious briefs, a Fable
critic that scores screenshots in a fresh context until 9/10, generated
imagery, then the cut and the AI-tells checklist). Two ambitious briefs
run through it, Opus building, Fable judging, at most four rounds each:

- 16 **Observatory** (seed xYApK4OVhXxHDCerstZmuWES): the phone as an
  astronomical instrument. Dark by default, the day ring a planisphere
  with brass hairlines, meals as generated dishes orbiting at their hour,
  the projection a comet's path to the landing number. Every screen an
  instrument face that still works as the app.
- 17 **Still life** (seed AYufRPjvgvXfHb9w4RsEfJUh): image-centric like
  the Morsel screens in the article. Generated cut-out dishes on cream
  carry the numbers, markers set as museum labels, the day ring a single
  thin line under the pictures, radical asymmetry and negative space,
  no cards at all, controls that feel native.

## Round twelve (owner, 2026-09-23): eight homes, score family plus fresh

Owner picked: fresh directions and the score family (Glow, Onion, Matrix),
HTML prototypes, Home only, eight variations. Files 37 to 44.

### Shared rules for every file

- One self-contained file `docs/mockups/v4/ios-variations/NN-<name>.html`,
  vanilla JS, no build, no CDN except one Google Font if the direction needs
  it. Photos only from `img/` (for example `img/08-oats.jpg`,
  `img/08-sardines-rye.jpg`, `img/08-pork-belly.jpg`), linked by relative
  path. `gen-image.sh` allowed, cap 3 images per file, saved as
  `img/NN-*.png`.
- Two phones side by side, 390x844: phone 1 is Home, phone 2 is Home in its
  most interesting second state (the Add sheet open over a blurred home, or
  a layer or card opened). A small "Direction" block above the phones: mood
  in one line, accent, type, the one unusual idea.
- Data: copy `I`, `LIFE`, `BLOOD`, `GENES`, `LOG` and the score arithmetic
  from `25-onion.html` verbatim. Score 72 (life 77, blood 71, genes 62),
  keep `console.assert(score === 72, ...)`. PhenoAge 36.2 at 39. LDL 131
  mg/dL (Aug 1 2026, from 168 Dec 9 2025). Projection sentence: "Keep this
  eight weeks and LDL lands near 104, from 131." Meals: oats 412 kcal 8:15,
  sardines on rye 462 kcal 13:08, pork belly salad 623 kcal 19:30. Five
  moves, two ticked.
- Must move: ticking a move chip recomputes life and the score live (the
  Moves row p goes 40 -> 60 -> ...), and the score display animates to the
  new number. The plus opens an Add sheet with Photo, Voice, Text; Send
  appears only after content.
- The home must answer in one glance: how am I doing (score), what do I eat
  today (kcal against 1 900), what to do next (a move), where is my blood
  going (LDL projection).
- Round-one defects stay fixed: bar fills never thicker than their track,
  needles inside tracks, no decorative ticks on card corners, check marks
  with no leftover dot, every gap on the Fibonacci scale (3 5 8 13 21 34 55).
- Foot notes under the phones: the score arithmetic table and a short
  table of the direction's rules.
- Verify with headless Chrome (see 26-matrix-spec.md "Verify"), read the
  PNG, fix what is broken, report the path.

## Round thirteen (owner, 2026-09-23): Deck as the base, Widgets on its own

Owner on round twelve: Deck is the favourite ("the ticking via swipe is
amazing"). Streak's green day calendar gives real insight and its kcal
ring is nice. Widgets feels familiar and its motion is top notch, but the
black score widget looks out of place, the grey background is bland, and
it lacks a view of past days. Problems with Deck:

- The five top boxes mix too much. You cannot act on genes or on LDL, and
  the marker will not always be LDL. Remove them and redesign that strip.
- The score must be permanent, not one card in the pile. Use the top
  strip for it.
- Not every card belongs in one pile. Split by what you can do with it:
  things you can act on (tick, log, fix), things as they are now (today's
  food, sleep, markers), things as they are predicted (projections).
- "Razvan's hand" means nothing to the owner. Drop the card-game wording
  in the UI; the metaphor stays in the motion only.
- Explore the food card: edit a meal, change the portion, fix results,
  delete.
- More motion that makes it feel alive (the owner asked for "video or
  something"). Use CSS, SVG and canvas motion, plus up to 3 generated
  stills (gen-image.sh) animated with CSS. No external video files.

Files: 45 (Deck II, the combined final), 46 (Shelves, a second answer to
the piles question), 47 (Widgets II). Same shared rules as round twelve
(data from 25-onion, score 72 with the assert, ticks recompute the score
live, Send only with content, Fibonacci gaps, verify with a screenshot),
except each file has three phones, not two.

## Round fourteen (owner, 2026-09-24): the island, and the hybrid

Owner and a friend prefer Deck II; the owner's wife prefers Widgets II and
Shelves "because things are smaller". Owner asked for the Dynamic Island
motion from Widgets II inside the Deck design, properly adapted, and for a
UX take. The take: the home is a glance surface, so Shelves' density wins
there; Deck's swipe is the engagement loop (act, instant reward, streak),
so it becomes a full-screen focus mode opened from the Do shelf; edits
live in sheets over the home so the ring and score visibly react.

- 45 Deck II gets the island in place (plum-adapted Live Activity).
- 48 Hybrid: Shelves as the home, Deck II as the focus mode, the island
  for Add and for tick receipts, Deck II's header calendar expand.

Island rules for both: the island is the one place system-level feedback
happens. It grows from the notch with a spring (copy the Widgets II
timings), shows at most one activity, and shrinks back to a compact pill
(rings or score on the left, the number on the right). Activities: reading
a plate after Send (photo thumb, detected items arriving, progress), a tick
receipt ("Walk after dinner · +2 · 74", 2.6 s), the Do pile cleared
("All done today · streak 32"). Nothing else uses it.

## Round fifteen (owner, 2026-09-26): hunches and one clear view

Spec: `2026-09-26-phase39-hunches-spec.md`. Read it first. Owner: "how can
we introduce creativity, novelty and incredible suggestions from a small
amount of data that lead to more investigation that can offer
confirmation? How can we have a clear view of the overall health of a
person and how they are doing in their goals?" Then: "do the same approach
for the web or iOS, HTML pages mocked."

This round uses the owner's **real** blood history (the data pack below),
not placeholder numbers. The point of the round is to convince him the
hunches are real.

### Shared rules

- Hybrid (`48-hybrid.html`) is the chosen language: plum header, cream
  paper with grain, Space Grotesk, the `--life / --blood / --gene` family,
  Fibonacci gaps (3 5 8 13 21 34 55), the island rules from round
  fourteen. Copy its `:root` tokens and phone frame verbatim. Variation 52
  may break the look on purpose; the others extend it.
- One self-contained file `docs/mockups/v4/ios-variations/NN-<name>.html`,
  vanilla JS, no build, no CDN except the Space Grotesk font. Photos only
  from `img/`. `gen-image.sh` allowed, cap 3, saved as `img/NN-*.png`.
- iOS files: three phones, 390×844, side by side, with a "Direction" block
  above them and notes under them (the rules the file follows). Web file:
  one 1280 frame and one 390 frame of the same page.
- Copy `DATA` below verbatim. Every number on screen comes from it. Do not
  invent readings. Explanations and questions may be written by you, but
  keep them medically sober: a hunch is "worth a look", never a diagnosis;
  no word "sick"; every explanation carries an evidence glyph (● A/B,
  ◐ C, ○ hypothesis).
- Charts are hand-drawn SVG (no chart library). A marker chart always
  shows three things: the dots of the draws, the person's own band (median
  ± spread, a soft fill), and the lab range as thin lines. The difference
  between "your band" and "the lab's band" is the whole idea; make it
  obvious.
- Must move: opening a hunch animates the chart drawing in and the band
  filling; answering the separating question re-orders the explanations
  with their bars animating; accepting a test writes the predictions and
  stamps the card "written down 26 Sep"; one demo button plays the result
  arriving and the card closing as confirmed, ruled out or faded.
- The round-one defects stay fixed (bar fill never thicker than its track,
  needles inside tracks, no decorative corner ticks, clean check marks).
- Verify with headless Chrome as in `26-matrix-spec.md` "Verify" (window
  1400×1100 for iOS files, 1400×1700 for the web file), read the PNG, fix
  what is broken, report the path.

### The data pack (copy verbatim)

```js
const DATA = {
  person: { name: "Razvan", age: 39, sex: "m", lastDraw: "2026-04-23", daysSinceDraw: 156,
            systemsMeasured: 7, systemsTotal: 12 },
  goal: { marker: "ldl_cholesterol", label: "LDL", unit: "mg/dL", lo: 70, hi: 100, by: "2026-12-01" },
  genes: [
    { gene: "APOE", call: "e2/e3", note: "lower LDL on average", g: "A" },
    { gene: "TCF7L2", call: "CT", note: "higher diabetes risk", g: "A" },
    { gene: "FTO", call: "AA", note: "higher BMI tendency, exercise cuts it by a third", g: "B" },
    { gene: "MTHFR", call: "C677T het", note: "homocysteine depends on folate", g: "C" },
  ],
  // [date, value]; unit; lab range; own band = median and spread of the draws before the last
  series: {
    ldl:   { label: "LDL", unit: "mg/dL", lab: [0, 130], band: [108.2, 14.6],
             pts: [["2015-03-21",103],["2021-10-14",136.1],["2021-12-04",110.5],["2022-10-20",94],["2023-03-17",97.3],["2024-05-13",122.9],["2024-11-20",106],["2025-12-09",117],["2026-04-23",131]],
             slope5y: 1.8, slopeRecent: 15.2 },
    apob:  { label: "ApoB", unit: "mg/dL", lab: [0, 100], pts: [["2023-03-17",82],["2024-05-13",97],["2026-04-23",99]] },
    hdl:   { label: "HDL", unit: "mg/dL", lab: [40, 200], band: [51.4, 10.7],
             pts: [["2015-03-21",39.2],["2021-10-14",61.8],["2021-12-04",50.6],["2022-10-20",58.4],["2023-03-17",52.1],["2024-05-13",57.2],["2024-11-20",43],["2025-12-09",44],["2026-04-23",50]] },
    eos:   { label: "Eosinophils", unit: "K/µL", lab: [0.0, 0.5], band: [0.11, 0.03],
             pts: [["2014-03-26",0.09],["2015-03-21",0.10],["2016-01-09",0.13],["2019-07-13",0.11],["2021-10-14",0.11],["2023-03-17",0.05],["2024-05-13",0.09],["2024-11-20",0.25],["2025-12-09",0.17],["2026-04-23",0.19]],
             step: { since: "2024-11-20", priorMax: 0.13 } },
    ferritin: { label: "Ferritin", unit: "ng/mL", lab: [30, 400], band: [113.1, 15.5],
             pts: [["2021-10-14",154.5],["2023-03-17",110.8],["2024-05-13",115.3],["2025-12-09",94.4],["2026-04-23",79.6]], slope5y: -14 },
    b12:   { label: "Vitamin B12", unit: "pg/mL", lab: [200, 900],
             pts: [["2021-10-14",183.7],["2021-12-04",197],["2022-10-20",531],["2023-03-17",534.2],["2024-05-13",898.8],["2024-11-20",522],["2025-12-09",603],["2026-04-23",472]] },
    vitd:  { label: "Vitamin D", unit: "ng/mL", lab: [30, 100],
             pts: [["2019-07-13",23.3],["2021-10-14",61.8],["2021-12-04",54.1],["2022-10-20",52],["2023-03-17",42.3],["2024-05-13",34],["2024-11-20",37.7],["2025-12-09",31.8],["2026-04-23",32.7]], slope5y: -6 },
    hcy:   { label: "Homocysteine", unit: "µmol/L", lab: [0, 15],
             pts: [["2023-03-17",11.2],["2024-05-13",8.1],["2024-11-20",8.4],["2025-12-09",8.8],["2026-04-23",9.6]] },
    crp:   { label: "CRP", unit: "mg/L", lab: [0, 5],
             pts: [["2014-03-26",1.3],["2015-03-21",4],["2021-10-14",6.1],["2021-12-04",4.6],["2022-10-20",3.5],["2023-03-17",15.8],["2024-05-13",8.1],["2024-11-20",0.54],["2025-12-09",0.5],["2026-04-23",0.64]] },
    hba1c: { label: "HbA1c", unit: "%", lab: [4, 5.7], band: [5.2, 0.31],
             pts: [["2016-06-24",5],["2021-10-14",5.72],["2021-12-04",5.53],["2022-10-20",5.43],["2023-03-17",5.2],["2024-05-13",5.07],["2024-11-20",4.8],["2025-12-09",5.2],["2026-04-23",5]] },
    insulin: { label: "Fasting insulin", unit: "µIU/mL", lab: [2, 25],
             pts: [["2021-12-04",8.1],["2022-10-20",4.8],["2023-03-17",2.7],["2024-05-13",3.2],["2024-11-20",4.7],["2025-12-09",4.2],["2026-04-23",5.7]] },
  },
  // the hunches the engine would raise (spec B1 kinds); test prices are placeholders
  hunches: [
    { id: "eos", kind: "step", title: "Eosinophils moved up a level", system: "Immune", series: "eos",
      say: "Ten years between 0.05 and 0.13. The last three draws: 0.25, 0.17, 0.19. Still inside the lab range, outside yours.",
      explanations: [
        { t: "A new allergy or a change of season", p: 0.45, g: "B" },
        { t: "A medicine or supplement started around late 2024", p: 0.25, g: "B" },
        { t: "Gut parasite after travel", p: 0.10, g: "B" },
        { t: "Noise that will fade", p: 0.20, g: "C" } ],
      question: "Anything new since autumn 2024: a pet, a move, a medicine, sneezing in spring?",
      test: { name: "Total IgE", price: 45, currency: "RON" } },
    { id: "iron", kind: "cluster", title: "Stores running down together", system: "Nutrients", series: ["ferritin","b12","vitd","hcy"],
      say: "Ferritin −14 a year since 2021, B12 off its 2024 peak, vitamin D halved, homocysteine back up. Four markers, one question: intake or absorption?",
      explanations: [
        { t: "Less red meat or supplements stopped", p: 0.50, g: "B" },
        { t: "Absorption: coeliac or atrophic gastritis", p: 0.08, g: "A" },
        { t: "Blood loss or donation", p: 0.12, g: "B" },
        { t: "Folate low with MTHFR het", p: 0.30, g: "C" } ],
      question: "Did you change how you eat or stop a supplement in 2024?",
      test: { name: "Folate + transferrin saturation", price: 70, currency: "RON" } },
    { id: "ldl", kind: "drift", title: "LDL is walking away from your goal", system: "Heart", series: "ldl", goal: true,
      say: "106, 117, 131 in 17 months: +15 a year. Goal is 100 or under by 1 Dec. ApoB followed it to 99.",
      explanations: [
        { t: "More saturated fat in the last year", p: 0.55, g: "A" },
        { t: "Thyroid running slower", p: 0.05, g: "A" },
        { t: "Weight up", p: 0.25, g: "A" },
        { t: "Season and the lab's own swing", p: 0.15, g: "C" } ],
      question: "Did your weight or how much fatty meat and cheese you eat change since late 2024?",
      test: { name: "Lipid panel + ApoB in 8 weeks", price: 90, currency: "RON" } },
    { id: "gap", kind: "gap", title: "Folate never measured", system: "Nutrients", series: "hcy",
      say: "MTHFR C677T het and homocysteine rising three draws in a row. Folate is the one number that says which way.",
      explanations: [], question: null, test: { name: "Serum folate", price: 35, currency: "RON" } },
    { id: "crp", kind: "good_news", title: "Inflammation settled", system: "Immune", series: "crp",
      say: "CRP was 15.8 in March 2023. Three draws since then under 1.", explanations: [], question: null, test: null },
    { id: "genes", kind: "good_news", title: "Your genes are outvoted", system: "Metabolic", series: "hba1c",
      say: "TCF7L2 and FTO both lean toward diabetes. HbA1c went from 5.7 to 5.0 and fasting insulin stays low.",
      explanations: [], question: null, test: null },
  ],
  // heading per system: toward | holding | away | unmeasured
  heading: [
    { sys: "Heart", word: "away", why: "LDL +15/yr, ApoB 99" },
    { sys: "Metabolic", word: "toward", why: "HbA1c 5.0, insulin low" },
    { sys: "Nutrients", word: "away", why: "ferritin, B12, D down" },
    { sys: "Immune", word: "holding", why: "CRP < 1, eosinophils up a step" },
    { sys: "Liver", word: "holding", why: "ALT 10, GGT 15" },
    { sys: "Kidney", word: "holding", why: "creatinine 0.9" },
    { sys: "Thyroid", word: "holding", why: "TSH 1.1, fT4 1.23" },
    { sys: "Hormones", word: "unmeasured", why: "testosterone once, 2024" },
    { sys: "Bone", word: "unmeasured", why: "" },
    { sys: "Sleep", word: "unmeasured", why: "no phone sync yet" },
    { sys: "Fitness", word: "unmeasured", why: "no phone sync yet" },
    { sys: "Mind", word: "unmeasured", why: "" },
  ],
};
```

### The five files

- **49 Casebook** (iOS, Hybrid). Hunches as case files. Phone 1: the
  Hybrid home with a new shelf "Worth a look" between Today so far and
  Where it's heading: one card per hunch, the kind as a stamp (STEP,
  CLUSTER, DRIFT, GAP, GOOD NEWS), a tiny sparkline with the own band.
  Phone 2: the eosinophil case open (chart, "your band vs the lab's",
  explanations as bars, the one question with answer chips that re-order
  the bars). Phone 3: the cluster case after accepting the test: the
  written-down predictions per explanation, the "written down 26 Sep"
  stamp, and a Play button that brings the folate result in and closes it.
- **50 Heading** (iOS, Hybrid). The clear view. Phone 1: the plum header
  opened into three levels: Today (the phase 37 rows), Heading (twelve
  systems as toward / holding / away / unmeasured, a glyph and an arrow
  each), Watch (the open hunches). The confidence line at the bottom
  ("Last draw 156 days ago · 7 of 12 systems · 4 hunches open") and the
  draw's age as a slowly emptying ring. Phone 2: the LDL goal: the goal
  band, the draws, the recent slope extended as "where it lands on 1 Dec
  if nothing changes" against the projection from the plan, one sentence.
  Phone 3: a system opened (Nutrients) showing its markers with personal
  bands and the hunch that explains the arrow.
- **51 Corridor** (iOS, data-first). "You against you." Every marker as a
  horizontal corridor (the own band) with the lab range behind it and the
  last draw as a dot; markers outside their corridor rise to the top.
  Phone 1: the corridor list. Phone 2: a time scrubber across 14 years:
  drag it and every dot moves to that draw's value, corridors recompute
  from the draws before it, and signals light up the moment they would have
  been raised. Phone 3: the cluster drawn as four corridors that fall
  together, joined, with the one question.
- **52 Constellation** (iOS, outlandish; seed `k7Hq2VvLm9TzRc4w` read as a
  designer would). The markers as a night sky: each marker a star whose
  brightness is its distance from the own band; stars the graph links are
  joined by faint lines; a cluster lights up as a constellation with a
  name ("The Store Room": ferritin, B12, D, homocysteine). Tap a
  constellation: it becomes the hunch card. The good-news hunches are
  stars that dimmed back. May leave the Hybrid look, keep the data.
- **53 Web** (1280 + 390, Hybrid language). The web home with the three
  levels as columns (Today, Heading, Watch), the LDL goal as the hero
  chart, hunches as a rail, a hunch opening in a right-hand drawer with
  the full case (chart, explanations, question, test, predictions, Play
  result). The 390 frame is the same page stacked.

Index: add a "Round fifteen" block at the top of `index.html` with the
five rows, in the style of the round-fourteen rows.

## Round sixteen (owner, 2026-09-26): Casebook × Corridor, glance first

Owner on round fifteen: 53 Web is exceptional (the web redesign comes
later and translates every component, see the phase 39 spec). For iOS:
"a combination of Casebook and Corridor, maybe a little more simplified.
I like the amount of data shown; make it simpler to read initially and act
upon, then open and expand to determine what it means in detail and where
the information comes from."

Same shared rules and the same `DATA` as round fifteen (copy it verbatim
from that section), plus the findings appended to the phase 39 spec
(provisional band from 4 draws, goal markers read by slope and goal,
cluster by direction).

### Three depths, one rule each

1. **Glance (read in 2 s, act in 1 tap).** One line per hunch in plain
   words, one number that matters, one mini corridor (own band, the last
   dot), one action button: the question's first answer chip, "Book the
   test", or "Got it" for good news. No z-scores, no glyph legend, no
   percentages at this depth.
2. **Open (what it means).** The Corridor chart for the marker (draws,
   own band as it stood, lab range behind, the step or slope marked), the
   explanations as bars with ● ◐ ○, the question with all its chips (bars
   re-order), the test with predictions written down and the stamp, Play
   result. Casebook's stamps (STEP, CLUSTER, DRIFT, GAP, GOOD NEWS) stay.
3. **How we know (where it comes from).** Expand-in-place sections, closed
   by default: the rule that fired with its numbers ("last 3 draws above
   your previous max of 0.13"; "median 0.11 ± 0.03 from 9 draws"), every
   draw as a row with date, value and its source file, the evidence behind
   each explanation (grade, basis science / opinion / anecdotal, a
   one-line source), and what is not known ("folate never measured";
   "band provisional, 4 draws"). The time scrubber from 51 lives here, as
   "replay how this was found".

Source files, real, for the depth-3 draw rows (draw date → file). Some
readings on a date have no file: they came from the legacy import; show
them as "imported from the old app". File dates can differ from the draw
date (the lab's report date); show both.

```js
const SOURCES = {
  "2012-08-08": "Razvan - 08.08.2012.pdf", "2014-03-26": "Razvan - 26.03.2014.pdf",
  "2014-07-07": "Razvan - 07.07.2014.pdf", "2015-03-21": "Razvan - 26.03.2015.pdf",
  "2016-01-09": "Razvan - 13.01.2016.pdf", "2016-06-24": "Razvan - 24.06.2016.pdf",
  "2019-07-13": "Razvan - 13.07.2019.pdf", "2021-10-14": "Razvan - 14.10.2021.pdf",
  "2021-12-04": "Razvan - 04.12.2021.pdf", "2022-10-20": "Razvan - 20.10.2022.pdf",
  "2023-03-17": "Razvan - 17.03.2023.pdf", "2024-05-13": "Razvan - 13.05.2024.pdf",
  "2024-11-20": "Razvan - 20.11.2024.pdf", "2025-12-09": "Razvan - 09.12.2025.pdf",
  "2026-04-23": "Razvan - 23.04.2026.pdf",
};
```

Laboratory names are not on file; do not invent them.

### The two files

- **54 Casefile**: hunches live on Today. The Hybrid home with a slim
  "Worth a look" shelf of glance rows (not cards). Tap a row: the case
  opens as a sheet at depth 2; "How we know" expands inside it. Phones:
  (1) the home with the shelf, (2) the eosinophil case open, (3) the
  cluster case with "How we know" expanded (rule, draws with files,
  evidence, the replay scrubber).
- **55 Corridors**: hunches live on the Blood tab. The tab opens on the
  glance list (hunches first, then every marker as a slim corridor row,
  outside-your-band on top); Today keeps one line, "4 things worth a look
  in your blood", linking to it. A row expands in place into depth 2
  (FLIP), and "How we know" pushes a page. Phones: (1) the Blood tab
  glance, (2) a row expanded in place, (3) the How we know page with the
  replay scrubber.

Verify as in round fifteen; also screenshot one state per depth
(`?depth=1|2|3`).
