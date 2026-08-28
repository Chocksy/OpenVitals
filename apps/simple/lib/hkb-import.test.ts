import { describe, it, expect } from "vitest";
import path from "node:path";
import { columnOf, FIXTURES, parseCsv, readCsv } from "./hkb-import";
import {
  BACKGROUND,
  frequencyOf,
  readAnnotations,
  readOntology,
} from "@/scripts/hkb-import-ontology";
import { fromIso3, toCountryCode } from "./countries";
import { CURRENCY, toEur } from "./prices";

const fixture = (name: string) => path.join(FIXTURES, name);

describe("parseCsv", () => {
  it("keeps commas inside quotes and doubles inside those", () => {
    expect([...parseCsv('a,"b,c",d\n1,"he said ""hi""",3\n')]).toEqual([
      ["a", "b,c", "d"],
      ["1", 'he said "hi"', "3"],
    ]);
  });

  it("drops blank lines and survives a missing trailing newline", () => {
    expect([...parseCsv("a,b\n\n1,2")]).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("the NCD-RisC fixtures", () => {
  it("reads the hypertension file by country, sex and age band", async () => {
    const { header, rows } = await readCsv(
      fixture("ncdrisc-hypertension-age-specific-countries.csv"),
    );
    expect(columnOf(header, "Prevalence of hypertension")).toBeGreaterThan(-1);
    expect(rows.length).toBe(200);
    const iso = columnOf(header, "ISO");
    expect(fromIso3(rows[0]![iso]!)).toMatch(/^[A-Z]{2}$/);
  });

  it("reads the obesity column the insulin-resistance prior is built from", async () => {
    const { header } = await readCsv(
      fixture("ncdrisc-bmi-age-standardised-countries.csv"),
    );
    expect(columnOf(header, "Prevalence of BMI>=30")).toBeGreaterThan(-1);
  });

  it("reads the diabetes file", async () => {
    const { header, rows } = await readCsv(
      fixture("ncdrisc-diabetes-crude-countries.csv"),
    );
    expect(columnOf(header, "Prevalence of diabetes")).toBeGreaterThan(-1);
    expect(rows).toHaveLength(200);
  });
});

describe("the price fixture", () => {
  it("has the five columns the importer needs and converts to euros", async () => {
    const { header, rows } = await readCsv(fixture("prices-ro.csv"));
    for (const c of ["test_id", "lab", "price_ron", "url", "checked_at"])
      expect(columnOf(header, c)).toBeGreaterThan(-1);
    const price = Number(rows[0]![columnOf(header, "price_ron")]);
    expect(toEur(price, CURRENCY.RO!)).toBeLessThan(price);
    expect(toCountryCode("Romania")).toBe("RO");
  });
});

describe("frequencyOf", () => {
  it("reads the HPO frequency terms", () => {
    expect(frequencyOf("HP:0040281")).toBe(0.895);
    expect(frequencyOf("HP:0040282")).toBe(0.545);
    expect(frequencyOf("HP:0040283")).toBe(0.17);
  });

  it("reads fractions and percentages", () => {
    expect(frequencyOf("12/25")).toBe(0.48);
    expect(frequencyOf("30%")).toBe(0.3);
  });

  it("says nothing when the file says nothing", () => {
    expect(frequencyOf("")).toBeNull();
    expect(frequencyOf(undefined)).toBeNull();
    expect(frequencyOf("often")).toBeNull();
    expect(frequencyOf("1/0")).toBeNull();
  });
});

describe("the ontology fixtures", () => {
  it("reads HPO terms with their parents", async () => {
    const terms = await readOntology(fixture("hp.json"), "HP");
    expect(terms.length).toBeGreaterThan(150);
    expect(terms.every((t) => t.id.startsWith("HP:"))).toBe(true);
    expect(terms.some((t) => t.parents?.length)).toBe(true);
  });

  it("reads MONDO terms with their OMIM and Orphanet xrefs", async () => {
    const terms = await readOntology(fixture("mondo.json"), "MONDO");
    expect(terms.every((t) => t.ontology === "MONDO")).toBe(true);
    expect(
      terms.some((t) => t.xrefs?.some((x) => /^(OMIM|Orphanet):/.test(x))),
    ).toBe(true);
  });

  it("reads HPOA rows and never leaves the frequency null", async () => {
    const rows = await readAnnotations(fixture("phenotype.hpoa"));
    expect(rows).toHaveLength(200);
    expect(rows.every((r) => typeof r.frequency === "string")).toBe(true);
    expect(rows.some((r) => (frequencyOf(r.frequency) ?? 0) >= 0.3)).toBe(true);
  });

  it("has a background rate for every phenotype it will propose from", async () => {
    const rows = await readAnnotations(fixture("phenotype.hpoa"));
    const usable = rows.filter(
      (r) => BACKGROUND[r.hpoId] && (frequencyOf(r.frequency) ?? 0) >= 0.3,
    );
    expect(usable.length).toBeGreaterThan(0);
    for (const r of usable) {
      const back = BACKGROUND[r.hpoId]!;
      expect(back.featureId.startsWith("fact:")).toBe(true);
      expect(back.p).toBeGreaterThan(0);
      expect(back.source.length).toBeGreaterThan(20);
    }
  });
});
