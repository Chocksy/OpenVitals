# Phase 16b: the bubbles page on /graph, as the mockup has it

Owner ask (2026-09-01): "bubbles page can be added as is for now" — port
the approved mockup `docs/mockups/brain-bubbles.html` onto `/graph`
without re-litigating the three open UX questions: take the mockup's own
defaults for the starting view, keep the same layout on mobile (scaled,
pan/zoom), and show whatever the mockup shows at low probabilities.
Everything in `apps/simple`. No new deps (the mockup's d3 CDN does NOT
come along: hand-roll the force layout, ~50 lines, or reuse the static
SVG approach of `components/graph-map.tsx` if the motion adds nothing).
Ponytail.

## What it is

`/graph` becomes the bubbles view: one circle per node of the personal
graph (`lib/pathograph.ts` / `lib/graph-state.ts` are the data source —
real data for the signed-in person, never the mockup's illustrative
personas), fill colour by state, outline by kind, size by weight, edges
as faint lines with active ones highlighted, the lens switcher and the
ask box as the mockup places them, fit-to-view on load. Everything the
mockup renders from fake personas renders here from `graphState(userId)`
and the beliefs. Tapping a bubble opens the same detail the mockup
shows (state, why, the moves that would change it), computed by the
engine, no LLM.

Keep the existing deep view reachable (a "table" toggle or a link to
the current systems map) — principle 1, windows are never removed.

## How

- Server component fetches `graphState` + beliefs + moves; a client
  component draws SVG. Layout: a small deterministic force relaxation
  run client-side (or precomputed server-side with a seeded RNG so
  hydration matches), clustered by system the way the mockup clusters.
- Colours, outlines, legends: lift the exact classes/hexes from the
  mockup so it looks like what the owner approved. Dark mode via the
  existing CSS variables.
- Mobile: same SVG, `touch-action` pan and pinch-zoom, fit-to-view
  button. No card stack for now (owner: as is).
- Tests: layout function pure and seeded (same input → same positions);
  a render smoke test if the suite has a pattern for one, otherwise the
  pure parts only.

## Verification

typecheck; vitest (no drop); dev server screenshots to `/tmp/p16b/`:
the page for the test user (desktop + 390 px), a bubble opened, the
lens switched. Do not touch `lib/research.ts`, `lib/trends.ts`,
`lib/compose.ts`, `components/plan.tsx`, `/hkb` pages or `package.json`
— another agent is working there. Report files changed, deviations,
open questions.
