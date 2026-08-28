import { describe, it, expect } from "vitest";
import type { ModelInput } from "./coverage";
import { CATALOG } from "./hkb-catalog";
import { nextMoves } from "./infogain";
import { money, priceOf, ratioOf, toEur } from "./prices";

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-28",
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

describe("prices", () => {
  it("converts RON to euros at the ECB reference rate", () => {
    expect(toEur(59, "RON")).toBeCloseTo(11.22, 2);
    expect(toEur(10, "XXX")).toBe(10);
  });

  it("only reads a price for the country the person is in", () => {
    const test = { costByCountry: { RO: 11.22 } };
    expect(priceOf(test, "RO")).toBe(11.22);
    expect(priceOf(test, "GB")).toBeNull();
    expect(priceOf(test, null)).toBeNull();
    expect(priceOf({ costByCountry: undefined }, "RO")).toBeNull();
  });

  it("ranks per euro when priced and per cost band when not", () => {
    expect(ratioOf(1, 20, true)).toBe(0.05);
    expect(ratioOf(1, 2, true)).toBe(0.2); // the €5 floor
    expect(ratioOf(1, 2, false)).toBeCloseTo(1 / 30); // band 2 = €30 nominal
    expect(ratioOf(1, 0, false)).toBe(0.2); // a free question, on the €5 floor
  });

  it("prints a price the way the page does", () => {
    expect(money(11.22)).toBe("€11.22");
    expect(money(57)).toBe("€57");
    expect(money(188.4)).toBe("€188");
  });
});

describe("nextMoves with prices", () => {
  const priced = CATALOG.map((h) => ({
    ...h,
    discriminators: h.discriminators.map((d) =>
      d.test === "HbA1c" ? { ...d, costByCountry: { RO: 60 } } : d,
    ),
  }));

  it("drops a dear test down the ranking once the country is known", () => {
    const before = nextMoves(input({ sex: "male", age: 52 }), priced);
    const after = nextMoves(
      input({ sex: "male", age: 52, profile: { country: "RO" } }),
      priced,
    );
    const rank = (moves: typeof before) =>
      moves.findIndex((m) => m.label === "HbA1c");
    expect(after.find((m) => m.label === "HbA1c")?.priced).toBe(true);
    expect(after.find((m) => m.label === "HbA1c")?.cost).toBe(60);
    expect(rank(after)).toBeGreaterThan(rank(before));
  });

  it("leaves a test with no price on its cost band", () => {
    const moves = nextMoves(
      input({ sex: "male", age: 52, profile: { country: "RO" } }),
      priced,
    );
    const home = moves.find((m) => m.label === "7-day home blood pressure average");
    expect(home?.priced).toBeUndefined();
    expect(home?.cost).toBe(1);
  });
});
