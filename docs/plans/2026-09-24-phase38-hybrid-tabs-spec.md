# Phase 38: the rest of the app in the Hybrid look (iOS)

Phase 37 shipped the Hybrid Today. The owner ran the fixtures build on a
phone and said "looks good, build the rest": the bottom menu, the other
tabs and the Add flow. This phase does that.

The prototype (`docs/mockups/v4/ios-variations/48-hybrid.html`) draws only
Home and the Add sheet. Blood, Body and Plan have no mockup, so this spec
designs them in the same language: a plum header, cream shelves on grained
paper, the `Hy` palette, Space Grotesk, the phase 37 curves.

Read with: `2026-09-24-phase37-hybrid-ios-spec.md` (tech decisions,
fixtures pipeline, launch args) and
`2026-09-24-phase37-hybrid-motion-reference.md` (sizes and curves).

## Decisions (main agent, 2026-09-24)

- **Tabs:** Home · Body · Blood · Plan in one glass bar, and a separate
  lime +. The prototype shows three tabs; Plan stays as a fourth because
  Adopt lives there and the Do shelf fills from it. `@AppStorage("tab")`
  indexes: 0 Home, 1 Body, 2 Blood, 3 Plan. `-tab 2` on launch opens
  Blood (the launch argument lands in `UserDefaults`).
- **Add** is the prototype's own sheet over the screen (veil, card, three
  modes, a well, Send only with content), not a system `.sheet`.
- **Voice** is on-device dictation (`SFSpeechRecognizer` +
  `AVAudioEngine`), sent as words through the same `CaptureRun` route as
  typed text. No audio upload.
- **Adopt** gets wired: the server gives each suggested row an `adoptId`
  (`plan:<reportId>:<actionIndex>`, the id `adoptBodyOf` already reads).
- **Marker detail** stays a system sheet, restyled in the Hybrid palette.
  A custom sheet buys nothing there.
- **Web** is not touched (owner: handle the double design as we go).

## What does not ship

Dark mode. The web in the Hybrid look. Workouts on Body. Lab PDF upload
from Blood. "Not for me" (dismiss) on suggestions. Month view on Plan.

---

## D0. Chrome and the tab bar

New file `apps/ios/OpenVitals/HyChrome.swift`:

- `HyHeader`: the plum header of the other tabs. Reuse `HeaderBackground`
  from `ScoreHeader.swift` (make it internal, not private). Padding as
  `ScoreHeader` (21 sides, 8 top, 21 bottom) plus the island push
  (`\.islandPush`, same `ispring` 620 ms). Content:
  - eyebrow: the tab name, 11 caps, tracking .12em, `Hy.mist`;
  - one row: a big value 55/600 `Hy.cream` (tracking −0.04em,
    `.contentTransition(.numericText())`) with a word under or beside it
    (15/500 `Hy.lime`), and an optional trailing control slot;
  - one line under it, 13 `Hy.mist`.
    Nil value draws "—".
- `ShelfTitle(title, sub)`: the `shelfTitle` from `Shelves.swift`, moved
  here and used by `Shelves` too (delete the private copy).
- `HyScreen<Content>`: `VStack(spacing: 0) { header; ScrollView { shelves } }`
  on `Hy.paper` + `GrainTile`, bottom padding
  `max(110, ovTabBarInset + 21)`, `.refreshable`.
- `HyCard` modifier for vertical cards: `grained(Hy.card, radius: 21,
shadow: 0.3)` with 13 padding, full width minus 21 each side. Horizontal
  cards keep `todayCard(width:)`.
- `HyStateWord`/colour helper: marker word → `Hy.green`/`Hy.amber`/`Hy.rose`
  (+ the `…Soft` fills), ink3 for "no band".

Tab bar (replace the use of `TabBar` in `Shell`; leave `TabBar` in
`Components.swift` if other code uses it, else delete it):

- `.tabs`: 13 from the sides, 21 from the screen bottom (ignore the bottom
  safe area), `HStack(spacing: 8)`.
