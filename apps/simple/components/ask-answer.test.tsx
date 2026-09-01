import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The "Act on it" row is a client component and re-reads the page after an
// add, so it calls `useRouter`. Rendering the answer on its own has no app
// router; this is the smallest stand-in that lets the row print.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
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

/**
 * Phase 27. The answers were right and then they stopped: six good sentences
 * and nothing to press. The row is one chip per thing the answer named, and
 * the verb on the chip is what the button will actually do.
 */
const acts = {
  actions: [
    {
      id: "plan:r1:0",
      title: "Selenium 200 µg/day",
      dose: "200 µg · once daily",
      label: "[opinion]",
      target: null,
    },
    {
      id: "int:iron",
      title: "Iron bisglycinate",
      dose: "60 mg",
      label: "[science, C]",
      target: null,
    },
  ],
  tests: [
    { code: "ferritin", name: "Ferritin", weeks: 12, selfOrder: true },
    {
      code: "ogtt_insulin",
      name: "OGTT with insulin",
      weeks: 12,
      selfOrder: false,
    },
  ],
  questions: [{ key: "family_history", question: "Anyone in the family?" }],
};

describe("the Act on it row", () => {
  const out = html({ ...question, acts });

  it("prints one Add chip per action, with its dose and its label", () => {
    expect(out).toContain("Add: Selenium 200 µg/day 200 µg · once daily");
    expect(out).toContain("[opinion]");
    expect(out).toContain("Add: Iron bisglycinate 60 mg");
    expect(out.match(/data-act="add"/g)).toHaveLength(2);
  });

  it("offers Add all once there are two", () => {
    expect(out).toContain("Add all 2");
  });

  it("plans a retest a person can order, with the marker and the weeks", () => {
    expect(out).toContain("Plan retest: Ferritin in 12 weeks");
  });

  it("asks the doctor for a test a person cannot order", () => {
    expect(out).toContain("Ask your doctor for: OGTT with insulin");
    expect(out).not.toContain("Plan retest: OGTT");
  });

  it("links a question to the Today card that takes its answer", () => {
    expect(out).toContain("Answer: Anyone in the family?");
    expect(out).toContain("/?ask=family_history#today-question");
  });

  it("renders nothing at all when the answer named nothing", () => {
    for (const empty of [
      undefined,
      { actions: [], tests: [], questions: [] },
    ]) {
      const bare = html({ ...question, acts: empty });
      expect(bare).not.toContain("Act on it");
      expect(bare).not.toContain("data-act");
    }
  });

  it("carries the row under a Discuss answer too, on the same route", () => {
    expect(html({ ...question, now: null, acts })).toContain("Act on it");
  });
});

/**
 * Phase 27 addendum, from the owner: Discuss on a plan action, typed "i
 * already do this", and read "I don't know that word. Ask it as a question, or
 * try the disease name." That copy belongs to the ontology lookup and to
 * nothing a subject was ever opened about.
 */
describe("about mode never sends anybody to the dictionary", () => {
  it("says nothing about words on the question route", () => {
    const out = html({
      ...question,
      term: null,
      matches: [],
      reply: undefined,
      now: null,
    });
    expect(out).not.toContain("I don");
    expect(out).not.toContain("try the disease name");
    expect(out).toContain("No answer came back");
  });
});
