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
});
