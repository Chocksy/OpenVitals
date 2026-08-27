import { describe, it, expect } from "vitest";
import {
  planUnits,
  planMissingRange,
  planRefScale,
  planUrineText,
  planImplausible,
  planForeignReadings,
  acceptsOptimal,
  type MetricLike,
  type ReadingLike,
} from "./curator";

const METRICS: MetricLike[] = [
  { code: "alt", name: "Alanine Aminotransferase", unit: "U/L" },
  { code: "wbc", name: "White Blood Cell Count", unit: "10^3/uL" },
  { code: "cortisol", name: "Cortisol", unit: "ug/dL" },
  { code: "mch", name: "Mean Corpuscular Hemoglobin", unit: "pg" },
  { code: "glucose", name: "Glucose", unit: "mg/dL" },
  { code: "platelets", name: "Platelet Count", unit: "K/uL" },
  { code: "rbc", name: "Red Blood Cell Count", unit: "M/uL" },
  { code: "eosinophils_abs", name: "Eosinophils (Absolute)", unit: "K/uL" },
  { code: "albumin", name: "Albumin", unit: "g/dL" },
  { code: "crp", name: "CRP", unit: "mg/L" },
  { code: "total_t3", name: "Total T3", unit: "ng/dL" },
  { code: "total_protein", name: "Total Protein", unit: "g/dL" },
  { code: "esr", name: "ESR", unit: "mm/hr" },
  { code: "mcv", name: "MCV", unit: "fL" },
  { code: "pdw", name: "PDW", unit: "%" },
  { code: "apolipoprotein_b", name: "Apolipoprotein B", unit: "mg/dL" },
  { code: "prolactin", name: "Prolactin", unit: "ng/mL" },
  { code: "lp_a", name: "Lipoprotein(a)", unit: "mg/dL" },
];
const byCode = new Map(METRICS.map((m) => [m.code, m]));

const reading = (r: Partial<ReadingLike> & { id: string }): ReadingLike => ({
  uploadId: null,
  metricCode: "glucose",
  value: 90,
  valueText: null,
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

  /** [metric, spelling on the sheet, value] -> the canonical spelling. */
  const SPELLINGS: [string, string, number][] = [
    ["esr", "mm/h", 7],
    ["esr", "mm la 1h", 10],
    ["esr", "/ mm/h", 9],
    ["mch", "pg/cell", 28.5],
    ["mcv", "μm 3", 86.8],
    ["eosinophils_abs", "10^3/ul", 0.09],
    ["eosinophils_abs", "x10^3/uL", 2.2],
    ["rbc", "10^6/ul", 4.94],
  ];

  for (const [metricCode, unit, value] of SPELLINGS) {
    it(`treats "${unit}" on ${metricCode} as the same unit`, () => {
      const rows = [
        reading({
          id: "s",
          metricCode,
          value,
          unit,
          refLow: null,
          refHigh: null,
        }),
      ];
      expect(planUnits(rows, byCode)[0]).toMatchObject({
        type: "fix",
        check: "unit_spelling",
        patch: { unit: byCode.get(metricCode)!.unit },
      });
    });
  }

  it("converts apoB from g/L to mg/dL", () => {
    const peers = [
      ["2023-03-17", 82],
      ["2024-05-13", 97],
    ].map(([observedAt, value]) =>
      reading({
        id: `apob${observedAt}`,
        metricCode: "apolipoprotein_b",
        unit: "mg/dL",
        value: value as number,
        refLow: 49,
        refHigh: 173,
        observedAt: observedAt as string,
      }),
    );
    const target = reading({
      id: "apob2026-04-23",
      metricCode: "apolipoprotein_b",
      value: 0.99,
      unit: "g/L",
      refLow: 0.55,
      refHigh: 1.4,
      observedAt: "2026-04-23",
    });
    const patch = (
      planUnits([target], byCode, [...peers, target])[0] as {
        patch: ReadingLike;
      }
    ).patch;
    expect(patch.value).toBeCloseTo(99, 5);
    expect(patch.refLow).toBeCloseTo(55, 5);
    expect(patch.refHigh).toBeCloseTo(140, 5);
    expect(patch.unit).toBe("mg/dL");
  });

  it("converts Lp(a) from g/L to mg/dL", () => {
    const target = reading({
      id: "lpa",
      metricCode: "lp_a",
      value: 0.25,
      unit: "g/L",
      refLow: null,
      refHigh: 0.3,
      observedAt: "2026-04-23",
    });
    const patch = (planUnits([target], byCode)[0] as { patch: ReadingLike })
      .patch;
    expect(patch.value).toBeCloseTo(25, 5);
    expect(patch.refHigh).toBeCloseTo(30, 5);
  });

  it("converts prolactin from uIU/mL to ng/mL", () => {
    const target = reading({
      id: "prl",
      metricCode: "prolactin",
      value: 182,
      unit: "uIU/mL",
      refLow: 66,
      refHigh: 490,
      observedAt: "2022-10-20",
    });
    const patch = (planUnits([target], byCode)[0] as { patch: ReadingLike })
      .patch;
    expect(patch.value).toBeCloseTo(8.585, 3);
    expect(patch.refLow).toBeCloseTo(3.113, 3);
    expect(patch.refHigh).toBeCloseTo(23.113, 3);
  });

  it("moves a PDW in fL onto its own metric instead of asking", () => {
    const target = reading({
      id: "pdw2014-03-26",
      metricCode: "pdw",
      value: 13.3,
      unit: "fL",
      refLow: 8,
      refHigh: 16.5,
      observedAt: "2014-03-26",
    });
    const [action] = planUnits([target], byCode);
    expect(action).toMatchObject({
      type: "fix",
      readingId: "pdw2014-03-26",
      patch: { metricCode: "pdw_sd" },
    });
    const patch = (action as { patch: ReadingLike }).patch;
    expect(patch.flags).toContain("split_measurand");
    expect(patch.value).toBeUndefined();
  });

  it("leaves a PDW in % on the metric it already has", () => {
    const target = reading({
      id: "pdw%",
      metricCode: "pdw",
      value: 16.1,
      unit: "%",
      refLow: 12,
      refHigh: 19,
    });
    expect(planUnits([target], byCode)).toHaveLength(0);
  });
});

