# Design-beyond: round six

Three interactive iOS studies, September 6, 2026. Open `index.html` and choose the new round.

| Study       | Direction                           | Structural choice                                                           |
| ----------- | ----------------------------------- | --------------------------------------------------------------------------- |
| 18 Tidal    | Sea glass and tide charts           | Daily action count, a rhythm illustration, and the next two actions         |
| 19 Solstice | A sunlit table and a 24-hour dial   | Meals sit at their time on the dial; capture starts with photographs        |
| 20 Strata   | Mineral layers and clinical records | Measured biology leads, with a full-width LDL chart and compact marker rows |

## Design process

Used `~/.agents/skills/design-beyond/SKILL.md` and `REFERENCE.md`. The skill directory was moved from Claude and symlinked back at `~/.claude/skills/design-beyond`.

The seeds were generated before implementation:

- Tidal: `DaAVCRYboKJKvgOXnRYYdtBO`. Recurring pairs suggested repeating daily rhythms and paired next actions.
- Solstice: `nPCbfsy4KK4EQ8sLfIlwi34B`. Repeated fours and eights suggested a segmented clock and four daily activity types.
- Strata: `RH4KRG8HjesiPHnPvAmGfmnk`. Repeated H/R stems suggested horizontal layers with a firm vertical reading order.

The user's request for gradients takes precedence over the skill's gradient restrictions. Gradients are confined to chart strokes, progress, the day arcs, and selected surfaces. Existing generated food illustrations were extracted from study 17 without changing that file. Local Geist fonts come from the iOS app. No external asset requests or new dependencies are needed.

The Opus CLI builder returned HTTP 429, reporting the Claude session limit. The work continued in Codex. The requested Opus/Fable loop could not run, and there are no independent critic scores. Screenshots were reviewed locally. The final cut shortened capture copy, corrected chart geometry and dial positions, improved contrast on Strata's dark chart, and replaced compressed tablet columns with selectable previews.

## Interaction and data

Shared `beyond.js` and `beyond.css` keep the three studies comparable. Each has Today, Plan, capture, Blood, Trends, meal details, and a desktop adaptation. State is local to the page and resets on reload.

- Daily actions can be checked and unchecked. Suggestions must be adopted first.
- Text, sample voice, and multiple example photos lead through reading, review, save, and Undo.
- Meal names and portions are editable. Deletion requires confirmation. All totals update together.
- Scenario controls update the landing value and chart across previews. Keyboard arrows and pointer movement reveal chart readings.
- Dialogs contain keyboard focus and close with Escape. Light/dark themes and reduced motion are supported.

The initial meals total 1,497 kcal and 93 g protein. LDL has two measured readings: 168 on December 9, 2025 and 131 on August 1, 2026. The scenario is explicitly illustrative: `131 - (18 × fibre + 8 × walk) × consistency`. It is not the production projection model. Tidal's wave is a rhythm illustration, not a measured physiological trace.

Camera and voice are demonstrations; no hardware is accessed. Nutrition parsing uses editable sample estimates. Research and connected sources show illustrative context, not live integrations. These are design prototypes, not changes to the Swift app.

## Verification

Browser checks passed for all three studies:

- Adoption, reversible checks, synchronized daily counts and meal totals.
- Text, voice, multiple photos, reading state, portion scaling, save, edit, delete/cancel, and Undo.
- Scenario controls at 0% and 100%, with both interventions switched independently.
- Modal keyboard focus, Escape, reset during capture, and cancellation of stale timers.
- Reduced-motion capture completion.
- No page or phone horizontal overflow at 320, 390, 760, 768, 1024, and 1280 pixels.
- No duplicate initial DOM IDs, missing assets, JavaScript exceptions, or failed asset responses.

Desktop, phone, dark-theme, and mid-capture screenshots were captured in `/tmp/openvitals-beyond/`. Verification scripts and logs are in that directory as local review evidence.
