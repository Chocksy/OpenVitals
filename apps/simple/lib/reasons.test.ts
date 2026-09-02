import { describe, expect, it } from "vitest";
import { reasonLine, sayReason } from "./reasons";

/**
 * The lock on phase 30e's Hot nodes.
 *
 * The panel printed the engine's own notes: "glucose 87 mg/dL amber against
 * optimal 72,85", "pattern:insulin_resistance_early", "via glucose->hba1c".
 * Four shapes, none of them a sentence. These are the four, and what each one
 * has to say instead.
 */
describe("the four shapes the engine writes", () => {
  it("names the marker, says the state in words and prints the band", () => {
    expect(sayReason("glucose 87 mg/dL amber against optimal 72..85")).toBe(
      "Fasting glucose 87 mg/dL, borderline against optimal 72–85",
    );
  });

  it("never prints the status enum", () => {
    const said = sayReason(
      "hdl_cholesterol 50 mg/dL red against optimal 50..90",
    );
    expect(said).toBe("HDL cholesterol 50 mg/dL, off against optimal 50–90");
    expect(said).not.toMatch(/\b(red|amber|green|gray)\b/);
  });

  it("gives a pattern id its own name", () => {
    expect(sayReason("pattern:insulin_resistance_early")).toBe(
      "part of the Insulin resistance before HbA1c moves pattern",
    );
  });

  it("reads an edge id as the two markers it joins", () => {
    expect(sayReason("via glucose->hba1c")).toBe(
      "through Fasting glucose → HbA1c",
    );
  });
});

describe("the smaller rewrites", () => {
  it("puts the number first when a marker moved", () => {
    expect(sayReason("moved away from optimal, was 81")).toBe(
      "was 81, moving away from optimal",
    );
    expect(sayReason("moved toward optimal, was 81")).toBe(
      "was 81, moving toward optimal",
    );
  });

  it("says a one-ended band as a floor or a ceiling", () => {
    expect(sayReason("vitamin_d 19 ng/mL red against optimal -..40")).toBe(
      "Vitamin D 19 ng/mL, off against optimal under 40",
    );
    expect(sayReason("ferritin 22 ng/mL amber against optimal 50..-")).toBe(
      "Ferritin 22 ng/mL, borderline against optimal over 50",
    );
  });

  it("reads the comma the engine used to write, too", () => {
    expect(sayReason("glucose 87 mg/dL amber against optimal 72,85")).toBe(
      "Fasting glucose 87 mg/dL, borderline against optimal 72–85",
    );
  });

  it("carries a marker with no unit", () => {
    expect(sayReason("hba1c 5.6 amber against optimal 4..5.4")).toBe(
      "HbA1c 5.6, borderline against optimal 4–5.4",
    );
  });
});

describe("English is left alone", () => {
  for (const said of [
    "reading is stale",
    "an adopted action targets it",
    "family history or a condition names this system",
    "you said this is what you care about",
    "you answered Family history: yes",
    "no reason recorded",
  ])
    it(`passes through "${said}"`, () => {
      expect(sayReason(said)).toBe(said);
    });

  it("joins a whole list with semicolons", () => {
    expect(
      reasonLine([
        "glucose 87 mg/dL amber against optimal 72..85",
        "moved away from optimal, was 81",
        "pattern:insulin_resistance_early",
      ]),
    ).toBe(
      "Fasting glucose 87 mg/dL, borderline against optimal 72–85; was 81, moving away from optimal; part of the Insulin resistance before HbA1c moves pattern",
    );
  });
});
