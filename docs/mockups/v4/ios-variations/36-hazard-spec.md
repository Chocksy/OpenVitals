# Variation 36 "Hazard" spec

A neubrutalist book-shelf kit, applied to a blood panel. The genre sticker becomes the band, the shelf rail becomes the goals, the taped section header becomes the section header, and the notched purple tab bar comes over unchanged.

Output: `docs/mockups/v4/ios-variations/36-hazard.html`, self-contained, no build, vanilla JS, system fonts only, three 393x852 phones.

## The source

| Field | Value |
| --- | --- |
| Title | book app design - neubrutalism |
| Slug | `book-app-design-neubrutalism` |
| URL | https://www.epicpxls.com/items/book-app-design-neubrutalism |
| Source type | figma |
| Screens in file | 17, 15 rendered, 9 at phone size (360x640) |

Found through the EpicPxls MCP with `get_item_screens`. Chosen over `moood-music-player-app-ui-kit`, which was the other shortlisted candidate.

Moood was rejected after viewing Frame 2 and Frame 3. It is a beautiful kit, but its entire personality is photographic: cut-paper collage hero images, a halftone swimming-pool photo, illustrated playlist tiles, a serif display face over full-bleed art. Strip the images and nothing loud is left, just a white page with a serif heading. The brief forbids external images, so Moood would have arrived sanded down to exactly the restrained thing it was supposed to avoid.

Neubrutalism survives the trip intact because it carries its whole personality in properties CSS already has: a flat fill, a 3 px black rule, a hard unblurred offset shadow, zero corner radius, and type set too big. None of that needs a raster.

## Screens looked at

Downloaded to `/tmp` and opened, by title:

| Title | What it gave |
| --- | --- |
| Home (`30f1ce0e`) | the orange ground, the loose orange doodle running behind everything, the three-bar stepped hamburger, the centred black display wordmark, the bordered square avatar tile, the white search pill, the white outlined category chips with counts, the purple tab bar with a circular notch and the active icon raised into it |
| Books (`ca7efff0`) | the card language: white body, hard black rule, cyan footer strip, purple title, orange secondary line, and an irregular cyan blob sticker carrying the genre |
| Writers (`db95c7cd`) | the same card system in a 2-up grid, cyan tile under a circular portrait, and the notch sliding to sit under a different tab |
| Favorite (`0cc71c43`) | the vertical stack of the same card, the yellow book cover that showed where the fourth accent lives, the heart badge overhanging a card edge |
| Android Small - 1 (`b8aa3f44`) | purple splash, black display lockup |
| Android Small - 3 (`fa9a3eb2`) | the same splash mid-animation, letters sliding |
| Android Small - 4 (`947e5f1f`) | the same again, one frame later |
| Android Small - 7 (`a1029722`) | the lockup reduced to two letters |
| Main Preview (`99672877`) | the whole kit laid out at once, which confirmed the tab bar notch moves per tab and the card rail runs horizontally |
| Moood Frame 2 (`80186317`) | rejected: collage hero, serif display, photo tiles |
| Moood Frame 3 (`aa016b8f`) | rejected: full-bleed halftone photograph carrying the whole screen |

## Palette

`extract_palette` failed on this item, both ways. See "MCP notes" below. The palette was instead quantised locally from the four downloaded phone screens, and the same eight colours came back on all four within two levels, which is what a flat vector kit should do.

The watermark correction formula (raw pulled toward RGB 59,61,63 at alpha 40, so `orig = (raw - 0.157 * wm) / 0.843`) over-corrects on this item. Calibrating against a region that must be pure white gives raw `#f7f7f7`, a 3 % shift, not 16 %. The stated formula would push that to `#ffffff` correctly but pushes `#131313` to `#0c0b0b` and `#ffb547` to an impossible `#ffcb48`. The raw modal values are already clean Figma-native tokens, so the eye was trusted over the formula and the raw values were kept, except for white.

