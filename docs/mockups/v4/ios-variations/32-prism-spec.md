# Variation 32 "Prism" spec

Direction: iOS 26 Liquid Glass, dark, done as an instrument rather than a wallpaper. **One** light source, at one point, with **one** hue set by the score. Every pane's rim angle and brightness is solved against that point, and every panel carries a chart.

Register: the App Store shelf the owner pointed at, WHOOP / Oura / Superpower / Function Health. Charts carry the argument; prose gets one sentence; labels are sentence case and few.

Traps avoided, each one a note from the cold critic on the first cut:

- **More than one light.** Two lobes in the field is two lights, whatever the copy says. There is now a single radial source at 13 % across and 1 % down, and nothing else. The whole phone falls off from it.
- **A border pretending to be a rim.** An even 1 px stroke on four sides is a CSS border with opacity. The rim is a conic gradient started at each pane's own bearing away from the source, so the near edge is white and the far edge is darker than the pane.
- **A rim that is correct but invisible.** A conic that peaks at 66 % white composites down to about the pane's own blue and reads as nothing. The lit arc now hits pure `#fff` at 1.5 px. Sampled off the render: the hero's top edge peaks at rgb(248, 249, 252) and the LDL card's at rgb(255, 255, 255), against far edges of rgb(15, 17, 33) and rgb(7, 7, 13), both darker than their own bodies.
- **Design notes in the foot tables.** A "how the glass is built" table is a checklist a critic will audit the render against, and it is not data. Gone. The foot notes carry the score arithmetic, the hue arithmetic and the chart sources, nothing else.
- **A screen that dies at two thirds.** Fixing bisected text by padding the scroll leaves a hole above the tab bar. The LDL chart grew instead, and the hem is now 131 px starting exactly where that card ends.
- **One blue doing semantic work.** "borderline" set in the same grey as an axis label is the palette failing at the one place it matters. The palette is the light plus one semantic colour: amber for borderline, rose for off.
- **A pane with a fill gradient of its own.** A blue-to-black gradient on the score card makes it self-lit, which contradicts the whole solve and is also the most generic dark-mode card there is. Every pane is now a flat `rgba(255,255,255, 0.022 + 0.035 × lit)` tint. All the direction comes from the backdrop, the rim and the shadow.
- **One chart drawn twice.** Unifying the grammar is not the same as repeating the image. The card carries the shape (two draws, the tail, the threshold); the sheet carries what only a detail view can: the dated axis to the 1 November draw, the month ticks, the target range and the ±9 spread.
- **A concept that lives in a caption.** "hue 215, from the score" in a table is not a design. The score card draws the mapping: a rail from act to strong painted with the same formula, and a marker at 72. The phone is the colour under the marker.
- **A fixed top-left sheen.** A `::before` highlight nailed to the top-left corner contradicts a source the pane can be below or beside. Removed; the body gradient carries the direction instead.
- **Glass that does not refract.** Dimming the field behind a pane is not refraction. Each pane carries a solved, magnified, displaced copy of the light (below).
- **Spec text in the UI.** "WEIGHTED .40 .45 .15" is the formula leaking onto the phone. The arithmetic lives in the foot notes, and only there.
- **Three KPI chips.** LIFESTYLE / BLOOD / GENES with three differently-hued bars is the generic dashboard pattern and it broke the one-hue rule. Gone; the three numbers are one quiet line under the score.
- **Label sprawl.** No tracked small caps anywhere. Sentence case, `--ink-3`, two per pane at most.
- **The sheet repeating the card.** The two LDL charts are different instruments, not the same image at 1.3x.

Output: `docs/mockups/v4/ios-variations/32-prism.html`, self-contained, no build, vanilla JS, `-apple-system` before Inter, two 390 x 844 phones side by side inside `.doc` with the eyebrow / h1 / one-sentence lede header and the foot-note tables under them, like 25-onion and 26-matrix. `index.html` is not touched; the orchestrator adds the row.

## Mandatory reads

- `25-onion.html` (whole file): LIFE / BLOOD / GENES / LOG, the score arithmetic, the `.doc` / `.phones` / `.cap` wrapper, the phone frame, the status bar, the foot-note tables.
- `24-glow.html`: meal rows, the `data-do="open"` / `.phone.open` sheet pattern.
- `26-matrix.html` and `26-matrix-spec.md`: the house spec format.
- `ref/appstore-labs.jpg`, `ref/appstore-recovery.jpg`, `ref/appstore-wearables.jpg`, `ref/appstore-food.jpg`.

## Data (do not change)

Copied from 25-onion. Score 72, lifestyle 77, blood 71, genes 63, weights .40 / .45 / .15, `console.assert(score === 72)` kept. PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, from 168 on 9 Dec 2025. Vitamin D 29 ng/mL. Sleep 7h 30. APOE ε3/ε4. Next draw 1 Nov. Projection sentence verbatim: "Keep this eight weeks and LDL lands near 104, from 131."

Marker values are read off the same `BLOOD.rows[].s` strings, never retyped.

## One hue, set by the score

