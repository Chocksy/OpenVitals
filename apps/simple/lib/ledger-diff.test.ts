import { describe, expect, it } from "vitest";
import {
  ledgerDiff,
  moved,
  snapshotLedger,
  type LedgerSnapshot,
} from "./ledger-diff";
import type { Ledger } from "./ledger";

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

describe("ledgerDiff", () => {
  it("is empty when nothing moved", () => {
    const s = snap([card("ir", 1, 64)]);
    const d = ledgerDiff(s, s);
    expect(moved(d)).toBe(false);
    expect(d.line).toBe("");
  });

  it("names the percentage that changed", () => {
    const d = ledgerDiff(snap([card("ir", 1, 64)]), snap([card("ir", 1, 81)]));
    expect(d.numbers).toEqual([
      { id: "ir", title: "ir: likely", from: 64, to: 81 },
    ]);
    expect(moved(d)).toBe(true);
  });

  it("says which chip flipped", () => {
    const d = ledgerDiff(
      snap([card("ir", 1, 48, "possible")]),
      snap([card("ir", 1, 64, "likely")]),
    );
    expect(d.states).toEqual([
      { id: "ir", title: "ir: likely", from: "possible", to: "likely" },
    ]);
  });

  it("says which cards moved and where to", () => {
    const before = snap([card("a", 1, 60), card("b", 2, 55)]);
    const after = snap([card("b", 1, 70), card("a", 2, 60)]);
    const d = ledgerDiff(before, after);
    expect(d.moved).toEqual([
      { id: "b", from: 2, to: 1 },
      { id: "a", from: 1, to: 2 },
    ]);
  });

  it("does not report a move for a card that stayed put", () => {
    const before = snap([card("a", 1, 60), card("b", 2, 55)]);
    const after = snap([card("a", 1, 62), card("b", 2, 55)]);
    expect(ledgerDiff(before, after).moved).toEqual([]);
  });

  it("reports the cards an answer added and removed", () => {
    const d = ledgerDiff(
      snap([card("a", 1, 60), card("gone", 2, 20)]),
      snap([card("a", 1, 60), card("new", 2, 30)]),
    );
    expect(d.entered).toEqual(["new"]);
    expect(d.left).toEqual(["gone"]);
  });

  it("ignores a card that prints no percentage", () => {
    const d = ledgerDiff(
      snap([card("marker:alt", 1, null, null)]),
      snap([card("marker:alt", 1, null, null)]),
    );
    expect(d.numbers).toEqual([]);
    expect(d.states).toEqual([]);
  });

  it("reports a first percentage as a change from null", () => {
    const d = ledgerDiff(
      snap([card("ir", 1, null)]),
      snap([card("ir", 1, 12)]),
    );
    expect(d.numbers).toEqual([
      { id: "ir", title: "ir: likely", from: null, to: 12 },
    ]);
  });

  it("reports the counters that changed and nothing else", () => {
    const d = ledgerDiff(
      snap([], { questions: 21, off: 6 }),
      snap([], { questions: 20, off: 6 }),
    );
    expect(d.counters).toEqual([{ key: "questions", from: 21, to: 20 }]);
  });

  it("reports a system ring in whole percent", () => {
    const d = ledgerDiff(
      snap([], {}, [{ id: "metabolic", score: 65 }]),
      snap([], {}, [{ id: "metabolic", score: 71 }]),
    );
    expect(d.systems).toEqual([{ id: "metabolic", from: 65, to: 71 }]);
  });

  it("writes the biggest move first in the toast line", () => {
    const before = snap([card("small", 1, 40), card("big", 2, 20)]);
    const after = snap([card("small", 1, 42), card("big", 2, 55)]);
    const d = ledgerDiff(before, after);
    expect(d.line).toBe("big 20 → 55 · 1 more moved");
  });

  it("counts reordered cards in the toast line", () => {
    const before = snap([card("a", 1, 60), card("b", 2, 55)]);
    const after = snap([card("b", 1, 55), card("a", 2, 60)]);
    expect(ledgerDiff(before, after).line).toBe("2 cards reordered");
  });
});

/**
 * Phase 25a item 8. "Questions worth answering" only moved when the Today
 * question was answered; a Still-true confirm, skip or change left the number
 * where it was until the next full reload. Every one of those paths now ends
 * in a server re-render, and the diff is what says the counter moved.
 */
describe("the questions counter", () => {
  const withQuestions = (n: number) => snap([card("ir", 1, 64)], { questions: n });

  it("moves when a still-true confirm takes a question off the list", () => {
    const d = ledgerDiff(withQuestions(21), withQuestions(20));
    expect(d.counters).toEqual([{ key: "questions", from: 21, to: 20 }]);
    expect(moved(d)).toBe(true);
  });

  it("moves when a changed answer puts a new question on it", () => {
    const d = ledgerDiff(withQuestions(20), withQuestions(22));
    expect(d.counters).toEqual([{ key: "questions", from: 20, to: 22 }]);
  });

  it("says nothing when a skip changed no belief and no count", () => {
    expect(moved(ledgerDiff(withQuestions(21), withQuestions(21)))).toBe(false);
  });

  it("reports a counter move even when no card moved", () => {
    const d = ledgerDiff(withQuestions(21), withQuestions(20));
    expect(d.numbers).toEqual([]);
    expect(d.moved).toEqual([]);
    expect(moved(d)).toBe(true);
  });
});

describe("snapshotLedger", () => {
  it("keeps only what can visibly change", () => {
    const ledger = {
      counters: {
        optimal: 90,
        normal: 20,
        off: 6,
        questions: 21,
        nextDrawCodes: ["hba1c"],
      },
      systems: [{ id: "metabolic", name: "Blood sugar", score: 0.653 }],
      conclusions: [
        {
          id: "insulin_resistance",
          rank: 1,
          probability: 0.6449,
          state: "likely",
          title: "Insulin resistance: likely",
        },
        { id: "marker:alt", rank: 2, title: "ALT 34 U/L, off" },
      ],
    } as unknown as Ledger;

    expect(snapshotLedger(ledger)).toEqual({
      cards: [
        {
          id: "insulin_resistance",
          rank: 1,
          percent: 64,
          state: "likely",
          title: "Insulin resistance: likely",
        },
        {
          id: "marker:alt",
          rank: 2,
          percent: null,
          state: null,
          title: "ALT 34 U/L, off",
        },
      ],
      counters: { optimal: 90, normal: 20, off: 6, questions: 21 },
      systems: [{ id: "metabolic", score: 65 }],
    });
  });
});
