import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { scoreHypotheses } from "./hypotheses";
import {
  artefactCorrection,
  candidatesOn,
  judge,
  namesFor,
  pageLines,
  rematch,
  windowText,
  type SheetAnswer,
  type SheetQuestion,
} from "./second-pass";

/**
 * Every fixture below is copied verbatim out of `uploads.raw_text` on the
 * owner's account: the ten rows `/review` was asking about are the reason this
 * file exists, so the tests read the same characters the sheets printed.
 */
const BIOCLINICA_CRP = [
  "VALORI BIOLOGICE DE REFERINȚĂ 	ANTECEDENT",
  "Proteina C reactiv	ă 	20.11.2024",
  "< 0,050  mg/dL 	(≤ 0,330) 	0,054",
  "(≤ 0,500)",
  "< 0,50 mg/L 	(≤ 3,30) 	0,54",
  "(≤ 5,00)",
  "(ser, imunoturbidimetrie)",
].join("\n");

const BIOCLINICA_T3 = [
  "(ser, chemiluminiscență)",
  "TT3- Triiodotironin	ă seric ă total ă 	09.12.2025",
  "1,10 ng/mL 	(0,60 - 1,81) 	1,26",
  "2,03 nmol/L 	(0,92 - 2,79)",
  "(ser, chemiluminiscență)",
].join("\n");

const SYNEVO_RBC = "Numar eritrocite 	5.82 	mil./μL 	4.3 - 5.7";

const MINDRAY_APO = [
  "Apolipoproteina A1*",
  "- metoda imunoturbidimetrica",
  "- Alinity, spectrofotometrie, ser 	1.69 	g/L 	0.95 - 1.86",
].join("\n");

const MINDRAY_CHOL = [
  "6. Colesterol seric total -Ser - spectrofotometrie (Mindray BS 480) 	201.97 mg/dl 	0 - 201.1 / mg/dl",
  "10. HDL colesterol -Ser - spectrofotometrie (Mindray BS 480) 	57.19 mg/dl ",
].join("\n");

const ask = (over: Partial<SheetQuestion> = {}): SheetQuestion => ({
  readingId: "r1",
  metricCode: "rbc",
  metricName: "Red Blood Cell Count",
  aliases: ["Hematii", "Eritrocite", "Numar eritrocite"],
  stored: 5.82,
  unit: "M/uL",
  observedAt: "2014-03-26",
  rawText: SYNEVO_RBC,
  ...over,
});

describe("normalisation", () => {
  it("joins a word broken across a line break", () => {
    expect(pageLines("Trigliceri-\nde 	120 mg/dl")).toEqual([
      "Trigliceride 120 mg/dl",
    ]);
  });

  it("collapses tabs and non-breaking spaces to one space", () => {
    expect(pageLines("Hemoglobin ă 	15,6 g/dL")).toEqual([
      "Hemoglobin ă 15,6 g/dL",
    ]);
  });

  it("reads a decimal comma and a thousands dot", () => {
    expect(
      candidatesOn("Hematii 	5.230.000  /mm³ 	(4.300.000 - 5.750.000)")[0],
    ).toEqual({ value: 5230000, unit: "/mm³" });
    expect(candidatesOn("1,10 ng/mL 	(0,60 - 1,81)")[0]).toEqual({
      value: 1.1,
      unit: "ng/mL",
    });
  });

  it("keeps a censored result as a value, not as a range bound", () => {
    expect(candidatesOn("< 0,50 mg/L 	(≤ 3,30) 	0,54")[0]).toEqual({
      value: 0.5,
      unit: "mg/L",
    });
  });
});

