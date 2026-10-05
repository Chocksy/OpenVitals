/**
 * The knowledge graph as rows, and the rows back as the `NODES` / `EDGES` the
 * engine already eats.
 *
 * `rowsToGraph` is pure, so the whole database shape is testable offline and
 * the round trip against the in-code graph is one assertion. `loadGraph` reads
 * Postgres in two halves. The core (every node and edge that did not come from
 * Monarch, plus the endpoints those edges name) is small and cached for a
 * minute. The Monarch rows (255k edges) are never held: each request fetches
 * only the ones its caller can use, named by a `GraphNeed`. With no database,
 * or empty tables, it falls back to `lib/graph.ts`. Deliberately the same shape
 * as `lib/hkb.ts`, because it is the same problem.
 */
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
  /**
   * Edges per node over the whole table, set when the graph is a slice of it
   * and the caller asked (`GraphNeed.degree`). `buildBubbles` breaks ties on
   * it; without it, it counts `edges`.
   */
  degree?: Map<string, number>;
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

/**
 * The Monarch rows one caller can use, on top of the core. Every field is a
 * superset rule: a caller that names more gets more rows, never other ones.
 */
export interface GraphNeed {
  /** Nodes to add by id, with every edge between them and the rest. */
  ids?: string[];
  /**
   * Free text matched against node names the way `computeGraphState` matches
   * `focus` (either contains the other, case-blind). Each hit is added like
   * `ids`.
   */
  names?: string[];
  /** Nodes whose every edge is wanted, with the node at the far end. */
  touching?: string[];
  /** Fill `Graph.degree` for every node in the answer. */
  degree?: boolean;
}

const MONARCH = "monarch";
const TTL = 60_000;

/** By id, in code-unit order, so a merged slice reads like one `order by`. */
const byId = <T extends { id: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The cache lives on globalThis, like the pool in `db/index.ts`. Next loads this
 * module more than once per process (rsc, route, old HMR copies); a module
 * `let` gave each its own copy. It holds the promise, so callers that arrive
 * mid-load share one read. `at` is Infinity until the load settles.
 */
const g = globalThis as unknown as {
  __kgGraph?: { at: number; graph: Promise<Graph> };
};

/** The core, cached for a minute per process. */
function loadCore(): Promise<Graph> {
  const hit = g.__kgGraph;
  if (hit && Date.now() - hit.at < TTL) return hit.graph;
  const entry = {
    at: Infinity,
    graph: coreFromDb().then((graph) => graph ?? CODE_GRAPH),
  };
  entry.graph.then(
    () => (entry.at = Date.now()),
    () => g.__kgGraph === entry && (g.__kgGraph = undefined),
  );
  g.__kgGraph = entry;
  return entry.graph;
}

/**
 * The graph for this request: the core, plus the Monarch rows `need` names.
 * Monarch is fetched per request and never cached, so no process holds it.
 * With no `need` it is the cached core itself.
 */
export async function loadGraph(need: GraphNeed = {}): Promise<Graph> {
  const core = await loadCore();
  if (core === CODE_GRAPH) return core;
  if (
    !need.ids?.length &&
    !need.names?.length &&
    !need.touching?.length &&
    !need.degree
  )
    return core;
  return withMonarch(core, need);
}

/** The seed and the importers call this so the next read sees their writes. */
export const forgetGraph = () => {
  g.__kgGraph = undefined;
};

/**
 * Every node, Monarch included, read fresh and never cached. Only the
 * mechanism search wants this (it lists the nodes for the model and resolves
 * names against them), and it runs from the worker or an admin action.
 */
export async function loadAllNodes(): Promise<GraphNode[]> {
  if (!process.env.DATABASE_URL) return CODE_GRAPH.nodes;
  const rows = await getDb().select().from(kgNodes).orderBy(asc(kgNodes.id));
  return rows.length ? rows.map(toNode) : CODE_GRAPH.nodes;
}

async function coreFromDb(): Promise<Graph | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const own = (column: AnyPgColumn) =>
      db
        .select({ id: column })
        .from(kgEdges)
        .where(ne(kgEdges.source, MONARCH));
    const nodes = await db
      .select()
      .from(kgNodes)
      .where(
        or(
          ne(kgNodes.source, MONARCH),
          inArray(kgNodes.id, own(kgEdges.fromId)),
          inArray(kgNodes.id, own(kgEdges.toId)),
        ),
      );
    if (!nodes.length) return null;
    const ids = nodes.map((n) => n.id);
    const edges = await db
      .select()
      .from(kgEdges)
      .where(and(anyOf(kgEdges.fromId, ids), anyOf(kgEdges.toId, ids)));
    return rowsToGraph({ nodes: nodes.sort(byId), edges: edges.sort(byId) });
  } catch (e) {
    console.error("[kg] falling back to the in-code graph:", e);
    return null;
  }
}

