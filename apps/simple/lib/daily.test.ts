import { describe, it, expect } from "vitest";
import {
  adherence,
  csvCell,
  daysBetween,
  goalGap,
  goalProgress,
  heatmapBucket,
  humanLogged,
  inGoal,
  partialDay,
  lastDays,
  rollingAverage,
  shiftDay,
  streak,
  toCsv,
} from "./daily";

describe("day arithmetic", () => {
  it("shifts across a month boundary", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("shifts across a leap day", () => {
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("lists the window oldest first", () => {
    expect(lastDays(3, "2026-01-02")).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("counts days between, including across DST", () => {
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-04-01", "2026-03-01")).toBe(-31);
  });
});

describe("streak", () => {
  it("is zero with no days", () => {
    expect(streak([], "2026-05-10")).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    expect(
      streak(["2026-05-08", "2026-05-09", "2026-05-10"], "2026-05-10"),
    ).toBe(3);
  });

  it("survives an empty today and counts back from yesterday", () => {
    expect(streak(["2026-05-08", "2026-05-09"], "2026-05-10")).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(
      streak(["2026-05-06", "2026-05-09", "2026-05-10"], "2026-05-10"),
    ).toBe(2);
  });

  it("is zero when the run ended two days ago", () => {
    expect(streak(["2026-05-07", "2026-05-08"], "2026-05-10")).toBe(0);
  });

  it("ignores duplicates", () => {
    expect(streak(["2026-05-10", "2026-05-10"], "2026-05-10")).toBe(1);
  });
});

describe("adherence", () => {
  const window = lastDays(10, "2026-05-10");

  it("is zero on an empty window", () => {
    expect(adherence(["2026-05-10"], [])).toBe(0);
  });

  it("is a rounded percentage of the window", () => {
    expect(adherence(window.slice(0, 5), window)).toBe(50);
    expect(adherence(window, window)).toBe(100);
    expect(adherence([], window)).toBe(0);
  });

  it("ignores days outside the window", () => {
    expect(adherence(["2026-01-01", ...window.slice(0, 2)], window)).toBe(20);
  });
});

describe("goals", () => {
  it("knows a one-sided band", () => {
    expect(inGoal(60, null, 70)).toBe(true);
    expect(inGoal(80, null, 70)).toBe(false);
    expect(inGoal(80, 70, null)).toBe(true);
  });

  it("has no goal without a band", () => {
    expect(inGoal(80, null, null)).toBe(false);
  });

  it("measures the gap to the nearest edge", () => {
    expect(goalGap(97, 60, 80)).toBe(17);
    expect(goalGap(50, 60, 80)).toBe(10);
    expect(goalGap(70, 60, 80)).toBe(0);
  });

  it("is 100% once inside the band", () => {
    expect(goalProgress(120, 75, 60, 80)).toBe(100);
  });

  it("is the fraction of the original gap closed", () => {
    expect(goalProgress(100, 90, 60, 80)).toBe(50);
    expect(goalProgress(100, 100, 60, 80)).toBe(0);
  });

  it("never goes negative when things got worse", () => {
    expect(goalProgress(100, 140, 60, 80)).toBe(0);
  });

  it("is zero without a current value or a starting point", () => {
    expect(goalProgress(100, null, 60, 80)).toBe(0);
    expect(goalProgress(null, 90, 60, 80)).toBe(0);
  });
});

describe("heatmapBucket", () => {
  it("buckets nothing as 0", () => {
    expect(heatmapBucket(0)).toBe(0);
    expect(heatmapBucket(-1)).toBe(0);
    expect(heatmapBucket(Number.NaN)).toBe(0);
  });

  it("buckets everything as 4", () => {
    expect(heatmapBucket(1)).toBe(4);
    expect(heatmapBucket(1.5)).toBe(4);
  });

  it("splits the middle into three", () => {
    expect(heatmapBucket(0.2)).toBe(1);
    expect(heatmapBucket(0.5)).toBe(2);
    expect(heatmapBucket(0.8)).toBe(3);
  });
});

describe("rollingAverage", () => {
  it("averages the trailing window", () => {
    expect(rollingAverage([1, 2, 3], 3)).toEqual([1, 1.5, 2]);
  });

  it("skips gaps and returns null for an all-null window", () => {
    expect(rollingAverage([null, 4, null], 2)).toEqual([null, 4, 4]);
  });
});

describe("csv", () => {
  it("leaves a plain cell alone", () => {
    expect(csvCell("glucose")).toBe("glucose");
    expect(csvCell(97.5)).toBe("97.5");
  });

  it("blanks null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("quotes edge whitespace so it survives a round trip", () => {
    expect(csvCell(" pad")).toBe('" pad"');
  });

  it("joins array cells", () => {
    expect(csvCell(["unit_converted", "no_range"])).toBe(
      "unit_converted no_range",
    );
  });

  it("builds a whole document", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\n1,"x,y"');
  });
});

describe("whose day is it (phase 24b)", () => {
  it("is nobody's day when the row is empty or missing", () => {
    expect(humanLogged(undefined)).toBe(false);
    expect(humanLogged({})).toBe(false);
    expect(humanLogged({ sleepHours: null, notes: "" })).toBe(false);
  });

  it("does not count columns the phone filled itself", () => {
    expect(
      humanLogged({ steps: 12000, sleepHours: 7.2 }, [
        "steps",
        "sleepHours",
      ]),
    ).toBe(false);
  });

  it("counts the same column when the person typed it", () => {
    expect(humanLogged({ steps: 12000 }, ["sleepHours"])).toBe(true);
  });

  it("counts anything a phone cannot write", () => {
    expect(humanLogged({ mood: 4 }, ["steps"])).toBe(true);
    expect(humanLogged({ notes: "ran a 10k" }, ["steps"])).toBe(true);
    expect(humanLogged({ alcoholUnits: 0.5 }, ["steps"])).toBe(true);
  });

  it("calls a morning or a quiet day partial", () => {
    expect(partialDay(6, 49)).toBe(true);
    expect(partialDay(18, 300)).toBe(true);
    expect(partialDay(18, 12000)).toBe(false);
    expect(partialDay(6, 12000)).toBe(true);
    expect(partialDay(23, null)).toBe(true);
  });
});
