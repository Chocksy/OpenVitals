# Variation 26 "Matrix" spec

Source: RonDesignLab "SuperPower Mobile" on Dribbble (top ten of dribbble.com/search/health, picked 2026-09-09). What it does: one score with a state word on a gradient that shifts orange to green with the score, digits drawn as dot-matrix, then bento tiles per domain where each tile leads with a real marker and its unit, then two action tiles (Upload Health Records +, Connect Health Tracker) and a small "Existing Records · 2 files" pill.

Output: `docs/mockups/v4/ios-variations/26-matrix.html`, self-contained, no build, vanilla JS, Inter, two 390x844 phones side by side like 24-glow and 25-onion. Plus one `<li>` row in `index.html` above the 25-onion row, same markup pattern.

## Mandatory reads

- `25-onion.html` (whole file): tokens, phone frame, tab bar, Add sheet, the LIFE / BLOOD / GENES data, the score arithmetic, foot notes tables. Reuse them verbatim where they fit.
- `24-glow.html`: tile styles, quick actions, meal rows.
- `index.html` lines 148-190: the row pattern.

## Data (do not change)

Copy LIFE, BLOOD, GENES, LOG and the score maths from 25-onion. Score 72, life 77, blood 71, genes 63. Keep `console.assert(score===72)`. PhenoAge 36.2 at 39. LDL 131 mg/dl (Aug 1 2026, from 168 Dec 9 2025). Vitamin D 29 ng/ml (rose). Sleep 7h30. APOE ε3/ε4. Projection: "Keep this eight weeks and LDL lands near 104, from 131."

## Phone 1, home

1. Status bar, then header: "Razvan" left, avatar right, small "Tue 9 Sep".
2. Score tile, full width, radius var(--r). Background: vertical gradient from `--amber` tint at the top to `--green` tint at the bottom, blended by score. Rule: `hue = 30 + (score/100)*110` and the tile uses `linear-gradient(180deg, hsl(hue-25 80% 60%), hsl(hue+10 60% 55%))`. Print the rule in the foot notes. On the tile: small caps "Health score", the number 72 in dot-matrix digits (see below) about 84px tall, the state word under it: `score>=80 "Strong"`, `>=65 "On track"`, `>=50 "Watch"`, else "Act". Under that a dot-matrix strip: three short rows of dots labelled Lifestyle 77, Blood 71, Genes 63, dots lit to the value (10 dots per row, lit = round(v/10)). Weights printed small: ".40 .45 .15". PhenoAge line at the tile bottom: "PhenoAge 36.2 at 39".
3. Bento grid, two columns, gap var(--s13). Tiles, each with a glyph chip top-left, the domain name beside it, then the hero number in dot-matrix (~40px), unit in Inter beside it, marker name under:
   - Lifestyle · 7h30 · "Sleep" (dots for hours: 7.5 -> "7:30", drawn as digits 7, colon, 3, 0).
   - Blood · 131 mg/dl · "LDL cholesterol" · small amber pill "Borderline".
   - Blood · 29 ng/ml · "Vitamin D" · rose pill "Outside range".
   - Genes · "ε3/ε4" in Inter (no matrix) · "APOE" · pill "Watch LDL".
     Tile background: white glass over the domain colour at 10 percent (`--life-soft`, `--blood-soft`, `--gene-soft`).
4. Action tiles, same grid: "Upload lab PDF" with a + chip and two stacked paper rectangles drawn in CSS (like the invoice sheets), and "Connect Apple Health" with a red heart chip and three concentric rings pulsing (CSS animation, 2.4s). Under them one full-width pill "Last draw 1 Aug 2026 · 14 markers · 2 files".
5. Projection sentence `.say`, then "Latest today" three meal rows from 24-glow (Oats with berries 412 kcal 8:15, Sardines on rye 462 kcal 13:08, Pork belly salad 623 kcal 19:30, photos `img/08-*.jpg` as in 24-glow).
6. Glass tab bar Home / Body / Blood + plus, from 24-glow.

## Phone 2, Upload

Same home blurred behind a bottom sheet titled "Upload lab PDF": a drop zone with the paper stack, a row "Photo the page", a row "Files", a row "Apple Health" with the rings, and a note "We read the PDF and place each marker on its range. Nothing leaves the phone until you send." Sheet opens from the Upload tile via `data-do="open"`; second phone has class `open` like 24-glow.

## Dot-matrix digits

One JS function `matrix(text, size)` returns an inline SVG. Font: 5 columns x 7 rows per glyph, dots of diameter 0.7*cell, gap 0.3*cell, glyphs for 0-9, ":" and "." as bitmaps (arrays of 7 strings of 5 chars, "#" lit). Digit colour currentColor, unlit dots drawn at 12 percent opacity so the grid shows. Animate in: dots fade in left to right with a 12ms stagger via CSS `animation-delay` on each circle.

## Motion

Score tile gradient and digits appear on load. Tapping a bento tile does nothing but a press scale (0.98). Tab bar and sheet as in 24-glow.

## Foot notes

Two tables under the phones like 25-onion: score arithmetic (copy, with genes 63) and a table of the four rules borrowed from the reference (gradient by score, matrix digits, marker-first tiles, action tiles) with the OpenVitals mapping beside each.

## Verify

```
cd docs/mockups/v4/ios-variations
python3 -m http.server 8811 &
perl -e 'alarm 40; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 --user-data-dir=/tmp/hl-profile26 --window-size=900,1100 --screenshot=/tmp/matrix.png http://127.0.0.1:8811/26-matrix.html
```

Read /tmp/matrix.png. Both phones render, digits legible, no overflow past the phone edge, sheet on phone 2 over a blurred home. Report the screenshot path and any part of this spec you could not meet.
