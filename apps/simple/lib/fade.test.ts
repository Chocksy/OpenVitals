import { describe, expect, it } from "vitest";
import { PROFILE_QUESTIONS } from "./vectors";
import { fadeClassOf, fadeWeight, fadeWords, halfLifeOf } from "./fade";

describe("fade (44A)", () => {
  it("gives every question key a class", () => {
    const missing = Object.keys(PROFILE_QUESTIONS).filter(
      (k) => fadeClassOf(k) == null,
    );
    expect(missing).toEqual([]);
  });
  it("never fades a fixed fact", () => {
    expect(halfLifeOf("sex", false)).toBeNull();
    expect(fadeWeight("family_history", true, 4000)).toBe(1);
  });
  it("treats revisitDays 0 as fixed", () => {
    expect(fadeClassOf("birth_year")).toBe("fixed");
  });
  it("halves a symptom No at 90 days and a Yes at 180", () => {
    expect(fadeWeight("sym_cold", false, 90)).toBeCloseTo(0.5);
    expect(fadeWeight("sym_cold", true, 180)).toBeCloseTo(0.5);
    expect(fadeWeight("sym_cold", false, 0)).toBe(1);
  });
  it("fades a follow-up key by its prefix", () => {
    expect(
      fadeClassOf("followup_effect:00000000-0000-0000-0000-000000000001"),
    ).toBe("followup");
    expect(fadeWeight("followup_adherence:x", true, 60)).toBeCloseTo(0.5);
  });
  it("fades alcohol as a habit, not a symptom", () => {
    expect(fadeClassOf("sym_alcohol")).toBe("habit");
  });
  it("words the weight", () => {
    expect(fadeWords(0.8)).toBe("almost fully");
    expect(fadeWords(0.5)).toBe("half");
    expect(fadeWords(0.2)).toBe("little");
  });
});
