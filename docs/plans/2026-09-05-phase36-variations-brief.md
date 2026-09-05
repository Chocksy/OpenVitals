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
