# Phase 44: a check-in that asks what we need to know, and answers that fade with age

Date: 2026-09-30. Branch `simple`. Status: design sections 1-3 approved by
the owner in chat ("yes its right", "yes looks good", "looks good"); this
file waits for the owner's review. `apps/simple` unless a slice says
`apps/ios`.

## Why

Phase 43 gave a new person a setup flow. After it, the app only learns
what the person volunteers: a lab upload, a Home answer, a phone sync.
Two gaps follow.

1. **Nothing asks for the updates the engine needs.** A plan item started
   three weeks ago has no follow-up; a symptom answered last year still
   decides a hunch; an open hunch at 12 % never gets the one question that
   would settle it.
2. **An old answer counts as much as a new one.** `revisitDays` in
   `PROFILE_QUESTIONS` decides when to re-ask, but until the re-ask the
   scorer gives a 14-month-old "No palpitations" full weight. Thyroid and
   heart conditions develop; an absence then says little about now. The
   only shrink today is `EVER_SHRINK` (0.5) for "ever had" rules, and it
   ignores age.

The owner asked for a check-in that pops up every week or two, asks
dynamic questions based on time passed and missing data, and treats
answers as losing power over time depending on the kind of question and
answer.

## Principles

- Every question is chosen by the engine because its answer would move a
  belief on the picture or an open hunch. No topic is asked for its own
  sake: a food question appears only when a rule that reads it matters now.
- Every number on a check-in screen is engine output, as in phase 43.
- An answer saves the moment it is given, through `saveFact`/`writeFact`.
- One flow, decided on the server; web and iOS draw the same JSON.
- A round with nothing worth asking is never shown.
- The phase 41 and 42 rules stay: a differential, never a diagnosis.
- Fading is engine-wide. Home, hunches, the check-in and the evals read
  the same faded weights.

## Part A: answers fade with age (44A, engine)

### A1. Answer dates reach the scorer

`buildModelInput` (`lib/coverage.ts`) adds
`profileAt: Record<string, string>`: per fact key, the later of
`profile_facts.answered_at` and `confirmed_at`, as `YYYY-MM-DD`. A key
with neither has no entry and never fades. Personas in `evals/persona.ts`
may set `profileAt`; absent means "answered today".

### A2. The fading factor

For a fact evidence rule that fired, the scorer uses

```
weight = 0.5 ^ (ageDays / halfLife)
lrUsed = lr ^ weight            (the same for lrNeg)
```

`lr ^ weight` fades the log-odds pull linearly, so an LR 4 answer counts
4, then 2 at one half-life, then about 1.41 at two, and tends to 1 (no
information). It composes with the grade shrink and `EVER_SHRINK`, which
stay as they are. `halfLife = null` means no fading.

### A3. The half-life table

Each entry in `PROFILE_QUESTIONS` and `SYMPTOMS` may carry
`halfLife?: { no: number | null; yes: number | null }` in days. A missing
entry takes its class default:

| Class                | Examples                                        | "No" / absent | "Yes" / present |
| -------------------- | ----------------------------------------------- | ------------- | --------------- |
| `fixed`              | sex, birth year, family history, past diagnosis | never         | never           |
| `symptom` (evolving) | palpitations, cold intolerance, hair, fatigue   | 90            | 180             |
| `habit`              | alcohol, smoking, sleep, diet                   | 180           | 180             |
| `followup`           | plan and treatment follow-ups (Part B)          | 60            | 60              |

"No" means the rule's `lrNeg` fired; "Yes" means `lr` fired. A question
whose `revisitDays` is 0 is `fixed`. Every other key needs a class; a unit
test fails on a key without one.

ponytail: these numbers are judgment, not papers. Each class default
carries a `// ponytail:` comment saying so and naming the upgrade: a
per-condition half-life from natural-history studies once the KB carries
one.

### A4. What the cards say

A fact line on a condition card or hunch case whose weight is under 0.9
adds its age: "you said No, 11 months ago, counting half". The wording
rounds the weight to "almost fully" (≥ 0.75), "half" (0.35-0.75) or
"little" (< 0.35).

### A5. Acceptance

- `lib/hypotheses.test.ts`: a `fixed` fact never fades; a symptom "No"
  at 90 days pulls half its log-odds; at 0 days nothing changes; a
  missing `profileAt` never fades.
- `eval:journeys`, `eval:hunches` and `eval:setup` re-run. Each persona
  whose result changes is listed in the plan's report with the reason.
  Journeys may not drop below the pre-change pass count.

## Part B: the check-in (44B server, 44C web, 44D iOS)

### B1. State and timing

New column `users.checkin jsonb`:
`{ round, started, asked, skipped, snoozedUntil, lastDone, nextDue }`.
Migration `0032_users_checkin.sql`.

`lib/checkin.ts` (pure: no DB, no clock):

- `nextDueOf(lastDone, trying)`: `lastDone + 7 days` while something is
  being tried, else `+ 14`. "Being tried": a `protocol_items` row active
  with `started_at` in the last 60 days, an open hunch, or a goal.
