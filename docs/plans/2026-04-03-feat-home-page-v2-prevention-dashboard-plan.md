---
title: "feat: Home Page v2 — Prevention-First Dashboard"
type: feat
date: 2026-04-03
brainstorm: docs/brainstorms/2026-04-03-home-page-improvements-brainstorm.md
---

# feat: Home Page v2 — Prevention-First Dashboard

## Overview

Evolve the home page panel grid (shipped in Phase 1) into a prevention-first dashboard that shows what's tested, what's missing, what needs attention, and what to do next. Bring back the best elements from the old dashboard (HealthScore, DashboardStats, AttentionMetrics, Retests) in a redesigned layout.

## Problem Statement

The current v1 panel grid shows biomarker cards but:

- Trend delta colors are wrong (always green=down, orange=up regardless of metric polarity)
- Optimal ranges show "—" due to metric code mismatch (`hba1c` vs `hemoglobin_a1c`)
- Panels only show metrics with data — no guidance on what to test next
- Missing HealthScore, summary stats, attention callouts, and retests from old dashboard
- No actionable guidance when metrics are out of range

## Proposed Solution

Four implementation phases, each independently shippable.

---

## Phase 1: Fix Metric Code Alignment + Optimal Range Display

**Goal**: Unblock all other work by fixing the data layer.

### 1.1 Align metric codes in normalizer

The normalizer (`packages/ingestion/src/normalizer.ts`) maps uploaded lab names to metric codes. Some codes differ from the seed optimal ranges:

| Observation code    | Optimal range code | Fix                                         |
| ------------------- | ------------------ | ------------------------------------------- |
| `hba1c`             | `hemoglobin_a1c`   | Add `hba1c` as alias in optimal-ranges seed |
| `crp`               | `hs_crp`           | Check if these are actually different tests |
| `cholesterol_total` | missing?           | Verify seed has this metric                 |

**Files to modify:**

- `packages/database/src/seed/data/optimal-ranges.ts` — add missing metric codes or aliases
- `packages/database/src/seed/data/metric-definitions.ts` — verify aliases include all observation codes

**Acceptance criteria:**

- [ ] All 5 panel groups show optimal ranges (not "—") after re-seeding
- [ ] `hba1c` observations resolve to `hemoglobin_a1c` optimal ranges
- [ ] Run seed, reload home page, verify ranges appear

### 1.2 Show reference range as fallback

When optimal range is unavailable, show the reference range from metric_definitions instead of "—".

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — in panelData `useMemo`, fall back to reference range when optimal is null

```typescript
// Current:
const optimalRange = formatRange(
  ranges?.optimalLow,
  ranges?.optimalHigh,
  latest.unit,
);

// Fix:
const optimalRange = formatRange(
  ranges?.optimalLow ?? ranges?.referenceLow,
  ranges?.optimalHigh ?? ranges?.referenceHigh,
  latest.unit,
);
```

**Acceptance criteria:**

- [ ] Cards show reference range when no optimal range exists
- [ ] Cards show optimal range when it exists (preferred)
- [ ] Label changes: "optimal 72–85 mg/dL" vs "ref 70–99 mg/dL"

---

## Phase 2: Contextual Trend Delta Colors

**Goal**: Make trend arrows green when improving, orange when worsening — regardless of metric polarity.

### 2.1 Add `isTrendImproving` helper

Derive metric direction from optimal range bounds. Add to `apps/web/lib/health-utils.ts`:

```typescript
export function isTrendImproving(
  delta: number,
  ranges: CanonicalRanges | undefined,
  currentValue: number,
): boolean | null {
  if (!ranges) return null; // can't determine

  const hasLow = ranges.optimalLow != null || ranges.referenceLow != null;
  const hasHigh = ranges.optimalHigh != null || ranges.referenceHigh != null;
  const low = ranges.optimalLow ?? ranges.referenceLow ?? null;
  const high = ranges.optimalHigh ?? ranges.referenceHigh ?? null;

  if (hasHigh && !hasLow) {
    // Lower is better (LDL, triglycerides, glucose)
    return delta < 0;
  }
  if (hasLow && !hasHigh) {
    // Higher is better (HDL, vitamin D)
    return delta > 0;
  }
  if (hasLow && hasHigh && low != null && high != null) {
    // Within range — moving toward center is better
    const center = (low + high) / 2;
    const prevValue = currentValue / (1 + delta / 100);
    return Math.abs(currentValue - center) < Math.abs(prevValue - center);
  }
  return null;
}
```

### 2.2 Update BiomarkerPanelCard

**File to modify:**

