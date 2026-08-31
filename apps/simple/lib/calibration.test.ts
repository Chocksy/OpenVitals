import { describe, it, expect } from "vitest";
import { bandsOf, READABLE_AT, RESOLVING_LR } from "./calibration";
import { CATALOG } from "./hkb-catalog";

describe("bandsOf", () => {
  it("puts each prediction in the band its state would name", () => {
    const bands = bandsOf([
      { predicted: 0.02, resolved: 0 },
      { predicted: 0.1, resolved: 0 },
      { predicted: 0.4, resolved: 1 },
      { predicted: 0.8, resolved: 1 },
      { predicted: 0.95, resolved: 1 },
    ]);
    expect(bands.map((b) => b.n)).toEqual([1, 1, 1, 1, 1]);
    expect(bands.map((b) => b.label)).toEqual([
      "0–5 %",
      "5–25 %",
      "25–60 %",
      "60–90 %",
      "90–100 %",
    ]);
  });

  it("reads a perfectly calibrated engine as calibrated", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({
        predicted: 0.8,
        resolved: i < 8 ? 1 : 0,
      })),
    ];
    const band = bandsOf(rows).find((b) => b.label === "60–90 %")!;
    expect(band.predicted).toBe(0.8);
    expect(band.observed).toBe(0.8);
  });

  it("reads an overconfident engine as overconfident", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      predicted: 0.9,
      resolved: i < 4 ? 1 : 0,
    }));
    const band = bandsOf(rows).find((b) => b.label === "90–100 %")!;
    expect(band.observed!).toBeLessThan(band.predicted!);
  });

  it("says nothing for an empty band rather than zero", () => {
    const bands = bandsOf([{ predicted: 0.5, resolved: 1 }]);
    const empty = bands.find((b) => b.label === "0–5 %")!;
    expect(empty.n).toBe(0);
    expect(empty.observed).toBeNull();
    expect(empty.predicted).toBeNull();
  });

  it("puts 1.0 in the top band and not off the end", () => {
    expect(bandsOf([{ predicted: 1, resolved: 1 }])[4]!.n).toBe(1);
  });
});

describe("what counts as a resolver", () => {
  it("is a discriminator strong enough to settle the question", () => {
    const resolvers = CATALOG.flatMap((h) =>
      h.discriminators
        .filter((d) => d.lrPos >= RESOLVING_LR && !d.repeatable)
        .map((d) => `${h.id}:${d.test}`),
    );
    // The engine has to have some, or nothing is ever measured.
    expect(resolvers.length).toBeGreaterThan(5);
    expect(resolvers).toContain("hashimoto:Anti-TPO antibodies");
    expect(resolvers).toContain("iron_deficiency:Ferritin");
  });

  it("never counts a repeat of a test already done", () => {
    for (const h of CATALOG)
      for (const d of h.discriminators)
        if (d.repeatable)
          expect(d.lrPos >= RESOLVING_LR && !d.repeatable).toBe(false);
  });

  it("waits for twenty events before it says anything", () => {
    expect(READABLE_AT).toBe(20);
  });
});
