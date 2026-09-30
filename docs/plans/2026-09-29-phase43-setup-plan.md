# Phase 43 Setup Flow and Home Consistency: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new person answers a short adaptive setup (web and iOS) and ends on a real first picture; Home stops saying two opposite things.

**Architecture:** A pure `lib/setup.ts` decides the next screen from a small `users.setup` jsonb state plus the person's facts; `/api/setup` wraps it with the engine (`nextMoves`, `scoreHypotheses`, `hunchBody`). Web (`/setup`) and iOS (`SetupView`) only draw the JSON. Part B is seven small independent fixes in the signal, heading and upload code.

**Tech Stack:** Next.js 16 (app router), drizzle + Postgres, vitest, tsx, SwiftUI (iOS 18), xcodebuild.

**Spec:** `docs/plans/2026-09-29-phase43-setup-spec.md`. Read it before any task.

## Global Constraints

- All work in `apps/simple` unless a task says `apps/ios`. Branch `simple`.
- **No commits, no pushes, no deploys, no prod access.** Where a step says "Commit", stop instead and report; the main agent asks the owner.
- The repo is public. No real names, emails, user ids or health values in code, fixtures, tests or docs. Synthetic values only.
- Every number a setup screen shows is engine output. No fake progress, no invented percentages.
- Every answer saves through existing paths: `saveFact` (`lib/coverage.ts:673`), `writeFact` (`lib/facts.ts:241`), readings insert. No parallel storage of answers.
- `setupDue` is false for anyone with a reading or a `sex` fact.
- Adaptive questions: at most 8 (`SETUP_QUESTIONS = 8`).
- Copy style: short sentences, active voice, no em dashes, no "we".
- Comments follow the house style: say why, cite the phase ("Phase 43A: …"), `ponytail:` for deliberate shortcuts with their ceiling.
- Do not remove any existing component or page section (owner rule: the redesign translates, never removes).
- Run commands from `apps/simple`: `pnpm test`, `pnpm typecheck`, `pnpm exec tsx --env-file=.env <file>`.

## Review Focus

1. **A person who quits mid-flow and returns** expects to resume at the next unanswered screen, never to re-answer. Pinned in Task 1 (resume test) and Task 3 (POST then GET test).
2. **A person who answered some questions elsewhere first** (e.g. waist on Home) expects setup not to ask them again. Pinned in Task 1 (answered keys excluded).
3. **An upload that fails or needs a password** expects the reveal to still show, with the reason. Pinned in Task 5 (reveal with `uploadError`).
4. **A male or a 60-year-old** must never get a female-only or age-limited question (heavy periods). Pinned in Task 4 eval (asserts no `appliesTo` violation) since `nextMoves` already filters, the eval proves it through the flow.
5. **Double tap / two tabs posting the same answer** expects one saved answer and `asked` without duplicates. Pinned in Task 2 (`addOnce` test).

---

## Part A

### Task 1: Pure setup state machine

**Files:**

- Create: `lib/setup.ts`
- Test: `lib/setup.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export const SETUP_QUESTIONS = 8;
  export type ScreenKind =
    | "intro"
    | "upload"
    | "basics"
    | "body"
    | "question"
    | "treatments"
    | "data"
    | "reveal";
  export interface SetupState {
    started: string;
    asked: string[];
    skipped: string[];
    passed: string[];
    hasReport: boolean | null;
    done?: string;
  }
  export const emptySetup: (now: string) => SetupState;
  /** What is already true for the person, read from the DB by the caller. */
  export interface SetupKnown {
    facts: Set<string>;
    uploads: number;
  }
  export function nextKind(
    s: SetupState,
    k: SetupKnown,
    nextQuestion: string | null,
  ): ScreenKind;
  export function progressOf(
    s: SetupState,
    kind: ScreenKind,
  ): { at: number; of: number };
  export function addOnce(xs: string[], x: string): string[];
  export function excludedKeys(s: SetupState, k: SetupKnown): string[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  addOnce,
  emptySetup,
  excludedKeys,
  nextKind,
  progressOf,
  SETUP_QUESTIONS,
  type SetupKnown,
  type SetupState,
} from "./setup";

const s0 = (over: Partial<SetupState> = {}): SetupState => ({
  ...emptySetup("2026-09-29T10:00:00Z"),
  ...over,
});
const k = (facts: string[] = [], uploads = 0): SetupKnown => ({
  facts: new Set(facts),
  uploads,
});
const BASICS = ["setup_goal", "sex", "birth_year", "country"];

describe("nextKind", () => {
  it("starts at intro", () => {
    expect(nextKind(s0(), k(), "sym_energy")).toBe("intro");
  });
  it("asks for the upload only when the person said they have a report", () => {
    expect(nextKind(s0({ hasReport: true }), k(["setup_goal"]), null)).toBe(
      "upload",
    );
    expect(nextKind(s0({ hasReport: false }), k(["setup_goal"]), null)).toBe(
      "basics",
    );
    expect(nextKind(s0({ hasReport: true }), k(["setup_goal"], 1), null)).toBe(
      "basics",
    );
    expect(
      nextKind(
        s0({ hasReport: true, passed: ["upload"] }),
        k(["setup_goal"]),
        null,
      ),
    ).toBe("basics");
  });
  it("needs all three basics", () => {
    expect(
      nextKind(
        s0({ hasReport: false }),
        k(["setup_goal", "sex", "birth_year"]),
        null,
      ),
    ).toBe("basics");
  });
  it("body is done by height or by a skip", () => {
    expect(nextKind(s0({ hasReport: false }), k(BASICS), "sym_energy")).toBe(
      "body",
    );
    expect(
      nextKind(
        s0({ hasReport: false }),
        k([...BASICS, "height_cm"]),
        "sym_energy",
      ),
    ).toBe("question");
    expect(
      nextKind(
        s0({ hasReport: false, passed: ["body"] }),
        k(BASICS),
        "sym_energy",
      ),
    ).toBe("question");
  });
  it("stops questions at the cap or when none is left", () => {
    const asked = Array.from({ length: SETUP_QUESTIONS }, (_, i) => `q${i}`);
    const base = { hasReport: false, passed: ["body"] };
    expect(nextKind(s0({ ...base, asked }), k(BASICS), "sym_energy")).toBe(
      "treatments",
    );
    expect(nextKind(s0(base), k(BASICS), null)).toBe("treatments");
  });
  it("then treatments, data, reveal", () => {
    const base = { hasReport: false, passed: ["body"] };
    expect(
      nextKind(
        s0({ ...base, passed: ["body", "treatments"] }),
        k(BASICS),
        null,
      ),
    ).toBe("data");
    expect(
      nextKind(
        s0({ ...base, passed: ["body", "treatments", "data"] }),
        k(BASICS),
        null,
      ),
    ).toBe("reveal");
  });
  it("resumes where the person stopped", () => {
    const mid = s0({
      hasReport: false,
      passed: ["body"],
      asked: ["sym_energy", "sym_cold"],
    });
    expect(
      nextKind(mid, k([...BASICS, "sym_energy", "sym_cold"]), "sym_hair_skin"),
    ).toBe("question");
  });
});

describe("excludedKeys", () => {
  it("excludes answered, asked and skipped keys", () => {
    const s = s0({ asked: ["sym_cold"], skipped: ["sym_bowel"] });
    expect(excludedKeys(s, k(["waist_cm"])).sort()).toEqual([
      "fact:sym_bowel",
      "fact:sym_cold",
      "fact:waist_cm",
    ]);
  });
});

describe("progressOf", () => {
  it("counts the upload screen only for a person with a report", () => {
    expect(progressOf(s0({ hasReport: false }), "intro").of).toBe(
      3 + SETUP_QUESTIONS + 3,
    );
    expect(progressOf(s0({ hasReport: true }), "intro").of).toBe(
      4 + SETUP_QUESTIONS + 3,
    );
  });
  it("never passes of", () => {
    const p = progressOf(
      s0({ hasReport: false, asked: ["a", "b"] }),
      "question",
    );
    expect(p.at).toBeLessThan(p.of);
  });
});

describe("addOnce", () => {
  it("keeps one copy", () => {
    expect(addOnce(addOnce([], "a"), "a")).toEqual(["a"]);
  });
});
```

