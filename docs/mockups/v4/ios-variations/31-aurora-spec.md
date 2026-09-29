# 31 · Aurora

**Direction.** The sky is the score. The home screen is the sky, the number and one sentence, and
every other figure lives in the sheet that covers it. An empty screen only works when the surface
filling it is worth looking at, so the sky is the thing that has to be built, not the thing that
covers the gap. This round the sky stopped being a hue ramp and became **one moment of light**: a
sun at an altitude, a horizon, and a short sweep of hue around it.

**Craft reference.** iOS 26 Liquid Glass, Apple Weather, Apple Fitness summary, and the App Store
shelf in `ref/appstore-labs.jpg`, `ref/appstore-recovery.jpg`, `ref/appstore-wearables.jpg`.

**Traps walked into, then out of,** in order:

1. _The Figma mesh default._ Saturated blobs under a white wash, cards blurring paint that is
   already white.
2. _The tennis ball._ One hue at 90–100 % saturation top to bottom. A sky is many hues at low
   saturation.
3. _Cards on a gradient._ If the panels carry the structure, the sky does not.
4. _The settings list._ Taking the panels off and putting a hairline between every module swaps one
   generic structure for another.
5. _The CSS ramp._ Three things on a screen was right, but the gradient was still evenly spaced
   stops with no horizon, no light source and no grain.
6. _Three hues that are not one hour._ Yellow into green into cobalt is not a time of day. The fix
   is not a nicer palette, it is a light model: pick where the sun is, then let the air take its
   colour from that. Nothing in the map can now reach green.

7. _A soft radial blob is not a sun._ A white blur on a mesh gradient is the most recognisable
   Dribbble tell of the last three years. A sun is a disc with an edge, a corona that falls off
   fast, scatter that reaches across the whole sky, and an aureole where the air is thickest along
   the horizon. And nothing was lit by it: the type and the sheet were flat ink on a picture of
   light.

8. _The sheet repainted the sky._ A tinted fill plus `saturate(170%)` turned the same 72 into two
   different skies: violet into peach on one phone, pink top to bottom on the other. A sheet that
   carries the premise cannot have a colour of its own.

**Output.** `31-aurora.html`, one self-contained file, vanilla JS, no build step, no dependencies
beyond a Google Fonts link. Two 390 × 844 phones in the house `.doc` wrapper.

**Mandatory reads.** `25-onion.html` for the data and the arithmetic, `24-glow.html` for the sheet
mechanics, `26-matrix-spec.md` for this format.

---

## Data

Copied from 25-onion, unchanged. LIFE, BLOOD, GENES and the weights .40 / .45 / .15 give
lifestyle 77, blood 71, genes 63 and a score of 72, held by `console.assert(score === 72)`.
LDL 131 mg/dL drawn 1 Aug 2026, down from 168 on 9 Dec 2025, projected to 104 on 4 Nov 2026 from
levers worth 12 + 9 + 6 = 27.

## The foot notes

**Set in mono, so they can never be read as product copy.** One register, one size: the whole notes
section is `ui-monospace` at 13 px, headings included, uppercase and letter-spaced, under a rule
that separates them from the phones. Data and arithmetic only: the score table, the light map, the
three draws, the motion durations.
**No table states a design rule and no line claims a quality**, and **no cell is empty**: the two
rows that carry arithmetic rather than a weight span the column instead of leaving a blank. The light is explained by five
rendered skies — scores 40, 60, 72, 85 and 100, each 104 × 208 px with its own sun, labelled with
its score, its light angle and its sun altitude — so the map is shown as a mapping, not as a strip.

## The light

```js
const w = score / 100;
const LIGHT = Math.round(252 + w * 158) % 360; // 72 -> 6°,   an apricot dawn
const SWEEP = Math.round(64 + w * 66); // 72 -> 111°, how far the sky travels
const ZEN = (LIGHT - SWEEP + 720) % 360; // 72 -> 255°, the zenith
const SAT = Math.round(28 + w * 26); // 72 -> 47 %
const ALT = +(60 - w * 42).toFixed(1); // 72 -> 29.8 % down the screen
```

One number sets one hour. `LIGHT` is the colour of the light itself: 252° (a cold blue) at nought,
through violet and rose, to an amber 50° at a hundred. `SWEEP` is how far the air travels from that
light to the zenith, and the zenith is `LIGHT − SWEEP`, so **the sweep never crosses to the far side
of the wheel and no stop can land on green or cyan.** `ALT` puts the sun higher for a better score.
A 40 is a violet 315° at 43 % down; a 100 is a gold 50° at 18 % down.

**The tonal curve.** Eight stops at uneven positions, each one a fraction of the sweep with its own
saturation multiplier and tone. Lightness rises to 91 % at the horizon and falls to 68 % at the
floor, so the air brightens into the horizon and the ground closes under it.

