# Phase 28b-5: five home page style variations + the history chart fix

Owner, 2026-09-02: "what we have now is good, in fact I'm quite happy, but I
wanna see others" — one page (Home) per style so the styles can be compared.
Also: the marker history chart "looks broken" on the phone.

## Part A — the history chart on `docs/mockups/v4/marker.html` (fix first)

Owner's iPhone screenshot at ~390 px: the y axis reads 430 / 320 / 34 with
the 412 diamond drawn at the 430 label; the "320" value label, the "Nov 24 ·
planned" label and the now-diamond overlap each other; the planned diamond
floats mid-air; the x labels are three date strings crammed into one row.
Rebuild the `.hist` component so it is correct at any width:

- Plot in SVG with a real linear y scale (0 → 430 for TPO) and a real time x
  scale (Dec 9 2025 → Feb 16 2027). Diamonds sit at (date, value). The
  planned draw is a hollow diamond on the x axis at its date with the label
  "planned" under the axis, not floating in the plot.
- Y axis: three ticks max (0, top of normal band, the max), never a tick for
  a data point. Data-point labels sit beside their diamond, offset by a
  fixed 8 px, and the label of the "now" point goes on the side that has
  room (left if the point is in the right third).
- X axis: dates as `Dec 9` / `Aug 1` / `Feb 16` with the year in the legend,
  and at widths under 480 px only first, last and the planned date.
- The target band (hatched) is a rect from the target date to the plot's
  right edge, below the target value. The normal band is a rect across the
  full width. Both behind the line.
- Legend unchanged. Apply the same fix to the LDL and ALT charts and the
  `.hist.mini` in the drawer (mini: no labels except first/last date and the
  two values).
- Re-shoot `02-marker.png`, `02-marker-390.png`, `02-marker-dark.png` and
  `05-app-390.png` and read them back.

## Part B — five home variations, `docs/mockups/v4/home-variations/`

Each variation is ONE self-contained HTML file with its own inline CSS:
desktop 1440 section and a 390 frame, light only (dark optional), with the
SAME content as `v4/home.html` (the sentence, the status tile, the Signals
panel with the named Resting HR series, Ask, three tiles, systems as state)
and the same real numbers. Only the style changes. Material Symbols from
the CDN for icons. Same honesty rules (named series, dated diamonds, no
decorative data). Each file ends with a one-paragraph note: what this style
is good at, what it costs in the app, and what it would do to iOS.

The directions (seeded; do not print or hint at any seed anywhere):

1. `01-ledger.html` — **Ledger.** Editorial. Bone-white paper, ink black, a
   strict 10-column grid, hairline rules instead of cards, a serif display
   face for the one sentence (Georgia / New York stack), tabular mono for
   every number, one red-ink accent for "off". No gradients at all: the
   status is a number, a word and a rule. Feels like an annual report.
2. `02-august.html` — **August.** Late-summer light. Large soft colour blobs
   behind translucent glass tiles (backdrop-filter), everything pill-shaped,
   rounded double-curve forms, warm amber/rose/sky blobs whose hue still
   follows the worst band. Big friendly numerals. Weather-app warmth.
3. `03-instrument.html` — **Instrument.** A calm lab bench. Charcoal
   surfaces, phosphor green and amber readouts, monospace throughout,
   tick rulers and linear scales in place of tiles, an 8 px grid, thin
   1 px frames, small caps labels. Medical monitor, but quiet.
4. `04-alpine.html` — **Alpine.** Cool white paper, slate-blue ink, one
   lichen green, generous whitespace, 2 px outlined cards instead of tonal
   fills, a humanist sans for numbers (system-ui), 5:7:8 proportions in the
   tile grid. Swiss / Scandinavian calm.
5. `05-folio.html` — **Folio.** Soft lilac, plum and clay. Bento tiles of
   mixed sizes (a 7:5 hero, small squares), very large corner radii,
   playful weight contrast (heavy sentence, light numbers), an illustrated
   feel from shapes only (no images). Still honest.

Plus `index.html` in that folder linking the five with one line each.

## Verification

Screenshots to `/tmp/p28b5/`: `00-marker.png`, `00-marker-390.png`,
`00-marker-dark.png`, `00-app-390.png`, then `01-ledger.png`,
`01-ledger-390.png` … `05-folio-390.png`, `06-index.png`. Read every PNG back:
no overlapping labels on the history chart at 390, icons rendered, nothing
overflowing horizontally. Report: files, screenshots, and one line per
variation on its cost to build.
