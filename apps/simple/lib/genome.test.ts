import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GENOME_CATALOG, normalizeGenotype } from "./genome-catalog";
import {
  callGenome,
  genomeFacts,
  looksLikeGenome,
  parseGenome,
} from "./genome";
import { CATALOG } from "./hkb-catalog";
import { scoreHypotheses } from "./hypotheses";
import type { ModelInput } from "./coverage";

const fixture = (name: string) =>
  readFileSync(
    join(__dirname, "..", "evals", "fixtures", "genome", name),
    "utf8",
  );

const V5 = fixture("23andme_v5.txt");
const ANCESTRY = fixture("ancestrydna.txt");

const call = (results: ReturnType<typeof callGenome>, id: string) =>
  results.find((r) => r.row.id === id);

describe("looksLikeGenome", () => {
  it("accepts the 23andMe comment header", () => {
    expect(looksLikeGenome(V5)).toBe(true);
  });

  it("accepts the AncestryDNA column header", () => {
    expect(looksLikeGenome(ANCESTRY)).toBe(true);
  });

  it("rejects a discharge note", () => {
    expect(
      looksLikeGenome("SPITALUL CLINIC — INTERNAL MEDICINE\nDischarge summary"),
    ).toBe(false);
  });
});

describe("normalizeGenotype", () => {
  it("sorts the alleles so CT and TC are one genotype", () => {
    expect(normalizeGenotype("TC")).toBe("CT");
    expect(normalizeGenotype("CT")).toBe("CT");
  });

  it("drops no-calls and indels", () => {
    expect(normalizeGenotype("--")).toBeNull();
    expect(normalizeGenotype("II")).toBeNull();
  });
});

describe("parseGenome", () => {
  it("keeps only the catalog rsids out of the 23andMe fixture", () => {
    const rows = parseGenome(V5);
    expect(rows).toHaveLength(16);
    expect(new Set(rows.map((r) => r.rsid)).size).toBe(16);
    expect(rows.find((r) => r.rsid === "rs429358")).toMatchObject({
      chromosome: "19",
      position: 44908684,
      genotype: "CT",
    });
  });

  it("reads the AncestryDNA two-allele layout to the same genotypes", () => {
    const a = parseGenome(V5);
    const b = parseGenome(ANCESTRY);
    expect(b).toHaveLength(16);
    expect(Object.fromEntries(b.map((r) => [r.rsid, r.genotype]))).toEqual(
      Object.fromEntries(a.map((r) => [r.rsid, r.genotype])),
    );
  });

  it("never keeps an rsid outside the catalog", () => {
    const ids = new Set(GENOME_CATALOG.flatMap((r) => r.rsids));
    for (const row of parseGenome(V5)) expect(ids.has(row.rsid)).toBe(true);
  });
});

describe("the fixture calls", () => {
  const results = callGenome(parseGenome(V5));

  it("resolves APOE ε3/ε4 from the two rsids", () => {
    expect(call(results, "apoe")!.result).toMatchObject({ call: "e3/e4" });
  });

  it("resolves the other APOE pairs the same way", () => {
    const apoe = GENOME_CATALOG.find((r) => r.id === "apoe")!;
    expect(apoe.call({ rs429358: "TT", rs7412: "CC" })!.call).toBe("e3/e3");
    expect(apoe.call({ rs429358: "CC", rs7412: "CC" })!.call).toBe("e4/e4");
    expect(apoe.call({ rs429358: "TT", rs7412: "CT" })!.call).toBe("e2/e3");
    expect(apoe.call({ rs429358: "CT", rs7412: "CT" })!.call).toBe("e2/e4");
  });

  it("calls HFE C282Y heterozygous on the fixture", () => {
    expect(call(results, "hfe")!.result!.call).toBe("C282Y heterozygous");
  });

  it("detects the compound heterozygote", () => {
    const hfe = GENOME_CATALOG.find((r) => r.id === "hfe")!;
    expect(hfe.call({ rs1800562: "AG", rs1799945: "CG" })!.call).toBe(
      "C282Y/H63D compound heterozygous",
    );
    expect(hfe.call({ rs1800562: "AA", rs1799945: "CC" })!.call).toBe(
      "C282Y homozygous",
    );
  });

  it("calls the DQ2.5 carrier, TCF7L2 CT and lactase non-persistence", () => {
    expect(call(results, "hla_dq")!.result!.call).toBe("carries DQ2.5");
    expect(call(results, "tcf7l2")!.result!.call).toBe("CT");
    expect(call(results, "lct")!.result!.call).toBe("lactase non-persistent");
  });

  it("writes one profile fact per row that called", () => {
    const facts = genomeFacts(results);
    expect(facts["genome:apoe"]).toBe("e3/e4");
    expect(facts["genome:hfe"]).toBe("C282Y heterozygous");
    expect(facts["lactase_nonpersistent"]).toBe("lactase non-persistent");
    expect(facts["caffeine_slow_metaboliser"]).toBe("slow metaboliser");
    expect(facts["statin_myopathy_risk"]).toBe("intermediate");
  });

  it("says 'not in this array' for an rsid the file lacks", () => {
    const partial = callGenome(
      parseGenome(V5).filter((r) => r.rsid !== "rs7412"),
    );
    const apoe = call(partial, "apoe")!;
    expect(apoe.result).toBeNull();
    expect(apoe.absent).toEqual(["rs7412"]);
  });
});

