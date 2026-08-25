import { describe, it, expect } from "vitest";
import {
  planUnits,
  planMissingRange,
  planImplausible,
  type MetricLike,
  type ReadingLike,
} from "./curator";

const METRICS: MetricLike[] = [
  { code: "alt", name: "Alanine Aminotransferase", unit: "U/L" },
  { code: "wbc", name: "White Blood Cell Count", unit: "10^3/uL" },
  { code: "cortisol", name: "Cortisol", unit: "ug/dL" },
  { code: "mch", name: "Mean Corpuscular Hemoglobin", unit: "pg" },
  { code: "glucose", name: "Glucose", unit: "mg/dL" },
];
const byCode = new Map(METRICS.map((m) => [m.code, m]));

const reading = (r: Partial<ReadingLike> & { id: string }): ReadingLike => ({
  uploadId: null,
  metricCode: "glucose",
  value: 90,
  unit: "mg/dL",
  refLow: 70,
  refHigh: 106,
  observedAt: "2025-01-01",
  flags: null,
  ...r,
});

describe("planUnits / unit_spelling", () => {
  it("adopts the canonical spelling and leaves the value alone", () => {
    const rows = [
      reading({
        id: "a",
        metricCode: "alt",
        value: 31,
        unit: "UI/l",
        refLow: 0,
        refHigh: 41,
      }),
    ];
    const [action] = planUnits(rows, byCode);
    expect(action).toMatchObject({
      type: "fix",
      check: "unit_spelling",
      readingId: "a",
      patch: { unit: "U/L" },
    });
    expect(
      (action as { patch: Record<string, unknown> }).patch.value,
    ).toBeUndefined();
  });

  it("ignores a reading that already uses the canonical unit", () => {
    expect(planUnits([reading({ id: "a" })], byCode)).toHaveLength(0);
  });

  it("ignores a reading with no unit at all when the metric has none", () => {
    const rows = [reading({ id: "a", metricCode: "unknown", unit: "x" })];
    expect(planUnits(rows, byCode)).toHaveLength(0);
  });
});

describe("planUnits / unit_convert", () => {
  it("converts value and both range bounds and keeps the original", () => {
    const rows = [
      reading({
        id: "b",
        metricCode: "wbc",
        value: 7200,
        unit: "/mm³",
        refLow: 4000,
        refHigh: 10000,
      }),
    ];
    const [action] = planUnits(rows, byCode);
    expect(action).toMatchObject({ type: "fix", check: "unit_convert" });
    const patch = (action as { patch: ReadingLike }).patch;
    expect(patch.value).toBeCloseTo(7.2, 5);
    expect(patch.refLow).toBeCloseTo(4, 5);
    expect(patch.refHigh).toBeCloseTo(10, 5);
    expect(patch.unit).toBe("10^3/uL");
    expect(patch.flags).toContain("unit_converted");
    expect(patch.flags).toContainEqual({
      orig: { value: 7200, unit: "/mm³" },
    });
  });

  it("converts ng/mL cortisol into ug/dL", () => {
    const rows = [
      reading({
        id: "c",
        metricCode: "cortisol",
        value: 180,
        unit: "ng/ml",
        refLow: null,
        refHigh: null,
      }),
    ];
    const patch = (planUnits(rows, byCode)[0] as { patch: ReadingLike }).patch;
    expect(patch.value).toBeCloseTo(18, 5);
    expect(patch.refLow).toBeNull();
  });

  it("queues a question when the conversion is unknown", () => {
    const rows = [
      reading({
        id: "d",
        metricCode: "mch",
        value: 33,
        unit: "g/dl",
        refLow: null,
        refHigh: null,
      }),
    ];
    const [action] = planUnits(rows, byCode);
    expect(action).toMatchObject({
      type: "queue",
      kind: "unit_unknown",
      subject: { readingId: "d", fromUnit: "g/dl", toUnit: "pg" },
    });
    expect((action as { options: string[] }).options).toEqual([
      "Treat as same unit",
      "Multiply by …",
      "Leave as is",
    ]);
  });

  it("converts only the range when the value is already canonical", () => {
    // The legacy platelet rows: value already in 10^3/uL, range in /mm3.
    const peers = [2019, 2021, 2023].map((y) =>
      reading({
        id: `p${y}`,
        metricCode: "wbc",
        value: 6.4,
        unit: "10^3/uL",
        refLow: 4,
        refHigh: 10,
        observedAt: `${y}-01-01`,
      }),
    );
    const target = reading({
      id: "odd",
      metricCode: "wbc",
      value: 5.8,
      unit: "/mm³",
      refLow: 4000,
      refHigh: 10000,
      observedAt: "2024-01-01",
    });
    const patch = (
      planUnits([target], byCode, [...peers, target])[0] as {
        patch: ReadingLike;
      }
    ).patch;
    expect(patch.value).toBe(5.8);
    expect(patch.refLow).toBeCloseTo(4, 5);
    expect(patch.refHigh).toBeCloseTo(10, 5);
    expect(patch.unit).toBe("10^3/uL");
    expect(patch.flags).toContain("unit_relabelled");
  });

  it("keeps a range that already matches the canonical value", () => {
    // Free T4: the whole row was ng/dL, only the label said ng/mL.
    const peers = [2021, 2022, 2023].map((y) =>
      reading({
        id: `p${y}`,
        metricCode: "cortisol",
        value: 14,
        unit: "ug/dL",
        observedAt: `${y}-01-01`,
      }),
    );
    const target = reading({
      id: "mislabelled",
      metricCode: "cortisol",
      value: 15.2,
      unit: "ng/ml",
      refLow: 5.7,
      refHigh: 19.4,
      observedAt: "2024-01-01",
    });
    const patch = (
      planUnits([target], byCode, [...peers, target])[0] as {
        patch: ReadingLike;
      }
    ).patch;
    expect(patch.value).toBe(15.2);
    expect(patch.refLow).toBe(5.7);
    expect(patch.refHigh).toBe(19.4);
  });

  it("still converts when the history agrees with the conversion", () => {
    const peers = [2019, 2021, 2023].map((y) =>
      reading({
        id: `p${y}`,
        metricCode: "wbc",
        value: 6.4,
        unit: "10^3/uL",
        observedAt: `${y}-01-01`,
      }),
    );
    const target = reading({
      id: "raw",
      metricCode: "wbc",
      value: 5800,
      unit: "/mm³",
      refLow: 4000,
      refHigh: 10000,
      observedAt: "2024-01-01",
    });
    const patch = (
      planUnits([target], byCode, [...peers, target])[0] as {
        patch: ReadingLike;
      }
    ).patch;
    expect(patch.value).toBeCloseTo(5.8, 5);
    expect(patch.flags).toContain("unit_converted");
  });

  it("never emits a delete", () => {
    const rows = [
      reading({ id: "d", metricCode: "mch", value: 33, unit: "g/dl" }),
      reading({ id: "e", metricCode: "wbc", value: 7200, unit: "/mm³" }),
    ];
    expect(
      planUnits(rows, byCode).every(
        (a) => a.type === "fix" || a.type === "queue",
      ),
    ).toBe(true);
  });
});

