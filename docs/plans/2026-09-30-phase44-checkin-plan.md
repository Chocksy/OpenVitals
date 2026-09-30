# Phase 44 Check-in and Fading Answers: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Old answers count less as they age, and a weekly or fortnightly check-in asks up to 5 engine-chosen questions (web, iOS, local reminder).

**Architecture:** Part A adds `ModelInput.profileAt` (answer dates) and a pure `lib/fade.ts` half-life table; the scorer raises each fired fact LR to `0.5 ^ (ageDays / halfLife)`. Part B mirrors phase 43: a pure `lib/checkin.ts` (timing, round picking) over a `users.checkin` jsonb state, `lib/checkin-server.ts` wraps it with the engine, `/api/checkin` serves one JSON that web (`/checkin`) and iOS (`CheckinView`) draw. Part C is a printed replay eval.

**Tech Stack:** Next.js 16 (app router), drizzle + Postgres, vitest, tsx, SwiftUI (iOS 18), `UNUserNotificationCenter`, xcodebuild.

**Spec:** `docs/plans/2026-09-30-phase44-checkin-spec.md`. Read it before any task.

## Global Constraints

- All work in `apps/simple` unless a task says `apps/ios`. Branch `simple`.
- **No commits, no pushes, no deploys, no prod access.** Where a step says "Stop and report", stop; the main agent asks the owner.
- The repo is public. No real names, emails, user ids or health values in code, fixtures, tests or docs. Synthetic values only.
- Every number a check-in screen shows is engine output. No invented percentages.
- Every answer saves through `saveFact` (`lib/coverage.ts:673`) or, for "Every day", `habit_logs` rows. No parallel storage of answers.
- At most 5 questions a round (`ROUND_MAX = 5`). Pool 1 up to 3, pool 2 up to 2.
- Fading composes with `effectiveLr` (`lib/hypotheses.ts:1691`); `GRADE_SHRINK` and `EVER_SHRINK` stay as they are.
- `halfLife` values carry a `// ponytail:` comment: judgment, not papers; upgrade to per-condition half-lives from natural-history studies once the KB carries them.
- Copy style: short sentences, active voice, no em dashes, no "we" in screen copy (the `why` line may say "we" only where the spec quotes it; use "The app" otherwise).
- Comments follow the house style: say why, cite the phase ("Phase 44A: …"), `ponytail:` for deliberate shortcuts with their ceiling.
- Do not remove any existing component or page section (owner rule).
- The phase 41/42 rule stays: a differential, never a diagnosis.
- Run commands from `apps/simple`: `pnpm test`, `pnpm typecheck`, `pnpm exec tsx --env-file=.env <file>`. Scripts use an async IIFE, never top-level await.

## Review Focus

1. **A person re-answers a faded question with the same value.** `writeFact` may only confirm (no new history row). The fade must restart from the confirmation date. Pinned in Task 3 (`answerDates` uses the later of `valid_from` and the last confirmation).
2. **`nextMoves` simulating a fresh answer to a key with an old date** must score the simulated answer as new, or every re-ask looks worthless. Pinned in Task 2 (`applyOverlay` drops `profileAt` for overlaid keys).
3. **"Ask later" at 23:30 in the person's time zone** expects the next day 09:00 local, not 09:00 UTC. Pinned in Task 5 (`laterOf` with an offset) and Task 7 (POST carries `offsetMin`).
4. **Double tap or two devices answering the same check-in question** expects one saved answer and the queue to move once. Pinned in Task 6 (answering a key not at the queue head is a no-op that returns the current body).
5. **A person with setup still due, or setup finished 3 days ago,** must not get a check-in. Pinned in Task 5 (`checkinDue` tests).

---

## Part A: answers fade with age (44A)

### Task 1: Pure fade table

**Files:**

- Create: `lib/fade.ts`
- Test: `lib/fade.test.ts`

**Interfaces:**

- Consumes: `PROFILE_QUESTIONS` (`lib/vectors.ts:825`, keys and `revisitDays`), `SYMPTOMS` (`lib/symptoms.ts:44`).
- Produces:

  ```ts
  export type FadeClass = "fixed" | "symptom" | "habit" | "followup";
  export const HALF_LIFE: Record<
    FadeClass,
    { no: number | null; yes: number | null }
  >;
  export function fadeClassOf(key: string): FadeClass | null; // null = unknown key
  export function halfLifeOf(key: string, hit: boolean): number | null;
  export function fadeWeight(
    key: string,
    hit: boolean,
    ageDays: number,
  ): number; // 1 = full
  export function fadeWords(weight: number): "almost fully" | "half" | "little";
  export const daysBetween: (from: string, to: string) => number; // YYYY-MM-DD, floor, >= 0
  ```

- [ ] **Step 1: Write the failing test** `lib/fade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROFILE_QUESTIONS } from "./vectors";
import { fadeClassOf, fadeWeight, fadeWords, halfLifeOf } from "./fade";

describe("fade (44A)", () => {
  it("gives every question key a class", () => {
    const missing = Object.keys(PROFILE_QUESTIONS).filter(
      (k) => fadeClassOf(k) == null,
    );
    expect(missing).toEqual([]);
  });
  it("never fades a fixed fact", () => {
    expect(halfLifeOf("sex", false)).toBeNull();
    expect(fadeWeight("family_history", true, 4000)).toBe(1);
  });
  it("treats revisitDays 0 as fixed", () => {
    expect(fadeClassOf("birth_year")).toBe("fixed");
  });
  it("halves a symptom No at 90 days and a Yes at 180", () => {
    expect(fadeWeight("sym_cold", false, 90)).toBeCloseTo(0.5);
    expect(fadeWeight("sym_cold", true, 180)).toBeCloseTo(0.5);
    expect(fadeWeight("sym_cold", false, 0)).toBe(1);
  });
  it("fades a follow-up key by its prefix", () => {
    expect(
      fadeClassOf("followup_effect:00000000-0000-0000-0000-000000000001"),
    ).toBe("followup");
    expect(fadeWeight("followup_adherence:x", true, 60)).toBeCloseTo(0.5);
  });
  it("words the weight", () => {
    expect(fadeWords(0.8)).toBe("almost fully");
    expect(fadeWords(0.5)).toBe("half");
    expect(fadeWords(0.2)).toBe("little");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test lib/fade.test.ts` (module not found).
