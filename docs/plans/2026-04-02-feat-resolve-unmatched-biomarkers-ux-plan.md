---
title: "feat: Resolve unmatched biomarkers UX"
type: feat
date: 2026-04-02
---

# Resolve Unmatched Biomarkers UX

## Overview

Replace the current bare `<select>` dropdown "Assign" button on unmatched results with a proper inline resolve panel. Two distinct flows based on the reason:

- **Unit mismatch**: One-click "Fix" button (we know the biomarker, just the unit failed)
- **No match**: Expandable panel with searchable biomarker selector + option to create new metric

## Problem Statement

Current UX issues:
1. Selecting from 125+ biomarkers in a plain `<select>` is unusable (no search)
2. No feedback after assign - the row just disappears, unclear what happened
3. "Unit mismatch" label is jargon - user doesn't know what action to take
4. Can't create new biomarkers for genuinely new tests (ASLO, Toxoplasma, etc.)
5. All unmatched items look the same regardless of whether they're a trivial unit fix or a new biomarker

## Proposed Solution

### For "Unit mismatch" items (ambiguous_unit flag_reason)

Show a **"Fix" button** with hover tooltip explaining what will happen. One click resolves it:

```
┌────────────────────────────────────────────────────────────────┐
│ PDW        13.3 fL    fL    Unit mismatch               [Fix] │
│                              ℹ️ "fL → %" (PDW exists,         │
│                              unit conversion needed)           │
└────────────────────────────────────────────────────────────────┘
```

- The system already knows which biomarker it partially matched
- "Fix" auto-assigns to the matched metric + adds unit conversion
- Show a toast (sonner) on success: "PDW resolved: 13.3 fL → 13.3 %"

**Implementation:** Modify the normalizer to also store the `bestPartialMatch` metric code on flagged items with `ambiguous_unit` reason. Then the Fix button just calls `resolveFlagged` with that pre-matched code.

### For "No match" items (unmatched_metric flag_reason)

Show an **"Assign" button** that expands an inline panel below the row:

```
┌────────────────────────────────────────────────────────────────┐
│ ASLO       50 UI/mL   UI/mL   No match              [Assign] │
└────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────┐
  │ Resolve "ASLO" (50 UI/mL)                                   │
  │                                                              │
  │ ● Assign to existing biomarker                               │
  │   [🔍 Search biomarkers...                              ]    │
  │   → Shows: name, unit, category as you type                  │
  │   → If selected unit differs: "50 UI/mL → 50 IU/mL"         │
  │                                                              │
  │ ● Create new biomarker                                       │
  │   Name: [ASLO                              ]                 │
  │   Category: [Inflammation               ▾  ]                 │
  │   Unit: [UI/mL                             ]                 │
  │                                                              │
  │                              [Cancel]  [Save & Confirm]      │
  └──────────────────────────────────────────────────────────────┘
```

On save:
- If assign to existing: calls `resolveFlagged` (existing endpoint)
- If create new: calls new `createMetricAndResolve` endpoint
- Show toast: "ASLO assigned to [metric] and saved"
- Row slides out of unmatched list

## Technical Approach

### Files to modify

1. **`apps/web/app/(dashboard)/(main)/uploads/[id]/page.tsx`** - Main UI changes
   - Replace current assign dropdown with two-mode UI (Fix vs Assign)
   - Add `ResolvePanel` component (inline, below row)
   - Add searchable combobox for biomarker selection (custom, using Radix Popover)
   - Add "Create new" form inside the panel
   - Add toast notifications via sonner

2. **`apps/web/server/trpc/routers/importJobs.ts`** - API changes
   - Add `createMetricAndResolve` mutation (creates metric_definition + observation)
   - Modify `resolveFlagged` to handle the case where unit conversion isn't found (just use raw value)

3. **`packages/ingestion/src/normalizer.ts`** - Store partial match info
   - When flagging as `ambiguous_unit`, include the matched metric code in `details`
   - Format: `"Cannot convert fL to % for pdw"` → already includes metric code, parse it

