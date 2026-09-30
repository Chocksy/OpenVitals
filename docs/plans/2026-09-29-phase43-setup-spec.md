# Phase 43: a setup flow that builds your first picture, and a Home that does not contradict itself

Date: 2026-09-29. Branch `simple`. Status: design section 1 approved by
the owner ("yeah it does go ahead"); the rest of this file waits for the
owner's review. `apps/simple` unless a slice says `apps/ios`.

## Why

The owner asked for a review of the app over time, as a new user and as
case A replayed draw by draw (local dummy user `timeline-a`, dates shifted
so each step's last draw was 14 days old). Findings:

| #   | Finding                     | Evidence                                                                                                                                                                                    |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Day one is a dead end       | A new account sees "Nothing measured yet" and a "Generate" button. Nothing is asked, although ~25 questions exist and `nextMoves` ranks them.                                               |
| 2   | "Holding" reads as "fine"   | Steps 2019 and 2022: "No systems heading away, nine holding" while iron deficiency is likely and ferritin (16.8) is under the lab range. `headingSentence` reads direction only.            |
| 3   | Good news on a bad value    | "Ferritin is back in your usual range" at 16.8 (lab low 20) beside "Iron deficiency likely". The personal band learned years of deficiency.                                                 |
| 4   | Two answers to "what first" | `firstMoveSentence` ranks systems by worst marker; card 01 ranks beliefs. They disagreed in 3 of 5 views ("Vitamins" vs card 01 Iron).                                                      |
| 5   | Opposite hunches open       | `step:eosinophils_abs` and `good_news:eosinophils_abs` open on the same page.                                                                                                               |
| 6   | A ratio stored as a value   | Case A 2022-10-20 `total_cholesterol` 2.56, no unit: the TC/HDL ratio (177.4 / 69.38). It produced "apoB above what the LDL predicted 20.5" and "Cardiovascular risk: high 60 %" at age 36. |
| 7   | Speed from a short window   | "LDL rising 68.4 mg/dL a year" from 101 to 133 over five months. Since 2018 it is about 7 a year.                                                                                           |
| 8   | Blank line                  | "Nothing has been written for this one yet" prints under the failed-treatment note.                                                                                                         |

The owner asked for an iOS-style setup flow: ten or more quick screens
that keep a new person going until they see their answer. The engine
already runs that loop in the evals (`lib/journey.ts`: score, ask
`nextMoves`, take the answer, repeat; 25/25 journeys pass). This phase
puts a real person in the loop.

## Principles

- Every number on a setup screen is engine output. No fake loading, no
  invented percentages. The pull comes from the person's own picture
  getting sharper.
- Every answer saves the moment it is given, through the same code the
  rest of the app uses. Quitting loses nothing; the next visit resumes.
- One flow, decided on the server. Web and iOS draw the same screens from
  the same JSON.
- Existing people never get the flow by force.
- The phase 41 and 42 rules stay: a differential, never a diagnosis; every
  line carries its origin.

## Part A: the setup flow

### 43A. Server: `lib/setup.ts` and `/api/setup`

Files: `lib/setup.ts` (new), `lib/setup.test.ts` (new),
`app/api/setup/route.ts` (new), `db/auth-schema.ts` plus one drizzle
migration, `lib/vectors.ts` (one question), `evals/setup.ts` (new),
`package.json` (one script).

1. **State.** A new nullable `users.setup` jsonb column:
   `{ started: string; asked: string[]; skipped: string[]; passed: string[]; hasReport: boolean | null; done?: string }`.
   `asked` holds the adaptive question keys asked in setup, `skipped` the
   keys the person skipped (never asked again in setup), `passed` the
   screens finished with Continue or Skip (`upload`, `body`,
   `treatments`, `data`). `done` is the ISO
   time the reveal was closed. The legacy `onboarding_step` column is not
   used.
2. **Due.** `setupDue(userId)` is true when `setup.done` is unset AND the
   person has no readings AND no `sex` fact. A person with data never gets
   the flow by force; no backfill is needed.
3. **Screens, in order.** `nextScreen(state, input, catalog)` is pure and
   returns the first screen not yet complete:
   1. `intro`: goal (`setup_goal`: "Feel better", "Understand a result",
      "Prevention", "A diagnosis I have") and "Do you have a lab report
      with you?" (Yes / No, stored as `setup.hasReport`). Complete when
      `setup_goal` exists.
   2. `upload`: only when `hasReport` is true and no upload exists yet.
      Complete when an upload row exists or the person skips it.
   3. `basics`: `sex`, `birth_year`, `country`. Complete when all three
      exist.
   4. `body`: `height_cm`, weight (the `weight` reading HealthKit writes),
      `waist_cm`. Weight and waist can be skipped. Complete when
      `height_cm` exists or the screen is skipped.
   5. `question` (repeats): the first `nextMoves(input, catalog, { exclude })`
      move of kind `question`, where `exclude` is every answered fact plus
      `asked` and `skipped`. It stops at 8 asked, or when `nextMoves` has no
      question left.
   6. `treatments`: what the person takes now and tried before. Complete
      when saved or skipped.
   7. `data`: Apple Health (iOS only), genome file, and the lab upload when
      it was skipped or `hasReport` was false. Complete when the person
      presses Continue.
   8. `reveal`.
4. **Each response** carries `{ due, screen, progress: { at, of }, picture }`:
   - `picture`: the top 3 beliefs from `beliefsOf(scoreHypotheses(input))`
     with `p >= QUIET_BELIEF`, as `{ id, name, p }`. Empty means the page
     prints "Nothing stands out yet."
   - A `question` screen also carries, per option, the one condition that
     option moves most and its from/to: `{ label, moves: { id, name, from, to } | null }`,
     taken from the `nextMoves` outcome simulation (the same numbers the
     Home card prints as "Answering moves …").
   - `progress.of` is the count of screens this person will see, with 8
     for the questions; `at` counts the finished ones.
5. **POST `/api/setup`** `{ screen, answers?, skip?: true }`:
   - Facts save through `saveFact` after the same validation as
     `/api/facts` (key in `PROFILE_QUESTIONS`, value among its options).
     Move that validation into one exported function both routes call.
   - Weight saves as a `weight` reading dated today.
   - Treatments append to the `treatments` list fact the way
     `compose.ts` `writeChips` does, each entry
     `{ what, route, started, stopped? }`, `started` and `stopped` as
     `YYYY-MM`.
   - `question` answers add the key to `asked`; a skip adds it to
     `skipped`.
   - The response is the next GET body.
6. **Reveal** (`screen.kind === "reveal"`), built after `refreshHunches`
   and `recordBeliefs` run once:
   - When an open `cause` hunch exists: its differential (the
     `differentialOf` rows the case view shows, top 4 plus "other") and its
     splitting test with price.
   - Otherwise: `picture` plus the first `nextMoves` move of kind `test`,
     with price.
   - One action: the first action of the first card `actionsForAll`
     returns, or none.
   - `fromAnswersOnly: true` when the person has no readings. The page
     then says "From your answers alone." above the list.
   - POST `{ screen: "reveal" }` sets `setup.done`; the client goes Home.
7. **Question added.** `setup_goal` joins `ASKED` in `lib/vectors.ts`
   with the four options and `revisitDays: 0`. No evidence rule reads
   it; it is kept for the Home copy later.
8. **Eval `eval:setup`** (`evals/setup.ts`, pure, no LLM, no DB): for
   each journey in `JOURNEYS`, run the setup selection (basics from the
   persona, then `question` screens answered from `truth.answers`, cap 8)
   twice: with no readings, and with the persona's starting readings.
   Print per journey: questions asked, the true condition's rank in the
   reveal list, and any key asked twice. Fail on a key asked twice or on
   more than 8 questions. The hit rate is printed, not asserted, so the
   first run sets the baseline.

Verify: `pnpm test` (unit tests for `nextScreen` order, resume after a
partial run, skip never re-asks, the 8 cap, `setupDue` false for a person
with readings, POST validation), `pnpm typecheck`, `pnpm eval:setup`
printed in the report, `pnpm eval:journeys` still 25/25, the migration
applied to the local DB.

### 43B. Web: `/setup`

Files: `app/setup/page.tsx` (new, outside the `(app)` group so there is no
top nav), `components/setup-flow.tsx` (new), `app/(app)/page.tsx`
(redirect), `components/home.tsx` (the Day One card links to `/setup`),
`app/globals.css` only for tokens the flow needs.

1. `app/(app)/page.tsx` redirects to `/setup` when `setupDue`. `/setup`
   redirects to `/` when setup is done.
2. One screen at a time, full height, the paper look the rest of the
   site uses (same tokens and fonts as `home.tsx`). A progress bar on top.
   "Skip" on every screen except `intro` and `basics`. A small "Finish
   later" link returns Home (setup stays due, so Home shows the Day One
   card with "Continue setup").
