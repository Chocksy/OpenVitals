# Phase 37 reference: 48 Hybrid, measured

Extracted from `docs/mockups/v4/ios-variations/48-hybrid.html` (4 736 lines) and
the files it borrows from (40-streak, 45-deck-ii, 46-shelves, 47-widgets-ii).
Pixel values are CSS px at a 390×844 phone, so they map 1:1 to SwiftUI points.
The HTML is still the tiebreaker: when a value here looks wrong, open the file.

Every CSS `cubic-bezier(a,b,c,d)` ports verbatim as
`Animation.timingCurve(a, b, c, d, duration:)`. Do not guess spring
parameters. The named curves live in `Motion.swift` (see the spec).

## Tokens

- **Colours:** `plum0 #1e0a24`, `plum #2b1033` (= ink), `plum2 #3d1947`,
  `plum3 #5a2d66`, `mist #cdb8d2`, `paper #f3ead8`, `paper2 #ebdfc7`,
  `paper3 #dccbad`, `card #fffdf8`, `cream #f6eddc`, `ink2 #6f5a72`,
  `ink3 #a08fa0`, `line #eadfcb`.
- **Layers:** life `#e4722f` / light `#f59257`; blood `#c23a5e` / `#ea6a8d`;
  genes `#6c4aa6` / `#a98ae6`.
- **Status:** green `#23995d` (soft `#d9efdf`), amber `#c98512` (soft
  `#f6e3bf`), rose `#d2415b` (soft `#f8dbe0`), lime `#d6f34a`. Lime only on
  the plus and Send (and inside the island).
- **Spacing:** 3, 5, 8, 13, 21, 34, 55. Nothing else.
- **Curves:**
  - `ease` = `(0.2, 0.8, 0.2, 1)`
  - `spring` = `(0.3, 1.35, 0.5, 1)`: 560 ms cards, 700 ms shelf settle,
    900 ms bars and counts, 420 ms small pops.
  - `ispring` = `(0.34, 1.4, 0.64, 1)`: island only, 620 ms.
  - `flyIn` = `(0.5, 0, 0.75, 0)`: the ticked card, 560 ms.
  - `confetti` = `(0.2, 0.6, 0.4, 1)`: 1.8 s.
- **Type:** Space Grotesk, tabular numbers everywhere. Sizes 11, 13, 17, 21,
  34, and 55 for the score.

## Score arithmetic (48:2976–3152, from 25-onion)

```js
life  = round(avg(LIFE.rows.p))                          // [sleep, moves, kcal, protein]
blood = round(avg({green:1, amber:.5, rose:0}[st]) * 100)
genes = round(avg(GENES.rows.p))                         // fixed
score = round(.4*life + .45*blood + .15*genes)
kcalP = k<1600 ? 100-(1600-k)/10 : k>1900 ? 100-(k-1900)/10 : 100   // floor 0, rounded
protP = min(100, round(g/120*100))
movesP = done/total*100
word(s) = s>=80 "Strong" : s>=65 "On track" : s>=50 "Watch" : "Act"
```

Tick gain: set the move done, compute the score, restore. That delta is the
`+N` on the card and in the receipt.

## Day-square colour (40-streak:1407, 48:3217)

```js
hue   = s => 30 + s/100*110
light = s => max(34, min(90, 90 - (s-55)*2.4))
col   = s => hsl(hue(s), 68%, light(s)%)
```

Run: count back from today while each score ≥ 65, only if today is ≥ 65.

## Header (plum, never scrolls)

- Background plum with `radial-gradient(70% 90% at 15% 0%, #4d1d58, transparent 70%)`.
  Bottom corners 34. Bottom padding 21. Inner padding 8/21/0. Shadow
  `0 13 21 -13 rgba(43,16,51,.5)`. No grain.
- **Row A** (gap 13):
  - Score 55/600, tracking −0.05em, min-width 68. On catch: scale 1.12 for
    420 ms spring. When the scroll passes 21: shrinks to 34 (min-width 42),
    420 ms spring.
  - Label "Wed 23 Sep · score": 11, uppercase, tracking .08em, mist.
  - State word 17/600, then "of 100" 13 mist.
  - Pill: padding 3/8, lime at 16% behind lime text 11/600, shows with
    360 ms ease from y+5 / opacity 0. Text `+N · moves X of 5`. Hides after 2 600 ms.
  - Avatar 42 circle, plum2 fill, 1 px plum3 border.
