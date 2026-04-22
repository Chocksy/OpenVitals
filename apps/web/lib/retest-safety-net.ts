import { PREVENTION_PANELS } from "./prevention-panels";
import type { LabPanelPlan } from "./retest-types";

export interface SafetyNetInput {
  plan: LabPanelPlan;
  /**
   * All metric codes that are currently due, due-soon, or overdue for retesting
   * (i.e., the `retestItems` list the LLM was given). If a core prevention-panel
   * metric is in this set but missing from the LLM's plan, the safety net will
   * inject it — on the principle that if the system already decided a retest is
   * warranted, the user's core panels should not be silently dropped.
   */
  retestCodes: string[];
}

/**
 * Ensure core prevention-panel metrics that are already marked for retesting
 * are represented in the plan. Leaves the plan alone for metrics the user is
 * on-track with (not in retestCodes).
 */
export function applyCorePanelSafetyNet(input: SafetyNetInput): LabPanelPlan {
  const present = new Set<string>();
  for (const g of input.plan.groups) for (const c of g.metrics) present.add(c);
  for (const c of input.plan.optional?.metrics ?? []) present.add(c);

  const retestSet = new Set(input.retestCodes);

  const plan: LabPanelPlan = {
    ...input.plan,
    groups: input.plan.groups.map((g) => ({ ...g, metrics: [...g.metrics] })),
    optional: input.plan.optional
      ? { ...input.plan.optional, metrics: [...input.plan.optional.metrics] }
      : undefined,
  };

  for (const panel of PREVENTION_PANELS) {
    const toInject: string[] = [];
    for (const code of panel.metrics) {
      if (present.has(code)) continue;
      if (!retestSet.has(code)) continue;
      toInject.push(code);
    }
    if (toInject.length === 0) continue;

    const existing = plan.groups.find(
      (g) => g.domain.toLowerCase() === panel.label.toLowerCase(),
    );
    if (existing) {
      existing.metrics.push(...toInject);
    } else {
      plan.groups.push({
        domain: panel.label,
        priority: "medium",
        reason: `Core ${panel.label.toLowerCase()} panel`,
        rationale: panel.why,
        metrics: toInject,
      });
    }
  }

  return plan;
}
