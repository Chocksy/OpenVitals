/**
 * The knowledge graph as rows, and the rows back as the `NODES` / `EDGES` the
 * engine already eats.
 *
 * `rowsToGraph` is pure, so the whole database shape is testable offline and
 * the round trip against the in-code graph is one assertion. `loadGraph` is
 * the only thing here that reads Postgres: it reads `kg_nodes` / `kg_edges`,
 * caches the answer for a minute, and falls back to `lib/graph.ts` when there
 * is no database or the tables are still empty. Deliberately the same shape as
 * `lib/hkb.ts`, because it is the same problem.
 */
import { asc } from "drizzle-orm";
import { getDb, kgEdges, kgNodes, type KgEdge, type KgNode } from "@/db";
import {
  EDGES,
  NODES,
  type EdgeWhen,
  type Evidence,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
  type Relation,
  type SystemId,
} from "./graph";

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The in-code graph, for the fallback and for every pure test. */
export const CODE_GRAPH: Graph = { nodes: NODES, edges: EDGES };

/** One `kg_nodes` row as a `GraphNode`. */
export const toNode = (r: Pick<KgNode, keyof KgNode>): GraphNode => ({
  id: r.id,
  kind: r.kind as NodeKind,
  name: r.name,
  ...(r.systemId ? { system: r.systemId as SystemId } : {}),
  ...(r.codes?.length ? { codes: r.codes } : {}),
  ...(r.note ? { note: r.note } : {}),
  ...(r.source && r.source !== "seed"
    ? { source: r.source as GraphNode["source"] }
    : {}),
});

/** One `kg_edges` row as a `GraphEdge`. */
export const toEdge = (r: Pick<KgEdge, keyof KgEdge>): GraphEdge => ({
  id: r.id,
  from: r.fromId,
  to: r.toId,
  relation: r.relation as Relation,
  strength: r.strength as GraphEdge["strength"],
  confidence: r.confidence as GraphEdge["confidence"],
  grade: r.grade as GraphEdge["grade"],
  basis: r.basis as GraphEdge["basis"],
  ...(r.when_ ? { when: r.when_ as EdgeWhen } : {}),
  mechanism: r.mechanism,
  evidence: (r.evidence ?? []) as Evidence[],
  source: r.source as GraphEdge["source"],
});

/** The two tables as one graph. An edge with a missing endpoint is dropped. */
export function rowsToGraph(rows: { nodes: KgNode[]; edges: KgEdge[] }): Graph {
  const nodes = rows.nodes.map(toNode);
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: rows.edges
      .filter(
        (e) => e.status === "active" && ids.has(e.fromId) && ids.has(e.toId),
      )
      .map(toEdge),
  };
}

const TTL = 60_000;
let cache: { at: number; graph: Graph } | null = null;

/**
 * The graph for this request. Cached for a minute in module scope, so a page
 * that computes the personal state ten times reads the tables once.
 */
export async function loadGraph(): Promise<Graph> {
  if (cache && Date.now() - cache.at < TTL) return cache.graph;
  const graph = (await fromDb()) ?? CODE_GRAPH;
  cache = { at: Date.now(), graph };
  return graph;
}

/** The seed and the importers call this so the next read sees their writes. */
export const forgetGraph = () => {
  cache = null;
};

async function fromDb(): Promise<Graph | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const [nodes, edges] = await Promise.all([
      db.select().from(kgNodes).orderBy(asc(kgNodes.id)),
      db.select().from(kgEdges).orderBy(asc(kgEdges.id)),
    ]);
    if (!nodes.length) return null;
    return rowsToGraph({ nodes, edges });
  } catch (e) {
    console.error("[kg] falling back to the in-code graph:", e);
    return null;
  }
}

/**
 * A minted HKB feature as a graph node. Called by `saveProposals` when a
 * research run invents a metric, so the thing the engine started scoring on
 * is also drawable.
 */
export async function mintNode(
  id: string,
  name: string,
  note?: string | null,
): Promise<void> {
  await getDb()
    .insert(kgNodes)
    .values({
      id,
      kind: "metric",
      name,
      codes: [id.slice(id.indexOf(":") + 1)],
      note: note ?? null,
      source: "minted",
    })
    .onConflictDoNothing();
  forgetGraph();
}