- **Layer bars:** 3 columns, gap 13, top 13. Label 11 mist, value 13/600
  cream. Bar 5 tall, radius 3, track cream at 14%. Fill width animates
  900 ms spring, light layer colours. Lifestyle has a ghost fill (dashed:
  3 on, 2 off, opacity .8) that jumps to the new width first; the solid
  fill follows after the fly lands.
- **21-day strip:** 21 columns, gap 3, top 13. Cells 13 tall, radius 3.
  Colour change 600 ms ease; select pop 300 ms spring (scaleY 1.4). Today:
  ring 2 plum + 3 cream. Extra 2 px left margin at each week break.
  When the calendar opens the strip fades (320 ms) and collapses (420 ms).
- **Why line:** 11 mist. `${run}-day run at 65+ · tap for 13 weeks`, or with
  a selected day `Sat 12 Sep · 68 · reason`. Right: "21 days"/"13 weeks" and
  a 13 chevron rotating 180° over 420 ms ease.
- **13-week grid:** height 0 → measured, 520 ms ease. Top padding 13.
  Columns `13 + 13×17`, rows `13 + 7×17`, gap 5, centred. Month and M/W/F/S
  labels 10 mist at .7. Cell 17×17, radius 5, pops in from scale .3 /
  opacity 0 over 420 ms ease, delay `i × 5 ms`. Future cells: no fill,
  1 px inner line cream at 16%. Blood-draw day: plum dot inset 5.5.
  - Today cell: scale 1.3, 1.5 plum ring, score 8/700 white. Idle beat
    2.4 s (1.3 → 1.6 at 12% → 1.3), 1.4 s delay, repeating, with a ring
    that grows to 8 px and fades by 70%. On a tick: flash 1.6 s (scale 2.1
    and a 3 px lime ring at 20% and 60%).
  - With a selection: others drop to .28 opacity, selected scale 1.25 with
    rings 2 plum / 3.5 cream.
  - Legend swatches 60/64/68/72/76, then the dot key "blood draw · tap a day".
- **Tooltip:** 212 wide, card colour with grain, radius 13, padding 13,
  shadow `0 21 34 -13 rgba(10,2,12,.6)`. Fades up 5 over 320 ms ease.
  Arrow 10 px rotated square. x = `clamp(0, cx−106, W−212)`. Weekday index
  ≥ 3 (Thu–Sun) puts it above the cell, otherwise below, 13 away.
  Contents: date 11; swatch 10 + score 34/600 + word 13/600; divider;
  "TOP REASON" 10 caps; reason; sub-line ink2; effect ±N green or rose
  (none for today); `Life L · Blood B · Genes G` 11.
- **Ambient clip** `vid/45-plum.mp4`: muted, plays once at 0.5× rate,
  rests on its last frame. Overscan 55 each side, aspect fill, clipped to
  the header shape. Blend screen, blur 21, saturation 1.1. Fades 0 → .45
  over 1.4 s on first frame. Reduce Motion: first frame, still, at .45.

## Shelves (one scroll, bottom padding 110)

- Shelf gap 21. Title 17/600 with a subtitle 11 ink2.
- **Vertical lag:** each row offsets by `clamp(−13, 13, −dy × 0.6)` and
  settles back with 700 ms spring, row delays 0/50/100 ms, reset after
  90 ms of no scroll.
- **Horizontal shelves:** gap 13, padding 5/21/21, snap to start with
  21 leading inset. Each child leans `rotate(clamp(−5°, 5°, −v × .25))`
  and shifts `clamp(−21, 21, −v × .8)` around its bottom centre, 700 ms
  spring, delays 0/40/80/120 ms, reset after 90 ms. v = points per scroll
  event.

### Do now

- **Pips:** five 21 circles, 2 px paper3 border. Done: green fill, check
  draws 420 ms ease with a 120 ms delay. Tap: scale 1.3, 420 ms spring. A
  tap on a done pip unticks it.
- **Focus button:** plum pill, padding 5/13/5/8, 13/600, lime glyph 15.
  Pressed scale .94 (300 ms spring). Label `Focus · N left`.
- **Stack:** 126 tall, 21 side margins. Card 110 tall, radius 21, padding
  13, card colour with grain, shadow `inset 0 1 0 #fff, 0 13 21 -13 rgba(43,16,51,.35)`.
  Layout: 55 icon column, then text. Anchor bottom centre. Transform 560 ms
  spring, opacity 300 ms ease.
  - Icon 55 plum circle, glyph 26. Top card pulse: ring at inset −5,
    scale .9 → 1.3, opacity .5 → 0, 2.1 s, repeating.
  - Title 21/600, description 13 ink2. Footer 11/600 caps, tracking .1em:
    "← later" rose, a "for …" chip, "done →" green.
