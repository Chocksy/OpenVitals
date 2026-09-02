import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { buildModelInput } from "@/lib/coverage";
import { queueQuestions } from "@/lib/ask";
import { buildBubbles, viewBoxOf } from "@/lib/bubbles";
import { computeGraphState, worstMember } from "@/lib/graph-state";
import { NODES, SYSTEMS, type SystemId } from "@/lib/graph";
import { loadGenome } from "@/lib/genome";
import { catalogFor } from "@/lib/hkb";
import { scoreHypotheses, type Lens } from "@/lib/hypotheses";
import { nextMoves } from "@/lib/infogain";
import { loadGraph } from "@/lib/kg";
import { matchPatterns, PATTERNS } from "@/lib/patterns";
import { sayReason, sayReasons } from "@/lib/reasons";
import { healthStatus } from "@/lib/status";
import { Bubbles, type ActiveRow, type HotRow } from "@/components/bubbles";
import { ViewShell } from "@/components/plan";
import { PillTabs } from "@/components/pill-tabs";
import { StateWord, toneOf, type StateTone } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

/**
 * Graph, phase 30e. `docs/mockups/v4/graph.html`.
 *
 * Two lenses on one URL. Conditions is the bubble stage and one side panel;
 * Systems is twelve arcs on a single rule — where each system's driving
 * marker sits inside its own reference range. Both are the same ledger.
 *
 * The blocked screen is gone: `graph.html`'s build cost moves the two missing
 * facts to Coverage on Plan, so the page draws itself and says what it is
 * waiting for in one `.empty` tile.
 */
const HOT_NODES = 15;

const byId = new Map(NODES.map((n) => [n.id, n]));

const systemOf = (nodeId: string): SystemId | undefined =>
  byId.get(nodeId)?.system;

/** The mockup's lens switcher, plus the fourth lens the engine actually has. */
const LENSES: Lens[] = ["lifespan", "energy", "mood", "weight"];

/** 2π × 22, the circumference of the arc the mockup draws. */
const ARC = 138.2;

/** The four spectrum words, as the systems cards say them. */
const SYSTEM_WORD: Record<StateTone, string> = {
  off: "Off",
  border: "Borderline",
  on: "Optimal",
  none: "Never measured",
};

/**
 * Where a value sits inside a band, 0 to 1, and the sentence that says it.
 * Nothing is invented: with no band on file the arc is not drawn at all and
 * the line says so.
 */
