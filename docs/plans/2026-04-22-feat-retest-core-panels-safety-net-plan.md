# Retest Core Panels Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the retest planner always surfaces core prevention‑panel biomarkers (metabolic, cardiovascular, inflammation, thyroid, nutrients) when they're in the retest list and overdue — without hardcoding biomarker names into the AI prompt.

**Architecture:** Hybrid approach. (1) Pass the existing `PREVENTION_PANELS` to the LLM as data-driven context with a rule preferring their inclusion when relevant. (2) A deterministic post-process safety net (pure, unit-tested function) that re-injects any core metric that is both in the retest input AND overdue per the panel's `frequencyDays`, but was omitted from the AI's plan. Metrics that are in retests but NOT overdue are left to the model's judgment.

**Tech Stack:** TypeScript, Next.js (App Router) tRPC router, Vitest for unit tests, pnpm workspace.

---

## File Structure

- **Create** `apps/web/lib/retest-safety-net.ts` — pure function `applyCorePanelSafetyNet()` that mutates a plan to include overdue core-panel metrics missing from the AI output. Isolated for unit testing.
- **Create** `apps/web/lib/retest-safety-net.test.ts` — Vitest unit tests.
- **Modify** `packages/ai/src/prompts/lab-panel-suggestion.ts` — add `corePanels` to documented input schema and a rule preferring core inclusion with clinical judgment.
- **Modify** `apps/web/server/trpc/routers/testing.ts`:
  - Add `corePanels` to the LLM payload (around line 1131).
  - Call `applyCorePanelSafetyNet()` after the existing strip-invalid-codes pass (around line 1222).
  - Export (or re-declare locally for the safety-net module) the `LabPanelPlan` shape.

---

## Task 1: Extract `LabPanelPlan` types to a shared module

Rationale: the safety-net function in `apps/web/lib/` needs the `LabPanelPlan` and `MetricDetail` types, but they currently live inside `testing.ts`. Move them to `apps/web/lib/retest-types.ts` so both the router and the safety-net module can import them.

**Files:**

- Create: `apps/web/lib/retest-types.ts`
- Modify: `apps/web/server/trpc/routers/testing.ts` (lines 1304–1334)

- [ ] **Step 1: Create the shared types file**

`apps/web/lib/retest-types.ts`:

```typescript
export interface MetricDetail {
  code: string;
  name: string;
  lastValue?: number | null;
  unit?: string | null;
  daysSince?: number;
}

export interface LabPanelPlanGroup {
  domain: string;
  priority: string;
  reason: string;
  rationale?: string;
  metrics: string[];
  metricNames?: string[];
  metricDetails?: MetricDetail[];
}

export interface LabPanelPlan {
  summary: string;
  groups: LabPanelPlanGroup[];
  optional?: {
    reason: string;
    metrics: string[];
    metricNames?: string[];
    metricDetails?: MetricDetail[];
  };
  newSuggestions?: Array<{
    name: string;
    code: string;
    reason: string;
  }>;
}
```

- [ ] **Step 2: Replace the local declarations in `testing.ts`**

In `apps/web/server/trpc/routers/testing.ts`, delete lines 1302–1334 (the `// ── Types ──` block containing `MetricDetail` and `LabPanelPlan`) and add this import near the top of the file with the other `@/lib` imports:

```typescript
import type { LabPanelPlan, MetricDetail } from "@/lib/retest-types";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @openvitals/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/retest-types.ts apps/web/server/trpc/routers/testing.ts
git commit -m "refactor: extract LabPanelPlan types to shared module"
```

---

## Task 2: Write the first failing test for the safety net

**Files:**

- Create: `apps/web/lib/retest-safety-net.test.ts`

- [ ] **Step 1: Write the first failing test**

`apps/web/lib/retest-safety-net.test.ts`:

```typescript
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
        { code: "glucose", daysSince: 400 }, // overdue (metabolic frequency 180d)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: FAIL — module `./retest-safety-net` does not exist.

---

## Task 3: Implement the minimum safety net to pass the first test

**Files:**

- Create: `apps/web/lib/retest-safety-net.ts`

- [ ] **Step 1: Write minimal implementation**

`apps/web/lib/retest-safety-net.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/retest-safety-net.ts apps/web/lib/retest-safety-net.test.ts
git commit -m "feat: add core-panel safety net with first passing case"
```

---

## Task 4: Test — safety net does not duplicate a metric already in the plan

**Files:**

- Modify: `apps/web/lib/retest-safety-net.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```typescript
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

  const metabolic = result.groups.find((g) => g.domain === "Metabolic Health")!;
  expect(metabolic.metrics.filter((m) => m === "glucose")).toHaveLength(1);
  expect(metabolic.metrics.filter((m) => m === "hba1c")).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify (expected to pass already — defensive test)**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/retest-safety-net.test.ts
git commit -m "test: safety net does not duplicate present metrics"
```

