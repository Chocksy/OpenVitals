# UI inventory of apps/simple (2026-09-02)

Produced for the design-system page. Root: `apps/simple`.

## Shell

- `app/layout.tsx`: Geist Sans + Mono, theme script on `html[data-theme]`.
- `app/(app)/layout.tsx`: TopNav (dropped inside the iOS webview), `main` max 1400, Composer (+ sheet), Toast, TermEdges.
- `components/top-nav.tsx`: sticky header, logo, four pills (Home, Plan, Labs, Graph), admin System group (Brain, HKB, Admin), avatar `<details>` menu with groups Data (Review + count badge, Uploads, History), System, Tracker (Today, Feel, Protocol, Goals, Trends), Ask the AI (Chat), ThemeToggle, Sign out. Mobile: fixed five-slot bar with the + in the middle.
- `components/composer.tsx` (955 lines): native `<dialog>`, `openComposer(text?, about?)`; textarea, chip row per understood item (tone by kind, icon swap, stagger), ChipEditor (select / text / decimal / date), photo path (file input, OCR preview chips), follow-up question panel with option buttons, AskAnswer, Undo, error line; footer photo / Reset / Post. Draft in localStorage.
- `components/motion.tsx`: Digits, SwapText, LedgerList (FLIP), toast + Toast (single fixed pill).
- `components/term.tsx` + `term-edges.tsx`: server `<Term>`/`<Terms>` glossary tooltips, CSS-only reveal, edge flip via data attributes. Never inside `<a>`/`<button>`.
- `components/theme-toggle.tsx`: light / system / dark as static pill tabs.
- `components/ui-kit.tsx`: Button variants default, primary, destructive, outline, outline-subtle (workhorse), secondary, ghost, link; sizes default, sm, lg, icon. Badge variants default, secondary, outline, normal, warning, critical, info. Card, TierChip (established / early / experimental), SuccessCheck, MiniSparkline.
- `components/pill-tabs.tsx`: sliding PillTabs (role tablist). Also a static `.pill-tabs` family in CSS (theme toggle, chart ranges, 1–5 ratings). Two tab styles: the clearest inconsistency.
- `app/globals.css` (1941 lines): @theme tokens (accent ultramarine, neutral scale, health semantics, radius/shadow scales, the 28c cream/spectrum/navy block, Fibonacci space, radii 13/21/34/pill), dark override, `.card`, static pill tabs, sheet keyframes, skeleton, progress bar, focus style, `[data-view="simple"] .deep`, print, iOS `[data-app]`, transitions.dev block (digits, text swap, panel slide, icon swap, success check, tabs, stagger, toast, flip, `.hit-40`), type discipline (`.t-title .t-body .t-meta .t-num`), glossary tooltip, the 28c home block (light, rail, cards, chips, tones), nav on the warm canvas.

## Routes

