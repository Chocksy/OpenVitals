import { describe, it, expect } from "vitest";
import {
  ORPHANET_CLASS,
  RARITY_PRIOR,
  rarityFor,
  rarityOf,
  ring2Id,
} from "./rings";
import { parseOrphanetPrevalence, ring2Rows } from "../scripts/hkb-ring2-build";

describe("rarity classes", () => {
  it("puts every Orphanet class in the nearest band in log space", () => {
    expect(rarityOf(">1 / 1000", true)).toBe("common");
    expect(rarityOf("1-5 / 10 000", true)).toBe("common");
    expect(rarityOf("6-9 / 10 000", true)).toBe("common");
    expect(rarityOf("1-9 / 100 000", true)).toBe("rare");
    expect(rarityOf("1-9 / 1 000 000", true)).toBe("rare");
    expect(rarityOf("<1 / 1 000 000", true)).toBe("ultra_rare");
  });

  it("falls back to the listing itself when there is no class", () => {
    // Orphanet only lists diseases under 1 in 2000, so being listed is
    // already evidence; an OMIM phenotype with no Orphanet entry is not.
    expect(rarityOf(null, true)).toBe("rare");
    expect(rarityOf(null, false)).toBe("ultra_rare");
    expect(rarityOf("Unknown_epidemiological_data", false)).toBe("ultra_rare");
  });

  it("keeps the three priors three orders of magnitude apart", () => {
    expect(RARITY_PRIOR.common / RARITY_PRIOR.rare).toBeCloseTo(100, 5);
    expect(RARITY_PRIOR.rare / RARITY_PRIOR.ultra_rare).toBeCloseTo(100, 5);
    for (const p of Object.values(ORPHANET_CLASS))
      expect(["common", "rare", "ultra_rare"]).toContain(rarityFor(p));
  });

  it("makes a stable condition id out of a MONDO id", () => {
    expect(ring2Id("MONDO:0007739")).toBe("mondo_0007739");
  });
});

const XML = `<JDBOR>
  <DisorderList count="2">
    <Disorder id="1">
      <OrphaCode>558</OrphaCode>
      <Name lang="en">Marfan syndrome</Name>
      <PrevalenceList count="2">
        <Prevalence id="1">
          <PrevalenceType id="23697"><Name lang="en">Cases/families</Name></PrevalenceType>
          <PrevalenceClass id="1"><Name lang="en">&lt;1 / 1 000 000</Name></PrevalenceClass>
          <PrevalenceValidationStatus id="1"><Name lang="en">Validated</Name></PrevalenceValidationStatus>
        </Prevalence>
        <Prevalence id="2">
          <PrevalenceType id="23669"><Name lang="en">Point prevalence</Name></PrevalenceType>
          <PrevalenceClass id="2"><Name lang="en">1-5 / 10 000</Name></PrevalenceClass>
          <PrevalenceValidationStatus id="1"><Name lang="en">Validated</Name></PrevalenceValidationStatus>
        </Prevalence>
      </PrevalenceList>
    </Disorder>
    <Disorder id="2">
      <OrphaCode>99826</OrphaCode>
      <Name lang="en">A syndrome nobody validated</Name>
      <PrevalenceList count="1">
        <Prevalence id="3">
          <PrevalenceType id="23669"><Name lang="en">Point prevalence</Name></PrevalenceType>
          <PrevalenceClass id="3"><Name lang="en">1-9 / 100 000</Name></PrevalenceClass>
          <PrevalenceValidationStatus id="2"><Name lang="en">Not yet validated</Name></PrevalenceValidationStatus>
        </Prevalence>
      </PrevalenceList>
    </Disorder>
  </DisorderList>
</JDBOR>`;

describe("parseOrphanetPrevalence", () => {
  it("takes the commonest validated point-prevalence class", () => {
    const map = parseOrphanetPrevalence(XML);
    expect(map.get("ORPHA:558")).toBe("1-5 / 10 000");
  });

  it("ignores classes that are not validated point prevalence", () => {
    expect(parseOrphanetPrevalence(XML).has("ORPHA:99826")).toBe(false);
  });
});

describe("ring2Rows", () => {
  const terms = [
    {
      id: "MONDO:0007947",
      name: "Marfan syndrome",
      xrefs: ["OMIM:154700", "Orphanet:558"],
    },
    {
      id: "MONDO:0008608",
      name: "an OMIM-only phenotype",
      xrefs: ["OMIM:600000"],
    },
    { id: "MONDO:0000001", name: "disease", xrefs: ["ICD10:R69"] },
    {
      id: "MONDO:0007739",
      name: "Huntington disease",
      xrefs: ["OMIM:143100"],
    },
  ];
  const annotated = new Set(["OMIM:154700", "OMIM:600000", "OMIM:143100"]);
  const prevalence = new Map([["ORPHA:558", "1-5 / 10 000"]]);

  it("keeps only terms HPOA has annotations for", () => {
    const rows = ring2Rows(terms, annotated, prevalence, new Set());
    expect(rows.map((r) => r.mondoId)).toEqual([
      "MONDO:0007947",
      "MONDO:0008608",
      "MONDO:0007739",
    ]);
  });

  it("prices each one by its rarity class", () => {
    const rows = ring2Rows(terms, annotated, prevalence, new Set());
    const marfan = rows.find((r) => r.mondoId === "MONDO:0007947")!;
    expect(marfan.rarity).toBe("common");
    expect(marfan.prevalence).toBe(RARITY_PRIOR.common);
    expect(rows.find((r) => r.mondoId === "MONDO:0008608")!.rarity).toBe(
      "ultra_rare",
    );
  });

  it("never demotes a MONDO term that is already a ring-1 condition", () => {
    const rows = ring2Rows(
      terms,
      annotated,
      prevalence,
      new Set(["MONDO:0007947"]),
    );
    expect(rows.some((r) => r.mondoId === "MONDO:0007947")).toBe(false);
  });
});
