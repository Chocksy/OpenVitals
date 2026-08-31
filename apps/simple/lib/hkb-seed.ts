/**
 * The in-code catalog as rows, and the rows into Postgres.
 *
 *   pnpm --filter simple hkb:seed
 *
 * `catalogRows` is pure, so `lib/hkb.test.ts` can seed and read back with no
 * database at all. `seedHkb` is the write half: one upsert per row, keyed on
 * something stable, so running it twice changes nothing. Nothing here ever
 * deletes: a row that leaves the code stays in the table until a human drops
 * it.
 */
import {
  getDb,
  hkbConditionTests,
  hkbConditions,
  hkbEvidence,
  hkbFeatures,
  hkbPriorModifiers,
  hkbPriors,
  hkbTests,
} from "@/db";
import { GENOME_CATALOG } from "./genome-catalog";
import { CATALOG } from "./hkb-catalog";
import {
  featureIdOf,
  recordRevision,
  type CatalogRows,
  type FeatureRow,
} from "./hkb";
import {
  correlationGroupOf,
  HYPOTHESES,
  type Catalog,
  type Discriminator,
  type EvidenceRule,
} from "./hypotheses";
import { SYMPTOM_KEYS, symptomByKey } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";

/** "OGTT with insulin" → "ogtt_with_insulin". Stable, so re-seeds update. */
export const testId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** "transferrin_saturation" → "Transferrin saturation". */
const humanise = (code: string) =>
  code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const KIND: Record<string, string> = {
  metric: "lab",
  derived: "derived",
  fact: "fact",
  event: "event",
  hypothesis: "hypothesis",
};

const INPUT_KEYS = [
  "metric",
  "derived",
  "fact",
  "event",
  "hypothesis",
] as const;

/** A modifier reads a feature, or it only reads who the person is. */
function modifierFeature(when: Record<string, unknown>): string {
  const input = Object.fromEntries(
    INPUT_KEYS.filter((k) => when[k] != null).map((k) => [k, when[k]]),
  ) as EvidenceRule["input"];
  if (Object.keys(input).length) return featureIdOf(input);
  // ponytail: "five times more common in women" reads the sex answer, so that
  // is the feature. Age-only modifiers read the birth year the same way.
  return when.sex != null ? "fact:sex" : "fact:birth_year";
}

const conditionOnOf = (when: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(when).filter(
      ([k, v]) => v != null && !INPUT_KEYS.includes(k as "fact"),
    ),
  );

/** The grade a modifier's reason ends with, e.g. "... doubles the risk (A)." */
const gradeInWhy = (why: string) => why.match(/\(([ABCD])[,)]/)?.[1] ?? null;

