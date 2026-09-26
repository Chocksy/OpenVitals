# UI inventory of apps/simple (2026-09-26)

Root: `/Volumes/External/Development/OpenVitals/apps/simple`. Everything here was checked against the files at HEAD `55dac51`. The one uncommitted change that matters is the Hybrid token block in `docs/mockups/v4/system.css`. The target design is `docs/mockups/v4/ios-variations/53-web.html`, and the rules come from `docs/plans/2026-09-26-phase39-hunches-spec.md` under "Owner picks".

## What changed since 2026-09-02

The previous inventory was written at phase 29, before phase 30. Since then:
- **24 routes became 5 destinations.** Phases 30a–30e folded them into Home, Body, Blood, Plan and Graph. 15 old URLs are now permanent redirects in `next.config.ts` (`folded`):
  - /today, /feel, /trends, /history → `/body?tab=…`
  - /labs, /labs/phone, /biomarkers, /uploads → `/blood?tab=…`
  - /uploads/:id → /blood/uploads/:id, and /m/:code → /blood/m/:code
  - /protocol, /goals, /insights → `/plan?tab=…`; /review → /plan#answer; /patterns/:id → /plan#patterns
- **7 new page files:** /body, /blood, /blood/genome, /blood/plan, /blood/m/[code], /blood/uploads/[id], /plan/research/[topic].
- **recharts is gone** (it is no longer in `package.json`). All charts are hand-drawn: `ruler.tsx`, `history-chart.tsx`, `daily-line.tsx`, plus `chart-hover.tsx` for hover cards.
- **ui-kit was rewritten.**
  - Removed: the 8 cva button variants, the 7 Badge variants, TierChip and StatusBadge.
  - Now there: `Button` with three jobs (`ink` / `quiet` / `text`), `AddButton` (the lime +), `StateWord` (a coloured word, never a fill), `Tier`, `Card`, `SuccessCheck`, `MiniSparkline`.
- **Components deleted:** biomarker-list, chart-domain.ts, daily-charts, graph-map, labs-header, range-bar, range-scale.ts, status-badge, trend-chart, wearable.
- **Components added:** blood, blood-markers, body-day, body-history, chart-hover, checkin, daily-line, history-chart, notes-read, plan-day, plan-draw, plan-month, plan-sections, plan-tick, research-now, research-panel, ruler, topic-actions, verdict-card.
- **Tests added:** chart-hover, goal-band, history-lanes, home-ux, plan-day, research-panel, sweep, verdict-card.
- **The simple/deep switch (`data-view`) is gone**, and `sweep.test.ts` locks that.
- **Dashed empty states are gone**, replaced by `.empty`. The one tab style left is the sliding `PillTabs`.
- **`globals.css` grew from 1941 to 5481 lines.** It is copied from `system.css`: 30a foundation, 30e graph/table/thread, and section 15 (verdict, paper, month, day column, schedule, meal, hover card, topic head).
- **Nav** is now Home, Body, Blood, Plan, Graph, plus the lime + and an avatar menu (Chat, Theme, admin System group, Sign out).
- **Phase 37/38 (iOS Hybrid)** added API routes the web never renders: `/api/meals/[id]`, `/api/meals/[id]/reread`, `/api/score/days`, `/api/targets`. It also extended `lib/api-contract.ts` (`todayBody` with kcal/protein targets).
- **Hybrid tokens** (`--plum*`, `--paper*`, `--card`, `--cream`, `--life/blood/gene`, `--h-*`, `--ease-spring/ispring/fly`) sit uncommitted in `system.css`. They reach iOS through `gen-design.py` but are **not** in `globals.css`.

## A. Routes

"Reads" means the server-side lib functions, because the pages are server components. Client posts are listed under the component that makes them in section B.