- `.tb`: height 62, capsule, `.ultraThinMaterial` under `Hy.card` at .78,
  1 pt stroke plum at .08, padding 5, shadow `0 13 34 −13` plum .35.
  Four equal buttons: SF symbol 19 over an 11 label, `Hy.ink3`; the chosen
  one sits on a `Hy.paper` capsule in `Hy.ink`. The capsule slides between
  tabs with `matchedGeometryEffect`, `Curve.spring` 420 ms, through
  `Motion`. `.sensoryFeedback(.selection)` on change. Icons: `house`,
  `figure.walk` (Body), `drop` (Blood), `checklist` (Plan).
- `.plus`: 62 circle `Hy.lime`, `plus` glyph 26 weight semibold `Hy.plum`,
  shadow `0 13 21 −8` rgba(120,140,20,.5); `Pressed(scale: .92)`.
- The measured height still feeds `ovTabBarInset`; `TabBarHiddenKey` still
  hides the bar.
- Every tab's screen draws on `Hy.paper`; `Shell`'s background becomes
  `Hy.paper`.

**D0 verify:** the build and test commands below, green. Screenshot Home
with the new bar to `/tmp/p38/d0-home.png`.

## D1. The Add sheet

Rewrite `CaptureView.swift`'s view as `AddSheet` drawn by `Shell` in an
overlay (above the bar, under the island), keeping every behaviour:
`CaptureRun`, the draft reopen, sign-in gate, question receipts,
`CaptureView.canSend` (tests call it; keep the name or move the tests).

- Veil: `Hy.plum` .32 with an 8 blur under it (`.background(.ultraThinMaterial)`
  is fine), 320 ms `ease` fade; a tap closes.
- Sheet: 8 from the sides and bottom, `Hy.card` + grain, radius 42,
  padding 13/21/21, enters from below over 520 ms `spring`.
  Drag down 89+ closes. It rides above the keyboard.
- Grab 34×5 `Hy.paper3`. "Add to today" 21/600. Line 13 `Hy.ink2`: "One
  thing or several. We read it in the island and sort it into meals and
  moves."
- Modes: three equal tiles, `Hy.paper`, radius 21, padding 13, a 2 pt
  border `Hy.ink` when chosen. Glyph, then **Photo** / plate or label,
  **Voice** / just say it, **Text** / a line is enough (15/600 over 11
  `Hy.ink2`).
- Well: 13 top, min height 89, radius 21, 2 pt dashed `Hy.paper3`,
  padding 13, 13 `Hy.ink2`. Empty: "Pick one. Send shows once there is
  something to send."
  - Photo: the camera/library choice as today; then a 62 thumb radius 13
    and "Ready. We read it in the island."
  - Voice: asks mic and speech permission on first use; 21 bars 3 wide
    animating 5↔34 (700 ms `ease`, alternating, staggered) while
    listening; the live transcript beside them in `Hy.ink` 15. A tap on
    Voice again stops. Denied permission says so in the well.
  - Text: a text field, 15 `Hy.ink`, placeholder "Glass of red wine…",
    focused at once.
- Send: 55 tall capsule `Hy.lime`, 17/600 `Hy.plum`, shown only when
  `canSend`, fades and rises in 200 ms.
- A question's answer shows in the sheet in the Hybrid type (chips on
  `Hy.paper`, the answer 15 `Hy.ink`), with Done (plum, 55) and Add another.
- Info.plist: `NSMicrophoneUsageDescription` and
  `NSSpeechRecognitionUsageDescription` (the target may set these through
  `INFOPLIST_KEY_…` build settings; follow what the camera key does).
- Reduce Motion: fades only.

**D1 verify:** build and tests green; `testCanSend` style tests still pass;
add a test that the voice transcript feeds `canSend`. Screenshot the sheet
open (`-OVSheet capture` or equivalent) to `/tmp/p38/d1-add.png`.

## D2. Blood

`BloodView.swift` on `HyScreen`. Data: `Api.markers()` and `Api.today()`
(the blood layer and the goals with projections).

- Header: "Blood", value = `today.score.result.blood` (the layer, 0–100),
  word = its `Score` word, line = "N in range · N borderline · N off"
  from the markers' words.
