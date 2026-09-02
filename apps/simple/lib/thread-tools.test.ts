import { describe, expect, it } from "vitest";
import { dueOn, retestWeeks, threadTools } from "./thread-tools";
import { systemForTurn } from "./thread-turn";
import type { Brief } from "./brief";
import type { AskCandidates } from "./lookup";

/**
 * Phase 28c. The tools are not the guard, the handlers are: every one of them
 * re-checks the id against the closed set the prompt handed out before it
 * writes anything. These are the refusals, which never reach the database.
 */
const candidates = {
  actions: [{ id: "plan:r1:0", title: "Resistance training", dose: null }],
  tests: [{ code: "hba1c", name: "HbA1c", weeks: 12, selfOrder: true }],
  questions: [],
  sources: [],
} as unknown as AskCandidates;

const brief = { candidates } as Brief;

/** The handler, out of the tool object, with its result loosened for asserts. */
const run = (name: string, input: unknown) =>
  (
    threadTools("u1", brief, "t1")[name] as unknown as {
      execute: (i: unknown) => Promise<{ ok: boolean; receipt: string }>;
    }
  ).execute(input);

describe("retestWeeks", () => {
  it("falls back to the usual wait when none is asked for", () => {
    expect(retestWeeks("hba1c")).toBe(12);
    expect(retestWeeks("no-such-marker")).toBe(12);
  });

  it("clamps a made-up schedule into the possible", () => {
    expect(retestWeeks("hba1c", 0)).toBe(1);
    expect(retestWeeks("hba1c", -5)).toBe(1);
    expect(retestWeeks("hba1c", 500)).toBe(104);
    expect(retestWeeks("hba1c", 8.4)).toBe(8);
  });
});

describe("dueOn", () => {
  it("counts weeks forward as a plain date", () => {
    const from = Date.parse("2026-01-01T00:00:00Z");
    expect(dueOn(0, from)).toBe("2026-01-01");
    expect(dueOn(2, from)).toBe("2026-01-15");
  });
});

describe("the handlers refuse before they write", () => {
  it("will not adopt an action that was never offered", async () => {
    const out = await run("adopt_action", { id: "plan:made-up:9" });
    expect(out.ok).toBe(false);
    expect(out.receipt).toContain("never on offer");
  });

  it("will not plan a retest for a marker that was never offered", async () => {
    const out = await run("plan_retest", { code: "crp", weeks: 4 });
    expect(out.ok).toBe(false);
    expect(out.receipt).toContain("never on offer");
  });

  it("will not record a fact under a key this app does not ask", async () => {
    const out = await run("record_fact", { key: "star_sign", value: "Leo" });
    expect(out.ok).toBe(false);
    expect(out.receipt).toContain("not a question this app asks");
  });

  it("will not record an answer outside the question's own options", async () => {
    const out = await run("record_fact", {
      key: "sex",
      value: "sometimes on holiday",
    });
    expect(out.ok).toBe(false);
    expect(out.receipt).toContain("is not one of");
  });
});

describe("systemForTurn", () => {
  const cold = { system: "SHAPE FOR ONE QUESTION" } as Brief;

  it("gives the first turn the shape its question kind picked", () => {
    expect(systemForTurn(cold, false)).toBe("SHAPE FOR ONE QUESTION");
  });

  it("swaps the shape on a follow-up, keeping the rules", () => {
    const later = systemForTurn(cold, true);
    expect(later).not.toContain("SHAPE FOR ONE QUESTION");
    expect(later).toContain("THREE SENTENCES AT MOST");
    expect(later).toContain("EVERY ACTION YOU NAME COMES FROM THE CONTEXT");
  });
});
