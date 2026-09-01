# Phase 28b-4: v4 mockups — owner feedback round + a seeded creative direction

Owner, 2026-09-02, after reviewing home-v3, elements-v3, side-by-side and
pages-v3. This phase produces mockups only. The design will also serve the
iOS app (data gathering, photos, state of the data), so every page needs a
390 px mobile frame, and the mobile frames are first-class, not shrunken
desktop.

## Owner feedback, verbatim intent

1. Hero: likes A and B; B preferred, but the Resting HR status strip
   "needs a little work".
2. Mobile stacked: hero B gets crowded on 390 px — the floating pill sits
   on the axis labels and the legend wraps. Fix the stack.
3. Likes the new ruler but misses the history chart. Add history back
   somewhere (a component, not necessarily inside the ruler).
4. Mobile nav: would not pick the left-rail variant because of the
   systems piece. Wants a version where systems and details read "less
   like links you click and more like state details".
5. Mobile tab bar C is nice but its icons did not load. Use a real free
   icon library — Google Material Symbols.
6. Blood page: good, keep it.
7. Chat: separate research track (not this spec). The mockup still shows
   the chat surface, because "we now have to implement a chat system with
   those actions".
8. Plan next draw: good, keep it.
9. Genome: good, keep it.
10. App screens great, but icons broken and the Apple Health settings
    screen has weird spacing. Fix both.

"Explore even more" — this round may introduce new components beyond the
fix list, as long as every mark stays honest (named series, dated draws,
no decorative data).

## Creative direction (seeded, seed private — do not print any seed)

Name inside the files: **v4**. It keeps the warm paper canvas and the big
light mono numerals from v3, and changes these:

- **Colour = spectrum logic.** The healthy state is a calm chlorophyll
  green (the hue the eye resolves fastest) — optimal bands, "on track"
  tiles, good deltas. Borderline is amber. "Off" is a deep oxblood red
  that never floods a surface: it appears only at small sizes (a word, a
  marker dot, a 2 px tick). Hero gradients take their hue from the worst
  ledger band, at low saturation; freshness sets saturation (stale =
  desaturated). The lime action accent stays, but ONLY on the one control
  that adds data (Ask button, + button) — never on state.
- **Fibonacci space.** Paddings/gaps/radii from the scale 3, 5, 8, 13,
  21, 34, 55 px. Radii: 13 inner, 21 card, 34 hero/phone. Gaps: 8 within
  a group, 13 between rows, 21 between sections.
- **Type ladder XS–XL.** Five sizes only, as CSS vars (--type-xs …
  --type-xl). Numerals stay mono, light, tabular. Labels small and quiet.
- **1-1-3 rhythm.** Each screen-fold aims at: one sentence, one hero
  element, three tiles. Not a straitjacket — a rhythm.
- **Icons: Material Symbols Rounded, weight 300**, loaded from the Google
  Fonts CDN (`material-symbols` stylesheet link), optical size 20/24.
  Every icon in every frame must render — no private glyphs, no emoji.

## Deliverables — `docs/mockups/v4/`

One CSS file `v4.css` (tokens + components), one `index.html` linking all
pages, and these pages, each with desktop sections AND 390 px frames:

1. `home.html` — hero B refined.
   - The status tile keeps: number, state word, count line. The timeline
     strip MOVES OUT of the gradient into its own quiet panel directly
     under the tile ("Signals"): named sparkline (Resting HR, bpm, 90
     days), phone-day dots, dated draw diamonds (Aug 1 · 15 markers,
     Aug 31 · 1 marker), legend. The floating pill becomes a fixed
     caption row above the panel: trend icon + "Resting HR improving ·
     58 → 55 bpm · last 30 days". Nothing overlaps axis labels, ever.
   - 390 px: status tile (number + word + count), then the signal panel
     collapsed to sparkline + the one caption line; legend behind a
     quiet "detail" disclosure. Then Ask pill, then three tiles (Body
     today / Blood / Plan) per the 1-1-3 rhythm, then systems as state
     tiles (see 3).
