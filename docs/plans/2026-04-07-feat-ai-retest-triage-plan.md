---
title: AI-Powered Retest Triage (Layer 1 — Homepage)
type: feat
date: 2026-04-07
brainstorm: docs/brainstorms/2026-04-07-ai-retest-triage-brainstorm.md
---

# AI-Powered Retest Triage (Layer 1 — Homepage)

## Overview

Transform the homepage "Upcoming Retests" widget from a flat list of 149 overdue items into an AI-prioritized, contextual view showing only what matters with inline reasons explaining WHY each retest is important.

## Problem Statement

The current widget shows all non-on-track retests (up to 8) sorted by urgency, but:

- 146 items are overdue — many 600+ days — creating alarm fatigue
- No context on why a retest matters ("604D OVERDUE" tells you nothing)
- No way to dismiss or deprioritize irrelevant retests from the homepage
- The widget becomes meaningless noise when everything is red

## Proposed Solution

Add a tRPC procedure that sends all retest recommendations + biomarker data as compact JSON to the LLM. The AI returns a priority (high/medium/low/dismiss) + one-liner reason per item. Cache the result in the `insights` table. The homepage widget filters to only high/medium priority items and shows the AI-generated reason inline.

## Technical Approach

### Architecture

```
Homepage loads → check insights table for cached triage
  ├── Cache hit (type='retest_triage', not stale) → use cached result
  └── Cache miss → show existing widget (no triage) + offer "Analyze" button
       └── User clicks "Analyze" or new upload triggers → run triage
            ├── Fetch retest.getRecommendations (existing)
            ├── Build compact JSON context
            ├── Send to LLM via generateText()
            ├── Parse structured JSON response
            ├── Store in insights table (type='retest_triage')
            └── Return prioritized items to homepage
```

### Phase 1: Triage Prompt & API Endpoint

**New file: `packages/ai/src/prompts/retest-triage.ts`**

```typescript
export const retestTriagePrompt = `You are a health data analyst for OpenVitals...
// Structured prompt that:
// 1. Receives array of retest items (name, lastValue, unit, healthStatus, daysSinceLastTest, referenceRange)
// 2. Also receives active medications & conditions for context
// 3. Returns JSON: { items: [{ metricCode, priority, reason }] }
// Priority levels: "high" | "medium" | "low" | "dismiss"
// Reason: 1 sentence, max 80 chars, plain language
`;
```

Key prompt rules:

- **high**: Critical/warning status, worsening trend, or clinically important to retest
- **medium**: Worth monitoring, suboptimal, or part of important prevention panel
- **low**: Routine check, was normal, low clinical significance
- **dismiss**: Very old, was normal, no clinical reason to retest now
- Consider cross-biomarker patterns (e.g., elevated lipids + inflammation = prioritize cardiovascular)
- Consider active conditions/medications (e.g., on thyroid meds → promote thyroid retests)

**Export from `packages/ai/src/index.ts`**

### Phase 2: tRPC Procedure

**File: `apps/web/server/trpc/routers/testing.ts`**

Add two new procedures:

```typescript
"retest.triage": protectedProcedure.mutation(async ({ ctx }) => {
  // 1. Call existing retest.getRecommendations logic (extract into shared fn)
  // 2. Filter to non-on_track items (overdue, due_soon, upcoming, never_tested)
  // 3. Fetch medications + conditions for context
  // 4. Build compact JSON payload:
  //    { items: [{ code, name, lastValue, unit, status, daysSince, refRange }],
  //      medications: [...], conditions: [...] }
  // 5. Call generateText() with retestTriagePrompt + payload
  // 6. Parse JSON response
  // 7. Upsert into insights table (type='retest_triage')
  //    - Delete previous triage for this user first
  //    - Store full result in content, metadata in metadataJson
  // 8. Return the triage result
}),

"retest.getCachedTriage": protectedProcedure.query(async ({ ctx }) => {
  // 1. Query insights where type='retest_triage' AND userId=ctx.userId
  //    ORDER BY createdAt DESC LIMIT 1
  // 2. Return parsed content or null if no cache
}),
```

**Data format sent to LLM** (compact, ~2-3 tokens per item):

```json
{
  "retests": [
    {
      "code": "zinc",
      "name": "Zinc",
      "value": 114,
      "unit": "mcg/dL",
      "status": "critical",
      "daysSince": 119,
      "refLow": 60,
      "refHigh": 110
    },
    {
      "code": "rdw_sd",
      "name": "RDW-SD",
      "value": 45.5,
      "unit": "fL",
      "status": "warning",
      "daysSince": 694,
      "refLow": 39,
      "refHigh": 46
    }
  ],
  "medications": ["Vitamin D 5000IU daily"],
  "conditions": ["Hypothyroid"]
}
```

