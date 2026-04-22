import { describe, it, expect } from "vitest";
import { applyCorePanelSafetyNet } from "./retest-safety-net";
import type { LabPanelPlan } from "./retest-types";

describe("applyCorePanelSafetyNet", () => {
  it("injects a core metric that is in retestCodes but missing from the AI plan", () => {
    const plan: LabPanelPlan = {
      summary: "Focus on cardiovascular risk.",
      groups: [
        {
          domain: "Cardiovascular Risk",
          priority: "high",
          reason: "elevated ApoB",
          metrics: ["apolipoprotein_b", "ldl_cholesterol"],
        },
      ],
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestCodes: ["glucose", "apolipoprotein_b", "ldl_cholesterol"],
    });

    const metabolic = result.groups.find(
      (g) => g.domain === "Metabolic Health",
    );
    expect(metabolic).toBeDefined();
    expect(metabolic?.metrics).toContain("glucose");
  });

  it("does not duplicate a core metric already in a group", () => {
    const plan: LabPanelPlan = {
      summary: "metabolic focus",
      groups: [
        {
          domain: "Metabolic Health",
          priority: "high",
          reason: "rising glucose",
          metrics: ["glucose", "hba1c"],
        },
      ],
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestCodes: ["glucose", "hba1c"],
    });

    const metabolic = result.groups.find(
      (g) => g.domain === "Metabolic Health",
    );
    expect(metabolic?.metrics.filter((m) => m === "glucose")).toHaveLength(1);
    expect(metabolic?.metrics.filter((m) => m === "hba1c")).toHaveLength(1);
  });

  it("does not inject a core metric that is NOT in retestCodes (on-track)", () => {
    // Glucose is on-track (not in retestCodes). Even though the plan omits it,
    // the safety net must not force it in — the user is not due for a retest.
    const plan: LabPanelPlan = {
      summary: "cardio only",
      groups: [
        {
          domain: "Cardiovascular Risk",
          priority: "high",
          reason: "ApoB",
          metrics: ["apolipoprotein_b"],
        },
      ],
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestCodes: ["apolipoprotein_b"],
    });

    const metabolic = result.groups.find(
      (g) => g.domain === "Metabolic Health",
    );
    expect(metabolic).toBeUndefined();
  });

  it("creates a new group with the panel label when no matching group exists", () => {
    const plan: LabPanelPlan = {
      summary: "only cardio covered",
      groups: [
        {
          domain: "Cardiovascular Risk",
          priority: "high",
          reason: "ApoB",
          metrics: ["apolipoprotein_b"],
        },
      ],
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestCodes: ["tsh", "free_t3"],
    });

    const thyroid = result.groups.find((g) => g.domain === "Thyroid Function");
    expect(thyroid).toBeDefined();
    expect(thyroid?.metrics).toEqual(
      expect.arrayContaining(["tsh", "free_t3"]),
    );
    expect(thyroid?.priority).toBe("medium");
    expect(thyroid?.rationale).toBeDefined();
  });

  it("leaves non-core metrics alone even when missing from the plan", () => {
    const plan: LabPanelPlan = {
      summary: "minimal plan",
      groups: [
        {
          domain: "Cardiovascular Risk",
          priority: "high",
          reason: "ApoB",
          metrics: ["apolipoprotein_b"],
        },
      ],
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestCodes: ["uric_acid"], // not in any prevention panel
    });

    const allCodes = result.groups.flatMap((g) => g.metrics);
    expect(allCodes).not.toContain("uric_acid");
    expect(allCodes).toContain("apolipoprotein_b");
  });

  it("treats a metric in `optional` as already present", () => {
    const plan: LabPanelPlan = {
      summary: "b12 in optional",
      groups: [
        {
          domain: "Cardiovascular Risk",
          priority: "high",
          reason: "ApoB",
          metrics: ["apolipoprotein_b"],
        },
      ],
      optional: {
        reason: "convenience adds",
        metrics: ["vitamin_b12"],
      },
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestCodes: ["vitamin_b12"],
    });

    const keyNutrients = result.groups.find(
      (g) => g.domain === "Key Nutrients",
    );
    expect(keyNutrients).toBeUndefined();
  });
});
