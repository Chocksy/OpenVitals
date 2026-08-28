/**
 * The hypothesis knowledge base as rows, and the rows back as the catalog the
 * engine already eats.
 *
 * `rowsToCatalog` is pure, so the whole database shape is testable offline and
 * the round trip against `HYPOTHESES` is one assertion. `loadCatalog` is the
 * only thing here that touches Postgres: it reads the seven `hkb_*` tables,
 * caches the answer for a minute, and falls back to the in-code catalog when
 * there is no database or the tables are still empty. The engine itself never
 * learns any of this happened.
 */
import { asc } from "drizzle-orm";
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
import {
  HYPOTHESES,
  type Catalog,
  type Discriminator,
  type EvidenceRule,
  type Grade,
  type Hypothesis,
} from "./hypotheses";

/* ── the rows ─────────────────────────────────────────────────────────── */

export interface ConditionRow {
  id: string;
  name: string;
  summary: string;
  management: string;
  parentId: string | null;
  burdenDaly: number | null;
  inCatalog: boolean;
  lenses: Record<string, { w: number; grade: string }>;
  appliesTo: { sex?: string; minAge?: number; maxAge?: number } | null;
  requires: { condition: string; minState: number } | null;
  confirmAtLrPos: number | null;
  patternId: string | null;
}

export interface FeatureRow {
  id: string;
  kind: string;
  name: string;
  unit: string | null;
  howTo: string | null;
}

export interface PriorRow {
  conditionId: string;
  country: string | null;
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  prevalence: number;
  source: string;
}

export interface ModifierRow {
  conditionId: string;
  featureId: string;
  conditionOn: Record<string, unknown>;
  times: number;
  why: string;
  grade: string | null;
  source: string | null;
}

export interface EvidenceRow {
  id: string;
  conditionId: string;
  featureId: string;
  conditionOn: Record<string, unknown>;
  lrPos: number;
  lrNeg: number | null;
  grade: string;
  source: string;
  population: string | null;
  confoundedBy: string[] | null;
  status: string;
}

export interface TestRow {
  id: string;
  name: string;
  featureIds: string[];
  cost: number;
  costByCountry: Record<string, number> | null;
  invasiveness: number | null;
  lrPos: number;
  lrNeg: number;
  typicalPos: Record<string, number> | null;
  typicalNeg: Record<string, number> | null;
  repeatable: boolean;
  howTo: string | null;
}

export interface CatalogRows {
  conditions: ConditionRow[];
  features: FeatureRow[];
  priors: PriorRow[];
  modifiers: ModifierRow[];
  evidence: EvidenceRow[];
  tests: TestRow[];
  links: { conditionId: string; testId: string }[];
}

/* ── rows → catalog ───────────────────────────────────────────────────── */

/** Keys that read a value. Anything else in `condition_on` is demographics. */
const VALUE_KEYS = [
  "above",
  "below",
  "equals",
  "includes",
  "status",
  "aboveOptimal",
  "belowOptimal",
];

/** `metric:ferritin` → `{ metric: "ferritin" }`. */
function featureInput(featureId: string): EvidenceRule["input"] {
  const [kind, ...rest] = featureId.split(":");
  const name = rest.join(":");
  if (kind === "metric") return { metric: name };
  if (kind === "derived")
    return { derived: name as EvidenceRule["input"]["derived"] };
  if (kind === "event") return { event: name };
  if (kind === "hypothesis") return { hypothesis: name };
  return { fact: name };
}

/**
 * ponytail: a condition that reads another condition's probability has to be
 * scored after it, and nothing else about the order matters. So: ids in
 * alphabetical order, then anything that depends on a later id moved down.
 */
function inDependencyOrder(
  rows: ConditionRow[],
  evidence: EvidenceRow[],
): ConditionRow[] {
  const needs = new Map<string, Set<string>>();
  for (const c of rows)
    needs.set(c.id, new Set(c.requires ? [c.requires.condition] : []));
  for (const e of evidence)
    if (e.featureId.startsWith("hypothesis:"))
      needs.get(e.conditionId)?.add(e.featureId.slice("hypothesis:".length));

  const out: ConditionRow[] = [];
  const done = new Set<string>();
  const queue = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  while (queue.length) {
    const ready = queue.findIndex((c) =>
      [...(needs.get(c.id) ?? [])].every(
        (id) => done.has(id) || !rows.some((r) => r.id === id),
      ),
    );
    // A cycle would leave nothing ready; take the head so the loop still ends.
    const [next] = queue.splice(ready === -1 ? 0 : ready, 1);
    out.push(next!);
    done.add(next!.id);
  }
  return out;
}

