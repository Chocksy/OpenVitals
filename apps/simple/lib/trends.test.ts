import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { slopePerYear, slopeText, TREND_MIN_POINTS } from "./derived";
import { CATALOG } from "./hkb-catalog";
import { scoreHypotheses } from "./hypotheses";

/**
 * The two real shapes, straight off the owner's own account: a TSH that has
 * gone nowhere in eight years, and a ferritin that keeps being topped up and
 * keeps falling back. Both are the case a slope rule has to get right, because
 * both look dramatic on a chart and neither is a trend.
 */
const RAMONA_TSH = [
  { date: "2018-08-08", value: 2.46 },
  { date: "2019-01-19", value: 1.55 },
  { date: "2021-10-14", value: 2.12 },
  { date: "2022-10-20", value: 2.01 },
  { date: "2024-05-13", value: 2.41 },
  { date: "2025-05-28", value: 2.178 },
  { date: "2025-12-09", value: 1.774 },
  { date: "2026-04-23", value: 1.888 },
  { date: "2026-08-18", value: 1.995 },
];

const RAMONA_FERRITIN = [
  { date: "2018-08-08", value: 9.8 },
  { date: "2019-01-19", value: 28.5 },
  { date: "2019-07-13", value: 19.3 },
  { date: "2021-12-04", value: 51.75 },
  { date: "2022-10-20", value: 16.8 },
  { date: "2024-05-13", value: 8.45 },
  { date: "2024-10-10", value: 24.5 },
  { date: "2025-05-28", value: 6.9 },
  { date: "2025-12-09", value: 13.9 },
  { date: "2026-03-05", value: 13 },
  { date: "2026-04-23", value: 6.1 },
  { date: "2026-08-18", value: 8.2 },
];

const TODAY = "2026-08-30";

describe("slopePerYear", () => {
  it("needs three readings", () => {
    const two = RAMONA_TSH.slice(-2);
    expect(slopePerYear(two, TODAY)).toBeUndefined();
    expect(
      slopePerYear(RAMONA_TSH.slice(-TREND_MIN_POINTS), TODAY),
    ).toBeDefined();
  });

  it("reads a flat TSH as flat", () => {
    const slope = slopePerYear(RAMONA_TSH, TODAY)!;
    expect(Math.abs(slope.perYear)).toBeLessThan(0.5);
    // 2021-10-14 is inside the five-year window; 2018 and 2019 are not.
    expect(slope.n).toBe(7);
  });

  it("reads a topped-up ferritin as falling, but slowly", () => {
    const slope = slopePerYear(RAMONA_FERRITIN, TODAY)!;
    expect(slope.perYear).toBeLessThan(0);
    expect(slope.perYear).toBeGreaterThan(-15);
  });

  it("drops everything older than five years", () => {
    const all = slopePerYear(RAMONA_FERRITIN, TODAY)!;
    const recent = slopePerYear(
      RAMONA_FERRITIN.filter((p) => p.date >= "2021-08-30"),
      TODAY,
    )!;
    expect(all).toEqual(recent);
  });

  it("fits a straight line exactly", () => {
    const slope = slopePerYear(
      [
        { date: "2024-01-01", value: 10 },
        { date: "2025-01-01", value: 12 },
        { date: "2026-01-01", value: 14 },
      ],
      TODAY,
    )!;
    expect(slope.perYear).toBeCloseTo(2, 1);
    expect(slope.years).toBeCloseTo(2, 1);
  });

  it("says nothing when every draw is on one day", () => {
    expect(
      slopePerYear(
        [
          { date: "2026-01-01", value: 1 },
          { date: "2026-01-01", value: 2 },
          { date: "2026-01-01", value: 3 },
        ],
        TODAY,
      ),
    ).toBeUndefined();
  });

  it("prints the card line", () => {
    expect(slopeText({ perYear: 0.8, years: 3, n: 4 }, "mIU/L")).toBe(
      "rising: +0.8 mIU/L/yr over 3 years (4 draws)",
    );
    expect(slopeText({ perYear: -18.2, years: 2, n: 3 }, "ng/mL")).toBe(
      "falling: -18.2 ng/mL/yr over 2 years (3 draws)",
    );
  });
});

/* ── the rules ────────────────────────────────────────────────────────── */

const value = (v: number, over: Partial<LatestValue> = {}): LatestValue => ({
  value: v,
  unit: null,
  date: TODAY,
  status: "amber",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...over,
});

