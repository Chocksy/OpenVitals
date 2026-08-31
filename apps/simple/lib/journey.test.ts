/**
 * Two journeys as a regression, offline: the engine has to find Hashimoto's in
 * an empty account, and it has to find nothing at all in a healthy 28-year-old.
 *
 * `HYPOTHESES` is passed explicitly rather than left to `loadCatalog`, so the
 * suite never touches Postgres and never depends on what a research run put in
 * the tables.
 */
import { describe, expect, it } from "vitest";
import { HYPOTHESES } from "./hypotheses";
import { eurOf, journeyById, runJourney } from "./journey";

describe("runJourney", () => {
  it("finds Hashimoto's from an empty account", async () => {
    const j = journeyById("hashimoto_from_scratch_f34_ro")!;
    const r = await runJourney(j, HYPOTHESES);

    expect(r.discoveredAt.hashimoto).not.toBeNull();
    expect(r.discoveredAt.hashimoto!).toBeLessThanOrEqual(
      j.expect.withinSteps!,
    );
    // Every step is one move the engine chose, paid for and answered.
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.totalEur).toBe(
      Math.round(r.steps.reduce((s, x) => s + x.costEur, 0) * 100) / 100,
    );
    for (const step of r.steps) expect(step.costEur).toBe(eurOf(step.move));
    // The overlay only ever grows, so a belief vector exists at every step.
    for (const step of r.steps)
      expect(Object.keys(step.beliefs).length).toBeGreaterThan(0);
  });

  it("finds nothing in a healthy 28-year-old", async () => {
    const j = journeyById("healthy_male_28")!;
    const r = await runJourney(j, HYPOTHESES);

    expect(r.falseLikely).toEqual([]);
    // Nothing, in the whole run, ever reaches "likely".
    const peak = Math.max(
      ...[r.prior, ...r.steps.map((s) => s.beliefs)].flatMap((b) =>
        Object.values(b),
      ),
    );
    expect(peak).toBeLessThan(0.6);
    expect(r.steps.every((s) => s.woken.length === 0)).toBe(true);
  });

  it("answers a test from the truth and everything else from the typical negative", async () => {
    const j = journeyById("iron_low_female_30")!;
    const r = await runJourney(j, HYPOTHESES);

    for (const step of r.steps)
      for (const [code, value] of Object.entries(j.truth.labs))
        if (step.outcome.includes(`${code} `))
          expect(step.outcome).toContain(`${code} ${value}`);
  });
});
