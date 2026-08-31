/**
 * HPO, MONDO and HPOA into `hkb_terms`, `hkb_annotations` and, for the
 * conditions in our catalog, proposed rows in `hkb_evidence`.
 *
 *   pnpm --filter simple hkb:import          # ~165 MB of downloads, cached
 *   pnpm --filter simple hkb:import --offline # the fixtures under evals/
 *
 * Sources, all open, all checked 2026-08-28 (the PURLs redirect to the current
 * GitHub release, v2026-06-23 for HPO/HPOA and v2026-08-04 for MONDO):
 *
 *   https://purl.obolibrary.org/obo/hp.json               22 MB, 20 464 terms
 *   https://purl.obolibrary.org/obo/mondo.json           103 MB, 32 104 live terms
 *   https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa 34 MB, 285 598 rows
 *
 * Memory: both JSON files are parsed whole rather than streamed. MONDO is the
 * big one at about 700 MB of heap while it is parsed, which is inside Node's
 * default old-space on any machine that can run the app. The `.hpoa` file is
 * a TSV and is read line by line.
 *
 * The mapping to our catalog:
 *
 *   For every `hkb_conditions` row with a MONDO id, HPOA is joined through
 *   that term's own OMIM and Orphanet xrefs, and through the xrefs of a
 *   direct child term whose name still carries the condition's head word
 *   ("congenital hypothyroidism" under "hypothyroidism"). Nothing deeper.
 *
 *   Phase 14 cut the old three-level descendant walk. It reached the rare
 *   Mendelian tips of MONDO, where the frequencies live, and mapped a
 *   phenotype that is "frequent" in a one-in-a-million syndrome onto a common
 *   adult condition. Every one of the 32 rows it proposed was rejected on
 *   /hkb. `proposals_old_rule` in the run row says how many that walk would
 *   still produce, so the difference stays visible.
 *
 * Idempotent: every write is an upsert, so a second run changes nothing.
 */
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import {
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbEvidence,
  hkbTerms,
} from "@/db";
import { recordRevision } from "@/lib/hkb";
import { offline, recordRun, source, took } from "@/lib/hkb-import";

const OBO = "https://purl.obolibrary.org/obo";

/**
 * The phenotype background rates, the frequency parser and the "frequent"
 * threshold moved to `lib/hpoa.ts` in phase 17, so `lib/wake.ts` can read them
 * without importing a script. Re-exported here because the Monarch importer and
 * the tests already name this module.
 */
export { BACKGROUND, BANDS, FREQUENT, frequencyOf } from "@/lib/hpoa";
import { BACKGROUND, FREQUENT, frequencyOf } from "@/lib/hpoa";


/** How far the old (phase 13) rule walked `is_a`, kept only to count it. */
const OLD_DEPTH = 3;

/**
 * "Subclinical hypothyroidism" → "hypothyroidism". The head of an English
 * noun phrase is its last word, and that is the word a MONDO child term has to
 * repeat before its rare-disease frequencies may speak for the parent.
 */
export const headWord = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .pop() ?? "";

const shortId = (iri: string) => iri.split("/").pop()!.replace("_", ":");

interface OboNode {
  id: string;
  lbl?: string;
  type?: string;
  meta?: {
    deprecated?: boolean;
    synonyms?: { val: string }[];
    xrefs?: { val: string }[];
  };
}

interface Term {
  id: string;
  ontology: string;
  name: string;
  synonyms: string[] | null;
  parents: string[] | null;
  xrefs: string[] | null;
}

/** One OBO graph file as `hkb_terms` rows. */
export async function readOntology(
  file: string,
  prefix: string,
): Promise<Term[]> {
  const graph = (
    JSON.parse(await readFile(file, "utf8")) as {
      graphs: {
        nodes: OboNode[];
        edges: { sub: string; pred: string; obj: string }[];
      }[];
    }
  ).graphs[0]!;

  const parents = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.pred !== "is_a") continue;
    const child = shortId(e.sub);
    parents.set(child, [...(parents.get(child) ?? []), shortId(e.obj)]);
  }

  const out: Term[] = [];
  for (const n of graph.nodes) {
    const id = shortId(n.id);
    if (!id.startsWith(`${prefix}:`)) continue;
    if (n.meta?.deprecated) continue;
    const synonyms = (n.meta?.synonyms ?? []).map((s) => s.val);
    const xrefs = (n.meta?.xrefs ?? []).map((x) => x.val);
    out.push({
      id,
      ontology: prefix,
      name: n.lbl ?? id,
      synonyms: synonyms.length ? synonyms : null,
      parents: parents.get(id) ?? null,
      xrefs: xrefs.length ? xrefs : null,
    });
  }
  return out;
}

