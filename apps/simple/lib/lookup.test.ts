import { describe, it, expect } from "vitest";
import { rankTerms, type TermRow } from "./lookup";

const term = (
  id: string,
  name: string,
  synonyms: string[] | null = null,
  ontology = "MONDO",
): TermRow => ({ id, ontology, name, synonyms });

describe("rankTerms", () => {
  const rows = [
    term("MONDO:7770561", "hemochromatosis, dog"),
    term("MONDO:0019257", "hemochromatosis type 2"),
    term("MONDO:0006507", "hereditary hemochromatosis", [
      "haemochromatosis",
      "bronze diabetes",
    ]),
    term("MONDO:0021001", "hemochromatosis type 1", ["HFE hemochromatosis"]),
  ];

  it("puts the exact synonym first, on the British spelling", () => {
    const ranked = rankTerms("haemochromatosis", rows);
    expect(ranked[0]!.id).toBe("MONDO:0006507");
    expect(ranked[0]!.via).toBe("haemochromatosis");
  });

  it("puts the dog disease last", () => {
    const ranked = rankTerms("hemochromatosis", rows);
    expect(ranked.map((r) => r.id)).toContain("MONDO:7770561");
    expect(ranked[ranked.length - 1]!.id).toBe("MONDO:7770561");
  });

  it("prefers the exact name over a longer one that contains it", () => {
    const ranked = rankTerms("hemochromatosis type 2", rows);
    expect(ranked[0]!.id).toBe("MONDO:0019257");
  });

  it("matches a word at a time when nothing contains the whole query", () => {
    const ranked = rankTerms("bronze diabetes iron", rows);
    expect(ranked[0]!.id).toBe("MONDO:0006507");
  });

  it("drops candidates that share nothing", () => {
    expect(rankTerms("marfan", rows)).toHaveLength(0);
  });

  it("returns at most eight", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      term(`MONDO:${i}`, `hemochromatosis variant ${i}`),
    );
    expect(rankTerms("hemochromatosis", many)).toHaveLength(8);
  });

  it("ranks a short name above a long one at the same overlap", () => {
    const ranked = rankTerms("mastocytosis", [
      term(
        "MONDO:0020332",
        "systemic mastocytosis with an associated clonal hematologic non-mast cell lineage disease",
      ),
      term("MONDO:0007950", "mastocytosis"),
    ]);
    expect(ranked[0]!.id).toBe("MONDO:0007950");
  });

  it("keeps HPO terms searchable alongside diseases", () => {
    const ranked = rankTerms("fatigue", [
      term("HP:0012378", "Fatigue", null, "HP"),
      term("MONDO:0005180", "chronic fatigue syndrome"),
    ]);
    expect(ranked[0]!.id).toBe("HP:0012378");
    expect(ranked[0]!.ontology).toBe("HP");
  });
});