- `apps/web/components/home/biomarker-panel-card.tsx` — add `improving: boolean | null` prop
- `apps/web/app/(dashboard)/(main)/home/page.tsx` — compute `improving` using `isTrendImproving`

Replace naive color logic:

```typescript
// Current: trendDelta < 0 ? green : orange
// New: improving === true ? green : improving === false ? orange : gray
```

### 2.3 Update WhatChanged section

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — use `isTrendImproving` for `improved` field

**Acceptance criteria:**

- [ ] LDL going down shows green delta
- [ ] HDL going up shows green delta
- [ ] Glucose moving from 95→82 (toward optimal 72–85 center) shows green
- [ ] Metrics without ranges show neutral gray delta

---

## Phase 3: Per-Panel Summaries + Empty Metric Cards

**Goal**: Show the full prevention picture — tested AND untested biomarkers.

### 3.1 Panel section headers with counts

Modify home page to show per-panel summaries:

```
── Metabolic (2/4 in range) ──────────────
── Lipid Panel (1/4 in range · 3 untested) ──
```

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — compute `inRange` / `total` / `untested` per panel

### 3.2 Empty metric cards ("Get Tested")

New component: `apps/web/components/home/empty-metric-card.tsx`

```
┌──────────────────────────────────────┐
│ ○ INSULIN                            │
│ No data yet                          │
│ Recommended for metabolic health     │
│ [Learn more →]                       │
└──────────────────────────────────────┘
```

Props: `metricCode, name, reason`

Ghost style: dashed border, muted colors, links to `/labs/{metricCode}` or a tooltip explaining why this test matters.

### 3.3 Always render all panel metrics

Currently panels filter out metrics with no observations. Change to always render all metrics in `PANELS` config, using `BiomarkerPanelCard` for tested and `EmptyMetricCard` for untested.

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — panelData useMemo returns both filled + empty metrics

### 3.4 Add metric descriptions to panel-config

Extend `apps/web/lib/panel-config.ts` with per-metric reasons:

```typescript
export const PANELS = [
  {
    id: "metabolic",
    label: "Metabolic",
    metrics: [
      {
        code: "glucose",
        reason: "Fasting blood sugar — key marker for diabetes risk",
      },
      {
        code: "hba1c",
        reason:
          "3-month blood sugar average — gold standard for metabolic health",
      },
      {
        code: "insulin",
        reason: "Fasting insulin — early warning for insulin resistance",
      },
      {
        code: "homa_ir",
        reason: "Insulin resistance index — calculated from glucose + insulin",
      },
    ],
  },
  // ...
];
```

**Acceptance criteria:**

- [ ] All 5 panels always show, even with no data
- [ ] Untested metrics show ghost cards with reason text
- [ ] Panel headers show "X/Y in range" counts
- [ ] Empty panels show "0/4 tested" with all ghost cards

---

## Phase 4: Reintegrate Dashboard Elements

**Goal**: Bring back HealthScore, summary stats, attention callouts, and retests.

### 4.1 Compact HealthScore in greeting header

Reuse existing `calculateHealthScore()` from `apps/web/components/home/health-score.tsx`. Don't use the full gauge — show as a compact badge in the greeting area:

```
Good afternoon, Razvan
107 metrics · 24 flagged · Health Score: 78%
```

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — add score to greeting area
- `apps/web/components/home/greeting-header.tsx` — add `healthScore: number` prop

### 4.2 Summary stats row

Reuse `DashboardStats` pattern but as a compact single row (not a grid of cards):

```
◉ 18 Optimal  ◎ 6 Warning  ◉ 2 Critical  ⊡ 3 Retests Due
```

New component: `apps/web/components/home/summary-stats-row.tsx`

Props: `normalCount, warningCount, criticalCount, retestsDueCount`

### 4.3 "Needs Attention" section

Reuse `AttentionMetrics` component with slight modifications:

- Show top 5 flagged metrics (already sorted by severity in existing code)
- Place above the panel grid
- Add rule-based tip text under the section (future: from a config/seed table)

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — re-add AttentionMetrics import + data computation (the old code is in git history, commit before `66552be`)

### 4.4 Retests Due section

Reuse `UpcomingRetests` component as-is. Place after panels, before What Changed.

**File to modify:**

- `apps/web/app/(dashboard)/(main)/home/page.tsx` — re-add retests query + UpcomingRetests component

### 4.5 CategoryOverview as panel header bars

Reuse `CategoryOverview` data but render as small progress bars in panel section headers instead of a separate card.

New component: `apps/web/components/home/panel-section-header.tsx`

Props: `label, inRangeCount, warningCount, criticalCount, untestedCount, totalCount`

Renders: section title + small inline bar + counts text.