| At    | Hue                  | Saturation  | Lightness |
| ----- | -------------------- | ----------- | --------- |
| 0 %   | `zen`                | `sat × .60` | 74 %      |
| 14 %  | `zen + .14 × sweep`  | `sat × .58` | 79 %      |
| 30 %  | `zen + .32 × sweep`  | `sat × .62` | 84 %      |
| 43 %  | `zen + .54 × sweep`  | `sat × .70` | 88 %      |
| 53 %  | `zen + .74 × sweep`  | `sat × .84` | 91 %      |
| 66 %  | `zen + .90 × sweep`  | `sat × .86` | 86 %      |
| 84 %  | `zen + 1.00 × sweep` | `sat × .72` | 77 %      |
| 100 % | `zen + 1.06 × sweep` | `sat × .56` | 68 %      |

The peak sits at 53 %, which is where the horizon is drawn, so the tonal curve and the drawn line
are the same event.

## The sun, and the scale it is read against

Four layers, outward in, and **every one of them is `inset: 0`**:

| Layer      | What it does                                                                     |
| ---------- | -------------------------------------------------------------------------------- |
| `.scatter` | 420 px of very weak warm wash, plus the aureole `128% 22% at 72% 53%` on the horizon |
| `.corona`  | 128 px falling off fast: .72 → .36 by 24 %, .14 by 46 %, gone by 88 %             |
| `.disc`    | 27 px with an actual edge: flat to 58 %, then off in three stops                  |
| `.horizon` | the air brightening into one line, `132% 17% at 50% 53%`                          |
| `.rule`    | the horizon hairline and five altitude ticks, drawn in SVG from the score         |
| `.sky b`   | two weather fields, blurred 64 px, `soft-light` at .6                             |
| `.grain`   | `feTurbulence` fractalNoise, `baseFrequency .4`, 2 octaves, 48 % on `overlay`     |

**The altitude is a reading, so it needs a scale, and the scale needs the number.** Ticks on the
right edge at the altitudes of 0, 25, 50, 75 and 100, the ends labelled, the sun's own tick drawn
longer and darker with a dotted line running from the disc out to it — and **the 72 set at 46 px on
that tick, as its label**. The score is said once, at the height it is being read from, so the sun's
position and the number cannot drift apart. The verdict line sits above it, on the same right edge.

**Everything on the sky is lit by the sun.** `.lit` clips a 104° gradient to the glyphs themselves,
`hsl(zen 38% 17%)` on the far side to `hsl(light 44% 25%)` on the sun's side, so the 72 and the
sentence are cool where the sky is cool and warm where the light is. The sheet takes the same rule:
a warm radial at `78% −14%` where the sun sits above it, a cool one at `4% 108%` on the far corner.

**The grain, by measurement not by eye.** 4 octaves at 0.68 is too fine to survive at 1x and 88 %
opacity is sandpaper. A 260 px tile at `baseFrequency .4` and 2 octaves, at 48 % overlay, measures a
per-pixel standard deviation of **2.8–3.0 of 255** in flat sky sampled from a 1x render. That is
dither that reads at viewing size.

**The seam.** An earlier round had a hard horizontal edge two thirds down. The cause was a
`.horizon` box at `top: 42%; height: 210px` holding a radial anchored at `50% 100%`: the gradient hit
full strength exactly at the box's bottom edge and stopped dead. Any layer whose box is smaller than
the phone can leave an edge in the air, so no layer has one now. Verified by sampling an 80 px-wide
averaged column down phone 1 every 2 px: outside the type the largest step is under 6 of 255, which
is the grain.

## Material

| Token       | Value                     | Where                                                 |
| ----------- | ------------------------- | ----------------------------------------------------- |
| Hairline    | 1 px `rgba(16,23,32,.10)` | the sheet edge                                        |
| Data stroke | 2 px                      | the chart line and the dot rings                      |
| Radius      | 35 px                     | the sheet: 55 bezel − 8 border − 12 inset, concentric |
| Blur        | 30 px                     | the sheet and the veil under it                       |
| Cool        | `hsl(zen 42% 24%)`        | the chart, the values, the lever bars, the rail       |
| Numeral     | `hsl(zen 38% 17%)`        | the cool end of the lit gradient                      |
| Warm        | `hsl(light 44% 25%)`      | the sun's end of the lit gradient                     |
| Out of range| `hsl(light 54% 26%)`      | once, and it is ink with the light's warmth in it     |

Two families, because the product and its documentation are not the same thing: **Inter** for
everything inside the phones, **Source Serif 4** for the page header and the notes prose.

Two text sizes carry the UI: **15 body** and **13 secondary**. Numerals are tabular
(`font-variant-numeric: tabular-nums`).