- `laterOf(now)`: 09:00 local the same day before 09:00 local; else
  `now + 3 h` if that is before 18:00 local, else next day 09:00 local.
- Due when `now >= nextDue`, `now >= snoozedUntil` (if set), setup is
  not due, and setup finished at least 7 days ago. The first `nextDue`
  is setup's finish plus 7 days. An account that never ran setup gets
  `nextDue` = its first read (Home or `/api/checkin`) plus 7 days,
  written on that read (final review I3: no hard-coded ship day).
- "Skip this round": `lastDone = now`, `nextDue` recomputed, nothing asked.

### B2. Picking the round (`pickRound`)

At most 5 questions, from two pools, every candidate simulated by
`nextMoves` as setup does.

**Pool 1, updates we need (up to 3):**

1. Faded inputs: a fact whose weight (A2) is under 0.5 and that a rule
   on a shown belief (p ≥ `QUIET_BELIEF`) or an open hunch reads.
2. Missing inputs: a fact listed in `missing` for a shown belief or an
   open hunch's condition.
3. Plan outcomes: each `protocol_items` row active and started 7 or more
   days ago, and each `treatments` entry started 7 or more days ago, with
   no follow-up in the last 14 days. Two screens: adherence ("How often
   did you do it this week?": Every day / Most days / Some days / Not at
   all) and effect ("{target} since you started: Better / Same / Worse").
   Adherence writes `habit_logs` for unticked days in the window only
   when the answer is "Every day"; other answers save as the fact
   `followup_adherence:<itemId>`. Effect saves as
   `followup_effect:<itemId>`, class `followup`.

Ranked by the expected change in confidence on shown beliefs and open
hunches (the `moves` entries whose `from` is on the picture or is an open
hunch's condition). Plan outcomes rank first among ties.

**Pool 2, explore a hunch (up to 2):** open hunches whose lead condition
sits between 5 % and 40 %, lowest first. For each, the free question with
tap options whose outcomes pull that condition furthest apart. One
question per hunch, two hunches at most.

**Fill:** a pool short of its places gives them to the other; total ≤ 5.
**Repeat rule:** a key answered or skipped in the last 30 days is out
(the Home rule). **Other angle:** if a key was asked in either of the last
2 rounds, a sibling key that feeds the same condition ranks above it.
**Floor:** a candidate whose best move is under 2 points is dropped. No
candidates: no round; `nextDue` moves on.

### B3. API

`/api/checkin`:

- `GET` → `{ due, dueAt, screen, progress: { at, of }, picture }`.
- `POST` → an answer (`{ screen: "question", key, value? , skip? }`),
  `{ later: true }` or `{ skip: true }`. Returns the next body.

Screens: `question` (as setup, plus `why: string`), `followup` (adherence
then effect, as two `question` screens with `key` set), `since`.

`why` examples: "It's been 4 months since you said No." "We have a weak
hunch about thyroid; this answer tells us more."

`since`: bars that moved since the round started (from
`belief_snapshots` before and after) with the answer that moved each
("Iron deficiency 43 % → 61 %, from your fatigue answer"); hunches that
got stronger or weaker; the next test, if `nextMoves` has one worth its
price.

`/checkin?now=1` forces a round for testing, like `/setup?again=1`.

### B4. Web (44C)

- `app/checkin/page.tsx` draws the setup components (`SetupFlow` pieces:
  question, picture, reveal) with a header of "Ask later", "Skip this
  round" and "2 of 5". No progress bar.
- `/` redirects to `/checkin` while due, as setup does; `?home=1` still
  shows Home.

### B5. iOS (44D)

- `Shell` asks `GET /api/checkin` on launch and shows the flow full
  screen while due, after setup.
- Local notifications (`UNUserNotificationCenter`): each launch replaces
  the one pending check-in reminder with one at `dueAt` (or
  `snoozedUntil`). Permission is asked once, at the end of the first
  finished check-in. No APNs, no entitlement change.
- Codable types, fixtures and gallery entries for every screen.

### B6. Errors

- A failed save keeps the answer on screen: "Not saved. Try again."
- A failed engine refresh on `since` shows the saved scores (setup's rule).
- An empty round never shows; it only moves `nextDue`.

## Part C: evals

`eval:checkin` (new): replays the journey personas over 6 months with a
check-in each cycle. Reports per persona:

- days until the true condition first reaches the picture, with and
  without check-ins;
- questions asked in total;
- a planted symptom that starts in month 4 ("No" at setup, "Yes" from
  month 4): whether a check-in re-asks it (directly or by a sibling)
  within two cycles.

Printed, not asserted, in this phase; the plan records the baseline.

## Order

1. 44A fading and its evals (stands alone, highest risk).
2. 44B server and 44C web.
3. 44D iOS with notifications.

## Out of scope

- Server push (APNs). Local notifications only.
- Generic diet or lifestyle questions no rule reads.
- A settings screen for cadence. The cadence is adaptive only.
- Per-condition half-lives from papers (the `ponytail:` upgrade path).
