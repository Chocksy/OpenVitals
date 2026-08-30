/**
 * The three columns, on a hand-made graph small enough to count by eye and
 * then once on the real one, so the depth, the prune and the dedupe are all
 * assertable without a database.
 */
import { describe, it, expect } from "vitest";
import { EDGES, NODES, type GraphEdge, type GraphNode } from "./graph";
import { COLUMN_LIMIT, edgeWeight, pathograph } from "./pathograph";
import type { Graph } from "./kg";

const node = (id: string): GraphNode => ({ id, kind: "metric", name: id });

const edge = (
  from: string,
  to: string,
  extra: Partial<GraphEdge> = {},
): GraphEdge => ({
  id: `${from}->${to}`,
  from,
  to,
  relation: "raises",
  strength: 2,
  confidence: "established",
  basis: "science",
  mechanism: `${from} raises ${to}`,
  evidence: [{ kind: "meta", title: "a paper" }],
  source: "seed",
  ...extra,
});

/**
 *   a -> b -> centre -> d -> e
 *   far ------^ (two steps up through b)
 *   x -> centre, gated
 */
const toy: Graph = {
  nodes: ["a", "b", "centre", "d", "e", "far", "x"].map(node),
  edges: [
    edge("a", "b"),
    edge("b", "centre"),
    edge("far", "b", { strength: 1, confidence: "speculative" }),
    edge("centre", "d"),
    edge("d", "e"),
    edge("x", "centre", { id: "x->centre", when: { sex: "female" } }),
  ],
};

describe("two steps each way", () => {
  const p = pathograph(toy, "centre")!;

  it("puts the direct cause at depth 1 and its cause at depth 2", () => {
    expect(p.causes.map((n) => [n.node.id, n.depth])).toEqual([
      ["b", 1],
      ["x", 1],
      ["a", 2],
      ["far", 2],
    ]);
    expect(p.causes.every((n) => n.live)).toBe(true);
  });

  it("does the same downstream", () => {
    expect(p.effects.map((n) => [n.node.id, n.depth])).toEqual([
      ["d", 1],
      ["e", 2],
    ]);
  });

  it("never walks past the second step", () => {
    const deep: Graph = {
      nodes: [...toy.nodes, node("deeper")],
      edges: [...toy.edges, edge("deeper", "a")],
    };
    expect(
      pathograph(deep, "centre")!.causes.map((n) => n.node.id),
    ).not.toContain("deeper");
  });

  it("never puts the centre in a column", () => {
    const loop: Graph = {
      nodes: toy.nodes,
      edges: [...toy.edges, edge("d", "centre")],
    };
    const back = pathograph(loop, "centre")!;
    expect(back.causes.map((n) => n.node.id)).not.toContain("centre");
    expect(back.effects.map((n) => n.node.id)).not.toContain("centre");
  });

  it("answers nothing for a node that is not in the graph", () => {
    expect(pathograph(toy, "metric:nope")).toBe(null);
  });
});

describe("the `when` gate", () => {
  const live = (e: GraphEdge) => !e.when;
  const p = pathograph(toy, "centre", live)!;

  it("still draws a dead edge, marked dead", () => {
    const x = p.edges.find((e) => e.edge.id === "x->centre");
    expect(x?.live).toBe(false);
  });

  it("does not let a dead edge open a second step", () => {
    const chain: Graph = {
      nodes: [...toy.nodes, node("behind")],
      edges: [...toy.edges, edge("behind", "x")],
    };
    const causes = pathograph(chain, "centre", live)!.causes;
    expect(causes.find((n) => n.node.id === "x")?.live).toBe(false);
    expect(causes.map((n) => n.node.id)).not.toContain("behind");
  });
});

describe("the prune", () => {
  const wide: Graph = {
    nodes: [
      node("centre"),
      ...Array.from({ length: 20 }, (_, i) => node(`c${i}`)),
    ],
    edges: Array.from({ length: 20 }, (_, i) =>
      edge(`c${i}`, "centre", { strength: ((i % 3) + 1) as 1 | 2 | 3 }),
    ),
  };
  const p = pathograph(wide, "centre")!;

  it("keeps twelve and counts the rest", () => {
    expect(p.causes).toHaveLength(COLUMN_LIMIT);
    expect(p.more.causes).toBe(8);
  });

  it("keeps the heaviest first", () => {
    expect(p.causes[0]!.weight).toBe(9);
    expect(p.causes.map((n) => n.weight)).toEqual(
      [...p.causes.map((n) => n.weight)].sort((a, b) => b - a),
    );
  });

  it("drops an edge whose other end did not survive the prune", () => {
    const drawn = new Set([
      "centre",
      ...p.causes.map((n) => n.node.id),
      ...p.effects.map((n) => n.node.id),
    ]);
    expect(
      p.edges.every((e) => drawn.has(e.edge.from) && drawn.has(e.edge.to)),
    ).toBe(true);
  });
});

describe("no edge twice", () => {
  it("dedupes an edge both walks reach", () => {
    const both: Graph = {
      nodes: [node("centre"), node("other")],
      edges: [edge("other", "centre"), edge("centre", "other")],
    };
    const p = pathograph(both, "centre")!;
    expect(p.edges.map((e) => e.edge.id).sort()).toEqual([
      "centre->other",
      "other->centre",
    ]);
  });
});

describe("on the real graph", () => {
  const graph: Graph = { nodes: NODES, edges: EDGES };

  it("draws sleep duration with causes and effects on both sides", () => {
    const p = pathograph(graph, "metric:sleep_duration")!;
    expect(p.causes.length).toBeGreaterThan(0);
    expect(p.effects.map((n) => n.node.id)).toContain("metric:insulin");
    expect(p.causes.map((n) => n.node.id)).toContain(
      "behavior:coffee_after_15",
    );
  });

  it("never exceeds the column limit anywhere", () => {
    for (const n of NODES) {
      const p = pathograph(graph, n.id)!;
      expect(p.causes.length).toBeLessThanOrEqual(COLUMN_LIMIT);
      expect(p.effects.length).toBeLessThanOrEqual(COLUMN_LIMIT);
    }
  });

  it("weighs an established strength-3 edge above a speculative one", () => {
    expect(
      edgeWeight({ strength: 3, confidence: "established" } as GraphEdge),
    ).toBeGreaterThan(
      edgeWeight({ strength: 3, confidence: "speculative" } as GraphEdge),
    );
  });
});