/** `column = any($1)`: one array parameter, however many ids. */
const anyOf = (column: AnyPgColumn, ids: string[]) =>
  sql`${column} = any(${sql.param(ids)}::text[])`;

/** The core plus the Monarch rows `need` names, merged in id order. */
async function withMonarch(core: Graph, need: GraphNeed): Promise<Graph> {
  const db = getDb();
  const have = new Set(core.nodes.map((n) => n.id));

  const names = [
    ...new Set(
      (need.names ?? []).map((f) => f.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const named = names.length
    ? await db
        .select({ id: kgNodes.id })
        .from(kgNodes)
        .where(
          and(
            eq(kgNodes.source, MONARCH),
            sql`exists (select 1 from unnest(${sql.param(names)}::text[]) f
              where strpos(f, lower(${kgNodes.name})) > 0
                 or strpos(lower(${kgNodes.name}), f) > 0)`,
          ),
        )
    : [];
  const added = [
    ...new Set([...(need.ids ?? []), ...named.map((r) => r.id)]),
  ].filter((id) => !have.has(id));
  const touching = [...new Set(need.touching ?? [])];

  const among = [...have, ...added];
  const [between, around] = await Promise.all([
    added.length
      ? db
          .select()
          .from(kgEdges)
          .where(
            and(
              anyOf(kgEdges.fromId, among),
              anyOf(kgEdges.toId, among),
              or(anyOf(kgEdges.fromId, added), anyOf(kgEdges.toId, added)),
            ),
          )
      : [],
    touching.length
      ? db
          .select()
          .from(kgEdges)
          .where(
            or(anyOf(kgEdges.fromId, touching), anyOf(kgEdges.toId, touching)),
          )
      : [],
  ]);

  const coreEdges = new Set(core.edges.map((e) => e.id));
  const edgeRows = new Map<string, KgEdge>();
  for (const e of [...between, ...around])
    if (!coreEdges.has(e.id)) edgeRows.set(e.id, e);

  const wanted = new Set(added);
  for (const e of edgeRows.values())
    for (const id of [e.fromId, e.toId]) if (!have.has(id)) wanted.add(id);
  const nodeRows = wanted.size
    ? await db
        .select()
        .from(kgNodes)
        .where(anyOf(kgNodes.id, [...wanted]))
    : [];

  const nodes = [...core.nodes, ...nodeRows.map(toNode)].sort(byId);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [
    ...core.edges,
    ...[...edgeRows.values()]
      .filter(
        (e) => e.status === "active" && ids.has(e.fromId) && ids.has(e.toId),
      )
      .map(toEdge),
  ].sort(byId);

  return {
    nodes,
    edges,
    ...(need.degree ? { degree: await degreeOf([...ids]) } : {}),
  };
}

/** Active edges per node over the whole table, for these ids. */
async function degreeOf(ids: string[]): Promise<Map<string, number>> {
  const { rows } = await getDb().execute<{ id: string; n: number }>(sql`
    select id, count(*)::int as n from (
      select ${kgEdges.fromId} as id from ${kgEdges}
       where ${kgEdges.status} = 'active' and ${anyOf(kgEdges.fromId, ids)}
      union all
      select ${kgEdges.toId} from ${kgEdges}
       where ${kgEdges.status} = 'active' and ${anyOf(kgEdges.toId, ids)}
    ) t group by id`);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
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