- **Fan by depth:** d0 none; d1 `(8, 8) rotate 2.5° scale .96`; d2+
  `(−5, 13) rotate −2° scale .92`; d ≥ 3 opacity 0; z `10 − d`. Cards
  leaving the queue: `y −34, scale .9, opacity 0`.
- **Empty card:** "Day complete / All five done. The score has them."
- **Drag pose:** `translate(dx, dy × .3) rotate(dx / 17 °)`. Stamp opacity
  `min(1, |dx| / 89)`. DONE (dx > 0) rotated −12° green; LATER (dx < 0)
  +12° rose. Stamp 21/700, tracking .12em, 3 px border, radius 8, card at
  86% behind, 21 from top and right. |dx| > 5 is a drag, less is a tap.
- **Release:** dx > 89 flies. dx < −89: Later, card goes to
  `(−380, 21) rotate −18°` over 360 ms ease, then to the back of the fan.
  Otherwise spring back.
- **Fly to header:**
  1. Ghost starts at the stack rectangle in the release pose.
  2. Target: the score number's centre (`tx = num.cx − stack.cx`,
     `ty = num.cy − (stack.y + 55)`).
  3. Straight line, 560 ms `flyIn`, to `rotate −8° scale .08`; opacity
     → .25 over 560 ms ease.
  4. At start: ghost bar jumps, island receipt fires.
  5. At 560 ms, `settleScore`: header catch; score and life count up over
     900 ms; bar width 900 ms spring; pill; today cell flash; food/moves
     card redraw; moves row lands (700 ms spring from y −13, scale 1.08,
     green-soft background).
  6. Pile empty: confetti.

### Today so far (cards 258 wide, min-height 146, radius 21, padding 13)

- **Food:** ring 96, r 42, stroke 8, life colour, round caps. First draw
  1 200 ms ease after 200 ms; later changes 900 ms spring. Centre kcal
  21/600 counting 900 ms, "of 1 900 kcal". "Left today" / "Over today"
  17/600. Protein rail 5 tall. Meal thumbs 42, radius 13, kcal overlay 9.
- **Sleep:** 34/600 "7h 30"; hypnogram 232×34 in the genes colour.
- **Moves:** list with 13 circles.

### Where it's heading

- Projection card 282 wide (332 open). Headline 34/600, tag pill.
- Chart 55 tall (144 open). Future: dotted round-cap line (dash .1 / gap
  6, width 3). Landing dot r 4.5 (6 open).
- Open content fades in 420 ms ease after 120 ms, from y+8. Lever pills
  13; active ones plum. Toggling a lever redraws the line and landing.
- Sort: non-green blood rows by `cut / now` descending, then PhenoAge.

### Tab bar

Glass bar 62 tall, card at 78% with blur 21 and saturation 1.4. Plus is a
62 lime circle. 13 from the sides, 21 from the bottom.

## Focus mode

- **Open:** clip from the stack rectangle (radius 21) to full screen
  (radius 47), 560 ms spring. Inner layer from scale .8 / opacity 0,
  anchored at the stack centre; transform 560 ms spring, opacity 280 ms ease.
- **Background:** plum with two radial glows drifting 21 s and 34 s,
  alternating `(−34, −21) scale .92` ↔ `(144, 89) scale 1.12`.
- **Top row:** 34 close; "Focus" 21/600; score 34/600 counting 700 ms.
- **Table:** 521 tall. The whole layer idles over 5.5 s (y −3, rotate
  .25° at the midpoint).
- **Card:** top 21, 500 tall, radius 34, cream with grain, padding 21.
  Transform 480 ms spring; opacity and filter 360 ms. Depth d:
  `y −13d, scale 1 − .05d`; cards behind get brightness .86, saturation .8.
  Target circle 144 with a dashed ring and an inner ink disc (inset 8),
  icon 44 pulsing. Name 34/600 centred. Hints "← skip / +N to the score /
  tick →". Chips 55 wide with a 34 circle.
- **Stamps:** TICK left 21 rotated −14°; SKIP right 21 rotated +14°; 34,
  top 89, no fill.
- **Swipe:** threshold 89. Exit `(dir × 480, 55) rotate dir × 28°`, opacity
  0, 420 ms ease. New cards enter from `y −34, scale .85`.
