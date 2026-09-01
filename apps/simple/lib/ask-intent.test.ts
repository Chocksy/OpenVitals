import { describe, expect, it } from "vitest";
import { askIntent, termQuery } from "./ask-intent";

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
