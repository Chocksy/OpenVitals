import { describe, expect, it } from "vitest";
import {
  EMPTY,
  shapeTotals,
  WEARABLE_ROW,
  type TotalsRow,
} from "./healthkit-totals";

const row = (
  code: string | null,
  n: number,
  lo: string | null,
  hi: string | null,
  days = n,
): TotalsRow => ({ code, n, lo, hi, days });

describe("shapeTotals", () => {
  /** The numbers from the audit: 12,119 readings over 3,260 days. */
  it("reads the roll-up row off the null code", () => {
    const totals = shapeTotals([
      row(null, 12119, "2022-05-29", "2026-08-31", 3260),
      row("sleep_duration", 776, "2022-05-30", "2026-08-31"),
      row("glucose", 41, "2026-07-01", "2026-08-31"),
      row(WEARABLE_ROW, 3110, "2022-05-29", "2026-08-31"),
    ]);
    expect(totals.readings).toBe(12119);
    expect(totals.days).toBe(3260);
    expect(totals.firstDay).toBe("2022-05-29");
    expect(totals.lastDay).toBe("2026-08-31");
    expect(totals.wearableDays).toBe(3110);
    expect(totals.perType.sleep_duration.count).toBe(776);
    expect(totals.perType.glucose.first).toBe("2026-07-01");
  });

  /** So the phone can find the row for a type without a mapping table. */
  it("names the HealthKit type each metric came from", () => {
    const totals = shapeTotals([
      row("sleep_duration", 776, "2022-05-30", "2026-08-31"),
      row("hrv_sdnn", 900, "2022-05-30", "2026-08-31"),
      row("waist_cm", 3, "2026-01-01", "2026-08-31"),
    ]);
    expect(totals.perType.sleep_duration.type).toBe("SleepAnalysis");
    expect(totals.perType.hrv_sdnn.type).toBe("HeartRateVariabilitySDNN");
    expect(totals.perType.waist_cm.type).toBe("WaistCircumference");
  });

  /** A lab-only metric code has no phone type; the row still counts. */
  it("leaves the type null for a code no HealthKit type writes", () => {
    const totals = shapeTotals([row("ldl_c", 4, "2024-01-01", "2026-01-01")]);
    expect(totals.perType.ldl_c).toEqual({
      count: 4,
      first: "2024-01-01",
      last: "2026-01-01",
      type: null,
    });
  });

  /** Steps and energy land in daily_logs, never in readings. */
  it("takes the span from the wearable days when there are no readings", () => {
    const totals = shapeTotals([
      row(null, 0, null, null, 0),
      row(WEARABLE_ROW, 412, "2025-06-01", "2026-08-31"),
    ]);
    expect(totals.readings).toBe(0);
    expect(totals.wearableDays).toBe(412);
    expect(totals.firstDay).toBe("2025-06-01");
    expect(totals.lastDay).toBe("2026-08-31");
  });

  /** And a reading older than any wearable day still wins the "since". */
  it("keeps the older of the two firsts", () => {
    const totals = shapeTotals([
      row(null, 10, "2019-03-04", "2026-08-31", 9),
      row(WEARABLE_ROW, 5, "2025-06-01", "2026-09-01"),
    ]);
    expect(totals.firstDay).toBe("2019-03-04");
    expect(totals.lastDay).toBe("2026-09-01");
  });

  it("a phone that never synced is all zeroes", () => {
    expect(shapeTotals([])).toEqual(EMPTY);
    expect(
      shapeTotals([
        row(null, 0, null, null, 0),
        row(WEARABLE_ROW, 0, null, null, 0),
      ]),
    ).toEqual(EMPTY);
  });
});
