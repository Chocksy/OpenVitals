# Plan: Health Optimization Home Page + Nav Restructure

## Context

The current OpenVitals home page is a generic medical dashboard (health score gauge, medication adherence, conditions, retests). The user has no conditions or medications — they track biomarkers from regular blood work for health optimization. The brainstorm (`docs/brainstorms/2026-04-03-health-optimization-dashboard-brainstorm.md`) decided on a V3-style layout: 2-column cards with sparklines, grouped by panel (metabolic, lipid, inflammation, thyroid, vitamins), with "What Changed" and "AI Coach Suggestions" sections below.

## Phase 1: Home Page Panel Grid (main deliverable)

### New Component: `BiomarkerPanelCard`

Create `apps/web/components/home/biomarker-panel-card.tsx`

**Reuse existing components:**
- `MiniSparkline` from `components/health/mini-sparkline.tsx` (already renders SVG sparklines from `number[]`)
- `StatusBadge` from `components/health/status-badge.tsx`
- `useDynamicStatus` hook from `hooks/use-dynamic-status.ts` (computes status from optimal/reference ranges)
- Design tokens from `globals.css` (`.card`, status colors, fonts)

**Card layout** (similar to existing `MetricSummaryCard` but with trend delta):
```
┌──────────────────────────────────────┐
│ FASTING GLUCOSE              ↓12    │
│ 81  mg/dL    [sparkline~~~~•]  vs Nov│
│ optimal < 90                         │
└──────────────────────────────────────┘
```

Props: `metricCode, name, value, unit, sparkData[], trendDelta, optimalRange, status`

### Rewrite: `apps/web/app/(dashboard)/(main)/home/page.tsx`

**Data loading** (reuse existing tRPC queries):
- `trpc.observations.list.useQuery({ limit: 200 })` — already used, get all observations
- `trpc.metrics.list.useQuery()` — already used
- `trpc.optimalRanges.forUser.useQuery()` — add this (currently only on labs detail page)
- `useDynamicStatus()` — already available

**Data aggregation** (in `useMemo`):
1. Group observations by metricCode
2. Get latest value per metric
3. Get previous value (2nd most recent for same metric) for trend delta
4. Build sparkline data (last 8 values reversed)
5. Group metrics into panels using a hardcoded config:

```typescript
const PANELS = [
  { id: 'metabolic', label: 'Metabolic', metrics: ['glucose', 'hba1c', 'insulin', 'homa_ir'] },
  { id: 'lipid', label: 'Lipid Panel', metrics: ['ldl_cholesterol', 'cholesterol_total', 'hdl_cholesterol', 'triglycerides'] },
  { id: 'inflammation', label: 'Inflammation', metrics: ['hs_crp', 'crp', 'homocysteine', 'vitamin_d'] },
  { id: 'thyroid', label: 'Thyroid', metrics: ['tsh', 'free_t3', 'free_t4', 'tpo_antibodies'] },
  { id: 'vitamins', label: 'Vitamins & Minerals', metrics: ['vitamin_b12', 'ferritin', 'iron', 'magnesium', 'zinc'] },
];
```

**Page sections** (single scroll):
1. **Greeting** — keep existing `GreetingHeader` pattern (time-based greeting + last blood work date)
2. **Quick actions** — "Upload Blood Work" button + "Ask AI Coach" button
3. **Panel sections** — for each PANELS entry: section title + 2-column grid of `BiomarkerPanelCard`
4. **What Changed** — 2-column grid of change cards (metric name, old→new, % change, color)
5. **AI Coach Suggestions** — placeholder section (implemented in Phase 3 later)

**Skip/remove from home** (code stays, just not rendered):
- HealthScore gauge
- DashboardStats (biomarkers/flagged/meds/retests cards)
- OnboardingChecklist (keep for first-time users only)
- CategoryOverview
- UpcomingRetests
- AdherenceSummary
- FeaturePreviewCards

### What Changed Section

New component: `apps/web/components/home/what-changed.tsx`

Compare latest 2 blood works (detected by distinct `observedAt` dates across observations):
- For each metric present in both: show old value, new value, % change
- Color: green if improved (moved toward optimal), orange if worsened
- Only show metrics that changed significantly (>5%)

## Phase 2: Navigation Restructure

### Modify: `apps/web/features/layout/top-nav/nav-config.ts`

**New primary nav:**
```typescript
export const navigation: NavItem[] = [
  { name: "Home", href: "/home", icon: LayoutDashboard },
  { name: "Labs", href: "/labs", icon: TestTubes },
  { name: "Uploads", href: "/uploads", icon: Upload },
  { name: "AI Coach", href: "/ai", icon: MessageSquare },
];
```

**New secondary nav:**
```typescript
export const secondaryNav: NavItem[] = [
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Timeline", href: "/timeline", icon: Clock },
  { name: "Testing", href: "/testing", icon: Microscope },
  { name: "Biomarkers", href: "/biomarkers", icon: ListChecks },
  { name: "Correlations", href: "/correlations", icon: GitCompareArrows },
  { name: "Medications", href: "/medications", icon: Pill },
  { name: "Conditions", href: "/conditions", icon: HeartPulse },
  { name: "Encounters", href: "/encounters", icon: Stethoscope },
];
```

No pages deleted — just reordered in nav.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/components/home/biomarker-panel-card.tsx` | Individual biomarker card with sparkline + trend delta |
| `apps/web/components/home/what-changed.tsx` | Blood work comparison section |
| `apps/web/lib/panel-config.ts` | Panel definitions (which metrics in each group) |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/app/(dashboard)/(main)/home/page.tsx` | Rewrite home page layout with panel grid |
| `apps/web/features/layout/top-nav/nav-config.ts` | Restructure primary/secondary nav |

## Files to Reuse (no changes)

| File | What we use from it |
|------|---------------------|
| `apps/web/components/health/mini-sparkline.tsx` | `MiniSparkline` component |
| `apps/web/components/health/status-badge.tsx` | `StatusBadge` component |
| `apps/web/hooks/use-dynamic-status.ts` | `useDynamicStatus()` hook |
| `apps/web/lib/health-utils.ts` | `formatRange()`, `CanonicalRanges` |
| `apps/web/app/globals.css` | `.card`, status colors, fonts, animations |

## NOT in scope (future tasks from brainstorm)

- LLM auto-analysis on upload (Phase 3 in brainstorm)
- Suggestion/experiment tracking data model (Phase 4)
- LLM follow-up check-ins (Phase 5)
- Correlations page reshape (Phase 6)
- Telegram/WhatsApp notifications (Phase 7)

## Verification

1. Run `pnpm --filter @openvitals/web build` — must pass TypeScript + Next.js build
2. Start dev server (`pnpm dev`) and verify:
   - Home page shows panel grid with real observation data
   - Cards link to `/labs/{metricCode}` on click
   - Sparklines render with correct trend data
   - Status colors match optimal/reference ranges via `useDynamicStatus`
   - "What Changed" section shows correct deltas
   - Nav shows Home, Labs, Uploads, AI Coach as primary
3. Deploy to Coolify and verify on `vitals.chocksy.com`