**Acceptance criteria:**

- [ ] Health Score shows in greeting header
- [ ] Summary stats row shows below greeting
- [ ] "Needs Attention" section shows top 5 flagged metrics with sparklines
- [ ] Retests Due section shows after panels
- [ ] Panel headers show colored progress bars

---

## Phase 5: Calculated/Derived Biomarkers (Future)

**Goal**: Support biomarkers that are calculated from other markers, not directly measured in blood work.

### 5.1 Calculated metrics engine

Currently HOMA-IR is computed client-side in the home page `useMemo`. This needs to be a proper system:

**Calculated metrics to support:**
| Metric | Formula | Inputs |
|--------|---------|--------|
| HOMA-IR | (glucose × insulin) / 405 | glucose, insulin |
| Cholesterol/HDL Ratio | total_cholesterol / hdl_cholesterol | total_cholesterol, hdl_cholesterol |
| Triglyceride/HDL Ratio | triglycerides / hdl_cholesterol | triglycerides, hdl_cholesterol |
| Non-HDL Cholesterol | total_cholesterol - hdl_cholesterol | total_cholesterol, hdl_cholesterol |

**Approach options:**

1. **Server-side on ingestion** — calculate and store as real observations when source markers are ingested. Pros: works everywhere (labs detail, reports, exports). Cons: need to recalculate when source values are corrected.
2. **Client-side virtual metrics** — compute on the fly when rendering. Pros: always up to date. Cons: only works where the computation is wired up (home page today, but not labs detail page).
3. **Hybrid** — compute on ingestion AND recompute on correction. Mark as `source: "calculated"` so they're visually distinct.

**Recommended: Option 3 (Hybrid)** — store as observations with `source: "calculated"` tag so they appear on `/labs/homa_ir` detail page, trend charts, reports, etc. Recompute when source observations change.

### 5.2 Labs detail page for calculated metrics

The `/labs/[metricCode]` page needs to handle calculated metrics gracefully:

- Show the calculated value with the formula used
- Link to source metrics (glucose, insulin)
- Show trend chart from historical calculated values
- Display "Calculated from Glucose + Insulin" badge instead of "from lab report"

### 5.3 Acceptance criteria

- [ ] HOMA-IR appears on `/labs/homa_ir` with trend chart
- [ ] Calculated metrics have a visual indicator ("Calculated" badge)
- [ ] Recalculated when source observations are corrected/updated
- [ ] Cholesterol/HDL and Trig/HDL ratios auto-computed

---

## Files Summary

### New files

| File                                                | Purpose                                 |
| --------------------------------------------------- | --------------------------------------- |
| `apps/web/components/home/empty-metric-card.tsx`    | Ghost card for untested metrics         |
| `apps/web/components/home/summary-stats-row.tsx`    | Compact stats row                       |
| `apps/web/components/home/panel-section-header.tsx` | Panel header with progress bar + counts |

### Modified files

| File                                                    | Changes                                              |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `apps/web/app/(dashboard)/(main)/home/page.tsx`         | Reintegrate components, empty cards, panel summaries |
| `apps/web/components/home/biomarker-panel-card.tsx`     | Add `improving` prop for contextual colors           |
| `apps/web/components/home/greeting-header.tsx`          | Add `healthScore` prop                               |
| `apps/web/components/home/what-changed.tsx`             | Use contextual improvement logic                     |
| `apps/web/lib/health-utils.ts`                          | Add `isTrendImproving()` helper                      |
| `apps/web/lib/panel-config.ts`                          | Expand with per-metric reasons                       |
| `packages/database/src/seed/data/optimal-ranges.ts`     | Align metric codes                                   |
| `packages/database/src/seed/data/metric-definitions.ts` | Verify aliases                                       |

### Reused files (no changes needed)

| File                                             | What we reuse                         |
| ------------------------------------------------ | ------------------------------------- |
| `apps/web/components/home/health-score.tsx`      | `calculateHealthScore()` function     |
| `apps/web/components/home/attention-metrics.tsx` | Full component                        |
| `apps/web/components/home/upcoming-retests.tsx`  | Full component                        |
| `apps/web/components/home/dashboard-stats.tsx`   | Data pattern (not the full component) |
| `apps/web/components/home/category-overview.tsx` | Data computation pattern              |

## Verification

After each phase:

1. `pnpm --filter @openvitals/web build` — must pass
2. Local dev: `dev-up` → http://localhost:3000/home
3. Upload a lab PDF and verify cards populate correctly
4. Check all 5 panels render with correct optimal/reference ranges
5. Verify trend colors are contextually correct (LDL down = green, HDL up = green)
