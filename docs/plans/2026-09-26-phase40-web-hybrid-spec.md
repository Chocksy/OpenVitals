# Phase 40: the web in the Hybrid look (53)

Date: 2026-09-26. Branch `simple`. App `apps/simple`.

The owner, 2026-09-26: "the web one is exceptional. When you do the
redesign make sure the other components we have are translated. If needed
you can simplify, but do not remove en masse. We do not want to simplify
like we did before; what we have now works and is good."

Read with this file:

- `docs/mockups/v4/ios-variations/53-web.html`: the design. It wins ties
  on look and motion.
- `docs/plans/2026-09-26-ui-inventory.md`: every route and component as of
  today. **This is the checklist.** Every row there ends this phase in the
  new look, in the same place or a named new place.
- `docs/plans/2026-09-26-phase39-hunches-spec.md`, 39S: the data the new
  Home reads (`hunches`, `heading`, `confidence`, goal `recentSlope` /
  `landing`, `/api/hunches*`, marker `band`).
- `docs/mockups/v4/ios-variations/54-casefile.html`: the three depths of a
  hunch (glance, open, How we know). The web drawer carries all three.

## The rule

1. **Translate, never drop.** Every component in the inventory keeps its
   job. A restyle may merge two components into one only when both jobs
   survive. Anything that would disappear goes into "Removals for owner
   OK" at the end of this file, and it stays until the owner answers.
2. **Keep the routes and redirects.** `next.config.ts` `folded` stays.
   `/brain`, `/hkb` and `/admin` stay (memory `keep-brain-hkb-pages`).
3. **Keep dark mode and the theme toggle.** Hybrid has no dark column, so
   this phase draws one (below).
4. **Keep the nav destinations.** The five are Home, Body, Blood, Plan
   and Graph, plus + and the avatar menu. 53's "Genes" and "Food" are not
   pages here: the genome lives at `/blood/genome`, and meals are
   phone-only. They are not added.

## Conflicts settled (main agent, from the inventory's list)

| Conflict                                                                                                                    | Decision                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Glyphs: 53 uses ● for grade A/B, ◐ for C, ○ for hypothesis; the app's `EvidenceChip` uses ● science, ◐ opinion, ○ anecdotal | Keep the app's `EvidenceChip` everywhere, hunches included. A hunch explanation carries a `basis`, and `hypothesis` renders ○. One meaning app-wide. iOS follows the same rule.                                                                                                                                                                           |
| Soft status fills: 53 uses them; the rule is "the spectrum is never a surface", and tests pin it                            | The owner picked 53. Soft fills are allowed on **stamps, state pills and heading tiles only**; cards and rows stay on the canvas. Narrow the tests to that rule rather than deleting them.                                                                                                                                                                |
| Uppercase stamps against the "no uppercase mono" rule                                                                       | Stamps are Space Grotesk 11 caps with tracking, not mono. The rule against uppercase mono stays.                                                                                                                                                                                                                                                          |
| Fonts: Geist on the web against Space Grotesk in 53                                                                         | Space Grotesk via `next/font/google` (built into Next, no new dependency) for display and body, with `font-feature-settings: "tnum"`. Numbers keep their own class (`.t-num` and the existing type discipline), so `type-discipline.test.ts` keeps pinning _where_ numbers go and changes _which face_. Geist Mono stays for codes, rsids and file names. |
| Dark mode                                                                                                                   | A plum-night column: canvas `--plum-0`, cards `--plum-2`, ink `--cream`, hairlines `--plum-3`, the life/blood/gene family lightened (`--*-l`). It lives in `globals.css` only. `docs/mockups/v4/system.css` stays as it is, because iOS `DesignTokens.cssSHA256` pins its hash; moving the dark column there is a later iOS step.                                                                                                           |

## Slices

Three slices, run in order because they share `globals.css`. Each slice
ends green (typecheck, tests) with screenshots.

### 40a. Foundation (can run before 39S lands)