**Expected LLM response:**

```json
{
  "items": [
    {
      "metricCode": "zinc",
      "priority": "high",
      "reason": "Was critical — retest to confirm if supplementation is helping"
    },
    {
      "metricCode": "rdw_sd",
      "priority": "low",
      "reason": "Barely outside range, likely stable — low clinical significance"
    }
  ]
}
```

### Phase 3: Update Homepage Widget

**File: `apps/web/components/home/upcoming-retests.tsx`**

Update component to accept optional triage data:

```typescript
interface UpcomingRetestsProps {
  items: RetestItem[];
  triage?: {
    items: Array<{ metricCode: string; priority: string; reason: string }>;
    generatedAt: string;
  } | null;
}
```

When triage data exists:

- Filter items to only show `high` and `medium` priority
- Show AI reason as subtitle text below each item name
- Show a subtle "AI-prioritized" indicator in the header
- Add "Refresh" button to trigger re-triage

When no triage data:

- Show existing behavior (unchanged, backwards compatible)
- Add "Analyze with AI" button to trigger first triage

### Phase 4: Trigger on Upload

**File: `apps/web/app/(dashboard)/(main)/uploads/page.tsx`**

After import job completes (status === 'completed'):

- Invalidate the cached triage: `utils.testing['retest.getCachedTriage'].invalidate()`
- Optionally auto-trigger triage mutation (or let homepage reload handle it)

### Phase 5: Homepage Integration

**File: `apps/web/app/(dashboard)/(main)/home/page.tsx`**

- Fetch cached triage via `trpc.testing['retest.getCachedTriage'].useQuery()`
- Pass triage data to `<UpcomingRetests>` component
- Wire up "Analyze" / "Refresh" button to `trpc.testing['retest.triage'].useMutation()`

## Acceptance Criteria

- [x] New `retestTriagePrompt` in `packages/ai/src/prompts/retest-triage.ts`
- [x] Prompt exported from `packages/ai/src/index.ts`
- [x] `retest.triage` mutation in testing router — sends data to LLM, caches in insights
- [x] `retest.getCachedTriage` query in testing router — returns cached triage or null
- [x] Homepage widget shows AI-prioritized items with inline reasons when triage exists
- [x] Homepage widget shows "Analyze with AI" button when no triage cached
- [x] "Refresh" button triggers re-triage (rate limited: once per hour via `metadataJson.refreshedAt`)
- [x] Upload completion invalidates cached triage
- [x] Graceful fallback: widget works normally when no triage exists
- [x] Uses existing AI provider (OpenRouter via `createOpenRouter()` pattern from `ai.ts`)

## Key Files to Modify/Create

| File                                               | Action | Purpose                                 |
| -------------------------------------------------- | ------ | --------------------------------------- |
| `packages/ai/src/prompts/retest-triage.ts`         | Create | Triage prompt template                  |
| `packages/ai/src/prompts/index.ts`                 | Edit   | Export new prompt                       |
| `packages/ai/src/index.ts`                         | Edit   | Re-export prompt                        |
| `apps/web/server/trpc/routers/testing.ts`          | Edit   | Add triage + getCachedTriage procedures |
| `apps/web/components/home/upcoming-retests.tsx`    | Edit   | Show AI reasons, priority filtering     |
| `apps/web/app/(dashboard)/(main)/home/page.tsx`    | Edit   | Fetch + pass triage data                |
| `apps/web/app/(dashboard)/(main)/uploads/page.tsx` | Edit   | Invalidate triage on upload complete    |

## Dependencies & Risks

- **LLM cost**: Each triage sends ~all overdue items (could be 100+). At ~500 tokens input + 500 output, cost is minimal per call. Caching ensures it runs rarely.
- **LLM reliability**: JSON parsing may fail. Use try/catch with graceful fallback to existing widget.
- **Model availability**: If OpenRouter is down, widget falls back to non-triaged view.
- **Rate limiting**: Manual refresh capped at once per hour to prevent abuse.

## Not In Scope (Layer 2 & 3)

- Testing page AI intelligence (health domain grouping, detailed context)
- Condition-aware adaptive prioritization (beyond what the prompt can infer)
- Research API integration (PubMed/Semantic Scholar)
- Cross-biomarker deep analysis

## References

- Brainstorm: `docs/brainstorms/2026-04-07-ai-retest-triage-brainstorm.md`
- Existing AI chat: `apps/web/server/trpc/routers/ai.ts`
- Retest recommendations: `apps/web/server/trpc/routers/testing.ts:215-464`
- Insights schema: `packages/database/src/schema/insights.ts`
- AI prompts: `packages/ai/src/prompts/`
- Homepage widget: `apps/web/components/home/upcoming-retests.tsx`
