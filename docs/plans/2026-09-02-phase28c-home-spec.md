# Phase 28c: the home, built the v4 way, warmed by August, with Kite's card rail

Date: 2026-09-02. Branch `simple`. App: `apps/simple`.

## Decision

Razvan reviewed nine seeded home variations on top of v4 and chose:

- **v4 is the base.** The 28b-4 direction stays: one sentence, one hero, three
  tiles, the Signals panel, systems as state, Fibonacci space, the five-size
  type ladder, spectrum logic (green / amber / oxblood, never a surface).
- **August supplies the warmth.** Warm cream canvas, translucent tiles, and a
  soft blurred light behind the hero whose hue follows the worst ledger band.
- **Kite supplies the mobile top and the colours.** On a phone the top of the
  home is a horizontal, snapping row of landscape cards you swipe: Status,
  Body, Blood, Plan, then one card per system with the off ones first. Kite's
  navy status card, coral only on what is off with a ▲ glyph, and its green.

Quote: "take from kite the top nav either the cards on mobile that you swipe
and the colors but do it like v4 does."

This spec turns that into the real `/` page. Mockups are the reference, the
ledger is the only data. No decorative data, ever. Every number on the page
comes from `buildLedger`, `buildToday`, `recentFindings` or `buildTrend`.

## Reference material (mandatory reads, in this order)

1. `docs/plans/2026-09-02-phase28b4-v4-mockups-spec.md` (v4 creative direction)
2. `docs/mockups/v4/v4.css` sections 1 to 5, 8, 9, 15 (tokens, hero, signals
   panel, ask pill, three tiles, systems as state, panels, chips, responsive)
3. `docs/mockups/v4/home.html` (the v4 home, desktop grid and 390 stack)
4. `docs/mockups/v4/home-variations/02-august.html` (tokens, blobs, tiles,
   the cost note at the bottom)
5. `docs/mockups/v4/home-variations-2/09-kite.html` (the `.cards` rail CSS,
   card markup, chips, the cost note at the bottom)
6. `apps/simple/app/(app)/page.tsx`, `apps/simple/components/home.tsx`,
   `apps/simple/lib/ledger.ts` (the `Ledger` interface), `lib/home-data.ts`
7. `apps/simple/app/globals.css` (the `@theme` tokens, the dark theme under
   `html[data-theme]`, the motion tokens, the reduced-motion blocks)
8. `apps/simple/components/motion.tsx`, `components/motion-css.test.ts`,
   `components/no-dom-mutation.test.ts`, `components/type-discipline.test.ts`
   (the three locks every visual change must keep green)
9. `apps/simple/components/top-nav.tsx`, `app/(app)/layout.tsx`

Do not open `docs/mockups/` for editing. Do not read any file whose name
contains "seed" or hunt for the seed strings behind the variations.

## Tokens

Add to `app/globals.css` `@theme` (light) and the `html[data-theme="dark"]`
block. Names follow v4 so the mockups read as documentation:

| token | light | dark | from |
|---|---|---|---|
| `--canvas` | `#fdf5ec` | `#121110` | August / v4 dark |
| `--canvas-deep` | `#f4e9dc` | `#0c0b0a` | August |
| `--surface` | `rgba(255,255,255,0.58)` | `#1c1a18` | August |
| `--surface-hi` | `rgba(255,255,255,0.78)` | `#24221f` | August |
| `--ink` / `--ink-2` / `--ink-3` | `#3d2a1c` / `#6d5744` / `#9c8776` | `#f1efea` / `#b4aea4` / `#877f74` | August |
| `--ok` | `#2B7F3A` | `#8fc46a` | Kite |
| `--warn` | `#b4761b` | `#e0a63c` | August |
| `--bad` | `#C32B45` | `#e3767c` | Kite (text) |
| `--bad-fill` | `#E74D64` | `#e3767c` | Kite (glyph, dot) |
| `--navy` / `--navy-ink` | `#0f2140` / `#f4f2ed` | `#0f2140` / `#f4f2ed` | Kite |
| `--sky` | `#d9e7f7` | `#1b2b44` | Kite, the calm hue |
| `--r-inner` / `--r-card` / `--r-hero` / `--r-pill` | 13 / 21 / 34 / 999 px | same | v4 |
| `--sp-1` … `--sp-7` | 3 / 5 / 8 / 13 / 21 / 34 / 55 px | same | v4 |

Type ladder stays the app's Geist Sans and Mono; sizes 11 / 13 / 15 / 21 / 34.
`type-discipline.test.ts` decides what is allowed next to what. Read it.
Icons stay lucide. Material Symbols would be a new font dependency; skip.

Spectrum logic: `--ok`, `--warn`, `--bad` colour text, dots and the ▲ glyph.
They are never a surface. The one exception is Kite's navy Status card.