- Shelf "Needs a look" / "off and borderline": `HShelf` of marker cards
  (`todayCard(width: 258)`, `.leans(i)`): `CardLabel(system, glyph)`,
  name 21/600, value 34/600 + unit 13 `Hy.ink2`, the state word in its
  colour, the sparkline (`Hy.ink`, 1.5 pt, last point a 5 dot), a Hybrid
  ruler: track `Hy.paper3` 5 tall, normal band `Hy.greenSoft`, optimal
  `Hy.green` .5, goal band dashed `Hy.plum`, the value an 8 `Hy.ink` dot,
  the previous draw a 5 `Hy.ink3` dot. Hidden when nothing is off.
- Shelf "Where it's heading" / "if you keep the plan": the goals with a
  projection, using Today's projection card (`Heading.Cards` or
  `ProjectionCard`, made internal). Hidden without goals.
- Shelf "Every marker" / "N markers · M systems": a search field (capsule
  `Hy.card`, 44 tall) and the filter chips (`Api.Markers.filters`, capsule,
  chosen = `Hy.plum` on `Hy.cream` text) scrolling sideways; then one
  `HyCard` per system: `CardLabel(system)`, rows 44+ tall with name 15/500,
  source and date 11 `Hy.ink3`, value 15/600 + unit, a state dot 8; a
  hairline `Hy.line` between rows. `LazyVStack`. The empty and error
  states say what the old view said.
- Tap a marker (card or row) → `MarkerView` sheet. Restyle `MarkerView`:
  `presentationBackground` `Hy.card` + grain, corner 42, `hType` fonts,
  `Hy` colours, the Hybrid ruler. Keep what it shows and does.
- `-OVScreen marker` still opens the first marker with a goal.

**D2 verify:** build and tests green. A render test of Blood with
fixtures. Screenshots `/tmp/p38/d2-blood.png`, `/tmp/p38/d2-marker.png`.

## D3. Body

`BodyView.swift` on `HyScreen`. Data: `Api.body()`, and a `TodayModel` it
owns (meals and targets, so a meal opens the same edit sheet as on Home).

- Header: "Body", value = `today.score.result.life` (the lifestyle
  layer), word from `Score`, line = "N types · last sync 9:12" (or
  "nothing synced yet"). Trailing: a 44 circle `Hy.plum2` with
  `arrow.triangle.2.circlepath` in `Hy.cream`, spinning while
  `health.busy`; it runs the sync.
- Shelf "Meals" / "N meals · X kcal": `HShelf` of meal cards (photo or a
  `Hy.paper2` block with the kind glyph, 89 tall, radius 13; name 15/600;
  time 11 `Hy.ink3`; kcal 21/600; P/C/F 11). A tap opens
  `TodaySheetHost` exactly as Home does, with the plum .2 veil and the
  bar hidden. A last card "Every meal" opens `MealsView`. Hidden when no
  meals, and then one `HyCard` says "No meals yet today" with a lime
  "Add a meal" that opens Add (post the same action the + uses; a closure
  through the environment is fine).
- Shelf "Apple Health" / "today, per type": a two-column grid of small
  cards (`grained(Hy.card, radius: 21)`, padding 13, min height 89):
  name caps 11 `Hy.ink2`, value 21/600 + unit 11, the word in its colour,
  the provenance 11 `Hy.ink3` one line. A type with nothing reads "—" and
  "nothing today"; it is never dropped.
- `health.progress.line` under the grid while syncing.

**D3 verify:** build and tests green. A render test of Body with fixtures.
Screenshots `/tmp/p38/d3-body.png`, `/tmp/p38/d3-meal.png` (sheet open).

## D4. Plan, and Adopt

Server (`apps/simple`):

- `PlanTodayBody.rows[].adoptId: string | null`: for a suggested row
  `plan:${report.id}:${i}` where `i` is the action's index in
  `report.body.actions` (count before the `test` skip); null otherwise.
  Check `adoptBodyOf` in `lib/adopt.ts` reads exactly that form.
- `total` and `done` stay as they are (they count suggested rows). The
  phone computes its own adopted count for the header.
- Update `fixtures/api/plan-today.json` (the suggested row gets an id),
  the contract test, then copy to `apps/ios/Tests/Fixtures/` and run
  `scripts/gen-fixtures.py` as phase 37 did.

