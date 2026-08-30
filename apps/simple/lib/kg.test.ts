/**
 * The graph as rows and back, and the Monarch importer against its fixture.
 * No database and no network: `kgRows` and `rowsToGraph` are pure, and the
 * importer's `toGraph` is handed the fixture's own JSON.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GENOME_CATALOG } from "./genome-catalog";
import { EDGES, NODES, gradeOfEdge, kgRows } from "./graph";
import { FIXTURES } from "./hkb-import";
import { CODE_GRAPH, loadGraph, rowsToGraph } from "./kg";
import {
  conditionNode,
  ownRows,
  phenotypeTarget,
  queryOf,
  toGraph,
  type Kind,
  type MonarchItem,
} from "@/scripts/kg-import-monarch";

/** `kgRows` gives insert shapes; the table adds these two on the way back. */
const asRows = () => {
  const rows = kgRows();
  return {
    nodes: rows.nodes.map((n) => ({ ...n, createdAt: null })),
    edges: rows.edges.map((e) => ({
      ...e,
      when_: e.when_ as Record<string, unknown> | null,
      createdAt: null,
    })),
  } as Parameters<typeof rowsToGraph>[0];
};

describe("the seed round trip", () => {
  const back = rowsToGraph(asRows());

  it("gives every node and every edge a row", () => {
    expect(back.nodes.length).toBe(NODES.length);
    expect(back.edges.length).toBe(EDGES.length);
  });

  it("comes back as the same nodes", () => {
    expect(back.nodes).toEqual(NODES);
  });

  it("comes back as the same edges, with the derived grade filled in", () => {
    expect(back.edges).toEqual(
      EDGES.map((e) => ({ ...e, grade: gradeOfEdge(e) })),
    );
  });

  it("never writes an edge whose endpoints are not nodes", () => {
    const ids = new Set(NODES.map((n) => n.id));
    const dangling = kgRows()
      .edges.filter((e) => !ids.has(e.fromId) || !ids.has(e.toId))
      .map((e) => e.id);
    expect(dangling).toEqual([]);
  });

  it("keys the two CYP1A2 edges apart, so the unique index takes both", () => {
    const keys = kgRows().edges.map(
      (e) => `${e.fromId}|${e.toId}|${e.relation}|${JSON.stringify(e.when_)}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("drops an edge the row set has no node for", () => {
    const rows = asRows();
    const orphan = { ...rows.edges[0]!, id: "orphan", fromId: "metric:nope" };
    expect(
      rowsToGraph({ ...rows, edges: [...rows.edges, orphan] }).edges,
    ).toHaveLength(rows.edges.length);
  });
});

describe("the gene nodes", () => {
  it("carries one node per row of the genome catalog", () => {
    const nodes = NODES.filter((n) => n.kind === "gene");
    expect(nodes).toHaveLength(GENOME_CATALOG.length);
  });

  it("points every gene node at the profile fact that row writes", () => {
    const keys = new Set(
      NODES.flatMap((n) => (n.kind === "gene" ? n.codes! : [])),
    );
    const missing = GENOME_CATALOG.filter((r) => !keys.has(r.factKey)).map(
      (r) => r.factKey,
    );
    expect(missing).toEqual([]);
  });
});

describe("the fallback", () => {
  it("hands back the in-code graph with no DATABASE_URL", async () => {
    const url = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(await loadGraph()).toBe(CODE_GRAPH);
    } finally {
      if (url) process.env.DATABASE_URL = url;
    }
  });
});

/* ── the Monarch importer ─────────────────────────────────────────────── */

const monarch = JSON.parse(
  readFileSync(path.join(FIXTURES, "monarch.json"), "utf8"),
) as Record<string, { items: MonarchItem[] }>;

const found = (mondoId: string) =>
  Object.fromEntries(
    (["phenotype", "causal", "correlated"] as Kind[]).map((k) => [
      k,
      monarch[queryOf(mondoId, k)]?.items ?? [],
    ]),
  ) as Record<Kind, MonarchItem[]>;

const T2D = {
  id: "type2_diabetes",
  name: "Type 2 diabetes",
  mondoId: "MONDO:0005148",
};

describe("the Monarch closure filter", () => {
  it("drops every association that belongs to a subtype", () => {
    const items = found(T2D.mondoId).correlated;
    const kept = ownRows(items, T2D.mondoId, "correlated");
    expect(items.length).toBeGreaterThan(kept.length);
    expect(kept.every((a) => a.object === T2D.mondoId)).toBe(true);
  });

  it("keeps one row per phenotype, however often HPOA repeats it", () => {
    const kept = ownRows(
      found(T2D.mondoId).phenotype,
      T2D.mondoId,
      "phenotype",
    );
    expect(new Set(kept.map((a) => a.object)).size).toBe(kept.length);
  });
});

describe("Monarch into the graph", () => {
  const { nodes, edges } = toGraph(T2D, found(T2D.mondoId));

  it("hangs the phenotypes off the condition and the genes off the disease", () => {
    const phenotypes = edges.filter((e) => e.relation === "indicates");
    const genes = edges.filter((e) => e.relation === "raises");
    expect(phenotypes.length).toBeGreaterThan(0);
    expect(genes.length).toBeGreaterThan(0);
    expect(
      phenotypes.every((e) => e.fromId === "condition:type2_diabetes"),
    ).toBe(true);
    expect(genes.every((e) => e.toId === "condition:type2_diabetes")).toBe(
      true,
    );
  });

  it("grades a causal gene A and a correlated one B", () => {
    const causal = edges.find((e) => e.id.endsWith("_causal"))!;
    const correlated = edges.find((e) => e.id.endsWith("_correlated"))!;
    expect(causal.grade).toBe("A");
    expect(correlated.grade).toBe("B");
  });

  it("lands TCF7L2 on the genome-catalog node, not on a new one", () => {
    const tcf = edges.find((e) => e.id.startsWith("mon_TCF7L2_"))!;
    expect(tcf.fromId).toBe("fact:genome:TCF7L2");
    expect(nodes.some((n) => n.id === "gene:TCF7L2")).toBe(false);
  });

  it("mints a display-only node for a gene the array does not carry", () => {
    const gck = nodes.find((n) => n.id === "gene:GCK");
    expect(gck?.kind).toBe("gene");
  });

  it("names a source on every edge", () => {
    expect(edges.every((e) => e.evidence[0]?.source)).toBe(true);
  });

  it("reuses the hand-written node for a condition it already has", () => {
    expect(conditionNode("sleep_apnoea")).toBe("condition:osa");
    expect(conditionNode("type2_diabetes")).toBe("condition:type2_diabetes");
  });

  it("puts a known phenotype on our own answer and an unknown one on a phenotype node", () => {
    expect(phenotypeTarget("HP:0002870")).toEqual({
      id: "fact:sleep_snoring",
      minted: false,
    });
    expect(phenotypeTarget("HP:0031819")).toEqual({
      id: "phenotype:HP:0031819",
      minted: true,
    });
  });

  it("is idempotent: the same fixture gives the same edge ids", () => {
    const again = toGraph(T2D, found(T2D.mondoId));
    expect(again.edges.map((e) => e.id)).toEqual(edges.map((e) => e.id));
  });
});
