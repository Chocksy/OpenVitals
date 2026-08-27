import { describe, it, expect } from "vitest";
import {
  agrees,
  aliasesFor,
  findSheetLine,
  parseSheetLine,
  parseSheetNumber,
  planRawVerify,
  rawVerifyScope,
  thousandsStyle,
} from "./raw-verify";
import type { MetricLike, ReadingLike } from "./curator";

const METRICS: MetricLike[] = [
  { code: "rbc", name: "Red Blood Cell Count", unit: "M/uL" },
  { code: "crp", name: "CRP", unit: "mg/L" },
  { code: "platelets", name: "Platelet Count", unit: "K/uL" },
  { code: "wbc", name: "White Blood Cell Count", unit: "10^3/uL" },
  { code: "hemoglobin", name: "Hemoglobin", unit: "g/dL" },
  { code: "ferritin", name: "Ferritin", unit: "ng/mL" },
];
const byCode = new Map(METRICS.map((m) => [m.code, m]));

const reading = (r: Partial<ReadingLike> & { id: string }): ReadingLike => ({
  uploadId: "u1",
  metricCode: "rbc",
  value: null,
  valueText: null,
  unit: "M/uL",
  refLow: null,
  refHigh: null,
  observedAt: "2026-04-23",
  flags: null,
  ...r,
});

/**
 * Verbatim from `uploads.raw_text` of "Razvan - 23.04.2026.pdf", the sheet the
 * RBC 0.00000523 and the CRP 0.64 rows came off.
 */
const BIOCLINICA = [
  "Hemoleucogram ă 	09.12.2025",
  "Hematii  	5.230.000  /mm³ 	(4.300.000 - 5.750.000) 	5.600.000",
  "Hemoglobin ă 	15,6 g/dL 	(13,5 - 17,2) 	16,2",
  "Hematocrit  	46,9 % 	(39,5 - 50,5) 	49,4",
  "Trombocite  	236.000  /mm³ 	(150.000 - 370.000) 	235.000",
  "Leucocite  	5.180  /mm³ 	(3.900 - 10.200) 	5.830",
  "(sânge integral EDTA, citometrie de flux & citochimie & spectrofotometrie)",
  "Proteina C reactiv	ă 	09.12.2025",
  "0,064  mg/dL 	(≤ 0,330) 	< 0,050",
  "0,64 mg/L 	(≤ 3,30) 	< 0,50",
  "Schimbare interval biologic de referință începând cu 04.06.2025!",
  "(ser, imunoturbidimetrie)",
].join("\n");

/** Verbatim from "Razvan - 13.05.2024.pdf", a Mindray sheet in English-ish. */
const MINDRAY = [
  "(WBC) Numar total de leucocite 	7.26 10^3/ul 	3.5 - 10.0 / 10^3/ul",
  "(RBC) Numar total de eritrocite 	5.11 10^6/uL 	3.8 - 5.8 / 10^6/uL",
  "(HGB) Hemoglobina 	15.3 g/dl 	12.6 - 17.4 / g/dl",
  "(MCH) Hemoglobina eritrocitara medie 	29.9 pg 	27 - 35 / pg",
  "22. *Feritina -Ser - Chemiluminiscenta (Mindray CL-900i) 	115.29 ng/ml 	27 - 375 / ng/ml",
].join("\n");

describe("parseSheetNumber", () => {
  it("reads a Romanian thousands group", () => {
    expect(parseSheetNumber("4.020.000")).toBe(4020000);
    expect(parseSheetNumber("5.230.000")).toBe(5230000);
  });

  it("reads a comma as the decimal mark", () => {
    expect(parseSheetNumber("1,26")).toBe(1.26);
    expect(parseSheetNumber("0,064")).toBe(0.064);
  });

  it("only reads a single dot group as thousands when the line says so", () => {
    expect(parseSheetNumber("224.000", true)).toBe(224000);
    expect(parseSheetNumber("224.000", false)).toBe(224);
    expect(parseSheetNumber("5.11", false)).toBe(5.11);
    expect(parseSheetNumber("201.97", false)).toBe(201.97);
  });

  it("knows a count per mm³ is written with thousands dots", () => {
    expect(thousandsStyle("Trombocite  	224.000  /mm³")).toBe(true);
    expect(thousandsStyle("(RBC) eritrocite 	5.11 10^6/uL")).toBe(false);
  });
});

