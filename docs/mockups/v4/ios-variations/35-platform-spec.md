# Variation 35 "Platform" spec

A train-ticket booking kit, applied to a blood panel. The seat map becomes the 52 markers, the train-leg card becomes a goal, and the journey-search form becomes the empty state.

Output: `docs/mockups/v4/ios-variations/35-platform.html`, self-contained, no build, vanilla JS, system font stack, three 393x852 phones.

## The source

| Field | Value |
| --- | --- |
| Title | TicketOn - Train Ticket Mobile App |
| Slug | `ticketon-train-ticket-mobile-app` |
| URL | https://www.epicpxls.com/items/ticketon-train-ticket-mobile-app |
| Category | UI Kits |
| Screens available | 10 (five light, five dark, all 375x812) |

Found through the EpicPxls MCP with `search_items` (`query: "train ticket booking app ui kit"`, `with_screens: true`). Chosen over `deliveroo-food-delivery-mobile-app` and `skillzone-online-course-mobile-app` because both of those carry their design on photography and character illustration, which cannot be reproduced in a file with no external images. TicketOn is built from flat cards, rules and type, so its system survives being redrawn in CSS. It also ships a full dark set, which the third phone needs.

## Screens looked at

Downloaded and viewed, by title:

| Title | What it gave |
| --- | --- |
| White-Dribbble-01 | home: balance pill, bell, three-line greeting, category rail with a peeking card, "Active Tickets / See All", circular menu tiles, flat tab bar |
| White-Dribbble-02 | Choose Seat: the seat grid and its three-state legend |
| White-Dribbble-03 | live map: circular readout badge with a green ring, "Next Stop / 12 min" bar |
| White-Dribbble-04 | Choose a Train: the two-deck list card, hairline split, green "Available" / red "2 seat left", a dimmed sold-out card |
| White-Dribbble-05 | Ticket Detail: the vertical leg with a hollow origin dot, a dashed rail and a filled green destination dot, duration named mid-rail |
| Dark-Dribbble-01 | the home screen in navy |
| Dark-Dribbble-03 | dark map, green ring on navy |
| Dark-Dribbble-04 | dark cabin photo screen (not used) |
| Dark-Dribbble-05 | Intercity Train search form: stacked label/value fields, green circular swap button, full-width uppercase green CTA |

## Palette

From `extract_palette` on four screens, plus direct pixel sampling for the accents (they are too small a share of the frame for the extractor to surface).

| Token | Hex | Source |
| --- | --- | --- |
| `--ground` | `#f8fafb` | extract_palette, White-Dribbble-01, 86.8 % share |
| `--card` | `#ffffff` | sampled, White-Dribbble-04 card body |
| `--ink` | `#232c36` | extract_palette, White-Dribbble-01 |
| `--ink-3` | `#8a919b` | extract_palette, White-Dribbble-04 (`#949aa4`, `#9ca2aa`) |
| `--hair` | `#eceff3` | extract_palette, White-Dribbble-01 (`#eef0f3`) |
| `--line` | `#d3d8de` | extract_palette, White-Dribbble-01 (`#d3d6d9`) |
| `--go` | `#05ca76` | sampled, "See All" on White-Dribbble-01; confirmed `#04c975` by extract_palette on Dark-Dribbble-05 (the SEARCH button) |
| `--stop` | `#fd6b6d` | sampled, "2 seat left" on White-Dribbble-04 |
| `--slate` | `#40596b` | sampled, the selected seat on White-Dribbble-02 |
| dark `--ground` | `#121b2a` | extract_palette, Dark-Dribbble-01 |
| dark `--card` | `#283247` | extract_palette, Dark-Dribbble-01, 27.9 % share |
| dark `--card-2` | `#2b3852` | extract_palette, Dark-Dribbble-01 |
| dark `--ink-3` | `#8b97ad` | derived from `#4a5467` / `#4d5970` family |

One accent rule, taken from the source and kept: green marks only what you can act on (links, the add button, the CTA, the arrival dot, on-pace). Red marks only a miss. Nothing else is coloured.

## Source element to OpenVitals