**One unit rule, and it is a class.** `.u` is 13 px, regular, `--ink-2`, 4 px after its value, and
it is the only way a unit is ever set. In the lever rows the value sits in a two-column grid, so
`−12`, `−9` and `−6` right-align on one edge and the three `mg/dL` start on another.

**Contrast, measured on the 2x render**, text core against the pixels beside it: the 72 on the rail
**9.8:1**, the 12 px verdict beside it **5.9:1**, the home caption **7.7:1**, the sheet's 13 px dose
lines **6.4:1**, the 11 px chart dates **7.3:1**. The smallest type over the busiest ground is the
one worth measuring.

## Screen 01 · Today

Three things: the sky, the 72, the sentence. Bottom-weighted, so the open half of the screen is the
half with the sun in it, and the sun is what frames the emptiness.

**Two things, two sizes.** The score is on the rail now, so the bottom block is the sentence at
**28 px** semibold over two lines and the 131 under it at **13 px** with a chevron. The whole block
is one button, and it is the only tappable thing on the screen. Nothing was cut: the score and the
verdict moved up to the sun, where they are the reading.

**The type sits on the ground.** The block is bottom-anchored with 76 px under it, well below the
horizon at 53 %: the sky and its instrument are above the line, the sentence is under it.

**No tab bar.** Four outline glyphs with no bar, no material and a 3 px dot is the stock iOS
placeholder, and it was the only thing on the screen with no reason to be there. The sheet is the
navigation.

## Screen 02 · LDL

**The sheet has no colour of its own.** It is `blur(30px) saturate(106%)` of the pixels behind it
under one flat `rgba(255,255,255,.46)`, and nothing else. No tint ramp, no warm wash, no saturation
push: any of those repaint the sky the sheet is supposed to be showing, and the premise dies. If the
chart needs more separation the white alpha goes up, never the hue. Measured on the render, sampling
the same rows on both phones: sky 275° / sheet 279°, sky 302° / sheet 303°, sky 8° / sheet 8°. The
sheet is the sky, lighter. A 1 px specular edge at 122° and three shadows make it a slab rather than
a rectangle of blur.

It presents the way an iOS sheet does: the screen behind scales to .93 and drops to .30 opacity, so
there is no ink left to ghost through, which is why the veil can sit at 6 % white and let the sky
come through instead of hiding a ghost behind a wash.

The head reads `131 → 104 mg/dL` as one expression, so the 27 is on the page before the section that
explains it, and that section leads with **−27 mg/dL, over eight weeks**.

The chart is 314 × 228, plot from y 34 to 180, domain 96–180, x from 58 to 274, with a 34 px left
gutter for the scale. **The axis holds every point it draws:** hairlines at 175, 150 and 125 with
their numbers in the gutter, so the 168 sits inside the scale rather than above it, and the aim at
100 as a dashed rule named `aim, under 100`. Measured off the 2x render, the four rules land at
y 1320, 1407, 1494 and 1580: 87, 87 and 86.5 px apart, four equal 25 mg/dL steps, so the dashed rule
is at 100 and not at the 104 point.

**A measurement and a promise are not drawn the same.** 168 and 131 are the measured pair: filled
dots, solid lead, 15 px at 700. The 104 is 14 px at 500, muted, on a hollow dot at the end of a
dashed lead, and its date is muted with it. **Every dot drops a dotted line to its own date**, and
the projection now has a date — 4 Nov 26 — rather than the word "projected" standing in for one.

The three levers are one scale: each bar sits in the same 132 px track, tinted at 16 %, filled to
its **share of the 27** — 44.4 / 33.3 / 22.2 %, which is 12, 9 and 6 over 27, not three round
numbers. The row is two columns and two ends: name over dose on the left, value over bar on the
right, both flush to the same edges. No icons, no photographs.

## Motion

| What  | Moves                                                       | Duration                                       |
| ----- | ----------------------------------------------------------- | ---------------------------------------------- |
| Sky   | two fields drift and scale on soft-light                    | 41 / 61 s, none under `prefers-reduced-motion` |
| Sheet | rises from the bottom edge, the screen falls back behind it | 420 ms, none under `prefers-reduced-motion`    |

## Verify

```
python3 -m http.server 8811 --directory docs/mockups/v4/ios-variations
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=900,1500 --screenshot=/tmp/shot-31.png \
  --virtual-time-budget=4000 http://localhost:8811/31-aurora.html
```

**Never pass `--disable-gpu`.** It flattens `backdrop-filter` and the sheet screenshots as flat
white, which is a render artefact and not the design.

Checked on the render: no console output at all (so `console.assert(score === 72)` is silent and
nothing threw), `>72<` twice in the served DOM, six ids and no duplicates (the horizon gradient is suffixed with
the phone's own id, so two phones cannot collide),
`scrollWidth === clientWidth` at both 900 and 1280, the sky sampled column by column for a
discontinuity, the grain measured at 1x, and the two lowest-contrast elements measured rather than
assumed.