| Token | Raw (local quantise) | Shipped | Share | Source |
| --- | --- | --- | --- | --- |
| `--ground` | `#ffb547` | `#ffb547` | 27.5 % | Home, the ground on every content screen |
| `--ground-2` | `#ff9800` | `#ff9800` | 0.4 % | Home, the doodle stroke |
| `--paper` | `#f7f7f7` | `#ffffff` | 24.7 % | Books, card bodies; corrected to pure white, the only token the watermark formula improved |
| `--edge` / `--fg` | `#131313` | `#131313` | 1.1 % | Books, every border and the display type |
| `--purple` | `#9747ff` | `#9747ff` | 7.6 % | Home, the tab bar; also the card titles |
| `--purple-2` | `#b183f5` | `#b183f5` | 0.7 % | Home, the divider under the drawer name |
| `--cyan` | `#1bf1ff` | `#1bf1ff` | 1.6 – 5.6 % | Books, the card footer and the genre blob |
| `--cyan-2` | `#66e9f5` | `#66e9f5` | 0.5 % | Writers, the softer tile behind a portrait |
| `--yellow` | `#feed01` | `#feed01` | 0.6 – 0.7 % | Books and Favorite, the yellow cover |
| dark `--ground` | — | `#131313` | — | invented, see below |
| dark `--paper` | — | `#17171a` | — | invented |
| dark `--edge` | — | `#ffffff` | — | invented |
| dark `--purple` | — | `#b86cff` | — | `--purple-2` pushed up for contrast on black |

Cyan and yellow both surface at under 6 % by area, which is exactly the failure the brief warns about: an area-weighted extractor will under-report a small screaming accent. Both were confirmed by eye on the Books and Favorite screens, where they carry the whole card.

One accent rule, taken from the source and kept strictly. Cyan is in range. Yellow is out of range. Purple is the only thing you can press. Nothing else is coloured, which is the only reason a four-colour screen stays legible.

## Source element to OpenVitals

| Source | Becomes |
| --- | --- |
| Flat `#ffb547` ground with a loose `#ff9800` doodle arcing behind every screen | The same, three arcs, at `stroke-width: 7`, behind everything and in front of nothing |
| 3 px `#131313` rule on every edge, zero corner radius | The same, as `--bw`, on every slab, chip, cell, bar and button |
| Hard offset shadow, no blur, no alpha | `6px 6px 0 var(--drop)`, as `--off`. It is a second black rectangle, not a shadow |
| Black condensed display face, centred, letterspaced | `Arial Black`, uppercase, from 8 px labels to the 56 px status number. Local system fonts only, so the file still renders offline |
| Stepped three-bar hamburger, bars of unequal width | Kept exactly, including the third bar indented from the left |
| Bordered square avatar tile, top right | Kept, cyan fill, with the hard shadow |
| White search pill with a hard rule | The draw row: vial glyph, "Last draw · Aug 1 2026", and a yellow `32 days` tab |
| Outlined category chips with counts, "Historical (21)" | Marker groups with counts, "Thyroid 6", the count in purple, the active chip filled cyan, the rail running off the right edge |
| The featured book card, white body over a cyan footer strip | The status slab. `07` at 56 px with a yellow marker-pen stripe struck through its baseline, "markers out of range" beside it, and a cyan footer carrying "52 tracked" |
| The irregular blob sticker behind a genre label | The band sticker and the pace sticker, drawn with an eight-value `border-radius` so no two edges agree |
| Horizontal card rail with the next card peeking off the edge | The goal rail. Four goal cards at 168 px, two and a half visible, cut by the frame exactly as the source cuts its shelf |
| Card title in purple, secondary line in orange | Marker name in purple, target in the body weight with the range in purple |
| Cyan genre blob in the card footer | The pace sticker: cyan for on pace, yellow for behind |
| The washi-tape section header, rotated, sitting proud of its row | The band headers, rotated `-1.6deg`, with the hard shadow. Cyan for goals, yellow for the empty state, purple for the board |
| The genre sticker's flat fill as a state | The four bands on the 52-cell board: cyan optimal, paper normal, yellow-under-hatching off, empty-with-a-slash never measured |
| Purple tab bar with a circular notch cut and the active icon raised into it | Kept wholesale, as an inline SVG path so the notch is a real cut and the ground shows through it. Today, Body, add, Meals, Plan |

## Hazard hatching

The source has no fourth state. It has three flat sticker colours and no warning language at all, because a book shelf has nothing to warn you about. A blood panel does, so one device is invented rather than borrowed: black diagonal hatching at 45 degrees over the yellow sticker, used for the seven off-range cells and for the unfinished part of a behind-pace bar.

