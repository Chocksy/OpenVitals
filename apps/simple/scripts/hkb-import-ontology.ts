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
 * The mapping to our catalog, and the one place it departs from the spec:
 *
 *   For every `hkb_conditions` row with a MONDO id, the spec joins HPOA
 *   through that term's OMIM and Orphanet xrefs. Measured against the real
 *   files that join returns 59 annotation rows across the whole catalog and
 *   *none* of them carries a frequency: HPOA quantifies Orphanet rare-disease
 *   entries, and common adult conditions map to OMIM entries curated without
 *   frequencies. So the join also walks MONDO's `is_a` graph three levels down
 *   and uses the subtypes' xrefs, which is where the frequencies live. A
 *   phenotype that is frequent in a subtype is real evidence about the parent
 *   and a weaker claim than the subtype's own, which is exactly why every row
 *   lands as `status = "proposed"`, `grade = "C"`, for a human to accept on
 *   /hkb before it can score.
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
import { offline, recordRun, source, took } from "@/lib/hkb-import";

const OBO = "https://purl.obolibrary.org/obo";

/**
 * How common each phenotype is in the general adult population, so a frequency
 * inside a disease becomes a likelihood ratio. Only phenotypes on this list
 * produce evidence rows: without a background rate there is no ratio to
 * compute, and without one of our own features there is nothing to attach it
 * to.
 */
export const BACKGROUND: Record<
  string,
  {
    /** the `hkb_features` row the rule reads */
    featureId: string;
    /** the answer that counts as present */
    when: Record<string, unknown>;
    /** prevalence in adults */
    p: number;
    source: string;
  }
> = {
  "HP:0012378": {
    featureId: "fact:sym_energy",
    when: { equals: "Yes" },
    p: 0.2,
    source:
      "Fatigue lasting over a month is reported by about 20 % of adults in primary-care surveys (Cullen 2002 Ir J Med Sci; Watanabe 2008).",
  },
  "HP:0002019": {
    featureId: "fact:sym_bowel",
    when: { equals: "Constipation" },
    p: 0.15,
    source:
      "Suares 2011 Am J Gastroenterol: pooled global prevalence of chronic constipation in adults 14 %.",
  },
  "HP:0002028": {
    featureId: "fact:sym_bowel",
    when: { equals: "Diarrhoea and bloating" },
    p: 0.05,
    source:
      "Sperber 2021 Gastroenterology (Rome Foundation global study): diarrhoea-predominant functional bowel disorders in about 5 % of adults.",
  },
  "HP:0001824": {
    featureId: "fact:sym_weight",
    when: { equals: "Lost" },
    p: 0.05,
    source:
      "Wong 2021 J Gen Intern Med: unintentional weight loss in about 5 % of community-dwelling adults per year.",
  },
  "HP:0004324": {
    featureId: "fact:sym_weight",
    when: { equals: "Gained" },
    p: 0.2,
    source:
      "Hutfless 2013 (NHANES): about a fifth of adults report gaining more than 3 kg over a year.",
  },
  "HP:0001596": {
    featureId: "fact:sym_hair_skin",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Gan 2005 J Investig Dermatol Symp Proc: clinically significant hair loss in about 10 % of adult women; dry skin is on the same question.",
  },
  "HP:0000958": {
    featureId: "fact:sym_hair_skin",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Paul 2011 J Eur Acad Dermatol: xerosis in about 10 % of adults outside the elderly, where it is far commoner.",
  },
  "HP:0000821": {
    featureId: "fact:sym_cold",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Grade C: cold intolerance is one of the twelve Zulewski 1997 signs and is reported by roughly a tenth of euthyroid adults in those series; no population survey measures it directly.",
  },
  "HP:0001959": {
    featureId: "fact:sym_thirst",
    when: { equals: "Yes" },
    p: 0.03,
    source:
      "ADA Standards of Care: polydipsia is uncommon outside hyperglycaemia; 3 % is the honest background for an adult questionnaire (grade C for the number).",
  },
  "HP:0000103": {
    featureId: "fact:sym_thirst",
    when: { equals: "Yes" },
    p: 0.03,
    source:
      "ADA Standards of Care: polyuria travels with polydipsia and is asked as the same question here.",
  },
  "HP:0002829": {
    featureId: "fact:sym_joint",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Grade C: an episode of acute monoarthritis is reported by about a tenth of adults; the gout-specific figure is far lower (Janssens 2010 Arch Intern Med).",
  },
  "HP:0001369": {
    featureId: "fact:sym_joint",
    when: { equals: "Yes" },
    p: 0.1,
    source: "Same question as acute arthralgia; see HP:0002829.",
  },
  "HP:0000716": {
    featureId: "fact:sym_phq2_down",
    when: { includes: "more than half|nearly every day" },
    p: 0.08,
    source:
      "Kroenke 2003 Med Care: a positive PHQ-2 item in about 8 % of a primary-care population.",
  },
  "HP:0000141": {
    featureId: "fact:sym_cycle",
    when: { equals: "Absent" },
    p: 0.04,
    source:
      "Teede 2023 PCOS guideline: secondary amenorrhoea in 3–5 % of women of reproductive age.",
  },
  "HP:0000876": {
    featureId: "fact:sym_cycle",
    when: { equals: "Irregular" },
    p: 0.15,
    source:
      "Teede 2023 PCOS guideline: irregular cycles in about 15 % of women of reproductive age.",
  },
  "HP:0000858": {
    featureId: "fact:sym_cycle",
    when: { equals: "Irregular" },
    p: 0.15,
    source: "Same question as oligomenorrhoea; see HP:0000876.",
  },
  "HP:0000823": {
    featureId: "fact:sym_cycle",
    when: { equals: "Heavy" },
    p: 0.2,
    source:
      "Munro 2018 Int J Gynaecol Obstet: heavy menstrual bleeding reported by about a fifth of premenopausal women.",
  },
  "HP:0002189": {
    featureId: "fact:sym_sleepiness",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Young 2002 Am J Respir Crit Care Med: excessive daytime sleepiness in about 10 % of adults.",
  },
  "HP:0100786": {
    featureId: "fact:sym_sleepiness",
    when: { equals: "Yes" },
    p: 0.1,
    source: "Same question as excessive somnolence; see HP:0002189.",
  },
  "HP:0010535": {
    featureId: "fact:sleep_snoring",
    when: { equals: "Most nights" },
    p: 0.2,
    source:
      "Peppard 2013 Am J Epidemiol: habitual snoring in roughly a fifth of adults aged 30–70.",
  },
};

