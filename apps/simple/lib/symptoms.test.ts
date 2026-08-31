import { describe, it, expect } from "vitest";
import type { ModelInput } from "./coverage";
import { CATALOG } from "./hkb-catalog";
import { nextMoves } from "./infogain";
import { SYMPTOMS, SYMPTOM_ITEMS, SYMPTOM_KEYS } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-28",
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

describe("SYMPTOMS", () => {
  it("is twelve core items, with the mood one asked as two questions", () => {
    const core = SYMPTOM_ITEMS.filter((i) => i.item <= 12);
    expect(core).toHaveLength(12);
    expect(SYMPTOMS.filter((s) => s.item <= 12)).toHaveLength(13);
    expect(SYMPTOM_ITEMS[6]!.questions).toHaveLength(2);
  });

  it("adds the rare-disease block after the twelve, one question each", () => {
    // Phase 18: the questions a specialist asks in the first minute and a
    // general panel never does. Each one is read by at least one rule.
    const rare = SYMPTOM_ITEMS.filter((i) => i.item > 12);
    expect(rare).toHaveLength(10);
    expect(rare.every((i) => i.questions.length === 1)).toBe(true);
    expect(SYMPTOMS.map((s) => s.key)).toContain("sym_acroparesthesia");
  });

  it("merges snoring rather than asking it twice", () => {
    expect(SYMPTOM_KEYS.has("sleep_snoring")).toBe(true);
    expect(PROFILE_QUESTIONS.sleep_snoring!.options).toEqual([
      "No",
      "Sometimes",
      "Most nights",
    ]);
  });

  it("gives every item options and a source", () => {
    for (const s of SYMPTOMS) {
      expect(s.options.length).toBeGreaterThan(1);
      expect(s.source.length).toBeGreaterThan(20);
      expect(PROFILE_QUESTIONS[s.key]?.question).toBe(s.question);
    }
  });

  it("has an evidence rule somewhere in the catalog for every item", () => {
    const read = new Set(
      CATALOG.flatMap((h) => h.evidence.map((e) => e.input.fact)).filter(Boolean),
    );
    for (const s of SYMPTOMS) expect(read.has(s.key)).toBe(true);
  });
});

describe("symptoms as moves", () => {
  const moves = (m: ModelInput) =>
    nextMoves(m, CATALOG).map((mv) => mv.featureId.replace(/^fact:/, ""));

  it("proposes symptom questions for someone with nothing measured", () => {
    const asked = moves(input({ sex: "female", age: 44 }));
    expect(asked.filter((k) => SYMPTOM_KEYS.has(k)).length).toBeGreaterThan(0);
  });

  it("never proposes a cycle question to a man", () => {
    expect(moves(input({ sex: "male", age: 44 }))).not.toContain("sym_cycle");
  });

  it("stops proposing an item once it is answered", () => {
    const before = moves(input({ sex: "female", age: 44 }));
    const after = moves(
      input({ sex: "female", age: 44, profile: { sym_cold: "Yes" } }),
    );
    expect(before).toContain("sym_cold");
    expect(after).not.toContain("sym_cold");
  });
});