/**
 * Every fixture below is a row from the production copy, quoted as it sits in
 * `readings` today.
 */
describe("planRefScale", () => {
  /** razvan's platelets, K/uL, most of them with a matching K/uL range. */
  const platelets = [
    ["2012-08-08", 215, 150, 400],
    ["2014-03-26", 226, 150, 450],
    ["2015-03-21", 200, 150, 450],
    ["2016-01-09", 203, 150, 450],
    ["2019-07-13", 213, 150, 450],
    ["2021-10-14", 237, 150, 450],
    ["2023-03-17", 208, 150, 450],
    ["2024-05-13", 214, 150, 450],
  ].map(([observedAt, value, refLow, refHigh]) =>
    reading({
      id: `plt${observedAt}`,
      metricCode: "platelets",
      unit: "K/uL",
      value: value as number,
      refLow: refLow as number,
      refHigh: refHigh as number,
      observedAt: observedAt as string,
    }),
  );

  it("puts a cells/uL range back into the value's own scale", () => {
    const target = reading({
      id: "plt2024-11-20",
      metricCode: "platelets",
      unit: "K/uL",
      value: 224,
      refLow: 150000,
      refHigh: 370000,
      observedAt: "2024-11-20",
    });
    const [action] = planRefScale([target], [...platelets, target]);
    expect(action).toMatchObject({
      type: "fix",
      check: "ref_scale",
      readingId: "plt2024-11-20",
      patch: { refLow: 150, refHigh: 370 },
    });
    const patch = (action as { patch: ReadingLike }).patch;
    expect(patch.value).toBeUndefined();
    expect(patch.flags).toContainEqual({
      ref_rescaled: { factor: 0.001, orig: [150000, 370000] },
    });
  });

  it("handles the 10^6 case for red cells", () => {
    const peers = [
      ["2021-10-14", 4.94, 4.3, 5.75],
      ["2022-10-20", 5.11, 4.3, 5.75],
      ["2023-03-17", 4.86, 4.3, 5.75],
      ["2024-05-13", 5.06, 4.3, 5.75],
    ].map(([observedAt, value, refLow, refHigh]) =>
      reading({
        id: `rbc${observedAt}`,
        metricCode: "rbc",
        unit: "M/uL",
        value: value as number,
        refLow: refLow as number,
        refHigh: refHigh as number,
        observedAt: observedAt as string,
      }),
    );
    const target = reading({
      id: "rbc2024-10-10",
      metricCode: "rbc",
      unit: "M/uL",
      value: 4.02,
      refLow: 3900000,
      refHigh: 5200000,
      observedAt: "2024-10-10",
    });
    const [action] = planRefScale([target], [...peers, target]);
    expect(action).toMatchObject({ patch: { refLow: 3.9, refHigh: 5.2 } });
  });

  it("picks the scale the metric's own ranges live at", () => {
    // 0.25 against 20 - 500 is bracketed by BOTH 0.01 and 0.001; only 0.001
    // lands the range where every other eosinophil range of this user sits.
    const peers = [
      ["2014-03-26", 0.09, 0.05, 0.7],
      ["2016-01-09", 0.13, 0.02, 0.7],
      ["2019-07-13", 0.11, 0.02, 0.5],
      ["2021-10-14", 0.11, 0.02, 0.5],
      ["2023-03-17", 0.05, 0, 0.7],
      ["2024-05-13", 0.09, 0, 0.7],
    ].map(([observedAt, value, refLow, refHigh]) =>
      reading({
        id: `eo${observedAt}`,
        metricCode: "eosinophils_abs",
        unit: "K/uL",
        value: value as number,
        refLow: refLow as number,
        refHigh: refHigh as number,
        observedAt: observedAt as string,
      }),
    );
    const target = reading({
      id: "eo2024-11-20",
      metricCode: "eosinophils_abs",
      unit: "K/uL",
      value: 0.25,
      refLow: 20,
      refHigh: 500,
      observedAt: "2024-11-20",
    });
    const [action] = planRefScale([target], [...peers, target]);
    expect(action).toMatchObject({ patch: { refLow: 0.02, refHigh: 0.5 } });
  });

  it("allows 5 % of slack, so albumin 5.349 fits a 3.5 - 5.3 range", () => {
    const peers = [
      ["2021-12-04", 4.53, 3.5, 5.2],
      ["2026-04-23", 4.7, 3.2, 4.8],
    ].map(([observedAt, value, refLow, refHigh]) =>
      reading({
        id: `alb${observedAt}`,
        metricCode: "albumin",
        unit: "g/dL",
        value: value as number,
        refLow: refLow as number,
        refHigh: refHigh as number,
        observedAt: observedAt as string,
      }),
    );
    const target = reading({
      id: "alb2023-03-17",
      metricCode: "albumin",
      unit: "g/dL",
      value: 5.349,
      refLow: 35,
      refHigh: 53,
      observedAt: "2023-03-17",
    });
    const [action] = planRefScale([target], [...peers, target]);
    expect(action).toMatchObject({ patch: { refLow: 3.5, refHigh: 5.3 } });
  });

  it("leaves a genuinely high result alone", () => {
    // CRP 15.8 sits inside 0 - 49.9. Nothing to rescale.
    const target = reading({
      id: "crp2023-03-17",
      metricCode: "crp",
      unit: "mg/L",
      value: 15.8,
      refLow: 0,
      refHigh: 49.9,
      observedAt: "2023-03-17",
    });
    expect(planRefScale([target], [target])).toHaveLength(0);
  });

  it("refuses when the value itself is the broken part", () => {
    // 0.00000523 M/uL is a red cell count divided by a million, not a range
    // in the wrong scale.
    const peers = [
      ["2021-10-14", 4.94, 4.3, 5.75],
      ["2022-10-20", 5.11, 4.3, 5.75],
      ["2023-03-17", 4.86, 4.3, 5.75],
    ].map(([observedAt, value, refLow, refHigh]) =>
      reading({
        id: `rbc${observedAt}`,
        metricCode: "rbc",
        unit: "M/uL",
        value: value as number,
        refLow: refLow as number,
        refHigh: refHigh as number,
        observedAt: observedAt as string,
      }),
    );
    const target = reading({
      id: "rbc-broken",
      metricCode: "rbc",
      unit: "M/uL",
      value: 0.00000523,
      refLow: 4.3,
      refHigh: 5.75,
      observedAt: "2025-12-09",
    });
    expect(planRefScale([target], [...peers, target])).toHaveLength(0);
  });

  it("rides on a single factor when no reading brackets its own range", () => {
    // Both of this user's T3 rows carry the ng/mL range next to a ng/dL
    // value, so there is no clean peer; only x100 brackets 126.
    const other = reading({
      id: "t3a",
      metricCode: "total_t3",
      unit: "ng/dL",
      value: 110,
      refLow: 0.6,
      refHigh: 1.81,
      observedAt: "2026-04-23",
    });
    const target = reading({
      id: "t3b",
      metricCode: "total_t3",
      unit: "ng/dL",
      value: 126,
      refLow: 0.6,
      refHigh: 1.81,
      observedAt: "2025-12-09",
    });
    expect(planRefScale([target], [other, target])[0]).toMatchObject({
      patch: { refLow: 60, refHigh: 181 },
    });
  });

  it("stays quiet when two factors bracket and nothing breaks the tie", () => {
    // 0.25 in 20 - 500 fits both x0.01 and x0.001; with no clean peer the
    // curator has no way to choose.
    const target = reading({
      id: "eo-alone",
      metricCode: "eosinophils_abs",
      unit: "K/uL",
      value: 0.25,
      refLow: 20,
      refHigh: 500,
      observedAt: "2024-11-20",
    });
    expect(planRefScale([target], [target])).toHaveLength(0);
  });

  it("leaves a result that misses its range by less than a factor", () => {
    // Urobilinogen 0.1 under a 0.2 - 1 mg/dL range is a low result, and x0.1
    // would happily "fix" it into 0.02 - 0.1.
    const target = reading({
      id: "uro",
      metricCode: "urine_urobilinogen",
      unit: "mg/dL",
      value: 0.1,
      refLow: 0.2,
      refHigh: 1,
      observedAt: "2024-05-13",
    });
    expect(planRefScale([target], [target])).toHaveLength(0);
  });

  it("does not rescale the same row twice", () => {
    const target = reading({
      id: "plt2024-11-20",
      metricCode: "platelets",
      unit: "K/uL",
      value: 224,
      refLow: 150,
      refHigh: 370,
      observedAt: "2024-11-20",
      flags: [{ ref_rescaled: { factor: 0.001, orig: [150000, 370000] } }],
    });
    expect(planRefScale([target], [...platelets, target])).toHaveLength(0);
  });

  it("never touches a value", () => {
    const target = reading({
      id: "plt2024-11-20",
      metricCode: "platelets",
      unit: "K/uL",
      value: 224,
      refLow: 150000,
      refHigh: 370000,
    });
    for (const a of planRefScale([target], [...platelets, target]))
      expect((a as { patch: ReadingLike }).patch.value).toBeUndefined();
  });
});