`hue = 330 − score × 1.6` → 215 today, azure. Set once in JS on `documentElement` as `--h`, CSS fallback 215. The accent `A = hsl(h 100% 68%)` is the **only** colour on the phone. Two exceptions, both semantic and both earned: amber for a borderline marker, rose for the one that is off. In-range markers are white, so six of the seven rows carry no colour at all.

A worse score warms the whole phone: the flood, the accent, the verdict word and every chart stroke are the same hue, so the rule is visible rather than asserted.

## The light

Declared once on `.phone` as a custom property so the panes can refract this exact image:

```
--light: radial-gradient(132% 78% at 13% 1%,
  hsl(h 100% 62%) 0%, hsl(h 98% 45% / .92) 18%, hsl(h 95% 32% / .72) 38%,
  hsl(h 92% 20% / .44) 60%, hsl(h 90% 12% / .2) 80%, transparent 100%);
```

One lobe. Its core sits just off the top-left corner so no pane sits on a hot spot, and the falloff is long enough to reach the bottom of the scroll. `.field` paints it at `background-size: 100% 100%` over `#05060a`; `.veilbg` is a vignette to `rgba(4,5,9,.74)` so type never sits on full-strength colour.

## The global solve

The source is one point, `SRC = [0.13, 0.01]` of the field. On every `refract()` pass each `.pane`, the `.sheet` and the `.tabs` get two custom properties from their own rect:

```
deg = atan2(dx, −dy)                      the CSS bearing away from the source
lit = max(.06, 1 − hypot(dx, dy) / reach) reach = field diagonal × .86
```

`lit` is raised to the power 1.5 so the near/far difference is past comfortable rather than subtle. `--a` drives the body gradient and the start of the conic rim; `--lit` drives the body's white stop, the body's black stop (which gets *darker* as lit falls), the rim's white stop, the lens opacity and the drop shadow. Nothing on the phone lights itself. Verify by dumping the DOM: thirteen elements carry a solved `--a` and `--lit`, and they vary monotonically down the screen.

## The refraction

`.lens` is a child of every pane and of the sheet. It paints the same `--light`, and JS solves its `background-position` per pane so that **the pane's centre samples exactly the point behind it** while everything else is magnified by `k = 1.12` and pushed 7 px:

```
Px = −k·(paneLeft − fieldLeft) − paneWidth·(k − 1)/2 − 7
```

Then it is masked with `radial-gradient(116% 116% at 50% 50%, transparent 38%, #000)`, blurred 8 and set at 50 %, so the displacement shows at the pane's edges and dies in the middle. That is what a thick pane of glass does: clear through the centre, bent at the border. Re-solved on scroll, resize, load and `document.fonts.ready`.

Verify it by dumping the DOM: every `.lens` carries its own solved `background-position`, and the sizes are the field's 374 x 828 times 1.12.

## The rim, and the thickness

Body: a flat tint, `rgba(255,255,255, 0.022 + 0.035 × lit)`, and nothing else. No pane owns a gradient. Rim: `::after`, 1.5 px, `mask-composite: exclude`, `conic-gradient(from var(--a))`. The sweep starts pointing away from the source at 1 % white, climbs to `0.3 + 0.68 × lit` at 47 %, hits a hard `#fff` specular at 50 % (the bearing straight back at the source), and falls away again by 60 %. Narrow and white, not a wide wash. hue+74 sits at 78 % at `0.2 × lit`. Thickness: the body gradient runs `0.03 + 0.15 × lit` white at the lit edge, 3.5 % at the middle, black 24 % at the far edge, all at `--a`. Entry face, body, shadowed exit face. No inset strokes anywhere, so a pane low on the screen is genuinely darker than one high on it.

Depth: the score pane blurs 28, every other pane 18, the sheet 30 over a 13 px scrim.

## The hem

The tab bar floats over the scroll, so `.hem`, a 194 px gradient at `z-index: 3` (screen 2, bar 4), reaches solid `#040509` at 27 % of its height, which is 50 px above the bar. Combined with 150 px of bottom padding on `.screen`, no glyph is ever bisected by the bar at any scroll position: content dissolves completely before it reaches the bar.

## The charts

Seven, all inline SVG generated in JS, all ids suffixed per phone. One accent, one line weight family, axis labels in sentence case at 9.5 to 10 px.

**One grammar, different content.** Every chart uses the same fill (one linear gradient of the accent, .3 to 0), the same hairline baseline at 22 % white, the same 9.5 px axis labels, filled dots for measured values and **hollow** dots for projected ones. Both LDL charts share one y scale, 96 to 180, with the 100 line dashed. The sheet chart is denser, not different.

1. **Score, 14 days.** `[64…72]`, area under one line, today's point white. One label: "14 days".
2. **LDL on 01, the shape.** No y axis and no gridlines: the two draws, the dashed tail to a hollow 104, the amber threshold labelled "borderline above 100", and the two dates. The dashed tail starts 5.5 px clear of the measured dot so the dot never looks like it sits on the dash. The fill stops at the 1 August draw, so the projection is never filled as fact.
**The state colour.** The palette is the light plus one warm: amber carries "borderline" everywhere it is true, on the tag, on the 131 numeral in both charts, on the measured 1 August dot and on the 100 threshold. Rose is held for "off", on the draw panel.

