# Variation 29 "Riso" spec

Source: the risograph. Two drums, fluorescent pink and ultramarine, on cream stock. Today's numbers set as a small-press daily: page one is the issue, page two is the contribute page. Nothing on the sheet is anything but ink on paper.

Output: `docs/mockups/v4/ios-variations/29-riso.html`, self-contained, no build, vanilla JS, Anton (display) + Archivo (text) from Google Fonts, two 390x844 pages side by side in the `.doc` wrapper like 25-onion and 26-matrix. The orchestrator adds the `index.html` row.

## Mandatory reads

- `25-onion.html` (whole file): the `.doc` wrapper, `.phones`, `.cap`, the 390x844 frame, the Add flow, foot-note tables, and the LIFE / BLOOD / GENES / LOG data with the score arithmetic. Structure and data only.
- `26-matrix.html`: how an identity carries through a whole screen.
- `06-sketch.html`: the hand-drawn study, to land nowhere near it. Riso is a press: no wobble, no scribble, no fibre noise, strict grid.

## Data (unchanged)

LIFE, BLOOD, GENES, LOG and the score maths copied from 25-onion. Lifestyle 77, blood 71, genes 63, weights .40 / .45 / .15, score 72, with `console.assert(score === 72)`. PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, from 168 on 9 Dec 2025. Vitamin D 29 ng/mL. Sleep 7h30. APOE e3/e4. Projection: "Keep this eight weeks and LDL lands near 104, from 131."

## Three values in the file

`--paper #efe8d6`, `--pink #ff4d8d`, `--blue #2334a0`. No black, no grey, no opacity tints. The blue is an ultramarine rather than a navy for one reason: multiplied under pink it lands on `#231058`, a violet you can tell apart from the blue at a glance. A navy overprints to something indistinguishable from itself, and then the whole idea is invisible.

## The press (five rules; the visual system falls out of them)

| Rule                                    | Build                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The overprint is the page, not a detail | The pink field behind the score runs up through the masthead, so the masthead and the entire score block print `#231058` with the type knocked out or set in blue on top. Measured on the screenshot the three inks cover roughly 13 % pink, 9 % blue and 4 % violet of the phone area: the third colour is a region, not a sliver. Page two's coupon and Fig. 1's landing print the same way. |
| One slip, whole drum                    | `translate(2.5px, -2px)`, once, on everything the pink drum prints: both fields, the underprint on every rule and every cut line, the photo tints, the projected bar in Fig. 1. Every rule down both pages fringes pink on its top edge. No blue element moves.                                                                                                                                |
| One screen, used large                  | 8 px pitch, 15 degrees, one dot size, in the CSS lattice and in the SVG pattern. It appears three times and always at size: the projected bar in Fig. 1, the plate photograph on page two, the thumbnails in the listings. A screen means "not solid ink", which is what separates the projection from the two draws.                                                                          |
| Ink and paper, not fills                | Fields print through a 0.6 px blur, with roller streaks along the feed direction letting the stock show through, and a hand-cut clip edge instead of a machined rectangle. The stock carries laid lines at 3 % of the blue. All of it deterministic: no turbulence, no random noise.                                                                                                           |
| Nothing a press cannot do               | No box-shadow, no opacity, no gradient tints, no card, no button, no pill, no tab bar, no bezel. One `border-radius` in the file (4 px on the page frame).                                                                                                                                                                                                                                     |

Type: Anton at exactly three sizes (104 the score, 40 the masthead and page heads, 22 everything else display, including the figure numerals) and Archivo at three (13 text, 10 tracked caps, 9 meta). No run-in heads: a label sits above its paragraph, never inline at twice the cap height. Spacing is a 6 px scale.

## Page one - Issue 251

1. Running head where iOS would put a status bar: "9:41" and "OPENVITALS DAILY".
2. Masthead, full bleed: blue solid with "OPENVITALS" and the strap (Issue 251 · Tue 9 Sep 2026 · Razvan, 39) knocked out, overprinted by the pink field so it prints violet.
3. The dominant element, and there is only one: the score field. 72 at 104 px, "/100" and the verdict (`>=80 On form, >=65 On track, >=50 Watch it, else Act now`) in a column beside it, "Health score · printed daily" and "PhenoAge 36.2" along the foot. Everything inside the field is blue on pink, so it all overprints.
4. Standfirst: the projection sentence in body text, "LDL lands near 104" bold. It supports the score, it does not compete with it.
5. Three domain bars: label, one solid blue bar whose length is the value, the value at 22 px. Weights are stated in the meta line rather than encoded as three densities that read as three noises.
6. Two marker blocks in the same form, label above number above aim: Vitamin D 29 ng/mL (the one off), LDL 131 mg/dL (borderline).
7. Fig. 1: three bars on one baseline, one cut convention for all three top edges, numerals at the same inset in each. 168 and 131 are solid blue with the number knocked out; 104 is the same bar screened on the slipped drum with the number in blue, so it overprints. One dashed rule for "aim under 100", the only dashed mark in the figure, labelled AIM 100 and named in the caption.
8. Below the fold: the listings as classified rows with hairlines between, meal photos duotoned live in CSS (`grayscale` + `screen` over blue, pink `multiply` tint on the drum offset, then the screen), walk / supplement / sleep as cut marks in one stroke weight. Then a cut line and "Contribute to tomorrow's issue", which turns the page.
9. Running footer instead of a tab bar: TODAY 1 · BODY 4 · BLOOD 7 · CONTRIBUTE 2, counts set smaller and lighter than the labels so they read as counts, the current section marked by a 3 px rule.

## Page two - Contribute

Same stock, a page turn rather than a modal. "CONTRIBUTE" at 40 px, a standfirst, then the three ways as newspaper copy with a tracked-caps label above each: One · photograph the plate, Two · speak it, Three · type it. No numbered boxes, no waveform, no icons.

The lower half is the picture desk: "Shot at 8:41 PM · sets as", the plate photograph printed large (152 px, full column) as a duotone carrying the screen, its caption line, and then the coupon. "Send to today" is display type inside the second pink field, with "Tear here to file" and the deadline along the foot and a cut line under it, so the one action on the page looks nothing like the heading above it and the page fills to the folio.

Either folio switches pages; page two is shown by `data-page="contribute"` on the second frame.

## Motion

None. A printed page does not animate; the only state change is the page turn.

## Foot notes

Three tables under the phones: the score arithmetic written editorially, the five press rules with their build, and Fig. 1's three marks.

## Verify

```
cd docs/mockups/v4/ios-variations && python3 -m http.server 8811 &
perl -e 'alarm 90; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 --user-data-dir=/tmp/hl-29 --window-size=900,1500 --screenshot=/tmp/shot-29.png http://127.0.0.1:8811/29-riso.html
```

Checked in the rendered image at 1x and in 2x crops: the violet band across the masthead and score field, the violet 72, the pink fringe on every rule, the screened landing in Fig. 1 with a legible 104, the coupon on page two ending clear of the folio. Checked by pixel count on the PNG: pink, blue and violet at 13 / 9 / 4 per cent of the phone area. Checked in the DOM: `scrollWidth` 885 at 900 px and 1265 at 1280 px, no duplicate ids, zero errors, zero failed images, `score === 72`. Checked by grep: three colour values plus the overprint named once in prose, no `box-shadow`, no `opacity`, one `border-radius`, three display sizes.
