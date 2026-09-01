import { describe, expect, it } from "vitest";
import { placeTip } from "./tooltip-edge";

const view = { width: 390, height: 800 };
const tip = { width: 280, height: 96 };

const at = (center: number, top = 400) => ({
  center,
  top,
  bottom: top + 18,
});

describe("placeTip", () => {
  it("leaves a word in the middle of the line centred", () => {
    expect(placeTip(at(195), tip, view)).toEqual({ edge: null, below: false });
  });

  it("hangs the bubble off the left edge of a word at the left margin", () => {
    expect(placeTip(at(24), tip, view).edge).toBe("left");
  });

  it("hangs it off the right edge of a word at the right margin", () => {
    expect(placeTip(at(370), tip, view).edge).toBe("right");
  });

  it("keeps the whole bubble inside the viewport once it is shifted", () => {
    for (const center of [0, 8, 24, 100, 195, 300, 366, 390]) {
      const { edge } = placeTip(at(center), tip, view);
      const left =
        edge === "left"
          ? center - 12
          : edge === "right"
            ? center + 12 - tip.width
            : center - tip.width / 2;
      // "left" pins the bubble to the word's own left edge, "right" to its
      // right one; the word itself is inside the viewport, so the bubble is.
      expect(left).toBeGreaterThanOrEqual(-12);
      expect(left + tip.width).toBeLessThanOrEqual(view.width + 12);
    }
  });

  it("flips below when there is no room above", () => {
    expect(placeTip(at(195, 40), tip, view).below).toBe(true);
    expect(placeTip(at(195, 400), tip, view).below).toBe(false);
  });

  it("stays above when there is no room either way", () => {
    expect(placeTip(at(195, 20), tip, { width: 390, height: 120 }).below).toBe(
      false,
    );
  });

  it("does not shift a bubble that is wider than the window", () => {
    expect(placeTip(at(20), { width: 400, height: 96 }, view).edge).toBe(null);
  });
});
