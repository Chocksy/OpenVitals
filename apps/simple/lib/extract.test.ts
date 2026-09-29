import { describe, it, expect, vi } from "vitest";
import {
  stripCodeFences,
  transformAiResponse,
  metricCatalogPrompt,
  slugify,
  extractFromText,
  chunkText,
  mergeResults,
  CHUNK_AT,
  CHUNK_SIZE,
  EXTRACT_MAX_TOKENS,
  isPasswordError,
} from "./extract";

/** The model is the only non-pure part of `extractFromText`, so it is stubbed. */
const ai = vi.hoisted(() => ({
  reply: "" as string | ((prompt: string) => string),
  finish: "stop",
  last: null as any,
  calls: [] as any[],
}));
vi.mock("ai", () => ({
  generateText: async (opts: any) => {
    ai.last = opts;
    ai.calls.push(opts);
    const text =
      typeof ai.reply === "function" ? ai.reply(opts.prompt) : ai.reply;
    return { text, finishReason: ai.finish };
  },
  // `model()` wraps the provider with a default max-output cap; the tests
  // only care that the wrapped model is what reaches generateText.
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
  defaultSettingsMiddleware: () => ({}),
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => "stub-model",
}));

describe("stripCodeFences", () => {
  it("strips ```json fences", () => {
    expect(stripCodeFences('```json\n{"results":[]}\n```')).toBe(
      '{"results":[]}',
    );
  });

  it("strips ``` fences without language tag", () => {
    expect(stripCodeFences('```\n{"results":[]}\n```')).toBe('{"results":[]}');
  });

  it("returns plain JSON unchanged", () => {
    expect(stripCodeFences('{"results":[]}')).toBe('{"results":[]}');
  });

  it("trims surrounding whitespace", () => {
    expect(stripCodeFences('  \n {"results":[]} \n  ')).toBe('{"results":[]}');
  });
});

describe("transformAiResponse", () => {
  it("returns no readings for invalid JSON", () => {
    const r = transformAiResponse("not valid json");
    expect(r.readings).toHaveLength(0);
    expect(r.error).toBe("parse_failed");
  });

  it("returns no readings for an empty results array", () => {
    expect(transformAiResponse('{"results":[]}').readings).toHaveLength(0);
  });

  it("parses a simple lab result", () => {
    const input = JSON.stringify({
      results: [
        {
          analyte: "Glucose",
          code: "glucose",
          value: 95,
          unit: "mg/dL",
          referenceRangeLow: 74,
          referenceRangeHigh: 106,
          observedAt: "2025-01-15",
        },
      ],
      collectionDate: "2025-01-15",
      labName: "LabCorp",
    });
    const r = transformAiResponse(input);
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0]).toMatchObject({
      analyte: "Glucose",
      code: "glucose",
      value: 95,
      unit: "mg/dL",
      refLow: 74,
      refHigh: 106,
      observedAt: "2025-01-15",
    });
    expect(r.labName).toBe("LabCorp");
    expect(r.collectionDate).toBe("2025-01-15");
  });

  it('handles "< X" values by extracting the number', () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [{ analyte: "CRP", value: null, valueText: "< 0.5" }],
      }),
    );
    expect(r.readings[0]!.value).toBeCloseTo(0.5);
    expect(r.readings[0]!.valueText).toBe("< 0.5");
  });

  it('handles "> X" values', () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [{ analyte: "Ferritin", value: null, valueText: "> 1000" }],
      }),
    );
    expect(r.readings[0]!.value).toBeCloseTo(1000);
  });

  it('handles "≤ X" and "≥ X" Unicode comparators', () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [{ analyte: "TSH", value: null, valueText: "≤ 0.01" }],
      }),
    );
    expect(r.readings[0]!.value).toBeCloseTo(0.01);
  });

  it("handles comma-decimal numbers in < values", () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [{ analyte: "CRP", value: null, valueText: "< 0,5" }],
      }),
    );
    expect(r.readings[0]!.value).toBeCloseTo(0.5);
  });

  it("uses collectionDate as fallback observedAt", () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [{ analyte: "Glucose", value: 100 }],
        collectionDate: "2025-03-20",
      }),
    );
    expect(r.readings[0]!.observedAt).toBe("2025-03-20");
  });

  it("uses today as fallback when no date is given", () => {
    const r = transformAiResponse(
      JSON.stringify({ results: [{ analyte: "Glucose", value: 100 }] }),
    );
    expect(r.readings[0]!.observedAt).toBe(
      new Date().toISOString().split("T")[0],
    );
  });

  it("handles missing optional fields gracefully", () => {
    const r = transformAiResponse(
      JSON.stringify({ results: [{ analyte: "Unknown Test", value: 42 }] }),
    );
    expect(r.readings[0]).toMatchObject({
      analyte: "Unknown Test",
      code: null,
      value: 42,
      unit: null,
      refLow: null,
      refHigh: null,
    });
  });

  it("stringifies a numeric value into valueText", () => {
    const r = transformAiResponse(
      JSON.stringify({ results: [{ analyte: "Glucose", value: 95 }] }),
    );
    expect(r.readings[0]!.valueText).toBe("95");
  });

  it("handles markdown-wrapped JSON responses", () => {
    const r = transformAiResponse(
      '```json\n{"results":[{"analyte":"HbA1c","code":"hba1c","value":5.4,"unit":"%"}]}\n```',
    );
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0]!.code).toBe("hba1c");
    expect(r.readings[0]!.value).toBe(5.4);
  });

  it("parses multiple results", () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [
          { analyte: "Glucose", value: 95 },
          { analyte: "Hemoglobin", value: 14.2 },
          { analyte: "WBC", value: 6.8 },
        ],
        collectionDate: "2025-06-01",
      }),
    );
    expect(r.readings.map((x) => x.analyte)).toEqual([
      "Glucose",
      "Hemoglobin",
      "WBC",
    ]);
  });
});

