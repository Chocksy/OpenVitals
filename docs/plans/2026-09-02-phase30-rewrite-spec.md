# Phase 30: the rewrite. The app becomes the system page.

Date: 2026-09-02. Branch `simple`. App: `apps/simple`. Owner approved the
phase 29 design system and the site map on 2026-09-02 ("it looks awesome,
I checked all pages, proceed now").

## What this is

Not a restyle. Every screen is rebuilt to match its mockup, the old CSS and
the old components are deleted, and the 24 routes fold into the site map.
Nobody but the owner and their wife use the app, so there is no migration
ceremony: old URLs redirect, data is untouched, no feature is added.

Source of truth, in this order: `docs/mockups/v4/system.html` +
`system.css` (tokens, every element), then the page mockups `home.html`,
`body.html`, `blood.html`, `marker.html`, `plan.html`, `graph.html`,
`chat.html`, `login.html`, `admin.html`, `shell.html`, `app.html`. When the
app and the mockup disagree, the mockup wins. When a mockup is silent, the
system page's element wins. When both are silent, ask in the report, do the
simplest thing, mark it `// ponytail:`.

Data rules never change: every number from the ledger or the DB, named,
dated, sourced; no decorative data; `/brain`, `/hkb`, `/admin`, `/graph`
and every eval stay; no approval gating on data.

## Slices, in order, one Opus agent each, reviewed between

### 30a Foundation and shell

- `app/globals.css` rewritten from `system.css`. Keep only what the system
  page draws: the token block (light + dark, with the two phase-29
  corrections: dark `--ink-3 #979083`, and no 13 px meta on
  `--canvas-deep`), Fibonacci space, radii, the five type sizes and the
  `.t-title/.t-body/.t-meta/.t-num` discipline, the transitions.dev block
  (unchanged, the locks read it), the glossary tooltip, the 28c home block,
  the rail, and the new element classes copied from `system.css` with the
  same names. Delete: the accent/secondary/neutral scales except what
  `--ink-*` replaces, the shadcn aliases, the health `-bg/-border` triples,
  the radius and shadow scales, `.card-elevated`, `.glass`, `.stat-number`,
  the static `.pill-tabs`, the sheet keyframes the composer does not use,
  `.skeleton`, `.progress-bar`, the recharts overrides, the print block if
  nothing prints. Target: under 1 400 lines.
- `components/ui-kit.tsx`: `Button` with `job: "ink" | "quiet" | "text"`
  and `size: "md" | "sm" | "icon"`, plus `AddButton` (the lime +). No cva
  variants beyond those. `StateWord` replaces `Badge`, `StatusBadge` and
  `TierChip`: a word in its spectrum colour, no fill, optional ▲ for off,
  tier as text. `Card` stays. `MiniSparkline` stays. `SuccessCheck` stays.
  Every call site of the old variants is migrated in this slice, so
  `Badge`, `StatusBadge`, `badgeVariants`, `TierChip` no longer exist.
- `components/pill-tabs.tsx` is the only tab control. `ThemeToggle`,
  `TrendChart` range, `DailyCharts`, `ConsistencyHeatmap`, `QuickNumbers`
  ratings all use it (or the rating chip row from the system page).
- Shell: `TopNav` per `shell.html` and `system.html` section 03. Desktop:
  wordmark, five pills Home `/`, Body `/body`, Blood `/blood`, Plan
  `/plan`, Graph `/graph`, the lime + (opens the composer), avatar menu with
  Chat, theme, System group (admin), Sign out. Phone: tab bar with Home,
  Body, +, Blood, Plan; Graph lives in the menu. The header and bar on
  `--canvas` at 85 % with blur. Nothing else in the menu; the Data and
  Tracker groups are gone because their pages fold.
- Composer (`components/composer.tsx`): restyled per system section 11 (the
  sheet, chips, chip editor, photo path, follow-up, footer). Behaviour and
  `openComposer` untouched. Toast and tooltip per the system page.
- `app/login/page.tsx` per `login.html`.
- Redirects in `next.config.ts` (permanent): `/today /feel /trends /history`
  → `/body` (with `?tab=` for feel/trends/history), `/labs /biomarkers
  /labs/phone /uploads` → `/blood` (with `?tab=`), `/uploads/:id` →
  `/blood/uploads/:id`, `/m/:code` → `/blood/m/:code`, `/protocol /goals
  /insights /review` → `/plan` (with `?tab=` or `#answer`),
  `/patterns/:id` → `/plan#patterns`. The old page files stay until the
  slice that moves their content lands, then they are deleted. `/body` and
  `/blood` get placeholder pages in 30a that render the tab bar and, for
  now, the old content behind each tab (import the old page bodies), so
  nothing 404s between slices.
- Tests: `type-discipline.test.ts` updated to the new class names and
  components; `motion-css.test.ts` and `no-dom-mutation.test.ts` unchanged
  and green; `wording.test.ts` green.

### 30b Body

`app/(app)/body/page.tsx` per `body.html`: tabs Today, Check-in, How you
feel, Trends. Today: the day list (name + HealthKit identifier + source +
date, the note column, the value right-aligned on the digits with a fixed
unit slot, the last column one word, per the fixed mockup), Sync now, Open
iOS Health settings. Check-in: habits, quick numbers, rating chips, notes,
day stepper, streak. How you feel: the twelve questions on one screen with
the since-date editor. Trends: the daily line (hand-drawn SVG per the system
page, replaces recharts `DailyCharts`), the heatmap year grid, the history
lanes with the replay slider (restyled, logic untouched). Delete
`app/(app)/today`, `feel`, `trends`, `history` pages and any component that
only they used.

### 30c Blood

`app/(app)/blood/**` per `blood.html` + `marker.html`: tabs Draws, Markers
(search + rows with sparkline and range bar), Phone, Uploads. Marker page
`/blood/m/[code]`: the ruler (`RangeBar` restyled) and the history chart
rebuilt as the shared SVG component from `system.css` (dated marks, planned
draw on the dotted projection, target named, seven-mark legend), replacing
recharts `TrendChart`; the readings table; goal and optimal forms as the
system's inputs. On desktop the marker also opens as the drawer from the
Markers tab (a `<dialog>` like the composer). Upload detail
`/blood/uploads/[id]` with genome table, document items, reading rows, raw
text. Plan a draw per `plan-draw.html` reachable from the Draws tab. Delete
`labs`, `biomarkers`, `uploads`, `m` pages; remove `recharts` from
`package.json` once no import remains.

### 30d Plan and Home

Plan per `plan.html`: Do this first, Already doing (protocol rows with the
adherence strip, add item), Goals (same card shape), Patterns (inline, the
`/patterns/[id]` content as a disclosure), Tests to order, Answer these (the
review queue), Earlier plans and Coverage (from `/insights`), the simple/deep
switch as the system's tabs. Home: `ConclusionCard`, `MarkersCard`,
`FindingsCard`, `ImprovedCard`, `QuietLine`, `KeyTrends`, `TodayQuestions`
rebuilt per `system.html` section 07 and `home.html`; state words replace
badges; the ledger keeps `LedgerList` FLIP. Delete `protocol`, `goals`,
`insights`, `review`, `patterns` pages.

### 30e Graph, Chat, System

Graph per `graph.html` (bubbles, systems arcs, lens tabs, side panel).
Chat per `chat.html` on the new tokens (thread list rows, the thread, the
composer at the bottom, Act-on-it rows). Brain, HKB, Admin per `admin.html`:
same content, the system's tables (sticky first column on the wide one),
forms, tabs, state words. Then the sweep: grep for every old class and
token name (`neutral-`, `accent-`, `health-`, `bg-white`, `rounded-sm`,
`border-dashed`, `pill-tab`, `Badge`, `StatusBadge`) and remove the last
uses; delete dead components; `pnpm typecheck`, `pnpm test`, and a
screenshot of every route at 1440 and 390, light and dark.

## Constraints for every slice

- Mandatory reads before editing: this spec, the phase 29 spec, the UI
  inventory, `system.html` + `system.css`, the slice's mockup pages, the
  files being replaced, `motion.tsx`, the three lock tests, `ui-kit.tsx`.
- Never edit `docs/mockups/`. Never commit, push, stash, checkout, reset.
  Never `pnpm install` except to remove `recharts` in 30c (`pnpm remove`).
- No new dependencies. No chart library. Charts are hand-drawn SVG server
  components with real scales, units and dates, like the mockup.
- Server components stay server components unless they hold state today.
  No DOM mutation outside `motion.tsx`.
- Keep `/brain`, `/hkb`, `/admin`, `/graph`, every API route, every eval.
- Old URLs redirect; nothing 404s at the end of a slice.
- Verification per slice: `pnpm typecheck`, `pnpm test` (all green, the
  three locks included), dev server on 3001, Playwright screenshots into
  `/tmp/p30/<slice>/` of every route the slice touches at 1440 and 390,
  light and dark, looked at with the Read tool before reporting. Compare
  each against its mockup screenshot in `/tmp/p29/` side by side and list
  every visible difference in the report; fix the ones the mockup decides.
- Report: files touched (one line each), files deleted, line count of
  `globals.css` before and after, every difference from the mockup that
  remains and why, test counts, anything skipped.