| Path | File | What it shows | Main components | Reads |
|---|---|---|---|---|
| (root layout) | `app/layout.tsx` | html shell; Geist Sans and Mono; an inline theme script sets `html[data-theme]` from localStorage or the OS | — | — |
| (app layout) | `app/(app)/layout.tsx` | Redirects to /login when signed out. TopNav is dropped when the user agent has `OpenVitalsiOS`. `main` max 1400; `data-app` sets 16 px inputs | TopNav, Composer, Toast, TermEdges | `openReviewCount`, `isAdmin` |
| /login | `app/login/page.tsx` | One centred card: sign in / sign up, Google button when configured | LoginForm (client.tsx) | `currentUserId` |
| / | `app/(app)/page.tsx` | Top: HomeLight + one sentence (goals, else first move) + SinceLine + HomeRail (goals, status navy, body, blood, plan, systems). Then AskLine; Systems (tiles from 768 px, chips on phone); TodayQuestions (Still true? + One question); "Fix this first" spear ConclusionCard; the ledger (EvidenceLegend, FindingsCard, ConclusionCard / MarkersCard, ImprovedCard, quiet tail); ResearchCompact; QuietLine; Key trends; LedgerMotion. Empty: EmptyHome | home-rail.tsx, home.tsx, ask-line, research-panel, ledger-motion, motion | `buildLedger`, `latestReport`, `getMetricRows`, `getGoals`, `catalogFor`, `buildToday`, `recentFindings`, `listWatch`, `todayGoals`, `planTodayBody`, `actionsForAll`, `railCards`, `systemTiles` |
| /body | `app/(app)/body/page.tsx` | h1 + lede. PillTabs: Today · Check-in · How you feel · Trends. Today: SyncLine + BodyDayList. Check-in: day stepper + HabitChecklist / QuickNumbers. Feel: the Feel list. Trends: two PillTabs (measure, 30/90/365 d), DailyLine, ConsistencyHeatmap, BodyHistory (lanes) | pill-tabs, body-day, checkin, feel, daily-line, heatmap, body-history | `getBodyDay`, `getToday`, `getBodyTrends`, `buildModelInput`, profile facts and history, `buildLedger`, `SYMPTOM_ITEMS` |
| /blood | `app/(app)/blood/page.tsx` | PillTabs: Draws · Markers · Phone · Uploads. Each tab queries only what it draws | blood.tsx (BloodDraws, BloodPhone, BloodUploads), blood-markers | `getDraws`, open goals as planned draws, `getMetricRows`, `getPhoneMetrics`, uploads with reading counts / flags / day range (genome first) |
| /blood/m/[code] | `app/(app)/blood/m/[code]/page.tsx` | Back link; h1 + StateWord ▲; `panel hi` with kpi (latest, delta, target) and Ruler; HistoryChart; last projection panel; "The bands, and the goal" with OptimalForm and GoalForm; "Every reading" table (90 rows for phone series) | ruler, history-chart, tracker (GoalForm, OptimalForm), StateWord | `getMetricRows`, `getGoalFor`, `projectionsFor` |
| /blood/genome | `app/(app)/blood/genome/page.tsx` | "What your genome answers" (VerdictCard rows); genes table; "Read, but never a risk" note rows. Empty: `.empty` | verdict-card, genome-table, StateWord | uploads (kind genome), `loadGenome`, `genomeVerdicts`, `genomeNotes` |
| /blood/plan | `app/(app)/blood/plan/page.tsx` | "Plan a draw": candidates grouped now / planned / wait, next to the order sheet | plan-draw | `nextMoves` (tests only), `scoreHypotheses`, open goals |
| /blood/uploads/[id] | `app/(app)/blood/uploads/[id]/page.tsx` | drawer-head (file, kind, date, StateWord, Reanalyze, Delete); read receipt (kpi + `.verdict` row); ChangeKind select; doc meta; then GenomeTable, DocumentItems or ReadingRows by kind; iframe of the file or a raw-text disclosure | client (ChangeKind, DeleteUpload, ReanalyzeUpload), genome-table, document-items, reading-rows | `findUpload`, readings + metrics, genome variants, document items, `receiptLine` |
| /plan | `app/(app)/plan/page.tsx` | PlanShell (h1, "Written …", Generate). Profile strip (sex, age, N of M answered, jump links); blocked ReviewItems; phone PillTabs Today/Month/All (anchors); "What this means" (eli5 + longer version). Ten panels in order: Today (PlanDay), This month (PlanMonth), Do this first (ActionCard, with ResearchCompact after it), Already doing (ProtocolItemRow, AddProtocolItem, archived disclosure), Goals (GoalRow, Reached), Patterns (PatternCard), Tests to order (TestRow + Plan a draw), Research (ResearchSection), Answer these (ReviewItem), Earlier plans (FactRow). Then the "Popular right now" horizon shelf and Coverage. `?tab=` moves the wanted panel first | plan.tsx, plan-day, plan-month, plan-sections, action-card, research-panel, tracker, client (ReviewItem), term, evidence-chip | `latestReport`, `queueQuestions`, `closeAnsweredQuestions`, `bootstrapProtocol`, `buildModelInput`, review items, insights, `getProtocol`, `getGoals`, `listWatch`, `watchConditions`, `topicsBody`, `coverage`, `matchPatterns`, `graphState`, `nextMoves`, `inlineAsks`, `horizonShelf`, `actionsForAll`, `previewLines` |
| /plan/research/[topic] | `app/(app)/plan/research/[topic]/page.tsx` | topichead (label, relevance, run line); verdict table (outcome, direction, evidence, dose), or two `.empty` tiles when unread; "What the trials found" beside "What is only an association" (`.paper` rows); For you; Watch this (TopicActions); "Found, not read yet" | evidence-chip, research-now (DiscussPaper), topic-actions, StateWord | `getTopic`, `findingsFor`, `listWatch`, `topicPerson`, `previewLines` |
| /graph | `app/(app)/graph/page.tsx` | ViewShell "Your graph"; PillTabs Conditions/Systems and a lens (lifespan / energy / mood / weight); `.empty` when sex or age is missing. Conditions: the Bubbles stage + side panel (AskBox, hot nodes, active edges). Systems: `grid4` of 12 `.card` tiles, each with an SVG `.arc` ring and StateWord; "Patterns matched" panel + unmatched chips | bubbles, plan (ViewShell), pill-tabs, StateWord | `buildModelInput`, `buildBubbles`, `computeGraphState`, `loadGraph`, `loadGenome`, `catalogFor`, `scoreHypotheses`, `nextMoves`, `matchPatterns` |
| /chat | `app/(app)/chat/page.tsx` | h1 "Ask", a new Thread, and an "Everything you asked" panel with ThreadList | chat | threads (50) |
| /chat/[id] | `app/(app)/chat/[id]/page.tsx` | Back link + Thread seeded from stored UI messages | chat | threads, threadMessages |
| /brain (admin) | `app/(app)/brain/page.tsx` | Brain console, tabs Engine / Journeys | brain, journeys, action-card, ask-box | users, `userPanels`, `PERSONA_IDS` |
| /hkb (admin) | `app/(app)/hkb/page.tsx` | "Knowledge base"; PillTabs over 8 tabs (conditions, evidence, interventions, activity, priors, tests, calibration, imports). Each tab is a panel with a `.tbl`, 300-row limit, no pagination | hkb-controls (Override, ResearchButton, ClaimBox, CatalogToggle, RunImport), EvidenceChip, Tier, StateWord, PillTabs | hkb tables, research and import runs |
| /admin (admin) | `app/(app)/admin/page.tsx` | RunCurator + two CSV links; Data state `statgrid` + 4 summary lines; Curator runs table; Unit mismatches and Minted metrics tables | client (RunCurator), StateWord | raw SQL stats, curatorRuns |