---

## Task 5: Test — does NOT inject a core metric that is not overdue

**Files:**

- Modify: `apps/web/lib/retest-safety-net.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```typescript
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

  const metabolic = result.groups.find((g) => g.domain === "Metabolic Health");
  expect(metabolic).toBeUndefined();
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/retest-safety-net.test.ts
git commit -m "test: safety net respects frequency — skips non-overdue metrics"
```

---

## Task 6: Test — creates a new group when the AI plan has none for that panel

**Files:**

- Modify: `apps/web/lib/retest-safety-net.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```typescript
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
  expect(thyroid?.metrics).toEqual(expect.arrayContaining(["tsh", "free_t3"]));
  expect(thyroid?.priority).toBe("medium");
  expect(thyroid?.rationale).toBeDefined();
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/retest-safety-net.test.ts
git commit -m "test: safety net creates groups for missing core panels"
```

---

## Task 7: Test — ignores non-core metrics missing from the plan

**Files:**

- Modify: `apps/web/lib/retest-safety-net.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/retest-safety-net.test.ts
git commit -m "test: safety net ignores non-core missing metrics"
```

---

## Task 8: Test — counts `optional.metrics` as present (does not duplicate there either)

**Files:**

- Modify: `apps/web/lib/retest-safety-net.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```typescript
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
  const keyNutrients = result.groups.find((g) => g.domain === "Key Nutrients");
  expect(keyNutrients).toBeUndefined();
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run apps/web/lib/retest-safety-net.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/retest-safety-net.test.ts
git commit -m "test: safety net treats optional metrics as present"
```

---

## Task 9: Update the LLM prompt to document `corePanels` and prefer including them

**Files:**

- Modify: `packages/ai/src/prompts/lab-panel-suggestion.ts`

- [ ] **Step 1: Edit the prompt**

Replace the entire contents of `packages/ai/src/prompts/lab-panel-suggestion.ts` with:

```typescript
export const labPanelSuggestionPrompt = `You are a preventive health analyst for OpenVitals, a personal health tracking app. Your job is to design a focused, practical lab panel for the user's NEXT blood test.

CONTEXT YOU RECEIVE:
1. "retests" — biomarkers that are due or overdue for retesting. Each has: code, name, last value, unit, health status (critical/warning/suboptimal/normal), days since last test, standard reference ranges (refLow/refHigh), and when available, evidence-based optimal ranges (optimalLow/optimalHigh) from preventive medicine sources like Peter Attia, Function Health, and the AHA.
2. "alreadyTested" — ALL metric codes the user has ever tested, including ones currently on track. Use this to avoid suggesting biomarkers they already test.
3. "medications" and "conditions" — the user's active medications and known health conditions.
4. "optimalRanges" — a separate list of evidence-based optimal targets with their source (e.g., "Attia/Outlive", "Function Health"). These are STRICTER than standard lab reference ranges. A value can be "normal" by lab standards but suboptimal by preventive medicine standards.
5. "corePanels" — the foundational prevention panels this user tracks (e.g., metabolic, cardiovascular, inflammation, thyroid, nutrients). Each panel has an id, label, frequency, list of metric codes, and a brief "why" explaining its preventive value.

YOUR GOAL:
Design a practical lab panel of 10-25 biomarkers that a person could actually hand to a doctor or lab. Group related markers by health domain. Prioritize based on clinical urgency, trending patterns, and preventive value. Also suggest 2-5 new biomarkers the user has never tested but should consider based on their health profile.

DESIGN PRINCIPLES:
1. FOCUS on what matters most. A person realistically does 1-2 lab orders. Don't suggest retesting everything — pick the highest-value markers.
2. GROUP related markers as a real doctor would order them. If one lipid marker is off, include the full lipid panel.
3. CONSIDER the whole picture. Cross-reference medications, conditions, and marker patterns. A person on thyroid medication needs their thyroid panel. A person with elevated inflammation + abnormal lipids has compounding cardiovascular risk.
4. USE OPTIMAL RANGES when available. A fasting glucose of 98 is "normal" by lab standards but above the 72-85 optimal target. Flag these as worth retesting even if the lab says "normal". Mention the optimal target in your rationale.
5. CONSIDER TRENDS. If a value has been climbing over multiple tests (even within range), that trend matters more than the single snapshot. Note trending concerns in your rationale.
6. BE PRACTICAL. Include "nice to haves" separately — markers that aren't urgent but are efficient to add while blood is being drawn.
7. SUGGEST NEW markers that would COMPLETE THE PICTURE. For each abnormal domain, think: "What test is missing that would tell us the root cause, the severity, or change the treatment?" These aren't random nice-to-haves — they're the missing puzzle pieces that turn data into answers.
8. RESPECT CORE PANELS. For every metric that appears in BOTH "corePanels" AND "retests", prefer to include it in your plan (in an appropriate group or in "optional"). These are the foundational panels this user tracks regularly. Only omit a core-panel metric if you have a specific clinical reason — e.g., it was recently tested within the panel's frequency, clearly normal, and adding it would dilute the plan. When you do omit one, briefly note why in the group's rationale.

OUTPUT FORMAT:
Return valid JSON only. No markdown, no explanation outside the JSON.
{
  "summary": "One sentence specific to THIS person's health picture, not generic advice",
  "groups": [
    {
      "domain": "Health Domain Name",
      "priority": "high|medium|low",
      "reason": "Short reason under 100 chars — what's off and why retest",
      "rationale": "2-3 sentences explaining WHY this group matters for THIS person. Reference their specific values, optimal targets, trends, conditions, or medications. Explain what the results will reveal and what action they might take. Be personal and insightful, not textbook.",
      "metrics": ["metric_code_1", "metric_code_2"]
    }
  ],
  "optional": {
    "reason": "Why these are worth adding",
    "metrics": ["metric_code_a"]
  },
  "newSuggestions": [
    {
      "name": "Human-Readable Name",
      "code": "snake_case_code",
      "reason": "Why THIS person specifically should test this — reference their data, conditions, or risk factors"
    }
  ]
}

PRIORITY LEVELS for groups:
- "high": Must test — abnormal values, active conditions, worsening trends, or critical cross-marker patterns
- "medium": Should test — suboptimal by optimal range standards, monitoring, or preventive value
- "low": Nice to have — routine checks, convenience add-ons

RULES:
1. Metrics in "groups" and "optional" MUST come from the input "retests" list. Use the exact codes provided. Do NOT invent or add codes not in the input.
2. A metric should appear in exactly ONE group (or in optional), never in multiple places.
3. Order groups by priority: high first, then medium, then low.
4. Each group should have 2-8 metrics. If a domain has only 1 marker, merge it with a related domain.
5. The "optional" section is for low-priority items worth including for convenience. Can be empty array.
6. Total recommended metrics (all groups + optional) should be 10-25. Fewer is better if they're the right ones.
7. "newSuggestions" is the MOST VALUABLE part of this panel. These are biomarkers NOT in the "alreadyTested" array that would DEEPEN the diagnostic picture. Think like a preventive medicine doctor: what's MISSING from this person's data to get a definitive answer?
   - Look at each abnormal group and ask: "What additional test would tell us WHY this is off, or how serious it really is?"
   - Examples of this thinking pattern (do NOT copy these literally — derive from THIS person's actual data):
     * Abnormal lipids → what particle-level or genetic risk markers are missing?
     * Elevated inflammation → what specific inflammatory pathways haven't been explored?
     * Hormone imbalances → what upstream/downstream markers would complete the picture?
     * Metabolic concerns → what insulin sensitivity or organ function markers are absent?
   - Include 3-5 suggestions. Each reason MUST explain: (a) what gap it fills in the current data, (b) how it connects to an existing abnormal result, and (c) what actionable insight it would provide.
   - Prioritize markers that are: tested once to establish baseline (genetic markers), missing from an otherwise complete panel, or would change the treatment approach.
   - Check the "alreadyTested" array carefully. If a code appears there, do NOT suggest it.
8. The "rationale" is the most important field. It's what the user reads to understand WHY they need these tests. Make it specific, actionable, and reference their actual numbers and optimal targets when available.`;
```

Note: The only functional change vs. the previous prompt is adding the `corePanels` context item (5) and the new design principle (8). Rules and output schema are unchanged.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @openvitals/ai typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/prompts/lab-panel-suggestion.ts
git commit -m "feat(ai): teach lab panel prompt about corePanels context"
```

