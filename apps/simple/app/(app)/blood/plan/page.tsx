import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDb, goals } from "@/db";
import { getMetricRows } from "@/lib/data";
import { buildModelInput } from "@/lib/coverage";
import { catalogFor } from "@/lib/hkb";
import { scoreHypotheses } from "@/lib/hypotheses";
import { nextMoves } from "@/lib/infogain";
import { displayNameOf } from "@/lib/ledger";
import type { MetricRow } from "@/lib/data";
import { PlanDraw, type DrawCandidate } from "@/components/plan-draw";

export const dynamic = "force-dynamic";

/**
 * Plan a draw, reached from the Draws tab: `docs/mockups/v4/plan-draw.html`.
 *
 * "Worth it now" is the information-gain engine's own ranking of the tests it
 * would buy, with the pair of posteriors each answer would produce. "Already
 * planned" is every open goal that has a date. "Can wait" is what the engine
 * ranked but priced out of reach, or what is not a blood draw at all.
 *
 * What the mockup shows and the engine does not produce is named in the
 * report: there is no per-marker retest cadence in this database, so "due by
 * cadence" is "already planned"; and there is no fasting flag on a test, so
 * the sheet says the one sentence that is true of every draw instead of
 * per-row prep.
 */

/** A cost band the person can walk into a lab and order themselves. */
const WALK_IN = 2;

/** The list is a decision, not a catalogue: twelve rows is already a lot. */
const MAX_ROWS = 12;

const money = (n: number) => `€${Math.round(n)}`;

export default async function PlanDrawPage() {
  const userId = await requireUserId();
  const db = getDb();
  const [rows, input, catalog, open] = await Promise.all([
    getMetricRows(userId),
    buildModelInput(userId),
    catalogFor(userId),
    db
      .select({
        metricCode: goals.metricCode,
        due: goals.due,
        note: goals.note,
      })
      .from(goals)
      .where(and(eq(goals.userId, userId), isNull(goals.achievedAt))),
  ]);

  const scored = scoreHypotheses(input, { catalog });
  const nameOf = new Map(scored.map((h) => [h.id, displayNameOf(h)]));
  /* The engine ranks a free question above every test, so a short list is
     all questions. Ask for the whole ranking and keep the tests out of it. */
  const moves = nextMoves(input, catalog, { max: 200 }).filter(
    (m) => m.kind === "test",
  );

  const byCode = new Map<string, MetricRow>(rows.map((m) => [m.code, m]));
  /** `metric:hba1c` is the feature id the engine uses for a marker. */
  const codeOf = (featureId: string) =>
    featureId.startsWith("metric:") ? featureId.slice("metric:".length) : featureId;

  const planned = new Set(open.filter((g) => g.due).map((g) => g.metricCode));
  const candidates: DrawCandidate[] = [];
  const seen = new Set<string>();

  for (const m of moves) {
    const code = codeOf(m.featureId);
    if (seen.has(code)) continue;
    seen.add(code);
    const metric = byCode.get(code);
    /* The condition this test moves furthest, and the two ends it moves it
       to: the same numbers `/brain` prints, in the words the page speaks. */
    const biggest = [...m.moves].sort(
      (a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from),
    )[0];
    const ends = m.outcomes
      .map((o) => ({
        label: o.label,
        p: o.beliefs.find((b) => b.id === biggest?.id)?.p,
      }))
      .filter((o): o is { label: string; p: number } => o.p != null)
      .sort((a, b) => b.p - a.p);
    const post =
      biggest && ends.length > 1
        ? {
            name: nameOf.get(biggest.id) ?? biggest.id.replace(/_/g, " "),
            from: Math.round(biggest.from * 100),
            up: Math.round(ends[0]!.p * 100),
            upIf: ends[0]!.label,
            dn: Math.round(ends[ends.length - 1]!.p * 100),
            dnIf: ends[ends.length - 1]!.label,
          }
        : null;
    candidates.push({
      code,
      name: m.label,
      cost: m.cost === 0 ? "free" : m.priced ? money(m.cost) : `cost ${m.cost}`,
      why: m.howTo ?? "the engine would buy this next",
      post,
      lastDrawn: metric?.latest.observedAt ?? null,
      plannedFor: open.find((g) => g.metricCode === code)?.due ?? null,
      group: planned.has(code)
        ? "planned"
        : (m.band ?? 1) > WALK_IN
          ? "wait"
          : "now",
    });
    if (candidates.length >= MAX_ROWS) break;
  }

  /* Every dated goal the engine did not already list: somebody planned it. */
  for (const g of open) {
    if (!g.due || seen.has(g.metricCode)) continue;
    seen.add(g.metricCode);
    const metric = byCode.get(g.metricCode);
    candidates.push({
      code: g.metricCode,
      name: metric?.name ?? g.metricCode.replace(/_/g, " "),
      cost: "cost 1",
      why: g.note ?? `planned for ${g.due}`,
      post: null,
      lastDrawn: metric?.latest.observedAt ?? null,
      plannedFor: g.due,
      group: "planned",
    });
  }

  return (
    <div className="stackv gap-[var(--s21)]">
      <div>
        <Link className="asklink" href="/blood?tab=draws">
          <ChevronLeft className="ic" aria-hidden="true" />
          Draws
        </Link>
        <h1 className="c-title mt-[var(--s8)]">Plan a draw</h1>
        <p className="lede mt-[var(--s3)]">
          What is worth ordering now, what already has a date, and what can
          wait. Ticking a row puts it on the sheet; planning writes the date
          back onto the marker.
        </p>
      </div>
      {candidates.length === 0 ? (
        <div className="empty">
          <span className="k">Nothing to order</span>
          <b className="text-[length:var(--type-md)] font-normal">
            The engine would not buy anything today
          </b>
          <p>
            Every test it knows about would either not change a likelihood or
            has already been drawn recently.
          </p>
          <Link href="/blood?tab=markers">Every marker</Link>
        </div>
      ) : (
        <PlanDraw candidates={candidates} />
      )}
    </div>
  );
}