## B. Components

All CSS classes come from `app/globals.css`; there are no CSS modules. Tailwind utilities are layered on top. "§" refers to the section headers in globals.css (see section C).

### Shell and nav
- **top-nav.tsx `TopNav`** (client): sticky `.nav-bar .topbar`, `.brand`, `.pills` with 5 destinations; `AddButton` (`.plusbtn`); avatar `<details class="avmenu">` / `.avpanel` (Graph on phone, Chat + count, ThemeToggle, admin System group, Sign out); phone `.tabbar` with `.plusslot`. Used in the (app) layout. CSS: §03 shell and home §"nav".
- **theme-toggle.tsx `ThemeToggle`**: `.theme-row` with PillTabs (light / system / dark) writing localStorage and calling `__applyTheme`. Used in TopNav.
- **pill-tabs.tsx `PillTabs`** (client): the one tab control. `.t-tabs`, `.t-tabs-pill`, `.t-tab` (transitions.dev 16 plus extensions). Used on /body, /blood, /plan, /graph, /hkb, and in key-trends, blood-markers, brain, heatmap, theme-toggle.
- **composer.tsx `Composer` / `openComposer`** (client, 941 lines): native `<dialog>` `.sheet` / `.sheet-head` / `.sheet-body` / `.sheet-foot`. Holds a `.ta` textarea, a `.t-stagger` row of `.gchip` chips with `.chipedit`, the photo path, a follow-up question, AskAnswer, and undo. Posts to /api/compose, /api/capture, /api/facts, /api/habits, /api/plan/*, /api/ask, /api/chat/threads. Used in the (app) layout, and opened from top-nav, ask-line, research-now, topic-actions and plan. CSS: §11.
- **motion.tsx**: `Digits`, `SwapText`, `LedgerList` (FLIP), `toast` + `Toast` (`.toast`). Used in the layout, home, home-rail, what-to-do, act-on-it, plan, composer and ledger-motion. CSS: the transitions.dev block.
- **term.tsx `Term` / `Terms`** (server) and **term-edges.tsx `TermEdges`** (client listener): glossary tooltips `.ov-term*`. Used on /plan, home, key-trends, plan-sections, action-card; TermEdges in the layout. CSS: §glossary tooltip, lines 3073–3203.
- **ui-kit.tsx**: `Button` (`.b` with `.b-ink` / `.b-quiet` / `.b-text`, `.b-sm` / `.b-icon`, `data-busy`); `AddButton` (`.plusbtn`); `StateWord` (`.state` off/border/on/none with `.dot` / `.tri`); `toneOf`; `Tier` (`.tier`); `Card` (`.card`); `SuccessCheck` (`.t-success-check`); `MiniSparkline` (SVG). Used almost everywhere. CSS: §04, §06, §07.
- **plan.tsx** (client): `ViewShell` (h1, subtitle, actions), `PlanShell`, `GeneratePlan`, `AdoptHorizon`, `ActionButtons`. Used on /plan, /graph, home, brain, action-card.

### Cards
- **home.tsx**:
  - `ConclusionCard` (`.conc`, `.conc-top`, `.conc-rank`, `.conc-name`, `.conc-pct`, `.conc-prose`, plus Ruler, spear mini HistoryChart, AskLink, WhatToDo, ActionButtons, and a why disclosure with CopyNote / WrongValue / EditFact)
  - `MarkersCard` (a `.conc` with `.chips`)
  - `FindingsCard`, `ImprovedCard` (`.panel`)
  - `TodayQuestions` (`.panel`, StillTrue, TodayAsk, NotesRead)
  - `SinceLine`, `QuietLine` (`.disclose`), `SectionHeader` (`.sub`), `EvidenceLegend` (`.legend`), `EmptyHome` (`.empty`)
  - Used on /. CSS: §07 cards, 30d block (4558–4757).
- **home-rail.tsx**: `HomeRail` (`.rail-wrap`, `.rail`, `.rail-card`, `.navy`, `.c-bar`, `.c-label`, `.c-num`, `.c-line`, and the goals card `.railgoals .goalrow .progress`); `HomeLight` (`.home-light .blob`); `SystemTiles` (`.sysgrid .systile`); `SystemChips` (`.chips.systems .chip .chip-dot`). Used on /. CSS: home block 4200–4557, systiles 4645+.
- **action-card.tsx `ActionCard`**: a `.conc` card for a report action (dose, aims, Tier, EvidenceChip, projection, ActionButtons). Used on /plan and in brain.
- **plan-sections.tsx `PatternCard`**: a `.conc` with the pattern's page behind a disclosure. Used on /plan.
- **verdict-card.tsx `VerdictCard`**: `.verdict` / `.vq` / `.vsay` / `.vside` / `.vx`. Used on /blood/genome. CSS: §15 verdict row (4768+).
- **what-to-do.tsx `WhatToDo`** (client): the top three actions on a card, Add per row + "Add all" (`.sub`, `.state on`). Used in ConclusionCard.
- **act-on-it.tsx `ActOnIt`** (client): a chip row under an answer (`.chips .chip .chip.ink .chip.quiet`). Posts to /api/plan/adopt and /api/goals. Used in chat and ask-answer.
- **ask-answer.tsx `AskAnswer`** (client): answer, `.stateline`, `.sources`, disclosure. Used in composer, chat, ask-box.
- **research-panel.tsx**: `ResearchSection` (a `.panel` of `.paper` rows plus topics), `ResearchCompact`, `PaperRow`. Used on / and /plan. CSS: §15 paper row (4864+).

### Rows
- **plan-sections.tsx**: `ProtocolItemRow` (`.protorow`, `.strip30`, `.pct`, ArchiveButton); `GoalRow` (`.markerrow`, `.progress`, `.tgt`); `TestRow`; `FactRow` (`.markerrow said`). Used on /plan. CSS: 30d (4594–4644).
- **body-day.tsx**: `BodyDayList` (`.markerrow day said` with `.nm .note .val .wd`), `SyncLine`. Used on /body. CSS: §9 lists and rows (1407+).
- **blood.tsx**: `BloodDraws` (`.drawline` axis + `.tbl`), `BloodPhone` (`.markerrow` + spark), `BloodUploads` (`.uprow`, UploadButton, CSV links). Used on /blood. CSS: 2527 draw line, 2611 upload row.
- **blood-markers.tsx `BloodMarkers`** (client): `.searchbox`, a PillTabs filter, `.markerrow mk` rows with a Ruler. Wide screens open a `<dialog class="sheet">` "drawer" (centred, max 620 px) with Ruler + HistoryChart. Used on /blood?tab=markers.
- **reading-rows.tsx `ReadingRows`** (client): editable reading rows (`.inp num`). Posts to /api/readings/[id]. Used on /blood/uploads/[id].
- **document-items.tsx `DocumentItems`** (client): accept / reject / edit rows grouped by kind. Posts to /api/uploads/[id]/items. Used on /blood/uploads/[id].
- **plan-day.tsx `PlanDay`** (`.daycol`, `.dayrow`, `.at`, `.what`, `.why`, `.tag`) and **plan-tick.tsx** (`DayRow`, `AdoptSuggested`): the day column. Used on /plan#today. CSS: §15 day column (5047+).
- **feel.tsx `Feel`** (client): `.qrow`, `.optchip`, FactEditButtons. Used on /body?tab=feel.
- **chat.tsx**: `ThreadList` (`.threadrow`), `Thread` (`.thread`, `.qline`, `.receipt`, sticky ask field, fold `<details>`). Used on /chat and /chat/[id]. CSS: 30e thread row (3494+).
- **client.tsx `ReviewItem`, `StillTrue`, `AnswerQuestion`**: question rows with option buttons. Used on /plan, home and today-ask.
- **ask-link.tsx `AskLink`**: a question line + Answer link (inline Tailwind, left ink border). Used in ConclusionCard.

### Charts
- **ruler.tsx `Ruler`** + `rangeScale`, `digits`, `goalAim`, `goalWords`: `.ruler-track`, `.band normal/optimal/pace/goal-in`, `.brk`, `.mid`, `.mval`, `.ghost hovermark`, `.ruler-say`. Used on /blood/m, blood-markers, the home cards, key-trends, plan-month, blood. CSS: 1879–2202.
- **history-chart.tsx `HistoryChart`** + `chartDomain`: `.hist-head`, `.hist-body`, `.hist-y`, `.hist-plot`, `.hist-band normal/optimal/goal/pace`, `.hatch`, `.proj`, `.tgt`, `.hist-legend`; has a `mini` mode. Used on /blood/m, the drawer, key-trends, the spear card. CSS: 2203–2526.
- **chart-hover.tsx `ChartHover`**: CSS-only `.hovercard` / `.hovermark` with `.hdate .hval .hrow .hwas`. Used in ruler and history-chart. CSS: §15 (5277–5451).
- **daily-line.tsx `DailyLine`**: `.daily*` hand-drawn line plus draw diamonds. Used on /body Trends. CSS: §10 charts (1681+).
- **heatmap.tsx**: `ConsistencyHeatmap` (`.hm`, `.hmkey`, c0–c4) and `Strip` (`.strip30`). The heatmap is used on /body; Strip is imported by tracker.tsx but not rendered.
- **history-lanes.tsx `HistoryLanes`** (client) via **body-history.tsx `BodyHistory`** (server): an SVG of three lanes with a replay range slider. Used on /body Trends.
- **key-trends.tsx `KeyTrends`** (client): a grid of HistoryChart + Ruler in `Card`s, with a phone switcher. Used on /.
- **plan-month.tsx**: `PlanMonth`, `ThisWeek`, `Supplements`, `ComingUp` (`.month`, `.monthkey`, `.tbl sched`, `.strip30`). Used on /plan#month. CSS: §15 month strip (4950+) and schedule (5125+).
- **bubbles.tsx `Bubbles`** (client): pan/zoom SVG stage in `.stagesplit`, plus side panel `.panel hi` with AskBox, hot nodes and active edges. Used on /graph. CSS: 30e (3210–3300).
- **graph systems arcs**: inline in the /graph page (`.arc .trk .val`, not a component). CSS: 3301+.
- **journeys.tsx `Journeys`**: SVG path diagram with controls. Used in brain.
- **ui-kit `MiniSparkline`**: imported by client.tsx but not rendered anywhere.

### Forms and inputs
- **client.tsx**: `LoginForm` (`.field`, `.inp`); `UploadButton` (label-wrapped file input); `DeleteUpload`; `ReanalyzeUpload`; `ChangeKind` (`.sel`); `RunCurator`; `CopyNote`; `WrongValue`; `EditFact`; `useAction`.
- **tracker.tsx**: `AddProtocolItem` (`.card` form, `.fields`, `.sel`, `.chip`); `ArchiveButton`; `GoalForm`; `OptimalForm`. Used on /plan and /blood/m.
- **checkin.tsx**: `HabitChecklist` (`.checkrow`, `.box`); `QuickNumbers` (`.field`, `.withunit`, `.inp num`, `.rate`, `.ta`). Used on /body Check-in.
- **fact-edit.tsx `FactEditButtons`**: "This changed" / "I was wrong" with a since-date (`.inp mini`).
- **ask-line.tsx `AskLine`**: `.ask-pill`, hands text to the composer. Used on /.
- **ask-box.tsx `AskBox`**: `.ask` / `.q` / `.askbtn`. Used in bubbles and brain.
- **today-ask.tsx `TodayAsk`**: the only answer input on Home.
- **research-now.tsx**: `ResearchNow` (condition `.sel`, run button), `DiscussPaper`.
- **topic-actions.tsx**: `TopicActions`, `WatchTopic`.
- **plan-draw.tsx `PlanDraw`**: candidate rows (`.mrow`), `.filters`, order sheet (`.panel hi`). Posts to /api/goals.
- **hkb-controls.tsx**: `Override`, `ResearchButton`, `ClaimBox`, `CatalogToggle`, `RunImport`.
- **brain.tsx `Brain`** (1666 lines): Engine / Journeys PillTabs, parameter form, tables.
- CSS for all of these: §05 inputs (532–814).

### Overlays, drawers and sheets
- Composer `<dialog class="sheet">` and the blood-markers marker `<dialog class="sheet">`. Both are centred modals, **not side drawers**.
- The `.drawer` class (lines 1010–1030) is defined but only `.drawer-head` is used (on the upload page).
- Toast: `.toast` (§11 plus transitions.dev 22).
- Avatar `<details>` menu.
- `<details class="disclose">` everywhere.

### Tooltips and glossary
- Term / Terms / TermEdges (`.ov-term*`).
- ChartHover (`.hovercard`).
- EvidenceChip (`title` attribute).
- **evidence-chip.tsx**: `EvidenceChip` (glyph + grade letter: ● science, ◐ opinion, ○ anecdotal) and `LabelledProse`.

### Empty states
All use `.empty` with `.k` + `b` + p + one link (§12, lines 1270–1305):
- EmptyHome
- Plan's No plan, No goals and Nothing due
- /blood/genome's "No genome"
- /blood/plan's "Nothing to order"
- /graph's "Waiting on two facts"
- the topic's "Found, not read yet"
- BodyDayList
- blood.tsx tabs

`.cap` captions serve as inline empties.

### Admin tables
- `.tblwrap .tbl` with `td.k` / `td.n` (§tables, lines 2733–2942).
- /admin: three tables plus `statgrid`.
- /hkb: 8 tabs, each with ≥1 table.
- brain.tsx: tables.
- The marker page's "Every reading", the genome table and the plan-month schedule reuse the same classes.

### Other
- **ledger-motion.tsx `LedgerMotion`**: re-fetches /api/ledger and toasts the diff.
- **notes-read.tsx `NotesRead`**: posts to /api/compose/reread.
- **genome-table.tsx `GenomeTable`**: `.tbl` with a rsid disclosure. Used on /blood/genome and /blood/uploads/[id].

### Styled but never rendered
- `.meal` card (5162–5276): meals are iOS-only.
- `.drawer`.
- `MiniSparkline`; `Strip` (imported, never rendered).

## C. Styling

**`app/globals.css`** is 5481 lines, starting with `@import "tailwindcss"`:
- **1–21:** header comment. It says the file is copied from `system.css`, and system.css wins when they disagree.
- **23–109:** `@theme` tokens:
  - Geist font vars (display, body, mono)
  - canvas / surface / track / hair
  - the ink ladder
  - the spectrum `--ok --warn --bad --bad-fill --none`
  - navy + navy spectrum, `--sky`
  - `--lime` / `--lime-ink`
  - Fibonacci space `--s3…--s55` and `--sp-*` aliases
  - radii 13 / 21 / 34 / pill
  - type 11 / 13 / 15 / 21 / 34
  - `--dur-quick`, `--dur-fast`, `--ease`
- **111–120:** `:root --top-nav-height`.
- **122–140:** dark mode, `:root[data-theme="dark"]` overrides.
- **142–~205:** base: overflow clip, body font and colours, focus ring in ink, selection, scrollbar, `[data-app]` 16 px inputs.
- **211–3203:** `@layer components`:
  - 212 icons
  - 233 §03 shell
  - 436 §04 buttons
  - 532 §05 inputs
  - 815 §06 state words / chips
  - 936 §07 cards (drawer at 1010, rail at 1147)
  - 1169 §11 sheets and overlays
  - 1270 §12 empty states
  - 1306 panels and page furniture
  - 1407 §9 lists and rows
  - 1681 §10 charts: ruler 1879, history 2203, draw line 2527, sparkline 2592, upload row 2611, draw-builder row 2652, filter row 2712, tables 2733
  - 2943 August's light
  - 2992 login card
  - 3015 flat fallback (reduced transparency)
  - 3041 type discipline (`.t-title .t-body .t-meta .t-num`)
  - 3073 glossary tooltip
- **3205–3584:** 30e layer: graph stage, bubbles, systems arcs (3301), thread (3494).
- **3585–4151:** transitions.dev. Motion token `:root` at 3602, then snippets 01, 02, 04, 07, 09, 10, 14, 16, 18, 22, each with a reduced-motion guard, then project extensions.
- **4200–4557:** the 28c home block: home-light, rail, navy card, ask-pill, desktop grid, goals card, systems section, theme picker, login, compact input.
- **4558–4757:** 30d Plan and Home: evidence glyph, legend, protorow, goal row, systiles.
- **4759–5481:** §15: verdict 4768, paper 4864, month 4950, day column 5047, schedule 5125, meal 5162, chart hover 5277, topic head 5452.

**Fonts:** Geist Sans and Geist Mono from the `geist` npm package, set in `app/layout.tsx`. There is no Space Grotesk anywhere in apps/simple. Mono is the number voice; `sweep.test.ts` and `type-discipline.test.ts` lock that.

**Dark mode:** a full dark column in globals.css. `html[data-theme]` is set before first paint by the inline script; ThemeToggle offers light / system / dark. Some components add their own dark rules (systile, rail-card, ask-pill, home-light, drawer). The Hybrid tokens are declared light-only with "no dark twin", which is an open decision for the web.

**system.css relationship:** it is **copied, not imported**. `globals.css` is a hand copy of `docs/mockups/v4/system.css` (3339 lines, itself on `v4.css`), and system.css wins. The Hybrid block (system.css lines ~131–166, uncommitted, +35 lines) has **not** been copied into globals.css.

**Token generation:** `apps/ios/scripts/gen-design.py` reads system.css (`:root` = light, `.dark, html[data-theme="dark"]` = dark) and writes:
- `apps/ios/OpenVitals/DesignTokens.swift` (451 lines; already carries `--plum*`, `--paper*`, `--mist` …)
- a reference copy at `apps/ios/Tests/References/system.css`

`apps/ios/Tests/DesignTokensTests.swift` re-parses the copy. Nothing generates web CSS; the web side is a manual copy.

## D. Tests that pin UI

Component tests are under `components/`; they use `renderToStaticMarkup` or read the stylesheet directly.

| Test | What it pins |
|---|---|
| `type-discipline.test.ts` | Mono only for numbers, units, codes and dates, across SinceLine, HomeRail, SystemChips, ConclusionCard, MarkersCard, FindingsCard, ImprovedCard, QuietLine, TodayQuestions; abbreviations wrapped in Term; no Term inside a link |
| `sweep.test.ts` | Bans retired names (`neutral-*`, `accent-*`, `health-*`, `bg-white`, `rounded-sm`, `border-dashed`, `card-elevated`, `data-view`); globals.css still declares the ink ladder and spectrum; `font-mono` only in the uploads page and document-items |
| `motion-css.test.ts` | transitions.dev tokens installed once; every snippet present; reduced-motion guards; no `transition: all`; will-change rules |
| `no-dom-mutation.test.ts` | No hand DOM restructuring in components; empty allowlist |
| `home-ux.test.tsx` | Ruler under a card (value once, bands, dated previous draw, hover labels, rounded axis); lens line; evidence legend once |
| `chart-hover.test.tsx` | Five lines and their order; state word is text, never a fill; `movePct`; `cardDate` |
| `goal-band.test.tsx` | `goalAim`, `goalWords`, `markTitle`; a two-bound goal draws as a band |
| `range-scale.test.ts`, `chart-domain.test.ts` | Ruler scale and chart domain |
| `history-lanes.test.ts` | Label packing and fit |
| `plan-day.test.tsx` | Time column, dose, tag |
| `research-panel.test.tsx` | Paper row contents |
| `verdict-card.test.tsx` | Heading wording and `.verdict` tone classes |
| `what-to-do.test.tsx`, `evidence-chip.test.tsx`, `ask-answer.test.tsx`, `wording.test.ts` | Row wording, glyph + letter, Act on it chips, still-true row |
| `lib/home-data.test.ts` | **railCards order**: Status, Body, Blood, Plan, then systems; systems sorted red → amber → green; goals card before Status; unmeasured systems go to the chips |
| `lib/asking.test.ts` | One input per question key per page |

`lib/api-contract.test.ts` and `fixtures/api/*` pin the JSON the iOS app reads.

## E. What 53-web has that no current component covers

1. **Plum header with paper grain.** The noise is a canvas-generated `--noise` data URL with mulberry32. The header holds a nav (Home, Blood, **Genes, Food**, Plan, "+ Add", avatar). TopNav is a cream bar with Body and Graph. No Space Grotesk or `tnum` body type exists on the web.
2. **Heading sentence + 12-system strip.** "Two systems heading *away*, one toward…" with arrows ↗ → ↘. SystemTiles and SystemChips show the worst-marker state, not direction. The data (`heading[]`, phase 39 S7) doesn't exist yet.
3. **Confidence line with the draw-age ring.** An SVG ring for freshness (1 − days/365), "Last draw N days ago · 7 of 12 systems · N hunches open", and "Retest due · book a draw". Nothing covers it; the graph `.arc` ring is the closest primitive. This needs `confidence{}`.
4. **LDL goal hero.** Big number, "N over the goal", away word + slope/yr, a facts line, a sentence, the Last 17 months / Five years toggle, and a chart with goal band, personal band (median ± 1.4826 × MAD), dashed lab lines and an "if nothing changes" extrapolation. Today HistoryChart (target, dotted projection, hatch) plus the Goals rail card give part of this. Missing: the personal band, slope-to-due-date landing, and lab range drawn as dashed lines.
5. **Three columns.**
   - Today: Sleep, Moves, Calories, Protein bars. It exists only in `todayBody` for iOS, and the web doesn't render it.
   - Heading rows, including the goal row.
   - Watch: open hunch rows + "The engine keeps in mind" gene lines. The closest pieces are VerdictCard and GenomeTable.
6. **"Worth a look" hunch rail.** Cards carry a kind stamp (STEP / CLUSTER / DRIFT / GAP / GOOD NEWS), a mini chart, and state + next step, with selected and closed states. The HomeRail CSS and HistoryChart `mini` can be reused. The uppercase stamp conflicts with the "no uppercase mono" rule.
7. **Right-hand drawer + scrim, and the case.**
   - Head: stamp, system, state, close. Title + say. A legend + chart card, or a 4-mini grid for clusters with "No band yet: n draws" notes.
   - "What could explain it": glyph + text + % + bar, with FLIP reorder (LedgerList and Digits can do this).
   - Question card: its chips reorder the explanations.
   - Test card: name, price, Accept, predictions, "written down" stamp.
   - Play result, the arrival line, and an outcome stamp (confirmed / ruled out / faded).
   - The app has only centred `<dialog>` sheets and an unused `.drawer` class. There is no hunches lib, table or API yet (phase 39S S1–S7 is unbuilt).
8. **Glyph meaning conflict.** 53 uses ● = grade A/B, ◐ = C, ○ = hypothesis. The app's `EVIDENCE_LEGEND` uses ● trial, ◐ observational, ○ anecdote.
9. **Status colours.** 53 uses soft fills (`--h-green-soft` and friends); the app's rule is "the spectrum is never a surface". That rule, and `chart-hover.test` / `verdict-card.test` which assert it, would need the owner's decision.
10. **Pages 53 doesn't draw.** Body, Graph, Chat, Plan subsections, Blood tabs, the marker page, genome, uploads, research topic, and the admin pages all need a translated form. Nothing may be dropped without the owner's OK.
