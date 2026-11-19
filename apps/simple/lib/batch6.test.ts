import { describe, expect, it } from "vitest";
import {
  asksBackfill,
  shortTitle,
  headlineOf,
  orderLines,
  pickPaper,
  sinceStarted,
  worseText,
  youLine,
  type ChangeLine,
  type PaperContext,
  type PaperPick,
} from "./changes";
import { adherenceOf, labDays, onProtocolAlready } from "./api-contract";
import type { MetricRow } from "./data";
import { interventionRows } from "./hkb-interventions";
import { SPARSE_TICKS } from "./projections";

/** Batch 6: the owner's 17 Nov draw. */
const line = (over: Partial<ChangeLine>): ChangeLine => ({
  kind: "since",
  code: "ldl_cholesterol",
  name: "LDL",
  unit: "mg/dL",
  text: "",
  better: true,
  same: false,
  itemId: "p1",
  logged: true,
  before: { value: 131, date: "2026-04-23" },
  after: { value: 104, date: "2026-11-17" },
  delta: -27,
  pct: -20.6,
  ...over,
});

describe("What changed, shorter and fair", () => {
  const lines = [
    line({
      code: "triglycerides",
      name: "Triglycerides",
      better: false,
      pct: 31.1,
    }),
    line({ code: "hba1c", name: "HbA1c", better: false, same: true, pct: 0 }),
    line({ code: "apo_b", name: "ApoB", pct: -9.2 }),
    line({ kind: "reached", code: "ldl_cholesterol", itemId: null, pct: null }),
    line({}),
    line({ kind: "reached", code: "apo_b", itemId: null, pct: null }),
  ];

  it("drops same lines; reached, then better by size, then worse", () => {
    expect(orderLines(lines).map((l) => `${l.kind}:${l.code}`)).toEqual([
      "reached:ldl_cholesterol",
      "reached:apo_b",
      "since:ldl_cholesterol",
      "since:apo_b",
      "since:triglycerides",
    ]);
  });

  it("keeps one worse line per marker", () => {
    const worse = (itemId: string) =>
      line({ code: "triglycerides", better: false, pct: 31.1, itemId });
    expect(orderLines([worse("a"), worse("b")])).toHaveLength(1);
  });

  it("asks for a retest on a worse line and blames no item", () => {
    const [c] = sinceStarted(
      [
        {
          id: "o",
          text: "Omega 3 2 g with dinner",
          metricCodes: ["triglycerides"],
          active: true,
          startedAt: "2026-10-05",
          createdAt: null,
        },
      ],
      [
        { code: "triglycerides", value: 106, date: "2026-04-23" },
        { code: "triglycerides", value: 139, date: "2026-11-17" },
      ],
    );
    expect(c?.better).toBe(false);
    const text = worseText(c!, "Triglycerides");
    expect(text).toBe(
      "Triglycerides 106 → 139. Retest before changing anything.",
    );
    expect(text).not.toMatch(/since|Omega/);
  });

  it("heads the screen with the best move and the goals reached", () => {
    expect(headlineOf(lines)).toBe("LDL 131 → 104 · 2 goals reached");
    expect(headlineOf(lines.filter((l) => l.kind !== "reached"))).toBe(
      "LDL 131 → 104",
    );
    expect(headlineOf([line({ kind: "reached", itemId: null })])).toBe(
      "1 goal reached",
    );
    expect(headlineOf([line({ better: false })])).not.toBeNull();
    expect(headlineOf([line({ better: false, same: true })])).toBeNull();
    expect(headlineOf([])).toBeNull();
  });
});

describe("pickPaper", () => {
  const ctx: PaperContext = {
    day: "2026-11-19",
    items: ["Psyllium husk 5 g with lunch and dinner", "Berberine 500 mg"],
    codes: new Set(["ldl_cholesterol"]),
    names: ["ldl cholesterol"],
    markersOf: (id) =>
      id === "ascvd_risk" ? ["ldl_cholesterol", "apo_b"] : [],
  };
  const at = (d: string) => new Date(`${d}T12:00:00`); // local noon
  const paper = (over: Partial<PaperPick>): PaperPick => ({
    id: "x",
    conditionId: "fatty_liver",
    grade: "B",
    moves: null,
    publishedAt: "2026-06-01",
    foundAt: at("2026-11-10"),
    seenAt: null,
    ...over,
  });

  it("ranks moves, then a match, then the newest; A to C only", () => {
    const rows = [
      paper({ id: "new", publishedAt: "2026-11-01" }),
      paper({ id: "match", conditionId: "topic:psyllium" }),
      paper({ id: "moves", moves: { conclusionId: "ascvd_risk" } }),
      paper({ id: "ungraded", grade: null, moves: { conclusionId: "x" } }),
      paper({ id: "d", grade: "D", moves: { conclusionId: "x" } }),
    ];
    expect(pickPaper(rows, ctx)?.id).toBe("moves");
    expect(
      pickPaper(
        rows.filter((r) => r.id !== "moves"),
        ctx,
      )?.id,
    ).toBe("match");
    expect(pickPaper(rows.slice(0, 1).concat(rows.slice(3)), ctx)?.id).toBe(
      "new",
    );
    expect(pickPaper(rows.slice(3), ctx)).toBeNull();
  });

  it("matches a condition through its markers", () => {
    const rows = [
      paper({ id: "new", publishedAt: "2026-11-01" }),
      paper({ id: "heart", conditionId: "ascvd_risk" }),
    ];
    expect(pickPaper(rows, ctx)?.id).toBe("heart");
  });

  it("puts unseen before seen, and holds the pick for the day", () => {
    const rows = [
      paper({
        id: "seen",
        moves: { conclusionId: "a" },
        seenAt: at("2026-11-12"),
      }),
      paper({ id: "fresh" }),
    ];
    expect(pickPaper(rows, ctx)?.id).toBe("fresh");
    // opened today: still today's paper
    const opened = [rows[0]!, paper({ id: "fresh", seenAt: at("2026-11-19") })];
    expect(pickPaper(opened, ctx)?.id).toBe("fresh");
    // filed during the day: waits for tomorrow while an older one qualifies
    const late = [
      ...rows,
      paper({
        id: "late",
        moves: { conclusionId: "a" },
        foundAt: new Date("2026-11-19T15:00:00"),
      }),
    ];
    expect(pickPaper(late, ctx)?.id).toBe("fresh");
    expect(pickPaper(late, { ...ctx, day: "2026-11-20" })?.id).toBe("late");
  });

  it("on a first day, a later arrival does not replace the morning pick", () => {
    const morning = paper({ id: "m", foundAt: new Date("2026-11-19T08:00:00") });
    const better = paper({
      id: "b",
      moves: { conclusionId: "a" },
      foundAt: new Date("2026-11-19T15:00:00"),
    });
    expect(pickPaper([morning], ctx)?.id).toBe("m");
    expect(pickPaper([morning, better], ctx)?.id).toBe("m");
  });

  it("says the person's own value for the marker the paper moves", () => {
    const latest = new Map([["ldl_cholesterol", { name: "LDL", value: 104 }]]);
    expect(youLine(["apo_b", "ldl_cholesterol"], latest)).toBe("You: LDL 104");
    expect(youLine(["apo_b"], latest)).toBeNull();
  });
});

