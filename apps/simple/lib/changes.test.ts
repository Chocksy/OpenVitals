import { describe, expect, it } from "vitest";
import {
  changeText,
  missingDays,
  reachedHere,
  reachedText,
  researchLine,
  researchWeek,
  shortTitle,
  sinceStarted,
  type ChangeItem,
} from "./changes";

/**
 * Batch 5B: the owner's own numbers. Psyllium adopted 2026-10-05, LDL 131 on
 * 2026-04-23 and 104 on 2026-11-17.
 */
const psyllium: ChangeItem = {
  id: "p1",
  text: "Psyllium husk 5 g with lunch and dinner",
  metricCodes: ["ldl_cholesterol"],
  active: true,
  startedAt: "2026-10-05",
  createdAt: new Date("2026-10-05T09:00:00Z"),
};

const ldl = [
  { code: "ldl_cholesterol", value: 140, date: "2025-11-01" },
  { code: "ldl_cholesterol", value: 131, date: "2026-04-23" },
  { code: "ldl_cholesterol", value: 104, date: "2026-11-17" },
];

describe("sinceStarted", () => {
  it("reads the owner's LDL against the day psyllium started", () => {
    const [c, ...rest] = sinceStarted([psyllium], ldl);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({
      code: "ldl_cholesterol",
      before: { value: 131, date: "2026-04-23" },
      after: { value: 104, date: "2026-11-17" },
      delta: -27,
      pct: -20.6,
      better: true,
    });
    expect(changeText(c!, "LDL")).toBe(
      "LDL 131 → 104 since Psyllium husk, 5 Oct",
    );
  });

  it("falls back to created_at when started_at is null", () => {
    const [c] = sinceStarted([{ ...psyllium, startedAt: null }], ldl);
    expect(c?.item.start).toBe("2026-10-05");
  });

  it("skips a code with no reading on one side, and inactive items", () => {
    expect(
      sinceStarted(
        [psyllium],
        ldl.filter((r) => r.date > "2026-10-05"),
      ),
    ).toEqual([]);
    expect(
      sinceStarted(
        [psyllium],
        ldl.filter((r) => r.date < "2026-10-05"),
      ),
    ).toEqual([]);
    expect(sinceStarted([{ ...psyllium, active: false }], ldl)).toEqual([]);
    expect(sinceStarted([{ ...psyllium, metricCodes: null }], ldl)).toEqual([]);
  });

  it("calls a rise in a lower-is-better marker worse, and sorts better first", () => {
    const rows = sinceStarted(
      [{ ...psyllium, id: "a", metricCodes: ["hba1c", "ldl_cholesterol"] }],
      [
        ...ldl,
        { code: "hba1c", value: 5.0, date: "2026-04-23" },
        { code: "hba1c", value: 5.2, date: "2026-11-17" },
      ],
    );
    expect(rows.map((r) => [r.code, r.better])).toEqual([
      ["ldl_cholesterol", true],
      ["hba1c", false],
    ]);
  });

  it("reads a middle marker against its band", () => {
    const [c] = sinceStarted(
      [{ ...psyllium, metricCodes: ["tsh"] }],
      [
        {
          code: "tsh",
          value: 4.5,
          date: "2026-04-23",
          optimalLow: 1,
          optimalHigh: 2.5,
        },
        {
          code: "tsh",
          value: 3,
          date: "2026-11-17",
          optimalLow: 1,
          optimalHigh: 2.5,
        },
      ],
    );
    expect(c?.better).toBe(true);
  });

  it("says nothing for a marker with no direction and no band", () => {
    const tsh = [
      { code: "tsh", value: 10, date: "2026-04-23" },
      { code: "tsh", value: 20, date: "2026-11-17" },
    ];
    expect(sinceStarted([{ ...psyllium, metricCodes: ["tsh"] }], tsh)).toEqual([]);
  });
});

describe("text", () => {
  it("cuts a protocol line to its name", () => {
    expect(shortTitle("Berberine 500 mg before meals")).toBe("Berberine");
    expect(shortTitle("Aronia")).toBe("Aronia");
  });
  it("words a reached goal", () => {
    expect(reachedText("LDL", null, 118)).toBe("Reached: LDL ≤118");
    expect(reachedText("Vitamin D", 40, null)).toBe("Reached: Vitamin D ≥40");
  });
});

describe("researchWeek", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const at = (day: string) => new Date(`${day}T08:00:00Z`);

  it("counts reads, kept findings and non-seed rule changes in the week", () => {
    const w = researchWeek(
      {
        caseReads: [
          { ranAt: at("2026-11-17"), rows: [{}, {}] },
          { ranAt: at("2026-11-16"), rows: [] },
          { ranAt: at("2026-10-01"), rows: [{}] },
        ],
        papers: [
          { foundAt: at("2026-11-15"), moves: { direction: "down" } },
          { foundAt: at("2026-11-15"), moves: null },
        ],
        revisions: [
          { changedAt: at("2026-11-17"), summary: "seed: 10 conditions #abc" },
          { changedAt: at("2026-11-14"), summary: "cases: 2 rules" },
          { changedAt: at("2026-09-01"), summary: "woke ring-2 x" },
        ],
      },
      now,
    );
    expect(w).toEqual({
      read: 4,
      kept: 3,
      changed: 1,
      lastChange: "2026-11-14",
    });
    expect(researchLine(w)).toBe(
      "This week research read 4 papers, kept 3 findings, changed 1 rule. Last rule change: 14 Nov.",
    );
  });

  it("says zero plainly and leaves the last change off when there is none", () => {
    const w = researchWeek({ caseReads: [], papers: [], revisions: [] }, now);
    expect(researchLine(w)).toBe(
      "This week research read 0 papers, kept 0 findings, changed 0 rules.",
    );
  });
});

describe("missingDays", () => {
  it("lists the start-to-draw days with no row", () => {
    expect(
      missingDays("2026-10-05", "2026-10-09", ["2026-10-06", "2026-10-08"]),
    ).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
  });
  it("caps the range", () => {
    expect(missingDays("2020-01-01", "2026-01-01", [], 10)).toHaveLength(10);
  });
});

describe("sinceStarted: unchanged is not worse", () => {
  it("marks a flat HbA1c 5.0 -> 5.0 as same", () => {
    const [c] = sinceStarted(
      [{ id: "b", text: "Berberine", metricCodes: ["hba1c"], startedAt: "2026-10-05", createdAt: null, active: true }],
      [
        { code: "hba1c", value: 5, date: "2026-04-23", optimalLow: null, optimalHigh: 5.4 },
        { code: "hba1c", value: 5, date: "2026-11-17", optimalLow: null, optimalHigh: 5.4 },
      ],
    );
    expect(c?.same).toBe(true);
    expect(c?.better).toBe(false);
  });
});


describe("reachedHere", () => {
  const april = new Date("2026-04-22T10:00:00Z");
  const nov = new Date("2026-11-17T10:00:00Z");
  const closed = new Date("2026-11-18T05:00:00Z");
  it("keeps a goal the November draw reached off the April page", () => {
    expect(reachedHere(closed, april, nov)).toBe(false);
    expect(reachedHere(closed, new Date("2026-11-16T10:00:00Z"), null)).toBe(true);
    expect(reachedHere(null, april, null)).toBe(false);
  });
});
