# Variation 30 "Forecast" spec

Direction: the body read as a meteorological chart, in the register of a national weather service, not a consumer weather app. The mental model earns its place through a three-way split the drawing keeps apart: **conditions now** (today's log), **outlook** (LDL falling, what is moving in), **climate** (APOE ε3/ε4, never forecastable).

Craft reference: a synoptic analysis fax. Isobars as thin closed and open contours labelled by breaking the line, a cold front with proper triangles, station-model plots where one point carries four readings in fixed slots, a fourteen-day tendency trace, coordinates and a Zulu timestamp in the corner. Chart paper, one ink, one alert red on the single reading that is off. Two registers: serif for the editorial voice, mono for every reading.

Trap avoided: cartoon weather. No sun-behind-cloud icons, no blue gradient sky, no rain emoji, no colour anywhere except the one red 29.

Output: `docs/mockups/v4/ios-variations/30-forecast.html`, self-contained, no build, vanilla JS, IBM Plex Mono only, two 390x844 phones side by side inside `.doc` with the eyebrow / h1 / lede header and the foot-note tables under them, like 25-onion and 26-matrix. `index.html` is not touched; the orchestrator adds the row.

## Mandatory reads

- `25-onion.html` (whole file): LIFE / BLOOD / GENES / LOG, the score arithmetic, the `.doc` / `.phones` / `.cap` wrapper, the phone frame, the status bar, the tab bar, the foot-note tables.
- `26-matrix.html` and `26-matrix-spec.md`: house spec format, the `data-do="open"` / `.phone.open` sheet pattern.
- `18-tidal.html` + `beyond.css`: the sea-glass green zone to land nowhere near.

## Data (do not change)

Copied from 25-onion. Score 72, lifestyle 77, blood 71, genes 63, weights .40 / .45 / .15, `console.assert(score === 72)` kept. PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, from 168 on 9 Dec 2025. Vitamin D 29 ng/mL. Sleep 7h30. APOE ε3/ε4. Projection sentence verbatim: "Keep this eight weeks and LDL lands near 104, from 131."

## Identity

- Two registers, never mixed inside one job. **Source Serif 4** carries the voice: the masthead, the section heads, the verdict headline, the prose, the projection sentence, the prose columns of the notes tables, the file button. **IBM Plex Mono** carries the data: the 72, every station reading, every isobar number, the coordinate and timestamp line, the caps labels, the figure columns. Tabular figures on.
- Tokens: `--page #ddd9cc`, `--paper #f4f1e6`, `--ink #16202a`, `--ink-2 #55606a`, `--ink-3 #8d9088`, `--hair #c2bca9`, `--alert #a8331b`.
- Spacing scale `--u1..--u6` = 4 / 6 / 10 / 16 / 26 / 42.
- Five roles, one job each: `.display` mono 56 (the index only), `.h1` serif 15 caps (section heads), `.verdict` serif 21 (the state word as a headline), `.h2` mono 10 caps (labels and meta), `.body` serif 14 (prose), `.micro` mono 8.5 caps (captions and source lines). Nothing else.
- No boxes. No card borders, no grey header strips, no shadows inside the screen. Hierarchy is rules and whitespace: a full-ink rule above every section, a hairline between rows.

## The chart, generated in JS as inline SVG

**The field.** A sloping background analysis with the three domains added as anomalies, so contours run right across the sheet and off its edges instead of ringing each station:

```
f(x,y) = 72 − 0.3·x̂ − 0.8·ŷ
       − 1.9 · tanh((x − frontX(y)) / 40)
       + Σ (vᵢ − 72) · 0.42 · exp(−dᵢ²/(2·95²))
```

`frontX(y)` is the front's own spline, so the field knows where the front is. The tanh step is what makes the drawing behave like weather: the gradient measures 0.090 per px at the front against 0.021 in the western plateau, four times steeper, so the contours crowd against the front and open out where nothing is happening. Range 65.8 to 76.2 over the 374 × 300 sheet. Domain anomalies are broad (σ 95) and weak (0.42), so no station is ringed by a target.

**Isobars.** Marching squares on a 3 px grid, segments chained into whole contours by endpoint map and a two-direction walk, one Chaikin pass. Every unit from 66 to 76, eleven levels, so never more than about twelve lines. Every fourth line 1.3 px, the rest 0.55 px, so the gradient reads before the numbers do. The longest contour at each level is labelled by cutting a 14 px gap out of its own path, just wide enough for the number, and setting it **horizontally**, never rotated, so no label can read upside down and none floats off its line. A keep-out list rejects any label position inside a station box, within 16 px of the front, within 62 px of a label already placed, or outside the visible crop.

**Station plots.** One circle diameter (r 13) and **one type size** for all five pieces of text: four readings in fixed slots (upper-left, lower-left, upper-right, lower-right) and the name-plus-index below, all mono 10. The blackened fraction of the circle is the domain index. The paper is knocked out behind every reading and behind the name, so no contour ever runs through a number. Lifestyle 7:30 / 1497 / 93 / +2, blood 131 / 29 / 98 / +6, genes ε3/ε4 / C677T / 4 / 0. The one off reading, vitamin D 29, is the only red on the page: red digits at the same weight and size as its neighbours, no ring, no badge, so it flags rather than shouts.

**Barbs.** One shaft length (30 px) and one bearing (north) at every station, so only the feather count differs. One full flag per 10, a half flag per 5, on weight × 100: lifestyle four, blood four and a half, genes one and a half. The count is what says which domain moves the index most.

**Front.** One Catmull-Rom spline, one triangle size (7 px) at an even 44 px of arc length, sized down against the hairline isobars, labelled horizontally off the top-left edge on a leader with the paper knocked out behind the text. The same spline is what the field steps across. It carries LDL 168 → 131 since 9 Dec 2025.

**No UI glyphs on the drawing.** No arrows, no chevrons, no scattered ticks. Change is a signed number in the station's fourth slot.

## No legend on the phone

The reader learns the grammar once, in "The chart's grammar" table below the phones. The phone never re-explains itself, so neither screen carries a key.

## Outlook

No axis, no frame, no gridlines. A 1 px median run from 131 to 104 over eight weeks, and a soft 9 % ink wash for the 80 % spread. No hatch: hatch reads as "no data" on any chart, a wash reads as uncertainty. One baseline with ticks on a single even step, NOW / W2 / W4 / W6 / W8, drawn by the same loop so the spacing cannot drift. The target is a dashed isobar broken for its own "TARGET 100" label, in the chart's grammar. Endpoints are inset so 131 and 104 have room. Under it, the projection sentence in body type with the landing bolded.

## Conditions now and climate

Conditions is the day's six log entries as a ruled table: time, what, kind, reading, index change. The one over-the-share meal carries the red reading. Climate is a rule, a "Not forecastable" stamp in the section head, "APOE ε3/ε4" at 20 px and one paragraph saying it sets the range the forecast runs inside and is never in the run. Weighted 0.15, never predicted.

Foot of the screen: analysis time, next draw, PhenoAge 36.2 at 39, and the field's own definition, in `.micro`.

## Tab bar

No icon drawings. Four text labels under one 7 px station circle each, filled on the active tab and hollow on the rest, which is the chart's own on/off mark. Chart is on, underlined by a 16 px rule.

## Phone 2, the observation log

Not a photo, not a tile grid. The three method checkboxes are one weight and one box stroke; only the ink and the cross differ. A ruled log page rising from the bottom edge under one ink rule, the chart still lit above it because the log points at the station it redraws. Rows: entry no, station, method (Photograph / Speak / Type as checkboxes, photograph ticked), observed, redraws. The redraws row holds the lifestyle station plot drawn by the same `station()` function at the same size, with the caption "kcal slot 874 → 1497 · cover 71 → 77 · the station above". File observation is caps between two rules. No image anywhere on the page: one ink, all of it drawn.

## The fold

The tab bar overlays the scroll, so the first screenful is composed to end in paper. The projection sentence carries a 92 px gutter under it, which puts the "Conditions now" rule at 746 against a fold at 699: nothing is ever half-cropped by the tab bar. On phone 02 the screen rides down 142 px so its top edge lands on the "Synoptic analysis" rule, and the log sheet's padding is tuned so its top rule lands exactly on the chart's bottom edge. Both cuts are on rules.

## Motion

The log rises in 380 ms on `--ease`, cut to 0 under `prefers-reduced-motion`. Filing steps the kcal slot and the cover fraction.

## Verify

```
cd docs/mockups/v4/ios-variations && python3 -m http.server 8811 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --virtual-time-budget=5000 --window-size=900,1500 \
  --screenshot=/tmp/shot-30.png http://localhost:8811/30-forecast.html
```

Checked: no console output and no failed assert at 900 and 1280 px, no horizontal overflow at either width, no duplicate DOM ids (the hatch pattern is suffixed per phone), no external assets beyond the Google Fonts link, and the projection sentence sits whole above the tab bar.