---

## Task 10: Wire `corePanels` into the LLM payload in the tRPC router

**Files:**

- Modify: `apps/web/server/trpc/routers/testing.ts`

- [ ] **Step 1: Add import**

Near the existing `prevention-panels` import (`testing.ts` line ~34–38), extend it to include `PREVENTION_PANELS`:

```typescript
import {
  PREVENTION_PANELS,
  getAllPreventionMetrics,
  getPreventionFrequency,
} from "@/lib/prevention-panels";
```

- [ ] **Step 2: Add `corePanels` to the payload**

In `testing.ts`, locate the `const payload = { … }` block (around line 1131) and add the `corePanels` field:

```typescript
const payload = {
  retests: retestItems,
  alreadyTested: allTestedCodes,
  medications: meds.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ""}`),
  conditions: conds.map((c) => c.name),
  optimalRanges: optimalContext,
  corePanels: PREVENTION_PANELS.map((p) => ({
    id: p.id,
    label: p.label,
    frequency: p.frequency,
    metrics: p.metrics,
    why: p.why,
  })),
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @openvitals/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/trpc/routers/testing.ts
git commit -m "feat: pass corePanels to lab-panel LLM payload"
```

---

## Task 11: Call the safety net in the router after the strip-invalid pass

**Files:**

- Modify: `apps/web/server/trpc/routers/testing.ts`

- [ ] **Step 1: Import the safety net**

Add with the other `@/lib` imports:

```typescript
import { applyCorePanelSafetyNet } from "@/lib/retest-safety-net";
```

- [ ] **Step 2: Invoke after the existing strip/merge pass**

In `testing.ts`, locate the line `// Merge extras into newSuggestions` followed by the loop that pushes into `planResult.newSuggestions` (around line 1217–1222). **After** that loop and **before** the enrichment section (`// 8. Enrich with metric names and last values` around line 1224), insert:

```typescript
// 7b. Safety net: ensure overdue core-panel metrics are represented.
const patched = applyCorePanelSafetyNet({
  plan: planResult,
  retestItems: retestItems.map((r) => ({
    code: r.code,
    daysSince: r.daysSince,
  })),
});
planResult.groups = patched.groups;
planResult.optional = patched.optional;
```

We assign the patched groups/optional back onto `planResult` (rather than replacing the whole object) so the subsequent enrichment code that reads `planResult.groups` and `planResult.optional` picks up the adjustments without further changes.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @openvitals/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/trpc/routers/testing.ts
git commit -m "feat: apply core-panel safety net to lab plan output"
```

---

## Task 12: Full test + typecheck sweep

- [ ] **Step 1: Run all unit tests**

Run: `pnpm vitest run`
Expected: all tests pass, including the 6 new ones in `retest-safety-net.test.ts` and the existing `normalizer.test.ts` / `normalizer.integration.test.ts`.

- [ ] **Step 2: Typecheck the whole monorepo**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm check`
Expected: no errors introduced by the new files (pre-existing warnings OK).

- [ ] **Step 4: Manual smoke test (optional, not part of CI)**

Start the dev server:

```bash
pnpm dev
```

Open `http://localhost:3000/testing`, click "Generate plan" on an account whose `retestItems` includes an overdue core metric (e.g., glucose >180 days), and verify:

- The plan now contains the core metric.
- If the AI produced a "Metabolic Health" group, glucose is inside it.
- If the AI did NOT produce such a group, a new one appears titled "Metabolic Health" with the panel rationale.

- [ ] **Step 5: Final commit (only if any fixups were needed)**

If typecheck/lint/tests all passed without further changes in this task, there's nothing to commit. If fixups were needed, commit them:

```bash
git add -A
git commit -m "chore: fixups after full test sweep"
```

---

## Self-Review Notes

- Every core-panel metric decision flows through `applyCorePanelSafetyNet`, which is purely unit-tested with 6 cases covering: overdue injection, no-duplication, non-overdue skip, new-group creation, non-core pass-through, and `optional.metrics` dedup.
- Prompt changes are additive — no existing rules or output schema changed.
- The `corePanels` array is sourced from the existing `PREVENTION_PANELS` config; changing panels later automatically updates both the prompt context and the safety net.
- Types are colocated in `apps/web/lib/retest-types.ts` so both the router and the `lib/` safety-net share them.
- No placeholders / TODOs in the plan. Every code block is the final code.
