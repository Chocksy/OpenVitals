import { describe, it, expect, vi } from "vitest";
import {
  stripCodeFences,
  transformAiResponse,
  metricCatalogPrompt,
  slugify,
  extractFromText,
} from "./extract";

/** The model is the only non-pure part of `extractFromText`, so it is stubbed. */
const ai = vi.hoisted(() => ({ reply: "", last: null as any }));
vi.mock("ai", () => ({
  generateText: async (opts: unknown) => {
    ai.last = opts;
    return { text: ai.reply };
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

  it("caps the prompt at 30k characters", async () => {
    ai.reply = '{"results":[]}';
    await extractFromText("x".repeat(40000), []);
    expect(ai.last.prompt).toHaveLength(30000);
  });
});