/** Every hypothesis, condition by condition, as the seven tables. */
export function catalogRows(catalog: Catalog = HYPOTHESES): CatalogRows {
  const features = new Map<string, FeatureRow>();
  const feature = (id: string, extra: Partial<FeatureRow> = {}) => {
    const kind = id.split(":")[0]!;
    const name = id.slice(kind.length + 1);
    const symptom = kind === "fact" && SYMPTOM_KEYS.has(name);
    // A rule that reads a `genome:` answer reads a genotype, not an answer.
    const gene = GENOME_CATALOG.find((r) => r.factKey === name);
    const found = features.get(id) ?? {
      id,
      kind: gene ? "genetic" : symptom ? "symptom" : (KIND[kind] ?? kind),
      name: gene
        ? gene.gene
        : symptom
          ? symptomByKey(name)!.name
          : kind === "hypothesis"
            ? name
            : humanise(name),
      unit: null,
      howTo: gene
        ? gene.why
        : kind === "fact"
          ? (PROFILE_QUESTIONS[name]?.question ?? null)
          : null,
    };
    features.set(id, { ...found, ...extra, unit: extra.unit ?? found.unit });
    return id;
  };

  const rows: CatalogRows = {
    conditions: [],
    features: [],
    priors: [],
    modifiers: [],
    evidence: [],
    tests: [],
    links: [],
  };

  const tests = new Map<string, CatalogRows["tests"][number]>();

  for (const h of catalog) {
    rows.conditions.push({
      id: h.id,
      name: h.name,
      summary: h.summary,
      management: h.management,
      parentId: h.parentId ?? null,
      mondoId: h.mondoId ?? null,
      why: h.why ?? null,
      burdenDaly: h.burdenDaly ?? null,
      inCatalog: true,
      lenses: h.lenses as CatalogRows["conditions"][number]["lenses"],
      appliesTo: h.appliesTo ?? null,
      requires: h.requires
        ? { condition: h.requires.id, minState: h.requires.minScore }
        : null,
      confirmAtLrPos: h.confirmAtLrPos ?? null,
      patternId: h.patternId ?? null,
    });

    rows.priors.push({
      conditionId: h.id,
      country: null,
      sex: null,
      ageMin: null,
      ageMax: null,
      prevalence: h.priors.base,
      source: h.priors.source ?? "seed",
    });

    for (const b of h.priors.bands ?? [])
      rows.priors.push({ conditionId: h.id, ...b });

    for (const m of h.priors.modifiers) {
      const when = m.when as Record<string, unknown>;
      rows.modifiers.push({
        conditionId: h.id,
        featureId: feature(modifierFeature(when)),
        conditionOn: conditionOnOf(when),
        times: m.times,
        why: m.why,
        grade: m.grade ?? gradeInWhy(m.why),
        source: m.source ?? null,
      });
    }

    for (const e of h.evidence)
      rows.evidence.push({
        id: e.id,
        conditionId: h.id,
        featureId: feature(featureIdOf(e.input)),
        conditionOn: e.when as Record<string, unknown>,
        lrPos: e.lr,
        lrNeg: e.lrNeg ?? null,
        grade: e.grade,
        source: e.source,
        population: null,
        confoundedBy: e.confoundedBy ?? null,
        correlationGroup:
          e.correlationGroup ?? correlationGroupOf(e.input) ?? null,
        status: "seed",
      });

    for (const d of h.discriminators) {
      const id = testId(d.test);
      for (const code of d.codes)
        feature(`metric:${code}`, d.unit ? { unit: d.unit } : {});
      tests.set(id, testRow(id, d));
      rows.links.push({ conditionId: h.id, testId: id });
    }
  }

  // Every catalog SNP is a feature in its own right, whether or not a rule
  // reads it: the genome page prints the whole table, including the rows that
  // only write a profile fact.
  for (const row of GENOME_CATALOG)
    for (const rsid of row.rsids)
      feature(`snp:${rsid}`, {
        kind: "genetic",
        name: `${row.gene} ${rsid}`,
        howTo: row.why,
      });

  rows.tests = [...tests.values()];
  rows.features = [...features.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return rows;
}

function testRow(id: string, d: Discriminator): CatalogRows["tests"][number] {
  const first = d.codes[0]!;
  return {
    id,
    name: d.test,
    featureIds: d.codes,
    cost: d.cost,
    costByCountry: d.costByCountry ?? null,
    invasiveness: null,
    lrPos: d.lrPos,
    lrNeg: d.lrNeg,
    typicalPos: d.typicalPos != null ? { [first]: d.typicalPos } : null,
    typicalNeg: d.typicalNeg != null ? { [first]: d.typicalNeg } : null,
    repeatable: d.repeatable ?? false,
    howTo: d.howTo ?? null,
  };
}

/* ── the write ────────────────────────────────────────────────────────── */

/**
 * Upsert every row. `updated_at` is left alone on purpose, so a second run is
 * a true no-op and the "nothing changed" check is a checksum, not a diff.
 */
export async function seedHkb(catalog: Catalog = CATALOG) {
  const rows = catalogRows(catalog);
  const db = getDb();

  for (const c of rows.conditions)
    await db
      .insert(hkbConditions)
      .values(c)
      .onConflictDoUpdate({ target: hkbConditions.id, set: withoutId(c) });

  for (const f of rows.features)
    await db
      .insert(hkbFeatures)
      .values(f)
      .onConflictDoUpdate({ target: hkbFeatures.id, set: withoutId(f) });

  // `cost_by_country` is written by the price importer, never by the seed, so
  // it is left out of the update set: a re-seed must not wipe the prices.
  for (const t of rows.tests) {
    const { id, costByCountry, ...set } = t;
    await db
      .insert(hkbTests)
      .values(t)
      .onConflictDoUpdate({ target: hkbTests.id, set });
  }

  for (const p of rows.priors)
    await db
      .insert(hkbPriors)
      .values(p)
      .onConflictDoUpdate({
        target: [
          hkbPriors.conditionId,
          hkbPriors.country,
          hkbPriors.sex,
          hkbPriors.ageMin,
          hkbPriors.ageMax,
        ],
        set: { prevalence: p.prevalence, source: p.source },
      });

  for (const m of rows.modifiers)
    await db
      .insert(hkbPriorModifiers)
      .values(m)
      .onConflictDoUpdate({
        target: [
          hkbPriorModifiers.conditionId,
          hkbPriorModifiers.featureId,
          hkbPriorModifiers.conditionOn,
        ],
        set: { times: m.times, why: m.why, grade: m.grade, source: m.source },
      });

  for (const e of rows.evidence)
    await db
      .insert(hkbEvidence)
      .values(e)
      .onConflictDoUpdate({ target: hkbEvidence.id, set: withoutId(e) });

  for (const l of rows.links)
    await db.insert(hkbConditionTests).values(l).onConflictDoNothing();

  await recordRevision(
    `seed: ${rows.conditions.length} conditions, ${rows.evidence.length} evidence rows, ` +
      `${rows.priors.length} priors, ${rows.tests.length} tests`,
  );

  return {
    conditions: rows.conditions.length,
    features: rows.features.length,
    priors: rows.priors.length,
    modifiers: rows.modifiers.length,
    evidence: rows.evidence.length,
    tests: rows.tests.length,
    links: rows.links.length,
  };
}

const withoutId = <T extends { id: string }>({ id, ...rest }: T) => rest;

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
  seedHkb()
    .then((n) =>
      console.log(
        `[hkb:seed] conditions=${n.conditions} features=${n.features} tests=${n.tests} ` +
          `priors=${n.priors} modifiers=${n.modifiers} evidence=${n.evidence} links=${n.links}`,
      ),
    )
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
