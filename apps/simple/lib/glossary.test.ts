import { describe, expect, it } from "vitest";
import { NODES } from "./graph";
import { GLOSSARY, splitTerms, termFor } from "./glossary";

/**
 * The lock on phase 25b item 1.
 *
 * The owner read the ledger and asked "what is ALP?". Every metric this app
 * can print is in `lib/graph.ts`, so every one of them has to have a sentence
 * here — a new marker cannot ship without one, and the test is what says so.
 */
const METRIC_CODES = NODES.filter((n) => n.kind === "metric").map(
  (n) => n.codes![0]!,
);

/** Terms the pages print that are not a metric: the engine's own words. */
const EXTRAS = [
  "egfr",
  "amh",
  "shbg",
  "phenoage",
  "likelihood_ratio",
  "grade",
  "risk_state",
];

describe("the glossary", () => {
  it("covers every metric in the catalog", () => {
    const missing = METRIC_CODES.filter((code) => !termFor(code));
    expect(missing).toEqual([]);
    expect(METRIC_CODES.length).toBeGreaterThan(40);
  });

  it("has an entry for every non-metric term the pages print", () => {
    expect(EXTRAS.filter((id) => !termFor(id))).toEqual([]);
  });

  it("has no key that is neither a metric nor a listed extra", () => {
    const known = new Set([...METRIC_CODES, ...EXTRAS]);
    expect(GLOSSARY.map((e) => e.id).filter((id) => !known.has(id))).toEqual(
      [],
    );
  });

  it("says what, why and where for every entry", () => {
    const thin = GLOSSARY.filter(
      (e) => !e.what.trim() || !e.why.trim() || !e.where.trim(),
    ).map((e) => e.id);
    expect(thin).toEqual([]);
  });

  it("writes plain sentences, not lab shorthand", () => {
    const shouty = GLOSSARY.filter((e) => /^[A-Z]{2,}\b/.test(e.what)).map(
      (e) => e.id,
    );
    expect(shouty).toEqual([]);
  });

  it("borrows the vector's own reason where there is one", () => {
    // `lib/vectors.ts` already wrote this sentence for the HbA1c vector.
    expect(termFor("hba1c")!.why).toBe(
      "Three months of blood sugar in one number.",
    );
  });

  it("has no two entries fighting over one id", () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("answers to the label as well as the code", () => {
    expect(termFor("ALP")!.id).toBe("alp");
    expect(termFor("Alkaline phosphatase")!.id).toBe("alp");
    expect(termFor("apoB")!.id).toBe("apolipoprotein_b");
  });
});

describe("marking terms up inside a sentence", () => {
  const marked = (text: string) =>
    splitTerms(text)
      .filter((p) => typeof p !== "string")
      .map((p) => (p as { text: string }).text);

  it("finds the shorthand", () => {
    expect(marked("ALP 128 U/L, a liver enzyme")).toEqual(["ALP"]);
  });

  it("keeps the sentence whole", () => {
    expect(
      splitTerms("ALP 128")
        .map((p) => (typeof p === "string" ? p : p.text))
        .join(""),
    ).toBe("ALP 128");
  });

  it("never matches inside a longer word", () => {
    expect(marked("ALTERNATIVE therapies and altitude")).toEqual([]);
    expect(marked("hs-CRP 1.2")).toEqual(["hs-CRP"]);
  });

  it("prefers the longer name", () => {
    expect(marked("non-HDL cholesterol 130")).toEqual(["non-HDL"]);
  });

  it("leaves plain words alone", () => {
    expect(marked("Triglycerides are the fat in your blood")).toEqual([]);
  });

  it("handles the brackets in Lp(a)", () => {
    expect(marked("Lp(a) 180 nmol/L")).toEqual(["Lp(a)"]);
  });
});