2. `marker.html` — the ruler AND the history chart, together.
   - Top: the v3 ruler (thick track, bands, white-ringed marker, printed
     value, real axis gap, ghost "was" dot, hatched pace zone for a
     target).
   - Under it: a history chart — line over shaded normal/optimal bands,
     each draw a dated diamond, was → now emphasised, y axis in the
     marker's unit, x axis real dates (use TPO: 412 Dec 9 → 320 Aug 1;
     LDL: 168 Mar → 142 Aug; ALT 41 Mar → 34 Aug). Also show the same
     component small ("history mini") as it would sit in a drawer.
3. `systems.html` — systems as state, not links.
   - Tiles that read like instruments: system name, status word in its
     state colour, driving marker + value + unit, a 2 px trend tick
     (up/down/flat), "never measured" as a visibly empty tile. No
     chevrons, no underlines, no arrow icons — the whole tile is
     implicitly tappable but LOOKS like a readout. 12 systems from the
     real set (Thyroid off · TPO 320; Blood sugar borderline · HbA1c
     5.6; Vitamins low · D 19; Iron borderline · ferritin 22; Liver off
     · ALT 34; Sex hormones never measured; etc. — reuse elements-v3
     values). Desktop grid 4×3, mobile 2×6.
4. `shell.html` — navigation.
   - Desktop: top pills (Home · Body · Blood · Plan · Graph) — the rail
     variant is dropped per feedback.
   - Mobile: tab bar C — four destinations + centre lime "+", every icon
     a rendered Material Symbol (home, monitoring/vital_signs, water_drop
     or hematology, event_note; + as add). Show the + sheet (Photo of a
     lab / Ask or tell / Log how you feel).
5. `app.html` — the iOS screens redone in v4: Home, Body, Blood, a marker
   drawer, Plan, the + sheet, Settings/Apple Health.
   - Apple Health settings screen rebuilt: single-line rows — ON/OFF
     badge left (state colour), category label, "n types" right-aligned
     mono; no wrapping, 13 px row gaps; the summary line and the two
     buttons unchanged in content.
6. `blood.html`, `plan-draw.html`, `genome.html` — carried over from
   pages-v3 with the v4 skin (tokens, icons, spacing). Structure stays;
   the owner approved these.
7. `chat.html` — the Ask/Discuss thread in v4: question line, streaming
   answer, evidence glyphs, Sources line, Act-on-it chips, follow-up
   composer, the fold ("question — verdict") for older turns, and a
   thread-history list. This is the surface the chat research track will
   implement behind.

## Explorations (encouraged, same honesty rules)

Pick at least three: a "today" lock-screen-style summary card; a draw-day
timeline receipt (what was drawn, what changed); a yearly "seasons" view
of all draws; a printable doctor one-pager; a wrist/watch glance frame;
an empty "day one" home for a brand-new user.

## Constraints

- Self-contained HTML + one CSS file; system font stack + the CDN icon
  stylesheet; no build, no JS beyond tiny toggles (dark mode).
- Real test-user values everywhere (26 optimal · 19 normal · 7 off, 52
  markers, TPO 320, HbA1c 5.6, ferritin 22, vit D 19, ALT 34, LDL 142,
  bio age 36.6, next draw planned Jan 31 2026 window, streak 5 days).
  Values that must be invented (Apple Health day numbers) get the same
  illustrative footnote as elements-v3.
- Dark variant for home, marker, app (toggle class on <html>).
- Every icon renders. Every mark is named. No decorative data.
- Do not touch `apps/`. Do not commit.

## Verification (the agent runs; the main agent re-checks)

- Screenshot every page, light + dark where specified, desktop + 390 px,
  to `/tmp/p28b4/` (playwright pattern from `/tmp/p28b/shot.py`).
- In the screenshots: no floating element overlapping axis text; icons
  visibly rendered (not tofu boxes); Apple Health rows single-line.
- Report: files, screenshot list, the three explorations chosen, and any
  data the engine does not produce yet that the mockup assumes.
