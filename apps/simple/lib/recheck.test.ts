import { describe, expect, it } from "vitest";
import { qualitative, type LatestValue, type ModelInput } from "./coverage";
import { rechecksOf } from "./recheck";

const at = (
  date: string,
  status: LatestValue["status"] = "green",
): LatestValue => ({
  value: 1,
  unit: null,
  date,
  status,
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
});

/* A 39-year-old man, last full panel seven months ago, folate two years ago. */
const APRIL = "2026-04-23";
const input: ModelInput = {
  today: "2026-11-16",
  profile: { sex: "male", birth_year: "1987" },
  sex: "male",
  age: 39,
  derived: {},
  latest: {
    ldl_cholesterol: at(APRIL, "red"),
    hdl_cholesterol: at(APRIL, "red"),
    triglycerides: at(APRIL),
    apolipoprotein_b: at(APRIL),
    ferritin: at(APRIL),
    vitamin_b12: at(APRIL),
    homocysteine: at(APRIL),
    folic_acid: at("2024-05-13"),
    vitamin_d: at(APRIL, "amber"),
    hba1c: at(APRIL),
    glucose: at(APRIL),
    insulin: at(APRIL),
    tsh: at("2026-10-01"),
    lp_a: at(APRIL),
  },
};

const hunches = [
  { kind: "drift", codes: ["ldl_cholesterol"] },
  { kind: "cluster", codes: ["homocysteine", "ferritin", "vitamin_b12"] },
  { kind: "cause", codes: ["alt", "glucose", "hba1c", "insulin"] },
];

describe("rechecksOf", () => {
  const out = rechecksOf(input, hunches);
  const ids = out.map((r) => r.id);
  const why = (id: string) => out.find((r) => r.id === id)?.why ?? "";

  it("lists the drifting lipids and the iron cluster first", () => {
    expect(why("lipids")).toMatch(/^Drifting/);
    expect(why("ferritin")).toMatch(/^Moved the worse way/);
    expect(why("b12")).toMatch(/^Moved the worse way/);
  });

  it("calls a two-year-old folate stale and an amber vitamin D due", () => {
    expect(why("folate")).toMatch(/once a year/);
    expect(why("vitamin_d")).toMatch(/optimal band/);
  });

  it("puts the rest of a seven-month-old core on the same needle", () => {
    expect(why("hba1c")).toMatch(/Same needle/);
    expect(ids.indexOf("hba1c")).toBeGreaterThan(ids.indexOf("folate"));
  });

  it("skips a recent TSH, a once-in-a-life Lp(a) and a cause hunch", () => {
    expect(ids).not.toContain("tsh");
    expect(ids).not.toContain("lpa");
    expect(why("glucose")).not.toMatch(/moving|drift/);
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
