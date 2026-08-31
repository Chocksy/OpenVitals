/**
 * Ring 2: every MONDO disease that HPOA has phenotype annotations for, as a
 * dormant `hkb_conditions` row with a rarity-class prior and nothing else.
 *
 *   pnpm --filter simple hkb:ring2:build
 *   pnpm --filter simple hkb:ring2:build --offline   # fixtures, no download
 *
 * A ring-2 row is not scored for anybody. It carries a name, a MONDO id, a
 * base rate and `in_catalog = false`, so `wakeConditions` has something to
 * point at when a ferritin of 1200 or a typed question says "look at this
 * one". Evidence rows, lens weights and discriminators are generated at wake
 * time, per person, and never before: ten thousand diseases times ten rules
 * each would be a hundred thousand likelihood ratios nobody asked for.
 *
 * Sources:
 *   phenotype.hpoa (already imported by `hkb:import`) says which diseases have
 *   phenotypes at all, joined to MONDO through each term's OMIM and Orphanet
 *   xrefs — the same join `hkb-import-ontology.ts` uses.
 *
 *   https://www.orphadata.com/data/xml/en_product9_prev.xml  16 MB, CC-BY-4.0
 *   gives the prevalence class, which is the only published number behind any
 *   of these priors. Everything without one falls back to the rule in
 *   `lib/rings.ts`, and says so in `hkb_priors.source`.
 *
 * Idempotent: every write is an upsert keyed on the condition id, and a MONDO
 * term that is already a ring-1 catalog condition is skipped, so a re-run
 * never demotes anything.
 */
import { readFile } from "node:fs/promises";
import { asc, eq, sql } from "drizzle-orm";
import {
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbPriors,
  hkbTerms,
} from "@/db";
import { offline, recordRun, source, took } from "@/lib/hkb-import";
import { recordRevision } from "@/lib/hkb";
import {
  RARITY_PRIOR,
  RARITY_SOURCE,
  rarityOf,
  ring2Id,
  type Rarity,
} from "@/lib/rings";

const ORPHANET_PREVALENCE =
  "https://www.orphadata.com/data/xml/en_product9_prev.xml";

/* ── the Orphanet prevalence file ─────────────────────────────────────── */

/**
 * `ORPHA:558` → the best validated point-prevalence class Orphanet publishes
 * for it, or nothing.
 *
 * ponytail: a regex walk, not an XML parser. The file is one flat
 * `<Disorder>` list with no namespaces, no attributes we read and no nesting
 * past two levels, so a dependency would buy nothing. "Best" means the most
 * common class, which is the conservative choice: a disease we place one band
 * too common only starts a little higher than it should, while one placed too
 * rare can never be woken at all.
 */
export function parseOrphanetPrevalence(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  const disorders = xml.matchAll(/<Disorder\b[^>]*>([\s\S]*?)<\/Disorder>/g);
  for (const [, body] of disorders) {
    const code = body!.match(/<OrphaCode>(\d+)<\/OrphaCode>/)?.[1];
    if (!code) continue;
    let best: string | null = null;
    let bestRank = -1;
    for (const [, entry] of body!.matchAll(
      /<Prevalence\b[^>]*>([\s\S]*?)<\/Prevalence>/g,
    )) {
      if (
        !/<PrevalenceType\b[^>]*>\s*<Name[^>]*>Point prevalence</.test(entry!)
      )
        continue;
      if (
        !/<PrevalenceValidationStatus\b[^>]*>\s*<Name[^>]*>Validated</.test(
          entry!,
        )
      )
        continue;
      const klass = entry!.match(
        /<PrevalenceClass\b[^>]*>\s*<Name[^>]*>([^<]+)<\/Name>/,
      )?.[1];
      if (!klass) continue;
      const rank = CLASS_RANK.indexOf(
        klass.replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(),
      );
      if (rank > bestRank) ((bestRank = rank), (best = klass));
    }
    if (best)
      out.set(
        `ORPHA:${code}`,
        best.replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(),
      );
  }
  return out;
}

/** Rarest first, so a higher index is a commoner disease. */
const CLASS_RANK = [
  "<1 / 1 000 000",
  "1-9 / 1 000 000",
  "1-9 / 100 000",
  "1-5 / 10 000",
  "6-9 / 10 000",
  ">1 / 1000",
];

/* ── the build ────────────────────────────────────────────────────────── */

export interface Ring2Row {
  id: string;
  mondoId: string;
  name: string;
  rarity: Rarity;
  prevalence: number;
  /** The disease ids in HPOA this MONDO term joins to. */
  diseaseIds: string[];
}

/**
 * Which MONDO terms become ring-2 rows, and with what prior. Pure, so the
 * whole rule is testable with four terms and two annotations.
 */
export function ring2Rows(
  terms: { id: string; name: string; xrefs: string[] | null }[],
  annotated: Set<string>,
  prevalenceClass: Map<string, string>,
  taken: Set<string>,
): Ring2Row[] {
  const out: Ring2Row[] = [];
  for (const t of terms) {
    if (taken.has(t.id.toUpperCase())) continue;
    const ids = (t.xrefs ?? [])
      .map((x) => x.replace("Orphanet:", "ORPHA:"))
      .filter((x) => x.startsWith("OMIM:") || x.startsWith("ORPHA:"));
    const hits = ids.filter((x) => annotated.has(x));
    if (!hits.length) continue;

    const orpha = ids.filter((x) => x.startsWith("ORPHA:"));
    const klass = orpha
      .map((x) => prevalenceClass.get(x))
      .find((c): c is string => !!c);
    const rarity = rarityOf(klass, orpha.length > 0);
    out.push({
      id: ring2Id(t.id),
      mondoId: t.id,
      name: t.name,
      rarity,
      prevalence: RARITY_PRIOR[rarity],
      diseaseIds: hits,
    });
  }
  return out;
}

