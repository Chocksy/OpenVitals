import { describe, expect, it } from "vitest";
import { movedNothing, movedOf, receiptLine } from "./read-receipt";
import type { LedgerSnapshot } from "./ledger-diff";

/**
 * The read receipt, phase 32a section 4.
 *
 * The snapshots are built by hand with the same two helpers
 * `lib/ledger-diff.test.ts` uses, because the receipt is that file's diff
 * counted four ways: a card that entered is `new`, one that left is
 * `resolved`, and a percentage that went up or down is `stronger` or `weaker`.
 * Nothing here touches a database or a clock.
 */
const card = (
  id: string,
  rank: number,
  percent: number | null,
  state: string | null = "likely",
) => ({ id, rank, percent, state, title: `${id}: ${state ?? "off"}` });

const snap = (
  cards: LedgerSnapshot["cards"],
  counters: Partial<LedgerSnapshot["counters"]> = {},
  systems: LedgerSnapshot["systems"] = [],
): LedgerSnapshot => ({
  cards,
  counters: { optimal: 0, normal: 0, off: 0, questions: 0, ...counters },
  systems,
});

describe("movedOf", () => {
  it("counts nothing when the file changed nothing", () => {
    const s = snap([card("ir", 1, 41)]);
    expect(movedOf(s, s)).toEqual({
      resolved: 0,
      new: 0,
      stronger: 0,
      weaker: 0,
      lines: [],
    });
  });

  it("counts a card the file put on the ledger", () => {
    const m = movedOf(
      snap([card("ir", 1, 41)]),
      snap([card("ir", 1, 41), card("coeliac", 2, 12)]),
    );
    expect(m.new).toBe(1);
    expect(m.resolved).toBe(0);
    expect(m.lines).toEqual([]);
  });

  it("counts a card the file took off the ledger", () => {
    const m = movedOf(
      snap([card("ir", 1, 41), card("haemochromatosis", 2, 9)]),
      snap([card("ir", 1, 41)]),
    );
    expect(m.resolved).toBe(1);
    expect(m.new).toBe(0);
  });

  it("counts a likelihood that went up, and names it", () => {
    const m = movedOf(
      snap([card("Insulin resistance", 1, 41)]),
      snap([card("Insulin resistance", 1, 47)]),
    );
    expect(m.stronger).toBe(1);
    expect(m.weaker).toBe(0);
    expect(m.lines).toEqual([
      {
        id: "Insulin resistance",
        name: "Insulin resistance",
        from: 41,
        to: 47,
      },
    ]);
  });

  it("counts a likelihood that went down", () => {
    const m = movedOf(
      snap([card("thyroid", 1, 60)]),
      snap([card("thyroid", 1, 44)]),
    );
    expect(m.weaker).toBe(1);
    expect(m.stronger).toBe(0);
    expect(m.lines).toEqual([
      { id: "thyroid", name: "thyroid", from: 60, to: 44 },
    ]);
  });

  it("counts all four at once", () => {
    const before = snap([
      card("ir", 1, 41),
      card("thyroid", 2, 60),
      card("haemochromatosis", 3, 9),
    ]);
    const after = snap([
      card("ir", 1, 47),
      card("thyroid", 2, 44),
      card("coeliac", 3, 12),
    ]);
    const m = movedOf(before, after);
    expect(m).toEqual({
      resolved: 1,
      new: 1,
      stronger: 1,
      weaker: 1,
      lines: [
        { id: "ir", name: "ir", from: 41, to: 47 },
        { id: "thyroid", name: "thyroid", from: 60, to: 44 },
      ],
    });
  });

  it("names a card by what it is, not by its state word", () => {
    const m = movedOf(
      snap([card("ir", 1, 41, "possible")]),
      snap([card("ir", 1, 47, "likely")]),
    );
    expect(m.lines[0]!.name).toBe("ir");
  });
});

describe("movedNothing", () => {
  const same = snap([card("ir", 1, 41)]);

  it("is true for a file that changed nothing the ledger prints", () => {
    expect(movedNothing(movedOf(same, same))).toBe(true);
  });

  it("is true for an upload read before the receipt existed", () => {
    expect(movedNothing(null)).toBe(true);
    expect(movedNothing(undefined)).toBe(true);
  });

  it("is false when a card entered", () => {
    const m = movedOf(same, snap([card("ir", 1, 41), card("new", 2, 12)]));
    expect(movedNothing(m)).toBe(false);
  });

  it("is false when a card left", () => {
    const m = movedOf(snap([card("ir", 1, 41), card("gone", 2, 12)]), same);
    expect(movedNothing(m)).toBe(false);
  });

  it("is false when a number went up", () => {
    expect(movedNothing(movedOf(same, snap([card("ir", 1, 47)])))).toBe(false);
  });

  it("is false when a number went down", () => {
    expect(movedNothing(movedOf(same, snap([card("ir", 1, 33)])))).toBe(false);
  });
});

describe("receiptLine", () => {
  it("says there is nothing to do when nothing moved", () => {
    const s = snap([card("ir", 1, 41)]);
    expect(receiptLine(movedOf(s, s))).toBe("Nothing for you to do");
  });

  it("says the same for an upload with no receipt at all", () => {
    expect(receiptLine(null)).toBe("Nothing for you to do");
  });

  it("names the biggest move rather than summing the counters", () => {
    const before = snap([
      card("Insulin resistance", 1, 41),
      card("Thyroid", 2, 60),
    ]);
    const after = snap([
      card("Insulin resistance", 1, 47),
      card("Thyroid", 2, 59),
    ]);
    expect(receiptLine(movedOf(before, after))).toBe(
      "Insulin resistance 41 → 47 %",
    );
  });

  it("falls back to the count when the only move was a new card", () => {
    const m = movedOf(
      snap([card("ir", 1, 41)]),
      snap([card("ir", 1, 41), card("coeliac", 2, 12)]),
    );
    expect(receiptLine(m)).toBe("1 new on the ledger");
  });

  it("falls back to the count when the only move was a card leaving", () => {
    const m = movedOf(
      snap([card("ir", 1, 41), card("haemochromatosis", 2, 9)]),
      snap([card("ir", 1, 41)]),
    );
    expect(receiptLine(m)).toBe("1 settled");
  });
});
