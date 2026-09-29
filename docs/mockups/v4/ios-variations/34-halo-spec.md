# Variation 34 "Halo" spec

One dark room, one lamp. The arc is the lamp, its colour is the score, and the room is lit by it. Halo is one of the two sparse variations in the set, the counterweight to the chart-dense pair; it keeps cutting rather than adding.

Output: `docs/mockups/v4/ios-variations/34-halo.html`, self-contained, no build, vanilla JS, Inter, two 390x844 phones. The orchestrator owns `index.html` and the page chrome above the phones.

## Mandatory reads

- `25-onion.html` (whole file): the phone frame, status bar, and the LIFE / BLOOD / GENES / LOG data with the score arithmetic. 25-onion owns three concentric rings; Halo must not repeat them.
- `24-glow.html`: the `open` class on phone 2, the meal data.
- `ref/appstore-recovery.jpg`, `ref/appstore-wearables.jpg`, `ref/appstore-labs.jpg`, `ref/appstore-food.jpg`.

## Data (do not change)

LIFE, BLOOD, GENES, LOG and the score maths copied from 25-onion. Score 72, lifestyle 77, blood 71, genes 63, weights .40 / .45 / .15, `console.assert(score === 72)` kept. PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, down from 168 on 9 Dec 2025, projected 104 eight weeks on. Vitamin D 29 ng/mL. Sleep 7h 30. APOE ε3/ε4.

## The foot notes carry data only

Three tables: the score arithmetic with its weights, the draw of 1 Aug 2026, and the projection from 131 to 104. **No rule tables, no "how the light works", no claims about the design.** A design that prints its own rules underneath itself has not made the rule visible, and a printed rule is a list of exceptions waiting to be found. The render carries the rule or it does not carry it.

The tables sit on the phones' own 835 px column so the page reads as one column, with a first column pinned to 132 px, a ruled header, and tabular figures. No arrow glyphs: `78 → 77` renders in a fallback face at a different weight and reads as markdown that escaped, so it is written as "protein 78, averaging 77".

## The light

**Hue from the score.** `hue = 6 + score ÷ 100 × 200`. Zero is red, twenty amber, a hundred phosphor; 72 lands on 150. Saturation stays low, 34 % at the dim end of the arc to 62 % at the bright end: a clinical instrument, not gaming hardware.

**The room is lit, not just the type.** This is the part that took four rounds. A screen-blend layer cannot tint white text and a blur behind the arc is a drop shadow, so neither delivers the premise. What delivers it is painting the surface itself: two asymmetric radials on `.phone::before`, opaque, in hue-tinted near-blacks that fall from `hsl(h 46% 13%)` under the lamp to flat `#05060a` by the middle of the screen. Sampled from the render, the card just under the arc is (13, 22, 17), mid-screen (6, 7, 11) and the bottom (5, 6, 10).

**Nothing near the lamp is pure white.** The 72 is `hsl(h 48% 93%)`, the headline `hsl(h 34% 90%)`, the date row `hsl(h 16% 46%)`, and everything past the middle of the screen is neutral grey. Sampled: the brightest ink of the 72 measures green minus red of **18**, the headline **17**, the "Two markers" header **0** and the Vitamin D row **1**. The falloff is visible at a glance, not just to a script.

**One emitter.** The unlit track is 2.2 % white, near invisible. No end bulb, no chart fills, no second glow.

## Phone 1, home

Three blocks, and the second one is unambiguously second.

1. **The lamp and the fact.** One arc, 270°, radius 104, stroke 19, 48 segments, a tight blur at 3.5 and a long one at 26. Inside it, 72. Under it, the interesting fact at 21 px, "2.8 years younger than 39", with the metric behind it at 12.5 px: "PhenoAge 36.2, drawn from the panel". The metric is not the headline; the conclusion is. The "up 2 since Monday" microcopy is gone, it is a template tic.
2. **The one thing to act on**, 62 px of air below the lamp, at 19 px: "Two markers are outside their range", then Vitamin D 29 ng/mL and LDL cholesterol 131 mg/dL. Nothing else on the screen is set above 13 px, so there is no question what to read second.
3. **The layers**, quietest, one 12.5 px grey line: Lifestyle 77 · Blood 71 · Genes 63.