- [ ] **Step 3: Implement** `lib/fade.ts`:
  - `HALF_LIFE`: `fixed {null,null}`, `symptom {no:90, yes:180}`, `habit {180,180}`, `followup {60,60}`, each line with a `// ponytail:` comment per Global Constraints.
  - `CLASS` map (explicit, reviewed by the owner in chat on 2026-09-30):
    - **fixed:** every key whose `PROFILE_QUESTIONS[k].revisitDays` is 0 or undefined-and-listed-here (sex, birth_year, country, ancestry, height_cm, cycle_phase_at_last_draw, glucose_when, finding_since, setup_goal), plus family_history, conditions, screening_dates, cac_score, dexa.
    - **symptom:** every `SYMPTOMS` key, plus sleep_snoring, sleep_apnoea_witnessed, energy_when, sym_energy_duration, sym_weight_amount, cycle_length_days.
    - **habit:** smoking, exercise_days_week, diet, coffee_last_hour, last_meal_hour, bedtime_hour, dairy_daily, medications, supplements, waist_cm, bp_home, resting_hr, grip_kg, neck_cm, menopause_status.
    - `fadeClassOf(k)`: `k.startsWith("followup_")` → followup; else explicit map; else `revisitDays === 0` → fixed; else null.
  - Run the Step 1 "every key" test first; any key it lists that is not in the lists above goes into the class its `revisitDays` suggests (≤ 120 symptom, else habit) and is reported in Step 5 for the main agent to check.
  - `fadeWeight`: `const h = halfLifeOf(key, hit); return h == null || ageDays <= 0 ? 1 : 0.5 ** (ageDays / h);`. Unknown key → 1.
  - `fadeWords`: `≥ 0.75` almost fully, `≥ 0.35` half, else little.
- [ ] **Step 4: Verify.** `pnpm test lib/fade.test.ts` PASS; `pnpm typecheck` clean.
- [ ] **Step 5: Stop and report** (list any key added beyond the lists above).

### Task 2: The scorer fades fact evidence

**Files:**

- Modify: `lib/coverage.ts:93` (`ModelInput`), `lib/hypotheses.ts` (pass one near line 2655, `Factor` near 2670, entry near 2818, `HypothesisResult["for"]` type at 1589), `lib/sample.ts:144` (`applyOverlay`), `evals/persona.ts` (`Persona`, `personaToInput`).
- Test: `lib/hypotheses.test.ts`, `lib/sample.test.ts` (create if absent).

**Interfaces:**

- Consumes: `fadeWeight`, `daysBetween` from Task 1.
- Produces:
  - `ModelInput.profileAt?: Record<string, string>` (key → `YYYY-MM-DD`).
  - `HypothesisResult["for"][number].faded?: { key: string; days: number; weight: number }` (same on `against`). Weight rounded to 2 places. Present only when weight < 0.9.
  - `Persona.profileAt?: Record<string, string>`, copied by `personaToInput`.