function place(
  value: number,
  low: number | null,
  high: number | null,
  named: "reference" | "optimal",
): { frac: number | null; say: string } {
  if (low == null && high == null)
    return { frac: null, say: "no reference range on file" };
  if (high != null && value > high)
    return { frac: 1, say: `past the ceiling of ${high}` };
  if (low != null && value < low)
    return {
      frac: low > 0 ? Math.max(value / low, 0) : 0,
      say: `under the floor of ${low}`,
    };
  if (low == null)
    return {
      frac: high! > 0 ? value / high! : 0,
      say: `under the ceiling of ${high}`,
    };
  if (high == null) return { frac: 1, say: `over the floor of ${low}` };
  const frac = (value - low) / (high - low || 1);
  const band = `${low}–${high}`;
  const where = frac >= 0.8 ? "top of" : frac <= 0.2 ? "low in" : "mid";
  return {
    frac: Math.min(Math.max(frac, 0), 1),
    say: `${where} ${band}${named === "optimal" ? " optimal" : ""}`,
  };
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string; systems?: string; ruled?: string }>;
}) {
  const q = await searchParams;
  const lens: Lens = LENSES.includes(q.lens as Lens)
    ? (q.lens as Lens)
    : "lifespan";
  const systems = q.systems === "1";
  const showRuledOut = q.ruled === "1";

  const userId = await requireUserId();

  let input = await buildModelInput(userId);
  if (!input.sex || input.age == null) {
    await queueQuestions(userId);
    input = await buildModelInput(userId);
  }
  const blocked = !input.sex || input.age == null;

  const href = (next: Partial<{ lens: Lens; systems: boolean }>) => {
    const p = new URLSearchParams();
    const l = next.lens ?? lens;
    if (l !== "lifespan") p.set("lens", l);
    if (next.systems ?? systems) p.set("systems", "1");
    if (showRuledOut) p.set("ruled", "1");
    return `/graph${p.size ? `?${p}` : ""}`;
  };

  const head = (
    <>
      <div className="rowh">
        <PillTabs
          label="View"
          active={systems ? "systems" : "conditions"}
          tabs={[
            {
              id: "conditions",
              label: "Conditions",
              href: href({ systems: false }),
            },
            { id: "systems", label: "Systems", href: href({ systems: true }) },
          ]}
        />
        <PillTabs
          label="Lens"
          active={lens}
          tabs={LENSES.map((l) => ({
            id: l,
            label: l,
            href: href({ lens: l }),
          }))}
        />
        <span className="t-meta">
          Lens. It filters the graph and the URL, and nothing else.
        </span>
      </div>
      {blocked && (
        <div className="empty">
          <span className="k">Waiting on two facts</span>
          <p>
            The graph needs your sex and age before it can rank anything: every
            optimal range and half the edges depend on them. Everything below is
            drawn without them.
          </p>
          <Link href="/plan#answer">Answer them on Plan</Link>
        </div>
      )}
    </>
  );

  const patterns = matchPatterns(input).filter((p) => p.matched);
  const matchedIds = new Set(patterns.map((p) => p.pattern.id));
  const unmatched = PATTERNS.filter((p) => !matchedIds.has(p.id));
  const loaded = await loadGraph();
  const graph = computeGraphState(input, { top: HOT_NODES, graph: loaded });
  const importance = new Map(graph.nodes.map((n) => [n.id, n.importance]));

  if (!systems) {
    const [catalog, genome] = await Promise.all([
      catalogFor(userId),
      loadGenome(userId),
    ]);
    const bubbles = buildBubbles({
      graph: loaded,
      state: graph,
      m: input,
      beliefs: scoreHypotheses(input, { catalog, lens }),
      moves: nextMoves(input, catalog, { lens }),
      lens,
      matched: matchedIds,
      genome,
      showRuledOut,
    });
    const ruledHref = `/graph?${new URLSearchParams({
      ...(lens !== "lifespan" ? { lens } : {}),
      ...(showRuledOut ? {} : { ruled: "1" }),
    })}`;
    const hot: HotRow[] = graph.hot.map((n) => ({
      id: n.id,
      name: byId.get(n.id)?.name ?? n.id,
      importance: n.importance,
      /* The engine writes itself notes; `sayReason` turns each one into the
         sentence the panel prints. Server-side, so the browser never carries
         the catalog. */
      reasons: sayReasons(n.reasons),
    }));
    const active: ActiveRow[] = graph.activeEdges.map((e) => ({
      id: e.id,
      /* "through Fasting glucose → HbA1c", not "glucose->hba1c". */
      name: sayReason(`via ${e.id}`).replace(/^through /, ""),
      confidence: e.confidence,
      mechanism: e.mechanism,
      impact: e.impact,
    }));
    return (
      <ViewShell
        title="Your graph"
        subtitle={`${bubbles.nodes.length} bubbles · ${bubbles.links.length} edges · lens ${lens}`}
      >
        {head}
        <Bubbles
          graph={bubbles}
          viewBox={viewBoxOf(bubbles.nodes)}
          ruledOutHref={ruledHref}
          showRuledOut={showRuledOut}
          hot={hot}
          active={active}
        />
      </ViewShell>
    );
  }

  return (
    <ViewShell
      title="Your graph"
      subtitle={`${graph.activeEdges.length} active edges over 12 systems`}
    >
      {head}

      <div className="grid4">
        {SYSTEMS.map((system) => {
          const score = importance.get(`system:${system.id}`) ?? 0;
          const worst = worstMember(system.id, input, importance);
          const row = worst ? input.latest[worst.code] : null;
          /* An edge joins two markers or conditions, never two system
             nodes, so a system is touched when either end belongs to it. */
          const touching = graph.activeEdges.filter(
            (e) => systemOf(e.from) === system.id || systemOf(e.to) === system.id,
          ).length;
          const tone: StateTone =
            row && row.value != null ? toneOf(healthStatus(row)) : "none";
          /* The band the arc measures: the lab's own reference range, and
             the optimal band only when there is no reference range. */
          const useRef = row && (row.refLow != null || row.refHigh != null);
          const seat =
            row && row.value != null
              ? place(
                  row.value,
                  useRef ? row.refLow : row.optimalLow,
                  useRef ? row.refHigh : row.optimalHigh,
                  useRef ? "reference" : "optimal",
                )
              : null;
          return (
            <div
              key={system.id}
              data-system={system.id}
              className="card"
              /* `.card` in this app is the translucent tile only; the
                 mockup's own padding and column rhythm live at the call
                 site, so two other call sites are free to keep theirs. */
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "var(--s5)",
                padding: "var(--s13)",
              }}
            >
              <div className="c-label">{system.name}</div>
              <div
                className="rowh"
                style={{ gap: "var(--s13)", flexWrap: "nowrap" }}
              >
                <svg
                  className={`arc ${tone}`}
                  viewBox="0 0 55 55"
                  aria-hidden="true"
                >
                  <circle className="trk" cx="27.5" cy="27.5" r="22" />
                  {seat?.frac != null && (
                    <circle
                      className="val"
                      cx="27.5"
                      cy="27.5"
                      r="22"
                      strokeDasharray={`${(seat.frac * ARC).toFixed(1)} ${ARC}`}
                    />
                  )}
                  {/* Five digits inside a 44 px ring touch it at 13 px. */}
                  <text
                    x="27.5"
                    y="32"
                    style={
                      String(row?.value ?? "").length > 4
                        ? { fontSize: 11 }
                        : undefined
                    }
                  >
                    {row?.value ?? "—"}
                  </text>
                </svg>
                <div style={{ minWidth: 0 }}>
                  <StateWord
                    tone={tone}
                    tri={tone === "off"}
                    style={{ fontSize: "var(--type-md)" }}
                  >
                    {SYSTEM_WORD[tone]}
                  </StateWord>
                  {worst && row && row.value != null ? (
                    <>
                      <Link
                        href={`/blood/m/${worst.code}`}
                        className="t-meta block"
                      >
                        {worst.node.name} · {row.value}
                        {row.unit ? ` ${row.unit}` : ""}
                      </Link>
                      <div className="t-meta" style={{ fontSize: 11 }}>
                        {seat?.say}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="t-meta">
                        no marker has ever had a value
                      </div>
                      <div className="t-meta" style={{ fontSize: 11 }}>
                        {system.headline.join(", ")}
                      </div>
                    </>
                  )}
                  <div className="t-meta" style={{ fontSize: 11 }}>
                    weight {score.toFixed(2)} · {touching} active{" "}
                    {touching === 1 ? "edge" : "edges"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Patterns matched</h3>
          <span className="r">{patterns.length}</span>
        </div>
        {patterns.length ? (
          <div className="rowlist">
            {patterns.map((m) => (
              <div key={m.pattern.id}>
                <div className="rowh">
                  <Link href="/plan#patterns" className="t-body">
                    {m.pattern.name}
                  </Link>
                  {m.stage && <StateWord tone="border">{m.stage}</StateWord>}
                </div>
                <p className="t-body mt-1">{m.pattern.summary}</p>
                <p className="t-meta mt-1">{m.reasons.join("; ")}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="t-body">No pattern matches your numbers yet.</p>
        )}

        {unmatched.length > 0 && (
          <div className="chips mt-3">
            {unmatched.map((p) => (
              <Link key={p.id} href="/plan#patterns" className="chip quiet">
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </ViewShell>
  );
}