(`of` counts intro, basics, body, the 8 questions, treatments, data, reveal, plus upload when `hasReport`. `at` counts screens before `kind`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/setup.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Phase 43A: the setup flow's order, as a pure function. The server reads
 * the facts and the next `nextMoves` question, this decides the screen.
 * Spec: docs/plans/2026-09-29-phase43-setup-spec.md.
 *
 * No database, no clock, no engine.
 */
export const SETUP_QUESTIONS = 8;

export type ScreenKind =
  | "intro"
  | "upload"
  | "basics"
  | "body"
  | "question"
  | "treatments"
  | "data"
  | "reveal";

export interface SetupState {
  started: string;
  /** adaptive question keys asked here, in order */
  asked: string[];
  /** question keys the person skipped; setup never asks them again */
  skipped: string[];
  /** screens finished with Continue or Skip: upload, body, treatments, data */
  passed: string[];
  hasReport: boolean | null;
  done?: string;
}

export interface SetupKnown {
  facts: Set<string>;
  uploads: number;
}

export const emptySetup = (now: string): SetupState => ({
  started: now,
  asked: [],
  skipped: [],
  passed: [],
  hasReport: null,
});

export const addOnce = (xs: string[], x: string): string[] =>
  xs.includes(x) ? xs : [...xs, x];

export function nextKind(
  s: SetupState,
  k: SetupKnown,
  nextQuestion: string | null,
): ScreenKind {
  if (!k.facts.has("setup_goal") || s.hasReport == null) return "intro";
  if (s.hasReport && k.uploads === 0 && !s.passed.includes("upload"))
    return "upload";
  if (!["sex", "birth_year", "country"].every((f) => k.facts.has(f)))
    return "basics";
  if (!k.facts.has("height_cm") && !s.passed.includes("body")) return "body";
  if (nextQuestion && s.asked.length + s.skipped.length < SETUP_QUESTIONS)
    return "question";
  if (!s.passed.includes("treatments")) return "treatments";
  if (!s.passed.includes("data")) return "data";
  return "reveal";
}

export const excludedKeys = (s: SetupState, k: SetupKnown): string[] =>
  [...new Set([...k.facts, ...s.asked, ...s.skipped])].map((x) => `fact:${x}`);

const ORDER: ScreenKind[] = [
  "intro",
  "upload",
  "basics",
  "body",
  "question",
  "treatments",
  "data",
  "reveal",
];

export function progressOf(
  s: SetupState,
  kind: ScreenKind,
): { at: number; of: number } {
  const count = (x: ScreenKind) =>
    x === "question" ? SETUP_QUESTIONS : x === "upload" && !s.hasReport ? 0 : 1;
  const of = ORDER.reduce((n, x) => n + count(x), 0);
  const i = ORDER.indexOf(kind);
  const before = ORDER.slice(0, i).reduce((n, x) => n + count(x), 0);
  const at =
    kind === "question" ? before + s.asked.length + s.skipped.length : before;
  return { at: Math.min(at, of - 1), of };
}
```

Note the intro test: `intro` needs both `setup_goal` and `hasReport` answered; the tests that start past intro pass `hasReport` explicitly. Skipped questions count toward the cap (they are shown screens).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/setup.test.ts`. Expected: PASS.

- [ ] **Step 5: Stop and report** (no commit).

### Task 2: Schema, the goal question, shared fact validation

**Files:**

- Modify: `db/auth-schema.ts` (users table: `setup: jsonb("setup")`), generate a migration with `pnpm db:generate`, apply with `pnpm db:migrate` (local DB only).
- Modify: `lib/vectors.ts` (`ASKED` gains `setup_goal`).
- Create: `lib/fact-input.ts`; Modify: `app/api/facts/route.ts` to call it.
- Test: `lib/fact-input.test.ts`

**Interfaces:**

- Produces:
  ```ts
  // lib/fact-input.ts
  export type FactCheck = { ok: true } | { ok: false; error: string };
  export function checkFact(key: string | undefined, value: unknown): FactCheck;
  ```
  Same errors and messages as `app/api/facts/route.ts` today: "unknown question", "no answer", "not one of the options".
- `users.setup` holds `SetupState` (Task 1) or null.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { checkFact } from "./fact-input";

describe("checkFact", () => {
  it("accepts a known key with a listed option", () => {
    expect(checkFact("setup_goal", "Prevention")).toEqual({ ok: true });
  });
  it("rejects unknown keys, blanks and unlisted options", () => {
    expect(checkFact("nope", "x")).toEqual({
      ok: false,
      error: "unknown question",
    });
    expect(checkFact("sex", "  ")).toEqual({ ok: false, error: "no answer" });
    expect(checkFact("setup_goal", "Other")).toEqual({
      ok: false,
      error: "not one of the options",
    });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test lib/fact-input.test.ts`
- [ ] **Step 3: Implement.** Add to `ASKED` in `lib/vectors.ts`:

```ts
  // Phase 43A: the first setup screen. No evidence rule reads it; Home
  // copy may later. Never re-asked on a clock.
  setup_goal: {
    question: "What brings you here?",
    options: ["Feel better", "Understand a result", "Prevention", "A diagnosis I have"],
    revisitDays: 0,
  },
```

Create `lib/fact-input.ts` by moving the three checks out of `app/api/facts/route.ts` (lines 23-30) verbatim into `checkFact`; the route calls it and returns `Response.json({ error }, { status: 400 })` on `ok: false`. Add `setup: jsonb("setup").$type<SetupState | null>()` to `users` (import the type from `@/lib/setup`), run `pnpm db:generate`, check the SQL is one `ALTER TABLE "users" ADD COLUMN "setup" jsonb;`, then `pnpm db:migrate`.

- [ ] **Step 4: Run** `pnpm test lib/fact-input.test.ts app` and `pnpm typecheck`. Expected: PASS. Check `/api/facts` behaviour is unchanged: existing tests pass.
- [ ] **Step 5: Stop and report.**

### Task 3: `/api/setup` (GET and POST) with the engine

**Files:**

- Create: `lib/setup-server.ts`, `app/api/setup/route.ts`
- Test: `lib/setup-server.test.ts` (pure helpers only), plus a tsx smoke script run in Step 4

**Interfaces:**

- Consumes: Task 1 functions; `checkFact`; `buildModelInput(userId)` (`lib/coverage.ts:345`); `loadCatalog()` (`lib/hkb.ts:527`); `scoreHypotheses(input, { catalog })`; `beliefsOf`, `nextMoves`, `QUIET_BELIEF` (`lib/infogain.ts`); `saveFact`; `writeFact`, `factAt`; `refreshHunches` (`lib/hunches.ts:1597`); `recordBeliefs` (`lib/ledger.ts:419`); `hunchRows`, `hunchBody` (`lib/api-contract.ts:1756`); `actionsForAll` (`lib/actions.ts:416`).
- Produces (JSON the web and iOS decode; keep field names exactly):
  ```ts
  export interface PictureRow {
    id: string;
    name: string;
    p: number;
  } // p in 0..1
  export interface QuestionOption {
    label: string;
    moves: { id: string; name: string; from: number; to: number } | null;
  } // from/to 0..100 ints
  export type SetupScreen =
    | { kind: "intro"; goals: string[] }
    | { kind: "upload" }
    | {
        kind: "basics";
        sex: string | null;
        birthYear: string | null;
        country: string | null;
      }
    | {
        kind: "body";
        heightCm: string | null;
        weightKg: string | null;
        waistCm: string | null;
      }
    | {
        kind: "question";
        key: string;
        question: string;
        options: QuestionOption[];
      }
    | { kind: "treatments"; current: Treatment[] }
    | { kind: "data"; needsUpload: boolean }
    | {
        kind: "reveal";
        fromAnswersOnly: boolean;
        hunchId: string | null;
        case: unknown | null;
        picture: PictureRow[];
        test: { label: string; price: string | null } | null;
        action: PlanLineLite | null;
      };
  export interface Treatment {
    what: string;
    route: "oral" | "iv" | "injection";
    started: string;
    stopped?: string;
  } // YYYY-MM
  export interface PlanLineLite {
    id: string;
    title: string;
    dose?: string;
  }
  export interface SetupBody {
    due: boolean;
    screen: SetupScreen;
    progress: { at: number; of: number };
    picture: PictureRow[];
  }
  export async function setupDue(userId: string): Promise<boolean>;
  export async function setupBody(userId: string): Promise<SetupBody>;
  export async function setupPost(
    userId: string,
    body: SetupPost,
  ): Promise<SetupBody | { error: string }>;
  export type SetupPost =
    | { screen: "intro"; goal: string; hasReport: boolean }
    | { screen: "upload" | "body" | "treatments" | "data"; skip: true }
    | { screen: "basics"; sex: string; birthYear: string; country: string }
    | { screen: "body"; heightCm?: string; weightKg?: string; waistCm?: string }
    | { screen: "question"; key: string; value?: string; skip?: true }
    | { screen: "treatments"; treatments: Treatment[] }
    | { screen: "data" }
    | { screen: "reveal" };
  // pure, exported for tests:
  export function pictureOf(
    beliefs: { id: string; p: number }[],
    names: Map<string, string>,
  ): PictureRow[];
  export function optionsOf(
    move: Move,
    names: Map<string, string>,
    before: { id: string; p: number }[],
  ): QuestionOption[];
  export function checkTreatment(t: unknown): t is Treatment;
  ```
- `hunchBody(userId, id)` returns the case JSON the web drawer and iOS `HunchCaseView` already decode; the reveal passes it through unchanged as `case`.

- [ ] **Step 1: Failing tests for the pure helpers**

```ts
import { describe, expect, it } from "vitest";
import { checkTreatment, optionsOf, pictureOf } from "./setup-server";

const names = new Map([
  ["iron_deficiency", "Iron deficiency"],
  ["hypothyroidism", "Hypothyroidism"],
  ["x", "X"],
  ["y", "Y"],
]);

describe("pictureOf", () => {
  it("keeps the top three at or above the quiet floor", () => {
    const rows = pictureOf(
      [
        { id: "x", p: 0.1 },
        { id: "iron_deficiency", p: 0.6 },
        { id: "hypothyroidism", p: 0.3 },
        { id: "y", p: 0.26 },
      ],
      names,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "iron_deficiency",
      "hypothyroidism",
      "y",
    ]);
  });
  it("is empty when nothing stands out", () => {
    expect(pictureOf([{ id: "x", p: 0.1 }], names)).toEqual([]);
  });
});

describe("optionsOf", () => {
  it("names the condition each answer moves most, in whole percent", () => {
    const move = {
      kind: "question",
      featureId: "fact:sym_energy",
      label: "Tired?",
      cost: 0,
      outcomes: [
        {
          label: "No",
          prob: 0.5,
          beliefs: [{ id: "iron_deficiency", p: 0.1 }],
          apply: {},
        },
        {
          label: "Yes",
          prob: 0.5,
          beliefs: [{ id: "iron_deficiency", p: 0.31 }],
          apply: {},
        },
      ],
      entropyBefore: 1,
      entropyAfter: 0.9,
      gain: 0.1,
      ratio: 0.1,
      shift: 0.2,
    } as never;
    const before = [{ id: "iron_deficiency", p: 0.12 }];
    const out = optionsOf(move, names, before);
    expect(out[1]).toEqual({
      label: "Yes",
      moves: {
        id: "iron_deficiency",
        name: "Iron deficiency",
        from: 12,
        to: 31,
      },
    });
    expect(out[0].moves).toEqual({
      id: "iron_deficiency",
      name: "Iron deficiency",
      from: 12,
      to: 10,
    });
  });
  it("gives null when an answer moves nothing by 2 points", () => {
    const move = {
      outcomes: [{ label: "No", beliefs: [{ id: "x", p: 0.51 }] }],
    } as never;
    expect(optionsOf(move, names, [{ id: "x", p: 0.5 }])[0].moves).toBeNull();
  });
});

describe("checkTreatment", () => {
  it("accepts a full row and rejects bad months or routes", () => {
    expect(
      checkTreatment({ what: "Iron", route: "oral", started: "2024-09" }),
    ).toBe(true);
    expect(
      checkTreatment({
        what: "Iron",
        route: "oral",
        started: "2024-09",
        stopped: "2026-09",
      }),
    ).toBe(true);
    expect(
      checkTreatment({ what: "Iron", route: "pill", started: "2024-09" }),
    ).toBe(false);
    expect(
      checkTreatment({ what: "", route: "oral", started: "2024-09" }),
    ).toBe(false);
    expect(
      checkTreatment({ what: "Iron", route: "oral", started: "Sept" }),
    ).toBe(false);
  });
});
```

`optionsOf` signature is therefore `optionsOf(move, names, before: {id; p}[])`: for each outcome, the condition with the largest `|after − before|`, rounded to whole percent; `null` when that difference is under 2 points. Update the Produces block accordingly when implementing.

- [ ] **Step 2: Run, expect FAIL.** `pnpm test lib/setup-server.test.ts`
- [ ] **Step 3: Implement.**
  - `setupDue`: `users.setup?.done` unset AND `count(readings) = 0` AND no `sex` fact (`factAt(userId, "sex", localDay()) == null`).
  - `setupBody`: load `users.setup` (or `emptySetup(now)` without writing), the fact keys (`profile_facts` rows for the user; keys only), uploads count, `input = await buildModelInput(userId)`, `catalog = await loadCatalog()`, `rows = scoreHypotheses(input, { catalog })`, `before = beliefsOf(rows)`, `names` from `catalog` (id to name). Question: `nextMoves(input, catalog, { exclude: excludedKeys(state, known) }).find((m) => m.kind === "question")`, key = `featureId.slice(5)`. Only call `nextMoves` once basics are complete (it needs sex and age). `kind = nextKind(...)`. Build the screen; `question` uses `PROFILE_QUESTIONS[key].question` and `optionsOf(move, names, before)`.
  - `reveal`: run `refreshHunches(userId)` and `recordBeliefs(userId)` once per GET of the reveal (they are idempotent). Find the first open `cause` hunch in `hunchRows(userId)`; when found, `case = await hunchBody(userId, id)`. `test`: when no cause hunch, the first `nextMoves` move with `kind === "test"`: `{ label, price: m.priced ? \`€${Math.round(m.cost)}\` : null }`. `action`: `(await actionsForAll(userId, [picture[0].id], 1))[picture[0].id]?.[0]`mapped to`{ id, title, dose }`, or null. `fromAnswersOnly = readings count === 0`.
  - `setupPost`: validate every fact with `checkFact` before any write; on the first error return `{ error }` and write nothing. Writes: `intro` saves `setup_goal` and `hasReport`; `basics` saves `sex`, `birth_year`, `country`; `body` saves `height_cm`, `waist_cm` via `saveFact` and weight as a `readings` row (`metricCode: "weight"`, `unit: "kg"`, `observedAt` now, `source` as the manual-entry path in `compose.ts` `writeChips` sets it); `question` saves the answer and `asked = addOnce(asked, key)`, or on skip `skipped = addOnce(skipped, key)`; `treatments` appends each checked row to the `treatments` list exactly as `compose.ts:1283-1291` does (read `factAt`, spread, `writeFact`), storing `started`/`stopped` as `YYYY-MM-01` to match the existing `YYYY-MM-DD` entries, and `route` `"iv"` for IV; skips and `data` add to `passed`; `reveal` sets `done`. Write `users.setup` once at the end of the POST. Return `setupBody(userId)`.
  - Route: `GET` returns `setupBody`; `POST` parses JSON, calls `setupPost`, returns 400 on `{ error }`. Both 401 without a user, same as `app/api/facts/route.ts`.
- [ ] **Step 4: Verify.**
  - `pnpm test lib/setup-server.test.ts lib/setup.test.ts` PASS; `pnpm typecheck` clean.
  - Smoke on the local DB with a throwaway user (create and remove within the script; synthetic email `setup-smoke@example.com`): a tsx script at `/tmp/setup-smoke.ts` (copy into `scripts/` only while running it, then move it back to `/tmp`) that calls `setupPost` through intro (no report), basics (female, 1990, RO), body (165), answers every question with its first option until `treatments`, skips treatments and data, prints each screen kind and picture, then prints the reveal and checks `setupDue` is false after `{ screen: "reveal" }`. Paste the output in the report.
  - Resume check inside the same script: after two questions, call `setupBody` again and assert the kind is still `question` with a key not in `asked`.
- [ ] **Step 5: Stop and report.**

### Task 4: `eval:setup`

**Files:**

- Create: `evals/setup.ts`; Modify: `package.json` (`"eval:setup": "tsx --env-file=.env evals/setup.ts"`).

**Interfaces:**

- Consumes: `JOURNEYS` (`lib/journey.ts:197`), `personaToInput` (`evals/persona.ts`), `nextMoves`, `scoreHypotheses`, `beliefsOf`, `loadCatalog`, `applyOverlay` (`lib/sample.ts`), `SYMPTOMS[].appliesTo` (`lib/symptoms.ts`), `nextKind`, `excludedKeys`, `SETUP_QUESTIONS`.

- [ ] **Step 1: Write the eval.** For each journey, two runs: `labs: "none"` (the persona input with `readings` emptied) and `labs: "start"` (the persona as given). Loop: `move = nextMoves(input, catalog, { exclude }).find(kind === "question")`; stop at `SETUP_QUESTIONS` or no move; answer from `journey.truth.answers[key]`, else "Not sure" when it is an option, else the first option; apply with `applyOverlay(input, { facts: { [key]: answer } })`. After the loop, `pictureOf`-style top 3 of `beliefsOf(scoreHypotheses(...))` and the rank (1-based, or "-") of each `journey.truth` condition id. Print one table row per journey and run: id, labs, questions, rank, keys. Fail (exit 1) when a key repeats, when more than 8 are asked, or when a key's `appliesTo` excludes the persona's sex or age. Print the hit rate (true condition in top 3) per labs mode at the end.
- [ ] **Step 2: Run** `pnpm eval:setup`. Expected: exit 0; paste the table and hit rates in the report. No threshold: this run is the baseline.
- [ ] **Step 3: Run** `pnpm eval:journeys`. Expected: 25/25 still.
- [ ] **Step 4: Stop and report.**

### Task 5: Web `/setup`

**Files:**

- Create: `app/setup/page.tsx`, `components/setup-flow.tsx`, `components/setup-flow.test.tsx`
- Modify: `app/(app)/page.tsx` (redirect), `components/home.tsx:750-770` (Day One card gains "Start setup" / "Continue setup" link to `/setup`; keep the existing text and link).

**Interfaces:**

- Consumes: `SetupBody`, `SetupScreen`, `SetupPost` types from `lib/setup-server.ts`; `setupDue`, `setupBody` server-side for the first render.
- Produces: `export function SetupFlow({ initial }: { initial: SetupBody })` and pure helpers `export function deltaOf(prev: PictureRow[], next: PictureRow[]): Map<string, number>` (only moves of 2 points or more, in whole percent) and `export function barLabel(p: number): string` (`"31%"`).

- [ ] **Step 1: Failing tests**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
import { barLabel, deltaOf, SetupFlow } from "./setup-flow";

const body = (screen: object, picture: object[] = []) =>
  ({ due: true, screen, progress: { at: 3, of: 14 }, picture }) as never;

describe("deltaOf", () => {
  it("keeps moves of two points or more", () => {
    const d = deltaOf(
      [
        { id: "a", name: "A", p: 0.12 },
        { id: "b", name: "B", p: 0.4 },
      ],
      [
        { id: "a", name: "A", p: 0.31 },
        { id: "b", name: "B", p: 0.41 },
      ],
    );
    expect([...d]).toEqual([["a", 19]]);
  });
  it("treats a new row as a move from zero", () => {
    expect(deltaOf([], [{ id: "a", name: "A", p: 0.3 }]).get("a")).toBe(30);
  });
});

describe("SetupFlow", () => {
  it("prints the question, each option and what it moves", () => {
    const html = renderToStaticMarkup(
      createElement(SetupFlow, {
        initial: body({
          kind: "question",
          key: "sym_energy",
          question: "Have you been tired most days for over a month?",
          options: [
            { label: "No", moves: null },
            {
              label: "Yes",
              moves: {
                id: "iron_deficiency",
                name: "Iron deficiency",
                from: 12,
                to: 31,
              },
            },
          ],
        }),
      }),
    );
    expect(html).toContain("Have you been tired most days");
    expect(html).toContain("Yes moves Iron deficiency 12 → 31");
    expect(html).toContain("Skip");
  });
  it("has no skip on intro and basics", () => {
    expect(
      renderToStaticMarkup(
        createElement(SetupFlow, {
          initial: body({ kind: "intro", goals: ["Prevention"] }),
        }),
      ),
    ).not.toContain(">Skip<");
  });
  it("says nothing stands out when the picture is empty", () => {
    expect(
      renderToStaticMarkup(
        createElement(SetupFlow, {
          initial: body({
            kind: "body",
            heightCm: null,
            weightKg: null,
            waistCm: null,
          }),
        }),
      ),
    ).toContain("Nothing stands out yet.");
  });
  it("says a reveal from answers alone", () => {
    const html = renderToStaticMarkup(
      createElement(SetupFlow, {
        initial: body({
          kind: "reveal",
          fromAnswersOnly: true,
          hunchId: null,
          case: null,
          picture: [{ id: "a", name: "Iron deficiency", p: 0.4 }],
          test: { label: "Ferritin", price: "€9" },
          action: null,
        }),
      }),
    );
    expect(html).toContain("From your answers alone.");
    expect(html).toContain("Ferritin");
    expect(html).toContain("Open my home");
  });
  it("shows an upload error on the reveal", () => {
    const html = renderToStaticMarkup(
      createElement(SetupFlow, {
        initial: {
          ...body({
            kind: "reveal",
            fromAnswersOnly: true,
            hunchId: null,
            case: null,
            picture: [],
            test: null,
            action: null,
          }),
          uploadError: "This PDF needs a password.",
        } as never,
      }),
    );
    expect(html).toContain("This PDF needs a password.");
    expect(html).toContain("Add it later from +");
  });
  it("prints the progress", () => {
    expect(
      renderToStaticMarkup(
        createElement(SetupFlow, { initial: body({ kind: "upload" }) }),
      ),
    ).toContain('aria-valuenow="3"');
  });
});
```

(`uploadError` is client state in the component; for the test the component also reads an optional `uploadError` on `initial`.)

- [ ] **Step 2: Run, expect FAIL.** `pnpm test components/setup-flow.test.tsx`
- [ ] **Step 3: Implement.**
  - `app/setup/page.tsx` (server): `requireUserId()`; `if (!(await setupDue(userId))) redirect("/")`; render `<SetupFlow initial={await setupBody(userId)} />` in a full-height `<main>` with the paper background (`home.tsx` classes). No `TopNav`.
  - `app/(app)/page.tsx`: at the top of the page component, `if (await setupDue(userId)) redirect("/setup")`, but only when the request has no `?home=1` (the "Finish later" link goes to `/?home=1`, so Home shows the Day One card).
  - `SetupFlow` (client): holds `body`, `prevPicture`, `uploading: Promise | null`, `uploadError`. Every action POSTs `/api/setup` and replaces `body` (keeping the old picture as `prevPicture`). Progress bar: `<div role="progressbar" aria-valuenow={at} aria-valuemax={of}>`. Single-choice options: one button each, a tap POSTs at once. Picture: up to 3 rows, name, bar `style={{ width: \`${p\*100}%\`, transition: "width 600ms ease" }}`, `barLabel`, and `+19`/`−7`from`deltaOf`. Under each question option: `"{label} moves {name} {from} → {to}"`when`moves` is set.
  - `upload` screen: `<input type="file" accept="application/pdf,image/*">`; on change, start `fetch("/api/upload", { method: "POST", body: formData })` without awaiting, keep the promise, POST `{ screen: "upload", skip: true }` to move on (the upload row, once written, also completes the screen). On the reveal, when a promise is pending, show "Reading your report…" and await it; on a non-OK response set `uploadError` from the JSON `error` (the route returns `NEEDS_PASSWORD` text for password PDFs); then GET `/api/setup` again to redraw the reveal.
  - `treatments`: rows with chips for what (Iron, Vitamin D, B12, Thyroid hormone, Statin, Metformin, Other + text), route (Oral, IV, Injection), `<input type="month">` started, a "Still taking" checkbox or `<input type="month">` stopped, "Add another", Continue (POST `treatments`) and Skip.
  - `reveal`: when `case` is set, reuse the existing case list component the hunch drawer uses (`components/hunch-board.tsx`, the differential list) with `case`; else the picture rows. Then the test with price, the action with the existing adopt button, and "Open my home" (POST `reveal`, then `router.push("/")`).
  - Inputs: `inputMode="numeric"` on number fields. Buttons at least 44 px tall.
  - "Finish later" link on every screen to `/?home=1`.
- [ ] **Step 4: Verify.** `pnpm test components/setup-flow.test.tsx` PASS; `pnpm test` all green; `pnpm typecheck` clean. The main agent walks it in the browser (not the implementer).
- [ ] **Step 5: Stop and report.**

### Task 6: iOS `SetupView`

**Files:**

- Create: `apps/ios/OpenVitals/SetupView.swift`
- Modify: `apps/ios/OpenVitals/Api.swift` (types and two calls), `apps/ios/OpenVitals/OpenVitalsApp.swift` (`Shell` presents it), `apps/ios/OpenVitals/Fixtures.swift` (one fixture per screen kind), `apps/ios/OpenVitals/Gallery.swift` (one entry per screen kind), the test target (decoding tests).

**Interfaces:**

- Consumes: the JSON in Task 3 (`SetupBody`), exact field names.
- Produces: `struct SetupBody: Decodable`, `enum SetupScreen: Decodable` (switch on `kind`), `Api.setup() async throws -> SetupBody`, `Api.setupPost(_ body: [String: Any]) async throws -> SetupBody`, `struct SetupView: View` with `onClose: () -> Void`.

- [ ] **Step 1: Failing decoding tests** in the existing test target, one per screen kind, decoding the fixture JSON strings (copy each from a Task 3 smoke output, synthetic values only), asserting `kind` and one field each (e.g. question `options[1].moves?.to == 31`, reveal `fromAnswersOnly == true`).
- [ ] **Step 2: Run** `xcodebuild test -project apps/ios/OpenVitals.xcodeproj -scheme OpenVitals -destination 'platform=iOS Simulator,name=iPhone 17'` (use the destination the existing tests use; check `apps/ios` README or the last test run). Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
  - `Shell`: `.task { if let b = try? await Api.setup(), b.due { showSetup = true } }` and `.fullScreenCover(isPresented: $showSetup) { SetupView(onClose: { showSetup = false }) }`.
  - `SetupView`: one screen at a time, `DesignTokens` paper colors and fonts, a thin progress bar, big option buttons with `UIImpactFeedbackGenerator(style: .light)` on tap, the picture rows with bars animated by the curves in `Motion.swift`, deltas of 2 points or more beside a bar, "Skip" except on intro and basics, "Finish later" (calls `onClose`).
  - `upload` and `data`: the existing document and photo pickers and upload call the Add sheet uses (`CaptureView.swift` / `AddCamera.swift`: reuse the upload function, do not copy it); run it in a `Task` and await it on the reveal ("Reading your report…"). `data` also has "Connect Apple Health" calling the same authorization Settings calls on `HealthSyncModel.shared`, and "Add a genome file from the website".
  - `reveal`: the picture or, when `case` is set, decode it as the existing `HunchCase` type and show its differential rows the way `HunchCaseView` draws them (reuse the row view). Test with price, action, "Open my home" (POST reveal, then `onClose`).
  - Gallery: one entry per screen kind from the fixtures.
- [ ] **Step 4: Verify.** The xcodebuild test run passes (85 existing plus the new decoding tests). Report the count.
- [ ] **Step 5: Stop and report.**

## Part B

Each task is independent. One implementer may take them in order.

### Task 7 (43D): "Holding" names an out-of-range value

**Files:** `lib/api-contract.ts` (`HeadingRow` type and `headingOf` at 1826), its caller that builds the `headingOf` input, `lib/home-hybrid.ts` (`headingSentence`), `lib/home-hybrid.test.ts`, `lib/api-contract.test.ts`.

**Interfaces:** `HeadingRow` gains `off?: { name: string; value: string; side: "below" | "above" }` (value already formatted with unit, e.g. "16.8 ng/mL"). `headingOf` input gains `latest: Map<string, { name: string; value: number; unit: string | null; refLow: number | null; refHigh: number | null }>`; it sets `off` on `holding` and `toward` rows from the system's first marker outside its lab range (codes in `systemOf` order).

- [ ] **Step 1: Failing test** in `lib/home-hybrid.test.ts`:

```ts
it("says when a holding system sits outside the lab range", () => {
  const s = headingSentence([
    {
      ...row("Iron", "holding"),
      off: { name: "Ferritin", value: "16.8 ng/mL", side: "below" },
    },
    row("Lipids", "holding"),
  ]);
  expect(s.sub).toContain(
    "Iron is holding, but Ferritin (16.8 ng/mL) is below the lab range.",
  );
});
it("names at most two such systems", () => {
  const off = { name: "M", value: "1", side: "above" as const };
  const s = headingSentence(
    ["A", "B", "C"].map((n) => ({ ...row(n, "holding"), off })),
  );
  expect(s.sub.match(/is holding, but/g)).toHaveLength(2);
});
```

and in `lib/api-contract.test.ts` a `headingOf` case with a `latest` ferritin under `refLow` giving `word: "holding"` and `off.side === "below"`.

- [ ] **Step 2: Run, FAIL.** `pnpm test lib/home-hybrid.test.ts lib/api-contract.test.ts`
- [ ] **Step 3: Implement.** In `headingSentence`, after the away sentence, add for the first two rows with `off` and word `holding` or `toward`: `` `${h.name} is ${h.word === "toward" ? "moving toward your history" : "holding"}, but ${h.off.name} (${h.off.value}) is ${h.off.side} the lab range.` `` Build `latest` in the caller from the same rows the Systems rail reads (latest value per code with `refLow`/`refHigh`).
- [ ] **Step 4: Run** the two test files and `pnpm typecheck`. PASS.
- [ ] **Step 5: Stop and report.**

### Task 8 (43E): No good news on a value outside the lab range

**Files:** `lib/signals.ts` (`goodNewsOf` and its use at ~443), `lib/signals.test.ts`, `lib/hunches.ts` (close with `superseded`), `lib/hunches.test.ts`.

- [ ] **Step 1: Failing tests.** In `signals.test.ts`: a series ferritin 9.8 (lab 20-250), 28.5, 19.3, 51.7, 16.8 raises no `good_news` for ferritin. And a series whose last value is inside the lab range still raises it as today (copy an existing passing `good_news` case). In `hunches.test.ts`: an open `good_news:ferritin` hunch with no matching signal on refresh closes with outcome `"superseded"`; check how `faded` is written (`lib/hunches.ts:1865`) and follow it, and check the `outcome` column type in `db/schema.ts` accepts the new word (it is text; if it is an enum, add the value in a migration).
- [ ] **Step 2: Run, FAIL.** `pnpm test lib/signals.test.ts lib/hunches.test.ts`
- [ ] **Step 3: Implement.** In `goodNewsOf`, return null when the last point is outside its own `refLow`/`refHigh`. Also return null when `input.beliefs` (or the scored rows available at that point; read how `causesFor` gets condition context at `signals.ts:681`) has a `likely` or `confirmed` condition reading this code. In refresh, a `good_news` hunch whose signal is gone closes `superseded` (not `faded`), so the ledger can say why.
- [ ] **Step 4: Run** the two test files, `pnpm test`, `pnpm eval:hunches`. PASS.
- [ ] **Step 5: Stop and report.**

### Task 9 (43F): "The one to move first" follows card 01

**Files:** `lib/home-data.ts` (`firstMoveSentence` at 557 and its caller), `lib/api-contract.test.ts` (existing expectations at 656 and 678), `lib/home-data.test.ts`.

**Interfaces:** `firstMoveSentence(systems, top?: { systemName: string; tone: RailTone })`. When `top` is given, `head` is `` `${top.systemName} is the one to move first` ``; else the current rule.

- [ ] **Step 1: Failing test:** systems where Vitamins has the worst marker, `top = { systemName: "Iron", tone: "off" }` gives "Iron is the one to move first"; without `top` it still gives "Vitamins is the one to move first".
- [ ] **Step 2: Run, FAIL.** `pnpm test lib/home-data.test.ts`
- [ ] **Step 3: Implement.** The caller passes the system of the first ranked belief card (the same list Home renders as 01; find where `home.tsx` gets it and pass that condition's system name, using the condition-to-system map the Systems rail already uses). Update the two existing expectations only if their fixtures now have a card 01 in another system; say so in the report.
- [ ] **Step 4: Run** `pnpm test`. PASS.
- [ ] **Step 5: Stop and report.**

### Task 10 (43G): One open hunch per marker

**Files:** `lib/hunches.ts` (refresh, near the insert at ~1789), `lib/hunches.test.ts`.

- [ ] **Step 1: Failing test:** open `step:eosinophils_abs` (older) exists; the refresh raises `good_news:eosinophils_abs`. After refresh, the good news is open and the step is closed `superseded`. And the reverse order.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement.** After computing the new open set: for each code with both a `good_news:<code>` and a `step:<code>` or `drift:<code>` open, keep the one whose signal date (`since` or the hunch's `first_seen`) is newer; close the other `superseded`.
- [ ] **Step 4: Run** `pnpm test lib/hunches.test.ts`, `pnpm eval:hunches`. PASS.
- [ ] **Step 5: Stop and report.**

### Task 11 (43H): Ratios are not values

**Files:** `lib/units.ts` (plausibility table), `lib/uploads.ts` (`planInsert` skips implausible rows into the skipped list), `lib/documents.ts` (same check on the document path), `scripts/repair-readings.ts` (new step), tests in `lib/units.test.ts`, `lib/uploads.test.ts`.

**Interfaces:** `export const PLAUSIBLE_MG_DL: Record<string, [number, number]> = { total_cholesterol: [50, 500], ldl_cholesterol: [10, 400], hdl_cholesterol: [5, 200], triglycerides: [10, 3000] }` and `export function implausible(code: string, value: number, unit: string | null): boolean` (true only when `unit` is null or mg/dL and the value is outside the range).

- [ ] **Step 1: Failing tests:** `implausible("total_cholesterol", 2.56, null)` true; `implausible("total_cholesterol", 177.4, "mg/dL")` false; `implausible("total_cholesterol", 4.6, "mmol/L")` false (converted elsewhere); `implausible("ferritin", 2, null)` false (not in the table). In `uploads.test.ts`: a batch with a total cholesterol 2.56 without unit is not inserted and appears in the skipped items with reason "looks like a ratio or a different unit".
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement.** Add the table and function; call it in `planInsert` and the document accept path before the duplicate checks. `repair-readings`: a new step, dry run by default, listing `readings` rows where `implausible(metric_code, value, unit)`; `--apply` deletes them in the same transaction style as the other steps.
- [ ] **Step 4: Run** tests and `pnpm repair:readings` (dry run, local DB). Expected: the 2022-10-20 total cholesterol row of the local case A account is listed. Report the listed count per user id only (no values in the report beyond that row).
- [ ] **Step 5: Stop and report.** Prod apply waits for the owner.

### Task 12 (43I): Speed from a short window

**Files:** `lib/signals.ts` (drift at ~411 and ~532: the rule text), `lib/api-contract.ts` (the `drift` line builder near 1395), tests in `lib/api-contract.test.ts`.

- [ ] **Step 1: Failing test:** a drift signal whose three draws span 2026-03-05 to 2026-08-18 (101, 114, 133 mg/dL) prints "LDL Cholesterol rose 32 mg/dL since Mar 2026." and no "a year". A drift over 2 years still prints the per-year line exactly as today.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement.** Put the first and last draw dates and values in the signal's `numbers` (`spanDays`, `first`, `firstDate`); in the line builder, when `spanDays < 365`, print `` `${nm} ${last > first ? "rose" : "fell"} ${fmt(Math.abs(last - first))}${u} since ${monthOf(firstDate)}.` ``. The engine's slope and every other use of `perYear` stay unchanged.
- [ ] **Step 4: Run** `pnpm test`. PASS.
- [ ] **Step 5: Stop and report.**

### Task 13 (43J): No blank placeholder under a note

**Files:** `components/what-to-do.tsx:137`, `components/what-to-do.test.tsx`.

- [ ] **Step 1: Failing test:** a card whose only line has `source: "note"` renders the note text and does not contain "Nothing has been written for this one yet". The existing empty-card test (line 130) still passes.
- [ ] **Step 2: Run, FAIL.** `pnpm test components/what-to-do.test.tsx`
- [ ] **Step 3: Implement.** Print the placeholder only when the card has no lines at all, notes included.
- [ ] **Step 4: Run.** PASS.
- [ ] **Step 5: Stop and report.**

## Final verification (main agent)

- `pnpm test`, `pnpm typecheck`, `pnpm eval:hunches`, `pnpm eval:journeys` (25/25), `pnpm eval:setup` (exit 0, hit rates recorded).
- iOS `xcodebuild test` green.
- Browser walk (browser-control, `127.0.0.1:3001`, fresh synthetic user): with a synthetic lab PDF and without; quit at question 3 and resume; reveal shows engine numbers.
- Re-run the timeline review (`timeline-a`, steps 2019, 2022, 2024) and confirm findings 2 to 5 and 8 are gone.
- Ask the owner before commit, deploy, and the prod `repair:readings --apply`.
