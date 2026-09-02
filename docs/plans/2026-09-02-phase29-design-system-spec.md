# Phase 29: the design system, and the pages v4 never drew

Date: 2026-09-02. Mockups only. Nothing under `apps/` changes in this phase.

## Why

The owner looked at the 28c home and said: marginally better, not the design.
A token layer over old components is not a rewrite. Phase 29 draws the
whole app in the v4 language once, on a design-system page and on one
mockup per destination, so the owner can approve it, and phase 30 rewrites
the app to match it, component by component, with the old CSS deleted.

Owner's words: "rewrite the whole css. update all components to match the
design style not apply it to existing navigation etc. even make a rewrite if
needed. nobody is using it, it's just my wife and me. we started this branch
to simplify, we did that, we added back, now do it again. if there is any
piece of component or page that we did not add to the design system then
make a new design system page and show it to me to approve."

## The language (fixed, do not reopen)

v4 (`docs/mockups/v4/v4.css`, `docs/plans/2026-09-02-phase28b4-v4-mockups-spec.md`)
with August's warmth and Kite's colours, as already chosen in
`docs/plans/2026-09-02-phase28c-home-spec.md`. The token values are the ones
now in `apps/simple/app/globals.css` lines 3–151 (the 28c block, with the
contrast corrections: `--ink-3 #7f6a59`, `--warn #9a6413`, and the navy
spectrum `--navy-bad/-warn/-ok`). Copy them into `system.css` as the source
of truth; from now on the app copies from the mockup, never the reverse.

Rules that every element obeys:

- Warm paper canvas, translucent tiles, flat fallback under
  `prefers-reduced-transparency`. Dark theme under `html[data-theme="dark"]`.
- Spectrum colours (`--ok --warn --bad`) colour text, dots, ticks and the ▲
  glyph. Never a surface, never a filled badge. Coral ▲ only on what is off.
- Navy is the one dark surface (the Status card). Lime is the one accent, on
  the one control that adds data (the +).
- Fibonacci space 3/5/8/13/21/34/55. Radii 13 inner, 21 card, 34 hero, pill.
- Five type sizes: 11 / 13 / 15 / 21 / 34. Mono only for numbers (`.t-num`).
  Geist Sans and Geist Mono (the app's fonts; the mockups load them from
  Google Fonts or fall back to Inter/JetBrains Mono, say which in a comment).
