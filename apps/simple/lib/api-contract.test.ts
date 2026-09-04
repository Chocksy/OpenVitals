import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  markerWord,
  seriesOf,
  wordOf,
  writerOf,
} from "./api-contract";
import {
  firstMoveSentence,
  goalsSentence,
  inWords,
  targetSaid,
} from "./home-data";

/**
 * The lock on the contract in `docs/plans/2026-09-03-phase32-useful-spec.md`
 * section 6.
 *
 * `apps/ios` decodes `apps/simple/fixtures/api/*.json` with `Codable` structs,
 * so a field this side renames or drops is a crash on the phone rather than a
 * failing test — unless it is checked here. Every fixture is a real body,
 * written by `scripts/p32a-fixtures.ts` from the local database through the
 * same functions the routes call.
 *
 * The rules the spec states, and this file enforces: dates are `YYYY-MM-DD`,
 * times are `HH:MM`, numbers are numbers, every number carries its unit, and
 * every estimate carries `estimated: true`.
 */
const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/api",
);

const load = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(DIR, `${name}.json`), "utf8"));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A number, or null. Never a string that happens to look like one. */
const num = (v: unknown) => v == null || typeof v === "number";
const str = (v: unknown) => v == null || typeof v === "string";

/** Every leaf of a body, so "a number is a number" can be checked everywhere. */
function leaves(value: unknown, at = ""): [string, unknown][] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => leaves(v, `${at}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, at ? `${at}.${k}` : k),
    );
  return [[at, value]];
}

describe("the fixtures exist and carry no secret", () => {
  const NAMES = [
    "today",
    "body",
    "plan-today",
    "markers",
    "meals",
    "research",
    "research-topics",
    "research-topic",
    "genome",
  ];

  for (const name of NAMES)
    it(`has fixtures/api/${name}.json`, () => {
      expect(() => load(name)).not.toThrow();
    });

  it("names no email, no session and no user id", () => {
    for (const name of NAMES) {
      const raw = readFileSync(path.join(DIR, `${name}.json`), "utf8");
      expect(raw, name).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
      // A key, not a substring: `HKCategoryTypeIdentifierMindfulSession` is a
      // HealthKit identifier and not somebody's session.
      expect(raw, name).not.toMatch(
        /"(userId|user_id|token|sessionToken|session_token|secret|apiKey)"/i,
      );
    }
  });
});

describe("GET /api/today", () => {
  const b = load("today") as Record<string, never>;

  it("leads with the sentence and its tone", () => {
    const s = b.sentence as Record<string, unknown>;
    expect(typeof s.head).toBe("string");
    expect(typeof s.tail).toBe("string");
    expect(["ok", "warn", "bad", "none"]).toContain(s.tone);
  });

  it("counts the three status numbers and dates the draw", () => {
    const s = b.status as Record<string, unknown>;
    for (const k of ["off", "borderline", "optimal"])
      expect(typeof s[k], k).toBe("number");
    expect(str(s.drawDate)).toBe(true);
    if (s.drawDate) expect(s.drawDate as string).toMatch(DAY);
    if (s.since) expect(s.since as string).toMatch(DAY);
  });

  it("gives Body a number, its unit and a line naming the day or the source", () => {
    const body = b.body as Record<string, unknown>;
    expect(str(body.headline)).toBe(true);
    expect(str(body.unit)).toBe(true);
    expect(typeof body.line).toBe("string");
    // A number with no unit is a number nobody can read, and the line is
    // never left empty when there is a headline to explain.
    if (body.headline != null) {
      expect(body.unit, "a Body headline with no unit").not.toBeNull();
      expect(String(body.line).length).toBeGreaterThan(0);
    }
  });

  it("names what the person is moving, and says so in the sentence", () => {
    const goals = b.goals as Record<string, unknown>[];
    expect(Array.isArray(goals)).toBe(true);
    const s = b.sentence as Record<string, unknown>;
    /* No goal on file: the sentence names the loudest system, never "sick". */
    if (!goals.length) {
      expect(String(s.head)).not.toMatch(/\bsick\b/i);
      expect(String(s.head)).toMatch(/is the one to move first$|^All quiet$/);
      return;
    }
    expect(String(s.head)).toMatch(/you are moving:$/);
    for (const g of goals) {
      expect(typeof g.code).toBe("string");
      expect(typeof g.name).toBe("string");
      expect(num(g.value), String(g.name)).toBe(true);
      expect(str(g.unit)).toBe(true);
      const t = g.target as Record<string, unknown>;
      expect(num(t.low)).toBe(true);
      expect(num(t.high)).toBe(true);
      expect(str(t.due)).toBe(true);
      if (t.due) expect(t.due as string).toMatch(DAY);
      /* a goal with no number to reach is a planned draw, not a goal */
      expect(t.low ?? t.high, `${String(g.name)} has no target`).not.toBeNull();
      expect(num(g.toGo), String(g.name)).toBe(true);
      /* never measured, so nothing to close */
      if (g.value == null) expect(g.toGo).toBeNull();
      expect([true, false, null]).toContain(g.onPace);
      expect(str(g.paceLine)).toBe(true);
      /* a pace with no sentence behind it is a number nobody can check */
      if (g.onPace != null && g.toGo !== 0)
        expect(g.paceLine, String(g.name)).not.toBeNull();
      for (const m of g.moves as Record<string, unknown>[]) {
        expect(typeof m.title).toBe("string");
        expect(typeof m.done).toBe("boolean");
      }
    }
  });

  it("counts the plan and keeps the sentence beside it", () => {
    const plan = b.plan as Record<string, unknown>;
    // "0 / 4": a client can add this up; a title is not a count.
    expect(String(plan.headline)).toMatch(/^\d+ \/ \d+$/);
    expect(typeof plan.todo).toBe("number");
    expect(str(plan.next)).toBe(true);
    const [done, total] = String(plan.headline).split(" / ").map(Number);
    expect(plan.todo).toBe(total! - done!);
    // Nothing left to do means nothing to name next.
    if (plan.todo === 0) expect(plan.next).toBeNull();
    else expect(plan.next).not.toBeNull();
  });

  it("gives Blood a count out of a total, and a draw or null", () => {
    const blood = b.blood as Record<string, unknown>;
    expect(typeof blood.off).toBe("number");
    expect(typeof blood.total).toBe("number");
    const draw = blood.nextDraw as Record<string, unknown> | null;
    if (draw) {
      expect(num(draw.weeks)).toBe(true);
      for (const c of draw.codes as Record<string, unknown>[]) {
        expect(typeof c.code).toBe("string");
        expect(typeof c.name).toBe("string");
      }
    }
  });

  it("gives every system a word, and a number that is a number", () => {
    const systems = b.systems as Record<string, unknown>[];
    expect(systems.length).toBeGreaterThan(0);
    for (const s of systems) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.name).toBe("string");
      expect(["off", "borderline", "good", "never measured"]).toContain(s.word);
      expect(num(s.value), String(s.name)).toBe(true);
      expect(str(s.unit)).toBe(true);
      expect(str(s.marker)).toBe(true);
      // a number with no unit is a number nobody can read
      if (s.value != null && s.unit == null)
        expect(s.marker, `${s.name} has a value and no unit`).not.toBeNull();
    }
  });
});

describe("GET /api/body", () => {
  const b = load("body") as Record<string, never>;

  it("is dated and says when a phone last wrote", () => {
    expect(b.day as string).toMatch(DAY);
    const s = b.synced as Record<string, unknown>;
    expect(typeof s.types).toBe("number");
    expect(str(s.lastAt)).toBe(true);
    // The newest write from any phone, not this day's, so a day the phone did
    // not touch still knows when it last did.
    if (s.types) expect(s.lastAt, "types synced but no lastAt").not.toBeNull();
    if (s.lastAt)
      expect(new Date(s.lastAt as string).toISOString()).toBe(s.lastAt);
  });

  it("gives every row a number, its unit and the words beside it", () => {
    const rows = b.rows as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      for (const k of [
        "type",
        "name",
        "identifier",
        "source",
        "unit",
        "display",
        "note",
        "word",
        "when",
      ])
        expect(typeof r[k], `${String(r.type)}.${k}`).toBe("string");
      expect(num(r.value), String(r.type)).toBe(true);
      if (r.when) expect(r.when as string).toMatch(DAY);
      // Who wrote it, never the pipeline that carried it, and never blank.
      expect(String(r.source).length, `${String(r.type)} has no writer`)
        .toBeGreaterThan(0);
      expect(r.source, `${String(r.type)} names the pipeline`).not.toBe(
        "healthkit",
      );
      // Every row gets one of the four words; an empty string makes a client
      // invent the meaning.
      expect(
        ["off", "borderline", "good", "never measured"],
        `${String(r.type)} word`,
      ).toContain(r.word);
      if (r.value == null) expect(r.word).toBe("never measured");
      else expect(r.word).not.toBe("never measured");
    }
  });
});

describe("GET /api/plan/today", () => {
  const b = load("plan-today") as Record<string, never>;

  it("counts what is done out of what is due", () => {
    expect(b.day as string).toMatch(DAY);
    expect(typeof b.done).toBe("number");
    expect(typeof b.total).toBe("number");
    expect(b.done as number).toBeLessThanOrEqual(b.total as number);
    expect((b.rows as unknown[]).length).toBe(b.total);
  });

  it("tags every row and gives a suggestion no item id", () => {
    for (const r of b.rows as Record<string, unknown>[]) {
      expect(["protocol", "goal", "every day", "suggested"]).toContain(r.tag);
      expect(typeof r.title).toBe("string");
      expect(typeof r.why).toBe("string");
      expect(typeof r.done).toBe("boolean");
      expect(num(r.adherence)).toBe(true);
      expect(str(r.itemId)).toBe(true);
      expect(str(r.slot)).toBe(true);
      if (r.time) expect(r.time as string).toMatch(CLOCK);
      // a suggestion has not been adopted, so there is nothing to tick
      if (r.tag === "suggested") expect(r.itemId).toBeNull();
      else expect(r.itemId).not.toBeNull();
    }
  });
});

describe("GET /api/meals", () => {
  const b = load("meals") as Record<string, never>;

  it("is dated and totals the day", () => {
    expect(b.day as string).toMatch(DAY);
    const t = b.totals as Record<string, unknown>;
    for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"])
      expect(num(t[k]), k).toBe(true);
    expect(t.estimated).toBe(true);
  });

  it("labels every number on every meal an estimate", () => {
    for (const m of b.meals as Record<string, never>[]) {
      expect(typeof m.id).toBe("string");
      expect(str(m.time)).toBe(true);
      if (m.time) expect(m.time as string).toMatch(CLOCK);
      expect(str(m.photo)).toBe(true);
      expect(typeof m.label).toBe("string");
      for (const i of m.items as Record<string, unknown>[]) {
        expect(typeof i.name).toBe("string");
        expect(typeof i.portion).toBe("string");
        for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"])
          expect(num(i[k]), `${String(i.name)}.${k}`).toBe(true);
        expect(i.estimated, String(i.name)).toBe(true);
      }
      expect((m.totals as Record<string, unknown>).estimated).toBe(true);
      for (const mv of m.moves as Record<string, unknown>[]) {
        expect(typeof mv.what).toBe("string");
        expect(typeof mv.line).toBe("string");
      }
    }
  });

  it("never uses the camelCase names the database uses inside", () => {
    const raw = readFileSync(path.join(DIR, "meals.json"), "utf8");
    expect(raw).not.toMatch(/"proteinG"|"carbsG"|"fatG"/);
  });
});

describe("GET /api/markers", () => {
  const b = load("markers") as Record<string, never>;

  it("says how much history each series carries", () => {
    expect(typeof b.days).toBe("number");
    expect(b.days as number).toBeGreaterThan(0);
  });

  it("gives every marker its number, its unit, its day and its word", () => {
    const rows = b.markers as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(typeof m.code).toBe("string");
      expect(typeof m.name).toBe("string");
      expect(typeof m.system).toBe("string");
      expect(num(m.value), String(m.code)).toBe(true);
      expect(str(m.unit)).toBe(true);
      expect(m.date as string).toMatch(DAY);
      expect(
        ["off", "borderline", "optimal", "no band", "never measured"],
        String(m.code),
      ).toContain(m.word);
      for (const k of ["band", "optimal"]) {
        const band = m[k] as Record<string, unknown>;
        expect(num(band.low), `${String(m.code)}.${k}.low`).toBe(true);
        expect(num(band.high), `${String(m.code)}.${k}.high`).toBe(true);
      }
    }
  });

  it("dates every point of every series, oldest first", () => {
    for (const m of b.markers as Record<string, unknown>[]) {
      const series = m.series as { date: string; value: number }[];
      expect(Array.isArray(series), String(m.code)).toBe(true);
      let last = "";
      for (const p of series) {
        expect(p.date, String(m.code)).toMatch(DAY);
        expect(typeof p.value, `${String(m.code)} ${p.date}`).toBe("number");
        expect(p.date >= last, `${String(m.code)} out of order`).toBe(true);
        last = p.date;
      }
      /* a marker with a value has the draw that produced it in its series */
      if (m.value != null && series.length)
        expect(series[series.length - 1]!.date).toBe(m.date);
    }
  });

  it("keeps every system's rows together, the way the Markers tab groups them", () => {
    const seen = new Set<string>();
    let current = "";
    for (const m of b.markers as Record<string, unknown>[]) {
      const system = String(m.system);
      if (system === current) continue;
      expect(seen.has(system), `${system} appears twice`).toBe(false);
      seen.add(system);
      current = system;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("carries the goal a marker is aimed at, or null", () => {
    for (const m of b.markers as Record<string, unknown>[]) {
      const g = m.goal as Record<string, unknown> | null;
      if (!g) continue;
      expect(num(g.low)).toBe(true);
      expect(num(g.high)).toBe(true);
      expect(str(g.due)).toBe(true);
      if (g.due) expect(g.due as string).toMatch(DAY);
    }
  });
});

describe("GET /api/research", () => {
  const b = load("research") as Record<string, never>;

  it("is a list of rows", () => {
    expect(Array.isArray(b.rows)).toBe(true);
  });

  it("dates every paper and says what it moves, or says nothing", () => {
    for (const r of b.rows as Record<string, never>[]) {
      expect(typeof r.title).toBe("string");
      expect(typeof r.conditionId).toBe("string");
      expect(str(r.journal)).toBe(true);
      expect(str(r.url)).toBe(true);
      expect(str(r.finding)).toBe(true);
      if (r.publishedAt) expect(r.publishedAt as string).toMatch(DAY);
      if (r.grade) expect(["A", "B", "C", "D", "E"]).toContain(r.grade);
      /**
       * Phase 34 section 3. A row is written the moment the search names the
       * paper; the grade and the finding are filled in afterwards. `read` is
       * the difference, so a phone can say "found, not read yet" instead of
       * printing a title with nothing under it.
       */
      expect(typeof r.read, String(r.title)).toBe("boolean");
      expect(r.read).toBe(r.grade != null || r.finding != null);
      const m = r.moves as Record<string, unknown> | null;
      // null is the answer most of the time, and it is printed as plainly as
      // the others: "nothing for you".
      if (m) {
        expect(typeof m.conclusionId).toBe("string");
        expect(typeof m.name).toBe("string");
        expect(["up", "down", "none"]).toContain(m.direction);
        expect(typeof m.delta).toBe("number");
      }
    }
  });
});

describe("GET /api/genome", () => {
  const b = load("genome") as Record<string, never>;

  it("names the file and the day it was read, or neither", () => {
    const f = b.file as Record<string, unknown> | null;
    if (f) {
      expect(typeof f.name).toBe("string");
      expect(f.readAt as string).toMatch(DAY);
    }
  });

  it("gives every verdict a direction, a grade and a reason", () => {
    for (const v of b.verdicts as Record<string, unknown>[]) {
      expect(typeof v.conditionId).toBe("string");
      expect(typeof v.name).toBe("string");
      expect(["up", "down", "none"]).toContain(v.direction);
      expect(num(v.factor), String(v.name)).toBe(true);
      expect(["A", "B", "C", "D", "E"]).toContain(v.grade);
      expect(typeof v.reason).toBe("string");
      expect(typeof v.testNeeded).toBe("boolean");
      expect(typeof v.absent).toBe("boolean");
    }
  });

  it("gives every gene its rsids and whether it moved", () => {
    for (const g of b.genes as Record<string, unknown>[]) {
      expect(typeof g.verdict).toBe("string");
      expect(typeof g.gene).toBe("string");
      expect(str(g.call)).toBe(true);
      expect(["A", "B", "C", "D", "E"]).toContain(g.grade);
      expect(typeof g.moved).toBe("boolean");
      expect(typeof g.source).toBe("string");
      expect(Array.isArray(g.rsids)).toBe(true);
      for (const r of g.rsids as unknown[]) expect(typeof r).toBe("string");
    }
  });
});

describe("no body smuggles a number as a string", () => {
  /**
   * The one rule a `Codable` struct cannot recover from. A count that arrives
   * as `"6"` decodes into a `String` field on the phone and every arithmetic
   * downstream is wrong; drizzle's `numeric` columns come back as strings, so
   * this is a real way to break the contract by accident.
   */
  // `done` is deliberately not in this list: it is a count at the top of
  // `/api/plan/today` and a boolean on every row under it, and the two are
  // both checked by name in their own blocks above.
  const NUMERIC =
    /^(off|borderline|optimal|total|delta|kcal|protein_g|carbs_g|fat_g|weeks|adherence|factor|value|types|low|high|toGo|days|progress)$/;

  for (const name of [
    "today",
    "body",
    "plan-today",
    "markers",
    "meals",
    "research",
    "research-topics",
    "research-topic",
    "genome",
  ])
    it(`${name}.json`, () => {
      for (const [at, v] of leaves(load(name))) {
        const key = at
          .split(".")
          .pop()!
          .replace(/\[\d+\]$/, "");
        if (!NUMERIC.test(key)) continue;
        expect(
          typeof v === "number" || v === null,
          `${name}: ${at} = ${String(v)}`,
        ).toBe(true);
      }
    });
});

describe("who wrote a row, and the word it wears", () => {
  it("never prints the pipeline, and falls back to the plain word", () => {
    expect(writerOf(null)).toBe("phone");
    expect(writerOf("")).toBe("phone");
    expect(writerOf("   ")).toBe("phone");
    // "healthkit" is the pipeline that carried it, not who wrote it.
    expect(writerOf("healthkit")).toBe("phone");
  });

  it("names the Apple Health family once, however Apple keyed the device", () => {
    expect(writerOf("com.apple.health")).toBe("Apple Health");
    expect(writerOf("com.apple.health.6C0B4A2E")).toBe("Apple Health");
  });

  it("keeps any other writer verbatim", () => {
    expect(writerOf("com.dexcom.g7")).toBe("com.dexcom.g7");
  });

  it("gives every row with a value one of the four words", () => {
    expect(wordOf("red", true)).toBe("off");
    expect(wordOf("amber", true)).toBe("borderline");
    expect(wordOf("green", true)).toBe("good");
    // A type with no band to judge it by is still good, never blank.
    expect(wordOf("gray", true)).toBe("good");
  });

  it("says never measured, and only then", () => {
    for (const s of ["red", "amber", "green", "gray"] as const)
      expect(wordOf(s, false)).toBe("never measured");
  });
});

describe("what a goal reads like, and what the sentence says", () => {
  const goal = (name: string, low: number | null, high: number | null) => ({
    name,
    target: { low, high, due: null },
  });

  it("prints a band, a ceiling and a number to reach", () => {
    expect(targetSaid(70, 100)).toBe("70–100");
    expect(targetSaid(null, 100)).toBe("under 100");
    expect(targetSaid(45, null)).toBe("to 45");
    expect(targetSaid(null, null)).toBe("");
  });

  it("counts in words a person hears, and in digits past that", () => {
    expect(inWords(0)).toBe("no");
    expect(inWords(3)).toBe("three");
    expect(inWords(12)).toBe("twelve");
    expect(inWords(13)).toBe("13");
  });

  it("names what is being moved, and how much of today is done", () => {
    const said = goalsSentence(
      [
        goal("TPO antibodies", null, 100),
        goal("LDL cholesterol", 70, 100),
        goal("Vitamin D", 45, null),
      ],
      { done: 2, total: 7 },
    );
    expect(said).toEqual({
      head: "Three things you are moving:",
      tail:
        "TPO antibodies under 100, LDL cholesterol 70–100, Vitamin D to 45." +
        " Two of seven done today.",
    });
  });

  it("says none, never 'no', when the day has not started", () => {
    expect(goalsSentence([goal("Ferritin", 45, null)], { done: 0, total: 4 }))
      .toEqual({
        head: "One thing you are moving:",
        tail: "Ferritin to 45. None of four done today.",
      });
  });

  it("names three and counts the rest", () => {
    const said = goalsSentence(
      Array.from({ length: 7 }, (_, i) => goal(`M${i}`, null, i)),
      { done: 1, total: 1 },
    );
    expect(said!.head).toBe("Seven things you are moving:");
    expect(said!.tail).toContain(", and four more.");
  });

  it("drops the tick count when nothing is due today", () => {
    expect(
      goalsSentence([goal("Ferritin", 45, null)], { done: 0, total: 0 })!.tail,
    ).toBe("Ferritin to 45.");
  });

  it("has nothing to say with no goal on file", () => {
    expect(goalsSentence([], { done: 0, total: 3 })).toBeNull();
  });
});

describe("the sentence when there is no goal", () => {
  const system = (
    id: string,
    name: string,
    score: number,
    worst?: { code: string; value: number | null; unit: string | null; status: string },
  ) => ({ id, name, score, ...(worst ? { worst } : {}) }) as never;

  it("names the loudest system, and never says sick", () => {
    const said = firstMoveSentence([
      system("liver", "Liver", 0.9, {
        code: "alt",
        value: 42,
        unit: "U/L",
        status: "amber",
      }),
      system("thyroid", "Thyroid", 0.4, {
        code: "tpo_antibodies",
        value: 320,
        unit: "IU/mL",
        status: "red",
      }),
    ]);
    expect(said).toEqual({
      head: "Thyroid is the one to move first",
      tail: "",
      tone: "bad",
    });
  });

  it("breaks a tie on the graph's own score", () => {
    expect(
      firstMoveSentence([
        system("liver", "Liver", 0.2, {
          code: "alt",
          value: 42,
          unit: "U/L",
          status: "red",
        }),
        system("lipids", "Lipids", 0.8, {
          code: "ldl_cholesterol",
          value: 131,
          unit: "mg/dL",
          status: "red",
        }),
      ]).head,
    ).toBe("Lipids is the one to move first");
  });

  it("says all quiet when nothing was ever measured", () => {
    expect(firstMoveSentence([system("liver", "Liver", 0)])).toEqual({
      head: "All quiet",
      tail: "",
      tone: "none",
    });
  });
});

describe("the word a marker row wears on the Blood tab", () => {
  it("uses Blood's own words, not the Body page's", () => {
    expect(markerWord("red", true)).toBe("off");
    expect(markerWord("amber", true)).toBe("borderline");
    expect(markerWord("green", true)).toBe("optimal");
  });

  it("tells a number nothing can judge from no number at all", () => {
    expect(markerWord("gray", true)).toBe("no band");
    expect(markerWord("gray", false)).toBe("never measured");
  });
});

describe("how much history one series carries", () => {
  const points = [
    { date: "2024-01-01", value: 1 },
    { date: "2025-06-01", value: 2 },
    { date: "2025-08-01", value: 3 },
  ];

  it("counts back from the marker's own newest reading, not from today", () => {
    expect(seriesOf(points, 365)).toEqual(points.slice(1));
  });

  it("keeps a marker with one old draw rather than emptying it", () => {
    expect(seriesOf([points[0]!], 30)).toEqual([points[0]]);
  });

  it("has nothing to trim when there is nothing on file", () => {
    expect(seriesOf([], 365)).toEqual([]);
  });
});

/* ── GET /api/research/topics ─────────────────────────────────────────── */

describe("GET /api/research/topics", () => {
  const b = load("research-topics") as Record<string, never>;

  it("is a list of topics, each with its origin and its counts", () => {
    expect(Array.isArray(b.topics)).toBe(true);
    for (const t of b.topics as Record<string, never>[]) {
      expect(typeof t.topic).toBe("string");
      // the key is normalised; the label is whatever was typed
      expect(t.topic as string).toBe((t.topic as string).toLowerCase());
      expect(typeof t.label).toBe("string");
      expect(["adopted", "goal", "asked", "typed"]).toContain(t.origin);
      expect(typeof t.relevance).toBe("string");
      expect(typeof t.outcomes).toBe("number");
      expect(typeof t.papers).toBe("number");
      expect(typeof t.found).toBe("number");
      if (t.lastRunAt) expect(t.lastRunAt as string).toMatch(DAY);
    }
  });

  it("never claims an outcome for a topic nothing has read", () => {
    for (const t of b.topics as Record<string, never>[])
      if ((t.papers as unknown as number) === 0)
        expect(t.outcomes as unknown as number).toBe(0);
  });
});

describe("GET /api/research/topics/[topic]", () => {
  const b = load("research-topic") as Record<string, never>;

  it("leads with the topic, its label and why it is on file", () => {
    expect(typeof b.topic).toBe("string");
    expect(typeof b.label).toBe("string");
    expect(typeof b.relevance).toBe("string");
    if (b.lastRunAt) expect(b.lastRunAt as string).toMatch(DAY);
    expect(Array.isArray(b.forYou)).toBe(true);
  });

  it("grades every verdict and says whether it is good, bad or neither", () => {
    for (const v of b.verdicts as Record<string, never>[]) {
      expect(typeof v.outcomeText).toBe("string");
      expect(str(v.outcomeFeatureId)).toBe(true);
      expect(["up", "down", "none"]).toContain(v.direction);
      expect(["on", "off", "none"]).toContain(v.tone);
      expect(["A", "B", "C", "D", "E"]).toContain(v.grade);
      expect(typeof v.trials).toBe("number");
      expect(typeof v.association).toBe("boolean");
      expect(str(v.doseRange)).toBe(true);
    }
  });

  /**
   * The whole point of the split. A trial can say one thing caused another; a
   * survey cannot, and it says so on its own row rather than in a footnote.
   */
  it("keeps the trials and the associations apart, and labels them", () => {
    for (const f of b.trials as Record<string, never>[]) {
      expect(f.association).toBe(false);
      expect(["meta", "guideline", "rct"]).toContain(f.studyType);
    }
    for (const f of b.associations as Record<string, never>[]) {
      expect(f.association).toBe(true);
      expect(["meta", "guideline", "rct"]).not.toContain(f.studyType);
    }
  });

  it("carries the outcome in the abstract's own words, and the quote", () => {
    for (const f of [
      ...(b.trials as Record<string, never>[]),
      ...(b.associations as Record<string, never>[]),
    ]) {
      expect(typeof f.outcomeText).toBe("string");
      expect((f.outcomeText as string).length).toBeGreaterThan(0);
      expect(typeof f.quote).toBe("string");
      expect(typeof f.design).toBe("string");
      expect(["A", "B", "C", "D", "E"]).toContain(f.grade);
      expect(num(f.n)).toBe(true);
      const p = f.paper as Record<string, unknown> | null;
      if (p) {
        expect(typeof p.title).toBe("string");
        expect(num(p.year)).toBe(true);
      }
    }
  });

  it("prints the topic's label on every paper row it carries", () => {
    for (const p of b.papers as Record<string, never>[]) {
      expect((p.conditionId as string).startsWith("topic:")).toBe(true);
      expect(typeof p.conditionName).toBe("string");
      expect(typeof p.read).toBe("boolean");
      expect(p.read).toBe(p.grade != null || p.finding != null);
    }
  });
});
