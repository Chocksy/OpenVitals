/**
 * Monarch associations into `kg_nodes` / `kg_edges`.
 *
 *   pnpm --filter simple kg:import:monarch
 *   pnpm --filter simple kg:import:monarch --offline   # the fixture
 *
 * Monarch API v3, no key, three calls per catalog condition that carries a
 * MONDO id:
 *
 *   /v3/api/association?subject=<MONDO>&category=biolink:DiseaseToPhenotypicFeatureAssociation
 *   /v3/api/association?object=<MONDO>&category=biolink:CausalGeneToDiseaseAssociation
 *   /v3/api/association?object=<MONDO>&category=biolink:CorrelatedGeneToDiseaseAssociation
 *
 * Two things about that API are worth knowing before reading the filter below.
 *
 * 1. A gene-to-disease association has the gene as its subject and the disease
 *    as its object, so the two gene queries key on `object`. `subject=<MONDO>`
 *    returns nothing at all for them (checked 2026-08-30: 0 rows for every
 *    condition in our catalog).
 *
 * 2. Both endpoints answer over the MONDO closure, not the term. Asking for
 *    the phenotypes of type 2 diabetes returns 388 rows, none of which are
 *    annotated on type 2 diabetes: they belong to MODY-8, neonatal diabetes
 *    and the rest of the monogenic tips. That is the same trap phase 14 found
 *    in the HPOA walk, where every one of the 32 rows it proposed was rejected
 *    on /hkb. So an association only counts when its own subject (phenotype)
 *    or object (gene) is exactly the condition's term. It leaves fewer rows
 *    and every one of them is about the disease we asked about.
 *
 * Phenotypes land on our `fact:sym_*` nodes where `BACKGROUND` (the map the
 * HPOA importer already keeps) or `EXTRA_PHENOTYPES` names one, and otherwise
 * become `phenotype` nodes that are drawn and never scored. Genes land on the
 * `fact:genome:<GENE>` node when the genome catalog calls that gene, and
 * otherwise become `gene` nodes.
 *
 * Idempotent: every write is an upsert on the edge id, and the unique index on
 * (from, to, relation, when) catches the rest.
 */
import { sql } from "drizzle-orm";
import { getDb, hkbConditions, kgEdges, kgNodes, type KgEvidence } from "@/db";
import { offline, recordRun, took } from "@/lib/hkb-import";
import { NODES } from "@/lib/graph";
import { forgetGraph } from "@/lib/kg";
import { BACKGROUND } from "./hkb-import-ontology";

const MONARCH = "https://api.monarchinitiative.org/v3/api/association";
const LIMIT = 200;

/** Phenotypes our questionnaire asks about that `BACKGROUND` does not carry. */
export const EXTRA_PHENOTYPES: Record<string, string> = {
  "HP:0002870": "fact:sleep_snoring", // Obstructive sleep apnea
  "HP:0025267": "fact:sleep_snoring", // Snoring
  "HP:0001262": "fact:sym_sleepiness", // Excessive daytime somnolence
  "HP:0012378": "fact:sym_energy", // Fatigue
};

/**
 * Catalog conditions the hand-written graph already has a node for under a
 * different id. Two, and they are both spelling.
 */
const NODE_ALIAS: Record<string, string> = {
  sleep_apnoea: "condition:osa",
  coeliac_disease: "condition:coeliac",
};

export interface MonarchItem {
  id?: string;
  subject: string;
  subject_label?: string | null;
  object: string;
  object_label?: string | null;
  predicate?: string;
  primary_knowledge_source?: string | null;
  publications?: string[] | null;
  negated?: boolean | null;
}

export type Kind = "phenotype" | "causal" | "correlated";

const CATEGORY: Record<Kind, string> = {
  phenotype: "biolink:DiseaseToPhenotypicFeatureAssociation",
  causal: "biolink:CausalGeneToDiseaseAssociation",
  correlated: "biolink:CorrelatedGeneToDiseaseAssociation",
};

/** The fixture key and the query string are the same thing. */
export const queryOf = (mondoId: string, kind: Kind): string =>
  new URLSearchParams(
    kind === "phenotype"
      ? { subject: mondoId, category: CATEGORY[kind], limit: String(LIMIT) }
      : { object: mondoId, category: CATEGORY[kind], limit: String(LIMIT) },
  ).toString();

/**
 * The rows Monarch returns for one condition and one category, minus the
 * closure. See the note at the top of the file: without this filter a rare
 * syndrome's phenotypes end up hanging off a common adult disease.
 */