describe("metricCatalogPrompt", () => {
  it("lists code, name, unit and aliases", () => {
    const p = metricCatalogPrompt([
      { code: "glucose", name: "Glucose", unit: "mg/dL", aliases: ["Glucoză"] },
      { code: "tsh", name: "TSH", unit: null, aliases: null },
    ]);
    expect(p).toContain("glucose | Glucose | mg/dL | Glucoză");
    expect(p).toContain("tsh | TSH |  | ");
    expect(p).toContain("best matching metric code");
  });
});

describe("slugify", () => {
  it("slugs analyte names", () => {
    expect(slugify("Total Cholesterol")).toBe("total_cholesterol");
    expect(slugify("Ac. anti-TPO (µIU/mL)")).toBe("ac_anti_tpo_iu_ml");
    expect(slugify("Glucoză")).toBe("glucoza");
    expect(slugify("!!!")).toBe("unknown");
  });
});

describe("extractFromText", () => {
  const LAB_REPORT = `HEMOGRAMA
Glucoza\t95\tmg/dL\t74 - 106
TSH\t2.1\tuIU/mL\t0.4 - 4.0`;

  it("turns the model answer into readings", async () => {
    ai.reply = JSON.stringify({
      collectionDate: "2025-01-15",
      labName: "Synevo",
      results: [
        {
          analyte: "Glucose",
          code: "glucose",
          value: 95,
          unit: "mg/dL",
          referenceRangeLow: 74,
          referenceRangeHigh: 106,
        },
        { analyte: "TSH", code: "tsh", value: 2.1, unit: "uIU/mL" },
      ],
    });
    const r = await extractFromText(LAB_REPORT, [
      { code: "glucose", name: "Glucose", unit: "mg/dL", aliases: ["Glucoza"] },
      { code: "tsh", name: "TSH", unit: "uIU/mL", aliases: null },
    ]);
    expect(r.readings.map((x) => x.code)).toEqual(["glucose", "tsh"]);
    expect(r.readings[0]!.observedAt).toBe("2025-01-15");
    expect(r.labName).toBe("Synevo");
  });

  it("sends the known metrics with the prompt and keeps the source text", async () => {
    ai.reply = '{"results":[]}';
    const r = await extractFromText(LAB_REPORT, [
      { code: "glucose", name: "Glucose", unit: "mg/dL", aliases: null },
    ]);
    expect(ai.last.system).toContain("glucose | Glucose | mg/dL");
    expect(ai.last.prompt).toBe(LAB_REPORT);
    expect(r.text).toBe(LAB_REPORT);
  });

  it("survives an unparseable answer the same way the pure step does", async () => {
    ai.reply = "sorry, I cannot read that";
    const r = await extractFromText(LAB_REPORT, []);
    expect(r.error).toBe("parse_failed");
    expect(r.readings).toHaveLength(0);
  });

  it("caps the text it reads at 60k characters, in page groups", async () => {
    ai.reply = '{"results":[]}';
    ai.calls = [];
    await extractFromText("x".repeat(70000), []);
    const sent = ai.calls.map((c) => c.prompt as string);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((p) => p.length <= CHUNK_SIZE + 2400)).toBe(true);
    // header and overlap repeat a little; the body never passes 60k
    expect(sent.join("").length).toBeLessThan(60000 + sent.length * 2400);
  });

  it("asks for a cap large enough for a whole report, reasoning minimal", async () => {
    ai.reply = '{"results":[]}';
    await extractFromText(LAB_REPORT, []);
    expect(ai.last.maxOutputTokens).toBe(EXTRACT_MAX_TOKENS);
    expect(ai.last.providerOptions.openrouter.reasoning.effort).toBe("minimal");
  });

  it("fails a read the output cap cut off, rows and all", async () => {
    ai.reply = JSON.stringify({
      results: [{ analyte: "Glucose", code: "glucose", value: 95 }],
    });
    ai.finish = "length";
    const r = await extractFromText(LAB_REPORT, []);
    ai.finish = "stop";
    expect(r.error).toBe("truncated");
    expect(r.readings).toHaveLength(0);
  });

  it("reads a long report in groups and merges them, dated by the header", async () => {
    const page = (n: number) =>
      [`RECOLTAT 18.08.2026 page ${n}`, ...Array(60).fill("x".repeat(40))].join(
        "\n",
      );
    const text = [1, 2, 3, 4, 5].map(page).join("\n\n");
    expect(text.length).toBeGreaterThan(CHUNK_AT);
    ai.calls = [];
    ai.reply = (prompt: string) =>
      JSON.stringify({
        // only the first group sees a collection date in this stub
        ...(prompt.startsWith("RECOLTAT 18.08.2026 page 1") &&
        !prompt.includes("page 2")
          ? { collectionDate: "2026-08-18", reportNo: "26818E0252" }
          : {}),
        pending: prompt.includes("page 5") ? ["Estrone"] : [],
        results: [
          // every group repeats ferritin (the overlap), and adds its own row
          { analyte: "Ferritin", code: "ferritin", value: 8.2 },
          {
            analyte: `Test ${ai.calls.length}`,
            value: ai.calls.length,
            unit: "U/L",
          },
        ],
      });
    const r = await extractFromText(text, []);
    expect(ai.calls.length).toBeGreaterThan(1);
    expect(r.readings.filter((x) => x.code === "ferritin")).toHaveLength(1);
    expect(r.readings.every((x) => x.observedAt === "2026-08-18")).toBe(true);
    expect(r.reportNo).toBe("26818E0252");
    expect(r.pending).toEqual(["Estrone"]);
  });
});