3. **LDL on 02, the instrument.** The same three points on a **dated** axis, 9 Dec 2025 to the 1 Nov draw, 327 days, eleven months ticked with every third tick longer. Y axis 100 to 180 with 100 dashed. **Two annotation systems, not six:** the axis (grid, month ticks, three dates), and one value on each of the three points. The spread opening to ±9 over the eight weeks is drawn as a 16 % polygon because it is data, not annotation. The leader lines, the "−37 banked" callout, the next-draw rule and the lever bracket are all gone; the three lever rows below the chart carry that, and the chart stays a chart.
4. **Sleep.** Distance from the 7h 30 target, not height off zero. A stem and a dot per night; a zero baseline over a 6.4 to 7.9 range draws seven identical bars and says nothing.
5. **Fuel.** 1 497 of 1 900 kcal, 93 of 120 g: bar to the value, hairline track to the target, tick at the target.
6. **Markers.** The seven from the draw, off first, each on its reference band. White for in range, amber for borderline, rose for the one that is off.
7. **Genes and the day.** Four variant bars at 45 / 100 / 60 / 45, and the three meals as one stacked 1 497 of 1 900 bar, both in the single accent at stepped opacities.

## Phone 1, home

Status bar (island 118 x 34, and the signal, wifi and battery **drawn** as SVG rather than approximated with punctuation), then a monogram, the date in sentence case, a bell. The greeting takes the three layer numbers as its second line, so it does a job. Then the score pane, and it has to win the screen: 78 px, no "/100", the verdict beside it on the baseline, **one** supporting line (PhenoAge 36.2 at 39 · up 2 since Monday), and the 14-day chart. It is the closest pane to the source, so it is also the brightest and its rim is the whitest on the phone. Then one pane per domain, each leading with a real marker and its chart: LDL 131 (a button, opens the sheet, and it carries the projection sentence), Sleep 7h 30 with the fuel chart under it, the 1 August draw leading with vitamin D 29, APOE ε3/ε4, and the day with the meal rows and photos from `img/08-*.jpg`.

Verdict: `>= 80` Strong, `>= 65` On track, `>= 50` Watch, else Act.

## The tab bar

The active tab is a lit piece of glass on the same `--a` (white 30 % to 6 %, inner white 55 %), not a grey oval. 22 px radius, so it belongs to the same family as the 26 px cards and the 40 px bezel rather than being a 999 px pill. The active tab is white 10 % with a 28 % inner top edge, quiet enough not to compete with the score. One capsule, on the same global solve as the panes (`0.16 + 0.4 × lit` white at the lit edge, blur 26), sitting 30 px off the bottom so the home indicator has room and the plus divider matches the height of the active pill. It contains all four controls: Today / Body / Blood and the plus behind a 1 px divider inside the same pill. The active tab is a lighter glass capsule, not a filled blue one: no third nested dark.

## Phone 2, the LDL sheet

`.phone.open`. A sheet sits over the home screen, so the home screen is still there: `scale(.95)` from a 30 % origin, blur 2, `brightness(.5)` under `rgba(4,5,9,.42)`. Dimmed and pushed back, and still legible, which is what iOS does. Heavier blur turns it into a smear that reads as a broken render. A grabber and no close X (one affordance, not two). Title, one line of prose, the instrument chart, then the levers: no toggles. A toggle in the accent on a pane of the same accent cannot read, so each lever is a white filled circle with a dark check, its name, a frequency (all three rows carry one), and its contribution on the right, and the separation is type rather than colour. No arithmetic on the phone: the three contributions and the landing dot at 104 carry it, and the sum lives in the foot-note tables.

## Motion

The sheet rises 420 ms on `--ease` over a 320 ms scrim fade, both cut to 0 under `prefers-reduced-motion`. Nothing else moves and nothing pulses. The only bloom on the page is a single blurred duplicate under the LDL run at 18 to 20 %.

## Foot notes

One table, tabular figures throughout, and the same left edge as the header, the captions and the phones (one 835 px column): the score arithmetic with the hue arithmetic as a fifth row. Nothing else. A table of rules is a checklist to audit the render against, and it is not data. Every number that appears on a phone appears here; no arithmetic appears anywhere else.

## Verify

```
cd docs/mockups/v4/ios-variations && python3 -m http.server 8811 &
perl -e 'alarm 60; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --hide-scrollbars --virtual-time-budget=6000 \
  --user-data-dir=/tmp/hl-32 --window-size=900,1500 \
  --screenshot=/tmp/shot-32.png http://127.0.0.1:8811/32-prism.html
```

Headless Chrome drops `backdrop-filter` under `--disable-gpu`; run without it. The design still reads if the blur degrades, because the body, the rim and the lens are all painted.

Checked: no console output and no failed assert, no horizontal overflow at 900 or 1280 px, no duplicate DOM ids, three images requested and all three present in `img/`, no external asset beyond the Google Fonts link, every `.lens` carrying its own solved background-position, and no label collision or crop at any scroll position on either phone.