describe("planUrineText", () => {
  const strip = (r: Partial<ReadingLike> & { id: string }) =>
    reading({ value: null, unit: null, ...r });

  it("moves a blood glucose 'Negativ' to the urine strip", () => {
    const row = strip({
      id: "g",
      metricCode: "glucose",
      valueText: "Negativ",
      refLow: 74,
      refHigh: 106,
      observedAt: "2019-07-13",
    });
    const [action] = planUrineText([row], byCode);
    expect(action).toMatchObject({
      type: "fix",
      check: "urine_text",
      readingId: "g",
      patch: {
        metricCode: "urine_glucose",
        unit: null,
        refLow: null,
        refHigh: null,
      },
    });
    const patch = (action as { patch: ReadingLike }).patch;
    expect(patch.flags).toContain("moved_urine");
    expect(patch.flags).toContainEqual({
      moved: { from: "glucose", refLow: 74, refHigh: 106 },
    });
  });

  it("sends white cells to the dipstick metric", () => {
    const row = strip({
      id: "w",
      metricCode: "wbc",
      valueText: "Negativ",
      refLow: null,
      refHigh: null,
    });
    expect(planUrineText([row], byCode)[0]).toMatchObject({
      patch: { metricCode: "urine_leukocytes" },
    });
  });

  it("reads the Romanian 'Absente' on red cells", () => {
    const row = strip({
      id: "r",
      metricCode: "rbc",
      valueText: "Absente",
      refLow: null,
      refHigh: null,
    });
    expect(planUrineText([row], byCode)[0]).toMatchObject({
      patch: { metricCode: "urine_red_blood_cells" },
    });
  });

  it("leaves a numeric reading where it is", () => {
    const row = reading({ id: "n", metricCode: "glucose", value: 92 });
    expect(planUrineText([row], byCode)).toHaveLength(0);
  });

  it("leaves free text that is not a strip answer", () => {
    const row = strip({
      id: "t",
      metricCode: "glucose",
      valueText: "see attached report",
    });
    expect(planUrineText([row], byCode)).toHaveLength(0);
  });

  it("leaves a metric that has no urine counterpart", () => {
    const row = strip({ id: "c", metricCode: "crp", valueText: "Negativ" });
    expect(planUrineText([row], byCode)).toHaveLength(0);
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

  it("reads a CBC count in its own unit, not against a cells/uL range", () => {
    const rows = [
      reading({
        id: "plt",
        metricCode: "platelets",
        unit: "K/uL",
        value: 224,
        refLow: 150000,
        refHigh: 370000,
      }),
    ];
    expect(planImplausible(rows, byCode)).toHaveLength(0);
  });

  it("still catches a platelet count of 224000 K/uL", () => {
    const rows = [
      reading({
        id: "plt",
        metricCode: "platelets",
        unit: "K/uL",
        value: 224000,
        refLow: 150000,
        refHigh: 370000,
      }),
    ];
    expect(planImplausible(rows, byCode)[0]).toMatchObject({
      type: "queue",
      kind: "implausible",
      subject: { readingId: "plt" },
    });
  });

  it("catches a red cell count divided by a million", () => {
    const rows = [
      reading({
        id: "rbc",
        metricCode: "rbc",
        unit: "M/uL",
        value: 0.00000523,
        refLow: 4.3,
        refHigh: 5.75,
      }),
    ];
    expect(planImplausible(rows, byCode)).toHaveLength(1);
  });
});

describe("acceptsOptimal", () => {
  const platelets = byCode.get("platelets")!;

  it("accepts a trusted band that sits inside the lab range", () => {
    expect(
      acceptsOptimal(
        { low: 150, high: 250, source: "Attia/Outlive" },
        platelets,
        { refLow: 150, refHigh: 370 },
      ),
    ).toBe(true);
  });

  it("still asks when the band reaches under the lab range", () => {
    // "White Blood Cell Count 3.5 - 6 K/uL" against a lab floor of 3.9.
    expect(
      acceptsOptimal(
        { low: 3.5, high: 6, source: "Attia/Outlive" },
        byCode.get("wbc")!,
        { refLow: 3.9, refHigh: 10.2 },
      ),
    ).toBe(false);
  });

  it("accepts anything trusted when the labs never printed a range", () => {
    expect(
      acceptsOptimal(
        { low: 1.5, high: 2.2, source: "Function Health" },
        platelets,
        null,
      ),
    ).toBe(true);
  });

  it("refuses a source we do not know", () => {
    expect(
      acceptsOptimal(
        { low: 150, high: 250, source: "some blog" },
        platelets,
        null,
      ),
    ).toBe(false);
  });

  it("refuses a band written in another unit", () => {
    // Lp(a) < 75 nmol/L against a catalog that now reads mg/dL.
    expect(
      acceptsOptimal(
        { low: null, high: 75, source: "Attia/Outlive", unit: "nmol/L" },
        byCode.get("lp_a")!,
        null,
      ),
    ).toBe(false);
  });

  it("refuses a proposal with no band at all", () => {
    expect(
      acceptsOptimal(
        { low: null, high: null, source: "Attia/Outlive" },
        platelets,
        null,
      ),
    ).toBe(false);
  });
});

describe("planForeignReadings", () => {
  // Six real glucose rows: range midpoints all sit around 85.
  const glucose = [
    ["2016-06-24", 83, 60, 99],
    ["2019-07-13", 93, 60, 110],
    ["2021-10-14", 98.5, 60, 110],
    ["2022-10-20", 92.9, 60, 99],
    ["2024-11-20", 82, 74, 106],
    ["2025-12-09", 81, 74, 106],
  ].map(([observedAt, value, refLow, refHigh]) =>
    reading({
      id: `g${observedAt}`,
      value: value as number,
      refLow: refLow as number,
      refHigh: refHigh as number,
      observedAt: observedAt as string,
    }),
  );

  it("queues a reading whose own range is far below the metric's median", () => {
    // Calcium (8.6-10.2) that the legacy import dropped into glucose.
    const alien = reading({
      id: "calcium",
      value: 9.8,
      refLow: 8.6,
      refHigh: 10.2,
      observedAt: "2014-07-07",
    });
    const [action] = planForeignReadings([alien], [...glucose, alien], byCode);
    expect(action).toMatchObject({
      type: "queue",
      check: "foreign_reading",
      kind: "foreign_reading",
      subject: { readingId: "calcium", metricCode: "glucose", value: 9.8 },
    });
    expect((action as { options: string[] }).options).toEqual([
      "Delete this reading",
      "Move to metric…",
      "Keep",
    ]);
    expect((action as { question: string }).question).toContain("2014-07-07");
  });

  it("queues a reading whose range is more than 3x above the median", () => {
    const alien = reading({
      id: "high",
      value: 300,
      refLow: 200,
      refHigh: 400,
      observedAt: "2020-01-01",
    });
    expect(
      planForeignReadings([alien], [...glucose, alien], byCode),
    ).toHaveLength(1);
  });

  it("leaves a reading whose range is merely a bit different alone", () => {
    const ok = reading({
      id: "ok",
      value: 91,
      refLow: 70,
      refHigh: 140,
      observedAt: "2020-01-01",
    });
    expect(planForeignReadings([ok], [...glucose, ok], byCode)).toHaveLength(0);
  });

  it("queues a text-only row on an otherwise numeric metric", () => {
    const strip = reading({
      id: "urine",
      value: null,
      valueText: "Negativ",
      refLow: 70,
      refHigh: 99,
      observedAt: "2024-05-13",
    });
    const [action] = planForeignReadings([strip], [...glucose, strip], byCode);
    expect(action).toMatchObject({
      kind: "foreign_reading",
      subject: { readingId: "urine", valueText: "Negativ" },
    });
    expect((action as { question: string }).question).toContain('"Negativ"');
  });

  it("sees through a unit glued onto the text answer", () => {
    const strip = reading({
      id: "norm",
      value: null,
      valueText: "norm mg/dl",
      refLow: 70,
      refHigh: 99,
      observedAt: "2015-03-21",
    });
    expect(
      planForeignReadings([strip], [...glucose, strip], byCode),
    ).toHaveLength(1);
  });

  it("ignores a text row that is not a yes/no answer", () => {
    const note = reading({
      id: "note",
      value: null,
      valueText: "see attached report",
      refLow: 70,
      refHigh: 99,
    });
    expect(
      planForeignReadings([note], [...glucose, note], byCode),
    ).toHaveLength(0);
  });

  it("stays quiet on a metric with fewer than 4 numeric readings", () => {
    const few = glucose.slice(0, 2);
    const alien = reading({
      id: "calcium",
      value: 9.8,
      refLow: 8.6,
      refHigh: 10.2,
    });
    expect(planForeignReadings([alien], [...few, alien], byCode)).toHaveLength(
      0,
    );
  });

  it("skips a reading the user already said to keep", () => {
    const alien = reading({
      id: "calcium",
      value: 9.8,
      refLow: 8.6,
      refHigh: 10.2,
      flags: ["foreign_ok"],
    });
    expect(
      planForeignReadings([alien], [...glucose, alien], byCode),
    ).toHaveLength(0);
  });

  it("never emits a fix or a delete", () => {
    const alien = reading({
      id: "calcium",
      value: 9.8,
      refLow: 8.6,
      refHigh: 10.2,
    });
    expect(
      planForeignReadings([alien], [...glucose, alien], byCode).every(
        (a) => a.type === "queue",
      ),
    ).toBe(true);
  });
});
