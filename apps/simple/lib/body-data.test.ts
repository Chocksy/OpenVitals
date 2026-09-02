import { describe, expect, it } from "vitest";
import { digits, identifierOf, noteFor, NOTE_DAYS } from "./body-data";

/**
 * The pure half of the Body page: how a number is written, what a row's note
 * says about it, and which HealthKit identifier a short type belongs to.
 */
describe("digits", () => {
  it("groups thousands with a thin space, the way the mockup prints them", () => {
    expect(digits(8412)).toBe("8\u2009412");
    expect(digits(120000)).toBe("120\u2009000");
  });

  it("keeps one decimal under 100 and drops it above", () => {
    expect(digits(78.42)).toBe("78.4");
    expect(digits(17)).toBe("17");
    expect(digits(101.4)).toBe("101");
  });
});

describe("identifierOf", () => {
  it("names a quantity type", () => {
    expect(identifierOf("StepCount")).toBe("HKQuantityTypeIdentifierStepCount");
  });

  it("names the three category types as categories", () => {
    expect(identifierOf("SleepAnalysis")).toBe(
      "HKCategoryTypeIdentifierSleepAnalysis",
    );
    expect(identifierOf("AppleStandHour")).toBe(
      "HKCategoryTypeIdentifierAppleStandHour",
    );
  });
});

describe("noteFor", () => {
  const flat = [58, 58, 58, 58, 58, 58];
  /** the sleep path: minutes in, a clock out, both sides of the sentence */
  const clock = (m: number) =>
    `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;

  it("says how far below the mean a value sits, in the headline unit", () => {
    expect(noteFor(55, flat, "bpm")).toBe(
      `3 bpm below the ${NOTE_DAYS}-day mean of 58 bpm`,
    );
  });

  it("says how far above", () => {
    expect(noteFor(62, flat, "bpm")).toBe(
      `4 bpm above the ${NOTE_DAYS}-day mean of 58 bpm`,
    );
  });

  it("does not repeat the number when the value is the mean", () => {
    expect(noteFor(58, flat, "bpm")).toBe(`at your ${NOTE_DAYS}-day mean`);
  });

  it("counts a value inside two percent of the mean as on it", () => {
    expect(noteFor(58.5, flat, "bpm")).toBe(`at your ${NOTE_DAYS}-day mean`);
  });

  it("writes both sides of a sleep note on the clock, never in minutes", () => {
    const nights = [420, 420, 420, 420, 420, 420];
    expect(noteFor(432, nights, "h", "nights", clock)).toBe(
      `0:12 h above the ${NOTE_DAYS}-day mean of 7:00 h`,
    );
  });

  it("says a sleep value on its mean without printing 420", () => {
    const nights = [420, 420, 420, 420, 420, 420];
    expect(noteFor(420, nights, "h", "nights", clock)).toBe(
      `at your ${NOTE_DAYS}-day mean`,
    );
  });

  it("drops the unit when the signal has none", () => {
    expect(noteFor(9000, [7940, 7940, 7940, 7940, 7940, 7940], "")).toBe(
      `1\u2009060 above the ${NOTE_DAYS}-day mean of 7\u2009940`,
    );
  });

  it("refuses to average four readings", () => {
    expect(noteFor(55, [58, 57, 59, 58], "bpm")).toBe(
      `4 readings in ${NOTE_DAYS} days`,
    );
  });

  it("says so when there is nothing behind the value", () => {
    expect(noteFor(55, [], "bpm")).toBe("the first one");
  });
});