- [ ] **Step 0: Baseline.** Run `pnpm eval:journeys`, `pnpm eval:hunches`, `pnpm eval:setup`; save each summary line (pass counts, hit rates) in the report. Journeys was 24/25 before this phase (hashimoto fails, predates 43).
- [ ] **Step 1: Failing tests** in `lib/hypotheses.test.ts` (use `{ catalog: CATALOG }` as the file already does, and the file's existing input builder; pick a condition the catalog scores from `sym_cold` or another symptom key with an `lrNeg`, found by reading `CATALOG` evidence):

```ts
describe("fading (44A)", () => {
  const TODAY = "2026-09-30";
  const base = () => inputWith({ sym_cold: "No" }, TODAY); // the file's own builder
  const score = (m: ModelInput, id: string) =>
    scoreHypotheses(m, { catalog: CATALOG }).find((r) => r.id === id)!;
  const ID = "hypothyroidism"; // any condition with a sym_cold rule

  it("changes nothing at 0 days or without a date", () => {
    const fresh = score({ ...base(), profileAt: { sym_cold: TODAY } }, ID);
    const none = score(base(), ID);
    expect(fresh.score).toBe(none.score);
    expect(none.against.find((e) => e.faded)).toBeUndefined();
  });
  it("pulls half the log-odds for a symptom No at 90 days", () => {
    const empty = score(inputWith({}, TODAY), ID).score;
    const fresh = score(base(), ID).score;
    const old = score({ ...base(), profileAt: { sym_cold: "2026-07-02" } }, ID);
    const lo = (p: number) => Math.log(p / (1 - p));
    expect(lo(old.score) - lo(empty)).toBeCloseTo(
      (lo(fresh) - lo(empty)) / 2,
      1,
    );
    expect(old.against.find((e) => e.faded)?.faded).toMatchObject({
      key: "sym_cold",
      days: 90,
      weight: 0.5,
    });
  });
  it("never fades a fixed fact", () => {
    const m = { ...base(), profileAt: { sex: "2010-01-01" } };
    expect(score(m, ID).score).toBe(score(base(), ID).score);
  });
});
```

In `lib/sample.test.ts`:

```ts
it("treats a simulated answer as new (44A)", () => {
  const m = { ...someInput, profileAt: { sym_cold: "2025-01-01" } };
  const out = applyOverlay(m, { ...EMPTY_OVERLAY, facts: { sym_cold: "Yes" } });
  expect(out.profileAt?.sym_cold).toBeUndefined();
});
```

(The symptom cap and correlation damp can blur exact halving when several symptoms fire; the test input carries one symptom only, so the halving is exact before the cap.)

- [ ] **Step 2: Run, expect FAIL.** `pnpm test lib/hypotheses.test.ts lib/sample.test.ts`
- [ ] **Step 3: Implement.**
  - `ModelInput`: add `profileAt?` with a doc comment ("Phase 44A: the day each fact was last answered or confirmed; a key with no entry never fades").
  - Pass one (`fired.push`): when `rule.input.fact` is set and `m.profileAt?.[rule.input.fact]` exists, `w = fadeWeight(fact, hit, daysBetween(at, m.today))`; `raw: effectiveLr(stated, rule) ** w`; carry `faded: w < 0.9 ? { key: fact, days, weight: round2(w) } : undefined` on the fired entry, through `Factor`, onto the pushed `for`/`against` entry. The `discounted` field then shows the faded number as it does for other shrinks.
  - `applyOverlay`: `profileAt` without the overlay's fact keys (`Object.fromEntries(Object.entries(input.profileAt ?? {}).filter(([k]) => !(k in overlay.facts)))`).
  - `personaToInput`: pass `p.profileAt`.
- [ ] **Step 4: Verify.** The new tests PASS; `pnpm test` all green; `pnpm typecheck` clean. Re-run the three evals from Step 0: the results must be identical (no persona sets `profileAt` yet, and the live path does not fill it until Task 3).
- [ ] **Step 5: Stop and report.**

### Task 3: Answer dates reach the scorer

**Files:**

- Modify: `lib/facts.ts` (new pure `answerDates` next to `profileAt` at 216), `lib/coverage.ts` (`buildModelInput` at ~345).
- Test: `lib/facts.test.ts` (create if absent).

**Interfaces:**

- Consumes: `ProfileFactHistory` rows (`allHistory`, `lib/facts.ts:179`: `validFrom`, `validTo`, `confirmations`), `profile_facts.answeredAt` (timestamp) and `confirmedAt` (date).
- Produces: `export function answerDates(rows: { key: string; validFrom: string; validTo: string | null; confirmations: string[] | null }[], date: string): Record<string, string>`: per key, the row holding on `date` (same rule as `valueAt`), then the later of its `validFrom` and its last confirmation ≤ `date`.

- [ ] **Step 1: Failing test** `lib/facts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { answerDates } from "./facts";

describe("answerDates (44A)", () => {
  const rows = [
    {
      key: "sym_cold",
      validFrom: "2025-01-10",
      validTo: "2025-06-01",
      confirmations: null,
    },
    {
      key: "sym_cold",
      validFrom: "2025-06-01",
      validTo: null,
      confirmations: ["2025-09-01", "2026-03-01"],
    },
  ];
  it("uses the last confirmation on or before the day", () => {
    expect(answerDates(rows, "2026-01-01")).toEqual({ sym_cold: "2025-09-01" });
    expect(answerDates(rows, "2026-09-30")).toEqual({ sym_cold: "2026-03-01" });
  });
  it("uses the row that held on the day", () => {
    expect(answerDates(rows, "2025-03-01")).toEqual({ sym_cold: "2025-01-10" });
  });
  it("leaves out a key with no row yet", () => {
    expect(answerDates(rows, "2024-12-31")).toEqual({});
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test lib/facts.test.ts`
- [ ] **Step 3: Implement.**
  - `answerDates` in `lib/facts.ts`, reusing `toRow`/`valueAt` to find the held row.
  - `buildModelInput`: `history` is already loaded (`allHistory`). Set `profileAt: answerDates(history, today)` on both paths. On the live path also take the later of that and `profile_facts.answeredAt`/`confirmedAt` per key (the live row wins if later: a confirmation written only to `profile_facts`). Timeless keys need no special case: they are `fixed` and never fade.
- [ ] **Step 4: Verify.** `pnpm test` all green; `pnpm typecheck` clean. Re-run `pnpm eval:journeys`, `pnpm eval:hunches`, `pnpm eval:setup`. Personas carry no `profileAt`, so results must match Step 0 of Task 2. Then a DB check: `pnpm exec tsx --env-file=.env scripts/zz-fade-check.ts` (create it; async IIFE) printing `buildModelInput("<a local test user id from the users table>")`'s `profileAt` and every `for`/`against` entry with `faded` for the top 5 beliefs. Paste the output, then move the script to `/tmp`.
- [ ] **Step 5: Stop and report.**

### Task 4: Cards say how much an old answer counts

**Files:**

- Modify: `lib/ledger.ts` (`inputs` type at ~75, fact inputs at ~976), `components/home.tsx` (`NotRight` at 286).
- Test: `lib/ledger.test.ts` (or the file that already tests ledger inputs; find with `grep -l "inputs" lib/*.test.ts`), `components/home.test.tsx` if it exists, else a `renderToStaticMarkup` test in a new `components/not-right.test.tsx`.

**Interfaces:**

- Consumes: `faded` on `for`/`against` (Task 2), `fadeWords` (Task 1).
- Produces: ledger `inputs[number].note?: string`, e.g. `"you said No, 11 months ago, counting half"`.

- [ ] **Step 1: Failing test** for a pure helper exported from `lib/ledger.ts`:

```ts
import { fadeNote } from "./ledger";
it("words a faded answer (44A)", () => {
  expect(fadeNote("No", { key: "sym_cold", days: 330, weight: 0.08 })).toBe(
    "you said No, 11 months ago, counting little",
  );
  expect(fadeNote("Yes", { key: "sym_cold", days: 45, weight: 0.84 })).toBe(
    "you said Yes, 6 weeks ago, counting almost fully",
  );
});
```

Ages: under 14 days "N days", under 60 days "N weeks" (floor of days/7), else "N months" (round of days/30).

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `fadeNote(value, faded)`. In the fact inputs: find the `faded` entry for this key across `h.for` and `h.against`; when found, set `note`. `NotRight`: print `i.note` after the value in the same `t-num` span style (`· {note}`). No iOS change: iOS does not draw ledger inputs.
- [ ] **Step 4: Verify.** Tests PASS; `pnpm test` green; `pnpm typecheck` clean.
- [ ] **Step 5: Stop and report.**

## Part B: the check-in

### Task 5: Pure check-in logic

**Files:**

- Create: `lib/checkin.ts`
- Test: `lib/checkin.test.ts`

**Interfaces:**

- Consumes: `Move` (`lib/infogain.ts:32`: `kind`, `featureId`, `label`, `outcomes`, `moves: {id, from, to}[]`), `QUIET_BELIEF` (`lib/infogain.ts`), `PROFILE_QUESTIONS`.
- Produces:

  ```ts
  export const ROUND_MAX = 5;
  export const POOL1_MAX = 3;
  export const POOL2_MAX = 2;
  export const REPEAT_DAYS = 30;
  export const FLOOR = 0.02; // 2 points
  export type ItemKind = "fact" | "adherence" | "effect";
  export interface RoundItem {
    key: string; // fact key, or followup_adherence:<itemId> / followup_effect:<itemId>
    kind: ItemKind;
    itemId?: string; // protocol_items.id for follow-ups
    pool: 1 | 2;
    why: string;
    /** condition ids this answer is expected to move, for the `since` screen */
    ids: string[];
  }
  export interface CheckinState {
    round: number;
    started: string | null; // ISO, round start; null between rounds
    queue: RoundItem[]; // picked once at round start
    asked: string[]; // keys answered this round
    skipped: string[]; // keys skipped this round
    snoozedUntil: string | null; // ISO
    lastDone: string | null; // ISO
    nextDue: string; // ISO
    startBeliefs: Record<string, number> | null; // p per condition at round start
    recent: string[][]; // keys of the last 2 finished rounds
  }
  export function nextDueOf(lastDone: string, trying: boolean): string; // +7 or +14 days
  export function laterOf(nowIso: string, offsetMin: number): string; // offsetMin = minutes east of UTC
  export function firstState(
    setupDone: string | null,
    shipDay: string,
  ): CheckinState;
  export function checkinDue(
    s: CheckinState,
    setupDue: boolean,
    setupDone: string | null,
    nowIso: string,
  ): boolean;
  export interface Candidate {
    move: Move;
    key: string;
  }
  export interface FollowupCandidate {
    itemId: string;
    text: string;
    target: string;
    startedAt: string;
  }
  export interface HunchLead {
    hunchId: string;
    conditionId: string;
    p: number;
  }
  export interface RoundInput {
    moves: Move[]; // question moves only, from nextMoves on the probe input
    watched: Set<string>; // condition ids: shown beliefs (p >= QUIET_BELIEF) and open hunch leads
    faded: Map<string, number>; // key -> weight, weight < 0.5, read by a watched condition
    missing: Set<string>; // fact keys missing for a watched condition
    followups: FollowupCandidate[];
    hunches: HunchLead[];
    recentKeys: Set<string>; // answered or skipped in the last REPEAT_DAYS
    lastRounds: string[][];
    siblings: Map<string, Set<string>>; // key -> condition ids its rules feed
    names: Map<string, string>; // condition id -> name, for `why`
    ages: Map<string, number>; // key -> days since answered, for `why`
  }
  export function pickRound(r: RoundInput): RoundItem[];
  ```

- [ ] **Step 1: Failing tests** `lib/checkin.test.ts`. Use a small `mv(key, swings: Record<string, [number, number]>)` helper that builds a `Move` with `kind: "question"`, `featureId: "fact:" + key`, `moves` from the record.

```ts
describe("timing (44B)", () => {
  it("is 7 days while something is tried, else 14", () => {
    expect(nextDueOf("2026-10-01T10:00:00Z", true)).toBe(
      "2026-10-08T10:00:00.000Z",
    );
    expect(nextDueOf("2026-10-01T10:00:00Z", false)).toBe(
      "2026-10-15T10:00:00.000Z",
    );
  });
  it("asks later in 3 hours before 18:00 local, else next day 09:00 local", () => {
    // 12:00 in UTC+3 is 09:00Z
    expect(laterOf("2026-10-01T09:00:00Z", 180)).toBe(
      "2026-10-01T12:00:00.000Z",
    );
    // 23:30 in UTC+3 is 20:30Z; next day 09:00 local is 06:00Z
    expect(laterOf("2026-10-01T20:30:00Z", 180)).toBe(
      "2026-10-02T06:00:00.000Z",
    );
    // 16:00 local: +3 h is 19:00, past 18:00, so next day 09:00
    expect(laterOf("2026-10-01T13:00:00Z", 180)).toBe(
      "2026-10-02T06:00:00.000Z",
    );
  });
  it("is never due while setup is due or within 7 days of setup", () => {
    const s = firstState("2026-10-01T10:00:00Z", "2026-10-01");
    expect(checkinDue(s, true, null, "2026-12-01T00:00:00Z")).toBe(false);
    expect(
      checkinDue(s, false, "2026-10-01T10:00:00Z", "2026-10-04T10:00:00Z"),
    ).toBe(false);
    expect(
      checkinDue(s, false, "2026-10-01T10:00:00Z", "2026-10-08T10:00:00Z"),
    ).toBe(true);
  });
  it("waits for a snooze", () => {
    const s = {
      ...firstState(null, "2026-10-01"),
      snoozedUntil: "2026-10-09T06:00:00Z",
    };
    expect(checkinDue(s, false, null, "2026-10-08T12:00:00Z")).toBe(false);
    expect(checkinDue(s, false, null, "2026-10-09T06:00:00Z")).toBe(true);
  });
  it("starts an account that never ran setup 7 days after ship", () => {
    expect(firstState(null, "2026-10-01").nextDue).toBe(
      "2026-10-08T00:00:00.000Z",
    );
  });
});

describe("pickRound (44B)", () => {
  it("never returns more than 5", () => {
    /* 6 faded + 3 hunches → length 5 */
  });
  it("gives pool 1 up to 3 and pool 2 up to 2", () => {
    /* 4 pool-1 + 2 hunches → 3 + 2 */
  });
  it("fills a short pool from the other", () => {
    /* 0 hunches, 6 pool-1 → 5 */
  });
  it("drops a key answered or skipped in the last 30 days", () => {});
  it("drops a move under 2 points on watched conditions", () => {});
  it("puts a follow-up first in pool 1 and exempts it from the floor", () => {});
  it("ranks a sibling above a key asked in the last 2 rounds", () => {});
  it("picks, per hunch, the question that splits its lead condition most", () => {});
  it("only explores hunches whose lead sits between 5% and 40%, lowest first", () => {});
  it("returns [] when nothing clears the floor", () => {});
  it("writes a why for a faded key and for a hunch", () => {
    // faded: "It's been 4 months since you said No."
    // hunch: "The app has a weak hunch about Hypothyroidism. This answer tells it more."
  });
});
```

Each `pickRound` case body builds a `RoundInput` with the named data and asserts `keys` in order; write them out in full (the stubs above name the case; the implementer fills the arrays, e.g. `faded: new Map([["sym_cold", 0.3]])`, `moves: [mv("sym_cold", { hypothyroidism: [0.3, 0.42] })]`).

- [ ] **Step 2: Run, expect FAIL.** `pnpm test lib/checkin.test.ts`
- [ ] **Step 3: Implement.**
  - `swing(m, ids)`: max over `m.moves` with `id` in `ids` of `|to - from|`.
  - Pool 1: follow-ups first (oldest `startedAt`; at most **one** follow-up item a round, which becomes two `RoundItem`s, adherence then effect, counting as **one** place; exempt from the floor because no rule reads them yet). Then question moves whose key is in `faded ∪ missing`, not in `recentKeys`, with `swing(m, watched) >= FLOOR`, sorted by swing desc; a key in any of `lastRounds` sorts after every key that is not, when both feed a shared condition in `siblings` (the "other angle" rule).
  - Pool 2: `hunches` with `0.05 <= p <= 0.4`, ascending `p`, up to `POOL2_MAX`; for each, the move (not already picked, not in `recentKeys`) with the largest `swing(m, [conditionId])`, if ≥ `FLOOR`.
  - Fill: take pool 1 up to 3 and pool 2 up to 2, then top up from whichever pool has leftovers until 5 places.
  - `why`: faded → `It's been ${months} months since you said ${value}.` (value read by the caller into `ages`/a `values` map if needed; add `values: Map<string,string>` to `RoundInput` if the test needs it). Missing → `This answer moves ${name}.` Hunch → the spec's line with "The app" in place of "We". Follow-up adherence → `You started this ${weeks} weeks ago.`
  - Record the spec deviation in a comment: "Phase 44B: a follow-up item takes one place and skips the floor; the spec's ranking has no swing for keys no rule reads."
- [ ] **Step 4: Verify.** `pnpm test lib/checkin.test.ts` PASS; `pnpm typecheck` clean.
- [ ] **Step 5: Stop and report.**

### Task 6: State, server and API

**Files:**

- Create: `drizzle/0032_users_checkin.sql`, `lib/checkin-server.ts`, `app/api/checkin/route.ts`
- Modify: `db/auth-schema.ts` (`users.checkin` jsonb, next to `setup`), `drizzle/meta/_journal.json` (entry for 0032, copied from the 0031 entry's shape)
- Test: `lib/checkin-server.test.ts` (pure parts: `checkPost`, `sinceOf`), plus a smoke script.

**Interfaces:**

- Consumes: Task 5 exports; `buildModelInput` (`lib/coverage.ts`), `catalogFor`, `scoreHypotheses`, `beliefsOf`, `nextMoves`, `pictureOf` and `optionsOf` (`lib/setup-server.ts:124,140`), `setupDue` and the stored `SetupState.done`, `hunchRows` (`lib/hunches.ts:2149`; `explanations[].conditionId`, `.weight`, `state`), `saveFact`, `protocolItems` (`active`, `startedAt`, `text`, `metricCodes`), `habitLogs` (unique `itemId, day`), `goals` (`achievedAt`), `recordBeliefs`, `refreshHunches`.
- Produces (the JSON contract web and iOS draw; field names are final):

  ```ts
  export type CheckinScreen =
    | {
        kind: "question";
        key: string;
        question: string;
        why: string;
        options: QuestionOption[];
      } // same QuestionOption as setup
    | {
        kind: "since";
        moved: {
          id: string;
          name: string;
          from: number;
          to: number;
          by: string | null;
        }[];
        hunches: { id: string; title: string; from: number; to: number }[];
        test: { label: string; price: string | null } | null;
      };
  export interface CheckinBody {
    due: boolean;
    dueAt: string; // ISO: snoozedUntil if later, else nextDue
    screen: CheckinScreen | null; // null when not due
    progress: { at: number; of: number };
    picture: PictureRow[];
  }
  export type CheckinPost =
    | { screen: "question"; key: string; value?: string; skip?: true }
    | { later: true; offsetMin: number }
    | { skip: true }
    | { done: true }; // closes the `since` screen
  export async function checkinBody(
    userId: string,
    opts?: { force?: boolean },
  ): Promise<CheckinBody>;
  export async function checkinPost(
    userId: string,
    body: CheckinPost,
  ): Promise<CheckinBody | { error: string }>;
  export async function forceCheckin(userId: string): Promise<void>; // /checkin?now=1
  /** reads state only; never starts a round (Home and iOS launch call it) */
  export async function checkinDueFor(userId: string): Promise<boolean>;
  ```

- [ ] **Step 1: Failing tests** `lib/checkin-server.test.ts`:

```ts
import { checkPost, sinceOf } from "./checkin-server";
it("rejects a later without an offset", () => {
  expect(checkPost({ later: true } as never)).toMatch(/offset/);
});
it("rejects an answer that is not one of the options", () => {
  expect(
    checkPost({ screen: "question", key: "sym_cold", value: "Maybe" }),
  ).toMatch(/option/);
});
it("says which answer moved a bar", () => {
  const out = sinceOf(
    { a: 0.43 },
    [{ id: "a", p: 0.61 }],
    [{ key: "sym_energy", kind: "fact", pool: 1, why: "", ids: ["a"] }],
    new Map([["a", "Iron deficiency"]]),
    new Map([["sym_energy", "your tiredness answer"]]),
  );
  expect(out[0]).toEqual({
    id: "a",
    name: "Iron deficiency",
    from: 43,
    to: 61,
    by: "your tiredness answer",
  });
});
it("leaves out a bar that moved under 2 points", () => {
  expect(
    sinceOf(
      { a: 0.43 },
      [{ id: "a", p: 0.44 }],
      [],
      new Map([["a", "A"]]),
      new Map(),
    ),
  ).toEqual([]);
});
```

(Follow-up answer options are fixed: adherence `Every day / Most days / Some days / Not at all`; effect `Better / Same / Worse`; `checkPost` accepts those for `followup_*` keys.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - Migration, mirroring `0031_users_setup.sql`: comment "Phase 44B: where the check-in stands (lib/checkin.ts CheckinState). users lives in db/auth-schema.ts, which drizzle-kit never reads, so this column is added by hand." then `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "checkin" jsonb;`. Apply locally (`pnpm db:migrate` or the command the 0031 migration used; check `package.json`).
  - `checkinBody`:
    1. State: stored, or `firstState(setup.done ?? null, "2026-10-01")` saved on first read. `ponytail:` the ship day is a constant; the real deploy day moves it by a few days at most.
    2. `due = force || checkinDue(state, await setupDue(userId), setup.done, now)`. Not due → `{ due: false, dueAt, screen: null, progress: {at:0,of:0}, picture: [] }`.
    3. Due and `state.started == null`: start a round. Build `input = buildModelInput(userId)`, `catalog`, `rows = scoreHypotheses(input, {catalog})`, `before = beliefsOf(rows)`. `watched` = `before` ids with `p >= QUIET_BELIEF` ∪ open hunches' lead condition (highest-`weight` explanation with a `conditionId`, `state !== "closed"`). `faded` from `rows[].for/against[].faded` with `weight < 0.5` on watched rows. `missing` from watched rows' `missing[].input` that are `PROFILE_QUESTIONS` keys. Probe input = `input` with `faded` keys removed from `profile` (so `nextMoves` simulates a fresh answer). `moves = nextMoves(probe, catalog).filter(q => q.kind === "question" && PROFILE_QUESTIONS[key]?.options?.length)`. `followups`: active `protocol_items` with `startedAt` ≥ 7 days ago and no `followup_*:<id>` fact answered in the last 14 days; `target` = the item's first `metricCodes` name, else `"How you feel"`. `recentKeys` from `profile_fact_history` rows (`validFrom` or a confirmation in the last 30 days) plus `state.skipped` of recent rounds. `siblings` from the catalog: key → condition ids whose evidence reads `input.fact === key`. Call `pickRound`. Empty → `lastDone = now`, `nextDue = nextDueOf(now, trying)`, save, return not due. Else save `{ started: now, queue, asked: [], skipped: [], startBeliefs: Object.fromEntries(before.map(b => [b.id, b.p])) }`.
    4. Next item = first `queue` entry not in `asked ∪ skipped`. `question` screen: fact → `PROFILE_QUESTIONS[key].question`, `optionsOf(move, names, before)`; adherence → "How often did you do it this week?" with the 4 options, no `moves`; effect → `${target} since you started` with the 3 options.
    5. Queue exhausted → `since` screen: `try { await refreshHunches(userId); await recordBeliefs(userId); } catch (e) { console.error("checkin since refresh", e); }` (spec B6), rescore, `moved = sinceOf(startBeliefs, after, queue, names, labels)`, hunches whose lead p moved ≥ 2 points, `test` = first `nextMoves` test with `priced` (as setup's `revealOf`).
    6. `progress = { at: asked.length + skipped.length, of: queue.length }`; `picture = pictureOf(before, names)`.
    7. `trying` = an active `protocol_items` row with `startedAt` in the last 60 days, an open hunch, or a `goals` row with `achievedAt` null.
  - `checkinPost`:
    - `question`: the key must be the current head (else return `checkinBody` unchanged: double-tap guard). `skip` → add to `skipped`. Fact → `saveFact(userId, key, value)`. Adherence "Every day" → insert `habit_logs` `{ itemId, day, done: true }` for each of the last 7 days `onConflictDoNothing()`; other values → `saveFact(userId, key, value)`. Effect → `saveFact`. Then add to `asked`.
    - `later` → `snoozedUntil = laterOf(now, offsetMin)`.
    - `skip` (round) → `lastDone = now`, `nextDue = nextDueOf(now, trying)`, `started = null`, `queue = []`, `snoozedUntil = null`, `recent` = last 2 including this round's queue keys.
    - `done` → same as `skip` but after answers; also `recent` updated.
  - `forceCheckin`: `nextDue = now`, `snoozedUntil = null`, `started = null`.
  - `app/api/checkin/route.ts`: copy `app/api/setup/route.ts`'s shape (401, 400 on bad JSON and on `{ error }`).
- [ ] **Step 4: Verify.** Tests PASS; `pnpm test` green; `pnpm typecheck` clean. Smoke with the dev server on 3001 and a local test account (`/tmp/ov-session.sh <uid>` mints the cookie; use `rtk proxy curl`, not `rtk curl`): `GET /api/checkin` (expect `due:false`), then call `forceCheckin` from a script or `/checkin?now=1` after Task 7, `GET` again (expect a `question` with `why`), POST each answer until `since`, POST `{done:true}`, GET (expect `due:false` and `dueAt` 7 or 14 days out). Paste the bodies with values redacted to shape.
- [ ] **Step 5: Stop and report.**

### Task 7: Web `/checkin` and the Home redirect

**Files:**

- Create: `app/checkin/page.tsx`, `components/checkin-flow.tsx`, `components/checkin-flow.test.tsx`
- Modify: `components/setup-flow.tsx` (export the question block and `Picture` as `QuestionOptions` and `Picture`; `SetupFlow` keeps rendering them unchanged), `app/(app)/page.tsx` (redirect at ~91), `app/globals.css` (only if a class is missing; reuse `setup-*` classes).

**Interfaces:**

- Consumes: `CheckinBody`, `CheckinPost` (Task 6), `checkinBody`, `forceCheckin`, `setupDue`.
- Produces: `export function CheckinFlow({ initial }: { initial: CheckinBody })`.

- [ ] **Step 1: Failing tests** `components/checkin-flow.test.tsx` (`renderToStaticMarkup`, like `setup-flow.test.tsx`):

```ts
it("shows the why under the question", () => {
  const html = render(
    body({
      kind: "question",
      key: "sym_cold",
      question: "Do you feel cold?",
      why: "It's been 4 months since you said No.",
      options: [{ label: "No" }, { label: "Yes" }],
    }),
  );
  expect(html).toContain("It&#x27;s been 4 months since you said No.");
});
it("has Ask later, Skip this round and 2 of 5, and no progress bar", () => {
  const html = render(body(q, { at: 1, of: 5 }));
  expect(html).toContain("Ask later");
  expect(html).toContain("Skip this round");
  expect(html).toContain("2 of 5");
  expect(html).not.toContain('role="progressbar"');
});
it("shows what moved and why on since", () => {
  const html = render(
    body({
      kind: "since",
      moved: [
        {
          id: "a",
          name: "Iron deficiency",
          from: 43,
          to: 61,
          by: "your tiredness answer",
        },
      ],
      hunches: [],
      test: null,
    }),
  );
  expect(html).toContain(
    "Iron deficiency 43% → 61%, from your tiredness answer",
  );
});
it("hides Ask later and Skip this round on since", () => {});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test components/checkin-flow.test.tsx`
- [ ] **Step 3: Implement.**
  - `app/checkin/page.tsx` mirrors `app/setup/page.tsx`: `requireUserId`; `?now=1` → `forceCheckin` then `redirect("/checkin")`; not due → `redirect("/")`; else `<main className="setup-page"><CheckinFlow initial={await checkinBody(userId)} /></main>`.
  - `CheckinFlow`: POSTs `/api/checkin`, replaces the body, keeps the old picture for deltas (`deltaOf`). "Ask later" posts `{ later: true, offsetMin: -new Date().getTimezoneOffset() }` then `router.push("/?home=1")`. "Skip this round" posts `{ skip: true }` then `router.push("/")`. A failed POST keeps the screen and shows "Not saved. Try again." (spec B6). `since`: moved rows, hunch rows ("{title} got stronger/weaker"), test with price, "Open my home" (POST `{done:true}`, then `router.push("/")`).
  - `app/(app)/page.tsx`: after the setup redirect, `if (params.home !== "1" && (await checkinDueFor(userId))) redirect("/checkin")`. It reads state only, so a Home load never starts a round.
- [ ] **Step 4: Verify.** Tests PASS; `pnpm test` green; `pnpm typecheck` clean. The main agent walks `/checkin?now=1` in the browser (not the implementer).
- [ ] **Step 5: Stop and report.**

### Task 8: Check-in eval (Part C)

**Files:**

- Create: `evals/checkin.ts`
- Modify: `package.json` (`"eval:checkin": "tsx --env-file=.env evals/checkin.ts"`)

**Interfaces:**

- Consumes: journey personas (`evals/journeys/`, the loader `evals/journeys.ts` uses), `personaToInput` with `profileAt`, `scoreHypotheses`, `nextMoves`, `pickRound`, `nextDueOf`.

- [ ] **Step 1: Implement** (an eval, printed not asserted): for each journey persona with a known true condition, simulate 6 months from its `today`. Each cycle (7 or 14 days by `nextDueOf`), advance `today`, build the input (facts with `profileAt`), run the pure pick (`pickRound` with the same inputs `checkinBody` builds, computed from the in-memory input), answer each picked key from the persona's truth table (`persona.answers[key]` if the journey file has one, else the value already on file). Planted symptom: pick the first symptom key the true condition reads; it answers "No" at setup and "Yes" from day 120. Print per persona: days until the true condition first reaches `QUIET_BELIEF` with and without check-ins, total questions asked, and whether the planted key (or a sibling) was asked within two cycles of day 120.
- [ ] **Step 2: Run** `pnpm eval:checkin`; paste the table. Save to `evals/results/checkin-2026-09-30.json` in the format the other evals write (synthetic personas only).
- [ ] **Step 3: Stop and report** with the table as the baseline.

## Part D: iOS (44D)

### Task 9: iOS `CheckinView` and a local reminder

**Files:**

- Create: `apps/ios/OpenVitals/CheckinView.swift`, `apps/ios/Tests/CheckinTests.swift`, `apps/ios/Tests/Fixtures/checkin-question.json`, `checkin-followup.json`, `checkin-since.json`, `checkin-idle.json`
- Modify: `apps/ios/OpenVitals/Api.swift` (types and two calls, after `setupPost` at ~2166), `apps/ios/OpenVitals/OpenVitalsApp.swift` (`Shell` at 66), `apps/ios/OpenVitals/Fixtures.swift`, `apps/ios/OpenVitals/Gallery.swift`, the Xcode project file if new files need adding (check how `SetupView.swift` was added).

**Interfaces:**

- Consumes: Task 6 JSON, exact field names.
- Produces: `Api.CheckinBody: Decodable`, `Api.CheckinScreen` (enum on `kind`: `.question`, `.since`; `screen` optional), `Api.checkin() async throws -> CheckinBody`, `Api.checkinPost(_ body: [String: Any]) async throws -> CheckinBody`, `struct CheckinView: View` with `onClose: () -> Void`, `enum CheckinReminder { static func schedule(at: Date) async; static func askOnce() async }`.

- [ ] **Step 1: Failing tests** `CheckinTests.swift`, loading fixtures like `SetupTests` does (`ContractTests.fixtureURL`):

```swift
func testQuestionDecodes() throws {
    let b = try body("checkin-question")
    XCTAssertTrue(b.due)
    guard case .question(let key, _, let why, let options)? = b.screen else { return XCTFail("not question") }
    XCTAssertEqual(key, "sym_cold")
    XCTAssertFalse(why.isEmpty)
    XCTAssertEqual(options.count, 2)
}
func testSinceDecodes() throws {
    guard case .since(let moved, _, _)? = try body("checkin-since").screen else { return XCTFail("not since") }
    XCTAssertEqual(moved.first?.to, 61)
}
func testIdleHasNoScreen() throws {
    let b = try body("checkin-idle")
    XCTAssertFalse(b.due)
    XCTAssertNil(b.screen)
}
func testReminderDateIsTheLaterOfDueAndSnooze() {
    // CheckinReminder.fireDate(dueAt:) parses ISO with fractional seconds
    XCTAssertNotNil(CheckinReminder.fireDate("2026-10-08T06:00:00.000Z"))
}
```

Fixtures: copy shapes from Task 6's smoke output, synthetic values only.

- [ ] **Step 2: Run** `xcodebuild test -project apps/ios/OpenVitals.xcodeproj -scheme OpenVitals -destination 'platform=iOS Simulator,name=iPhone 17'` (use the destination phase 43 used). Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
  - `Shell`: after the setup check, `.task { let b = try? await Api.checkin(); checkin = !setup && b?.due == true; if let d = b?.dueAt { await CheckinReminder.schedule(at: d) } }` and a second `.fullScreenCover(isPresented: $checkin) { CheckinView(onClose: { checkin = false }) }`. Fixture runs open it only for `-OVScreen checkin-<kind>`, as `setupDue()` does.
  - `CheckinView`: reuse `SetupView`'s question and picture views (make them internal, not private, if needed; do not copy them). Header: "Ask later" (POST `later` with `offsetMin: TimeZone.current.secondsFromGMT() / 60`, then `onClose`), "Skip this round" (POST `skip`, `onClose`), "2 of 5". `since`: moved rows, hunch rows, test, "Open my home" (POST `done`, then `await CheckinReminder.askOnce()`, then `onClose`). A failed POST shows "Not saved. Try again."
  - `CheckinReminder`: `UNUserNotificationCenter.current()`; one identifier `"checkin"`; `schedule` removes the pending request with that id and adds one with a `UNCalendarNotificationTrigger` at the date (skip if in the past or permission not granted). Title "Your check-in is ready", body "A few questions, about a minute." `askOnce`: `@AppStorage("checkinAsked")` guard, then `requestAuthorization(options: [.alert, .sound])`. No APNs, no entitlement change.
  - Fixtures and Gallery: one entry per fixture.
- [ ] **Step 4: Verify.** The xcodebuild test run passes (existing count plus the new tests). Report the count.
- [ ] **Step 5: Stop and report.**

---

## Self-review against the spec

- A1 → Task 3 (`answerDates`, `profileAt` on both paths) and Task 2 (`Persona.profileAt`).
- A2 → Task 2. A3 → Task 1 (class test fails on an unclassed key). A4 → Task 4 (ledger inputs; iOS draws no ledger inputs). A5 → Tasks 2-3 tests and eval re-runs (the persona-level fading effect shows only once personas set `profileAt`; Task 8 is the first eval that does).
- B1 → Tasks 5-6 (migration 0032, `nextDueOf`, `laterOf`, due rules, first `nextDue`, round skip). `CheckinState` adds `queue`, `startBeliefs` and `recent` to the spec's field list: the round is picked once, `since` needs the start scores, and the "other angle" rule needs the last 2 rounds.
- B2 → Task 5 (pools, fill, repeat, other angle, floor, empty round) and Task 6 (inputs, probe for faded keys, follow-ups, `habit_logs`). Deviation: a follow-up takes one place and skips the floor (no rule reads it, so it has no swing).
- B3 → Task 6 (GET/POST, `why`, follow-up as two `question` screens, `since`, `?now=1` via Task 7). B4 → Task 7. B5 → Task 9. B6 → Tasks 6, 7, 9.
- Part C → Task 8.
- Order: Tasks 1-4 (44A), 5-8 (44B, 44C, evals), 9 (44D).