describe("parseSheetLine", () => {
  it("reads value, unit and range off a Bioclinica CBC line", () => {
    const line = "Hematii  	5.230.000  /mm³ 	(4.300.000 - 5.750.000) 	5.600.000";
    expect(parseSheetLine(line, 7)).toMatchObject({
      value: 5230000,
      unit: "/mm³",
      low: 4300000,
      high: 5750000,
    });
  });

  it("turns an upper bound alone into a range that starts at zero", () => {
    expect(parseSheetLine("0,64 mg/L 	(≤ 3,30) 	< 0,50")).toMatchObject({
      value: 0.64,
      unit: "mg/L",
      low: 0,
      high: 3.3,
    });
  });

  it("ignores the instrument name printed in brackets", () => {
    const line =
      "22. *Feritina -Ser - Chemiluminiscenta (Mindray CL-900i) 	115.29 ng/ml 	27 - 375 / ng/ml";
    expect(parseSheetLine(line, line.indexOf("Feritina") + 8)).toMatchObject({
      value: 115.29,
      unit: "ng/ml",
      low: 27,
      high: 375,
    });
  });

  it("ignores the collection date printed next to the analyte", () => {
    expect(parseSheetLine("Hemoleucogram ă 	09.12.2025", 15).value).toBeNull();
  });
});

describe("findSheetLine", () => {
  it("finds a Romanian name the PDF text layer broke apart", () => {
    expect(
      findSheetLine(BIOCLINICA, ["Hemoglobina"], "g/dL", "hemoglobin"),
    ).toMatchObject({ value: 15.6, unit: "g/dL", low: 13.5, high: 17.2 });
  });

  it("prefers the line printed in the reading's own unit", () => {
    expect(
      findSheetLine(BIOCLINICA, ["Proteina C reactiva", "CRP"], "mg/L", "crp"),
    ).toMatchObject({ value: 0.64, unit: "mg/L", low: 0, high: 3.3 });
  });

  it("prefers the haemoglobin row over the MCH row that shares its name", () => {
    expect(
      findSheetLine(MINDRAY, ["Hemoglobina"], "g/dL", "hemoglobin"),
    ).toMatchObject({ value: 15.3, unit: "g/dl" });
  });

  it("refuses an alias that is only a fragment of a longer word", () => {
    // "ALP" inside "Alpha 1", the alias that rewrote alkaline phosphatase.
    expect(
      findSheetLine("Alpha 1 	2.3 	1.5 - 4.5 %", ["ALP"], "U/L", "alp"),
    ).toBeNull();
    expect(
      findSheetLine(
        "Buletin de analize medicale nr: 133706",
        ["Calciu", "Calcium"],
        "mg/dL",
        "calcium",
      ),
    ).toBeNull();
  });

  it("keeps the value the sheet agrees with instead of a misread neighbour", () => {
    const line =
      "VITAMINA D \u2013 25 HIDROXYVITAMIN D	25.38 	>= 30 \u03bcg/L Nivel Optim";
    const read = findSheetLine(
      line,
      ["Vitamina D"],
      "ng/mL",
      "vitamin_d",
      25.38,
    );
    expect(agrees(read!.value, 25.38)).toBe(true);
  });

  it("reads the unit the lab printed next to the range", () => {
    expect(parseSheetLine("Leucocite 	4.09 	4 - 10 10^3/ul", 10)).toMatchObject({
      value: 4.09,
      unit: "10^3/ul",
      low: 4,
      high: 10,
    });
  });

  it("takes the count, not the percentage, off a differential line", () => {
    const line =
      "Neutrofile  	2.450  /mm\u00b3 	47,3 % (1.500 - 7.700)/mm\u00b3	3.220";
    expect(
      findSheetLine(line, ["Neutrofile"], "K/uL", "neutrophils_abs"),
    ).toMatchObject({ value: 2450, unit: "/mm\u00b3", low: 1500, high: 7700 });
  });

  it("takes the line whose value the sheet already agrees with", () => {
    // "Calciu" matches both the total and the ionised calcium line.
    const sheet = [
      "Calciu total * - Ser - spectrofotometrie  7.98 	8.4 - 10.8 / mg/dl",
      "Calciu ionic * - Ser - spectrofotometrie 	3.90 	3.8 - 5.2 / mg/dl",
    ].join("\n");
    expect(
      findSheetLine(sheet, ["Calciu"], "mg/dL", "calcium", 7.98),
    ).toMatchObject({ value: 7.98, low: 8.4, high: 10.8 });
  });

  it("returns null when the analyte is not on the sheet", () => {
    expect(findSheetLine(BIOCLINICA, ["Homocisteina"], "umol/L")).toBeNull();
  });
});

