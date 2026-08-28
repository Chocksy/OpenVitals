# Phase 12: Home = cockpit on top, ledger underneath

Approved 2026-08-28 from `docs/mockups/home-options.html` (option B over A).
Home is rebuilt around the hypothesis engine. Deterministic content comes
from `runBrain`-style calls; the LLM writes only the short sentences on
cards, from the latest report. Everything in `apps/simple`. Ponytail.

## 1. Data: conclusions and what changed

`lib/ledger.ts`:

```ts
export interface Conclusion {
  id: string; // condition id, or "marker:<code>" for a single off marker with no condition, or "improved"
  kind: "condition" | "marker" | "improved";
  rank: number;
  title: string; // deterministic: "<name>: <state>" for conditions; "<metric> <value> <unit>, <status>" for markers
  probability?: number;
  state?: HState;
  lenses: Partial<Record<Lens, { w: number; grade: Grade }>>;
  matters: number; // score × lensWeight for the chosen lens (default lifespan), used for rank
  for: EvidenceLine[];
  against: EvidenceLine[];
  missing: string[];
  confounded: string[];
  inputs: {
    kind: "reading" | "fact";
    id: string;
    label: string;
    value: string;
    date?: string;
  }[]; // for "Not right?"
  next: Move[]; // top 3 moves that touch this condition, from nextMoves
  question?: Move; // the single best free question among `next`, rendered inline
  action?: ReportAction; // the latest report action whose targets include this condition's codes, if any
  rangeBar?: RangeBarProps; // the headline marker of this conclusion
  trend?: { code: string; points: Point[] };
  changed?: { from?: HState; to: HState; deltaP: number }; // vs the previous snapshot
}
export interface Ledger {
  bioAge?: { pheno: number; chrono: number; inputs: string[] };
  counters: {
    optimal: number;
    normal: number;
    off: number;
    questions: number;
    nextDrawWeeks?: number;
    nextDrawCodes: string[];
  };
  systems: { id; name; score; worst?: { code; value; unit; status } }[]; // from computeGraphState, sorted worst first
  spear?: Conclusion; // conclusions[0] when its state ≥ possible or kind marker with status red
  conclusions: Conclusion[]; // rank order; ruled_out/unlikely folded into `quiet`
  quiet: { unlikely: number; ruledOut: number; ids: string[] };
  improved: { code: string; from: number; to: number; unit; since: string }[]; // markers that moved toward optimal over ≥ 2 draws
  since?: {
    at: string;
    resolved: number;
    new: number;
    stronger: number;
    weaker: number;
  };
}
export async function buildLedger(userId: string, lens?: Lens): Promise<Ledger>;
```

Rules: a condition becomes a conclusion when state ≥ possible, or when it
has a fired rule test, or when it changed state since the last snapshot.
A marker becomes a conclusion when status is red and no condition reads
it. `improved` = markers whose latest value is inside optimal and whose
value two or more draws ago was outside, with dates. `nextDrawWeeks` = the
smallest `measureAfterWeeks` among adopted actions' targets, else 12.

Snapshots: table `belief_snapshots { id, user_id, computed_at, beliefs
jsonb /* {id: {p, state}} */ }` (migration 0008, CREATE only). Write one
after each upload's curator run, each answered question, each adopted or
dismissed action, and at most once per day otherwise. `since` and
`changed` compare against the newest snapshot older than 1 hour.

## 2. Page

`app/(app)/page.tsx` + `components/home.tsx` rebuilt. Order, all cards
reuse the kit; colour only on data; `RangeBar`, `TrendChart`, `BasisChip`,
`ActionCard`, `ReviewItem` reused.

1. **Cockpit row**: biological age big (`bioAge.pheno` to one decimal,
   "at <chrono>", one-line "PhenoAge from N routine markers"; if missing,
   the card says which inputs are missing and links to Labs); counters
   card (optimal · normal · off); questions card (count, links to the
   first inline question); next draw card (weeks and the codes).
2. **Systems strip**: the 12 tiles, worst first, ring with score, name,
   worst marker; click → `/graph`. Horizontal scroll on mobile.
3. **Spear card** (accent border): title, one plain sentence why it
   matters (from the latest report's `systems[].verdict` or `eli5` for the
   matching condition; else the condition's `summary`), the range bar,
   the trend, the inline question if any with its buttons (answering
   posts to `/api/facts` and refreshes), the action buttons if an action
   exists, else the top move as "Order <test> (€x)". Buttons: the
   action's Add to protocol / Not for me / Discuss, plus **Not right?**.
4. **Ledger**: the remaining conclusions as cards in rank order: rank
   chip, state chip, lens chips with grades, probability big, title,
   two-line for/against (deep view expands to full lists with LRs and
   grades), range bar when a headline marker exists, inline question when
   one exists, buttons as on the spear. `changed` renders as "was
   unlikely → possible since <date>". The `improved` list renders as one
   card "What improved" with the markers and dates, placed after the last
   possible-or-higher conclusion.
5. **Quiet line**: "N unlikely · M ruled out · show" expands to name + %.
6. **Key trends**: four small charts, the four conclusions' headline
   markers with ≥ 3 points (reuse the existing block).

Remove from Home everything not listed. Keep `/plan`, `/graph`, `/labs`
as they are; the spear's "Full plan" link goes to `/plan`.

**Not right?** on a card opens a small inline list of `inputs`: each
reading row has "Wrong value" (creates a `confirm_value` review item with
the sheet excerpt via the existing raw-verify helper, or a plain
confirm item when no sheet) and each fact row has an edit box that posts
to `/api/facts`. After either, the page refreshes and the card shows the
new state. No new tables.

## 3. Plan and report tie-in

`buildContextFromInput` gains a `CONCLUSIONS` section (top 6 with state,
probability, headline for/against) placed before HYPOTHESES; the prompt
gets one line: "Write one plain sentence per conclusion in
`systems[].verdict`, keyed by the condition id in `systems[].id`." The
`ReportBody.systems[]` entries are matched to conclusions by id; when
missing, the card falls back to the catalog summary.

## 4. Tests

`lib/ledger.test.ts`: rank order follows `matters`; a red marker with no
condition becomes a marker conclusion; `improved` finds a marker that
went from outside to inside optimal over three draws and ignores one
that was always inside; `since` counts resolved/new/stronger/weaker
against a fixture snapshot; the spear is undefined when nothing is
possible or red.

## 5. Verification

typecheck, tests, `db:generate` (CREATE only) + `db:migrate`. Then, as
the real user (read-only; answering nothing): screenshots `/tmp/home12/`
of `/` in dark and light, the mobile 390 px view, the Not right? panel
open on one card (do not submit), and the deep view of one card. Paste
the ledger JSON for the user trimmed to ids, ranks, states, probabilities,
`since`, and `improved`. Confirm `/plan`, `/graph`, `/labs`, `/brain`
still return 200.

Report: files changed, outputs, screenshots, deviations (expect zero).