| Source | Becomes |
| --- | --- |
| Seat grid, 4 columns of rounded pills | The panel board: 52 cells, 13 across, 4 down, in draw order optimal then normal then off |
| Seat legend: Not available / Available / Selected | The four bands: never measured (flat grey), normal (outline), optimal (filled slate), off (red tint, red edge). Off is the fourth state the source did not have, drawn in the source's own warning red |
| "Selected" as a dark slate fill | Optimal. Deliberately not green: the source reserves green for actions, so the good band is the emphatic fill instead |
| Train-list card, two decks split by a hairline | The goal card. Top deck: marker name, current value, group and history, pace. Bottom deck: the leg |
| Departure / duration / arrival row | Now `320` / `220 IU/mL to go` / target `under 100` |
| Ticket-detail leg: hollow origin dot, dashed rail, filled green arrival dot | The same three marks, turned horizontal, inside the goal card's lower deck |
| Green "Available" / red "2 seat left" | "On pace" / "Behind" |
| Balance pill, top left, white on the ground | `52 markers · 7 off` with a vial glyph in a tinted tile |
| Bell with a red dot | Kept as is |
| "Hi, / Where will you go today?", 26 px, three lines | "Hi, / Seven markers / are off today." The status summary is the greeting |
| Green step rule under the nav bar | Panel coverage: 45 of 52 in range |
| Category rail (Intercity / Airport / Local) with a card peeking off the edge | Marker groups: Thyroid, Vitamins, Iron, Metabolic, Lipids, Liver and kidney, Blood count, with off-counts in red |
| Menu grid of circular tiles | Add result, Compare, Book draw, Export |
| "Next Stop / Purwokerto Station / 12 min" bar | "Next draw / Booked Oct 14 2026 / in 6 weeks" |
| Intercity Train search form: Origin, Destination, Choose Date, green swap FAB, uppercase green SEARCH | The empty state. Marker, Target ("Pick a range"), By when, the same swap FAB, "SET THE GOAL" |
| Green circular swap FAB | Also the centre add button in the tab bar |
| Flat 4-item tab bar | Today, Body, add, Meals, Plan |

## The empty state

Phone 2 is not phone 1 with the goals removed. The source has a screen whose entire job is to ask where you are going, and that screen is a form. So with no goal on file the second block of the home screen turns into the goal composer: three labelled fields, one of them already filled in with the marker furthest from its range, the swap button, and the green CTA. The board still sits below it, because all 52 markers are still measured whether or not any of them has a target. The copy says so in one line rather than greying anything out.

## Data

52 markers: 26 optimal, 19 normal, 7 off, 0 never measured, from the 1 Aug 2026 draw; today is Wed 2 Sep 2026. Three `console.assert` calls hold the arithmetic: the four bands sum to 52, the seven groups sum to 52, and the per-group off-counts sum to 7.

Goals: TPO antibodies 320 IU/mL against under 100, 220 to go, behind. Vitamin D 19 ng/mL against 40 to 60, 21 to go, on pace. Ferritin 22 ng/mL against above 50, 28 to go, on pace. HbA1c 5.6 % against under 5.4, 0.2 to go, on pace.

"Never measured" is in the legend at 0 because nothing on the panel was skipped on this draw. The state is drawn so the board can carry it, not padded with invented cells to make it visible.

## What was deliberately not taken

- **The illustrated glyphs.** The source fills its category and menu tiles with small colour illustrations of trains, planes and calendars. Those are the item's artwork. The tile shape, size, corner radius and tint-behind-icon pattern are kept; the glyphs are redrawn as plain 1.7 px strokes.
- **The route language.** No station names, no "Surabaya Gubeng", no Rp prices, no QR block, no passenger rows, no train classes.
- **The seat map's spatial reading.** Seats mean a place in a carriage. The board is sorted by band, not by any position, and the aisle gap, row numbers and column letters are dropped so nothing implies a layout that is not there.
- **The 360-view cabin photo screen** (Dark-Dribbble-04). Photography cannot be reproduced offline and has no analogue in a blood panel.
- **The circular speed badge** from the map screen. A single big ringed number is the house move in variations 01 and 34; repeating it here would undo the point of borrowing a foreign language.
- **The dimmed sold-out card** as an empty-state device, on purpose. It is the obvious greyed-copy answer and the brief rules it out.

## Verify

```
cd /Volumes/External/Development/pxls/services/design-preview && node shot35.mjs
```

Passing: `js errors: none`, `external requests: none`. Checked in the render at 1400x1100 at 2x: all three phones render the board in full above the fold; the empty state shows its CTA in full; no section header is sliced by the scroll fade; the goal card's value column right-aligns across all four rows; dark mode keeps the slate optimal cells and the outlined normal cells apart.
