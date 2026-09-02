import { describe, expect, it } from "vitest";
import { factsBlock, kindBlockFor } from "./brief";
import type { AskCandidates } from "./lookup";

/**
 * Phase 28c. `briefFor` was cut out of `answerQuestion` so a thread and the
 * single-shot ask read from the same prompt. These two are the pure halves:
 * what a kind is allowed to see, and the order the facts arrive in.
 */
const candidates: AskCandidates = {
  actions: [
    { id: "plan:r1:0", title: "Resistance training 3x/week", dose: null },
  ],
  tests: [{ code: "hba1c", name: "HbA1c", weeks: 12, selfOrder: true }],
  questions: [{ key: "smoking", question: "Do you smoke?" }],
  sources: [{ id: "s1", name: "Hollowell 2002", year: 2002, grade: "A" }],
} as unknown as AskCandidates;

describe("kindBlockFor", () => {
  it("gives research and prognosis the papers and nobody else", () => {
    const args = {
      sources: [
        { id: "s1", name: "Hollowell 2002", year: 2002, grade: "A", says: "TPO decides it" },
      ],
      mechanisms: [
        { from: "TSH", to: "LDL", relation: "raises", grade: "B", mechanism: "fewer receptors" },
      ],
      settles: ["OGTT settles Type 2 diabetes 53 % → 94 %"],
    } as Parameters<typeof kindBlockFor>[1];

    for (const kind of ["research", "prognosis"] as const)
      expect(kindBlockFor(kind, args)).toContain("Hollowell 2002");
    for (const kind of ["status", "howto", "why", "next-test"] as const)
      expect(kindBlockFor(kind, args)).not.toContain("Hollowell 2002");
  });

  it("gives why the mechanisms and next-test the information gain", () => {
    const args = {
      sources: [],
      mechanisms: [
        { from: "TSH", to: "LDL", relation: "raises", grade: "B", mechanism: "fewer receptors" },
      ],
      settles: ["OGTT settles Type 2 diabetes"],
    } as Parameters<typeof kindBlockFor>[1];

    expect(kindBlockFor("why", args)).toContain("fewer receptors");
    expect(kindBlockFor("next-test", args)).toContain("OGTT settles");
    expect(kindBlockFor("why", args)).not.toContain("OGTT settles");
    expect(kindBlockFor("howto", args)).toBe("");
  });

  it("says so rather than going quiet when a block is empty", () => {
    const empty = { sources: [], mechanisms: [], settles: [] } as Parameters<
      typeof kindBlockFor
    >[1];
    expect(kindBlockFor("research", empty)).toContain("no graded row on file");
    expect(kindBlockFor("why", empty)).toContain("no mechanism row");
  });
});

describe("factsBlock", () => {
  const base = {
    conclusions: ["insulin resistance likely 97 %"],
    now: null,
    plan: [],
    papers: [],
    open: "",
    candidates,
    kindBlock: "",
    context: "",
  } as Parameters<typeof factsBlock>[0];

  it("prints every closed set the answer may pick ids from", () => {
    const text = factsBlock(base);
    expect(text).toContain("hba1c · HbA1c · 12");
    expect(text).toContain("smoking · Do you smoke?");
    expect(text).toContain("insulin resistance likely 97 %");
  });

  it("keeps the order the eval scores", () => {
    const text = factsBlock(base);
    const order = [
      "WHAT THE ENGINE CONCLUDES",
      "THEIR PLAN",
      "WHAT THE PAPERS SAY",
      "PROJECTIONS ON FILE",
      "MARKERS THEY COULD MEASURE AGAIN",
      "QUESTIONS THEY COULD ANSWER",
    ].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("says a condition was never named rather than leaving a gap", () => {
    expect(factsBlock(base)).toContain("THEY NAMED NO CONDITION");
    expect(
      factsBlock({
        ...base,
        now: { id: "c1", name: "Hashimoto", state: "likely", probability: 0.8 },
      }),
    ).toContain("Hashimoto: likely, 80 %");
  });
});