The 14-day sparkline is **cut**. A flat wobble with no scale is decoration, and this is the sparse variation.

**No hairlines anywhere.** Blocks are separated by tone and space. A lamp lights surfaces; it does not draw lines.

**One numeral style.** Weight 500, tracking −0.045em, tabular figures, on the 72, on both row values and on the sheet's 131. Three sizes, one treatment. Units sit on their number's baseline, not floating beside it: measured in the render, "29" bottoms out on y 686 and "ng/mL" on y 688, the two pixels being the descender of the g; "131" on y 767 and "mg/dL" on y 769.

**Three greys**, `--g1` .92, `--g2` .55, `--g3` .3, and no fourth.

**The chrome.** Status bar at real proportions: Dynamic Island 125 x 36 at top 11, four ascending bars, wifi, a battery with a nub. The tab bar is a quiet native bar flush to the bottom, hairline on top, four items, active signalled by a filled glyph. **No home indicator drawn**: a bar on every frame is a template tell, and dropping it also stops the sheet's last line clipping a pill.

Below the fold, in the same voice: Today, sleep over seven nights, all seven markers. The fold is a page break, so no header is ever sliced by the scrim.

## Phone 2, the LDL sheet

**The sheet is lifted, not pasted.** Its top edge carries a 1 px lit rule at `hsl(h 55% 62% / .3)` because it is catching the lamp; a 210 px gradient inside it carries that light down and dies; the shadow is three-layered, a tight 14 px contact shadow and a 90 px ambient one. The grab handle is 40 x 5 at 42 % white, not a whisper. **The tab bar does not vanish**: it stays where it is at 55 % opacity and half brightness under the sheet, so the phone keeps its floor.

The chart is on a scale, not hovering: a left axis at 160 / 130 / 100 with the unit written once, the aim line at 100 brighter than the others with the zone below it shaded, and a tick dropping from each point to its date. The measured leg 168 → 131 is a solid 2 px white; the projection to 104 is the same stroke at 26 % ending in a hollow ring. **No dotted projection line**: that dash is in every health mockup ever generated.

Then the levers, split by whether they have happened, with the direction spelled out so a negative number does not have to be decoded: **Already doing · each takes LDL down** (oats −9 mg/dL, walk −6 mg/dL) and **Not started · APOE ε3/ε4, so fat counts double** (drop the pork belly, −12 mg/dL). The deltas are 13 px at 55 %, well under the 46 px 131, so they cannot compete with it. Last, one plain sentence, no bold fragment, on this phone only.

## Motion

| What           | Moves                                                                     | Duration |
| -------------- | ------------------------------------------------------------------------- | -------- |
| Arc            | draws segment by segment at 18 ms apart                                   | 1 300 ms |
| Sheet          | lifts; the room dims to 42 %, the screen falls back, the bar dims to 55 % | 460 ms   |
| Reduced motion | the arc lands drawn, the sheet cuts in                                    | 0        |

## Verify

```
cd docs/mockups/v4/ios-variations
python3 -m http.server 8811 &
perl -e 'alarm 60; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=8000 --user-data-dir=/tmp/hl-34 --window-size=900,1500 --screenshot=/tmp/shot-34.png http://127.0.0.1:8811/34-halo.html
```

Then sample the PNG with PIL rather than trusting intent. A rule that is correct in code can still be wrong in perception, and the render is the thing being judged: the green band that survived three rounds of "nothing else is coloured" was correct in the source and wrong on screen.

Checks: `hsl(` in the dumped DOM appears only on the 48 arc strokes. `text-transform`, `→` and `class="home"` all return zero. The 72 measures a green cast of 18 and rows below the middle measure 1. Number and unit share a baseline. No duplicate ids, nothing cut on the sheet, no overflow at 900 or 1280.
