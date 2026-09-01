import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, reviewItems } from "@/db";
import { requireUserId } from "@/lib/auth";
import { buildModelInput } from "@/lib/coverage";
import { queueQuestions } from "@/lib/ask";
import { buildBubbles, viewBoxOf } from "@/lib/bubbles";
import {
  computeGraphState,
  worstMember,
  type ActiveEdge,
} from "@/lib/graph-state";
import { NODES, SYSTEMS, type Relation, type SystemId } from "@/lib/graph";
import { loadGenome } from "@/lib/genome";
import { catalogFor } from "@/lib/hkb";
import { scoreHypotheses, type Lens } from "@/lib/hypotheses";
import { nextMoves } from "@/lib/infogain";
import { loadGraph } from "@/lib/kg";
import { matchPatterns, PATTERNS } from "@/lib/patterns";
import { healthStatus } from "@/lib/status";
import { Bubbles } from "@/components/bubbles";
import { ReviewItem } from "@/components/client";
import { SystemLinks, type SystemLink } from "@/components/graph-map";
import { ViewShell } from "@/components/plan";
import { StatusBadge } from "@/components/status-badge";
import { PillTabs } from "@/components/pill-tabs";
import { Badge, Card } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const HOT_NODES = 15;

/** The mockup's lens switcher, plus the fourth lens the engine actually has. */
const LENSES: Lens[] = ["lifespan", "energy", "mood", "weight"];

const byId = new Map(NODES.map((n) => [n.id, n]));

/** Red raises something bad, green helps, grey is neither. */
const TONE: Record<Relation, SystemLink["tone"]> = {
  raises: "bad",
  worsens: "bad",
  confounds: "bad",
  lowers: "good",
  treats: "good",
  indicates: "good",
  requires_test: "neutral",
  modifies_target: "neutral",
};

const CONFIDENCE_RANK = {
  established: 3,
  probable: 2,
  speculative: 1,
} as const;

const CONFIDENCE_BADGE = {
  established: "normal",
  probable: "info",
  speculative: "secondary",
} as const;

const systemOf = (nodeId: string): SystemId | undefined =>
  byId.get(nodeId)?.system;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
      {children}
    </h2>
  );
}

/** 0..1 as a track with a filled portion. The ring, flattened. */
function ImportanceBar({
  importance,
  className = "",
}: {
  importance: number;
  className?: string;
}) {
  const tone =
    importance >= 0.6
      ? "var(--color-health-critical)"
      : importance >= 0.3
        ? "var(--color-health-warning)"
        : "var(--color-accent-500)";
  return (
    <span
      className={`inline-block h-[3px] w-full bg-neutral-150 ${className}`}
      title={`importance ${importance}`}
    >
      <span
        className="block h-full"
        style={{
          width: `${Math.round(importance * 100)}%`,
          background: tone,
        }}
      />
    </span>
  );
}

/** One arc per system pair, tone and confidence; the strongest edge wins. */
function toLinks(edges: ActiveEdge[]): SystemLink[] {
  const out = new Map<string, SystemLink>();
  for (const edge of edges) {
    const from = systemOf(edge.from);
    const to = systemOf(edge.to);
    if (!from || !to || from === to) continue;
    const tone = TONE[edge.relation];
    const key = `${from}|${to}|${tone}`;
    const seen = out.get(key);
    if (seen && seen.strength >= edge.strength) {
      if (CONFIDENCE_RANK[edge.confidence] > CONFIDENCE_RANK[seen.confidence])
        seen.confidence = edge.confidence;
      continue;
    }
    out.set(key, {
      from,
      to,
      tone,
      confidence: edge.confidence,
      strength: edge.strength,
      title: `${edge.id}: ${edge.mechanism}`,
    });
  }
  return [...out.values()];
}

