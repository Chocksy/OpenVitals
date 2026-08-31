/**
 * The trends inbox, offline: what the rules read out of a hearsay sentence,
 * what the horizon row looks like before it is written, and the two locks that
 * make a popular claim safe — it never becomes a belief, and it never becomes
 * an effect size.
 *
 * (The file is named for the claims because `trends.test.ts` was already taken
 * by the slope rules in `lib/derived.ts`.)
 */
import { describe, expect, it } from "vitest";
import { understandRules } from "./compose";
import type { ModelInput } from "./coverage";
import { rowsToCatalog } from "./hkb";
import { catalogRows } from "./hkb-seed";
import { scoreHypotheses } from "./hypotheses";
import { project, type EffectSource } from "./projection";
import {
  claimFrom,
  claimId,
  claimLabel,
  markersIn,
  measurementPlan,
  toHorizonRow,
  type Claim,
} from "./trends";

const TODAY = "2026-09-01";

const person = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: TODAY,
  profile: { sex: "female", birth_year: "1985" },
  sex: "female",
  age: 41,
  latest: {},
  derived: {},
  ...over,
});

describe("claimFrom", () => {
  it("reads the thing, the marker, the direction and the source", () => {
    const c = claimFrom(
      "I heard on a podcast that sardines lower triglycerides, everyone is eating 3 tins a week",
    )!;
    expect(c.intervention).toBe("sardines");
    expect(c.markers).toEqual(["triglycerides"]);
    expect(c.direction).toBe("down");
    expect(c.sourceKind).toBe("podcast");
    expect(claimLabel(c)).toBe("CLAIM · sardines → triglycerides");
  });

  it("reads a thing named before the frame as well as after it", () => {
    const c = claimFrom(
      "sardines are everywhere right now — omega-3, protein, low mercury, people eat 3 tins a week",
    )!;
    expect(c.intervention).toBe("sardines");
    expect(c.markers).toEqual([]);
  });

  it("takes the direction from the verb, and from the marker when there is none", () => {
    expect(
      claimFrom("everyone is doing cold plunges to fix cortisol")!,
    ).toMatchObject({ intervention: "cold plunges", direction: "down" });
    expect(
      claimFrom("my friend said creatine boosts grip strength")!,
    ).toMatchObject({
      intervention: "creatine",
      markers: ["grip_kg"],
      direction: "up",
      sourceKind: "friend",
    });
  });

  it("says nothing about a sentence that is about the person", () => {
    expect(
      claimFrom("I feel tired in the afternoons and my glucose was 98 today"),
    ).toBeNull();
    expect(claimFrom("my ferritin came back at 12")).toBeNull();
  });

  it("only ever names markers from the closed list", () => {
    expect(markersIn("triglycerides and apoB and unicorn dust")).toEqual([
      "triglycerides",
      "apolipoprotein_b",
    ]);
  });
});

describe("the claim chip", () => {
  const post =
    "I heard on a podcast that sardines lower triglycerides, everyone is eating 3 tins a week";

  it("is a claim, and it writes no fact", () => {
    const chips = understandRules(post, person(), TODAY);
    const claim = chips.find((c) => c.kind === "claim")!;
    expect(claim.label).toBe("CLAIM · sardines → triglycerides");
    expect(claim.key).toBe("claim:sardines");
    expect(chips.filter((c) => c.kind !== "claim")).toEqual([]);
  });

  it("does not eat the rest of a post that is also about the person", () => {
    const chips = understandRules(`I feel tired. ${post}`, person(), TODAY);
    expect(chips.map((c) => c.kind).sort()).toEqual(["claim", "symptom"]);
    expect(chips.find((c) => c.kind === "symptom")!.key).toBe("sym_energy");
  });
});

describe("the horizon row", () => {
  const claim: Claim = {
    text: "sardines lower triglycerides",
    intervention: "sardines, ~3 tins a week",
    markers: ["triglycerides"],
    direction: "down",
    sourceKind: "podcast",
  };

  it("is grade E, status horizon, anecdotal, with the claim as its quote", () => {
    const row = toHorizonRow(claim, "nafld");
    expect(row).toMatchObject({
      id: "claim_sardines_3_tins_a_week_triglycerides",
      conditionId: "nafld",
      grade: "E",
      status: "horizon",
      population: "podcast",
      outcomeFeatureId: "metric:triglycerides",
      effect: null,
      quote: "sardines lower triglycerides",
    });
    expect(claimId(claim)).toBe(row.id);
  });

  it("carries a measurement plan off the marker's own retest window", () => {
    expect(measurementPlan(claim)).toBe(
      "Measure triglycerides now, keep it up, retest in 8 weeks (lower is better).",
    );
    expect(measurementPlan({ ...claim, markers: ["ferritin"] })).toContain(
      "higher is better",
    );
  });

  it("says so when the claim names nothing we measure", () => {
    expect(measurementPlan({ ...claim, markers: [] })).toBeNull();
    expect(
      toHorizonRow({ ...claim, markers: [] }, "popular_claims")
        .outcomeFeatureId,
    ).toBeNull();
  });
});

describe("a horizon row never scores and never projects", () => {
  it("is filtered out of the catalog even when it is accepted", () => {
    const rows = catalogRows();
    const before = rowsToCatalog(rows);
    const withClaim = {
      ...rows,
      evidence: [
        ...rows.evidence,
        {
          ...rows.evidence[0]!,
          id: "claim_sardines_triglycerides",
          grade: "E",
          status: "accepted",
          lrPos: 40,
          lrNeg: 0.1,
        },
      ],
    };
    const after = rowsToCatalog(withClaim);
    expect(after).toEqual(before);

    const m = person({ latest: {}, derived: {} });
    expect(scoreHypotheses(m, { catalog: after })).toEqual(
      scoreHypotheses(m, { catalog: before }),
    );
  });

  it("contributes nothing to a projection even when it is adopted", () => {
    const row = toHorizonRow(
      {
        text: "sardines lower triglycerides",
        intervention: "sardines, ~3 tins a week",
        markers: ["triglycerides"],
        direction: "down",
        sourceKind: "podcast",
      },
      "nafld",
    );
    // Even pretending it had an effect size, grade E weighs nothing.
    const effect: EffectSource = {
      id: row.id,
      name: row.name,
      outcomeFeatureId: row.outcomeFeatureId!,
      effect: "-40 mg/dL",
      direction: "down",
      grade: row.grade,
      duration: null,
      source: row.quote,
    };
    const p = project({
      code: "triglycerides",
      unit: "mg/dL",
      from: 180,
      fromDate: TODAY,
      actions: [{ itemId: "1", text: row.name, adoptedAt: TODAY, effect }],
    });
    expect(p.contributions).toEqual([]);
    expect(p.expected).toBe(180);
    // And it is not `accepted`, so `adoptedActions` never even offers it.
    expect(row.status).not.toBe("accepted");
  });
});
