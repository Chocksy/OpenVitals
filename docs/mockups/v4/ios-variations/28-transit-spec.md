# 28 · Transit

**Source** `docs/mockups/v4/ios-variations/28-transit.html` — one file, vanilla JS, no build step, no dependency beyond a Google Fonts link.

**Output** Two 390×844 phones: the network, and the network with the LDL stop open.

**Mandatory reads before touching it** `25-onion.html` (structure, data, score arithmetic), `26-matrix.html`, `13-orbit.js` (the radial study Transit must not repeat), `26-matrix-spec.md` (this format).

## Identity

Archivo at two weights (400, 600) and three sizes (22 / 13 / 12), tabular numerals. A cold near-black ground, `#080b11`, with the map on its own slightly lighter surface, `#1b2430`, so the diagram reads as printed rather than floating.

The three line colours are matched for luminance on that ground so no line shouts:

| Line      | Hex       | L\*  |
| --------- | --------- | ---- |
| Lifestyle | `#c9973f` | 65.7 |
| Blood     | `#4aa6d8` | 64.7 |
| Genes     | `#b78de6` | 64.6 |

`--alert #ff4438` is used for one thing only: an out-of-range station.

## The drawing

The diagram is a coordinate system in JS. `M` holds every number and everything else is derived:

```
W 360  H 476     the design space
P 52             the one rhythm; no station may sit anywhere but M.top + n·P
colA 140         the feeder corridor
lane 192         the track a feeder runs on beside the trunk
colB 226         the Blood trunk
lw 7             the one stroke width
R 22             the one corner radius
off 30           the one label offset, line centre to label trailing edge
```

`D = P` — every diagonal drops exactly one pitch, so every diagonal is 45°. `APP = P/2` — every feeder runs half a pitch straight before its corner and half a pitch straight into its lozenge, so both feeders have the same shape, the same radius, and the same vertical entry.

**Topology** The Blood trunk carries nine stops down `colB`. The Lifestyle feeder occupies rows 0–3 of the corridor, the Genes feeder rows 4–6, each cornering once onto `lane` and entering its lozenge from above. Lifestyle meets Blood at Saturated fat (row 5), Genes at APOE ε3/ε4 (row 8), three stops apart, with LDL and ApoB in the section between them. The two feeders are never in the same place at the same time, so nothing crosses and no two lines share a track.

**Corners** `poly()` steps back `R·tan(θ/2)` into each leg and joins them with an SVG `A` arc. A runtime assert rejects the path if it ever contains `C`, `Q` or `S`.

**Runtime rules** the file fails loudly if the drawing drifts: the diagonals must be 45°, each feeder must arrive exactly on its lozenge, the interchanges must be a whole number of stops apart, every station must sit on the rhythm, and the Genes line must not start inside the Lifestyle corner.

## One glyph vocabulary

`mark()` is the only thing that draws a station, anywhere, at any size. Four states, one drawing each, all at the same 26-unit outer size:

| State        | Drawing                                                    |
| ------------ | ---------------------------------------------------------- |
| In range     | a bar across the line                                      |
| Borderline   | a hollow ring                                              |
| Out of range | a filled disc in `--alert`                                 |
| Interchange  | an open lozenge, outer height 31, that both lines run into |

The key and the page legend show the same mark on a length of upright track, at the same scale it is drawn on the map. The sheet's "Where it sits" is not a second drawing: it is `network()` again with a different `viewBox`, a window onto the same map. The sheet's content box is 334 wide, the same as the screen's, so the crop keeps the full 360-unit width and is pixel for pixel identical. Measured in the render: the Blood stroke is 6 px on the map and 6 px in the sheet.

The two draws are set as type, not marks, because 168 → 131 → an aim is not a thing the station vocabulary can say.

## Measured in the rendered screenshot

- Stroke width: Lifestyle 6 px, Blood 6 px, Genes 6 px, and 6 px again inside the sheet.
- Station spacing: 48.0, 48.0, 48.5 px on the trunk and 48.0, 48.2 px in the corridor (52 design units × 334/360).
- Label offset: 28 px on the right column, 29–30 px on the left, every label.

## Data

Copied from `25-onion.html`, unchanged. `LIFE` 77, `BLOOD` 71, `GENES` 63, weights .40 / .45 / .15, score 72, `console.assert(score === 72)`. Verdict from the score: 72 → "On track". PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, from 168 on 9 Dec 2025. Vitamin D 29 ng/mL. Sleep 7h30. APOE ε3/ε4. Projection: "Keep this eight weeks and LDL lands near 104, from 131."

## Phone 1

The map card owns the fold: the diagram, the key, then the service board with the two stops that need attention, each with its line colour as a leading bar. The card ends flush above the tab bar, so nothing is half-cropped. Below the fold: today's LOG as journey rows pinned to a Lifestyle-coloured track, then the projection.

Tabs are Network / Day / Draws. Add is a filled round `+`, not a fourth tab, because it is an action and not a place.

## Phone 2

Tapping LDL, or `+`, raises the sheet over one scrim at one opacity. The sheet carries the stop, its position on the line, the map window, the two draws and the aim as type, and the two interchanges with their cause in a sentence each.

## Motion

The sheet slides up in 340 ms on `cubic-bezier(.2,.7,.2,1)`; the scrim fades in 260 ms. Both disabled under `prefers-reduced-motion`.

## Page

One left edge. The `.doc` is exactly 812 px, the width of the two phones and their gap, so the header, the phone column and the two tables all start on the same line. Table rules are `rgba(255,255,255,.05)`, lighter than the phone chrome at `.07`.

No `id` attributes inside the phone template, so rendering it twice is safe.

## Verify

```
perl -e 'alarm 60; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 \
  --user-data-dir=/tmp/hl-28 --window-size=900,1500 \
  --screenshot=/tmp/shot-28.png http://127.0.0.1:8811/28-transit.html
```

No console output, no overflow at 900 or 1280, no duplicate ids.
