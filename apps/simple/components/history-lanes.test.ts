import { describe, expect, it } from "vitest";
import { fit, packRows } from "./history-lanes";

/**
 * The lock on the overlap the owner saw on day one: two facts on the same
 * date drew their labels on top of each other. The packer puts each label in
 * the first row where its own span is free, and spills the rest.
 */
const span = (item: { from: number; to: number }) => item;

describe("packRows", () => {
  it("keeps labels that do not touch on one row", () => {
    const { placed, overflow } = packRows(
      [
        { from: 0, to: 40 },
        { from: 50, to: 90 },
      ],
      span,
    );
    expect(placed.map((p) => p.row)).toEqual([0, 0]);
    expect(overflow).toEqual([]);
  });

  it("drops a colliding label to the next row", () => {
    const { placed } = packRows(
      [
        { from: 0, to: 40 },
        { from: 20, to: 60 },
        { from: 30, to: 70 },
      ],
      span,
    );
    expect(placed.map((p) => p.row)).toEqual([0, 1, 2]);
  });

  it("reuses row 0 once it is clear again", () => {
    const { placed } = packRows(
      [
        { from: 0, to: 40 },
        { from: 20, to: 60 },
        { from: 45, to: 80 },
      ],
      span,
    );
    expect(placed.map((p) => p.row)).toEqual([0, 1, 0]);
  });

  it("spills past four rows instead of stacking for ever", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      from: i,
      to: i + 40,
    }));
    const { placed, overflow } = packRows(items, span);
    expect(placed).toHaveLength(4);
    expect(placed.map((p) => p.row)).toEqual([0, 1, 2, 3]);
    expect(overflow).toHaveLength(2);
  });
});

describe("fit", () => {
  it("leaves a label that already fits alone", () => {
    expect(fit("walk 30 minutes", 200, 5.4)).toBe("walk 30 minutes");
  });

  it("ends a label that does not fit with an ellipsis", () => {
    expect(fit("walk 30 minutes after the largest meal", 60, 5.4)).toBe(
      "walk 30 mi…",
    );
  });

  it("prints nothing when there is no room at all", () => {
    expect(fit("anything", 4, 5.4)).toBe("");
  });
});
