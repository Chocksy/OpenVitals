# Variation 33 "Cadence" spec

Source: Apple Health detail screens and Function Health from `ref/appstore-labs.jpg`, for the register only: light grouped-inset lists on `#f2f2f7`. The structure, the icons, the card anatomy and the palette are ours.

Output: `docs/mockups/v4/ios-variations/33-cadence.html`, self-contained, no build, vanilla JS, Inter, two 390x844 phones side by side like 24-glow and 25-onion. The orchestrator adds the `index.html` row; this file does not touch it.

## Mandatory reads

- `25-onion.html` (whole file): `.doc` wrapper, `.phones`, `.cap`, the 390x844 frame, status bar, the LIFE / BLOOD / GENES / LOG data with the score arithmetic.
- `24-glow.html`: meal rows, glass tab bar.
- `26-matrix.html` and `26-matrix-spec.md`: the house spec format.
- `ref/appstore-labs.jpg`, `ref/appstore-recovery.jpg`.

## Data (do not change)

Score 72, lifestyle 77, blood 71, genes 63, weights .40 / .45 / .15, `console.assert(score === 72)`. PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, from 168 on 9 Dec 2025. Vitamin D 29 ng/mL. Sleep 7h30. APOE ε3/ε4. Energy 1 497 kcal of 1 900 (`console.assert(KCAL_TODAY === 1497)`), protein 93 g of 120. Levers −6 −4 −11 −6, `console.assert(131 - LEVER_SUM === 104)`. The sentence: "Keep this eight weeks and LDL lands near 104, from 131."

## The argument: two cadences, and the whole screen is sorted by them

Two section headers, and they are the only headers on the screen: **MEASURED EVERY DAY** and **MEASURED WHEN IT IS DRAWN**. Everything below each one obeys that cadence, and five things carry the difference. No glyph explains it; the cards do.

|                                 | A beat                                                                                                                                                                                  | An event                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| What                            | health score, time asleep, energy and protein, the four signals                                                                                                                         | LDL, the seven markers, the variants                                                                         |
| Card control, right of the name | a range chip you could tap: `14 days ⌄`, `7 nights ⌄`, `Today ⌄`, set in `--ink-3` with no fill so it never outweighs the readout. You can choose a window because there is always more data                                                             | grey meta text: `2 draws · next 1 Nov`, `Read once, Mar 2026`. No chip, because there is no window to choose |
| Plot floor                      | banded by week, alternate weeks tinted `--ink-3` at 5%, a hairline at each boundary, and each band labelled inside its own top-left (`27 Aug – 2 Sep`) so the tint is never unexplained | no bands. Nothing repeats, so nothing is banded                                                              |
| Marks                           | no dots at all, only the cursor ring: a beat has a value every day and dotting all fourteen is noise                                                                                    | a filled dot per measurement and a hollow one for the estimate. A dot means a needle went in                 |
| Hue                             | `--beat #2f6d8f`                                                                                                                                                                        | `--event #b4553f`                                                                                            |

Weekdays are named, not shaded: on the sleep plot `Sat` and `Sun` are set in `--ink-2` at weight 700 while the other five stay grey.

## Colour: two hues, and they mean the two cadences

`--beat #2f6d8f` and `--event #b4553f`, with `--beat-2 #7ba3ba` and `--event-2 #d59a89` as the second step inside a stack (the meal bars, the protein bar, the in-range markers). Chrome, the back button, the selected tab and the range chips take `--beat`, because the app frame is the thing that is there every day. That is three tints of one hue and two of the other, and no third accent anywhere. Direction is carried by a sign, not a colour: the readout shows `+2` and `−37` in `--ink-2`, so an improvement never has to be coded green.

## Chrome: ours

Tabs are `Today · Rhythm · Labs · Me`, drawn as one family: the same 24 grid, the same 6.5-to-19 optical box, one 1.7 stroke, round caps. Three beats of different height, a run of beats, a tube, a ring with its centre filled. No heart, no moon, no magnifier, no chevron on any card. The home indicator is 139 x 5 at 6 px from the bezel, iOS proportions.

## `plot()` — the shared grammar

All eleven SVGs go through it. It owns the axis, the gridlines, the labels, the bands, the fill, the readout and the cursor; a chart supplies its domain and its marks.

```
plot({ h, min, max, orient, xn|xmin/xmax, xLabels, xticks, weeks, weekLabels,
       marks, accent, hero:{val,unit,sub,delta,x,y}, pts, deltaBase, forecast, series(sc) })
```

| Token     | Value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `G.w`     | 310 = 374 phone − 32 screen inset − 32 card padding, so every viewBox renders 1:1                            |
| `G.band`  | 54 px reserved above every plot for the readout                                                              |
| `G.pad`   | l 38 (the gutter holds a value and its qualifier), r 22 (so the last ring never touches the card edge), b 20 |
| `G.grid`  | `var(--line)`, 1 px                                                                                          |
| `G.label` | 9.5 px, weight 500, `var(--ink-3)`                                                                           |
| `G.hero`  | 30 px, weight 700, `var(--ink)`; unit 0.42 of that, weight 600, `var(--ink-2)`                               |
| `G.line` | 1.8 px · `G.fillOpacity` 0.09 · `G.dot` ring r 5 · `G.ticks` 3 |
| Plot frame | none. Gridlines only: no axis rule on the floor, no box around the plot, nothing that closes the rectangle |

