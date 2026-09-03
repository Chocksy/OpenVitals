# Phase 34: the app helps you reach your goals

Date: 2026-09-03. Owner: "we need to make the iOS app better in helping
people get to the goals they want, now it just says all the time they are
sick. It would also be good to list the blood markers and show a trend at
least, and new papers that might interest them, the research component."

Three things, on both surfaces where they differ, contract first.

## 1. Goals first, on Today (web `/api/today`, iOS Today)

Today opens on what the person is moving, not on what is wrong. The
sentence becomes: "Three things you are moving: TPO under 100, LDL 70–100,
vitamin D to 45. Two of seven done today." when goals exist; the old
"seven markers off" sentence moves to the Status card's second line. A new
`goals` block on `/api/today`:
```
goals: [{ code, name, value, unit, target: { low, high, due }, toGo,
          onPace: true|false|null, paceLine, moves: [{ title, done }] }]
```
where `toGo` is the distance to the nearer edge, `onPace` compares the
projection at the due date with the target (the same projection
`HistoryChart` draws), `paceLine` is the sentence the marker page already
prints ("at the rate of the last eight months it closes with about three
weeks to spare"), and `moves` are the adopted actions whose aim names this
marker with today's tick. No goals → the block is empty and the sentence
falls back to the loudest system, worded as "Thyroid is the one to move
first", never "sick". Web Home prints the same block as the first row of
the rail on the phone and beside Status on desktop (system section 07 has
the goal row); iOS Today shows a `GoalCard` per goal: name, value → target,
the ruler, to-go, on pace, the moves with ticks.

Add a goal from the app: a "Set a goal" action on a marker (Blood tab) with
the same fields as the web (`POST /api/goals` exists? verify; if the web
only has the form, add the JSON route).

## 2. Blood on the phone (`/api/markers`, iOS Blood tab)

New `GET /api/markers?days=365` → `{ markers: [{ code, name, system,
value, unit, date, word, band: {low, high}, optimal: {low, high},
series: [{ date, value }], goal: {...} | null }] }` grouped and sorted the
way the web Markers tab is (state filters Off · Borderline · Optimal ·
All). iOS gains a Blood tab (tab bar becomes Today · Blood · + · Body ·
Plan; Meals moves into Body as a section) with the marker rows from
`system.html` section 08: name, source and date, value with unit, state
word, the mini sparkline and the ruler; tap → the marker screen: the
ruler, the history chart (mini variant with the target), the readings
table, Set a goal. Search and the state filter as on the web.

## 3. Research on the phone (`/api/research`, iOS)

The feed already exists (`paper_watch`, `GET /api/research`). iOS gets a
"New for you" section on Today (compact: up to three rows that moved
something, else hidden) and a Research screen from Plan: the paper rows
per `system.html` section 15 (title, journal, date, grade glyph, the one
sentence, "moves … " or "nothing for you"), Open in Safari, mark seen on
open, Research now for one condition (`POST /api/research`). When no
paper has a grade because the intake has not run (the key limit), the row
says "found, not read yet" and the screen says why.

## Constraints

32a's contract file is law; extend it in the same style with fixtures and
shape tests (web) and decoders plus fixture tests (iOS). Web slice first
(`apps/simple`), iOS slice after (`apps/ios`), both on Opus. Same rules as
phases 30–33: no new dependencies, spectrum never a surface, every number
named, dated and sourced, nothing invented, locks green, no commit.
