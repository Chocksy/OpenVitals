# Phase 33: the native app as a replica of the design system

Date: 2026-09-03. `apps/ios` only. Owner: "how can we make a 100 % replica
of the design you made for the iOS app?" The answer is the way native teams
do it: one token source generated into Swift, one native component per
element on the system page, a native gallery screen that mirrors the system
page section by section, and snapshot tests that pixel-diff each screen
against the design's own renders with a tolerance that tightens as the
components converge. HTML stays the spec; nothing ships HTML.

## 1. One token source

`apps/ios/scripts/gen-design.swift` (or a Python script under
`apps/ios/scripts/`, no new dependency): reads the `:root` and
`[data-theme="dark"]` blocks of `docs/mockups/v4/system.css` and writes
`apps/ios/OpenVitals/DesignTokens.swift` with every colour (light and dark
pair as a dynamic `Color`), radius, spacing step, type size and the motion
durations. `Design.swift` keeps only the components and reads the tokens
from the generated file. A unit test parses the CSS again and asserts the
generated file is up to date (fails when someone edits one side only). Run
the generator; commit the output.

## 2. Type

Geist Sans and Geist Mono are the design's faces. Bundle them
(`apps/ios/OpenVitals/Fonts/`, OFL licence, add to `Info.plist`
`UIAppFonts`) and use them at the five sizes with the same weights and
letter-spacing the CSS uses. SF stays only as the fallback when the font
fails to load. Dynamic Type scales from the five sizes with `relativeTo`.

## 3. One native component per element

For every element in `system.html` sections 03–15 that the phone screens
use, a SwiftUI view with the same name as the CSS class and the same
variants: `Tile`, `Panel`, `NavyCard`, `RailCard`, `StateWord` (with the ▲),
`Chip`, `SystemChip`, `Ruler`, `HistoryChart` (mini and full), `Sparkline`,
`MarkerRow`, `DayRow`, `PlanRow`, `MealCard`, `VerdictRow`, `PaperRow`,
`ScheduleTable`, `MonthStrip`, `HoverCard` (as a tap card), `AskPill`,
`TabBar`, `AddButton`, the three button jobs, `Inp`, `Toast`, `Sheet`,
`Empty`. Geometry from the CSS: padding, gap, radius, hairline, the 1 px
inner border on translucent tiles, the blur behind the tab bar, the light
behind the hero.

## 4. The gallery

`GalleryView` (DEBUG, reachable from Settings and by `-OVGallery YES`):
every component in every state, in the same order and with the same sample
values as `system.html`, one section per system-page section, so the phone
can be held next to the browser.

## 5. Snapshot tests against the design

References: render the mockup phone frames and the system page sections at
390 px with Playwright (`uv run --with "playwright==1.56.0"`) at 3x into
`apps/ios/Tests/References/`, one PNG per screen and per gallery section,
light and dark. Tests: render the SwiftUI view with `ImageRenderer` at the
same size and scale, compare pixel by pixel in a pure Swift diff (no third
party package): report the fraction of pixels whose colour distance exceeds
a threshold, and the bounding box of the largest differing region, written
next to the reference as `<name>.diff.png` on failure. Start the tolerance
at 15 % differing pixels and record it per test; every slice after this
lowers the number. Text anti-aliasing differs between WebKit and CoreText,
so the diff masks a 1 px halo around text edges before counting.

## 6. The loop

For each screen: run the snapshot, look at the diff image, fix the
component whose region differs most, repeat until the screen is under
tolerance. Report the final fraction per screen and the components that
still differ, with why (a WebKit-only effect, a font metric, a real gap).

## Constraints

No third-party packages. `apps/ios` only, plus the two mockup renders read
from `docs/mockups/` (never edited). No commit. `xcodebuild test` green on
the iPhone 17 simulator. Screenshots of every tab and the gallery, light
and dark, into `/tmp/p33/`, looked at next to the references.