iOS:

- `Api.PlanDay.Row.adoptId: String?`; every `Row(…)` init passes it.
- `Api.adopt(id:) async throws -> Api.Adopted` posting `{ id }` to
  `/api/plan/adopt`; `Api.unadopt(removeIds:)` posting `{ removeIds }`.
  Read `lib/adopt.ts` for the result shape (the created item ids).
- `PlanView.swift` on `HyScreen`:
  - Header: "Plan", value "1/5" (done / adopted rows), word "done today",
    line = the long day + "· N suggested". A lime progress bar 5 tall
    under the line (fill = done/adopted, `spring` 700 ms).
  - Shelf "Today" / "in the order it runs": one `HyCard` with a row per
    adopted item: time or slot (11 caps `Hy.ink3`, 55 wide), title
    15/600, why 13 `Hy.ink2` (two lines), tag chip 11 on `Hy.paper2`,
    adherence "71% of the last 30 days" 11 `Hy.ink3`, and `Check` from
    `DoShelf.swift` with a 44 hit area on the right. Tick is the existing
    optimistic write with rollback; `.sensoryFeedback(.success)` only on
    a stored tick. Done rows fade title to `Hy.ink3` with a strike.
  - Shelf "Suggested" / "from your last report": `HShelf` of cards
    (`todayCard`): `CardLabel("Suggested", "sparkles")`, title 17/600,
    why 13 `Hy.ink2`, a lime 44 capsule "Adopt" (`Pressed`). Adopt:
    button shows a spinner, POST, then the card leaves (opacity + scale
    .9, 320 ms `ease`), the plan reloads, and a pill "Added · Undo" shows
    for 4 s (Undo posts `removeIds`, reloads). Failure: the card stays and
    the pill says "That did not save". Hidden with no suggestions.
  - Shelf "Research": one `HyCard` with the count line and "Open
    research" (the existing `ResearchView` sheet).
- After an adopt, tick or undo, post `Notification.Name.ovPlanChanged`;
  `HybridTodayView` reloads its model on it (as it does on `.ovCaptured`).

**D4 verify:** `apps/simple`: `pnpm test` and `pnpm typecheck` green.
iOS build and tests green; a model test for adopt success, failure and
undo through a seam like `TodayModel`'s. Screenshot `/tmp/p38/d4-plan.png`.

---

## Commands

```
cd apps/ios
xcodebuild -scheme OpenVitals -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/p38/dd-<part> build
xcodebuild test -scheme OpenVitals -derivedDataPath /tmp/p38/dd-<part> \
  -destination 'platform=iOS Simulator,id=<your simulator UDID>'
```

Parts running in parallel each clone their own simulator
(`xcrun simctl clone "iPhone 17 Pro" p38-<part>`) and their own derived
data, and edit only their own files. If the build breaks in a file another
part owns, wait and retry; do not edit it.

Screenshots: install and launch on your simulator with
`-OVFixtures YES -tab <n>` and `xcrun simctl io <id> screenshot`.

## Order

1. D0 alone (everything else builds on `HyChrome`).
2. D1, D2, D3, D4 in parallel. File ownership:
   - D1: `CaptureView.swift`, `OpenVitalsApp.swift`, `Info.plist`/pbxproj
     build settings for the two usage keys.
   - D2: `BloodView.swift`, `MarkerView.swift`, `MarkerScale.swift`.
   - D3: `BodyView.swift`, `MealsView.swift`.
   - D4: `PlanView.swift`, `Api.swift`, `Fixtures.swift`, the server and
     fixtures, one line in `HybridToday.swift`.
   - New test files per part: `Tests/<Part>Tests.swift`.
3. The main agent reviews each diff and re-runs the commands.

## Review focus

1. **No data.** A new user: no markers, no body rows, no meals, no plan.
   Every tab draws its header with "—" and says what is missing; nothing
   crashes on an empty array.
2. **The island push.** Every header moves down under an open island as
   Home's does.
3. **Tab switch while a sheet is up.** The Add sheet and the meal sheet
   hide the bar; closing brings it back on the tab you were on.
