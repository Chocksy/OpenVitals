import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  genesLayer,
  scoreOf,
  WEIGHTS,
  type ScoreInput,
  type ScoreResult,
} from "./score";

/**
 * The vectors are the contract with the phone: `apps/ios` runs the same file
 * through its Swift port (phase 37 task B3), so a change here that the port
 * does not follow fails on one side or the other.
 */
const VECTORS = JSON.parse(
  readFileSync(
    new URL("../fixtures/score-vectors.json", import.meta.url),
    "utf8",
  ),
) as { name: string; input: ScoreInput; expected: ScoreResult }[];

describe("scoreOf, the shared vectors", () => {
  it("has the nine rows the spec names, and more", () => {
    const names = VECTORS.map((v) => v.name);
    for (const n of [
      "prototype",
      "tick 3",
      "tick 4",
      "tick 5",
      "no genome",
      "no targets",
      "nothing",
      "short sleep",
      "over kcal",
    ])
      expect(names).toContain(n);
  });

  for (const v of VECTORS)
    it(v.name, () => {
      expect(scoreOf(v.input)).toEqual(v.expected);
    });
});

describe("scoreOf, the edges", () => {
  const base = VECTORS[0]!.input;

  it("weighs blood heaviest and genes lightest", () => {
    expect(WEIGHTS.life + WEIGHTS.blood + WEIGHTS.genes).toBeCloseTo(1);
    expect(WEIGHTS.blood).toBeGreaterThan(WEIGHTS.life);
  });

  it("calls nothing due no moves row, not a zero", () => {
    expect(
      scoreOf({ ...base, moves: { done: 0, due: 0 } }).rows.moves,
    ).toBeNull();
  });

  it("calls a draw with no classified marker no blood layer", () => {
    expect(
      scoreOf({ ...base, blood: { green: 0, amber: 0, rose: 0 } }).blood,
    ).toBeNull();
  });

  it("drops a row whose target is missing, and only that row", () => {
    const r = scoreOf({ ...base, targets: { kcal: 1900, proteinG: null } });
    expect(r.rows.kcal).toBe(90);
    expect(r.rows.protein).toBeNull();
  });
});

describe("genesLayer", () => {
  const v = (direction: string, grade: string, absent = false) => ({
    direction,
    grade,
    absent,
  });

  it("is null with no genome file", () => {
    expect(genesLayer(null)).toBeNull();
  });

  it("is null when nothing was counted", () => {
    expect(genesLayer([v("up", "A", true)])).toBeNull();
  });

  it("is the share of counted verdicts not raised at grade A or B", () => {
    expect(
      genesLayer([
        v("up", "A"),
        v("up", "C"),
        v("down", "A"),
        v("none", "B"),
        v("up", "B", true),
      ]),
    ).toBe(75);
    expect(genesLayer([v("up", "B"), v("up", "A"), v("none", "A")])).toBe(33);
  });
});