- **Tokens.** Copy the Hybrid block from `docs/mockups/v4/system.css`
  (uncommitted today; commit it with this slice) into `globals.css`
  `@theme` / `:root`. Add the dark column above. The old tokens stay as
  aliases pointing at the new ones, so no component breaks mid-phase.
  `--canvas` becomes the paper, and `--surface` becomes `--card`.
- **Grain.** 53's `--noise` becomes one static PNG made once by a script
  from the same mulberry32 seed, saved at `public/grain.png` (128×128).
  Body and header use it as a tiled background. Stamps must not move at
  runtime.
- **Font.** Space Grotesk via `next/font/google` in `app/layout.tsx`, with
  Geist Mono kept.
- **Shell.** `TopNav` becomes the plum header bar from 53 (brand, the five
  pills, + Add in lime, avatar menu with the same contents). The phone
  `.tabbar` is restyled, not removed. The iOS user-agent rule (no TopNav in
  the webview) stays.
- **Primitives in `ui-kit.tsx` and `globals.css`:**
  - `Stamp` (STEP / CLUSTER / DRIFT / GAP / GOOD NEWS / BELIEF, one ink
    each);
  - `Drawer`: a right-hand panel with a scrim at ≥ 1024 px and a bottom
    sheet below it, native `<dialog>`, focus trap, Esc, and the 53 curves.
    It replaces the unused `.drawer` class and does not change the existing
    `.sheet` dialogs;
  - `DrawAgeRing`;
  - the heading tile (word + arrow).
  - `Button` / `StateWord` / `Card` / `PillTabs` / `.empty` / `.tbl` /
    `Ruler` / `HistoryChart` / `ChartHover` get the Hybrid look through
    tokens and small CSS changes. Their props do not change.
- **Corridor charts** as components (server-renderable SVG, as
  `ruler.tsx` is):
  - `MiniCorridor`: own band, lab lines, goal band, last dot;
  - `CorridorChart`: draws, band as it stood, lab lines, step or previous
    max, landing line.

  They are tested like `ruler.tsx`.

- Tests: update `sweep.test.ts`, `type-discipline.test.ts`,
  `chart-hover.test.tsx` and `verdict-card.test.tsx` to the settled rules
  above. Add tests for `Stamp`, `Drawer` (render) and both corridor charts.

### 40b. Home (after 39S)

The 53 layout, top to bottom:

1. **The plum header.** It carries:
   - the heading sentence ("Two systems heading away, one toward, four
     holding"), built in code from `today.heading`;
   - the 12 heading tiles;
   - the confidence line with `DrawAgeRing` ("Last draw N days ago · M of
     12 systems · K hunches open"), plus "Retest due · plan a draw", which
     links to `/blood/plan`.
2. **The goal hero** for the first goal. It shows:
   - the number, and how far over or under the goal it is;
   - the word and the slope;
   - the sentence;
   - a `CorridorChart` with the goal band, the own band, the lab lines
     and the "if nothing changes" landing line;
   - the "Last 17 months / Five years" toggle from 53.

   With no goal, the hero is the spear `ConclusionCard`.

3. **Three columns.**
   - **Today**: sleep, moves, calories and protein, from `todayBody`
     score rows. This is new on the web.
   - **Heading**: the goal row, then the 12 systems.
   - **Watch**: open hunches, then "The engine keeps in mind" (the top
     ledger beliefs and genome lines).
4. **The Worth a look rail**: `HunchRow` cards with a stamp, a mini
   corridor and state. Clicking one opens the `Drawer` with the case. The
   case covers depth 2 and depth 3 as in 54:
   - the chart, or four lanes for a cluster;
   - explanation bars with `EvidenceChip`, reordered with FLIP after an
     answer (`LedgerList`/`Digits` from `motion.tsx`);
   - the question chips;
   - the test with **Write it down** and the stamp;
   - the outcome;
   - How we know folds: the rule, the draws with their file names (each
     links to `/blood/uploads/[id]` when there is one), the evidence, the
     unknowns, and the replay.

   All of it calls `/api/hunches/*`.

5. **Everything Home has today continues below, translated into cards on
   paper.** That covers:
   - the "Fix this first" spear `ConclusionCard` (when the hero is a
     goal);
   - `TodayQuestions` (Still true? and One question);
   - `AskLine`;
   - the ledger (EvidenceLegend, FindingsCard, ConclusionCards /
     MarkersCard, ImprovedCard, the quiet tail);
   - `ResearchCompact`;
   - `KeyTrends`;
   - `SinceLine`;
   - `LedgerMotion`.

   `HomeRail`'s cards (goals, status, body, blood, plan, systems) stay as
   the phone layout's rail. On desktop, the three columns carry their
   content. `railCards` order tests stay green, or they are updated with
   the reason written in the test.

6. `EmptyHome` for a new user.

### 40c. Every other page

Each page from the inventory's table gets the Hybrid shell and card
language with the same components and the same data:

- `/body` (four tabs);
- `/blood` (four tabs). The Markers tab gains 55's corridor rows (hunches
  first, then markers outside their band on top). Its search and filter
  stay, and the marker dialog becomes the `Drawer`;
- `/blood/m/[code]` (a `CorridorChart` added above `HistoryChart`; both
  stay);
- `/blood/genome`, `/blood/plan`, `/blood/uploads/[id]`;
- `/plan` (all ten panels, the horizon shelf, coverage);
- `/plan/research/[topic]`, `/graph` (bubbles, systems arcs), `/chat`,
  `/chat/[id]`;
- `/login`;
- `/brain`, `/hkb`, `/admin` (restyle only).

Dead but defined (`.meal`, `MiniSparkline`, `Strip`): left alone. Not
removed.

## Verify (every slice)

```
cd apps/simple
pnpm typecheck
pnpm test                        # was 1938 green; stays green, count only grows
pnpm build                       # the production build must pass
pnpm dev  (port 3000, rm -rf .next first on the external volume)
```

- **Screenshots.** Use headless Chrome (recipe in
  `docs/mockups/v4/ios-variations/26-matrix-spec.md` "Verify"). Sign in as
  the owner on the local DB, or use a dev session helper if one exists. Do
  not attach to the owner's Edge. Take:
  - every route touched by the slice, at 1280 and 390, light and dark;
  - one with the `Drawer` open at 1280 and 390.

  Save them to `/tmp/p40<slice>/` and compare them with 53 by eye.

- **Inventory check.** For every row of the inventory touched by the slice,
  write one line in "As built" saying where it is now.

## Removals for owner OK

(empty; a builder adds rows here instead of deleting)

## As built (40W)

Built 2026-09-26 in three slices, each green before the next. Final run:
`pnpm typecheck` clean; `pnpm test` 97 files, 2029 tests (was 96 / 2013
after 40a, 97 / 2026 after 40b); `pnpm build` passes.

### Routes (inventory A)

- (root layout): Space Grotesk plus Geist Mono, the theme script kept; grain and Hybrid tokens in `globals.css` (40a).
- (app layout): the redirect and the iOS webview rule (no TopNav) kept; the plum header bar in `top-nav.tsx` (40a).
- /login: same LoginForm on the Hybrid card (tokens only); checked at 1280 and 390, light and dark (40c).
- /: the plum hero (`HyHero`), the goal hero (`GoalHero`, or the spear when there is no goal), the three columns (Today, Heading, Watch), Worth a look (`HunchRail`) and the case Drawer; everything that was on Home continues below in the same order (40b).
- /body: same four tabs and components; the page title takes the shared Hybrid h1 (40c).
- /blood: same four tabs. Markers gains Worth a look, Good news and "Outside your band" rows with `MiniCorridor` above the search, the filter and the grouped rows; the marker dialog is now the `Drawer` with the same kpi, Ruler, HistoryChart, Retest and foot links (40c).
- /blood/m/[code]: a `CorridorChart` ("Your own band") added between the latest reading and `HistoryChart`; everything else in place (40c).
- /blood/genome, /blood/plan, /blood/uploads/[id]: same components in the Hybrid cards; genome and plan take the shared h1 (40c).
- /plan: all panels, the horizon shelf and coverage unchanged, in the Hybrid cards (tokens only) (40c).
- /plan/research/[topic]: unchanged markup in the Hybrid cards; shot as a local user who has topics, because the owner has none (40c).
- /graph: bubbles and systems arcs unchanged, Hybrid cards (40c).
- /chat, /chat/[id]: ThreadList and Thread unchanged, Hybrid cards (40c).
- /brain, /hkb, /admin: kept; restyle through tokens only (40c).

### Components (inventory B)

- Shell and nav: TopNav, ThemeToggle, PillTabs, Composer, motion, Term, ui-kit, plan.tsx: all kept; TopNav restyled; ui-kit gains `Stamp`, `DrawAgeRing`, `HeadingTile`; `Drawer` in `drawer.tsx` (40a).
- Cards: every home.tsx card, HomeRail, ActionCard, PatternCard, VerdictCard, WhatToDo, ActOnIt, AskAnswer, research-panel: kept, restyled by tokens. HomeRail shows below 1024 px only; the three columns carry its content on a desk (40b).
- Rows: all kept. BloodMarkers rows kept and joined by `HunchShelf` and the "Outside your band" rows (40c).
- Charts: Ruler, HistoryChart, ChartHover, DailyLine, heatmap, HistoryLanes, KeyTrends, plan-month, Bubbles, arcs, Journeys: kept. New `MiniCorridor`, `CorridorChart` (40a), `MarkerCorridor` (40c).
- Forms and inputs: all kept, restyled by tokens.
- Overlays: Composer `.sheet` unchanged; the blood-markers dialog moved to `Drawer`; the hunch case uses `Drawer` (40b).
- Tooltips, empty states, admin tables, Other: kept.
- Styled but never rendered (`.meal`, `MiniSparkline`, `Strip`): left alone.

### Deviations

- `docs/mockups/v4/system.css` is not committed: no commits in this run.
- `--ink-3`, `--ok`, `--warn`, `--bad` are darkened for AA contrast on the paper.
- A dev-only screenshot harness: `lib/dev-auth.ts`, aliased over `@/lib/auth` only when `OV_DEV_AS` is set and NODE_ENV is not production.
- New optional contract field: `CaseSeries[].upload?: string | null` (links a draw to `/blood/uploads/[id]`).
- `hypothesis` added to the evidence maps (`lib/evidence.ts`, `evidence-chip.tsx`): renders ○.
- The 40a Drawer screenshot moved to 40b, where the Drawer first has content.
- The header pills keep their icons.
- `.ring` renamed `.age-ring`: it collided with Tailwind's `ring` utility.
- The goal hero and case charts pick their size with a JS `useNarrow()`, not a CSS switch: a media-query `display:none` on an animated SVG stopped Chrome painting its finished animations.
- `CorridorChart` gains an optional `short` prop (53's phone labels).
- The old Home h1 is now an h2 under the hero h1.
- "Fix this first" shows only when the hero is a goal (with no goal the spear is the hero).
- Blood Markers: the search narrows the hunch and "Outside your band" rows, the tab row does not (it filters by the lab's range, and a marker can sit inside the lab's range and outside its own band). 55's "Moving together" cluster group is not drawn in the marker list: `HunchRow` does not name the members; the cluster's lanes are in its case.
- Blood Markers keeps its phone behaviour: below 768 px a marker row navigates to `/blood/m/[code]`; the hunch rows open the Drawer at every width.
- `h1.c-title` takes the ViewShell size, so Body, Blood, Genome, Plan a draw and the marker page print the same title as /plan and /graph.
- The case lanes hide the chart's band label; the line under each lane says it.
