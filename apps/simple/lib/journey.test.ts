/**
 * Two journeys as a regression, offline: the engine has to find Hashimoto's in
 * an empty account, and it has to find nothing at all in a healthy 28-year-old.
 *
 * `HYPOTHESES` is passed explicitly rather than left to `loadCatalog`, so the
 * suite never touches Postgres and never depends on what a research run put in
 * the tables.
 */
import { describe, expect, it } from "vitest";
import { personaToInput } from "@/evals/persona";
import { CATALOG } from "./hkb-catalog";
import { HYPOTHESES } from "./hypotheses";
import { nextMoves } from "./infogain";
import { eurOf, journeyById, runJourney } from "./journey";

describe("runJourney", () => {
  it("finds Hashimoto's from an empty account", async () => {
    const j = journeyById("hashimoto_from_scratch_f34_ro")!;
    const r = await runJourney(j, HYPOTHESES);

    expect(r.discoveredAt.hashimoto).not.toBeNull();
    // Offline there are eight conditions and no list prices, so every band-1
    // test costs the same nominal €10 and the order is not the one the real
    // catalog takes. `eval:journeys` enforces the journey's own draw budget
    // against the priced catalog; here the point is that it gets there at all.
    expect(
      r.steps.filter((s) => s.costEur > 0).length,
    ).toBeLessThanOrEqual(12);
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

  it("offers the ferritin draw for a woman with symptoms and no iron panel", () => {
    // Phase 18: the ferritin rules had no negative side, so a normal ferritin
    // moved nothing, the expected gain went negative and the cheapest, most
    // discriminating test in the catalog was never on the list at all.
    const j = journeyById("iron_low_female_30")!;
    const moves = nextMoves(
      personaToInput({
        today: j.today,
        facts: j.start.facts,
        readings: j.start.readings,
      }),
      CATALOG,
    );
    // Questions come first now, because they are free. Ferritin is the first
    // thing anybody is asked to pay for.
    const paid = moves.filter((m) => m.cost > 0).slice(0, 3);
    expect(paid.map((m) => m.label)).toContain("Ferritin");
  });

  it("offers the lipid panel to a man with no lipids on file", async () => {
    // Nothing in the catalog could order a lipid panel, so the LDL and
    // non-HDL rules were unanswerable and the whole cardiovascular arm of the
    // differential was frozen at its prior.
    const j = journeyById("lmhr_from_scratch_m38")!;
    const moves = nextMoves(
      personaToInput({
        today: j.today,
        facts: j.start.facts,
        readings: j.start.readings,
      }),
      CATALOG,
    );
    // By code, not by label: the same draw is listed by whichever reading of
    // it is cheapest, and offline every band-1 test costs the same nominal €10.
    const panel = moves.find((m) => m.featureId === "metric:ldl_cholesterol");
    expect(panel).toBeDefined();
    expect(panel!.gain).toBeGreaterThan(0.05);
    // And apoB is orderable too, on both sides of its own threshold.
    expect(moves.some((m) => m.label === "ApoB")).toBe(true);
  });
});
