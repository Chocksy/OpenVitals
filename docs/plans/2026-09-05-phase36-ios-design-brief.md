# Phase 36: the phone, second pass (design brief)

Date: 2026-09-05. Owner, after a week on the app: "the plan page shows the
list but some I cannot check; adding a photo is subpar, it says sending
but there is no loading state and no animation while it processes images
and text; the home markers are too big and the checkboxes below I cannot
check, especially the exercise one; meals I cannot edit or delete; I want
something like the Cal AI screens but we also do blood markers and
scientific health. Make the iOS design screens first, keep the data we
already have, focus on animations, workflows and the arrangement of the
data in nice views."

Reference screenshots (Cal AI, for the feel, never copied): the owner's
attachments in `~/.t3/userdata/attachments/6ddb26e3-*` (home with the
week strip and the calorie ring; the camera with callouts on the plate;
the meal detail with a portion stepper, macros, ingredients, Fix results;
the progress screen with the streak flame and the tooltip chart). Our
own screens as they are today: the first three attachments (Body with
the meals list and Apple Health rows, the Add sheet, the Plan list).

## Rules that do not move

- The design system is `docs/mockups/v4/system.css`: cream canvas and
  ink ladder in light, the dark theme it already defines, navy the only
  dark surface, lime only on the add control, spectrum never a surface,
  Fibonacci space, radii 13/21/34/pill, five type sizes, Geist, lucide.
  `ios.html` sections 01–03 are the current phone; this pass replaces
  them with `ios-2.html`, same page anatomy (390 px frames, 06-style
  data contract and build-cost notes at the end).
- Nothing on file disappears: goals, the sentence, systems, markers with
  ruler and sparkline, the plan rows with basis labels and aims, meals
  with the estimate flag, Apple Health rows, research rows, the receipt
  chips. They get rearranged, sized and animated, not dropped.
- Motion is stated per element in a small table (what moves, duration,
  easing, trigger) so the Swift build can copy it. Reduced-motion
  variant named once.
- No mascot in this pass; celebration is one element (the tick).

## Screens to draw

1. **Today.** Header row: day, streak flame with the number, the week
   strip (seven day dots, ticked days filled, today outlined). The
   sentence stays. Goals become compact rows, not cards: name, value →
   target, a thin ruler, to-go; three fit above the fold. A "Today's
   moves" block: the adopted actions as tickable chips in a wrap,
   grouped morning / midday / evening, with a progress ring "2 of 5".
   A chip tick animates (scale 0.96 → 1, the check draws in, lime flash
   on the ring segment). A chip that Apple Health can tick by itself
   (steps, exercise minutes, workouts) shows a small sync glyph and
   ticks itself when the total lands, with "from Apple Health · 11:32".
   Then "Since you were here" (papers that moved you, notes read,
   projections due) and "New for you" as today.
2. **Add, the whole flow.** The sheet as today, then four states drawn
   as frames: (a) empty; (b) text typed, Send on; (c) sending: the field
   collapses to a one-line quote, a "Reading" row with a three-dot
   thinking loader and the words that are being kept fading in one by
   one as chips ("sardines", "olive oil", "190 kcal est."); (d) done:
   the receipt (chips, the sentence, "Kept:" line) with an Undo. Photo
   path: (e) the photo fills the top half with a scanning line sweeping
   top to bottom and a shimmer, "Looking at the plate"; (f) callouts
   appear on the photo one by one (Cal AI's labels, our style: ink pill
   with a hairline leader); (g) the meal card slides up from under the
   photo: name, time, portion stepper, calories, protein / carbs / fat
   tiles, "estimate" state word, Fix results, Done. Text and photo
   states share the loader.
3. **Meal detail.** Photo hero (or the stylized version when one exists,
   else a flat cream tile with a lucide utensils glyph), name editable,
   time, portion stepper, calories big, macros tiles, ingredients list
   with amounts (each row editable, swipe to remove), "Add more", Fix
   results (a text field: "it was two cans"), Delete meal with a
   confirm. "Logged in Health" line when it was written to HealthKit.
