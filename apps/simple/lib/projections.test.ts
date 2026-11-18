/**
 * Batch 5A: why no projection was ever written, and the pure pieces that now
 * let one be written and resolved. The owner adopted "Psyllium husk 5 g with
 * lunch and dinner" on 2026-10-05 with LDL at 131 (2026-04-23); the seed row
 * is "Psyllium fibre", so the old substring match found nothing and
 * `makeProjections` had no marker to project. LDL came back 104 on
 * 2026-11-17.
 */
import { describe, expect, it } from "vitest";
import { interventionRows } from "./hkb-interventions";
import { project, type AdoptedAction } from "./projection";
import {
  baselineAt,
  cycleActions,
  drawFor,
  markersOf,
  matchIntervention,
  matchInterventions,
  projectionStart,
} from "./projections";

const seed = interventionRows();

describe("matchIntervention on the seed rows", () => {
  it("matches the plan's own words by their distinctive word", () => {
    expect(
      matchIntervention("Psyllium husk 5 g with lunch and dinner", seed)?.name,
    ).toBe("Psyllium fibre");
  });

  it("matches berberine, by name, to both of its rows", () => {
    expect(matchIntervention("Berberine", seed)?.name).toBe("Berberine");
    expect(
      matchInterventions("Berberine 500 mg twice daily", seed)
        .map((r) => r.outcomeFeatureId)
        .sort(),
    ).toEqual(["metric:glucose", "metric:ldl_cholesterol"]);
  });

  it("takes vitamin D3 to a vitamin D row and never to a B12 one", () => {
    const hit = matchIntervention("Vitamin D3 supplementation", seed);
    expect(hit?.name).toMatch(/vitamin d|cholecalciferol/i);
    expect(hit?.name).not.toMatch(/b12|cobalamin/i);
    expect(hit?.outcomeFeatureId).toBe("metric:vitamin_d");
  });

  it("takes magnesium to a magnesium row or to nothing", () => {
    const hit = matchIntervention("Magnesium", seed);
    if (hit) expect(hit.name).toMatch(/magnesium/i);
    else expect(hit).toBeNull();
  });

  it("matches nothing on generic words alone", () => {
    expect(matchIntervention("Walk 30 minutes after dinner", seed)).toBeNull();
    expect(matchIntervention("Vitamin supplement daily", seed)).toBeNull();
  });

  it("does not match a lifestyle line to a drug or a test", () => {
    for (const line of [
      "Cut added sugar",
      "Folate 400 mcg",
      "Testosterone check with your doctor",
      "Intermittent fasting 16:8",
      "Weight-bearing exercise",
    ])
      expect(matchIntervention(line, seed), line).toBeNull();
  });

  it("matches the common supplement spellings", () => {
    expect(matchIntervention("Omega 3 supliment", seed)?.name).toBe(
      "Omega-3 (EPA-predominant)",
    );
    expect(matchIntervention("Fish oil 2 g daily", seed)?.name).toBe(
      "Omega-3 (EPA-predominant)",
    );
  });

  it("keeps the old substring rule first", () => {
    expect(
      matchIntervention("Ezetimibe added to a statin, 10 mg", seed)?.name,
    ).toBe("Ezetimibe added to a statin");
  });
});

describe("markersOf", () => {
  it("fills an item's markers from its intervention rows", () => {
    expect(markersOf("Berberine", seed).sort()).toEqual([
      "glucose",
      "ldl_cholesterol",
    ]);
    expect(markersOf("Psyllium husk 5 g with lunch and dinner", seed)).toEqual([
      "ldl_cholesterol",
    ]);
    expect(markersOf("Walk after dinner", seed)).toEqual([]);
  });
});

const psyllium = seed.find((r) => r.name === "Psyllium fibre")!;
const adopted: AdoptedAction = {
  itemId: "p1",
  text: "Psyllium husk 5 g with lunch and dinner",
  adoptedAt: "2026-10-05",
  effect: {
    id: psyllium.id,
    name: psyllium.name,
    outcomeFeatureId: psyllium.outcomeFeatureId!,
    effect: psyllium.effect,
    direction: "down",
    grade: "A",
    duration: psyllium.duration,
    source: psyllium.paper.title,
  },
};
const ldl = [
  { observedAt: "2026-04-23", value: 131 },
  { observedAt: "2026-11-17", value: 104 },
];

describe("projectionStart and baselineAt", () => {
  it("starts on the day the item started, from the draw before it", () => {
    const start = projectionStart(
      "ldl_cholesterol",
      [adopted],
      null,
      "2026-11-18",
    );
    expect(start).toBe("2026-10-05");
    expect(baselineAt(ldl, start)).toEqual({
      observedAt: "2026-04-23",
      value: 131,
    });
  });

  it("starts the next cycle on the draw that resolved the last one", () => {
    expect(
      projectionStart("ldl_cholesterol", [adopted], "2026-11-17", "2026-11-18"),
    ).toBe("2026-11-17");
    expect(baselineAt(ldl, "2026-11-17")?.value).toBe(104);
  });

  it("starts at the later of two items so both count from one baseline", () => {
    const berberine = { ...adopted, itemId: "b", adoptedAt: "2026-10-20" };
    const start = projectionStart(
      "ldl_cholesterol",
      [adopted, berberine],
      null,
      "2026-11-18",
    );
    expect(start).toBe("2026-10-20");
    expect(cycleActions([adopted, berberine], start)).toHaveLength(2);
    expect(baselineAt(ldl, start)?.value).toBe(131);
  });

  it("is today for a marker nothing adopted moves, and never later", () => {
    expect(projectionStart("hba1c", [adopted], null, "2026-11-18")).toBe(
      "2026-11-18",
    );
    expect(
      projectionStart(
        "ldl_cholesterol",
        [{ ...adopted, adoptedAt: "2027-01-01" }],
        null,
        "2026-11-18",
      ),
    ).toBe("2026-11-18");
  });
});

describe("the owner's psyllium, end to end in arithmetic", () => {
  const p = project({
    code: "ldl_cholesterol",
    unit: "mg/dL",
    from: 131,
    fromDate: "2026-10-05",
    actions: [adopted],
    optimalHigh: 100,
  });

  it("projects a drop from 131 and judges it eight weeks on", () => {
    expect(p.contributions).toHaveLength(1);
    expect(p.contributions[0]!.delta).toBeLessThan(0);
    expect(p.expected).toBeLessThan(131);
    expect(p.retestAt).toBe("2026-11-30");
  });

  it("is resolved by the November draw, and not by the April one", () => {
    const made = { madeAt: p.fromDate, retestAt: p.retestAt };
    expect(drawFor(made, ldl)).toEqual({
      observedAt: "2026-11-17",
      value: 104,
    });
    expect(drawFor(made, ldl.slice(0, 1))).toBeNull();
    // a draw too early for the retest window does not answer it
    expect(
      drawFor(made, [{ observedAt: "2026-10-20", value: 120 }]),
    ).toBeNull();
  });
});

describe("cycleActions", () => {
  it("credits only what had started by the projection's start", () => {
    const a = (itemId: string, adoptedAt: string): AdoptedAction => ({
      itemId,
      text: itemId,
      adoptedAt,
      effect: null,
    });
    const psyllium = a("psyllium", "2026-10-05");
    const berberine = a("berberine", "2026-11-18");
    expect(cycleActions([psyllium, berberine], "2026-10-05")).toEqual([psyllium]);
    expect(cycleActions([psyllium, berberine], "2026-11-18")).toEqual([psyllium, berberine]);
  });
});
