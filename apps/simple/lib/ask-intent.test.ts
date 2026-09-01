import { describe, expect, it } from "vitest";
import {
  askIntent,
  autoAskToken,
  openingMode,
  questionKind,
  showsBox,
  termQuery,
} from "./ask-intent";

/**
 * Phase 25a item 7. "how can I make sure I do not get type 2 diabetes?" came
 * back as "Nothing in HPO or MONDO matches that", because a sentence was fed
 * to a trigram search over ontology names.
 */
describe("askIntent", () => {
  it("routes a word to the lookup", () => {
    for (const q of [
      "haemochromatosis",
      "type 2 diabetes",
      "apoB",
      "cold hands",
      "MONDO:0005148",
    ])
      expect(askIntent(q)).toBe("term");
  });

  it("routes a question to the grounded answer", () => {
    for (const q of [
      "how can I make sure I do not get type 2 diabetes?",
      "what does my apoB mean",
      "should I take a statin?",
      "is my thyroid ok?",
      "why am I tired all the time",
      "do I have insulin resistance?",
    ])
      expect(askIntent(q)).toBe("question");
  });

  it("treats an empty box as nothing to look up", () => {
    expect(askIntent("   ")).toBe("term");
  });
});

describe("termQuery", () => {
  it("pulls the disease out of the sentence", () => {
    expect(termQuery("how can I make sure I do not get type 2 diabetes?")).toBe(
      "type 2 diabetes",
    );
    expect(termQuery("what is my risk of haemochromatosis?")).toBe(
      "haemochromatosis",
    );
    expect(termQuery("should I worry about fatty liver disease")).toBe(
      "worry fatty liver disease",
    );
    expect(termQuery("what does my apoB mean")).toBe("apob");
  });

  it("leaves a term alone", () => {
    expect(termQuery("haemochromatosis")).toBe("haemochromatosis");
    expect(termQuery("Type 2 diabetes")).toBe("type 2 diabetes");
  });

  it("keeps the question when it is nothing but scaffolding", () => {
    expect(termQuery("what is it?")).toBe("what is it?");
  });
});

/**
 * Phase 26 items 1 and 4, the composer's whole contract in one pure function.
 */
describe("openingMode", () => {
  it("submits a prefilled question the moment the box opens", () => {
    const mode = openingMode({ text: "what's my cholesterol?" });
    expect(mode).toEqual({ ask: true, auto: true, drafts: false });
  });

  it("never reads a question for facts", () => {
    for (const text of [
      "what's my cholesterol?",
      "what should I do to lower my LDL?",
      "why am I tired all the time",
    ])
      expect(openingMode({ text }).drafts).toBe(false);
  });

  it("reads a statement for facts, and never submits it by itself", () => {
    const mode = openingMode({ text: "I slept five hours last night" });
    expect(mode).toEqual({ ask: false, auto: false, drafts: true });
  });

  it("waits for a few words before reading anything", () => {
    expect(openingMode({ text: "tea" }).drafts).toBe(false);
  });

  it("opens empty with nothing to do", () => {
    expect(openingMode({ text: "" })).toEqual({
      ask: false,
      auto: false,
      drafts: false,
    });
  });

  /**
   * Discuss is a question about a condition, whatever the person types next.
   * Before this, it prefilled "About Autoimmune thyroiditis (Hashimoto's): "
   * and the fact reader offered to write it as a phenotype.
   */
  it("makes Discuss a question with nothing typed and never a draft", () => {
    expect(openingMode({ text: "", about: "hashimoto" })).toEqual({
      ask: true,
      auto: false,
      drafts: false,
    });
    expect(
      openingMode({ text: "how do I fix this?", about: "hashimoto" }),
    ).toEqual({ ask: true, auto: true, drafts: false });
  });

  /**
   * Phase 27, from the owner. Discuss on the action "Resistance training
   * 3x/week", typed "i already do this", and the box answered "I don't know
   * that word": a subject forced the ask route, the statement went to the
   * ontology lookup, and nothing matched. A statement about a subject is a
   * statement, and it is read for facts like any other.
   */
  it("tells a statement about a subject, and never asks it", () => {
    for (const text of [
      "i already do this",
      "I've been doing this since March",
      "i stopped last month",
      "my hands are cold",
    ])
      expect(openingMode({ text, about: "resistance-training" })).toEqual({
        ask: false,
        auto: false,
        drafts: true,
      });
  });
});

describe("showsBox", () => {
  it("shows the box until a question is asked", () => {
    expect(showsBox({ question: "", answered: false })).toBe(true);
  });

  it("hides it while the question is in flight, with the answer, and after", () => {
    expect(showsBox({ question: "why am I tired?", answered: false })).toBe(
      false,
    );
    expect(showsBox({ question: "why am I tired?", answered: true })).toBe(
      false,
    );
  });

  it("brings it back when Ask another clears the question", () => {
    expect(showsBox({ question: "", answered: false })).toBe(true);
  });
});

/**
 * The composer is mounted once by the layout and re-runs on every navigation.
 * "Submit on open" has to mean once per opening, not once per render.
 */
describe("autoAskToken", () => {
  const asking = openingMode({ text: "what's my cholesterol?" });
  const telling = openingMode({ text: "I slept five hours" });

  it("submits the first time an opening is seen", () => {
    expect(autoAskToken(asking, 1, 0)).toBe(1);
  });

  it("never submits the same opening twice", () => {
    expect(autoAskToken(asking, 1, 1)).toBeNull();
  });

  it("submits the next opening", () => {
    expect(autoAskToken(asking, 2, 1)).toBe(2);
  });

  it("never submits something that is not a question", () => {
    expect(autoAskToken(telling, 1, 0)).toBeNull();
  });
});

/**
 * Phase 28a item 1. "Will I ever be able to solve this? What does the research
 * say?" was answered with numbers → do this → measure that, i.e. the answer to
 * "how do I fix it?", because one prompt served every question. The kind is
 * decided here, in code, and the shape follows it.
 */
describe("questionKind", () => {
  const cases: [string, string][] = [
    ["what's my cholesterol?", "status"],
    ["what is my ferritin?", "status"],
    ["is my iron ok?", "status"],
    ["am I ok?", "status"],
    ["do I have Hashimoto's?", "status"],
    ["what should I do to lower my LDL?", "howto"],
    ["how do I fix this?", "howto"],
    ["what should I eat?", "howto"],
    ["will I ever be able to solve this?", "prognosis"],
    ["can Hashimoto's be cured?", "prognosis"],
    ["is this permanent?", "prognosis"],
    ["is it reversible?", "prognosis"],
    ["what happens if I do nothing?", "prognosis"],
    ["what does the research say about selenium?", "research"],
    ["is there evidence for that?", "research"],
    ["how strong is the evidence?", "research"],
    ["what do the studies show?", "research"],
    ["why is my LDL high?", "why"],
    ["why am I tired?", "why"],
    ["what causes high TSH?", "why"],
    ["what test next?", "next-test"],
    ["what should I measure next?", "next-test"],
    ["which blood test would help most?", "next-test"],
  ];
  for (const [q, kind] of cases)
    it(`reads "${q}" as ${kind}`, () => expect(questionKind(q)).toBe(kind));

  it("falls back to howto", () => {
    expect(questionKind("selenium 200 mcg")).toBe("howto");
    expect(questionKind("")).toBe("howto");
  });

  it("prefers the course over the citation when a question asks both", () => {
    expect(
      questionKind("will I ever be able to solve this? what does the research say?"),
    ).toBe("prognosis");
  });
});
