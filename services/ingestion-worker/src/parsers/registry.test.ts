import { describe, it, expect } from "vitest";
import { getParserForType, parserRegistry } from "./registry";

describe("parserRegistry", () => {
  it("contains entries for lab_report, csv_export, and apple_health_export", () => {
    const types = parserRegistry.flatMap((p) => p.supportedTypes);
    expect(types).toContain("lab_report");
    expect(types).toContain("csv_export");
    expect(types).toContain("apple_health_export");
  });
});

describe("getParserForType", () => {
  it("returns lab-pdf parser for lab_report", () => {
    const parser = getParserForType("lab_report");
    expect(parser).toBeDefined();
    expect(parser!.id).toBe("lab-pdf");
  });

  it("returns csv-importer for csv_export", () => {
    const parser = getParserForType("csv_export");
    expect(parser).toBeDefined();
    expect(parser!.id).toBe("csv-importer");
  });

  it("returns apple-health-xml for apple_health_export", () => {
    const parser = getParserForType("apple_health_export");
    expect(parser).toBeDefined();
    expect(parser!.id).toBe("apple-health-xml");
  });

  it("returns undefined for unknown document types", () => {
    expect(getParserForType("unknown")).toBeUndefined();
    expect(getParserForType("")).toBeUndefined();
  });

  it("returns encounter-note parser for encounter_note", () => {
    const parser = getParserForType("encounter_note");
    expect(parser).toBeDefined();
    expect(parser!.id).toBe("encounter-note");
  });
});
