import { describe, it, expect } from "vitest";
import { groupDraws, type DrawReading } from "./daily-data";

const row = (over: Partial<DrawReading> = {}): DrawReading => ({
  observedAt: "2026-08-30",
  metricCode: "glucose",
  value: 92,
  valueText: null,
  unit: "mg/dL",
  refLow: 70,
  refHigh: 99,
  uploadId: null,
  name: "Glucose",
  optimalLow: null,
  optimalHigh: null,
  source: null,
  ...over,
});

describe("a draw is blood (phase 24b)", () => {
  it("keeps the lab rows and drops the phone rows from the same day", () => {
    const draws = groupDraws([
      row({ metricCode: "glucose", name: "Glucose" }),
      row({ metricCode: "hdl_cholesterol", name: "HDL", value: 58 }),
      row({
        metricCode: "resting_heart_rate",
        name: "Resting Heart Rate",
        value: 54,
        source: "healthkit",
      }),
      row({
        metricCode: "sleep_duration",
        name: "Sleep Duration",
        value: 421,
        source: "healthkit",
      }),
    ]);

    expect(draws).toHaveLength(1);
    expect(draws[0]!.count).toBe(2);
    expect(draws[0]!.rows.map((r) => r.code).sort()).toEqual([
      "glucose",
      "hdl_cholesterol",
    ]);
  });

  it("has no draws at all for a person who only ever synced a watch", () => {
    expect(
      groupDraws([
        row({ observedAt: "2026-08-29", source: "healthkit" }),
        row({ observedAt: "2026-08-30", source: "healthkit" }),
      ]),
    ).toEqual([]);
  });

  it("counts the flagged rows and names the file the draw came from", () => {
    const draws = groupDraws(
      [
        row({ value: 140, name: "Glucose", uploadId: "u1" }),
        row({
          metricCode: "ldl_cholesterol",
          name: "LDL",
          value: 90,
          refLow: null,
          refHigh: 130,
          uploadId: "u1",
        }),
      ],
      new Map([["u1", "labs-2026-08.pdf"]]),
    );

    expect(draws[0]!.flagged).toBe(1);
    expect(draws[0]!.fileName).toBe("labs-2026-08.pdf");
    expect(draws[0]!.rows[0]!.name).toBe("Glucose");
  });
});