4. **Adopt twice fast.** The second tap is ignored while the first runs.
5. **Voice with no permission.** The well says how to allow it; Send stays
   hidden.

## As built (2026-09-24)

- iOS 274 tests green (31 new: Add 8, Blood 7, Body 5, Plan 11); server
  1 932 green, typecheck clean. Screenshots in `/tmp/p38/`.
- The old `TabBar` stays in `Components.swift` for the gallery only.
- `CaptureView` is now `AddSheet` (`typealias CaptureView = AddSheet`).
  "Log how you feel" is gone (not in the prototype). Voice sends as text,
  so the island says "Reading your note…". Debug stage: `-OVAdd text|voice`.
- Blood's "Every marker" filter starts on All (Needs a look already shows
  the off ones). `-OVBottom YES` opens a screen scrolled to the end.
- Body honours `-OVMeal YES -tab 1`; `\.openAdd` opens Add from "Add a
  meal". Type cards show the raw type id in the provenance line; tidy later.
- Plan: an `already: true` adopt offers no Undo (it would delete an item
  that was there before). In fixture mode Adopt posts for real and fails.
- Open: in the staged `-OVMeal` run the header did not follow the portion
  step, though `TodayModel` does in tests. Check on a device.

## D5. Camera first (owner feedback, 2026-09-25)

The owner wants Add faster for photos: the + opens the camera at once,
with a gallery pick on the left and a switch to voice or text. The system
camera (`UIImagePickerController`) cannot carry those controls, so Add gets
its own camera on `AVCaptureSession` (native, no dependency).

- The + opens `AddCamera` full screen (black, preview fills it). Top: a 44
  close on the left, a flash toggle on the right.
- Bottom row: gallery on the left (a 44 rounded square, `PhotosPicker`,
  no library permission asked), the 72 shutter in the middle (white ring,
  lime disc, `Pressed(scale: .9)`), camera flip on the right.
- Above the shutter, a mode strip like the iOS camera: **Voice · Photo ·
  Text**, Photo centred and chosen, 13/600 caps, the chosen one `Hy.lime`.
  A tap or a sideways swipe on Voice or Text closes the camera and opens
  the Add sheet in that mode (spring 520 ms; fades under Reduce Motion).
- Shutter or a gallery pick: the frame freezes, with **Retake** (glass
  capsule) and a lime **Send** (55). Send goes through `CaptureRun` at once,
  the camera closes and the island reads the plate. One tap to shoot, one
  to send.
- `.sensoryFeedback(.impact)` on the shutter.
- Camera denied or no camera (simulator): the preview area says so with
  Open Settings; gallery and the mode strip still work.
- The island's failed-read reopen still goes to the Add sheet with the
  kept draft (not the camera). The sheet's own Photo tile opens the camera.
- The session starts on appear and stops on disappear, off the main
  thread.

## D6. Small fixes (owner feedback, 2026-09-25)

- `ResearchView` as a sheet has no close. Add the Hybrid close (a 34/44
  circle, `xmark`) in its header, and restyle it on `HyScreen` if cheap.
- Body's sync button gives no sign in a fixtures build (the sync is
  skipped there). The button spins for the whole `sync()` task (local
  state, not only `health.busy`), plays `.sensoryFeedback(.impact)` on tap,
  and the header line says "synced 9:12" or the error when it ends.
- Research's "not signed in" in the fixtures build is expected (no
  session); no change.

## D7. Apple Health sync: whole days (audit, 2026-09-25)

The audit confirmed the server stores what one POST adds up to for a day
(`readings … set value = excluded.value`, `mergeDaily` replaces fields,
`mergeNutrition(…, { replaceSource: true })` drops the earlier Health
entry). The phone sends only what is new since the anchor, so every sync
after the first overwrites a day with part of it, and each dietary type
wipes the one before.

Fix on the phone: **the anchor finds the days, a date query sends them
whole.**

- Per type: the anchored query (as now) only collects the set of local
  days its new samples touch (by `startDate`, and `endDate` for sleep).
  Then one `HKSampleQuery` per run with a predicate over those days
  (start of the first to end of the last, or per contiguous range) reads
  every sample of those days, and the batches are built from that. A
  batch never splits a day (as now). The anchor commits only once every
  touched day is sent.
