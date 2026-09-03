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
  genomeVerdicts,
  looksLikeGenome,
  movedIds,
  movedLine,
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
 * Phase 31a item 9 put the verdict first and hid the rsids. Phase 32a item 3
 * gives the row the six columns `docs/mockups/v4/genome.html` section 02 draws
 * — Verdict, Gene, Your call, Grade, What it moved, Source — which is why the
 * 31a assertions against "What it moved" and a Source column are gone: that
 * column now has real data behind it (`genomeVerdicts`) instead of the prose
 * `effect` string it used to borrow. The rule the 31a lock was protecting is
 * unchanged and still checked: the verdict leads, the rsids sit behind a
 * disclosure, and no column is an rsID or a genotype.
 */
describe("the genome table", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "components", "genome-table.tsx"),
    "utf8",
  );

  it("leads every row with the verdict, not the rsids", () => {
    expect(src.indexOf("<th>Verdict</th>")).toBeLessThan(
      src.indexOf("<th>Gene</th>"),
    );
    expect(src).not.toContain("<th>rsID</th>");
    expect(src).not.toContain("<th>Genotype</th>");
  });

  it("draws the six columns the mockup draws", () => {
    for (const th of [
      "<th>Verdict</th>",
      "<th>Gene</th>",
      "<th>Your call</th>",
      "<th>Grade</th>",
      "<th>What it moved</th>",
      "<th>Source</th>",
    ])
      expect(src).toContain(th);
  });

  it("keeps the rsids and the genotype behind one disclosure", () => {
    expect(src).toContain('<details className="disclose">');
    expect(src).toContain("v.rsids.join");
    expect(src).toContain("v.genotype");
  });

  it("takes the verdicts as a prop, so the page computes them once", () => {
    expect(src).toContain("verdicts?: ConditionVerdict[]");
  });
});

/**
 * Phase 32a item 3. `movesAnything` found a matching rule and then threw away
 * which rule matched, so "Type 2 diabetes ×1.4" had nowhere to come from.
 * `genomeVerdicts` keeps the match. Every case here is built from the real
 * catalogue rows and the real HKB rules; the numbers asserted are the ones the
 * catalogue carries, never the ones the mockup wished for.
 */
