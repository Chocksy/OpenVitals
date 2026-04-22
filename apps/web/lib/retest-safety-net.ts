import { PREVENTION_PANELS } from "./prevention-panels";
import type { LabPanelPlan } from "./retest-types";

export interface SafetyNetInput {
  plan: LabPanelPlan;
  retestItems: Array<{ code: string; daysSince: number }>;
}

/**
 * Ensure core prevention-panel metrics are represented in the plan when they
 * are both in the retest list AND overdue per the panel's frequency. Leaves
 * the model's judgment intact for metrics that are in retests but on-track.
 */
export function applyCorePanelSafetyNet(input: SafetyNetInput): LabPanelPlan {
  const present = new Set<string>();
  for (const g of input.plan.groups) for (const c of g.metrics) present.add(c);
  for (const c of input.plan.optional?.metrics ?? []) present.add(c);

  const retestMap = new Map(input.retestItems.map((r) => [r.code, r] as const));

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
      const item = retestMap.get(code);
      if (!item) continue;
      if (item.daysSince < panel.frequencyDays) continue;
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
        reason: `Core ${panel.label.toLowerCase()} panel — overdue`,
        rationale: panel.why,
        metrics: toInject,
      });
    }
  }

  return plan;
}