3. Options are large tap targets; one tap on a single-choice question
   saves and moves on. Number inputs use `inputMode="numeric"`.
4. The picture sits under the question as up to 3 bars with percentages.
   After each answer the bars animate from the previous response's value
   to the new one (CSS transition on width), with "+19" or "−7" beside a
   bar that moved at least 2 points. Under each option of a question
   screen: "Yes moves Iron deficiency 12 → 31" when `moves` is set.
5. `upload`: the file input posts to `/api/upload` in the background and
   the flow goes on at once. The reveal waits for that request ("Reading
   your report…") and then reloads the picture. A password PDF or a failed
   read shows its message on the reveal with "Add it later from +".
6. `treatments`: rows of what (chips: Iron, Vitamin D, B12, Thyroid
   hormone, Statin, Metformin, Other with a text field), route (Oral, IV,
   Injection), started (month input), "Still taking" toggle or stopped
   (month input). "Add another".
7. `reveal`: the list with shares, "other", the test with price and a
   "Why this test" line (the one the case view prints), the one action
   with an Add button (the existing adopt call), and "Open my home".

Verify: component tests for the progress count, skip, and the animated
delta only on moves of 2 points or more. The main agent walks the flow
on the local dev server as a fresh user (`127.0.0.1:3001`, browser-control
tab), twice: with a report (a synthetic lab PDF the main agent makes in
`/tmp` from a journey persona's values, with a fake name; never real
data, never committed) and without.

### 43C. iOS: `SetupView`

Files: `apps/ios/OpenVitals/SetupView.swift` (new), `Api.swift` (two
calls and the Codable types), `OpenVitalsApp.swift` (present it),
`Fixtures.swift` (fixture JSON for each screen kind), tests.

1. After sign-in, `Shell` calls `GET /api/setup`; when `due`, it presents
   `SetupView` as a `fullScreenCover`. Closing it early ("Finish later")
   keeps it due; it shows again on the next launch.
2. The same screen kinds and order as the web, in native SwiftUI with the
   app's paper tokens (`DesignTokens.swift`). Taps give a light haptic.
   The picture bars animate with the app's `Motion` curves.
3. `data`: "Connect Apple Health" calls `HealthSyncModel` authorization
   (the same call Settings uses); the lab upload uses the existing
   document and photo pickers and the existing upload call. The genome
   row says "Add a genome file from the website" (iOS has no file flow
   for it today).
4. `upload` runs in the background as on the web; the reveal waits for it.

Verify: `xcodebuild test` passes (the 85 existing tests plus new decoding
tests for each screen kind from the fixtures); a Gallery entry per screen
kind so the owner can see every screen in the simulator.

## Part B: Home stops contradicting itself

Each slice is small and separate. The owner can drop any of them at this
review.

### 43D. "Holding" says when a value is out of range

Files: `lib/home-hybrid.ts`, its test. When a system's word is `holding`
or `toward` and its worst marker is outside the lab range, the sub-line
adds one sentence per such system, at most two: "Iron is holding, but
ferritin (16.8) is below the lab range." The count sentence stays as it
is.

### 43E. No good news on a value outside the lab range

Files: `lib/signals.ts` (the `good_news` rule), its test. A `good_news`
signal is not raised when the latest value is outside the lab reference
range, or when a condition that reads the marker is `likely` or
`confirmed`. An open one closes with outcome `superseded` on the next
refresh.

### 43F. One answer to "what first"

Files: `lib/home-data.ts` (`firstMoveSentence`), its test. When the ranked
belief cards exist, the sentence names the system of card 01's condition
("Iron is the one to move first"); the worst-marker rule stays as the
fallback when there is no card.

### 43G. One open hunch per marker direction

Files: `lib/hunches.ts` (refresh), its test. When a `good_news:<code>`
and a `step:<code>` or `drift:<code>` hunch would both be open, the one
whose signal is newer stays open and the other closes `superseded`.

### 43H. Ratios are not values

Files: `lib/uploads.ts` or `lib/units.ts` (where the plausibility check
fits), `scripts/repair-readings.ts`, tests.

1. A plausible range per core lipid marker in mg/dL (total cholesterol
   50 to 500, LDL 10 to 400, HDL 5 to 200, triglycerides 10 to 3000).
   A value with no unit outside it is not saved as that marker; it lands
   in the upload's skipped items with the reason "looks like a ratio or a
   different unit".
2. `repair-readings` gains a step that lists (dry run) and deletes
   (`--apply`) readings outside those ranges with no unit. Local first;
   prod only after the owner's OK, with a dump taken first as in phase 42.

### 43I. Speed from a short window

Files: `lib/signals.ts` (drift line), `lib/api-contract.ts` (the line
text), tests. When the draws behind a drift span less than 12 months, the
line gives the change over the span ("LDL Cholesterol rose 32 mg/dL since
Mar 2026") and no per-year number. The engine's slope stays as it is.

### 43J. No blank placeholder under a note

Files: `components/what-to-do.tsx`, its test. When a card has a `note`
line and no actions, "Nothing has been written for this one yet" is not
printed.

## Not in this phase, asked at review

- Watch and "Worth a look" list the same hunches on Home. Removing one
  needs the owner's OK (the redesign rule: translate, never remove).
- On the owner's Home, Liver reuses the insulin line and Iron and Vitamins
  share the cluster line.
- Hormone hunches, Body page identifiers, Plan duplicate rows (from phase
  42).

## Order and parallelism

- Round 1: 43A (one implementer). 43D to 43J in parallel (one implementer;
  the files do not overlap with 43A).
- Round 2, after 43A lands: 43B and 43C in parallel (two implementers).
- The main agent reviews each diff, re-runs the verify lines, walks the
  web flow as a fresh user, and asks the owner before commit, deploy and
  any prod repair.