describe("transformAiResponse, phase 41", () => {
  it("stores `< 8,0` as 8 and says it is a bound", () => {
    const r = transformAiResponse(
      JSON.stringify({
        results: [
          { analyte: "GGT", value: null, valueText: "< 8,0" },
          { analyte: "CRP", value: 0.5, valueText: "≤ 0,5" },
          { analyte: "TSH", value: 2.1, valueText: "2,1" },
        ],
      }),
    );
    expect(r.readings[0]).toMatchObject({ value: 8, censored: "<" });
    expect(r.readings[1]).toMatchObject({ value: 0.5, censored: "<" });
    expect(r.readings[2]!.censored).toBeUndefined();
  });

  it("keeps an antecedent with its own date, and drops one that is not", () => {
    const r = transformAiResponse(
      JSON.stringify({
        collectionDate: "2026-08-18",
        results: [
          {
            analyte: "Progesterone",
            value: 14.72,
            unit: "ng/mL",
            antecedent: { value: "22,01", unit: "ng/mL", date: "2025-09-25" },
          },
          {
            analyte: "Ferritin",
            value: 8.2,
            unit: "ng/mL",
            antecedent: { value: 10.7, date: "2026-07-29" },
          },
          // the same day is not an earlier value, a bad date is not a date
          {
            analyte: "Iron",
            value: 74,
            antecedent: { value: 74, date: "2026-08-18" },
          },
          {
            analyte: "Zinc",
            value: 75,
            antecedent: { value: 80, date: "July" },
          },
        ],
      }),
    );
    expect(r.readings[0]!.antecedent).toEqual({
      value: 22.01,
      unit: "ng/mL",
      date: "2025-09-25",
    });
    // no unit given: the result's unit
    expect(r.readings[1]!.antecedent).toEqual({
      value: 10.7,
      unit: "ng/mL",
      date: "2026-07-29",
    });
    expect(r.readings[2]!.antecedent).toBeUndefined();
    expect(r.readings[3]!.antecedent).toBeUndefined();
  });

  it("reads the report number, the pending tests and the not-a-lab verdict", () => {
    const r = transformAiResponse(
      JSON.stringify({
        reportNo: " 26818E0252 ",
        pending: ["Estrone", 3],
        notLabReport: false,
        results: [],
      }),
    );
    expect(r).toMatchObject({
      reportNo: "26818E0252",
      pending: ["Estrone"],
      notLab: false,
    });
    expect(
      transformAiResponse('{"notLabReport":true,"results":[]}').notLab,
    ).toBe(true);
  });

  it("dates a header-less group with the date another group found", () => {
    const r = transformAiResponse(
      JSON.stringify({ results: [{ analyte: "Glucose", value: 91 }] }),
      "2026-08-18",
    );
    expect(r.readings[0]!.observedAt).toBe("2026-08-18");
  });
});