Fixed inside `plot()`, no per-chart override:

| Fixed          | Rule                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readout | value and unit in a slot at the left inset, and under it one row: the date at 10 px in `--ink-3`, then the delta at 11.5 px, weight 700, in `--ink`, so the delta reads as a delta and not as a second date. It does not move while you drag, and the date appears there and nowhere else on the card. |
| Delta          | `deltaAt()`. A beat is measured against the day before (`+2`, `+0:36`); an event against the draw before it (`deltaBase: "first"` gives `−37` on LDL).                                                                              |
| Cursor         | a full-height hairline at the sample with the ring on the point. That is the only thing that moves.                                                                                                                                 |
| Reference line | grey dashed at 50%, never the series hue, so it cannot fight the data. Its value sits on the y axis; its qualifier sits on the line itself, right-aligned in a 46 px right rail that only charts with a reference carry, so it can never collide with the last sample or stack under the tick. |
| Markers | two shapes in the whole system. A filled dot is a measurement that was taken; the cursor ring is where the readout is pointing. A beat has no dots because it has a value every day; an event has one dot per draw, and the estimate is the same dot at 45% opacity. Nothing else is ever marked. |
| Curve | Catmull-Rom with the control points clamped inside each segment, so the line softens a corner but can never overshoot a sample. Seven nights read as a trend, not a sawtooth. |
| Week | a dashed hairline at the boundary and the dates labelled inside the plot's top-left. No tinted panel: a tint block has edges, and edges read as a frame. |
| Estimate | `cfg.forecast` draws one object: a cone whose half-width grows as `√t` to 96–112, clipped to the plot rect, filled at 10% with a 30% edge, and the estimate dot at its tip. No dashed centre line competing with it. |

`ticksFor(min, max, marks)` picks the step from `[1, 2, 2.5, 5] × 10ⁿ` nearest `G.ticks` and drops any tick that falls on a reference mark. Domains: score 60–78 so the line and its ring clear the top tick, sleep 6–8, LDL 80–184 so the top tick is above the 168 draw, energy 0–1 900. The LDL x axis is labelled every three months, `Dec Mar Jun Sep`, evenly.

## Phone 1, Today

Measured every day: health score over 14 days in two labelled weeks · time asleep over 7 nights against the 7:30 target · energy by meal with protein on the same axis and three meal rows from `img/08-*.jpg` · four small multiples. Measured when it is drawn: LDL · the seven markers on their aims · the variants. Then the projection sentence.

## Phone 2, LDL cholesterol

Back to Labs, the tab that is lit. One large title, the subtitle carries the cadence ("Two draws, 236 days apart"). Trend card with the estimate · the three draws as a four-column grid: a dot (filled for measured, hollow for the estimate), the date in `--ink-2` at 13 px so it steps back from the value, the value at 15 px bold, and the delta in its own column, tabular, so 168, 131 and 104 share a right edge, `−37` cannot shove a number left, and the first row says `baseline` instead of leaving a hole · the four levers summing `131 − 27 = 104`.

## Motion

| What            | Moves                                                                                                  | Duration | Trigger        |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------- | -------------- |
| Cursor          | hairline, ring, value, date and delta snap to the nearest sample                                       | 0 ms     | drag           |
| Nav and tab bar | nothing; content passes under `backdrop-filter: blur()` on `rgba(250,250,252,.9)`, no saturation boost | —        | scroll         |
| Reduced motion  | everything lands                                                                                       | 0 ms     | system setting |

## Appendix

One table and one paragraph, side by side on the same 390 px grid as the phones and flush to their edges (both start at x 25 in a 900 px window). Set in a different register from everything above it: `ui-monospace` at 11 px in `#8b93a1` under a hairline rule, so the appendix can never be read as product copy. Numbers and arithmetic only: the score table, and the LDL chain as one line.

## Verify

```
chrome --headless=new --hide-scrollbars --window-size=900,1500 \
  --virtual-time-budget=4000 --screenshot=/tmp/shot-33.png \
  http://localhost:8811/33-cadence.html
```

Passing, all measured in the render: 0 duplicate ids; `scrollWidth` 885 of 900 and 1265 of 1280; 11 charts; images all load; no JS exceptions; the three asserts hold. A simulated drag on phone 1 reads `67 of 100 · 31 Aug · −1` then `70 of 100 · 3 Sep · +2` and returns to `72 · +2`; on phone 2 it reads `165 mg/dL · 25 Dec · −3` then `149 mg/dL · 7 Apr · −19` and returns to `131 · −37`. The Today tab bar meets the bottom edge of the sleep card and the Labs tab bar meets the bottom edge of the draws card, so neither screen ends on an orphaned header.