1. `/login`: centred card, name (sign-up) / email / password inputs, full-width button, Google button when configured, mode toggle link, inline error. No shell.
2. `/` Home: sentence + light + rail (Status navy, Body, Blood, Plan, systems), Ask pill, TodayQuestions (Still true? + One question: the only answer input surface on Home), Systems chips, Fix this first (spear ConclusionCard), the ledger (FindingsCard, ConclusionCard / MarkersCard, ImprovedCard, quiet tail), QuietLine (two details), Key trends (PillTabs + chart), LedgerMotion. ConclusionCard: rank badge, risk badge, state badge with SwapText, Digits percentage, grade Term, prose with Terms, why disclosure, AskLink, WhatToDo (buttons, EvidenceChips, toast, nested details). Empty: dashed card, No readings yet, link to /labs, GeneratePlan button.
3. `/plan` (681 lines): ViewShell (h1, subtitle, actions slot, simple/deep PillTabs persisted, `data-view`), profile strip (sex / age / questions answered, patterns chips, blocking ReviewItems), Answer these first (ReviewItem list), What this means (ELI5 + deep list), Patterns (stage badge, summary, verdict, edges, confidence badges), Do this first (ActionCard: weight badge, EvidenceChip, TierChip, why / projection / reasoning, adopt / dismiss / discuss), Tests to order (details list with state badge per row), Horizon shelf (anecdotal chips + adopt), empty state, Earlier plans (details: weekly review adherence %, lifestyle list, link to /insights), Coverage.
4. `/graph` (441 lines): ViewShell, lens PillTabs (URL params), bubbles ↔ systems toggle. Bubbles: pan/zoom SVG stage, side panel AskBox + AskLink questions. Systems: 4×3 tiles with SVG arcs, StatusBadge. Patterns matched, Hot nodes, Active edges (deep). Blocked state (sex/age ReviewItems). Empty state.
5. `/patterns/[id]`: back link, header card with matched / stage badge, Contested, Management, findings, edges with confidence badges, Questions (ReviewItem per question).
6. `/labs`: LabsHeader (h1, subtitle, UploadButton = label-wrapped file input, PillTabs Biomarkers / Draws / Phone / Uploads). One `<details class="card">` per draw day → table of markers linking to /m/[code]. Dashed empty state.
7. `/labs/phone`: phone metrics list with MiniSparkline per row.
8. `/biomarkers`: search input, per-category sections, rows with status dot, name, derived / from your phone markers, sparkline, value + unit, date, full-width RangeBar.
9. `/m/[code]` (262 lines): back link, h1 + StatusBadge, meta line (unit / reference / optimal / source / basis) + inline OptimalForm (two number inputs), goal line + GoalForm (numbers, date, note), RangeBar card, TrendChart card (recharts; range pill tabs; bands; goal lines; projection band + verdict badge), table Date · Value · Reference · Status.
10. `/uploads`: LabsHeader, two CSV export links, summary line, list rows: filename link, meta, three StatusBadges, Reanalyze / Delete buttons, error line, details of parsed rows. Dashed empty.
11. `/uploads/[id]`: back link, h1 + badges, ChangeKind select, Reanalyze, Delete; GenomeTable (gene rows: rsids, grade, call chip, genotype, meaning), DocumentItems (accept / reject, edit textarea), ReadingRows (editable value / unit / ref-low / ref-high / date), raw text `<pre>`.
12. `/history` (303 lines): HistoryLanes (three lanes on one axis: facts with strike-through corrections, actions as adherence bars, markers with projection band + verdict; replay range slider dims after the date and lists that day's beliefs), raw event table with kind badges.
13. `/trends`: DailyCharts (recharts; static pill tabs metric + range; reference lines; draw markers).
14. `/today`: date header with day-stepper buttons, streak pill, link to /feel, WearableStrip ×2 + NutritionLine (server, sourced numbers), HabitChecklist, QuickNumbers (number inputs, 1–5 pill ratings, notes textarea), DailySparks, ConsistencyHeatmap (mode pill tabs, year grid).
15. `/protocol`: AddProtocolItem (collapsed button → form: what / why inputs, cadence select, biomarker code + add, save / cancel), one card per item with ArchiveButton, linked biomarkers, AdherenceStrip (30 cells). Dashed empty. Archived behind details.
16. `/goals`: GoalCard grid (target range, due, progress), Reached section. Dashed empty.
17. `/feel`: progress line N of M, one card per group, per question a prompt + option chip buttons (selected accent, Check icon, spinner busy), FactEditButtons (since date), history line, source caption.
18. `/review`: one section per question kind, rows are AskLink or full ReviewItem. Dashed empty with green check.
19. `/insights` (456 lines): check-ins (CheckinButtons), experiments / labs (GenerateButton), insights; cards with coloured left border, biomarker chips, bullet rows, AdoptButton; two details; three dashed empties.
20. `/chat`, `/chat/[id]`: h1, Thread (message list, growing textarea, submit), ThreadList; thread page: back link, title, Thread seeded. ActOnIt rows with buttons, EvidenceChips, toasts.
21. `/brain` (admin, 1562-line client component): tabs incl. journeys, run toolbar, parameter form (~6 selects, ~6 number inputs), scenario / hypothesis cards with badges, move tree with inline SVG, undo, per-section details, filter row, AskBox, Journeys (select, checkbox, range slider, numbers, pass / fail badges, SVG path diagram).
22. `/hkb` (admin, 1174 lines): tables: conditions, wide evidence table (min 1200), claims, rings, calibration events, KB revisions, settled predictions, tests with prices, research runs, import runs. Controls: Override (inputs + select + button), ResearchButton, ClaimBox, CatalogToggle, RunImport ×3.
23. `/admin` (admin): h1 + link, two CSV links, RunCurator, Data state stat grid, Curator runs table, diagnostics table, Minted metrics table.

## Element catalogue

Button (default, primary, destructive, outline, outline-subtle, secondary, ghost, link; sm / icon / lg) · Badge (default, secondary, outline, normal, warning, critical, info) · TierChip · EvidenceChip · StatusBadge · Card · sliding PillTabs · static pill tabs · text / number / date / select / textarea / file / range / checkbox inputs · option chip buttons · chips + dots (home) · tables (m/[code], labs, history, admin, hkb) · TrendChart (recharts) · DailyCharts / DailySparks (recharts) · RangeBar · Heatmap year grid + 30-cell strip · HistoryLanes · Bubbles · GraphMap · MiniSparkline · native `<dialog>` sheet · Toast · Term tooltip · details disclosures · avatar menu · dashed empty states · filters (URL params, client search) · forms with busy + error · SuccessCheck · Digits · SwapText · FLIP · staggered chips · icon swap · card resize · `.hit-40` · simple / deep switch · no pagination anywhere.

Inconsistencies: two tab styles; eight button variants for three jobs; badges filled in health colours vs the v4 rule that spectrum colours are never a surface; dashed-border empty states everywhere; three chart stacks (recharts, hand SVG, ruler).