- **Empty:** fades in 600 ms after 200 ms. Disc 144 bobs 4.2 s (y −8,
  ±2°). "Nothing left to do" 34/600. Back button lime, 55 tall.
- **Footer:** "Tick all N and today lands on **X**."
- **Close:** reverse clip; after 560 ms run `settleScore`.
- **Confetti:** 42 pieces, seeded (mulberry32(45)). Per piece:
  `dx = (r − .5) × 340`, `dy = −89 − r × 233`, `rot = (r − .5) × 900°`,
  delay `r × 180 ms`, width `5 + round(r × 5)`, height 13, radius 2.
  Colours `#f6eddc #ecdfc8 #e0d0b4 #fff8ea #cdb8d2 #d6f34a`. 1.8 s on the
  `confetti` curve: 0% scale .6; 30% at `(dx × .6, dy)`, rot × .4; 100% at
  `(dx, dy + 460)`, full rotation, opacity 0. Origin 50% / 40%.

## Meal edit sheet

- Sheet 8 from the sides and bottom, radius 42, padding 13/21/21, max
  height 610, scrolls. Enters from below over 520 ms spring. Veil plum at
  20%, no blur. The header stays above the veil so the score is visible.
- **Top row:** 55 photo, radius 13, slow Ken Burns over 21 s (scale 1.04 →
  1.21, translate −3/2); name field 21/600; time field; close 34.
- **Live chip:** plum, "Today 1 497 kcal · score 72" with an 8 swatch in `col(s)`.
- **Portion:** 34 buttons (pressed .9). Steps of 0.5, from 0.5 to 4. The
  value bumps to 1.16 over 480 ms spring. Meal kcal 34/600.
- **Macro tiles** P/C/F: a rail with the rest of the day in ink3, then this
  meal from there, in the macro colour or rose when over. Targets P 120,
  C 210, F 60.
- **Ingredient rows:** 47 tall. Swipe left shows an 89 rose Remove. Past
  −34 it rests open at −89; past −160 it removes. Removal collapses height
  and opacity over 320 ms. A fixed row flashes green-soft for 1.2 s.
- **Fix results:** dashed box. While reading: lime shimmer (900 ms loop)
  for the length of the request.
- **Delete:** rose outline, 48 tall, inline confirm. **Done:** plum, 55 tall.
- **Number counts:** 700 ms, ease-out cubic `1 − (1 − k)³`.

## Island

- **Compact:** 126×37, radius 21, 11 from top, black. Mini rings (21, r
  9/6/3, stroke 2.4, `#f59257 #ea6a8d #a98ae6`, track at .25; the outer
  ring animates 900 ms ease) and the score 14/700 lime.
- **Plate (expanded):** 358×84, radius 34, padding 13/21. Grid 44 / flex /
  34: thumb 44 radius 13 with a lime scan line (1 300 ms); title 15/700;
  sub 12/500 `#aeaeb2` with the newest item in lime; ring 34 (r 14, stroke
  3.5, track `#2c2c2e`) with the percent 10/700. Bar 5 tall, track
  `#2c2c2e`, lime fill, green when done. Done: green check disc scales in
  520 ms `ispring`.
- **Receipt:** 358×62, radius 31. Grid 34 / flex / auto: check disc (in
  after 240 ms), title and sub, score 34/600 lime. "All done" variant:
  lime disc with a plum check.
- **Timing:** size and radius 620 ms `ispring`. Compact content out
  200 ms; expanded content in 200 ms after a **180 ms** delay. Receipts
  collapse after **2 600 ms**; a finished plate read holds 2 600 ms too.
- **Copy:** "Reading your plate…" / "…what you said…" / "…your note…".
  Receipt `"<move> / +Δ · score S · moves X of 5"`. Last tick
  `"All done today / streak N · moves 5 of 5"`.
- **Header:** in 48 the open island covers the status row. The owner
  flagged it. The app pushes the header down instead (see the spec).

## Grain

One 128×128 tile, seeded (mulberry32(7)): each pixel grey `120 + r × 135`,
alpha 34/255 when `r < .55`, else clear. Tiled on cream surfaces only: the
page, shelf cards, the do cards, sheets, focus cards, the tooltip. Never on
the header, the plum, or the video. Static.

## Placeholder data (never ship)

The date and user, every LIFE/BLOOD/GENES row, the 86 seeded past days and
their reason strings, the three meals and their ingredients, the five
moves, PAST marker values and lever deltas, the PhenoAge card, the sleep
hypnogram, the voice transcript, island item lists, the Fix parser, the
Vitamin D suggestion.
