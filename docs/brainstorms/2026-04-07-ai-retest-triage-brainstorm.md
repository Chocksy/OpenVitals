# AI-Powered Retest Triage System

**Date:** 2026-04-07
**Status:** Brainstorm complete

## What We're Building

A 3-layer AI triage system that transforms the Upcoming Retests section from an overwhelming list of 149 overdue items into a smart, prioritized, and actionable view with inline context explaining WHY each retest matters.

### Layer 1: Homepage AI Triage

- Send all overdue retests + last values + health status as compact JSON to LLM
- AI returns: priority (high/medium/low/dismiss) + one-liner reason per item
- Homepage widget shows only high/medium priority items with inline reasons
- Cache the triage result; refresh on new blood work upload or manual trigger
- Support deployment-triggered refresh for fresh installs/data reloads

### Layer 2: Testing Page Intelligence

- Full AI analysis on `/testing` page grouped by health domains (metabolic, lipids, thyroid, etc.)
- Each retest item gets detailed context and reasoning
- High-level health summary: "Your metabolic markers are your top priority — 3 critical items need retesting"
- **Condition-aware**: if user has known health issues, promote related biomarkers as high priority
- More granular view of what the system determined is important and why

### Layer 3: Research-Backed Insights

- For peculiar/outlier biomarkers, query medical literature API (PubMed/Semantic Scholar)
- Surface relevant research findings for unusual patterns
- Cross-biomarker correlation insights: "Elevated eosinophils + low zinc may indicate..."
- Most ambitious layer — ships last

## Why This Approach

**Layered delivery:** Each layer ships independently and provides standalone value. Homepage improvement can land fast without waiting for the full vision.

**AI over rules:** Pure rule-based triage would handle obvious cases but miss nuanced cross-biomarker patterns and personalized health context. The AI can reason about the whole picture — "this person has 3 critical lipid markers, prioritize cardiovascular retests over routine annual checks."

**Condition-adaptive:** The system needs to adapt to the person's actual health situation. Someone with metabolic issues needs different retest priorities than someone with thyroid concerns. The AI naturally handles this contextual reasoning.

## Key Decisions

1. **Approach:** Layered AI Triage (3 independent phases)
2. **Homepage UX:** Inline one-liner context per retest item (no expand/collapse)
3. **AI trigger:** Auto on new upload + manual refresh + deployment trigger
4. **AI output format:** Priority (high/medium/low/dismiss) + short reason string
5. **Caching:** Cache AI triage result, invalidate on new data upload
6. **Data format to AI:** JSON with all biomarker data (not much data, fits easily)
7. **Scope per layer:**
   - L1: Homepage widget with AI priorities + reasons
   - L2: Testing page with health domain grouping + detailed AI context
   - L3: Research API integration for outlier biomarkers

## Open Questions

1. **Which AI provider/model?** Use existing AI Coach infrastructure (shared provider supporting gateway + OpenRouter)?
2. **Rate limiting:** How often can manual refresh be triggered? Once per hour? Per day?
3. **Health conditions:** How does the system know about user's conditions? Manual input? Inferred from biomarker patterns?
4. **Research API:** PubMed vs Semantic Scholar vs both? Cost/rate limit considerations?
5. **Dismiss persistence:** When AI recommends "dismiss", does user need to confirm? Or auto-hide with undo?

## Bug Fix (Separate)

**React key prop warning** in `corner-cross.tsx:134` — missing `key` prop on `.map()` call. Simple fix: add `key={s}` to `<CornerEdge location={s} />`.

## Implementation Order

1. Fix corner-cross.tsx key warning (quick win)
2. Layer 1: Homepage AI Triage
3. Layer 2: Testing Page Intelligence
4. Layer 3: Research-Backed Insights (future)