describe("chunkText", () => {
  it("leaves a short report whole", () => {
    expect(chunkText("a\nb")).toEqual(["a\nb"]);
    expect(chunkText("x".repeat(CHUNK_AT))).toHaveLength(1);
  });

  it("splits at page breaks and repeats the header and the tail before", () => {
    const pages = [1, 2, 3].map((n) =>
      [
        "HEADER patient",
        `page ${n}`,
        ...Array(120).fill(`row of page ${n} `.repeat(3)),
        `tail of page ${n}`,
      ].join("\n"),
    );
    const groups = chunkText(pages.join("\n\n"));
    expect(groups.length).toBeGreaterThan(1);
    expect(groups[0]!.startsWith("HEADER patient")).toBe(true);
    for (const g of groups.slice(1))
      expect(g.startsWith("HEADER patient")).toBe(true);
    // a test title at the foot of a page travels with the next group
    expect(groups[1]).toContain("tail of page 1");
  });

  it("cuts a text layer that has no line breaks at all", () => {
    const groups = chunkText("y".repeat(30000));
    expect(groups.length).toBeGreaterThanOrEqual(4);
    expect(groups.every((g) => g.length <= CHUNK_SIZE + 2400)).toBe(true);
  });
});

describe("mergeResults", () => {
  const row = (analyte: string, value: number, code: string | null = null) => ({
    analyte,
    code,
    value,
    valueText: String(value),
    unit: null,
    refLow: null,
    refHigh: null,
    observedAt: "2026-08-18",
  });

  it("drops the overlap: same metric, day and value once", () => {
    const r = mergeResults([
      { readings: [row("Ferritin", 8.2, "ferritin"), row("Iron", 74, "iron")] },
      { readings: [row("Ferritin", 8.2, "ferritin"), row("Estrone", 16.3)] },
    ]);
    expect(r.readings.map((x) => x.analyte)).toEqual([
      "Ferritin",
      "Iron",
      "Estrone",
    ]);
  });

  it("fails the whole read when any group failed", () => {
    const r = mergeResults([
      { readings: [row("Iron", 74, "iron")] },
      { readings: [], error: "truncated" },
    ]);
    expect(r).toEqual({ readings: [], error: "truncated" });
  });

  it("is not a lab sheet only when no group is", () => {
    expect(
      mergeResults([
        { readings: [], notLab: true },
        { readings: [], notLab: false },
      ]).notLab,
    ).toBe(false);
  });
});

describe("isPasswordError", () => {
  it("knows pdfjs's PasswordException by name", () => {
    expect(isPasswordError({ name: "PasswordException", code: 1 })).toBe(true);
    expect(isPasswordError(new Error("InvalidPDFException"))).toBe(false);
    expect(isPasswordError(null)).toBe(false);
  });
});
