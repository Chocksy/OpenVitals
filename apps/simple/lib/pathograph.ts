/**
 * The three columns of a pathograph: what runs into a node, the node, and what
 * runs out of it. Two steps each way, pruned to what fits on a screen.
 *
 * Pure on purpose. The page hands it a graph and a personal state and gets
 * back columns of node ids and the edges between them; nothing here knows what
 * a colour or an SVG is.
 *
 * ponytail: no graph library. Two breadth-first steps over an adjacency map is
 * the whole algorithm, and the prune is one sort.
 */
import type { GraphEdge, GraphNode } from "./graph";
import type { Graph } from "./kg";

/** How many nodes a column shows before the "+N more". */
export const COLUMN_LIMIT = 12;

/** How far the walk goes each way. */
export const DEPTH = 2;

const CONFIDENCE_WEIGHT = {
  established: 3,
  probable: 2,
  speculative: 1,
} as const;

export interface PathNode {
  node: GraphNode;
  /** 1 for a direct neighbour, 2 for a neighbour of a neighbour. */
  depth: number;
  /** |strength x confidence| of the best edge that put it here. */
  weight: number;
  /** False when only a "not for you" edge reaches it. Drawn faint, last. */
  live: boolean;
}

export interface PathEdge {
  edge: GraphEdge;
  /** Does this edge's `when` hold for this person? */
  live: boolean;
}

export interface Pathograph {
  centre: GraphNode;
  causes: PathNode[];
  effects: PathNode[];
  edges: PathEdge[];
  /** How many nodes the prune dropped, per column. */
  more: { causes: number; effects: number };
}

/** strength x confidence: what makes one edge worth drawing over another. */
export const edgeWeight = (edge: GraphEdge): number =>
  edge.strength * CONFIDENCE_WEIGHT[edge.confidence];

/**
 * One walk, `DEPTH` steps, following edges in one direction.
 *
 * A node is kept at the shallowest depth it is reached at, with the heaviest
 * edge that reached it, so a strong direct cause never loses its place to the
 * same node arriving again two steps out.
 */
function walk(
  centre: string,
  edges: GraphEdge[],
  direction: "up" | "down",
  live: (edge: GraphEdge) => boolean,
): {
  found: Map<string, { depth: number; weight: number; live: boolean }>;
  used: GraphEdge[];
} {
  const near = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const key = direction === "up" ? edge.to : edge.from;
    near.set(key, [...(near.get(key) ?? []), edge]);
  }

  const found = new Map<
    string,
    { depth: number; weight: number; live: boolean }
  >();
  const used = new Map<string, GraphEdge>();
  let frontier = [centre];

  for (let depth = 1; depth <= DEPTH && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const edge of near.get(id) ?? []) {
        const other = direction === "up" ? edge.from : edge.to;
        if (other === centre) continue;
        used.set(edge.id, edge);
        const alive = live(edge);
        const weight = edgeWeight(edge);
        const seen = found.get(other);
        if (
          seen &&
          ((seen.live && !alive) || seen.depth < depth || seen.weight >= weight)
        )
          continue;
        found.set(other, {
          depth: seen?.depth ?? depth,
          weight,
          live: alive || !!seen?.live,
        });
        // A dead edge is still drawn, faint, but it never opens a second step:
        // "not for you" does not get to reach further into your graph.
        if (!seen && alive) next.push(other);
      }
    frontier = next;
  }

  return { found, used: [...used.values()] };
}

/** The heaviest `COLUMN_LIMIT`, nearest first, and how many were left out. */
function prune(
  found: Map<string, { depth: number; weight: number; live: boolean }>,
  byId: Map<string, GraphNode>,
  limit: number,
): { column: PathNode[]; more: number } {
  const all = [...found.entries()]
    .map(([id, at]) => ({ node: byId.get(id), ...at }))
    .filter((n): n is PathNode => !!n.node)
    .sort(
      (a, b) =>
        Number(b.live) - Number(a.live) ||
        a.depth - b.depth ||
        b.weight - a.weight,
    );
  return { column: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/**
 * The pathograph around one node.
 *
 * `live` says whether an edge's `when` holds for this person; the page passes
 * `evaluateWhen`, a test passes a constant. Edges whose two endpoints both
 * survived the prune are the ones handed back, plus the dead ones touching the
 * centre so "not for you" stays visible.
 */
export function pathograph(
  graph: Graph,
  centreId: string,
  live: (edge: GraphEdge) => boolean = () => true,
  limit = COLUMN_LIMIT,
): Pathograph | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const centre = byId.get(centreId);
  if (!centre) return null;

  const active = graph.edges.filter(
    (e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to,
  );

  const up = walk(centreId, active, "up", live);
  const down = walk(centreId, active, "down", live);

  const causes = prune(up.found, byId, limit);
  const effects = prune(down.found, byId, limit);

  const drawn = new Set([
    centreId,
    ...causes.column.map((n) => n.node.id),
    ...effects.column.map((n) => n.node.id),
  ]);

  const seen = new Set<string>();
  const edges: PathEdge[] = [];
  for (const edge of [...up.used, ...down.used]) {
    if (seen.has(edge.id)) continue;
    if (!drawn.has(edge.from) || !drawn.has(edge.to)) continue;
    seen.add(edge.id);
    edges.push({ edge, live: live(edge) });
  }
  edges.sort((a, b) => edgeWeight(b.edge) - edgeWeight(a.edge));

  return {
    centre,
    causes: causes.column,
    effects: effects.column,
    edges,
    more: { causes: causes.more, effects: effects.more },
  };
}