/** HPO's frequency terms as one number each, at the middle of their band. */
const BANDS: Record<string, number> = {
  "HP:0040280": 1, // obligate, 100 %
  "HP:0040281": 0.895, // very frequent, 80–99 %
  "HP:0040282": 0.545, // frequent, 30–79 %
  "HP:0040283": 0.17, // occasional, 5–29 %
  "HP:0040284": 0.025, // very rare, 1–4 %
  "HP:0040285": 0, // excluded
};

/** "HP:0040282", "12/25" and "30%" as one number. Null when it says nothing. */
export function frequencyOf(raw: string | undefined): number | null {
  if (!raw) return null;
  if (raw in BANDS) return BANDS[raw]!;
  if (raw.endsWith("%")) {
    const v = Number(raw.slice(0, -1));
    return Number.isFinite(v) ? v / 100 : null;
  }
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!fraction) return null;
  const [, a, b] = fraction;
  return Number(b) > 0 ? Number(a) / Number(b) : null;
}

/** "frequent" and above. Below that the phenotype argues nothing useful. */
const FREQUENT = 0.3;

/** How far down MONDO's `is_a` graph a subtype still counts as the parent. */
const DEPTH = 3;

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
export async function readOntology(file: string, prefix: string): Promise<Term[]> {
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
    conditions_touched: proposed.conditions,
  };
  const ms = Date.now() - started;
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
    .select({ id: hkbConditions.id, mondoId: hkbConditions.mondoId })
    .from(hkbConditions);

  const children = new Map<string, string[]>();
  for (const t of mondo)
    for (const parent of t.parents ?? [])
      children.set(parent, [...(children.get(parent) ?? []), t.id]);

  const xrefsOf = new Map(mondo.map((t) => [t.id, t.xrefs ?? []]));

  const byDisease = new Map<string, Annotation[]>();
  for (const a of annotations)
    byDisease.set(a.diseaseId, [...(byDisease.get(a.diseaseId) ?? []), a]);

  /** The term and everything `is_a` it, three levels down. */
  const family = (root: string) => {
    const seen = new Set([root]);
    let frontier = [root];
    for (let d = 0; d < DEPTH; d++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const kid of children.get(id) ?? [])
          if (!seen.has(kid)) (seen.add(kid), next.push(kid));
      frontier = next;
    }
    return seen;
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
  const best = new Map<string, Proposal & { f: number }>();

  for (const c of conditions) {
    if (!c.mondoId) continue;
    for (const term of family(c.mondoId))
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
              `(${Math.round(f * 100)} %) ÷ background ${back.p} — ${back.source} ` +
              `Proposed by scripts/hkb-import-ontology.ts; grade C until a human accepts it.`,
            status: "proposed",
          });
        }
      }
  }

  // A proposal that reads the same feature under the same condition as a rule
  // we already wrote by hand is not news. `on conflict do nothing` with no
  // target covers both the id and the (condition, feature, condition_on) key.
  const rows = [...best.values()].map(({ f: _f, ...row }) => row);
  const before = await countEvidence();
  await inChunks(rows, 200, (batch) =>
    db.insert(hkbEvidence).values(batch).onConflictDoNothing(),
  );
  const written = (await countEvidence()) - before;

  return {
    written,
    proposals: rows.length,
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
          `(of ${r.proposals_seen} candidates) ` +
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
