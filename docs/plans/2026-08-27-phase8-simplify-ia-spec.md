# Phase 8: top-down information architecture, four destinations

User: "the website needs to be simpler; top-down: home has the data with
nice graphs, then what to fix and what to do next; manual data entry moves
to the phone app; keep the tracker but hidden."

## 1. Navigation

Primary nav, four items, in this order: **Home**, **Plan**, **Labs**,
**Graph**. Everything else lives in the avatar menu, grouped:

- Data: Review (with the open-count badge moved here), Uploads (also
  reachable from Labs), Admin (admin only)
- Tracker (hidden by default): Today, Protocol, Goals, Trends
- Ask the AI (Chat)
- Theme, Sign out

Routes stay; only the menu changes. `Insights` is removed from the nav:
the retest plan becomes the "Tests to order" card on Plan (it already is),
and the lifestyle and weekly insights render on Plan under a collapsed
"Earlier plans" section. Keep `/insights` reachable by URL for a while;
add a one-line banner on it pointing to `/plan`.

Mobile bottom bar: the same four items.

## 2. Home, top to bottom

One page that answers "where do I stand, what is wrong, what do I do" in
that order. Reuse `components/home.tsx`, `ui-kit`, `trend-chart`,
`graph-map` and the existing status tokens. Follow the dataviz rules
already in the theme (status colours only for data, never chrome).

1. **Header strip**: greeting, date of last blood draw, health score ring
   (exists), three counters: markers in optimal / normal / off, and a
   single "N questions" pill linking to Review when N > 0.
2. **Systems strip**: the 12 system tiles from `/graph` rendered small in
   one row (score ring, name, worst marker), no arcs on Home; click goes to
   `/graph`. Tiles sorted worst first.
3. **Fix next**: the top 3 actions from the latest plan as cards (title,
   basis chip, dose line, one "why" sentence, Add to protocol / Not for
   me), plus a "Tests to order (N)" row. "Open the full plan" link. If no
   plan, one Generate button.
4. **Key trends**: four small charts, the four markers with the highest
   importance from `computeGraphState` that have ≥ 3 points: line, optimal
   band shaded, goal tick, last value as a big number with the range bar
   beneath. This is where the range bar component finally appears:
   `components/range-bar.tsx`, props `{ value, prev?, refLow, refHigh,
optimalLow, optimalHigh, goal?, unit }`, used here and on `/m/[code]`.
5. **Needs attention**: the existing list, capped at 6, with range bars
   instead of sparklines.
6. **Questions**: open profile questions and due check-ins, max 3,
   rendered with `ReviewItem` (same as Plan).

Remove from Home: the Today/habits card, the goals card, the tracker
summary. Those live under Tracker.

## 3. Plan

Already close. Changes: the "Answer these first" card stays on top; add a
"Patterns" chip row under the profile strip linking to `/patterns/[id]`;
move Coverage into a collapsed `<details>` at the bottom ("What we have
and what we do not"); the Simple/Deep toggle stays.

## 4. Labs

`/labs` becomes the one place for lab data: tabs **Biomarkers** (the
current `/biomarkers` list, with range bars in each row instead of the
status badge alone), **Draws** (the current `/labs` timeline), **Uploads**
(the current `/uploads` list). The Upload Blood Work button sits in the
Labs header. `/biomarkers` and `/uploads` keep working as URLs and render
the same tab component with the tab preselected.

## 5. Graph

Unchanged, plus a "Patterns" section header with the matched pattern cards
first and the unmatched ones as grey chips.

## 6. Tracker

`/today`, `/protocol`, `/goals`, `/trends` unchanged, reachable only from
the avatar menu under "Tracker". A one-line note at the top of `/today`:
"Manual entry stays here until the phone app syncs Apple Health."

## 7. Constraints

No new dependencies. No schema changes. Keep every route working. Keep
the design tokens; no new colours. Dark and light both checked. The
`data-view` Simple/Deep switch stays scoped to Plan and Graph.

## 8. Verification

typecheck, tests, then screenshots logged in as the real user (read-only):
`/` (dark and light), `/plan`, `/labs` with each tab, `/graph`, the avatar
menu open, and a 390 px wide mobile shot of `/` and the bottom bar.
Confirm every old route still returns 200: `/today /protocol /goals
/trends /insights /biomarkers /uploads /review /chat /admin`.