- Icons: lucide (the app's set). Draw them as inline SVG paths from lucide.
- Every number is named, dated and sourced. No decorative data. Reuse the
  values from `elements-v3.html` and the v4 pages (TPO 320 IU/mL Aug 1, LDL
  142, HbA1c 5.6, ferritin 22, ALT 34, D 19, resting HR 58 → 55).
- One tab style (the sliding pill). One button family with three jobs:
  `ink` (the one primary per screen), `quiet` (bordered), `text` (no box).
  Badges become the state word in its spectrum colour, no fill. Empty states
  are the v4 "never measured" tile: quiet, no dashed border, one sentence and
  one link.
- Motion: the transitions.dev tokens already in the app (digits, text swap,
  icon swap, stagger, toast, tabs pill, FLIP). Show each once on the system
  page. Reduced motion respected.

## Simplify again: the site map

Five destinations and the + sheet. Everything else folds in.

| Destination | Absorbs today's routes | What it shows |
|---|---|---|
| Home `/` | `/`, `/review` (the queue becomes "Answer these" on Home and Plan) | the 28c home: sentence, rail, ask, one question, systems, ledger, key trends |
| Body `/body` | `/today`, `/feel`, `/trends`, `/history` | today's numbers from the phone with sources, the check-in (habits, quick numbers, notes), how you feel (the twelve questions as one screen), trends of daily series, the history lanes with the replay slider |
| Blood `/blood` | `/labs`, `/biomarkers`, `/labs/phone`, `/uploads`, `/uploads/[id]`, `/m/[code]` (as a drawer on desktop and a page on the phone), plan a draw | draws, every marker with search, the marker page (ruler + history), uploads and the upload detail (genome table, document items, reading rows), the draw builder |
| Plan `/plan` | `/plan`, `/protocol`, `/goals`, `/insights`, `/patterns/[id]` | what to do first, what you are already doing (protocol + adherence strip), goals as the same cards, patterns, tests to order, earlier plans |
| Graph `/graph` | `/graph` | bubbles and systems, lenses |
| + sheet | composer | photo of a lab, ask or tell, log how you feel |
| System (admin) | `/brain`, `/hkb`, `/admin` | unchanged in content, restyled: tables, forms, consoles |
| `/login` | `/login` | one card |
| `/chat`, `/chat/[id]` | same | thread list and thread, per `chat.html` |

`/genome` stays a section of the upload detail. Old URLs redirect; no page is
deleted before its content has a home. Show this table as the first block of
the system page, drawn as a simple list, so the owner can approve or edit it.

## Deliverables (`docs/mockups/v4/`)

`system.css` (imports `v4.css`, then overrides tokens and adds every new
element) and these pages, each with desktop sections and 390 px frames, all
linked from `index.html` under a new "System" group:

1. `system.html`: the design system. Sections, in order: Site map (above);
   Tokens (colour swatches with hex and contrast on cream and on navy, the
   spectrum, the two dark surfaces, space, radii, type ladder with a sample
   line per size, mono numbers); Shell (desktop pills, phone tab bar with the
   lime +, the avatar menu, the System group); Buttons (three jobs × idle /
   hover / busy / disabled, and the lime add); Inputs (text, number with
   unit, date, select, textarea, search, file / photo, range slider,
   checkbox row, 1–5 rating, option chips idle / selected / busy); State
   words and chips (the spectrum as text, dots, ▲; tier chips established /
   early / experimental; evidence glyphs ● ◐ ○ with grade; never measured);
   Cards (tile, hero, navy, drawer, the ConclusionCard anatomy with rank,
   state word, percentage, grade, prose, why disclosure, ask link, what to
   do); Lists and rows (marker row with sparkline + range bar, upload row,
   protocol row with adherence strip, goal row, thread row); Tables (the
   readings table, the admin table, the wide HKB table with a sticky first
   column); Charts (ruler, history chart, sparkline, daily line, heatmap
   grid and 30-cell strip, history lanes, bubbles thumbnail, systems arcs;
   each with named series, dated marks, axis in the unit); Sheets and
   overlays (the + sheet with chips and chip editor, the toast, the glossary
   tooltip with its edge flip, the details disclosure, the marker drawer);
   Empty states (day one home, no draws, no plan, nothing due); Motion
   (one live sample each: digits, text swap, icon swap, stagger, tabs pill,
   FLIP, toast, success check); Dark (the same swatches and one card row
   under `data-theme="dark"`); Where the numbers come from.
2. `body.html`: Body, desktop and 390: today's sourced numbers, check-in,
   how you feel, trends, history lanes with the replay slider.
3. `blood.html`: extend the existing page (do not remove what the owner
   approved): draws list, marker search list, the marker as a drawer and as
   a phone page (reuse `marker.html` pieces), uploads list, upload detail
   with genome table / document items / reading rows / raw text, and the
   draw builder (reuse `plan-draw.html`).
4. `plan.html`: Plan: do this first, already doing (protocol + adherence),
   goals, patterns, tests to order, answer these, earlier plans, coverage.
5. `graph.html`: bubbles and systems with the lens tabs, the side panel.
6. `login.html`: the one card, light and dark.
7. `admin.html`: Brain (tabs, parameter form, hypothesis cards, move tree
   thumbnail), HKB (the tables and controls), Admin (stat grid + tables).
   Content unchanged, restyled. These pages are never removed.
8. `chat.html`: leave as is; add the thread list row if missing.
9. `index.html`: link everything; the first link is `system.html`.

Every page ends with a "Where the numbers come from" block and a "Build
cost" note: which app component it replaces, what is new, what it deletes.

## Constraints

- Read first: the inventory `docs/plans/2026-09-02-ui-inventory.md`, the
  v4 spec, `v4.css`, `home.html`, `app.html`, `blood.html`, `marker.html`,
  `chat.html`, `shell.html`, `elements-v3.html` (for values and the element
  list), `apps/simple/app/globals.css` lines 1–151 and the 28c home block,
  `apps/simple/components/ui-kit.tsx`, `composer.tsx` (what the sheet does),
  `history-lanes.tsx` and `heatmap.tsx` (what the charts encode).
- Do not edit anything under `apps/`. Do not commit or push. Do not create
  or print any seed string. Do not touch `home-variations*/`.
- Plain HTML + CSS, no build step, no framework, no chart library. Charts are
  hand-drawn SVG with real scales. Scripts only for the motion samples and
  the theme toggle.
- Contrast: AA on every text element; state the ratio in a comment next to
  each token.
- Screenshots: Playwright at 1440 and 390 for every page into
  `/tmp/p29/`, plus `system-dark-1440.png`. Look at every one before
  reporting; a clipped label, a chart without units or an overlapping
  element is a defect to fix.

## Report back

The list of files with one line each. Every element in the inventory's
catalogue mapped to the section of `system.html` that draws it (or "dropped,
because …" for the ones the site map removes). The token table with contrast
ratios. The site map as implemented. Anything you could not draw and why.