4. **`services/ingestion-worker/src/steps/materialize.ts`** - Save partial match
   - Store the attempted metric code in `flagged_extractions.resolved_metric_code` (as a "suggested" match, not resolved)

### New component: SearchableMetricSelect

Built with Radix Popover + input filtering (no new deps needed):

```tsx
// apps/web/components/searchable-metric-select.tsx
function SearchableMetricSelect({
  metrics,
  onSelect,
  placeholder,
}: {
  metrics: { id: string; name: string; unit: string | null; category: string }[];
  onSelect: (metricCode: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = metrics.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.id.includes(search.toLowerCase())
  );
  // Radix Popover with input + filtered list
}
```

### New API: createMetricAndResolve

```typescript
// apps/web/server/trpc/routers/importJobs.ts
createMetricAndResolve: protectedProcedure
  .input(z.object({
    flaggedId: z.string().uuid(),
    name: z.string().min(1),
    category: z.string(),
    unit: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Generate id from name (kebab-case)
    // 2. Insert into metric_definitions
    // 3. Create observation from flagged extraction
    // 4. Mark flagged as resolved
    // 5. Return new metric + observation
  })
```

### Categories for "Create new" dropdown

Use existing categories from the database:

```sql
SELECT DISTINCT category FROM metric_definitions ORDER BY category;
-- hematology, lipid, metabolic, thyroid, hormone, vitamin, mineral,
-- inflammation, liver, renal, cardiac, etc.
```

## Acceptance Criteria

### Unit Mismatch Flow
- [ ] "Fix" button shown for `ambiguous_unit` flagged items
- [ ] Hover/tooltip shows what will happen (from unit → to unit)
- [ ] One click resolves: creates observation, marks resolved, shows toast
- [ ] Row animates out of unmatched list after fix

### No Match Flow
- [ ] "Assign" button expands inline panel below the row
- [ ] Panel has radio toggle: "Assign to existing" / "Create new"
- [ ] Searchable biomarker select (type to filter, shows name + unit + category)
- [ ] If selected metric has different unit, show conversion preview
- [ ] "Create new" form: name, category dropdown, unit input
- [ ] "Save & Confirm" creates the observation and resolves
- [ ] "Cancel" collapses the panel
- [ ] Toast notification on success with details of what was done

### General
- [ ] Existing inline edit pattern reused (editingId state, conditional rendering)
- [ ] No new npm dependencies (use Radix Popover for searchable select)
- [ ] Typecheck passes
- [ ] Works on the existing test data (Mar 2023, 2014, 2012 PDFs)

## Implementation Phases

### Phase 1: Fix button for unit mismatches
- Parse metric code from flag_details string
- Add "Fix" button with tooltip
- Toast on success
- **Files:** `page.tsx`, `importJobs.ts` (minor tweak to resolveFlagged)

### Phase 2: Searchable metric select component
- Build `SearchableMetricSelect` using Radix Popover
- Replace current `<select>` with new component
- **Files:** new `searchable-metric-select.tsx`, `page.tsx`

### Phase 3: Inline resolve panel
- Add expandable panel below unmatched rows
- Radio toggle between "Assign" and "Create new"
- Wire up existing `resolveFlagged` + new `createMetricAndResolve`
- **Files:** `page.tsx`, `importJobs.ts`

### Phase 4: Polish
- Toast notifications (sonner)
- Row animation on resolve (motion)
- Conversion preview text
- **Files:** `page.tsx`

## References

- Inline edit pattern: `apps/web/app/(dashboard)/(main)/uploads/[id]/page.tsx:378-409`
- Current resolveFlagged: `apps/web/server/trpc/routers/importJobs.ts:192-270`
- Radix Popover: `apps/web/components/ui/popover.tsx`
- Metric definitions schema: `packages/database/src/schema/metrics.ts`
- Sonner toast: already installed, used elsewhere in app
- Motion animations: already installed (^12.29.0)