describe("aliasesFor", () => {
  it("puts the catalog name, the catalog aliases and the Romanian name together", () => {
    expect(aliasesFor(byCode.get("rbc")!, ["RBC"])).toEqual(
      expect.arrayContaining([
        "Red Blood Cell Count",
        "RBC",
        "Hematii",
        "Eritrocite",
      ]),
    );
  });
});

describe("agrees", () => {
  it("allows 2 %", () => {
    expect(agrees(5.23, 5.5)).toBe(false);
    expect(agrees(5.23, 5.25)).toBe(true);
    expect(agrees(null, null)).toBe(true);
    expect(agrees(null, 0)).toBe(false);
  });
});

/** A sheet shorter than 200 characters is not trusted; these are headers. */
const PADDING = [
  "CIOCANEL RAZVAN TUDOR\t  M, 39 ani\tBuletin de analize 26423E0133",
  "ADRESA \tDragasani, Valcea\tLUCRAT \tLaboratoarele Bioclinica srl",
  "VALORI BIOLOGICE DE REFERINTA \tANTECEDENT",
  "Rezultatele se refera numai la proba analizata.",
].join("\n");

describe("planRawVerify", () => {
  const raw = new Map([["u1", BIOCLINICA]]);

  it("puts the RBC 0.00000523 row back to 5.23 and keeps the original", () => {
    const row = reading({
      id: "rbc-broken",
      metricCode: "rbc",
      value: 0.00000523,
      unit: "M/uL",
      refLow: 4.3,
      refHigh: 5.75,
    });
    const [action] = planRawVerify([row], byCode, raw);
    expect(action).toMatchObject({
      type: "fix",
      check: "raw_verify",
      readingId: "rbc-broken",
      patch: { value: 5.23 },
    });
    const patch = (action as { patch: ReadingLike }).patch;
    expect(patch.flags).toContainEqual({
      raw_verified: {
        orig: { value: 0.00000523, refLow: 4.3, refHigh: 5.75 },
        sheet: "Hematii  	5.230.000  /mm³ 	(4.300.000 - 5.750.000) 	5.600.000",
      },
    });
  });

  it("gives the CRP row the sheet's own mg/L range", () => {
    const row = reading({
      id: "crp",
      metricCode: "crp",
      value: 0.64,
      unit: "mg/L",
      refLow: null,
      refHigh: 0.33,
    });
    const [action] = planRawVerify([row], byCode, raw);
    expect(action).toMatchObject({
      type: "fix",
      patch: { refLow: 0, refHigh: 3.3 },
    });
  });

  it("confirms a row the sheet agrees with, in another unit", () => {
    const row = reading({
      id: "plt",
      metricCode: "platelets",
      value: 236,
      unit: "K/uL",
      refLow: 150,
      refHigh: 370,
    });
    const [action] = planRawVerify([row], byCode, raw);
    expect(action).toMatchObject({
      type: "fix",
      patch: { flags: ["raw_confirmed"] },
    });
    expect((action as { patch: ReadingLike }).patch.value).toBeUndefined();
  });

  it("leaves the stored range alone when the sheet did not reprint one", () => {
    const raw2 = new Map([
      ["u1", `${PADDING}\n19. *Albumina serica *** -Ser - Spectrofotometrie \t53.49 g/L`],
    ]);
    const albumin: MetricLike = {
      code: "albumin",
      name: "Albumin",
      unit: "g/dL",
    };
    const row = reading({
      id: "alb",
      metricCode: "albumin",
      value: 5.349,
      unit: "g/dL",
      refLow: 3.5,
      refHigh: 5.3,
    });
    const [action] = planRawVerify(
      [row],
      new Map([["albumin", albumin]]),
      raw2,
    );
    expect(action).toMatchObject({ patch: { flags: ["raw_confirmed"] } });
  });

  it("keeps the stored value when the sheet agrees to within 2 %", () => {
    const raw2 = new Map([
      [
        "u1",
        `${PADDING}\nVITAMINA D \u2013 25 HIDROXYVITAMIN D\t25.38 \t>= 30 \u03bcg/L`,
      ],
    ]);
    const vitD: MetricLike = {
      code: "vitamin_d",
      name: "Vitamin D",
      unit: "ng/mL",
    };
    const row = reading({
      id: "vd",
      metricCode: "vitamin_d",
      value: 25.38,
      unit: "ng/mL",
      refLow: 30,
      refHigh: null,
    });
    const [action] = planRawVerify([row], new Map([["vitamin_d", vitD]]), raw2);
    expect(action).toMatchObject({ patch: { flags: ["raw_confirmed"] } });
  });

  it("asks instead of guessing when the analyte is not on the sheet", () => {
    const row = reading({
      id: "fer",
      metricCode: "ferritin",
      value: 900,
      unit: "ng/mL",
      refLow: 27,
      refHigh: 375,
    });
    const [action] = planRawVerify([row], byCode, raw);
    expect(action).toMatchObject({
      type: "queue",
      kind: "confirm_value",
      subject: { readingId: "fer", sheet: null },
    });
    expect((action as { options: string[] }).options).toEqual([
      "Keep",
      "Discard reading",
      "Note…",
    ]);
    expect((action as { question: string }).question).toContain("not found");
  });

  it("skips an upload with no usable text", () => {
    const row = reading({ id: "x", value: 0.00000523 });
    expect(
      planRawVerify([row], byCode, new Map([["u1", "short"]])),
    ).toHaveLength(0);
  });

  it("never emits a delete", () => {
    const rows = [
      reading({ id: "a", value: 0.00000523, refLow: 4.3, refHigh: 5.75 }),
      reading({ id: "b", metricCode: "ferritin", value: 900, unit: "ng/mL" }),
    ];
    expect(
      planRawVerify(rows, byCode, raw).every(
        (a) => a.type === "fix" || a.type === "queue",
      ),
    ).toBe(true);
  });
});

