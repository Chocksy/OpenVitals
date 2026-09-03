import { describe, expect, it } from "vitest";
import { HK_TYPES, WORKOUT } from "./healthkit";
import {
  DAILY_FIELDS,
  DAILY_PREFIX,
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

  /**
   * The defect this fixes: the Sync tab said "nothing on the server" for
   * Steps and Active energy on a phone that had synced 412 days of both,
   * because the daily half of the union only counted days.
   */
  it("reports a daily field per type, beside the readings types", () => {
    const totals = shapeTotals([
      row(null, 776, "2022-05-30", "2026-08-31", 776),
      row("sleep_duration", 776, "2022-05-30", "2026-08-31"),
      row(WEARABLE_ROW, 412, "2025-06-01", "2026-08-31"),
      row(`${DAILY_PREFIX}steps`, 400, "2025-06-01", "2026-08-30"),
      row(`${DAILY_PREFIX}activeEnergyKcal`, 388, "2025-06-04", "2026-08-31"),
    ]);
    expect(totals.perType.SleepAnalysis).toBeUndefined();
    expect(totals.perType.sleep_duration.type).toBe("SleepAnalysis");
    expect(totals.perType.StepCount).toEqual({
      count: 400,
      first: "2025-06-01",
      last: "2026-08-30",
      type: "StepCount",
    });
    expect(totals.perType.ActiveEnergyBurned).toEqual({
      count: 388,
      first: "2025-06-04",
      last: "2026-08-31",
      type: "ActiveEnergyBurned",
    });
    // The roll-up row is untouched by any of it.
    expect(totals.wearableDays).toBe(412);
  });

  /** A field the table has never heard of is skipped, not keyed by null. */
  it("ignores a daily row for a field nothing maps", () => {
    const totals = shapeTotals([row(`${DAILY_PREFIX}bogus`, 3, "a", "b")]);
    expect(totals.perType).toEqual({});
  });
});

describe("DAILY_FIELDS", () => {
  /** Every type the phone lists as daily must have a row, or it reads empty. */
  it("covers every daily type the phone lists", () => {
    const covered = new Set(DAILY_FIELDS.map((f) => f.type));
    for (const m of HK_TYPES.filter((m) => m.lands === "daily"))
      expect(covered.has(m.type), m.type).toBe(true);
    // Workouts are not in HK_TYPES — they are a list, not a number a day —
    // and the Sync tab lists them all the same.
    expect(covered.has(WORKOUT)).toBe(true);
  });

  it("names each field and type once", () => {
    expect(new Set(DAILY_FIELDS.map((f) => f.field)).size).toBe(
      DAILY_FIELDS.length,
    );
    expect(new Set(DAILY_FIELDS.map((f) => f.type)).size).toBe(
      DAILY_FIELDS.length,
    );
  });

  /** Nothing here may collide with a metric code, which keys the same map. */
  it("never collides with a readings metric code", () => {
    const codes = new Set(
      HK_TYPES.filter((m) => m.lands === "reading").map((m) => m.key),
    );
    for (const f of DAILY_FIELDS) expect(codes.has(f.type)).toBe(false);
  });
});