export function ownRows(
  items: MonarchItem[],
  mondoId: string,
  kind: Kind,
): MonarchItem[] {
  const seen = new Set<string>();
  return items.filter((a) => {
    if (a.negated) return false;
    const mine = kind === "phenotype" ? a.subject : a.object;
    if (mine !== mondoId) return false;
    const key = kind === "phenotype" ? a.object : a.subject;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "HGNC:4195" with `subject_label` "GCK" is the gene GCK. */
export const geneSymbol = (a: MonarchItem): string | null => {
  const label = (a.subject_label ?? "").trim();
  return /^[A-Z0-9-]{2,15}$/.test(label) ? label : null;
};

/** The gene nodes the seed already carries, by symbol. */
const seedGenes = new Set(
  NODES.filter((n) => n.kind === "gene").map((n) => n.id.split(":").pop()!),
);

/** Where a phenotype lands: one of our answers, or a display-only node. */
export function phenotypeTarget(hpoId: string): {
  id: string;
  minted: boolean;
} {
  const known = BACKGROUND[hpoId]?.featureId ?? EXTRA_PHENOTYPES[hpoId];
  return known
    ? { id: known, minted: false }
    : { id: `phenotype:${hpoId}`, minted: true };
}

/** Where a gene lands: the genome-catalog node, or a display-only one. */
export function geneTarget(symbol: string): { id: string; minted: boolean } {
  return seedGenes.has(symbol)
    ? { id: `fact:genome:${symbol}`, minted: false }
    : { id: `gene:${symbol}`, minted: true };
}

export interface PendingNode {
  id: string;
  kind: string;
  name: string;
  note: string | null;
  source: string;
}

export interface PendingEdge {
  id: string;
  fromId: string;
  toId: string;
  relation: string;
  strength: number;
  confidence: string;
  grade: string;
  basis: string;
  mechanism: string;
  evidence: KgEvidence[];
  source: string;
  status: string;
}

export interface Condition {
  id: string;
  name: string;
  mondoId: string;
}

/** The graph node id for a catalog condition. */
export const conditionNode = (id: string): string =>
  NODE_ALIAS[id] ?? `condition:${id}`;

const cite = (a: MonarchItem) =>
  [a.primary_knowledge_source, ...(a.publications ?? [])]
    .filter(Boolean)
    .join(", ") || "Monarch Initiative";

/**
 * One condition's associations as nodes and edges. Pure, so the whole shape is
 * tested against the fixture with no network and no database.
 */
export function toGraph(
  condition: Condition,
  found: Record<Kind, MonarchItem[]>,
): { nodes: PendingNode[]; edges: PendingEdge[] } {
  const nodes: PendingNode[] = [
    {
      id: conditionNode(condition.id),
      kind: "condition",
      name: condition.name,
      note: condition.mondoId,
      source: "monarch",
    },
  ];
  const edges: PendingEdge[] = [];

  for (const a of ownRows(found.phenotype, condition.mondoId, "phenotype")) {
    const target = phenotypeTarget(a.object);
    if (target.minted)
      nodes.push({
        id: target.id,
        kind: "phenotype",
        name: a.object_label ?? a.object,
        note: "HPO term from Monarch; drawn, never scored.",
        source: "monarch",
      });
    edges.push({
      id: `mon_${condition.id}_${a.object.replace(":", "_")}`,
      fromId: conditionNode(condition.id),
      toId: target.id,
      relation: "indicates",
      strength: 1,
      confidence: "probable",
      grade: "B",
      basis: "science",
      mechanism: `Monarch and HPOA record ${a.object_label ?? a.object} as a phenotype of ${condition.name}. It is a curated disease-phenotype statement, not a measured likelihood ratio.`,
      evidence: [
        {
          kind: "observational",
          title: `Monarch ${a.id ?? "association"}: ${condition.mondoId} has_phenotype ${a.object}`,
          source: cite(a),
        },
      ],
      source: "monarch",
      status: "active",
    });
  }

  for (const kind of ["causal", "correlated"] as const)
    for (const a of ownRows(found[kind], condition.mondoId, kind)) {
      const symbol = geneSymbol(a);
      if (!symbol) continue;
      const target = geneTarget(symbol);
      if (target.minted)
        nodes.push({
          id: target.id,
          kind: "gene",
          name: symbol,
          note: `${a.subject} from Monarch; no variant of it is on our array.`,
          source: "monarch",
        });
      edges.push({
        id: `mon_${symbol}_${condition.id}_${kind}`,
        fromId: target.id,
        toId: conditionNode(condition.id),
        relation: "raises",
        strength: kind === "causal" ? 2 : 1,
        confidence: kind === "causal" ? "established" : "probable",
        grade: kind === "causal" ? "A" : "B",
        basis: "science",
        mechanism:
          kind === "causal"
            ? `Monarch lists ${symbol} as a causal gene for ${condition.name}: a pathogenic variant in it produces the disease.`
            : `Monarch lists ${symbol} as correlated with ${condition.name}: association studies link the locus, no variant of it is causal on its own.`,
        evidence: [
          {
            kind: "observational",
            title: `Monarch ${a.id ?? "association"}: ${a.subject} ${kind === "causal" ? "causes" : "correlated with"} ${condition.mondoId}`,
            source: cite(a),
          },
        ],
        source: "monarch",
        status: "active",
      });
    }

  return { nodes, edges };
}

/* ── the network ──────────────────────────────────────────────────────── */

let fixture: Record<string, { items?: MonarchItem[] }> | null = null;

async function readFixture() {
  if (fixture) return fixture;
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { FIXTURES } = await import("@/lib/hkb-import");
  fixture = JSON.parse(
    await readFile(path.join(FIXTURES, "monarch.json"), "utf8"),
  );
  return fixture!;
}

/** One category for one condition. A call that fails answers with nothing. */
export async function fetchAssociations(
  mondoId: string,
  kind: Kind,
): Promise<MonarchItem[]> {
  const query = queryOf(mondoId, kind);
  if (offline()) return (await readFixture())[query]?.items ?? [];
  try {
    const res = await fetch(`${MONARCH}?${query}`);
    if (!res.ok) {
      console.error(`[kg:import:monarch] ${res.status} for ${query}`);
      return [];
    }
    const body = (await res.json()) as { items?: MonarchItem[] };
    return body.items ?? [];
  } catch (e) {
    console.error(`[kg:import:monarch] ${query} failed:`, e);
    return [];
  }
}

export interface ConditionCount {
  conditionId: string;
  phenotypes: number;
  genes: number;
  nodes: number;
  edges: number;
  ms: number;
}

export async function importMonarch(only: string[] = []) {
  const started = Date.now();
  const db = getDb();
  const conditions = (
    await db
      .select({
        id: hkbConditions.id,
        name: hkbConditions.name,
        mondoId: hkbConditions.mondoId,
      })
      .from(hkbConditions)
  ).filter(
    (c): c is Condition => !!c.mondoId && (!only.length || only.includes(c.id)),
  );

  const per: ConditionCount[] = [];
  let nodesWritten = 0;
  let edgesWritten = 0;

  for (const condition of conditions) {
    const at = Date.now();
    const [phenotype, causal, correlated] = await Promise.all([
      fetchAssociations(condition.mondoId, "phenotype"),
      fetchAssociations(condition.mondoId, "causal"),
      fetchAssociations(condition.mondoId, "correlated"),
    ]);
    const { nodes, edges } = toGraph(condition, {
      phenotype,
      causal,
      correlated,
    });

    for (const n of nodes)
      await db
        .insert(kgNodes)
        .values(n)
        .onConflictDoUpdate({
          target: kgNodes.id,
          set: { name: sql`excluded.name` },
        });

    const written = edges.length
      ? await db
          .insert(kgEdges)
          .values(edges)
          .onConflictDoNothing()
          .returning({ id: kgEdges.id })
      : [];

    nodesWritten += nodes.length;
    edgesWritten += written.length;
    per.push({
      conditionId: condition.id,
      phenotypes: edges.filter((e) => e.relation === "indicates").length,
      genes: edges.filter((e) => e.relation === "raises").length,
      nodes: nodes.length,
      edges: edges.length,
      ms: Date.now() - at,
    });
  }

  const ms = Date.now() - started;
  const rows = {
    conditions: conditions.length,
    nodes: nodesWritten,
    edges: edgesWritten,
    phenotype_edges: per.reduce((n, p) => n + p.phenotypes, 0),
    gene_edges: per.reduce((n, p) => n + p.genes, 0),
  };
  await recordRun(
    "kg-import-monarch",
    rows,
    `${offline() ? "offline fixture" : "Monarch API v3"}, ` +
      `${per.filter((p) => p.edges).length} of ${conditions.length} conditions ` +
      `produced an edge, ${took(ms)}`,
  );
  forgetGraph();
  return { ...rows, per, ms };
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  for (const f of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const { pool } = await import("@/db");
  importMonarch(only)
    .then((r) => {
      console.log(
        "\ncondition                      phen  gene  nodes  new  time",
      );
      for (const p of r.per)
        console.log(
          `${p.conditionId.padEnd(30)} ${String(p.phenotypes).padStart(4)} ` +
            `${String(p.genes).padStart(5)} ${String(p.nodes).padStart(6)} ` +
            `${String(p.edges).padStart(4)}  ${took(p.ms)}`,
        );
      console.log(
        `\n[kg:import:monarch] ${r.conditions} conditions, ${r.nodes} nodes, ` +
          `${r.edges} new edges (${r.phenotype_edges} phenotype, ` +
          `${r.gene_edges} gene) in ${took(r.ms)}`,
      );
    })
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