/* The engine half: the calls have to move the conditions they claim to move. */

const person = (profile: Record<string, unknown>): ModelInput => ({
  today: "2026-08-28",
  profile: { sex: "female", birth_year: "1986", ...profile },
  sex: "female",
  age: 40,
  latest: {},
  derived: {},
});

const scoreOf = (profile: Record<string, unknown>, id: string) =>
  scoreHypotheses(person(profile), { catalog: CATALOG }).find(
    (h) => h.id === id,
  )!;

describe("the catalog rules a genome file feeds", () => {
  it("takes coeliac disease down with an LR of 0.1 when both HLA tags are absent", () => {
    const absent = scoreOf(
      { "genome:hla_dq": "no DQ2.5 or DQ8 tag" },
      "coeliac_disease",
    );
    const rule = absent.against.find((a) => a.rule === "coeliac_hla_absent");
    expect(rule?.lr).toBe(0.1);
    expect(absent.score).toBeLessThan(scoreOf({}, "coeliac_disease").score);
  });

  it("raises the coeliac prior threefold for a carrier and leaves the LR at 1", () => {
    const carrier = scoreOf(
      { "genome:hla_dq": "carries DQ2.5" },
      "coeliac_disease",
    );
    const none = scoreOf({}, "coeliac_disease");
    expect(carrier.prior).toBeCloseTo(none.prior * 3, 5);
    expect(carrier.for.find((f) => f.rule === "coeliac_hla_absent")?.lr).toBe(
      1,
    );
  });

  it("multiplies the ASCVD prior by 1.3 for an APOE ε4 carrier", () => {
    expect(scoreOf({ "genome:apoe": "e3/e4" }, "ascvd_risk").prior).toBeCloseTo(
      scoreOf({ "genome:apoe": "e3/e3" }, "ascvd_risk").prior * 1.3,
      5,
    );
  });

  it("scores HFE C282Y homozygosity at LR 50 and the compound heterozygote at 5", () => {
    expect(
      scoreOf(
        { "genome:hfe": "C282Y homozygous" },
        "haemochromatosis",
      ).for.find((f) => f.rule === "hfe_c282y_homozygous")?.lr,
    ).toBe(50);
    expect(
      scoreOf(
        { "genome:hfe": "C282Y/H63D compound heterozygous" },
        "haemochromatosis",
      ).for.find((f) => f.rule === "hfe_compound_heterozygous")?.lr,
    ).toBe(5);
  });

  it("moves type 2 diabetes by 1.4 per TCF7L2 T allele", () => {
    const cc = scoreOf({ "genome:tcf7l2": "CC" }, "type2_diabetes").prior;
    expect(
      scoreOf({ "genome:tcf7l2": "CT" }, "type2_diabetes").prior,
    ).toBeCloseTo(cc * 1.4, 5);
    // `prior` is rounded to three decimals on the result, so compare there.
    expect(
      scoreOf({ "genome:tcf7l2": "TT" }, "type2_diabetes").prior,
    ).toBeCloseTo(cc * 1.96, 3);
  });
});
