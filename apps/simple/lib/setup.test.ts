import { describe, expect, it } from "vitest";
import {
  addOnce,
  emptySetup,
  excludedKeys,
  nextKind,
  pickQuestion,
  progressOf,
  SETUP_QUESTIONS,
  type SetupKnown,
  type SetupState,
} from "./setup";

const s0 = (over: Partial<SetupState> = {}): SetupState => ({
  ...emptySetup("2026-09-29T10:00:00Z"),
  ...over,
});
const k = (facts: string[] = [], uploads = 0): SetupKnown => ({
  facts: new Set(facts),
  uploads,
});
const BASICS = ["setup_goal", "sex", "birth_year", "country"];

describe("nextKind", () => {
  it("starts at intro", () => {
    expect(nextKind(s0(), k(), "sym_energy")).toBe("intro");
  });
  it("asks for the upload only when the person said they have a report", () => {
    expect(nextKind(s0({ hasReport: true }), k(["setup_goal"]), null)).toBe(
      "upload",
    );
    expect(nextKind(s0({ hasReport: false }), k(["setup_goal"]), null)).toBe(
      "basics",
    );
    expect(nextKind(s0({ hasReport: true }), k(["setup_goal"], 1), null)).toBe(
      "basics",
    );
    expect(
      nextKind(
        s0({ hasReport: true, passed: ["upload"] }),
        k(["setup_goal"]),
        null,
      ),
    ).toBe("basics");
  });
  it("needs all three basics", () => {
    expect(
      nextKind(
        s0({ hasReport: false }),
        k(["setup_goal", "sex", "birth_year"]),
        null,
      ),
    ).toBe("basics");
  });
  it("body is done by height or by a skip", () => {
    expect(nextKind(s0({ hasReport: false }), k(BASICS), "sym_energy")).toBe(
      "body",
    );
    expect(
      nextKind(
        s0({ hasReport: false }),
        k([...BASICS, "height_cm"]),
        "sym_energy",
      ),
    ).toBe("question");
    expect(
      nextKind(
        s0({ hasReport: false, passed: ["body"] }),
        k(BASICS),
        "sym_energy",
      ),
    ).toBe("question");
  });
  it("stops questions at the cap or when none is left", () => {
    const asked = Array.from({ length: SETUP_QUESTIONS }, (_, i) => `q${i}`);
    const base = { hasReport: false, passed: ["body"] };
    expect(nextKind(s0({ ...base, asked }), k(BASICS), "sym_energy")).toBe(
      "treatments",
    );
    expect(nextKind(s0(base), k(BASICS), null)).toBe("treatments");
  });
  it("counts skipped questions toward the cap", () => {
    const skipped = Array.from({ length: SETUP_QUESTIONS }, (_, i) => `q${i}`);
    expect(
      nextKind(
        s0({ hasReport: false, passed: ["body"], skipped }),
        k(BASICS),
        "sym_energy",
      ),
    ).toBe("treatments");
  });
  it("then treatments, data, reveal", () => {
    const base = { hasReport: false, passed: ["body"] };
    expect(
      nextKind(
        s0({ ...base, passed: ["body", "treatments"] }),
        k(BASICS),
        null,
      ),
    ).toBe("data");
    expect(
      nextKind(
        s0({ ...base, passed: ["body", "treatments", "data"] }),
        k(BASICS),
        null,
      ),
    ).toBe("reveal");
  });
  it("resumes where the person stopped", () => {
    const mid = s0({
      hasReport: false,
      passed: ["body"],
      asked: ["sym_energy", "sym_cold"],
    });
    expect(
      nextKind(mid, k([...BASICS, "sym_energy", "sym_cold"]), "sym_hair_skin"),
    ).toBe("question");
  });
});

describe("excludedKeys", () => {
  it("excludes answered, asked and skipped keys", () => {
    const s = s0({ asked: ["sym_cold"], skipped: ["sym_bowel"] });
    expect(excludedKeys(s, k(["waist_cm"])).sort()).toEqual([
      "fact:sym_bowel",
      "fact:sym_cold",
      "fact:waist_cm",
    ]);
  });
});

describe("pickQuestion", () => {
  const q = (
    key: string,
    kind: "question" | "test" = "question",
    moves: { id: string; from: number; to: number }[] = [],
  ) => ({ kind, featureId: `fact:${key}`, moves }) as never;
  it("takes the first question that has tap options", () => {
    // waist_cm is free text: its outcomes are invented sample answers.
    expect(
      pickQuestion([q("x", "test"), q("waist_cm"), q("sym_energy")])?.featureId,
    ).toBe("fact:sym_energy");
  });
  it("puts a question that moves a bar on the picture first", () => {
    const rare = q("sym_joint", "question", [{ id: "gout", from: 0.02, to: 0.3 }]);
    const shown = q("sym_heavy_periods", "question", [
      { id: "heavy_menstrual_bleeding", from: 0.34, to: 0.69 },
    ]);
    expect(pickQuestion([rare, shown])?.featureId).toBe(
      "fact:sym_heavy_periods",
    );
  });
  it("keeps nextMoves' order when no answer moves a shown bar 10 points", () => {
    const a = q("sym_joint", "question", [{ id: "x", from: 0.3, to: 0.35 }]);
    const b = q("sym_energy", "question", [{ id: "y", from: 0.3, to: 0.38 }]);
    expect(pickQuestion([a, b])?.featureId).toBe("fact:sym_joint");
  });
  it("gives null when no question is left", () => {
    expect(pickQuestion([q("x", "test"), q("bp_home")])).toBeNull();
  });
});

describe("progressOf", () => {
  it("counts the upload screen only for a person with a report", () => {
    expect(progressOf(s0({ hasReport: false }), "intro").of).toBe(
      3 + SETUP_QUESTIONS + 3,
    );
    expect(progressOf(s0({ hasReport: true }), "intro").of).toBe(
      4 + SETUP_QUESTIONS + 3,
    );
  });
  it("never passes of", () => {
    const p = progressOf(
      s0({ hasReport: false, asked: ["a", "b"] }),
      "question",
    );
    expect(p.at).toBeLessThan(p.of);
  });
});

describe("addOnce", () => {
  it("keeps one copy", () => {
    expect(addOnce(addOnce([], "a"), "a")).toEqual(["a"]);
  });
});
