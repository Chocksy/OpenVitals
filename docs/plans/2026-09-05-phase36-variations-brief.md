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