const SUMMARY = (name: string) =>
  `${name}. Ring 2: known to the engine by name and base rate, not scored for anybody until something in one person's data points at it.`;

const MANAGEMENT =
  "Nothing here is a plan. A ring-2 disease is woken by one finding, scored against its own HPO phenotype frequencies, and either climbs on its own discriminators or goes back to sleep. A rare-disease diagnosis is made by a clinician, not by this page.";

/** 500 rows per statement; ten thousand single inserts would take minutes. */
async function inChunks<T>(
  rows: T[],
  size: number,
  write: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += size)
    await write(rows.slice(i, i + size));
}

export async function buildRing2() {
  const started = Date.now();
  const db = getDb();

  const prevalenceFile = await source(
    ORPHANET_PREVALENCE,
    "en_product9_prev.xml",
  );
  const prevalenceClass = parseOrphanetPrevalence(
    await readFile(prevalenceFile, "utf8"),
  );

  const [terms, annotated, existing] = await Promise.all([
    db
      .select({
        id: hkbTerms.id,
        name: hkbTerms.name,
        xrefs: hkbTerms.xrefs,
      })
      .from(hkbTerms)
      .where(eq(hkbTerms.ontology, "MONDO"))
      .orderBy(asc(hkbTerms.id)),
    db
      .selectDistinct({ diseaseId: hkbAnnotations.diseaseId })
      .from(hkbAnnotations),
    db
      .select({ id: hkbConditions.id, mondoId: hkbConditions.mondoId })
      .from(hkbConditions)
      .where(eq(hkbConditions.ring, 1)),
  ]);

  const rows = ring2Rows(
    terms,
    new Set(annotated.map((a) => a.diseaseId)),
    prevalenceClass,
    new Set(
      existing.flatMap((c) => (c.mondoId ? [c.mondoId.toUpperCase()] : [])),
    ),
  );

  const before = await countRing2();
  await inChunks(rows, 500, (batch) =>
    db
      .insert(hkbConditions)
      .values(
        batch.map((r) => ({
          id: r.id,
          name: r.name,
          summary: SUMMARY(r.name),
          management: MANAGEMENT,
          mondoId: r.mondoId,
          why: `Reachable because HPOA carries phenotype annotations for ${r.diseaseIds.slice(0, 3).join(", ")}. Rarity class ${r.rarity}.`,
          inCatalog: false,
          ring: 2,
          lenses: {},
        })),
      )
      .onConflictDoUpdate({
        target: hkbConditions.id,
        set: {
          name: sql`excluded.name`,
          summary: sql`excluded.summary`,
          why: sql`excluded.why`,
          ring: sql`excluded.ring`,
        },
      }),
  );

  await inChunks(rows, 500, (batch) =>
    db
      .insert(hkbPriors)
      .values(
        batch.map((r) => ({
          conditionId: r.id,
          country: null,
          sex: null,
          ageMin: null,
          ageMax: null,
          prevalence: r.prevalence,
          source: RARITY_SOURCE[r.rarity],
        })),
      )
      .onConflictDoUpdate({
        target: [
          hkbPriors.conditionId,
          hkbPriors.country,
          hkbPriors.sex,
          hkbPriors.ageMin,
          hkbPriors.ageMax,
        ],
        set: {
          prevalence: sql`excluded.prevalence`,
          source: sql`excluded.source`,
        },
      }),
  );

  const byClass: Record<Rarity, number> = {
    common: 0,
    rare: 0,
    ultra_rare: 0,
  };
  for (const r of rows) byClass[r.rarity]++;

  const counts = {
    mondo_terms: terms.length,
    ring2_rows: rows.length,
    ring2_new: (await countRing2()) - before,
    orphanet_classes: prevalenceClass.size,
    with_orphanet_class: rows.filter((r) =>
      r.diseaseIds.some((d) => prevalenceClass.has(d)),
    ).length,
    common: byClass.common,
    rare: byClass.rare,
    ultra_rare: byClass.ultra_rare,
  };
  const ms = Date.now() - started;
  await recordRun(
    "hkb-ring2-build",
    counts,
    `${offline() ? "offline fixtures" : "MONDO xrefs x HPOA + Orphanet prevalence"}, ${took(ms)}`,
  );
  await recordRevision(
    `ring 2 built: ${counts.ring2_rows} dormant diseases ` +
      `(common ${counts.common}, rare ${counts.rare}, ultra-rare ${counts.ultra_rare}), ` +
      `${counts.with_orphanet_class} with a published Orphanet prevalence class`,
  );
  return { ...counts, ms };
}

async function countRing2(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(hkbConditions)
    .where(eq(hkbConditions.ring, 2));
  return row?.n ?? 0;
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
  buildRing2()
    .then((r) =>
      console.log(
        `[hkb:ring2] ${r.ring2_rows} ring-2 diseases (${r.ring2_new} new) out of ` +
          `${r.mondo_terms} MONDO terms: common ${r.common}, rare ${r.rare}, ` +
          `ultra-rare ${r.ultra_rare}; ${r.with_orphanet_class} carried an ` +
          `Orphanet prevalence class of the ${r.orphanet_classes} published, in ${took(r.ms)}`,
      ),
    )
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
