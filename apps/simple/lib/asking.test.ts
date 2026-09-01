import { describe, expect, it } from "vitest";
import {
  ASK_ID,
  askHref,
  asksFromMoves,
  askSurfaces,
  effectLine,
  inlineAsks,
  type Ask,
} from "./asking";
import type { Move } from "./infogain";

const question = (
  key: string,
  label: string,
  moves: { id: string; from: number; to: number }[],
): Move => ({
  kind: "question",
  featureId: `fact:${key}`,
  label,
  cost: 0,
  outcomes: [],
  entropyBefore: 1,
  entropyAfter: 0.5,
  gain: 0.5,
  ratio: 0.5,
  shift: moves.reduce((n, m) => n + Math.abs(m.to - m.from), 0),
  moves,
});

const NAMES: Record<string, string> = {
  insulin_resistance: "Insulin resistance",
  hypertension: "High blood pressure",
  masld: "MASLD",
};
const nameOf = (id: string) => NAMES[id] ?? id;

describe("asksFromMoves", () => {
  it("folds one question's per-condition deltas into a single entry", () => {
    const asks = asksFromMoves(
      [
        question("waist_cm", "What is your waist?", [
          { id: "insulin_resistance", from: 0.64, to: 0.81 },
          { id: "hypertension", from: 0.35, to: 0.49 },
          { id: "masld", from: 0.4, to: 0.2 },
        ]),
      ],
      nameOf,
    );
    expect(asks).toHaveLength(1);
    expect(effectLine(asks[0]!.moves)).toBe(
      "Insulin resistance 64 → 81, High blood pressure 35 → 49, MASLD 40 → 20",
    );
  });

  it("dedupes by fact key across moves and keeps the biggest delta", () => {
    const asks = asksFromMoves(
      [
        question("waist_cm", "What is your waist?", [
          { id: "insulin_resistance", from: 0.64, to: 0.7 },
        ]),
        question("waist_cm", "What is your waist?", [
          { id: "insulin_resistance", from: 0.64, to: 0.81 },
          { id: "masld", from: 0.4, to: 0.2 },
        ]),
      ],
      nameOf,
    );
    expect(asks.map((a) => a.key)).toEqual(["waist_cm"]);
    expect(asks[0]!.moves).toEqual([
      {
        id: "insulin_resistance",
        name: "Insulin resistance",
        from: 0.64,
        to: 0.81,
      },
      { id: "masld", name: "MASLD", from: 0.4, to: 0.2 },
    ]);
  });

  it("drops tests, and drops a question that moves nothing", () => {
    const test: Move = { ...question("x", "A test", []), kind: "test" };
    const dust = question("y", "Barely", [
      { id: "masld", from: 0.4, to: 0.401 },
    ]);
    expect(asksFromMoves([test, dust], nameOf)).toEqual([]);
  });
});

describe("askHref", () => {
  it("carries the key to the one input, and still anchors", () => {
    expect(askHref("smoking")).toBe(`/?ask=smoking#${ASK_ID}`);
    expect(askHref("cycle_phase_at_last_draw")).toContain(
      "ask=cycle_phase_at_last_draw",
    );
    expect(askHref()).toBe(`/#${ASK_ID}`);
  });
});

describe("askSurfaces", () => {
  const ask = (key: string): Ask => ({
    key,
    question: `${key}?`,
    moves: [{ id: "masld", name: "MASLD", from: 0.4, to: 0.2 }],
  });

  /** Home as it renders: the Today card, then four condition cards. */
  const home = {
    due: ["bedtime_hour"],
    gain: [ask("waist_cm"), ask("sym_energy")],
    others: [
      { where: "card:insulin_resistance", keys: ["waist_cm"] },
      { where: "card:hypertension", keys: ["waist_cm"] },
      { where: "card:masld", keys: ["waist_cm", "sym_energy"] },
    ],
  };

  it("takes the answer in one place and links from every other", () => {
    const plan = askSurfaces(home);
    expect(plan.ask?.key).toBe("waist_cm");
    expect(plan.inputs).toEqual(["bedtime_hour", "waist_cm"]);
    expect(plan.links).toEqual(["waist_cm", "sym_energy"]);
  });

  it("never renders the same question key in two inputs on a page", () => {
    const plan = askSurfaces(home);
    expect(new Set(plan.inputs).size).toBe(plan.inputs.length);
    for (const key of plan.links)
      expect(plan.inputs.filter((k) => k === key).length).toBeLessThanOrEqual(
        1,
      );
  });

  it("does not ask twice when the best question is already a due re-ask", () => {
    const plan = askSurfaces({ ...home, due: ["waist_cm"] });
    expect(plan.ask?.key).toBe("sym_energy");
    expect(plan.inputs).toEqual(["waist_cm", "sym_energy"]);
  });

  /**
   * Phase 25a item 3. "Answer →" under "Do you smoke?" used to land on
   * `/#today-question`, which asked whatever the engine ranked first. The link
   * carries the key now, and the key wins the one input.
   */
  it("asks the question the link asked for, not the best one", () => {
    const plan = askSurfaces(home, "sym_energy");
    expect(plan.ask?.key).toBe("sym_energy");
    expect(plan.inputs).toEqual(["bedtime_hour", "sym_energy"]);
  });

  it("falls back to the best question when the wanted key is not on offer", () => {
    const plan = askSurfaces(home, "not_a_key");
    expect(plan.ask?.key).toBe("waist_cm");
  });

  it("never doubles the input when the wanted key is already due", () => {
    const plan = askSurfaces({ ...home, due: ["waist_cm"] }, "waist_cm");
    expect(plan.inputs).toEqual(["waist_cm", "sym_energy"]);
    expect(new Set(plan.inputs).size).toBe(plan.inputs.length);
  });

  it("asks nothing when the engine has nothing to ask", () => {
    const plan = askSurfaces({ due: [], gain: [], others: [] });
    expect(plan.ask).toBeUndefined();
    expect(plan.inputs).toEqual([]);
    expect(plan.links).toEqual([]);
  });
});

/**
 * Phase 26 item 7. `/plan`'s "Answer these first" was a one-way trip: the link
 * landed on Home, you answered there, and Plan never heard about it. Plan is a
 * legitimate asking surface — the rule is one input per question key per page,
 * not per app.
 */
describe("inlineAsks", () => {
  const asks: Ask[] = [
    {
      key: "waist_cm",
      question: "What is your waist?",
      moves: [
        { id: "insulin_resistance", name: "Insulin resistance", from: 0.64, to: 0.81 },
      ],
    },
  ];

  const open = [
    { id: "r1", question: "What is your waist?", options: [], factKey: "waist_cm" },
    { id: "r2", question: "Do you smoke?", options: ["Yes", "No"], factKey: "smoking" },
  ];

  it("answers every open question where it is asked", () => {
    const rows = inlineAsks(open, asks);
    expect(rows.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("says what answering moves, when the engine knows", () => {
    const [waist, smoking] = inlineAsks(open, asks);
    expect(waist!.detail).toBe("Answering moves Insulin resistance 64 → 81");
    expect(smoking!.detail).toBeUndefined();
  });

  it("never renders the same question key twice on the page", () => {
    const rows = inlineAsks(
      [...open, { id: "r3", question: "What is your waist?", options: [], factKey: "waist_cm" }],
      asks,
    );
    const keys = rows.map((r) => r.factKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows).toHaveLength(2);
  });

  it("keeps a question that carries no fact key", () => {
    const rows = inlineAsks(
      [{ id: "c1", question: "Did you take it?", options: ["Yes", "No"] }],
      asks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.detail).toBeUndefined();
  });
});
