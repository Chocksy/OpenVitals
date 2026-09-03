import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  firstSentence,
  GENOME_CATALOG,
  genomeVerdict,
  movesAnything,
  normalizeGenotype,
} from "./genome-catalog";
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

  it("says 'no effect for you' only when no rule reads the call", () => {
    const row = (id: string) => GENOME_CATALOG.find((r) => r.id === id)!;
    // The fixture is e3/e4, which the ASCVD prior modifier reads.
    expect(movesAnything(row("apoe"), call(results, "apoe")!.result!)).toBe(
      true,
    );
    // e3/e3 is a real call that no modifier and no rule reads.
    expect(
      movesAnything(
        row("apoe"),
        row("apoe").call({ rs429358: "TT", rs7412: "CC" })!,
      ),
    ).toBe(false);
    // One TCF7L2 T allele multiplies the type 2 diabetes prior.
    expect(movesAnything(row("tcf7l2"), call(results, "tcf7l2")!.result!)).toBe(
      true,
    );
    // Neither HLA tag still argues, through the coeliac rule's lrNeg.
    expect(movesAnything(row("hla_dq"), call(results, "hla_dq")!.result!)).toBe(
      true,
    );
  });

  it("writes the DR3 fact from the merged HLA row", () => {
    expect(genomeFacts(results)["genome:hla_dr"]).toBe("carries DR3");
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

/**
 * Phase 31a item 9. The table led with "rs429358 · rs7412" and "e2/e3" and put
 * a likelihood-ratio sentence under "what it moved". The verdict leads now;
 * the rsids and the genotype are still on the row, behind a disclosure.
 */
describe("genomeVerdict", () => {
  const hla = GENOME_CATALOG.find((r) => r.id === "hla_dq")!;
  const clear = hla.call({
    rs2187668: "CC",
    rs7454108: "TT",
    rs660895: "AA",
  })!;

  it("leads with what the gene settles, in one sentence", () => {
    const v = genomeVerdict({ row: hla, result: clear, absent: [] });
    expect(v.verdict).toBe(
      "Coeliac disease is essentially excluded: over 99 % of people with it carry one of these two haplotypes.",
    );
    expect(v.verdict).not.toContain("rs");
  });

  it("keeps the rsids and the genotype on the row for the disclosure", () => {
    const v = genomeVerdict({ row: hla, result: clear, absent: [] });
    expect(v.rsids).toEqual(["rs2187668", "rs7454108", "rs660895"]);
    expect(v.genotype).toBe(clear.genotype);
    expect(v.call).toBe("no DQ2.5 or DQ8 tag");
  });

  it("says so in words when the call moves nothing", () => {
    const v = genomeVerdict({ row: hla, result: clear, absent: [] });
    if (!v.moved) expect(v.detail).toContain("moves nothing");
  });

  it("says what an unread row is, not what it would have moved", () => {
    const v = genomeVerdict({
      row: hla,
      result: null,
      absent: ["rs2187668"],
    });
    expect(v.verdict).toBe(
      "Not read: this array does not carry the markers it needs.",
    );
    expect(v.detail).toBe("Missing rs2187668.");
    expect(v.genotype).toBe(null);
  });
});

describe("firstSentence", () => {
  it("cuts at the first full stop and keeps the rest", () => {
    expect(firstSentence("One. Two three.")).toEqual(["One.", "Two three."]);
  });

  it("takes the whole thing when there is only one", () => {
    expect(firstSentence("Just the one")).toEqual(["Just the one", ""]);
  });
});

/**
 * Phase 31a item 9, the other half: the table itself. Four columns became
 * three, because on a phone the citation column set the height of every row.
 */
describe("the genome table", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "components", "genome-table.tsx"),
    "utf8",
  );

  it("leads every row with the verdict, not the rsids", () => {
    expect(src).toContain("What it settles");
    expect(src).not.toContain("What it moved");
    expect(src).not.toContain("<th>rsID</th>");
    expect(src).not.toContain("<th>Genotype</th>");
  });

  it("keeps the rsids, the genotype and the citation behind one disclosure", () => {
    expect(src).toContain("What it read, and where it comes from");
    expect(src).toContain("v.rsids.join");
    expect(src).toContain("v.genotype");
    expect(src).toContain("{v.source}");
    expect(src).not.toContain("<th>Source</th>");
  });
});