Scope of the token change: `body` background moves to `--canvas` and the
`.card` surface to `--surface` on every page (one change, whole app warms).
Everything else in this spec is scoped under a `.home` wrapper so the other
pages do not drift. Check `/plan`, `/labs`, `/m/[code]`, `/chat` still read
after the body and card change; fix contrast where the old neutral greys sat
on white and now sit on cream, nothing more.

## The page, phone first (390)

Order top to bottom inside `<div class="home">`:

1. **The sentence.** One line, 21 px: the spear's title and state, or "All
   quiet" when nothing is loud. Below it the meta line in 13 px `--ink-3`: the
   since line (`SinceLine`, already exists) or the newest draw date.
2. **The rail.** A horizontal snapping row of landscape cards. Details below.
3. **Ask.** The existing `AskLine` restyled as the v4 ask pill (`--r-pill`,
   `--surface-hi`, 15 px placeholder). Keep its behaviour untouched.
4. **Systems as state.** All twelve systems as chips: dot + name + the word.
   Off in `--bad` with ▲, borderline in `--warn`, good in `--ok`, never
   measured in `--ink-3` with a hollow dot. Kite's cost note says why: the rail
   hides content, so the full list must repeat here. Each chip links to
   `/m/{worst.code}` or `/graph`.
5. **Fix this first.** The spear `ConclusionCard`, unchanged component, new
   surface tokens.
6. **The ledger.** `LedgerList` exactly as today (findings, loud, improved,
   quiet tail), `QuietLine`.
7. **Key trends.** `KeyTrends` as today.
8. `LedgerMotion` last, as today.

`TodayCard` and `Cockpit` are replaced by the rail. Their data moves into the
Status, Body and Blood cards. Delete them and `SystemsGrid` from `home.tsx`
when nothing imports them; grep first.

## The rail

Pure CSS scroll snap. No JS, no library, no DOM mutation outside `motion.tsx`.

```css
.home .rail {
  display: flex; gap: var(--sp-4);
  overflow-x: auto; scroll-snap-type: x mandatory;
  scroll-padding-left: var(--sp-5); padding-inline: var(--sp-5);
  scrollbar-width: none;
  mask-image: linear-gradient(90deg, #000 calc(100% - 34px), transparent);
}
.home .rail::-webkit-scrollbar { display: none; }
.home .rail > * { flex: 0 0 280px; min-height: 160px; scroll-snap-align: start; }
```

Card height grows with text (`min-height`, never `height`, never
`aspect-ratio`). Dynamic Type on iOS needs that.

Each card is an `<a>` (one link, whole card, no nested links) with
`border-radius: var(--r-card)`, `background: var(--surface)`,
`backdrop-filter: blur(21px)`, a 1 px `rgba(255,255,255,0.5)` inner border in
light. Under `@media (prefers-reduced-transparency: reduce)` the surface goes
flat `--surface-hi` with no blur. Layout inside: 11 px mono uppercase label
top-left, the 34 px number or 21 px title, a 13 px line at the bottom.

Card order, decided in code by one pure function
`railCards(ledger, today, report)` in `lib/home-data.ts`, returned as data
(kind, label, headline, line, tone, href) so a test can assert the order:

1. **Status** (navy card, `--navy-ink` text, the `--lime` accent is not used
   here). Label "Status". Headline: `counters.off` off · `counters.normal`
   borderline · `counters.optimal` optimal, with `Digits` for each number.
   Line: `since` summary ("2 new, 1 resolved since 14 Aug") or the draw date.
   Href `/plan`. A 3 px hue bar at the top edge: `--bad` if any off, `--warn`
   if any borderline, `--ok` otherwise, `--ink-3` if no rows.
2. **Body**. Label "Body". Headline: PhenoAge `bioAge.pheno` with "at
   `chrono`" in 13 px, or "—" with the `bioAgeMissing` line. Line: the first
   `today.due` question text, or `today.post.reply` first sentence, or
   "Nothing due today". Href `/today`.
3. **Blood**. Label "Blood". Headline: `counters.off` in `--bad` with ▲ when
   greater than zero, then "/ `total` markers". Line: "Next draw in
   `nextDrawWeeks` wk: names" (use `explainKey`), or "nothing queued".
   Href `/labs`.
4. **Plan**. Label "Plan". Headline: the spear's `action.title` or the spear
   title. Line: "`n` to do" from `actionsForAll` for the loud ids (already
   computed on the page as `todo`). Href `/plan`. Omitted when no spear and
   no actions.
5. **One card per system that has a reading**, sorted: status red first,
   then amber, then green; ties by `score` descending. Label: system name.
   Headline: the worst marker's value and unit, 34 px, `--bad` with ▲ when
   red, `--warn` when amber, `--ink` when green. Line: marker name via
   `explainKey` plus the word (off / borderline / good, the `WORST_WORD`
   map that already exists). Href `/m/{code}`. Systems with no reading are
   not cards; they live in the chips.

The rail is keyboard reachable: each card is a link, so Tab walks it, and
`scroll-snap` follows focus. Put `aria-label="Your status, body, blood, plan
and systems"` on the rail and `role="list"` semantics via `<ul>`/`<li>`.

