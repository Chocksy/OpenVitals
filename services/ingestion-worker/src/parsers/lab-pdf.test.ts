import { describe, it, expect } from "vitest";
import { transformAiResponse, stripCodeFences } from "./lab-pdf";

describe("stripCodeFences", () => {
  it("strips ```json fences", () => {
    const input = '```json\n{"results":[]}\n```';
    expect(stripCodeFences(input)).toBe('{"results":[]}');
  });

  it("strips ``` fences without language tag", () => {
    const input = '```\n{"results":[]}\n```';
    expect(stripCodeFences(input)).toBe('{"results":[]}');
  });

  it("returns plain JSON unchanged", () => {
    const input = '{"results":[]}';
    expect(stripCodeFences(input)).toBe('{"results":[]}');
  });

  it("trims surrounding whitespace", () => {
    const input = '  \n {"results":[]} \n  ';
    expect(stripCodeFences(input)).toBe('{"results":[]}');
  });
});

describe("transformAiResponse", () => {
  it("returns empty extractions for invalid JSON", () => {
    const result = transformAiResponse("not valid json");
    expect(result.extractions).toHaveLength(0);
    expect(result.rawMetadata).toHaveProperty("error", "parse_failed");
  });

  it("returns empty extractions for empty results array", () => {
    const result = transformAiResponse('{"results":[]}');
    expect(result.extractions).toHaveLength(0);
  });

  it("parses a simple lab result", () => {
    const input = JSON.stringify({
      results: [
        {
          analyte: "Glucose",
          value: 95,
          unit: "mg/dL",
          referenceRangeLow: 74,
          referenceRangeHigh: 106,
          isAbnormal: false,
          observedAt: "2025-01-15",
        },
      ],
      collectionDate: "2025-01-15",
      labName: "LabCorp",
    });

    const result = transformAiResponse(input);
    expect(result.extractions).toHaveLength(1);
    expect(result.extractions[0]!.analyte).toBe("Glucose");
    expect(result.extractions[0]!.value).toBe(95);
    expect(result.extractions[0]!.unit).toBe("mg/dL");
    expect(result.extractions[0]!.referenceRangeLow).toBe(74);
    expect(result.extractions[0]!.referenceRangeHigh).toBe(106);
    expect(result.extractions[0]!.isAbnormal).toBe(false);
    expect(result.extractions[0]!.observedAt).toBe("2025-01-15");
    expect(result.extractions[0]!.category).toBe("lab_result");
    expect(result.labName).toBe("LabCorp");
    expect(result.collectionDate).toBe("2025-01-15");
  });

  it('handles "< X" values by extracting the number', () => {
    const input = JSON.stringify({
      results: [
        { analyte: "CRP", value: null, valueText: "< 0.5", unit: "mg/L" },
      ],
    });

    const result = transformAiResponse(input);
    expect(result.extractions[0]!.value).toBeCloseTo(0.5);
    expect(result.extractions[0]!.valueText).toBe("< 0.5");
  });

  it('handles "> X" values', () => {
    const input = JSON.stringify({
      results: [
        {
          analyte: "Ferritin",
          value: null,
          valueText: "> 1000",
          unit: "ng/mL",
        },
      ],
    });

    const result = transformAiResponse(input);
    expect(result.extractions[0]!.value).toBeCloseTo(1000);
  });

  it('handles "≤ X" and "≥ X" Unicode comparators', () => {
    const input = JSON.stringify({
      results: [
        { analyte: "TSH", value: null, valueText: "≤ 0.01", unit: "mIU/L" },
      ],
    });

    const result = transformAiResponse(input);
    expect(result.extractions[0]!.value).toBeCloseTo(0.01);
  });

  it("handles comma-decimal numbers in < values", () => {
    const input = JSON.stringify({
      results: [
        { analyte: "CRP", value: null, valueText: "< 0,5", unit: "mg/L" },
      ],
    });

    const result = transformAiResponse(input);
    expect(result.extractions[0]!.value).toBeCloseTo(0.5);
  });

  it("uses collectionDate as fallback observedAt", () => {
    const input = JSON.stringify({
      results: [{ analyte: "Glucose", value: 100, unit: "mg/dL" }],
      collectionDate: "2025-03-20",
    });

    const result = transformAiResponse(input);
    expect(result.extractions[0]!.observedAt).toBe("2025-03-20");
  });

  it("uses today as fallback when no collectionDate or observedAt", () => {
    const input = JSON.stringify({
      results: [{ analyte: "Glucose", value: 100, unit: "mg/dL" }],
    });

    const result = transformAiResponse(input);
    const today = new Date().toISOString().split("T")[0];
    expect(result.extractions[0]!.observedAt).toBe(today);
  });

  it("handles missing optional fields gracefully", () => {
    const input = JSON.stringify({
      results: [{ analyte: "Unknown Test", value: 42 }],
    });

    const result = transformAiResponse(input);
    const ext = result.extractions[0]!;
    expect(ext.analyte).toBe("Unknown Test");
    expect(ext.value).toBe(42);
    expect(ext.unit).toBeNull();
    expect(ext.referenceRangeLow).toBeNull();
    expect(ext.referenceRangeHigh).toBeNull();
    expect(ext.referenceRangeText).toBeNull();
    expect(ext.isAbnormal).toBeNull();
  });

  it("converts string value to valueText when numeric value is provided", () => {
    const input = JSON.stringify({
      results: [{ analyte: "Glucose", value: 95 }],
    });

    const result = transformAiResponse(input);
    expect(result.extractions[0]!.valueText).toBe("95");
  });

  it("extracts patientName, reportDate, labName metadata", () => {
    const input = JSON.stringify({
      results: [],
      patientName: "John Doe",
      collectionDate: "2025-01-10",
      reportDate: "2025-01-12",
      labName: "Quest Diagnostics",
    });

    const result = transformAiResponse(input);
    expect(result.patientName).toBe("John Doe");
    expect(result.collectionDate).toBe("2025-01-10");
    expect(result.reportDate).toBe("2025-01-12");
    expect(result.labName).toBe("Quest Diagnostics");
  });

  it("handles markdown-wrapped JSON response from AI", () => {
    const input =
      '```json\n{"results":[{"analyte":"HbA1c","value":5.4,"unit":"%"}]}\n```';

    const result = transformAiResponse(input);
    expect(result.extractions).toHaveLength(1);
    expect(result.extractions[0]!.analyte).toBe("HbA1c");
    expect(result.extractions[0]!.value).toBe(5.4);
  });

  it("parses multiple results", () => {
    const input = JSON.stringify({
      results: [
        { analyte: "Glucose", value: 95, unit: "mg/dL" },
        { analyte: "Hemoglobin", value: 14.2, unit: "g/dL" },
        { analyte: "WBC", value: 6.8, unit: "K/uL" },
      ],
      collectionDate: "2025-06-01",
    });

    const result = transformAiResponse(input);
    expect(result.extractions).toHaveLength(3);
    expect(result.extractions.map((e) => e.analyte)).toEqual([
      "Glucose",
      "Hemoglobin",
      "WBC",
    ]);
  });
});
