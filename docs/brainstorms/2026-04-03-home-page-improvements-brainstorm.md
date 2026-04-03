# Brainstorm: Home Page Improvements — Panel Grid v2

**Date**: 2026-04-03
**Status**: Ready for planning
**Depends on**: `2026-04-03-health-optimization-dashboard-brainstorm.md` (Phase 1 shipped)

## What We're Building

Evolve the panel grid home page from a data display into a **prevention-first health dashboard** that:

1. Shows what you've tested and how you're doing (existing)
2. Shows what you **haven't** tested but should (new)
3. Guides you on what to do next — rule-based tips + AI Coach (new)
4. Brings back the best elements from the old dashboard (HealthScore, retests, attention metrics)

## Key Decisions

### 1. Health Score — Overall + Per-Panel Breakdown

Bring back the HealthScore gauge as a compact header element (not a full card). Show both:

- **Overall score**: single number/percentage (e.g., "Health Score: 78%")
- **Per-panel scores**: section headers show "Metabolic: 2/2 optimal" or "Lipid: 1/4 in range"

This replaces the old full-width HealthScore gauge with something integrated into the flow.

### 2. Trend Delta Colors — Contextual by Metric Direction

Current: positive % = orange, negative % = green (always).
Fix: infer direction from optimal range bounds.

**Logic:**

- Metric has only `rangeHigh` (e.g., LDL < 70): **lower is better** → decrease = green, increase = orange
- Metric has only `rangeLow` (e.g., HDL > 50): **higher is better** → increase = green, decrease = orange
- Metric has both bounds (e.g., glucose 72–85): **within range** → moving toward center = green
- No optimal range: neutral gray

No new DB field needed — derive from existing optimal ranges at render time.

### 3. Prevention Blueprint — Filled + Empty Panels

Instead of only showing panels with data, **always show all 5 panels**. For metrics with no observations:

- Show a ghost/empty card: "No data yet — get tested"
- Highlight which biomarkers are recommended based on user's onboarding goals
- Map goals to Attia's 4 horsemen framework:
  - **Cardiovascular**: lipid panel, ApoB, Lp(a), hsCRP
  - **Metabolic (Type 2 diabetes)**: fasting glucose, HbA1c, insulin, HOMA-IR
  - **Cancer**: hsCRP, vitamin D (general inflammation/immune markers)
  - **Neurodegenerative**: homocysteine, B12, omega-3 index

The home page always shows the full picture — what's tested AND what's missing. This makes OpenVitals useful even before the first blood work upload.

### 4. What to Do Next — Hybrid Rules + AI Coach

**Rule-based tips** (immediate, no AI cost):

- Hardcoded per-metric guidance when out of range
- E.g., "Triglycerides 145 mg/dL → reduce refined carbs, add omega-3, retest in 3 months"
- Stored in a config/seed table, not in component code

**AI Coach** (on-demand, deeper):

- "Analyze my results" button triggers LLM analysis
- Considers all biomarkers together, medications, goals, trends
- Generates structured suggestions with tracking

Show rule-based tips inline under each flagged card. AI Coach is the dedicated deeper analysis.

### 5. Bring Back Key Dashboard Elements

| Component            | How to Reintegrate                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **HealthScore**      | Compact score in greeting header area, not a full-width gauge                                |
| **DashboardStats**   | Summary row below greeting: metrics count, flagged, retests due (3-4 compact stats)          |
| **AttentionMetrics** | "Needs Attention" callout section above the panels — top 3–5 flagged metrics with sparklines |
| **CategoryOverview** | Per-panel progress bars as section header decorations                                        |
| **UpcomingRetests**  | "Retests Due" section after panels, before What Changed                                      |
| **HealthInsights**   | Content source for AI Coach suggestions section                                              |

### 6. Metric Code Alignment Fix

Observations use `hba1c`, optimal ranges use `hemoglobin_a1c`. Need to align aliases so optimal ranges resolve correctly. This is a data/seed fix, not a UI change.

## Design Inspiration

- **Perplexity Health**: 10-year outlook projection, intervention modeling, specialized agents (Nutrition, Sleep), continuous monitoring dashboard
- **Levels Health**: Metabolic score with zone visualization, daily/weekly trends, meal impact tracking
- **Function Health**: Comprehensive panel view with optimal/reference ranges, color-coded status, trend arrows

## Layout (Proposed Single Scroll)

```
┌─ Greeting + Health Score (compact) ──────────────────┐
│ Good afternoon, Razvan          Health Score: 78%     │
│ 107 metrics · 24 flagged · Apr 3, 2026               │
└──────────────────────────────────────────────────────┘

┌─ Quick Actions ──────────────────────────────────────┐
│ [Upload Blood Work]  [Ask AI Coach]  [View Report]   │
└──────────────────────────────────────────────────────┘

┌─ Summary Stats ──────────────────────────────────────┐
│ ◉ 18 Optimal  ◎ 6 Warning  ◉ 2 Critical  ⊡ 3 Due   │
└──────────────────────────────────────────────────────┘

┌─ Needs Attention (top 3-5 flagged) ─────────────────┐
│ [LDL 117 ↑10%] [Trig 145 ↑63%] [ApoB 97 ↑18%]     │
│ Rule tip: "Consider omega-3 + reduce refined carbs"  │
└──────────────────────────────────────────────────────┘

── Metabolic (2/2 optimal) ────────────────────────────
[Glucose card]     [HbA1c card]
[Insulin: empty]   [HOMA-IR: empty]

── Lipid Panel (1/4 in range) ─────────────────────────
[LDL card]         [HDL card]
[Trig card]        [ApoB card]

── Inflammation (1/1 optimal) ─────────────────────────
[CRP card]         [Homocysteine: empty]

── Thyroid (1/3 in range) ─────────────────────────────
── Vitamins & Minerals (3/5 optimal) ──────────────────

┌─ Retests Due ────────────────────────────────────────┐
│ List of upcoming/overdue retests                     │
└──────────────────────────────────────────────────────┘

┌─ What Changed ───────────────────────────────────────┐
│ Nov 2024 vs Dec 2025 comparison cards                │
└──────────────────────────────────────────────────────┘

┌─ AI Coach Suggestions ───────────────────────────────┐
│ Rule-based tips + "Get Full Analysis" button          │
└──────────────────────────────────────────────────────┘
```

## Open Questions

1. **Metric code aliases**: Should we fix in the normalizer (map `hba1c` → `hemoglobin_a1c`) or in the seed (rename optimal ranges to match observation codes)?
2. **Rule-based tips data model**: Config file, seed table, or inline in panel-config?
3. **Empty card design**: Ghost outline? Or a more prominent "Get Tested" CTA card?
4. **Health Score formula**: Keep simple % (normal/total) or weight by severity?

## Implementation Phases (Suggested)

1. **Fix metric code alignment + optimal range display** — unblock all other work
2. **Contextual trend delta colors** — derive from optimal range bounds
3. **Per-panel summary scores + empty metric cards** — prevention blueprint
4. **Bring back HealthScore, DashboardStats, AttentionMetrics, Retests**
5. **Rule-based tips per flagged metric**
6. **AI Coach integration** (separate task, depends on LLM pipeline)