describe("the deterministic re-match", () => {
  it("settles a censored value the first pass read as a bound", () => {
    const hit = rematch(
      ask({
        metricCode: "crp",
        metricName: "CRP",
        aliases: ["Proteina C reactiva", "PCR"],
        stored: 0.5,
        unit: "mg/L",
        rawText: BIOCLINICA_CRP,
      }),
    );
    expect(hit?.value).toBe(0.5);
    expect(hit?.line).toContain("< 0,50 mg/L");
  });

  it("settles a value printed in a unit no conversion table knows", () => {
    const hit = rematch(ask());
    expect(hit?.value).toBe(5.82);
    expect(hit?.unit).toBe("mil./μL");
  });

  it("converts the sheet's unit into the reading's", () => {
    const hit = rematch(
      ask({
        metricCode: "total_t3",
        metricName: "Total T3",
        aliases: namesFor({
          code: "total_t3",
          name: "Total T3",
          unit: "ng/dL",
        }),
        stored: 110,
        unit: "ng/dL",
        rawText: BIOCLINICA_T3,
      }),
    );
    expect(hit?.line).toContain("1,10 ng/mL");
  });

  it("reaches a value printed below its own heading", () => {
    const hit = rematch(
      ask({
        metricCode: "apolipoprotein_a1",
        metricName: "Apolipoprotein A1",
        aliases: namesFor({
          code: "apolipoprotein_a1",
          name: "Apolipoprotein A1",
          unit: "mg/dL",
        }),
        stored: 169,
        unit: "mg/dL",
        rawText: MINDRAY_APO,
      }),
    );
    expect(hit?.value).toBe(1.69);
    expect(hit?.unit).toBe("g/L");
  });

  it("finds the analyte under a Romanian name the first pass never had", () => {
    const hit = rematch(
      ask({
        metricCode: "total_cholesterol",
        metricName: "Cholesterol, Total",
        aliases: namesFor({
          code: "total_cholesterol",
          name: "Cholesterol, Total",
          unit: "mg/dL",
        }),
        stored: 201.97,
        unit: "mg/dL",
        rawText: MINDRAY_CHOL,
      }),
    );
    expect(hit?.line).toContain("Colesterol seric total");
  });

  it("does not invent a hit when the number is not there", () => {
    expect(rematch(ask({ stored: 4.11 }))).toBeNull();
  });

  it("shows the model the lines around the name", () => {
    const text = windowText(BIOCLINICA_T3, ["TT3"], 1);
    expect(text).toContain("1,10 ng/mL");
    expect(text).not.toContain("2,03 nmol/L");
  });
});

describe("the artefact rule", () => {
  it("accepts a decimal shift that lands inside the metric's bounds", () => {
    // RBC: BOUNDS is [1, 10] M/uL, so 5.82 is a person and 58.2 is not.
    expect(artefactCorrection(58.2, 5.82, "rbc")).toBe(5.82);
    expect(artefactCorrection(0.0582, 5.82, "rbc")).toBe(5.82);
  });

  it("refuses a correction that lands outside the bounds", () => {
    expect(artefactCorrection(5.82, 58.2, "rbc")).toBeNull();
  });

  it("refuses a gap that is not a decimal shift", () => {
    expect(artefactCorrection(5.82, 4.11, "rbc")).toBeNull();
  });

  it("refuses to correct a metric with no bounds to check against", () => {
    expect(artefactCorrection(169, 16.9, "apolipoprotein_a1")).toBeNull();
  });
});

describe("what the model's answer means", () => {
  const answer = (over: Partial<SheetAnswer> = {}): SheetAnswer => ({
    found: true,
    value: 5.82,
    unit: "M/uL",
    line: "Numar eritrocite 5.82 mil./μL 4.3 - 5.7",
    ...over,
  });

  it("settles a value the sheet agrees with", () => {
    expect(judge(ask(), answer()).outcome).toBe("model");
  });

  it("applies an obvious decimal shift on its own", () => {
    const out = judge(ask({ stored: 58.2 }), answer());
    expect(out.outcome).toBe("corrected");
    expect(out.value).toBe(5.82);
  });

  it("leaves a genuine tie for the person, with the line", () => {
    const out = judge(ask({ stored: 4.11 }), answer());
    expect(out.outcome).toBe("person");
    expect(out.sheetValue).toBe(5.82);
    expect(out.line).toContain("Numar eritrocite");
  });

  it("asks once when the sheet does not print it, and hides it the second time", () => {
    const missing = answer({ found: false, value: null, line: "" });
    expect(judge(ask(), missing, 0).outcome).toBe("person");
    expect(judge(ask(), missing, 1).outcome).toBe("unverified");
  });
});

describe("the engine and an unverified reading", () => {
  const latest = (
    v: number,
    extra: Partial<LatestValue> = {},
  ): LatestValue => ({
    value: v,
    unit: null,
    date: "2026-08-01",
    status: "green",
    optimalLow: null,
    optimalHigh: null,
    refLow: null,
    refHigh: null,
    ...extra,
  });

  const input = (unverified: boolean): ModelInput => ({
    today: "2026-08-27",
    profile: {},
    sex: "male",
    age: 45,
    latest: { hba1c: latest(6.1, unverified ? { unverified: true } : {}) },
    derived: {},
  });

  const rulesOf = (m: ModelInput) =>
    scoreHypotheses(m).find((h) => h.id === "insulin_resistance")!;

  it("counts a verified reading and skips an unverified one", () => {
    expect(rulesOf(input(false)).for.map((f) => f.rule)).toContain(
      "ir_hba1c_high",
    );
    const hidden = rulesOf(input(true));
    expect(hidden.for.map((f) => f.rule)).not.toContain("ir_hba1c_high");
    expect(hidden.missing.map((f) => f.rule)).toContain("ir_hba1c_high");
  });
});