describe("genomeVerdicts", () => {
  const row = (id: string) => GENOME_CATALOG.find((r) => r.id === id)!;
  const one = (id: string, g: Record<string, string>) => {
    const r = row(id);
    return genomeVerdicts([r], [{ row: r, result: r.call(g), absent: [] }]);
  };
  const on = (vs: ReturnType<typeof genomeVerdicts>, conditionId: string) =>
    vs.find((v) => v.conditionId === conditionId)!;

  it("takes type 2 diabetes up ×1.4 on one TCF7L2 T allele", () => {
    const v = on(one("tcf7l2", { rs7903146: "CT" }), "type2_diabetes");
    expect(v).toMatchObject({
      name: "Type 2 diabetes",
      direction: "up",
      factor: 1.4,
      grade: "A",
      absent: false,
      geneIds: ["tcf7l2"],
    });
    expect(v.reason).toContain("TCF7L2");
    expect(movedLine(v)).toBe("Type 2 diabetes ×1.4");
  });

  it("takes insulin resistance up ×1.44 on FTO A/A", () => {
    const v = on(one("fto", { rs9939609: "AA" }), "insulin_resistance");
    expect(v).toMatchObject({ direction: "up", factor: 1.44, grade: "B" });
    expect(movedLine(v)).toBe("Insulin resistance ×1.44");
  });

  it("closes coeliac disease on an absent haplotype, with no test needed", () => {
    const v = on(
      one("hla_dq", { rs2187668: "CC", rs7454108: "TT", rs660895: "AA" }),
      "coeliac_disease",
    );
    expect(v).toMatchObject({
      direction: "down",
      factor: 0.1,
      absent: true,
      testNeeded: false,
      grade: "A",
    });
    expect(v.reason).toContain("essentially excluded");
  });

  it("leaves the other two HLA conditions alone and names them", () => {
    const vs = one("hla_dq", {
      rs2187668: "CC",
      rs7454108: "TT",
      rs660895: "AA",
    });
    for (const id of ["hashimoto", "atrophic_gastritis"]) {
      const v = on(vs, id);
      expect(v.direction).toBe("none");
      expect(v.factor).toBe(null);
      expect(v.reason).toContain(v.name);
      expect(v.reason).toContain("no rule");
    }
  });

  /**
   * The mockup draws haemochromatosis as "excluded". The catalogue cannot say
   * that: its two HFE rules carry an `lr` and no `lrNeg`, so an absent C282Y
   * and H63D fire nothing and the honest answer is "no change". Same for LPA.
   * A negative likelihood ratio on those rows would change this test; nothing
   * here invents one.
   */
  it("says no change, not excluded, when HFE has no negative rule to fire", () => {
    const v = on(
      one("hfe", { rs1800562: "GG", rs1799945: "CC" }),
      "haemochromatosis",
    );
    expect(v).toMatchObject({
      direction: "none",
      factor: null,
      absent: false,
      testNeeded: false,
    });
  });

  it("says no change for an LPA non-carrier, for the same reason", () => {
    const v = on(
      one("lpa", { rs10455872: "AA", rs3798220: "TT" }),
      "lpa_elevated",
    );
    expect(v).toMatchObject({ direction: "none", factor: null });
    expect(movedLine(v)).toBe("High lipoprotein(a) unchanged");
  });

  it("says the ε4 rule did not fire for APOE ε2/ε3", () => {
    const v = on(one("apoe", { rs429358: "TT", rs7412: "CT" }), "ascvd_risk");
    expect(v.direction).toBe("none");
    expect(v.reason).toContain("no rule for Atherosclerotic risk fired");
    expect(v.reason).toContain("e2/e3");
  });

  it("merges two genes onto one condition and multiplies what they agree on", () => {
    const fto = row("fto");
    const tcf = row("tcf7l2");
    /* Two rows that both push insulin resistance: FTO's own ×1.2 rule and the
       same row called twice under a second id, so the merge is exercised on
       real catalogue rules rather than on a hand-written one. */
    const twin = { ...fto, id: "fto_twin" };
    const vs = genomeVerdicts(
      [fto, twin, tcf],
      [
        { row: fto, result: fto.call({ rs9939609: "AT" }), absent: [] },
        { row: twin, result: twin.call({ rs9939609: "AT" }), absent: [] },
        { row: tcf, result: tcf.call({ rs7903146: "CT" }), absent: [] },
      ],
    );
    const v = on(vs, "insulin_resistance");
    expect(v.geneIds).toEqual(["fto", "fto_twin"]);
    expect(v.factor).toBeCloseTo(1.44, 5);
    expect(v.direction).toBe("up");
    expect(vs.map((x) => x.conditionId)).toContain("type2_diabetes");
  });

  it("says nothing at all about a row the array could not call", () => {
    const apoe = row("apoe");
    expect(
      genomeVerdicts([apoe], [{ row: apoe, result: null, absent: ["rs7412"] }]),
    ).toEqual([]);
  });

  it("gives no verdict for the four rows no condition reads", () => {
    const results = callGenome(parseGenome(V5));
    const ids = new Set(
      genomeVerdicts(GENOME_CATALOG, results).flatMap((v) => v.geneIds),
    );
    for (const id of ["cyp1a2", "lct", "g6pd", "slco1b1"])
      expect(ids.has(id)).toBe(false);
  });

  it("agrees with movesAnything on every row of the fixture", () => {
    const results = callGenome(parseGenome(V5));
    const moved = movedIds(genomeVerdicts(GENOME_CATALOG, results));
    for (const r of results) {
      if (!r.result) continue;
      const anything = movesAnything(r.row, r.result);
      // a row no condition reads is "moved" by the old contract and carries no
      // verdict, so the join is only asserted where a condition exists
      if (r.row.conditions.length)
        expect(moved.has(r.row.id)).toBe(anything);
    }
  });

  it("is pure: same rows in, same answer out", () => {
    const results = callGenome(parseGenome(V5));
    expect(genomeVerdicts(GENOME_CATALOG, results)).toEqual(
      genomeVerdicts(GENOME_CATALOG, results),
    );
  });
});