It is invented in the source's own grammar (a flat fill, a 2 px black rule, no gradient, no alpha) rather than in a foreign one. The first draft also hatched the "behind" pace sticker, which made its label unreadable at 10 px. That sticker is now solid yellow with an inset black cap, so the hazard colour still reads at a glance and the word still reads on inspection.

## The empty state

Phone 2 is not phone 1 with the goals removed, and nothing is greyed. The status slab is replaced by a black poster: the one element on the screen that inverts the whole colour logic, yellow and cyan display type on solid black with a purple hard shadow. The source uses its purple splash screens exactly this way, as a full-bleed interruption with nothing on it but type.

Under it, a different list shape from the goal rail: three compact rows, not cards, each carrying the marker furthest from its range, its group, its distance, and a black "set target" button. Then a full-width purple slab. The board is unchanged below, because all 52 markers are still measured whether or not any of them has a target, and the poster copy says so in one line.

## Frame 3

The source item is a light orange kit with no dark set anywhere in its 17 frames, so the third frame is an invention rather than a transfer, and the caption says so. The inversion keeps the source's logic and swaps only its ground: black ground, white 3 px rules, cards at `#17171a`, and the hard shadow turned purple instead of black, since a black shadow on a black ground is nothing. Cyan and yellow are held at full saturation because they are already at maximum chroma and losing them would lose the whole identity. The tab bar stays purple; the add button flips to cyan so it still separates from the bar it sits in.

## Data

52 markers: 26 optimal, 19 normal, 7 off, 0 never measured, from the 1 Aug 2026 draw; today is Wed 2 Sep 2026. Three `console.assert` calls hold the arithmetic: the four bands sum to 52, the seven groups sum to 52, and the per-group off-counts sum to 7.

Goals: TPO antibodies 320 IU/mL against under 100, 220 to go, behind. Vitamin D 19 ng/mL against 40 to 60, 21 to go, on pace. Ferritin 22 ng/mL against above 50, 28 to go, on pace. HbA1c 5.6 % against under 5.4, 0.2 to go, on pace.

"Never measured" appears in the legend at 0 because nothing on the panel was skipped on this draw. The state is drawn so the board can carry it, not padded with invented cells to make it visible.

## What was deliberately not taken

- **The book cover photographs and the author portraits.** They are the item's artwork and they cannot be reproduced offline. The tile shape, its rule, its cyan backing and its overhang are kept; what sat inside them is replaced by numbers.
- **The diagonal ground texture.** Every stored PNG carries a diagonal watermark, and the source ground appears to carry a diagonal texture of its own. The two cannot be told apart from a watermarked render, so neither was copied. The 45-degree hatching that does ship is confined to the off-range state, where it is an invented hazard device and not an attempt to reproduce an ambiguous texture.
- **The drawer.** Four of the nine phone screens are the same screen with a profile drawer open over it. It is a navigation pattern, not a home-screen one.
- **The heart badge overhanging the card corner.** A favourite toggle has no analogue on a panel, and the overhang was already spent on the peeking rail card.
- **The literal display lockup.** The splash screens animate the word into a ligature. That is the item's logotype, not its type system.
- **The rounded search pill.** The source rounds its search field while squaring everything else. The draw row is square, because the point of the exercise is the hard edge and the one inconsistency in the source is not worth importing.

## MCP notes

- `get_item_screens` worked on both candidates and returned real frame dimensions, which is what made the 360x640 versus 414x896 grid difference visible before drawing anything.
- Screen URLs come back as site-relative paths. They resolve against the MCP host (`http://localhost:3111`), not against `https://www.epicpxls.com`, which returns `500 Internal Server Error` for the same path.
- `extract_palette` is unusable for this item. It rejects the working relative path with `"Only HTTPS image URLs are allowed."` and it fails on the public HTTPS URL with `"Could not download image (HTTP 500)."` The palette table above is a local quantise instead.

## Verify

```
cd /Volumes/External/Development/pxls/services/design-preview && node shot36.mjs
```

Passing: `js errors: none`, `external requests: none`. Checked in the render at 1400x1100 at 2x: all three phones render the full board and the legend above the tab bar, with the last content baseline at least 104 px clear of the frame bottom so the raised add button covers nothing; the goal rail cuts its third card at the frame edge on purpose; the "behind" sticker's label reads at 10 px; the empty-state poster, its three rows and the purple slab all fit without the board being pushed under the bar; dark mode keeps the cyan optimal cells and the outlined normal cells apart on black.