/** The lens switcher and the link to the systems map, as the mockup places them. */
function Switcher({
  lens,
  systems,
  ruled,
}: {
  lens: Lens;
  systems: boolean;
  ruled: boolean;
}) {
  const href = (next: Partial<{ lens: Lens; systems: boolean }>) => {
    const p = new URLSearchParams();
    const l = next.lens ?? lens;
    if (l !== "lifespan") p.set("lens", l);
    if (next.systems ?? systems) p.set("systems", "1");
    if (ruled) p.set("ruled", "1");
    return `/graph${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* One pill, not two toggles: the lens is the choice, and the view is
          a link next to it. Phase 24d. */}
      <PillTabs
        label="Lens"
        active={lens}
        tabs={LENSES.map((l) => ({ id: l, label: l, href: href({ lens: l }) }))}
      />
      <Link
        href={href({ systems: !systems })}
        className="hit-40 inline-flex items-center font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-neutral-500 underline decoration-dotted underline-offset-4 transition-colors duration-150 ease-out hover:text-neutral-900"
      >
        {systems ? "See the bubbles" : "See the systems"}
      </Link>
    </div>
  );
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
  const db = getDb();

  let input = await buildModelInput(userId);
  if (!input.sex || input.age == null) {
    await queueQuestions(userId);
    input = await buildModelInput(userId);
  }

  const blocked = !input.sex || input.age == null;
  if (blocked) {
    const open = await db
      .select()
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.userId, userId),
          eq(reviewItems.status, "open"),
          eq(reviewItems.kind, "profile_question"),
        ),
      );
    const firstTwo = open.filter((q) =>
      ["sex", "birth_year"].includes(q.subject?.factKey ?? ""),
    );
    return (
      <ViewShell title="Your graph" subtitle="Nothing to draw yet">
        <Card className="p-4">
          <p className="font-body text-[13px] text-neutral-700">
            The graph needs sex and age before it can rank anything: every
            optimal range and half the edges depend on them. Answer these two
            and it fills in.
          </p>
          <div className="mt-3 space-y-2">
            {firstTwo.map((q) => (
              <ReviewItem
                key={q.id}
                id={q.id}
                question={q.question}
                options={q.options}
              />
            ))}
          </div>
        </Card>
      </ViewShell>
    );
  }

  const patterns = matchPatterns(input).filter((p) => p.matched);
  const matchedIds = new Set(patterns.map((p) => p.pattern.id));
  const unmatched = PATTERNS.filter((p) => !matchedIds.has(p.id));
  const loaded = await loadGraph();
  const graph = computeGraphState(input, { top: HOT_NODES, graph: loaded });
  const importance = new Map(graph.nodes.map((n) => [n.id, n.importance]));
  const links = toLinks(graph.activeEdges);

  // The bubbles: the mockup's picture, over this person's own graph.
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
    return (
      <ViewShell
        title="Your brain"
        subtitle={`${bubbles.nodes.length} bubbles · ${bubbles.links.length} edges · lens ${lens}`}
        actions={
          <Switcher lens={lens} systems={systems} ruled={showRuledOut} />
        }
      >
        <Bubbles
          graph={bubbles}
          viewBox={viewBoxOf(bubbles.nodes)}
          ruledOutHref={ruledHref}
          showRuledOut={showRuledOut}
        />
      </ViewShell>
    );
  }

  return (
    <ViewShell
      title="Your graph"
      subtitle={`${graph.activeEdges.length} active edges over 12 systems`}
      actions={<Switcher lens={lens} systems={systems} ruled={showRuledOut} />}
    >
      <SystemLinks links={links}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {SYSTEMS.map((system) => {
            const score = importance.get(`system:${system.id}`) ?? 0;
            const worst = worstMember(system.id, input, importance);
            const row = worst ? input.latest[worst.code] : null;
            const touching = graph.activeEdges.filter(
              (e) =>
                systemOf(e.from) === system.id || systemOf(e.to) === system.id,
            ).length;
            return (
              <Card
                key={system.id}
                data-system={system.id}
                className="flex min-h-[112px] flex-col gap-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-[13px] font-medium leading-tight">
                    {system.name}
                  </p>
                  <span className="font-mono text-[10px] tabular-nums text-neutral-400">
                    {score.toFixed(2)}
                  </span>
                </div>
                <ImportanceBar importance={score} />

                {worst && row ? (
                  <div className="mt-auto space-y-1">
                    <Link
                      href={`/m/${worst.code}`}
                      className="block truncate font-body text-[12px] text-neutral-700 hover:underline"
                    >
                      {worst.node.name}{" "}
                      <span className="font-mono tabular-nums">
                        {row.value}
                        {row.unit ? ` ${row.unit}` : ""}
                      </span>
                    </Link>
                    <StatusBadge
                      status={healthStatus(row)}
                      label={healthStatus(row)}
                    />
                  </div>
                ) : (
                  <p className="mt-auto font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                    never measured
                  </p>
                )}

                <p className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                  {touching} active {touching === 1 ? "edge" : "edges"}
                </p>
              </Card>
            );
          })}
        </div>
      </SystemLinks>

      <section>
        <Label>Patterns · {patterns.length} matched</Label>
        {patterns.length ? (
          <div className="space-y-2">
            {patterns.map((m) => (
              <Card key={m.pattern.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/patterns/${m.pattern.id}`}
                    className="font-display text-[15px] font-medium hover:underline"
                  >
                    {m.pattern.name}
                  </Link>
                  {m.stage && <Badge variant="warning">{m.stage}</Badge>}
                </div>
                <p className="mt-2 font-body text-[13px] text-neutral-700">
                  {m.pattern.summary}
                </p>
                <p className="deep mt-2 font-body text-[12px] text-neutral-500">
                  {m.reasons.join("; ")}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-4">
            <p className="font-body text-[13px] text-neutral-500">
              No pattern matches your numbers yet.
            </p>
          </Card>
        )}

        {unmatched.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {unmatched.map((p) => (
              <Link
                key={p.id}
                href={`/patterns/${p.id}`}
                className="inline-flex items-center border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-body text-[12px] text-neutral-400 hover:border-neutral-300 hover:text-neutral-600"
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <Label>Hot nodes · top {Math.min(HOT_NODES, graph.hot.length)}</Label>
        <div className="card divide-y divide-neutral-100">
          {graph.hot.length === 0 && (
            <p className="px-4 py-3 font-body text-[13px] text-neutral-500">
              Nothing is hot yet. Upload a lab result and this fills in.
            </p>
          )}
          {graph.hot.map((node) => (
            <div key={node.id} className="px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="flex-1 truncate font-mono text-[11px] text-neutral-700">
                  {node.id}
                </span>
                <span className="w-24 shrink-0">
                  <ImportanceBar importance={node.importance} />
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-neutral-400">
                  {node.importance.toFixed(2)}
                </span>
              </div>
              <p className="deep mt-1 font-body text-[12px] text-neutral-500">
                {node.reasons.join("; ") || "no reason recorded"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="deep">
        <Label>Active edges · {graph.activeEdges.length}</Label>
        <div className="card divide-y divide-neutral-100">
          {graph.activeEdges.length === 0 && (
            <p className="px-4 py-3 font-body text-[13px] text-neutral-500">
              No edge is active for you.
            </p>
          )}
          {graph.activeEdges.map((edge) => (
            <div key={edge.id} className="flex items-start gap-2 px-4 py-2">
              <Badge variant={CONFIDENCE_BADGE[edge.confidence]}>
                {edge.confidence}
              </Badge>
              <span className="flex-1 font-body text-[12px] text-neutral-600">
                <span className="font-mono text-[11px] text-neutral-500">
                  {edge.id}
                </span>{" "}
                {edge.mechanism}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-neutral-400">
                impact {edge.impact}
              </span>
            </div>
          ))}
        </div>
      </section>
    </ViewShell>
  );
}