interface Annotation {
  diseaseId: string;
  diseaseName: string | null;
  hpoId: string;
  frequency: string;
  onset: string | null;
  source: string | null;
}

/** phenotype.hpoa, line by line, so 34 MB never lands in one string. */
export async function readAnnotations(file: string): Promise<Annotation[]> {
  const out: Annotation[] = [];
  const seen = new Set<string>();
  const lines = createInterface({
    input: createReadStream(file, "utf8"),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line || line.startsWith("#") || line.startsWith("database_id"))
      continue;
    const c = line.split("\t");
    if (c.length < 8 || !c[0] || !c[3]) continue;
    const key = `${c[0]}|${c[3]}|${c[7] ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      diseaseId: c[0]!,
      diseaseName: c[1] || null,
      hpoId: c[3]!,
      // Empty, not null: the unique key is (disease, phenotype, frequency) and
      // Postgres treats two nulls as different, so a null here would let the
      // 63 000 unquantified rows insert themselves again on every run.
      frequency: c[7] || "",
      onset: c[6] || null,
      source: c[4] || null,
    });
  }
  return out;
}

/** 1000 rows per statement: 285 000 single inserts would take an hour. */
async function inChunks<T>(
  rows: T[],
  size: number,
  write: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += size)
    await write(rows.slice(i, i + size));
}

/** How many evidence rows exist right now, so "written" is a real delta. */
async function countEvidence(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(hkbEvidence);
  return row?.n ?? 0;
}

export async function importOntology() {
  const started = Date.now();
  const db = getDb();

  const hpFile = await source(`${OBO}/hp.json`, "hp.json");
  const mondoFile = await source(`${OBO}/mondo.json`, "mondo.json");
  const hpoaFile = await source(
    `${OBO}/hp/hpoa/phenotype.hpoa`,
    "phenotype.hpoa",
  );

  const hp = await readOntology(hpFile, "HP");
  const mondo = await readOntology(mondoFile, "MONDO");
  const annotations = await readAnnotations(hpoaFile);

  await inChunks([...hp, ...mondo], 500, (batch) =>
    db
      .insert(hkbTerms)
      .values(batch)
      .onConflictDoUpdate({
        target: hkbTerms.id,
        set: {
          ontology: sql`excluded.ontology`,
          name: sql`excluded.name`,
          synonyms: sql`excluded.synonyms`,
          parents: sql`excluded.parents`,
          xrefs: sql`excluded.xrefs`,
        },
      }),
  );

  await inChunks(annotations, 1000, (batch) =>
    db
      .insert(hkbAnnotations)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          hkbAnnotations.diseaseId,
          hkbAnnotations.hpoId,
          hkbAnnotations.frequency,
        ],
        set: {
          diseaseName: sql`excluded.disease_name`,
          onset: sql`excluded.onset`,
          source: sql`excluded.source`,
        },
      }),
  );

  const proposed = await proposeEvidence(mondo, annotations);

  const rows = {
    hpo_terms: hp.length,
    mondo_terms: mondo.length,
    annotations: annotations.length,
    proposed_evidence: proposed.written,
    proposals_seen: proposed.proposals,
    proposals_old_rule: proposed.oldRule,
    conditions_touched: proposed.conditions,
  };
  const ms = Date.now() - started;
  if (proposed.written)
    await recordRevision(
      `ontology import: ${proposed.written} new HPOA-derived evidence rows over ` +
        `${proposed.conditions} conditions`,
    );
  await recordRun(
    "hkb-import-ontology",
    rows,
    `${offline() ? "offline fixtures" : "HPO/MONDO/HPOA"}, ${took(ms)}`,
  );
  return { ...rows, ms };
}

/**
 * Every catalog condition with a MONDO id, joined to HPOA through its own
 * xrefs and its subtypes', turned into proposed evidence rows.
 */
async function proposeEvidence(mondo: Term[], annotations: Annotation[]) {
  const db = getDb();
  const conditions = await db
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      mondoId: hkbConditions.mondoId,
    })
    .from(hkbConditions);

  const children = new Map<string, string[]>();
  for (const t of mondo)
    for (const parent of t.parents ?? [])
      children.set(parent, [...(children.get(parent) ?? []), t.id]);

  const nameOf = new Map(mondo.map((t) => [t.id, t.name]));
  const xrefsOf = new Map(mondo.map((t) => [t.id, t.xrefs ?? []]));

  const byDisease = new Map<string, Annotation[]>();
  for (const a of annotations)
    byDisease.set(a.diseaseId, [...(byDisease.get(a.diseaseId) ?? []), a]);

  type Condition = (typeof conditions)[number];

  /**
   * The MONDO terms allowed to speak for a condition: the condition's own
   * term, plus a term one `is_a` step below it whose name still carries the
   * condition's head word. "Congenital hypothyroidism" counts for
   * hypothyroidism; "Bamforth-Lazarus syndrome" does not.
   */
  const speakFor = (c: Condition): string[] => {
    const head = headWord(c.name);
    const out = [c.mondoId!];
    for (const kid of children.get(c.mondoId!) ?? [])
      if (head && (nameOf.get(kid) ?? "").toLowerCase().includes(head))
        out.push(kid);
    return out;
  };

  /** The old rule: the term and everything `is_a` it, three levels down. */
  const family = (c: Condition): string[] => {
    const seen = new Set([c.mondoId!]);
    let frontier = [c.mondoId!];
    for (let d = 0; d < OLD_DEPTH; d++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const kid of children.get(id) ?? [])
          if (!seen.has(kid)) (seen.add(kid), next.push(kid));
      frontier = next;
    }
    return [...seen];
  };

  interface Proposal {
    id: string;
    conditionId: string;
    featureId: string;
    conditionOn: Record<string, unknown>;
    lrPos: number;
    grade: string;
    source: string;
    status: string;
  }

  /** Every proposal a term-picking rule produces, best frequency per key. */
  const collect = (terms: (c: Condition) => string[]) => {
    const best = new Map<string, Proposal & { f: number }>();
    for (const c of conditions) {
      if (!c.mondoId) continue;
      for (const term of terms(c))
        for (const xref of xrefsOf.get(term) ?? []) {
          const diseaseId = xref.replace("Orphanet:", "ORPHA:");
          if (!diseaseId.startsWith("OMIM:") && !diseaseId.startsWith("ORPHA:"))
            continue;
          for (const a of byDisease.get(diseaseId) ?? []) {
            const back = BACKGROUND[a.hpoId];
            if (!back) continue;
            const f = frequencyOf(a.frequency);
            if (f == null || f < FREQUENT) continue;

            const key = `hpoa_${c.id}_${a.hpoId.replace(":", "_")}`;
            const found = best.get(key);
            if (found && found.f >= f) continue;
            best.set(key, {
              f,
              id: key,
              conditionId: c.id,
              featureId: back.featureId,
              conditionOn: back.when,
              lrPos: Math.round((f / back.p) * 100) / 100,
              grade: "C",
              source:
                `HPOA ${diseaseId} "${a.diseaseName ?? ""}" ${a.hpoId} frequency ${a.frequency} ` +
                `(${Math.round(f * 100)} %) \u00f7 background ${back.p} \u2014 ${back.source} ` +
                `Proposed by scripts/hkb-import-ontology.ts; grade C until a human accepts it.`,
              status: "proposed",
            });
          }
        }
    }
    return [...best.values()].map(({ f: _f, ...row }) => row);
  };

  // A proposal that reads the same feature under the same condition as a rule
  // we already wrote by hand is not news. `on conflict do nothing` with no
  // target covers both the id and the (condition, feature, condition_on) key.
  const rows = collect(speakFor);
  const before = await countEvidence();
  await inChunks(rows, 200, (batch) =>
    db.insert(hkbEvidence).values(batch).onConflictDoNothing(),
  );
  const written = (await countEvidence()) - before;

  return {
    written,
    proposals: rows.length,
    oldRule: collect(family).length,
    conditions: new Set(rows.map((r) => r.conditionId)).size,
  };
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
  const { pool } = await import("@/db");
  importOntology()
    .then((r) =>
      console.log(
        `[hkb:import] hpo=${r.hpo_terms} mondo=${r.mondo_terms} ` +
          `annotations=${r.annotations} proposed=${r.proposed_evidence} ` +
          `(of ${r.proposals_seen} candidates; the old three-level walk would ` +
          `have proposed ${r.proposals_old_rule}) ` +
          `over ${r.conditions_touched} conditions in ${took(r.ms)}`,
      ),
    )
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
