import { describe, expect, it } from "vitest";
import { qualitative, type LatestValue, type ModelInput } from "./coverage";
import { rechecksOf } from "./recheck";

const at = (
  date: string,
  value: number,
  status: LatestValue["status"],
  ref: [number | null, number | null],
  perYear?: number,
): LatestValue => ({
  value,
  unit: null,
  date,
  status,
  optimalLow: null,
  optimalHigh: null,
  refLow: ref[0],
  refHigh: ref[1],
  ...(perYear != null ? { slope: { perYear, years: 4, n: 5 } } : {}),
});

/* A real 39-year-old man's last draw, seven months before "today". */
const APRIL = "2026-04-23";
const input: ModelInput = {
  today: "2026-11-16",
  profile: { sex: "male", birth_year: "1987" },
  sex: "male",
  age: 39,
  derived: {},
  latest: {
    ldl_cholesterol: at(APRIL, 131, "red", [0, 100], 5.6),
    hdl_cholesterol: at(APRIL, 50, "red", [60, null], -1.8),
    triglycerides: at(APRIL, 106, "amber", [null, 150], 9.6),
    apolipoprotein_b: at(APRIL, 99, "amber", [55, 140], 5),
    vitamin_d: at(APRIL, 32.7, "amber", [30, 100], -5.2),
    ferritin: at(APRIL, 79.6, "green", [22, 322], -9.9),
    vitamin_b12: at(APRIL, 472, "amber", [197, 771], 50),
    homocysteine: at(APRIL, 9.6, "green", [5.5, 16.2]),
    folic_acid: at("2024-05-13", 15.5, "green", [3.2, 19.6]),
    glucose: at(APRIL, 87, "amber", [74, 106], 1.7),
    insulin: at(APRIL, 5.7, "amber", [3, 25]),
    hba1c: at(APRIL, 5, "green", [4, 6]),
    tsh: at(APRIL, 1.1, "green", [0.55, 4.78]),
    lp_a: at(APRIL, 25, "green", [0, 30]),
    crp: at(APRIL, 0.64, "green", [0, 3.3], -1.7),
  },
};

const hunches = [
  { kind: "drift", codes: ["ldl_cholesterol"] },
  { kind: "cluster", codes: ["homocysteine", "ferritin", "vitamin_b12"] },
  { kind: "gap", codes: ["folic_acid"] },
  { kind: "cause", codes: ["alt", "glucose", "hba1c", "insulin"] },
];

describe("rechecksOf", () => {
  const out = rechecksOf(input, hunches);
  const ids = out.map((r) => r.id);
  const why = (id: string) => out.find((r) => r.id === id)?.why ?? "";

  it("buys the out-of-range lipid panel and ApoB with it", () => {
    expect(why("lipids")).toMatch(/lab range/);
    expect(why("apob")).toMatch(/lipid panel/);
  });

  it("buys a vitamin D whose own trend has crossed the range by now", () => {
    expect(why("vitamin_d")).toMatch(/on its trend/i);
  });

  it("does not buy normal values just because they are old or near a band", () => {
    for (const id of [
      "ferritin",
      "b12",
      "homocysteine",
      "folate",
      "glucose",
      "insulin",
      "hba1c",
      "tsh",
      "lpa",
      "crp",
    ])
      expect(ids).not.toContain(id);
  });

  it("buys nothing inside three months of the last draw", () => {
    const soon = rechecksOf({ ...input, today: "2026-06-01" }, hunches);
    expect(soon.filter((r) => !r.why.startsWith("Never"))).toEqual([]);
  });
});

describe("qualitative", () => {
  it("reads a serology's words and leaves numeric markers alone", () => {
    expect(qualitative("hbs_antigen", "Negativ")).toBe(0);
    expect(qualitative("hcv_antibodies", "0.17-Nonreactiv")).toBe(0);
    expect(qualitative("hcv_antibodies", "Pozitiv")).toBe(1);
    expect(qualitative("total_bilirubin", "Negativ")).toBeNull();
  });
});