describe("plan rows: sparse ticks are not logged", () => {
  const strip = (n: number) =>
    Array.from({ length: 30 }, (_, i) => (i < n ? 1 : 0));

  it("is null under SPARSE_TICKS and a fraction from it", () => {
    expect(adherenceOf({ adherence30: 10, strip30: strip(3) })).toBeNull();
    expect(
      adherenceOf({ adherence30: 20, strip30: strip(SPARSE_TICKS - 1) }),
    ).toBeNull();
    expect(adherenceOf({ adherence30: 23, strip30: strip(SPARSE_TICKS) })).toBe(
      0.23,
    );
  });

  it("reads lab draw days, not phone rows", () => {
    const rows = [
      {
        code: "ldl_cholesterol",
        rows: [
          { observedAt: "2026-04-23T08:00:00Z", value: 131, source: null },
          { observedAt: "2026-11-17T08:00:00Z", value: 104, source: null },
        ],
      },
      {
        code: "steps",
        rows: [
          {
            observedAt: "2026-11-18T00:00:00Z",
            value: 9000,
            source: "healthkit",
          },
        ],
      },
    ] as unknown as MetricRow[];
    expect(labDays(rows)).toEqual(["2026-04-23", "2026-11-17"]);
  });
});

describe("suggestions skip what is already on the plan", () => {
  const seed = interventionRows();
  const active = [
    "Psyllium husk 5 g with lunch and dinner",
    "Berberine 500 mg twice daily",
  ];

  it("matches the same intervention under other words", () => {
    expect(onProtocolAlready("Psyllium fibre supplement", active, seed)).toBe(
      true,
    );
    expect(onProtocolAlready("Berberine for LDL", active, seed)).toBe(true);
  });

  it("matches the same short title and the adopted line", () => {
    expect(onProtocolAlready("Psyllium husk, 10 g a day", active, [])).toBe(
      true,
    );
    expect(onProtocolAlready("Berberine 500 mg", active, [])).toBe(true);
  });

  it("keeps a new action", () => {
    expect(
      onProtocolAlready("Walk 30 minutes after dinner", active, seed),
    ).toBe(false);
    expect(onProtocolAlready("Vitamin D3 4000 IU", active, seed)).toBe(false);
  });
});

describe("asksBackfill: one rule for Home and Plan", () => {
  const d = (day: string, done = true) => ({ day, done });
  it("asks when ticks are sparse and days are empty", () => {
    expect(asksBackfill("2026-11-01", "2026-11-17", [d("2026-11-03")], 7)).toBe(true);
  });
  it("stops asking once every day up to the draw has a row", () => {
    const rows = ["14", "15", "16", "17"].map((x) => d(`2026-11-${x}`));
    expect(asksBackfill("2026-11-14", "2026-11-17", rows, 7)).toBe(false);
  });
  it("a day logged as not done counts as filled", () => {
    const rows = [d("2026-11-14"), d("2026-11-15", false), d("2026-11-16"), d("2026-11-17", false)];
    expect(asksBackfill("2026-11-14", "2026-11-17", rows, 7)).toBe(false);
  });
  it("does not ask once ticks reach the sparse line", () => {
    const rows = Array.from({ length: 7 }, (_, i) => d(`2026-11-0${i + 1}`));
    expect(asksBackfill("2026-11-01", "2026-11-17", rows, 7)).toBe(false);
  });
  it("ticks before the start do not count", () => {
    const rows = Array.from({ length: 7 }, (_, i) => d(`2026-10-0${i + 1}`));
    expect(asksBackfill("2026-11-01", "2026-11-17", rows, 7)).toBe(true);
  });
});

describe("shortTitle keeps a number that is part of the name", () => {
  it.each([
    ["Omega 3 2 g with dinner", "Omega 3"],
    ["Omega 3", "Omega 3"],
    ["Vitamin D3 2000 IU", "Vitamin D3"],
    ["Walk 30 min after dinner", "Walk"],
    ["Psyllium husk 5 g with lunch and dinner", "Psyllium husk"],
    ["Berberine 500 mg twice daily", "Berberine"],
    ["Creatine 5 g", "Creatine"],
  ])("%s → %s", (text, short) => expect(shortTitle(text)).toBe(short));
});