4. **Meals in Body.** Cards, not rows: thumbnail left, name, time, kcal,
   macros in one line, the estimate word. Swipe left: Edit / Delete.
   "All of it" total row with the day's protein / carbs / fat and a
   thin bar per macro against the person's target when a goal exists.
   Below, Apple Health rows tightened: name, value, one line of context.
5. **Plan.** The sentence ("Saturday Sep 5. Zero of four done."). Then two
   groups: "Doing" (adopted rows: tick box on the left, title, dose,
   aim, adherence % as a tiny bar) and "Suggested" (no tick box; an
   "Adopt" quiet button on the right, the basis label, the why). The
   rule that explains the owner's confusion: a suggested row cannot be
   ticked until it is adopted, and the design says so in a one-line
   caption above the group. Duplicate suggestions collapse. Tick
   animation as on Today. Month tab (parked) gets one frame: the grid
   with ticked days, streak, misses.
6. **Progress (Body → Trends).** One chart with the drag tooltip (value
   and date in an ink pill, the hairline follows the finger), range
   pills 90D / 6M / 1Y / All, the goal band hatched, the projection
   dotted. Below: streak calendar (this week and last), "Daily average"
   tiles for kcal, protein, steps, sleep with the delta arrow.
7. **Blood.** Unchanged in content; the marker row gets 8 px tighter and
   the sparkline gets the goal tick. One frame.
8. **Motion table** and **component index**: every new component named
   (WeekStrip, StreakFlame, MoveChip, ProgressRing, ReadingLoader,
   ScanOverlay, Callout, MealCard, MacroTile, PortionStepper, SwipeRow,
   AdoptButton, ChartTooltip, RangePills, StreakCalendar) with its
   props and its states.

## Known defects to reflect in the drawing

- Plan: rows marked "suggested" have no habit and so no tick; the
  drawing separates them.
- Home: an exercise chip tied to Apple Health should show its source;
  the fix for "it does not see my three sessions" is in the engine
  (workouts sync), the drawing shows what it looks like when it does.
- Add: "Sending" with no state; the loader and the receipt are the fix.

## Defects traced in code (2026-09-05, read-only pass; fix in the build)

1. Plan ticks miss: the tick button's hit area is the 21 pt box
   (`apps/ios/OpenVitals/Components.swift:726`), under Apple's 44 pt;
   a failed tick only writes a caption at the foot of the scroll
   (`PlanView.swift:37`). Fix: 44 pt content shape; error beside the row.
2. Suggested rows are not tickable by design (`itemId: null`,
   `lib/api-contract.ts:663`); the phone never passes `adopt:` to
   `DayRow`, so they cannot be adopted either. Fix: Adopt button →
   `/api/plan/adopt`.
3. "Vitamin D3 supplementation" twice: the suggested loop does not
   dedupe on title and `postProcess` needs three shared words longer
   than three letters (`lib/report.ts:983`). Fix: dedupe on normalised
   title in `planTodayBody`.
4. Today moves carry no `itemId` (`lib/api-contract.ts:187`); the phone
   matches by title against today's plan rows and silently does nothing
   on days the item is not due. Fix: `itemId` and `dueToday` on the
   move; post directly; disable when not due.
5. "Nothing synced yet" is a date-parsing bug: `lastSyncAt` has
   fractional seconds and `Design.clock` (`Design.swift:172`) parses
   without them. One-line fix.
6. Strength sessions: workouts do sync and are stored
   (`daily_logs.wearable.workouts`), and `workoutTicks` auto-ticks a
   habit matching /strength|gym|lift|weight|resistance/ from a workout
   matching /strength|lift|weight|functional|crossfit/
   (`lib/healthkit.ts:896`). Nothing shows because "Resistance training"
   is still a suggestion, not an adopted item, and Body has no workouts
   row (`HK_TYPES` excludes them). Fix: adopt (item 2) plus a
   "Workouts this week" row on Body listing sessions by type and minutes.