- Full resync: the same path; touched days = every day there is data.
- Workouts: the same, so a day's workouts go together.
- Server: `mergeNutrition` for Health merges keys into the existing
  Health entry (a key in this POST replaces that key; keys not in it are
  kept) instead of replacing the whole entry. `mergeNutrition` has a unit
  test for two POSTs (kcal then protein) keeping both.
- Serialize: every sync (observer, Body, Settings, background) runs
  through one queue on `HealthSyncModel`; a second request while one runs
  waits for it or folds into it. No two runs read the same anchor.
- Background: register observers and background delivery at launch in a
  `UIApplicationDelegate` (`@UIApplicationDelegateAdaptor`) when signed
  in and authorized, not in `Shell.task`. Each observer calls its
  `completion` handler on every path, and the work runs inside
  `beginBackgroundTask`.
- Retry only network errors and 5xx; 4xx fails at once. 401 stops the
  run and says "Sign in again".
- Sign-out and a server change stop the observers and clear `hk.anchor.*`
  and `hk.state.*`, so the next account starts from the beginning.
- Body: a sync before Health access asks for it first (the same request
  Settings makes). The header after the sync reports the Health result
  (`health.status` / failures), not only the reload.
- One cached `ISO8601DateFormatter`/`DateFormatter` for samples.
- Remove the unused `processing` background mode from `Info.plist`.
- Deleted samples are still ignored (ponytail: a deletion reaches the
  server when that day is next resent whole).

Tests: pure functions for "days touched by these samples", "ranges for
these days" and the batches; the queue folding two requests into one run;
the retry rule; the server merge. Real-device check: the owner's phone
against a running server (not tonight).

## D8. The last old screens (audit, 2026-09-25)

Still in the old design: `SettingsView`, `SignInView` (root and the sheet
from Add), and the body of `ResearchView` (filters, panels, `PaperRow`).
Restyle them in the Hybrid look with `HyScreen`/`HyHeader`/`hyCard`,
`hType`, `Hy` colours, lime primary buttons (55 capsule, plum text),
plum secondary, rose for destructive. Keep every behaviour and string
that carries meaning.

- Settings: header "Settings" with the person's name or email, close
  button; cards for Apple Health (access, sync now, resync, per-type
  status), targets, server/account, sign out, debug gallery (DEBUG).
- SignIn: plum header card with the wordmark, the form on a cream card,
  one lime Sign in. As a sheet it dismisses itself on success.
- Research: filters as the Blood filter chips, the papers as `hyCard`
  rows (title 15/600, journal and date 11 ink3, state word).
- Dead code (`TodayView.swift`, `GoalCard`, `NavyCard`, `ResearchRow`,
  `NewForYou`, `Macro`/`MealShot` in `MealsView.swift`) stays for now:
  deleting files waits for the owner's yes.

## As built (D5–D8, 2026-09-25)

- iOS 309 tests green; server 1 934 green, typecheck clean. Fixtures build
  on the owner's iPhone.
- D5: `AddCamera.swift` on `AVCaptureSession`; + opens it unless a failed
  read kept a draft (then the sheet). `CameraPicker` removed. Not run on a
  camera yet: preview, flash, flip, rotation, front mirroring.
- D6: Research close; Body's sync spins at least one turn and reports.
- D7: anchor → touched days → whole-day date query; one `SyncQueue`;
  launch registration via `AppDelegate`; 4xx not retried, 401 stops;
  `reset()` on sign-out and on a server change; server `mergeNutrition`
  gains `mergeSource` (Health keys merge). `UIBackgroundModes` removed.
  Unverified: real HealthKit reads, observer wake-ups, background time
  (needs the phone against a server with this build's server code).
- D8: Settings, Sign in, Research body in the Hybrid look. Sign in as a
  sheet dismisses itself. Settings has no targets card (targets stay in
  the Home food card).
- Dead code kept pending the owner's yes: `TodayView.swift`, `GoalCard`,
  `NavyCard`, `ResearchRow`, `NewForYou`, `PaperRow`, `Filters`, `Macro`,
  `MealShot`.
