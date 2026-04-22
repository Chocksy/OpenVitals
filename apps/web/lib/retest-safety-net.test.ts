import { describe, it, expect } from "vitest";
import { applyCorePanelSafetyNet } from "./retest-safety-net";
import type { LabPanelPlan } from "./retest-types";

describe("applyCorePanelSafetyNet", () => {
  it("injects an overdue core metric missing from the AI plan into its panel group", () => {
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
      retestItems: [
        { code: "glucose", daysSince: 400 },
        { code: "apolipoprotein_b", daysSince: 400 },
        { code: "ldl_cholesterol", daysSince: 400 },
      ],
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
      retestItems: [
        { code: "glucose", daysSince: 400 },
        { code: "hba1c", daysSince: 400 },
      ],
    });

    const metabolic = result.groups.find(
      (g) => g.domain === "Metabolic Health",
    );
    expect(metabolic?.metrics.filter((m) => m === "glucose")).toHaveLength(1);
    expect(metabolic?.metrics.filter((m) => m === "hba1c")).toHaveLength(1);
  });

  it("does not inject a core metric that is in retests but not overdue", () => {
    // Metabolic frequency is 180 days. Glucose at 90 days is NOT overdue.
    const plan: LabPanelPlan = {
      summary: "focus elsewhere",
      groups: [
        {
          domain: "Thyroid Function",
          priority: "high",
          reason: "TSH high",
          metrics: ["tsh"],
        },
      ],
    };

    const result = applyCorePanelSafetyNet({
      plan,
      retestItems: [{ code: "glucose", daysSince: 90 }],
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
      retestItems: [
        { code: "tsh", daysSince: 400 },
        { code: "free_t3", daysSince: 400 },
      ],
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
      retestItems: [
        // uric_acid is NOT in any prevention panel
        { code: "uric_acid", daysSince: 500 },
      ],
    });

    const allCodes = result.groups.flatMap((g) => g.metrics);
    expect(allCodes).not.toContain("uric_acid");
    // original plan preserved
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
      retestItems: [{ code: "vitamin_b12", daysSince: 400 }],
    });

    // Should NOT also appear in a Key Nutrients group — it's already in optional.
    const keyNutrients = result.groups.find(
      (g) => g.domain === "Key Nutrients",
    );
    expect(keyNutrients).toBeUndefined();
  });
});