describe("rawVerifyScope", () => {
  const red = reading({ id: "red", value: 9, refLow: 4.3, refHigh: 5.75 });
  const green = reading({ id: "green", value: 5, refLow: 4.3, refHigh: 5.75 });
  const rescaled = reading({
    id: "rescaled",
    value: 5,
    refLow: 4.3,
    refHigh: 5.75,
    flags: [{ ref_rescaled: { factor: 1e-6, orig: [4300000, 5750000] } }],
  });
  const done = reading({
    id: "done",
    value: 9,
    refLow: 4.3,
    refHigh: 5.75,
    flags: ["raw_confirmed"],
  });

  it("takes the red rows, the rewritten rows and the asked-about rows", () => {
    const scope = rawVerifyScope(
      [red, green, rescaled, done],
      new Set(["green"]),
    );
    expect(scope.map((r) => r.id)).toEqual(["red", "green", "rescaled"]);
  });

  it("never re-checks a row it already verified", () => {
    expect(rawVerifyScope([done], new Set(["done"])).map((r) => r.id)).toEqual(
      [],
    );
  });
});

describe("unit reading", () => {
  it("does not mistake the slash between range and unit for a unit", () => {
    expect(
      parseSheetLine("Feritina* - Ser - 	19.3 	20 - 250 / ng/ml", 17),
    ).toMatchObject({ value: 19.3, unit: "ng/ml", low: 20, high: 250 });
  });
});
