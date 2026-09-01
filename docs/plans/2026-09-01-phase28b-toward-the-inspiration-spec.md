# Phase 28b: toward the inspiration — a mockup first

Owner, 2026-09-01: "I added an inspiration folder… radical but notice
how it all makes sense and is simple. Start from simple on the
homepage: health status, considering Apple Health data that updates as
it goes, then go towards deeper knowledge. I like the aesthetic we have
now but we can work towards the inspiration." And: redesign the range
bar to look "insanely good".

This phase produces an approved mockup, not app code. Implementation
follows in 28c after the owner picks.

## What the inspiration says (read all ten files in `inspiration/`)

- Canvas is a soft warm grey; surfaces are tonal (lighter panels on the
  grey), almost no 1 px borders; radii are large and pill-shaped.
- Numbers are big and light (thin weight, sometimes dotted numerals);
  labels are small and quiet; one accent (lime) for the live thing.
- Status is light, not chips: hero tiles carry a soft gradient (green
  = on track, amber/orange = attention) with the number in white.
- Rulers, not bars: a biomarker shows its value on a tick-mark scale;
  the goal-progress reference shows a thick rounded track, a dark
  "done" segment, a hatched "pace" zone and a big circular marker with
  a white ring, and a sentence with one coloured phrase.
- A horizontal timeline of small dots (draws, syncs) with a floating
  pill: "Health improving · +3.2 last 30 days".
- Systems live as a quiet list/sidebar with a status word each.
- Everything breathes: fewer things per screen, more air.

## The mockup (`docs/mockups/home-v3.html`, self-contained, no build)

Use the app's real tokens (read `app/globals.css`) and the two motion
skills' CSS, so what is approved is buildable. Real data shapes from
the test user (values in the current Home screenshots). Three sections,
each with two variants side by side where a decision is needed:

1. **Hero — simple health status.** Variant A: two gradient tiles
   (Status: "On track / Attention · 3 things", Biological age with a
   tick ruler and "2.4 years younger"). Variant B: one wide tile with
   the status sentence and the timeline strip underneath (dots for
   draws and phone syncs, the floating "+3.2 last 30 days" pill),
   biological age as a second tile. Under both: the Ask-or-tell line
   restyled as a pill.
2. **The ruler (the range bar).** Replace the thin bar with: a thick
   rounded track; normal band as a quiet tonal segment, optimal band
   slightly stronger; the value as a large circular marker with a white
   ring; the value printed above it always; the axis break shown as a
   soft gap when the value is far outside; a "was" ghost dot for the
   previous reading; below, one sentence with one coloured phrase
   ("320 IU/mL — well above normal (0–34)"). Show it for: in range,
   borderline, far outside, and a projected target (the phase-19 band)
   as a hatched pace zone like the goal-progress reference.
3. **Systems and the ledger.** Systems as a quiet pill list with the
   driving marker and a status word (no rings, no chips), deeper
   content unchanged in structure but on tonal surfaces with the new
   ruler and evidence glyphs (28a) instead of bracket labels.

Also one mobile frame (390 px) of variant A/B stacked.

## Constraints

- Keep the current type families and the mono-for-numbers rule; the
  change is surface, spacing, radius, colour-as-light and the ruler.
- Dark mode variant of the hero and the ruler (the app has one).
- No new dependency for the eventual build: gradients, rulers and
  pills are CSS/SVG.
- Do not touch the app. Output: the HTML file, a screenshot of each
  section (both variants) at desktop and the mobile frame to
  `/tmp/p28b/`, and a one-paragraph note per variant on what it costs
  to build.
