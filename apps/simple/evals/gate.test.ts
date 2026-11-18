/**
 * The offline eval gate: the scoring engine, no LLM, on the fixed personas in
 * `evals/cases/*.json`. Each persona's top five hypotheses, the rules that
 * fired and the patterns that matched are written to `evals/gate/<id>.snap.json`,
 * so a knowledge change (an LR, a cut-off, a renamed marker, a retired row)
 * that moves what a person sees fails here as a readable diff. Review the diff;
 * if the move is intended, accept it with
 * `node_modules/.bin/vitest run evals/gate.test.ts -u` and say in the commit
 * message which personas moved and why. The clinical musts below are hard
 * assertions read from the cases, so `-u` can never hide them.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireRules } from "@/lib/coverage";
import { CATALOG } from "@/lib/hkb-catalog";
import { scoreHypotheses } from "@/lib/hypotheses";
import { matchPatterns } from "@/lib/patterns";
import { personaToInput, type EvalCase } from "./persona";

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, "cases");
const CASES: EvalCase[] = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(casesDir, f), "utf8")));

const round2 = (n: number) => Math.round(n * 100) / 100;
const sorted = (xs: string[]) => [...new Set(xs)].sort();

/** What `buildContextFromInput` computes, minus the prompt text. */
function run(c: EvalCase) {
  // ponytail: nothing on this path reads the clock for these personas today,
  // but `slopePerYear`/`historyOf` fall back to Date.now(), so pin it anyway.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.persona.today}T12:00:00Z`));
  const input = personaToInput(c.persona);
  const patterns = matchPatterns(input);
  const matched = patterns.filter((p) => p.matched);
  const rules = [
    ...fireRules(input),
    ...matched.flatMap((p) => p.pattern.effects.escalations),
  ];
  const hypotheses = scoreHypotheses(input, { catalog: CATALOG });
  return { rules, matched, hypotheses };
}

function summary(c: EvalCase) {
  const { rules, matched, hypotheses } = run(c);
  return {
    id: c.id,
    top: hypotheses.slice(0, 5).map((h) => ({
      id: h.id,
      state: h.state,
      p: round2(h.score),
    })),
    rules: sorted(rules.map((r) => r.id)),
    evidence: sorted(
      hypotheses.flatMap((h) =>
        [...h.for, ...h.against].map((e) => `${h.id}:${e.rule}`),
      ),
    ),
    patterns: sorted(matched.map((p) => p.pattern.id)),
  };
}

const HYPOTHESIS_NAMES = new Set(
  CATALOG.flatMap((h) => [h.id, ...(h.patternId ? [h.patternId] : [])]),
);

/** The musts that name an engine output rather than a line of the plan. */
function hardMusts(c: EvalCase) {
  return {
    patterns: c.must.flatMap((a) =>
      a.patternMatched ? [a.patternMatched] : [],
    ),
    // `reasoning: "insulin_resistance_early"` names a hypothesis (by id or by
    // its pattern id), so the engine has to put it in front of the model.
    top3: c.must.flatMap((a) =>
      a.reasoning && HYPOTHESIS_NAMES.has(a.reasoning) ? [a.reasoning] : [],
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("eval gate", () => {
  it("reads every case and finds the engine musts in them", () => {
    expect(CASES.map((c) => c.id)).toEqual([
      "ckd3_male_70",
      "hashimoto_early_female_36",
      "healthy_male_28",
      "insulin_resistant_male_45",
      "iron_low_female_30",
      "lmhr_male_38",
    ]);
    // A parser that silently finds nothing would pass every hard must.
    const all = CASES.map(hardMusts);
    expect(all.flatMap((h) => h.patterns)).toHaveLength(4);
    expect(all.flatMap((h) => h.top3)).toHaveLength(1);
  });

  for (const c of CASES) {
    describe(c.id, () => {
      it("matches its snapshot", async () => {
        await expect(
          JSON.stringify(summary(c), null, 2) + "\n",
        ).toMatchFileSnapshot(`./gate/${c.id}.snap.json`);
      });

      it("is the same on a second run", () => {
        expect(summary(c)).toEqual(summary(c));
      });

      const hard = hardMusts(c);
      for (const id of hard.patterns)
        it(`matches the ${id} pattern`, () => {
          const { matched } = run(c);
          expect(matched.map((p) => p.pattern.id)).toContain(id);
        });
      for (const name of hard.top3)
        it(`ranks ${name} in its top 3`, () => {
          const { hypotheses } = run(c);
          const top3 = hypotheses
            .slice(0, 3)
            .flatMap((h) => [h.id, ...(h.patternId ? [h.patternId] : [])]);
          expect(top3).toContain(name);
        });
    });
  }
});
