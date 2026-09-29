import { describe, expect, it } from "vitest";
import { collapseSame, sameValue, type MetricRow } from "./data";

type Row = MetricRow["rows"][number];

const row = (patch: Partial<Row> = {}): Row => ({
  observedAt: "2026-08-18",
  value: 8.2,
  valueText: "8,2",
  unit: "ng/mL",
  refLow: 10,
  refHigh: 291,
  source: null,
  ...patch,
});

describe("sameValue (42E)", () => {
  it("reads a `real` column's rounding as the same number", () => {
    expect(sameValue(8.2, 8.199999809265137)).toBe(true);
    expect(sameValue(8.2, 8.21)).toBe(false);
    expect(sameValue(0, 0)).toBe(true);
    expect(sameValue(null, 0)).toBe(false);
  });
});

describe("collapseSame (42E)", () => {
  it("keeps one row per draw, the one with a range", () => {
    const out = collapseSame([
      row({ refLow: null, refHigh: null }),
      row({ value: 8.199999809265137 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.refLow).toBe(10);
  });

  it("keeps two values on one day, and a phone row beside a draw", () => {
    expect(collapseSame([row(), row({ value: 9 })])).toHaveLength(2);
    expect(collapseSame([row({ source: "healthkit" }), row()])).toHaveLength(2);
    expect(
      collapseSame([row(), row({ observedAt: "2026-08-19" })]),
    ).toHaveLength(2);
  });

  it("collapses a text-only result on its text", () => {
    const text = { value: null, valueText: "negative" };
    expect(collapseSame([row(text), row(text)])).toHaveLength(1);
    expect(
      collapseSame([row(text), row({ ...text, valueText: "positive" })]),
    ).toHaveLength(2);
  });
});
