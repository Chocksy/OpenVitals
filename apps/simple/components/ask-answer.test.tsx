import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskAnswer, leadSentence, type Answer } from "./ask-answer";

/**
 * Phase 26, item 2. Every question answer opened with a lie: the question
 * route ran the ontology lookup over the words it pulled out of the sentence,
 * and this component printed that lookup's header. "Hashimoto thyroiditis:
 * nothing in your data has been scored against it yet" sat above an answer
 * about a Hashimoto's the engine had already confirmed at 95 %.
 *
 * So the rule is a test, not a memory: on `route: "question"` the rendered
 * output carries the answer, the live state of the named condition, and no
 * ontology header of any kind.
 */
const html = (answer: Answer) =>
  renderToStaticMarkup(createElement(AskAnswer, { answer }));

const base: Answer = {
  matches: [
    {
      id: "MONDO:0007699",
      ontology: "MONDO",
      name: "Hashimoto thyroiditis",
      score: 0.9,
    },
  ],
  term: {
    id: "MONDO:0007699",
    ontology: "MONDO",
    name: "Hashimoto thyroiditis",
    score: 0.9,
  },
  condition: null,
  woken: null,
  probability: null,
  state: null,
  moves: [
    { kind: "test", label: "TPO antibodies", cost: 18, why: "moves it most" },
  ],
  finding: null,
  canConsider: false,
};

const question: Answer = {
  ...base,
  route: "question",
  reply: "Your TPO antibodies are 320 IU/mL. Take selenium 200 µg/day.",
  now: {
    id: "hashimoto",
    name: "Hashimoto's",
    state: "confirmed",
    probability: 0.95,
  },
};

describe("the question route prints the answer and nothing else", () => {
  const out = html(question);

  it("never prints an ontology header", () => {
    expect(out).not.toContain("Hashimoto thyroiditis");
    expect(out).not.toContain("MONDO");
    expect(out).not.toContain("HP:");
    expect(out).not.toContain("Matched");
    expect(out).not.toContain("Also matched");
  });

  it("never says nothing has been scored", () => {
    expect(out).not.toContain("nothing in your data has been scored");
  });

  it("leads with where the condition actually stands", () => {
    expect(out).toContain("Right now: Hashimoto&#x27;s");
    expect(out).toContain("confirmed");
    expect(out).toContain("95 %");
  });

  it("prints the answer", () => {
    expect(out).toContain("selenium 200 µg/day");
  });

  it("prints no lookup furniture", () => {
    expect(out).not.toContain("What would settle it");
    expect(out).not.toContain("Where this comes from");
  });

  it("says so plainly when no answer came back", () => {
    const out = html({ ...question, reply: undefined });
    expect(out).toContain("No answer came back");
    expect(out).not.toContain("nothing in your data has been scored");
  });

  it("prints no state row when the question named no scored condition", () => {
    const out = html({ ...question, now: null });
    expect(out).not.toContain("Right now:");
    expect(out).toContain("selenium");
  });
});

describe("the term route keeps its header", () => {
  it("still says when nothing has been scored against a word", () => {
    expect(leadSentence(base)).toBe(
      "Hashimoto thyroiditis: nothing in your data has been scored against it yet.",
    );
    const out = html({ ...base, route: "term" });
    expect(out).toContain("nothing in your data has been scored");
    expect(out).toContain("What would settle it");
  });
});