const person = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: TODAY,
  profile: { sex: "female", birth_year: "1985" },
  sex: "female",
  age: 41,
  latest: {},
  derived: {},
  ...over,
});

const score = (id: string, m: ModelInput) =>
  scoreHypotheses(m, { catalog: CATALOG }).find((h) => h.id === id)!;

const fired = (id: string, m: ModelInput, ruleId: string) =>
  [...score(id, m).for, ...score(id, m).against].find((f) => f.rule === ruleId);

describe("trend rules", () => {
  it("a TSH climbing 0.8 a year argues for Hashimoto's", () => {
    const rising = person({
      latest: {
        tsh: value(3.4, {
          unit: "mIU/L",
          slope: { perYear: 0.8, years: 3, n: 4 },
        }),
      },
    });
    const line = fired("hashimoto", rising, "hashi_tsh_rising")!;
    expect(line.lr).toBe(1.5);
    expect(line.value).toBe("rising: +0.8 mIU/L/yr over 3 years (4 draws)");
  });

  it("Ramona's own flat TSH does not fire it", () => {
    const flat = person({
      latest: {
        tsh: value(1.995, {
          unit: "mIU/L",
          slope: slopePerYear(RAMONA_TSH, TODAY),
        }),
      },
    });
    expect(fired("hashimoto", flat, "hashi_tsh_rising")).toBeUndefined();
    expect(
      score("hashimoto", flat).missing.some(
        (x) => x.rule === "hashi_tsh_rising",
      ),
    ).toBe(false);
  });

  it("a TSH with only two draws leaves the rule missing, not false", () => {
    const thin = person({ latest: { tsh: value(3.4, { unit: "mIU/L" }) } });
    expect(
      score("hashimoto", thin).missing.some(
        (x) => x.rule === "hashi_tsh_rising",
      ),
    ).toBe(true);
  });

  it("a ferritin falling 20 a year argues for iron deficiency and for a cause", () => {
    const falling = person({
      latest: {
        ferritin: value(24, {
          unit: "ng/mL",
          slope: { perYear: -20, years: 4, n: 5 },
        }),
      },
    });
    expect(fired("iron_deficiency", falling, "iron_ferritin_falling")!.lr).toBe(
      1.5,
    );
    const cause = score("iron_deficiency_cause_gi", falling);
    expect(
      [...cause.for, ...cause.against].find(
        (f) => f.rule === "gi_ferritin_falling",
      )?.lr,
    ).toBe(1.3);
  });

  it("Ramona's own sawtooth ferritin does not fire it", () => {
    const sawtooth = person({
      latest: {
        ferritin: value(8.2, {
          unit: "ng/mL",
          slope: slopePerYear(RAMONA_FERRITIN, TODAY),
        }),
      },
    });
    expect(
      fired("iron_deficiency", sawtooth, "iron_ferritin_falling"),
    ).toBeUndefined();
  });

  it("an eGFR falling 4 a year argues for CKD, off the creatinine series", () => {
    const m = person({
      derived: { egfr: 61 },
      slopes: { egfr: { perYear: -4.2, years: 4, n: 5 } },
    });
    expect(fired("ckd", m, "ckd_egfr_falling")!.lr).toBe(2);
  });

  it("an eGFR falling 1 a year is ageing, not disease", () => {
    const m = person({
      derived: { egfr: 78 },
      slopes: { egfr: { perYear: -1.1, years: 5, n: 6 } },
    });
    expect(fired("ckd", m, "ckd_egfr_falling")).toBeUndefined();
  });

  it("insulin climbing 3 a year argues for resistance", () => {
    const m = person({
      latest: {
        insulin: value(9, {
          unit: "uIU/mL",
          slope: { perYear: 3, years: 3, n: 4 },
        }),
      },
    });
    expect(fired("insulin_resistance", m, "ir_insulin_rising")!.lr).toBe(1.3);
  });

  it("apoB climbing 12 a year argues for atherosclerotic risk", () => {
    const m = person({
      latest: {
        apolipoprotein_b: value(112, {
          unit: "mg/dL",
          slope: { perYear: 12, years: 3, n: 3 },
        }),
      },
    });
    expect(fired("ascvd_risk", m, "ascvd_apob_rising")!.lr).toBe(1.2);
  });

  it("gives every trend rule a source", () => {
    const trendRules = CATALOG.flatMap((h) => h.evidence).filter(
      (e) => e.when.slopePerYear != null,
    );
    expect(trendRules.length).toBe(9);
    for (const r of trendRules) expect(r.source.length).toBeGreaterThan(60);
  });
});
