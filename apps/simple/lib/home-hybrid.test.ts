import { describe, expect, it } from "vitest";
import type { HeadingRow, TodayBody, TodayGoal } from "./api-contract";
import type { MetricRow } from "./data";
import today from "../fixtures/api/today.json";
import {
  goalHero,
  headingSentence,
  markerLane,
  longLanding,
  monthsBefore,
  monthsBetween,
  rowState,
  todayLines,
} from "./home-hybrid";

/** Phase 40b: every sentence the Hybrid Home prints (`53-web.html`). */

const row = (name: string, word: HeadingRow["word"]): HeadingRow => ({
  id: name.toLowerCase(),
  name,
  word,
  why: "",
});

describe("headingSentence", () => {
  it("counts the words and names the systems moving away", () => {
    const s = headingSentence([
      row("Lipids", "away"),
      row("Iron", "away"),
      row("Liver", "toward"),
      row("Kidneys", "holding"),
      row("Thyroid", "unmeasured"),
    ]);
    expect(s.lead + s.away + s.rest).toBe(
      "Two systems heading away, one toward, one holding.",
    );
    expect(s.sub).toBe(
      "Lipids and Iron are moving away from your own history. One system has no recent readings, so it counts as unknown, not fine.",
    );
  });

  it("says so when nothing moves away", () => {
    const s = headingSentence([row("Liver", "holding")]);
    expect(s.lead).toBe("No systems heading ");
    expect(s.sub).toBe("Nothing is moving away from your own history.");
  });
});

describe("longLanding", () => {
  const series = [
    { date: "2022-01-01", value: 100 },
    { date: "2023-01-01", value: 110 },
    { date: "2024-01-01", value: 120 },
  ];

  it("reads the five-year line on the due date", () => {
    const l = longLanding(series, "2024-06-01", "2025-01-01")!;
    expect(l.perYear).toBeCloseTo(10, 0);
    expect(l.value).toBeCloseTo(130, 0);
    expect(l.date).toBe("2025-01-01");
  });

  it("needs three draws and a due date", () => {
    expect(longLanding(series.slice(1), "2024-06-01", "2025-01-01")).toBeNull();
    expect(longLanding(series, "2024-06-01", null)).toBeNull();
  });

  it("drops draws older than five years", () => {
    expect(
      longLanding(
        [{ date: "2015-01-01", value: 1 }, ...series.slice(1)],
        "2024-06-01",
        "2025-01-01",
      ),
    ).toBeNull();
  });
});

describe("months", () => {
  it("counts whole months and steps back", () => {
    expect(monthsBetween("2024-11-20", "2026-09-26")).toBe(22);
    expect(monthsBefore("2026-09-26", 60)).toBe("2021-09-26");
  });
});

describe("todayLines", () => {
  it("prints the four rows from the score", () => {
    const lines = todayLines({
      ...(today as unknown as TodayBody).score,
      input: {
        sleepHours: 7.5,
        moves: { done: 1, due: 3 },
        kcal: 1840,
        proteinG: 96,
        targets: { kcal: 2400, proteinG: 140 },
        blood: null,
        genes: null,
      },
    });
    expect(lines.map((l) => l.said)).toEqual([
      "7h 30 · aim 7 to 9 h",
      "1 of 3 ticked",
      "1 840 of 2 400 kcal",
      "96 of 140 g",
    ]);
    for (const l of lines) {
      expect(l.pct).toBeGreaterThanOrEqual(0);
      expect(l.pct).toBeLessThanOrEqual(100);
    }
  });
});

describe("rowState", () => {
  it("names the state and what comes next", () => {
    expect(
      rowState({
        kind: "gap",
        state: "open",
        action: { kind: "book", label: "" },
      }),
    ).toEqual({
      word: "open",
      next: "1 test",
      tone: "",
    });
    expect(
      rowState({
        kind: "step",
        state: "testing",
        action: { kind: "result", label: "" },
      }).word,
    ).toBe("testing");
    expect(
      rowState({
        kind: "good_news",
        state: "open",
        action: { kind: "got_it", label: "" },
      }).word,
    ).toBe("good news");
  });
});

describe("goalHero", () => {
  const g = (today as unknown as TodayBody).goals[0] as TodayGoal;
  const cs = {
    series: [
      { date: "2021-10-14", value: 123 },
      { date: "2024-11-20", value: 106 },
      { date: "2025-12-09", value: 117 },
      { date: "2026-04-23", value: 131 },
    ],
    bandAt: [{ date: "2026-04-23", median: 108.5, sd: 14.6 }],
    lab: [0, 100] as [number | null, number | null],
  };

  it("builds 53's hero from the goal and its draws", () => {
    const h = goalHero(g, cs, "2026-09-26")!;
    expect(h.value).toBe("131");
    expect(h.gap).toBe("31 over the goal");
    expect(h.word).toBe("away");
    expect(h.slope).toBe("+16/yr");
    expect(h.facts).toEqual([
      "Last 3 draws 106, 117, 131",
      // a lab floor of 0 is no floor
      "Your band 94 to 123, the lab's under 100",
    ]);
    expect(h.views[0]!.tab).toBe("Last 22 months");
    expect(h.views[0]!.sentence!.b).toBe("137");
    expect(h.views[0]!.sentence!.post).toContain("37 over the goal.");
    expect(h.views[1]!.tab).toBe("Five years");
  });

  it("is toward when the slope comes back to the goal", () => {
    const h = goalHero(
      { ...g, recentSlope: { ...g.recentSlope!, perYear: -8 } },
      cs,
      "2026-09-26",
    )!;
    expect(h.word).toBe("toward");
    expect(h.slope).toBe("−8/yr");
  });

  it("is nothing for a goal never measured", () => {
    expect(goalHero({ ...g, value: null }, cs, "2026-09-26")).toBeNull();
  });
});

describe("markerLane (40c, 55's statusOf)", () => {
  const metric = (values: number[]): MetricRow =>
    ({
      code: "ldl_cholesterol",
      rows: values.map((value, i) => ({
        observedAt: `202${i}-01-01`,
        value,
        valueText: null,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 100,
      })),
    }) as unknown as MetricRow;

  it("puts a draw 2.5 spreads out on top", () => {
    const l = markerLane(metric([100, 101, 99, 100, 140]), null)!;
    expect(l.word).toBe("above your band");
    expect(l.outside).toBe(true);
    expect(l.rank).toBeGreaterThan(5);
    expect(l.mini.prev).toBe(100);
  });

  it("names the goal gap when the band holds", () => {
    const l = markerLane(metric([130, 128, 133, 131, 131]), {
      low: null,
      high: 100,
    })!;
    expect(l.word).toBe("31 over goal");
    expect(l.rank).toBe(4);
  });

  it("is too few draws under four, and nothing with no lab draw", () => {
    expect(markerLane(metric([1, 2]), null)!.word).toBe("too few draws");
    expect(markerLane(metric([]), null)).toBeNull();
  });
});
