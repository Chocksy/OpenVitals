import { describe, it, expect } from "vitest";
import { statusOf } from "./status";

describe("statusOf", () => {
  it("is gray without a value", () => {
    expect(statusOf({ value: null, refLow: 1, refHigh: 2 })).toBe("gray");
  });

  it("is gray without any range", () => {
    expect(statusOf({ value: 5 })).toBe("gray");
  });

  it("is red below the reference low", () => {
    expect(statusOf({ value: 3, refLow: 4, refHigh: 10 })).toBe("red");
  });

  it("is red above the reference high", () => {
    expect(statusOf({ value: 11, refLow: 4, refHigh: 10 })).toBe("red");
  });

  it("is red on a one-sided reference range", () => {
    expect(statusOf({ value: 11, refHigh: 10 })).toBe("red");
    expect(statusOf({ value: 9, refHigh: 10 })).toBe("green");
  });

  it("is amber inside reference but outside optimal", () => {
    expect(
      statusOf({
        value: 99,
        refLow: 70,
        refHigh: 106,
        optimalLow: 72,
        optimalHigh: 85,
      }),
    ).toBe("amber");
  });

  it("is green inside both ranges", () => {
    expect(
      statusOf({
        value: 80,
        refLow: 70,
        refHigh: 106,
        optimalLow: 72,
        optimalHigh: 85,
      }),
    ).toBe("green");
  });

  it("reference range wins over optimal", () => {
    expect(
      statusOf({
        value: 200,
        refLow: 70,
        refHigh: 106,
        optimalLow: 72,
        optimalHigh: 85,
      }),
    ).toBe("red");
  });

  it("uses optimal alone when no reference range exists", () => {
    expect(statusOf({ value: 90, optimalLow: 72, optimalHigh: 85 })).toBe(
      "amber",
    );
    expect(statusOf({ value: 80, optimalLow: 72, optimalHigh: 85 })).toBe(
      "green",
    );
  });
});
