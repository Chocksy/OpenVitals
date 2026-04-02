---
title: "feat: LLM auto-identification of unmatched biomarkers"
type: feat
date: 2026-04-02
brainstorm: research session (same day)
---

# LLM Auto-Identification of Unmatched Biomarkers

## Overview

After the normalize step flags items as `unmatched_metric`, send them in a batch to Gemini Flash to identify the proper English name, LOINC code, unit, and reference range. Auto-create metric definitions and re-normalize. Users only see items the AI couldn't identify.

## Implementation

### New step in the ingestion pipeline: `auto-identify`

Insert between normalize and materialize in `workflow.ts`:

```
classify → parse → normalize → **auto-identify** → materialize
```

### File: `services/ingestion-worker/src/steps/auto-identify.ts`

```typescript
export async function autoIdentify(
  ctx: WorkflowContext,
  normResult: NormalizationResult,
  metricDefs: MetricDefinition[],
  unitConversions: UnitConversion[],
): Promise<NormalizationResult>
```

1. Filter `normResult.flagged` for `unmatched_metric` reason only
2. If none, return as-is
3. Batch the unmatched analytes (name + value + unit) into one LLM call
4. LLM returns: `{analyte, standardName, id, loincCode, unit, rangeLow, rangeHigh, category}`
5. For each identified analyte:
   a. Check if metric_definition already exists by name/alias match
   b. If not: INSERT into metric_definitions
   c. Re-run `normalizeExtractions()` on just the previously-flagged items
   d. Move successful ones from flagged → normalized
6. Return updated NormalizationResult

### LLM prompt

```
You are a medical laboratory expert. For each unmatched lab test analyte:
1. id: kebab_case identifier (e.g., "aslo", "rheumatoid_factor")
2. standardName: Standard English name
3. loincCode: LOINC code if known
4. unit: Standard unit of measurement
5. rangeLow/rangeHigh: Normal reference range for adults
6. category: hematology, metabolic, lipid, thyroid, hormone, vitamin, mineral, inflammation, immunology, liver, renal, cardiac

Respond as JSON array. If you cannot identify a test, set id to null.
```

### Files to modify

1. **NEW** `services/ingestion-worker/src/steps/auto-identify.ts` - LLM identification logic
2. **MODIFY** `services/ingestion-worker/src/workflow.ts` - Add auto-identify step
3. **MODIFY** `packages/database/src/schema/metrics.ts` - Ensure INSERT works for new metrics

### Acceptance Criteria

- [ ] Unmatched items are sent to Gemini Flash for identification
- [ ] Identified items get metric definitions auto-created
- [ ] Previously-flagged items get re-normalized and stored as observations
- [ ] Only truly unidentifiable items remain as flagged
- [ ] New metric definitions persist (available for future uploads)
- [ ] No new npm dependencies
- [ ] Typecheck passes