Empty ledger (`rows.length === 0`) keeps `EmptyHome` as today.

## Desktop (≥ 768 px)

The rail becomes the v4 grid: no horizontal scroll. `md:` turns `.rail` into
`display: grid; grid-template-columns: repeat(4, 1fr)` with the Status card
spanning two columns and two rows (the v4 hero), Body / Blood / Plan in the
remaining cells of the first row block, and the system cards flowing below at
four per row. The mask and snap are removed at `md:`. Everything below the
rail keeps its current desktop layout.

## August's light

Behind the sentence and the rail, one absolutely positioned layer with three
blurred radial blobs (`filter: blur(55px)`, opacity 0.55), `pointer-events:
none`, `z-index: -1` inside a `position: relative` wrapper. The hue follows the
Status hue bar: `--bad` band → rose + amber; `--warn` → amber + sky; `--ok` →
sky + a touch of `--ok`; no rows → grey. Dark theme halves the opacity. The
blobs use the tokens, not new hexes. Cost note from August applies: three
blurred layers is the budget; do not add more.

## Motion

- Cards fade and rise on mount with the existing `fadeInUp` keyframe, staggered
  by `animation-delay: calc(var(--i) * 40ms)` set as an inline CSS variable per
  card (no JS).
- Counters use `Digits` from `motion.tsx`. `SwapText` for the sentence when the
  ledger changes (`LedgerMotion` already drives the toast; do not extend it).
- The Status card's hue bar and the blobs transition `background-color` over
  `var(--reveal-dur, 400ms)`.
- All of it sits under the existing `@media (prefers-reduced-motion: reduce)`
  blocks. `motion-css.test.ts` checks that; keep it green.

## Top nav

Keep the structure (four pills, avatar menu, five-slot tab bar). Restyle the
surfaces to the new tokens: header and tab bar `--canvas` with a
`backdrop-filter: blur(13px)` and `background: color-mix(in srgb, var(--canvas)
85%, transparent)`, active pill `--surface-hi` with `--ink` text, inactive
`--ink-3`. The composer button in the tab bar stays `--ink` on `--canvas`.
Nothing else changes. The iOS webview hides the nav already; do not touch
`apps/ios`.

## Hard constraints

- Do not edit anything under `docs/mockups/`. Do not commit or push. Do not run
  `git stash`, `git checkout` or `git reset`. Another agent has uncommitted
  work in `app/(app)/chat/**`, `app/api/**`, `components/chat.tsx`,
  `components/composer.tsx`, `components/ask-answer.tsx`, `lib/thread-*.ts`,
  `lib/brief.ts`, `lib/adopt.ts`, `lib/lookup.ts`, `db/schema.ts`, `drizzle/**`,
  `evals/**`, `package.json`. Do not touch those files. Do not run `pnpm
  install`.
- Files you may change: `app/(app)/page.tsx`, `components/home.tsx`,
  `lib/home-data.ts` (+ a new `lib/home-data.test.ts` or extend an existing
  one), `app/globals.css`, `components/top-nav.tsx`, `components/ask-line.tsx`
  (styling only), and a new `components/home-rail.tsx` if `home.tsx` gets too
  long. Nothing else without saying why in the report.
- Keep `/brain`, `/hkb`, `/graph`, `/admin` and every eval untouched.
- No new dependencies. No `motion`/framer, no carousel library, no icon font.
- No DOM mutation outside `motion.tsx` (`no-dom-mutation.test.ts`).
- No data the ledger does not produce. If a card would need a number that
  does not exist, drop the line, do not invent it. List every such gap in the
  report.
- No seed strings, no variation names other than August and Kite in code
  comments.
- Server components stay server components. The rail needs no client code.

## Verification (run all, paste output summaries in the report)

```bash
cd apps/simple
pnpm typecheck
pnpm lint
pnpm test
```

Then run the dev server, sign in as the test account, and shoot with
Playwright (same pattern as `/tmp/p28b/shot.py`) into `/tmp/p28c-home/`:
`home-390.png` (top of page, rail visible), `home-390-rail-2.png` (rail
scrolled to the second card, use `element.scrollTo`), `home-390-full.png`
(full page), `home-1440.png`, `home-1440-dark.png`, `plan-1440.png` and
`labs-1440.png` (to show the warmed canvas did not break other pages), and
`home-390-reduced.png` with `reducedMotion: 'reduce'` and
`forcedColors` off. Look at every screenshot yourself before reporting. A
card that clips its text, a number without a unit, a chip missing a system,
or a rail with no fade is a failure to fix, not to report.

## Report back

Files touched with one line each. The `railCards` order rule and the test that
locks it. The token table as implemented (any value you changed and why).
Which cards drop a line for lack of data, and which data the engine does not
produce yet. Contrast checks on the navy card and on `--bad` over cream
(state the ratios). The other pages you checked after the body/card change.
Anything skipped, and why.