/** The seven tables back into the eight (or eighty) hypotheses. */
export function rowsToCatalog(rows: CatalogRows): Catalog {
  const units = new Map(rows.features.map((f) => [f.id, f.unit]));
  const testsById = new Map(rows.tests.map((t) => [t.id, t]));

  const whenOf = (featureId: string, on: Record<string, unknown>) => {
    const reads = VALUE_KEYS.some((k) => k in on);
    return {
      ...(reads ? featureInput(featureId) : {}),
      ...on,
    } as EvidenceRule["when"] & EvidenceRule["input"];
  };

  return inDependencyOrder(
    rows.conditions.filter((c) => c.inCatalog),
    rows.evidence,
  ).map((c): Hypothesis => {
    const prior =
      rows.priors.find(
        (p) =>
          p.conditionId === c.id &&
          !p.country &&
          !p.sex &&
          p.ageMin == null &&
          p.ageMax == null,
      ) ?? rows.priors.find((p) => p.conditionId === c.id);

    const evidence: EvidenceRule[] = rows.evidence
      .filter((e) => e.conditionId === c.id && e.status !== "rejected")
      .map((e) => ({
        id: e.id,
        input: featureInput(e.featureId),
        when: e.conditionOn as EvidenceRule["when"],
        lr: e.lrPos,
        lrNeg: e.lrNeg ?? undefined,
        grade: e.grade as Grade,
        source: e.source,
        confoundedBy: e.confoundedBy ?? undefined,
      }));

    const discriminators: Discriminator[] = rows.links
      .filter((l) => l.conditionId === c.id)
      .map((l) => testsById.get(l.testId))
      .filter((t): t is TestRow => !!t)
      .map((t) => {
        const first = t.featureIds[0]!;
        return {
          test: t.name,
          codes: t.featureIds,
          cost: t.cost as Discriminator["cost"],
          lrPos: t.lrPos,
          lrNeg: t.lrNeg,
          howTo: t.howTo ?? undefined,
          typicalPos: t.typicalPos?.[first] ?? undefined,
          typicalNeg: t.typicalNeg?.[first] ?? undefined,
          unit: units.get(`metric:${first}`) ?? undefined,
          repeatable: t.repeatable || undefined,
        };
      });

    return {
      id: c.id,
      name: c.name,
      summary: c.summary,
      management: c.management,
      priors: {
        base: prior?.prevalence ?? 0.01,
        source: prior?.source,
        modifiers: rows.modifiers
          .filter((m) => m.conditionId === c.id)
          .map((m) => ({
            when: whenOf(m.featureId, m.conditionOn),
            times: m.times,
            why: m.why,
          })),
      },
      evidence,
      discriminators,
      lenses: c.lenses as Hypothesis["lenses"],
      appliesTo: (c.appliesTo as Hypothesis["appliesTo"]) ?? undefined,
      requires: c.requires
        ? { id: c.requires.condition, minScore: c.requires.minState }
        : undefined,
      confirmAtLrPos: c.confirmAtLrPos ?? undefined,
      patternId: c.patternId ?? undefined,
      burdenDaly: c.burdenDaly ?? undefined,
    };
  });
}

/* ── the database read ────────────────────────────────────────────────── */

const TTL = 60_000;
let cache: { at: number; catalog: Catalog } | null = null;

async function readRows(): Promise<CatalogRows | null> {
  const db = getDb();
  const [conditions, features, priors, modifiers, evidence, tests, links] =
    await Promise.all([
      db.select().from(hkbConditions).orderBy(asc(hkbConditions.id)),
      db.select().from(hkbFeatures).orderBy(asc(hkbFeatures.id)),
      db.select().from(hkbPriors),
      db.select().from(hkbPriorModifiers).orderBy(asc(hkbPriorModifiers.why)),
      db.select().from(hkbEvidence).orderBy(asc(hkbEvidence.id)),
      db.select().from(hkbTests).orderBy(asc(hkbTests.name)),
      db
        .select()
        .from(hkbConditionTests)
        .orderBy(asc(hkbConditionTests.testId)),
    ]);
  if (!conditions.length) return null;
  return {
    conditions,
    features,
    priors,
    modifiers,
    evidence,
    tests,
    links,
  } as CatalogRows;
}

/**
 * The catalog for this request. Cached for a minute in module scope, so a
 * page that runs the engine ten times reads the tables once.
 */
export async function loadCatalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < TTL) return cache.catalog;
  const catalog = (await fromDb()) ?? HYPOTHESES;
  cache = { at: Date.now(), catalog };
  return catalog;
}

async function fromDb(): Promise<Catalog | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await readRows();
    return rows ? rowsToCatalog(rows) : null;
  } catch (e) {
    console.error("[hkb] falling back to the in-code catalog:", e);
    return null;
  }
}

/** The mirror of `featureInput`, for the seed. */
export function featureIdOf(input: EvidenceRule["input"]): string {
  if (input.metric) return `metric:${input.metric}`;
  if (input.derived) return `derived:${input.derived}`;
  if (input.hypothesis) return `hypothesis:${input.hypothesis}`;
  if (input.event) return `event:${input.event}`;
  return `fact:${input.fact}`;
}