describe("planMissingRange", () => {
  const history = [
    reading({
      id: "old",
      metricCode: "alt",
      unit: "U/L",
      refLow: 5,
      refHigh: 41,
      observedAt: "2023-05-01",
    }),
    reading({
      id: "newer",
      metricCode: "alt",
      unit: "U/L",
      refLow: 7,
      refHigh: 45,
      observedAt: "2024-05-01",
    }),
  ];

  it("copies the range from the most recent earlier reading", () => {
    const target = reading({
      id: "target",
      metricCode: "alt",
      unit: "U/L",
      refLow: null,
      refHigh: null,
      observedAt: "2025-01-01",
    });
    const [action] = planMissingRange([target], [...history, target]);
    expect(action).toMatchObject({
      type: "fix",
      check: "missing_range",
      readingId: "target",
      patch: { refLow: 7, refHigh: 45 },
    });
  });

  it("will not borrow a range measured in a different unit", () => {
    const target = reading({
      id: "target",
      metricCode: "alt",
      unit: "mg/dL",
      refLow: null,
      refHigh: null,
      observedAt: "2025-01-01",
    });
    const [action] = planMissingRange([target], [...history, target]);
    expect((action as { patch: ReadingLike }).patch.flags).toEqual([
      "no_range",
    ]);
  });

  it("matches a donor whose unit is only spelled differently", () => {
    const target = reading({
      id: "target",
      metricCode: "alt",
      unit: "UI/l",
      refLow: null,
      refHigh: null,
      observedAt: "2025-01-01",
    });
    const [action] = planMissingRange([target], [...history, target]);
    expect((action as { patch: ReadingLike }).patch.refHigh).toBe(45);
  });

  it("leaves readings that already have a range alone", () => {
    expect(planMissingRange(history, history)).toHaveLength(0);
  });

  it("does not re-flag a reading already marked no_range", () => {
    const target = reading({
      id: "t",
      metricCode: "alt",
      refLow: null,
      refHigh: null,
      flags: ["no_range"],
    });
    expect(planMissingRange([target], [target])).toHaveLength(0);
  });
});

describe("planImplausible", () => {
  it("queues a value 50x above the top of the range", () => {
    const rows = [reading({ id: "x", metricCode: "glucose", value: 9000 })];
    const [action] = planImplausible(rows, byCode);
    expect(action).toMatchObject({ type: "queue", kind: "implausible" });
    expect((action as { options: string[] }).options).toContain(
      "Delete this reading",
    );
  });

  it("leaves a merely abnormal value alone", () => {
    const rows = [reading({ id: "x", metricCode: "glucose", value: 260 })];
    expect(planImplausible(rows, byCode)).toHaveLength(0);
  });
});
