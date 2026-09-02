import { describe, expect, it } from "vitest";
import { ledgerLine } from "./projections";
import type { StoredProjection } from "./projections";

/**
 * The lock on phase 30d, UX note 3.
 *
 * Home printed "On track: hba1c expected 5.26 % by 2026-11-23, retest then":
 * an engine variable and a machine's date, in the middle of a sentence a
 * person is supposed to read. The marker goes through `explainKey` and the
 * day through `dayLabel`.
 */
const projection = (over: Partial<StoredProjection> = {}): StoredProjection =>
  ({
    id: "p1",
    code: "hba1c",
    fromValue: 5.6,
    expected: 5.26,
    low: 5.1,
    high: 5.4,
    retestAt: "2026-11-23",
    verdict: null,
    resolvedValue: null,
    resolvedAt: null,
    contributions: [],
    ...over,
  }) as StoredProjection;

describe("ledgerLine", () => {
  it("names the marker and dates the retest in words", () => {
    const out = ledgerLine(projection(), "%");
    expect(out).toContain("HbA1c");
    expect(out).not.toContain("hba1c");
    expect(out).toContain("Nov 23 2026");
    expect(out).not.toContain("2026-11-23");
  });

  it("does the same when the retest is already due", () => {
    const out = ledgerLine(projection({ retestAt: "2020-01-01" }), "%");
    expect(out).toContain("HbA1c");
    expect(out).toContain("Jan 1 2020");
    expect(out).not.toContain("2020-01-01");
  });

  it("names the marker on a resolved projection too", () => {
    const out = ledgerLine(
      projection({ verdict: "as_expected", resolvedValue: 5.3 }),
      "%",
    );
    expect(out).toContain("HbA1c");
    expect(out).not.toContain("hba1c");
  });
});
