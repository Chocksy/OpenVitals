/**
 * Phase 39 B2 to B5: the hunch lifecycle.
 *
 * `signalsOf` finds what is worth a look; this file keeps one row per raised
 * signal, asks the model for explanations from a closed list, chooses the one
 * test that splits them, writes the predictions down when the person accepts,
 * and closes the row when the result arrives. Principle 3: the model proposes
 * explanations and words a question. Weights, thresholds, the test and the
 * outcome are code.
 */
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  like,
  notInArray,
  or,
} from "drizzle-orm";
import { z } from "zod";
import {
  beliefSnapshots,
  getDb,
  goals as goalsTable,
  hkbConditionTests,
  hkbConditions,
  hkbEvidence,
  hkbPriorModifiers,
  hkbTests,
  hunches,
  profileFacts,
  type BeliefSnapshotBeliefs,
  type Hunch,
  type HunchExplanation,
  type HunchPrediction,
  type HunchQuestion,
  type HunchTest,
} from "@/db";
import { recordHunchCalibration } from "./calibration";
import { buildModelInput } from "./coverage";
import { getMetricRows, type MetricRow } from "./data";
import { profileAt } from "./facts";
import { catalogFor, loadCatalog } from "./hkb";
import {
  scoreHypotheses,
  type Catalog,
  type Discriminator,
  type Hypothesis,
} from "./hypotheses";
import { generateObjectSafe } from "./extract";
import { gradeOfEdge, type SystemId } from "./graph";
import { loadGraph, type Graph } from "./kg";
import { labPoints, type LabPoint } from "./personal";
import { BAND_EUR, CURRENCY, MIN_EUR, PER_EUR } from "./prices";
import {
  fmt,
  signalsOf,
  WORSE,
  type Cause,
  type Check,
  type Dir,
  type Signal,
  type SignalsInput,
} from "./signals";

/** ponytail: one tapped chip triples what it favours; no study sets this. */
export const CHIP_LR = 3;

/** Graph lookups for a code the kg files under another name. */
// ponytail: one alias; add rows when another lab code misses its edges.
const GRAPH_ALIAS: Record<string, string> = { crp: "hs_crp" };

type Grade = HunchExplanation["grade"];
type Basis = HunchExplanation["basis"];
type Origin = NonNullable<HunchExplanation["origin"]>;
/** A cause with where it came from; `Cause` itself lives in signals.ts. */
type Sourced = Cause & { origin?: Origin };

/** What case research (phase 41C) writes into `review_note`. */
const PAPER_NOTE = "origin: paper";

/* ── pure: the closed list ─────────────────────────────────────────────── */

export interface EvidenceRow {
  conditionId: string;
  conditionName: string;
  featureId: string;
  conditionOn: Record<string, unknown>;
  lrPos: number;
  grade: string;
  source: string;
  /** "paper" for a case-research row; seed and topic-watch rows are catalog */
  origin?: Origin;
}

/** The rows a case research dry run hands back, laid over the database's. */
export interface HunchOverlay {
  evidence: (Omit<EvidenceRow, "conditionName" | "origin"> & {
    status?: string;
  })[];
  modifiers: {
    conditionId: string;
    featureId: string;
    conditionOn: Record<string, unknown>;
    times: number;
    grade?: string | null;
    source?: string | null;
    why?: string | null;
  }[];
  conditions: {
    id: string;
    name: string;
    requires?: ConditionLink["requires"];
  }[];
}

const basisOf = (grade: string): Basis =>
  grade === "A" || grade === "B"
    ? "science"
    : grade === "C"
      ? "opinion"
      : "anecdotal";

const num = (v: unknown) => (typeof v === "number" ? v : null);

/** The threshold one evidence row names, if it is a plain above/below. */
function checkOf(row: EvidenceRow): Check | null {
  if (!row.featureId.startsWith("metric:")) return null;
  const keys = Object.keys(row.conditionOn);
  if (keys.some((k) => k !== "above" && k !== "below")) return null;
  const above = num(row.conditionOn.above);
  const below = num(row.conditionOn.below);
  const code = row.featureId.slice(7);
  if (above != null && below != null)
    return { code, op: "between", value: [above, below] };
  if (below != null) return { code, op: "<", value: below };
  if (above != null) return { code, op: ">", value: above };
  return null;
}

/** Which move an evidence row explains: below means low, above means high. */
function dirOf(on: Record<string, unknown>): Dir | null {
  const slope = on.slopePerYear as Record<string, unknown> | undefined;
  if (on.below != null || slope?.below != null) return "down";
  if (on.above != null || slope?.above != null) return "up";
  return null;
}

/**
 * The strongest plain threshold each condition's evidence names, on any
 * marker: coeliac points at tTG-IgA above 10, not at the ferritin that fell.
 */
export function checksOf(evidence: EvidenceRow[]): Map<string, Check> {
  const best = new Map<string, { lr: number; check: Check }>();
  for (const r of evidence) {
    const check = r.lrPos > 1 ? checkOf(r) : null;
    if (!check) continue;
    const was = best.get(r.conditionId);
    if (!was || r.lrPos > was.lr)
      best.set(r.conditionId, { lr: r.lrPos, check });
  }
  return new Map([...best].map(([k, v]) => [k, v.check]));
}

/**
 * Code to the causes the graph lists for it: kg edges into the metric (and a
 * condition the metric indicates), plus hkb evidence rows on the metric that
 * speak for a condition (LR above 1). A kg condition with an hkb twin takes
 * the hkb id, so the engine's belief and the evidence checks attach to it.
 */
export function causesFrom(
  graph: Graph,
  evidence: EvidenceRow[],
  codes: string[],
): Record<string, Cause[]> {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const hkbIds = new Set(evidence.map((e) => e.conditionId));
  const checks = checksOf(evidence);
  const hkbOf = (nodeId: string) => {
    if (!nodeId.startsWith("condition:")) return null;
    const local = nodeId.slice(10);
    // ponytail: kg `coeliac` is hkb `coeliac_disease`; the suffix covers it.
    return hkbIds.has(local)
      ? local
      : hkbIds.has(`${local}_disease`)
        ? `${local}_disease`
        : null;
  };
  const KINDS = new Set(["condition", "intervention", "behavior", "metric"]);
  const out: Record<string, Cause[]> = {};

  for (const code of codes) {
    const target = `metric:${GRAPH_ALIAS[code] ?? code}`;
    const found = new Map<string, Cause>();
    const add = (c: Cause) => {
      const was = found.get(c.id);
      if (!was || c.grade < was.grade) found.set(c.id, c);
    };
    for (const e of graph.edges) {
      let other: string | null = null;
      let dir: Dir | null = null;
      if (
        e.to === target &&
        (e.relation === "raises" || e.relation === "lowers")
      ) {
        other = e.from;
        dir = e.relation === "raises" ? "up" : "down";
      } else if (e.from === target && e.relation === "indicates") {
        other = e.to;
        dir = WORSE[code] ?? null;
      }
      const node = other ? nodes.get(other) : undefined;
      if (!node || !KINDS.has(node.kind)) continue;
      const conditionId = hkbOf(node.id);
      add({
        id: conditionId ?? node.id,
        name: node.name,
        dir,
        grade: gradeOfEdge(e),
        basis: e.basis,
        source: e.evidence[0]?.title ?? null,
        conditionId,
        check: conditionId ? (checks.get(conditionId) ?? null) : null,
      });
    }
    for (const r of evidence) {
      if (r.featureId !== target || r.lrPos <= 1) continue;
      // ponytail: "…_risk" rows are consequences of the marker, not causes.
      if (r.conditionId.endsWith("_risk")) continue;
      add({
        id: r.conditionId,
        name: r.conditionName,
        dir: dirOf(r.conditionOn),
        grade: r.grade,
        basis: basisOf(r.grade),
        source: r.source.split(/[:.]/)[0]!.trim().slice(0, 120) || null,
        conditionId: r.conditionId,
        check: checks.get(r.conditionId) ?? null,
        origin: r.origin ?? "catalog",
      } as Sourced);
    }
    out[code] = [...found.values()];
  }
  return out;
}

/** The closed list for one signal, strongest first. */
export function closedList(
  s: Pick<Signal, "kind" | "codes" | "dir">,
  causes: Record<string, Cause[]>,
): Cause[] {
  const seen = new Map<string, Cause>();
  for (const code of s.codes) {
    const dir = s.kind === "cluster" ? (WORSE[code] ?? null) : s.dir;
    for (const c of causes[code] ?? [])
      if (dir == null || c.dir == null || c.dir === dir)
        if (!seen.has(c.id)) seen.set(c.id, c);
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.grade.localeCompare(b.grade) ||
      Number(!!b.check) - Number(!!a.check) ||
      a.id.localeCompare(b.id),
  );
}

/* ── pure: why a settled belief holds (phase 41B) ─────────────────────── */

export interface ConditionLink {
  id: string;
  name: string;
  requires: { condition: string; minState: number } | null;
}

const GRADES = ["A", "B", "C", "D", "E"];

/**
 * The causes of one condition: kg edges that raise or worsen its node, hkb
 * conditions whose evidence reads `hypothesis:<id>` with LR above 1, and
 * catalog conditions the engine scores only once it holds (`requires`).
 */
export function causesOfCondition(
  id: string,
  graph: Graph,
  evidence: EvidenceRow[],
  conditions: ConditionLink[],
  links: EvidenceRow[] = [],
): Cause[] {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const checks = checksOf(evidence);
  const hkbIds = new Set(conditions.map((c) => c.id));
  // ponytail: kg `coeliac` is hkb `coeliac_disease`; both node ids count.
  const targets = new Set([
    `condition:${id}`,
    `condition:${id.replace(/_disease$/, "")}`,
  ]);
  const found = new Map<string, Sourced>();
  const add = (c: Sourced) => {
    if (c.id === id || c.id.endsWith("_risk")) return;
    const was = found.get(c.id);
    if (!was || c.grade < was.grade) found.set(c.id, c);
  };
  for (const e of graph.edges) {
    if (!targets.has(e.to)) continue;
    if (e.relation !== "raises" && e.relation !== "worsens") continue;
    const from = nodes.get(e.from);
    if (!from) continue;
    const local = from.id.startsWith("condition:") ? from.id.slice(10) : null;
    const conditionId =
      local && hkbIds.has(local)
        ? local
        : local && hkbIds.has(`${local}_disease`)
          ? `${local}_disease`
          : null;
    add({
      id: conditionId ?? from.id,
      name: from.name,
      dir: null,
      grade: gradeOfEdge(e),
      basis: e.basis,
      source: e.evidence[0]?.title ?? null,
      conditionId,
      check: conditionId ? (checks.get(conditionId) ?? null) : null,
      origin: "catalog",
    });
  }
  // `links` are case-research prior modifiers on `hypothesis:<id>`: "22 % of
  // people with <id> had X" makes X a cause to look for. A seeded modifier is
  // not passed here: those say two conditions cluster, not that one explains
  // the other.
  for (const r of [...evidence, ...links]) {
    if (r.featureId !== `hypothesis:${id}` || r.lrPos <= 1) continue;
    add({
      id: r.conditionId,
      name: r.conditionName,
      dir: null,
      grade: r.grade,
      basis: basisOf(r.grade),
      source: r.source.split(/[:.]/)[0]!.trim().slice(0, 120) || null,
      conditionId: r.conditionId,
      check: checks.get(r.conditionId) ?? null,
      origin: r.origin ?? "catalog",
    });
  }
  for (const c of conditions) {
    if (c.requires?.condition !== id) continue;
    const grade =
      evidence
        .filter((r) => r.conditionId === c.id && r.lrPos > 1)
        .map((r) => r.grade)
        .filter((g) => GRADES.includes(g))
        .sort()[0] ?? "C";
    add({
      id: c.id,
      name: c.name,
      dir: null,
      grade,
      basis: basisOf(grade),
      source: `catalog: scored once ${id} holds`,
      conditionId: c.id,
      check: checks.get(c.id) ?? null,
      origin: "catalog",
    });
  }
  return [...found.values()].sort(
    (a, b) =>
      a.grade.localeCompare(b.grade) ||
      Number(!!b.check) - Number(!!a.check) ||
      a.id.localeCompare(b.id),
  );
}

const SETTLED = new Set(["likely", "confirmed"]);

/**
 * One `cause:<id>` signal per likely or confirmed belief with at least two
 * causes to split: the belief holds, the open question is why. Its codes are
 * the person's markers the condition's own evidence reads.
 */
export function causeSignals(
  beliefs: BeliefSnapshotBeliefs | null,
  causes: Record<string, Cause[]>,
  evidence: EvidenceRow[],
  markers: string[],
  names: Record<string, string>,
): Signal[] {
  const have = new Set(markers);
  const out: Signal[] = [];
  for (const [id, b] of Object.entries(beliefs ?? {})) {
    if (!SETTLED.has(b.state) || (causes[id]?.length ?? 0) < 2) continue;
    const codes = [
      ...new Set(
        evidence
          .filter(
            (r) => r.conditionId === id && r.featureId.startsWith("metric:"),
          )
          .map((r) => r.featureId.slice(7))
          .filter((c) => have.has(c)),
      ),
    ].sort();
    if (!codes.length) continue;
    out.push({
      key: `cause:${id}`,
      kind: "cause",
      codes,
      system: null,
      dir: null,
      since: null,
      numbers: {
        conditionId: id,
        name: names[id] ?? id,
        p: +b.p.toFixed(3),
        state: b.state,
      },
      rule: [
        `${names[id] ?? id} is ${b.state} (p ${b.p.toFixed(2)})`,
        `${causes[id]!.length} causes in the graph and catalog could explain it`,
      ],
      why: "graph",
      firedAt: [],
    });
  }
  return out;
}

const toExplanation = (c: Sourced, text = c.name): HunchExplanation => ({
  origin: c.origin ?? "catalog",
  id: c.id,
  text,
  grade: (["A", "B", "C", "D", "E"].includes(c.grade) ? c.grade : "C") as Grade,
  basis: c.basis,
  source: c.source,
  conditionId: c.conditionId,
  weight: 0,
  predicts: null,
  check: c.check,
});

/* ── pure: weights, the test, the outcome ──────────────────────────────── */

/**
 * The share of this hunch each explanation holds. An explanation the engine
 * scores takes its belief; the rest share what is left equally; a tapped
 * chip multiplies what it favours by `CHIP_LR`; then everything sums to 1.
 * A grade-E guess from outside the graph takes half of the top graph
 * explanation, so it never outweighs one the graph names.
 */
export function weightsOf(
  expl: HunchExplanation[],
  beliefs: Record<string, { p: number }> | null,
  chip?: { favours: string[] } | null,
): HunchExplanation[] {
  if (!expl.length) return expl;
  const p = (e: HunchExplanation) =>
    e.conditionId ? beliefs?.[e.conditionId]?.p : undefined;
  const known = expl.reduce((s, e) => s + (p(e) ?? 0), 0);
  const rest = expl.filter((e) => p(e) == null).length;
  const share = rest ? Math.max(0, 1 - known) / rest : 0;
  const base = expl.map((e) => p(e) ?? share);
  const top = Math.max(0, ...base.filter((_, i) => expl[i]!.grade !== "E"));
  const raw = expl.map(
    (e, i) =>
      (e.grade === "E" && top ? Math.min(base[i]!, top / 2) : base[i]!) *
        (chip?.favours.includes(e.id) ? CHIP_LR : 1) || 1e-6,
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  return expl.map((e, i) => ({
    ...e,
    weight: Math.round((raw[i]! / sum) * 1000) / 1000,
  }));
}

export interface TestRow {
  id: string;
  name: string;
  featureIds: string[];
  cost: number;
  costByCountry: Record<string, number> | null;
  lrPos?: number;
}

/** The cheapest catalog test that measures `code`, priced for the person. */
export function priceTest(
  code: string,
  tests: TestRow[],
  country: string | null,
  fallbackName: string,
): HunchTest {
  const priced = tests
    .filter((t) => t.featureIds.includes(code))
    .map((t) => {
      const real = country ? t.costByCountry?.[country] : undefined;
      return {
        t,
        eur: real ?? BAND_EUR[t.cost] ?? t.cost * 30,
        estimated: real == null,
      };
    })
    .sort(
      (a, b) => a.eur - b.eur || a.t.featureIds.length - b.t.featureIds.length,
    );
  const pick = priced[0];
  const eur = pick?.eur ?? BAND_EUR[1]!;
  const currency =
    country && !(pick?.estimated ?? true)
      ? (CURRENCY[country] ?? "EUR")
      : "EUR";
  return {
    code,
    name: pick?.t.name ?? fallbackName,
    eur,
    currency,
    price: Math.round(eur * (PER_EUR[currency] ?? 1) * 100) / 100,
    estimated: pick?.estimated ?? true,
  };
}

/**
 * B3/S6: the marker that splits the explanations most per euro.
 *
 * A candidate is a marker some explanation's check names and that none of the
 * last three draws measured (its answer is not already known). It scores by
 * how many explanations it separates, the smaller side of the split, over its
 * price with the `MIN_EUR` floor. Ties go to the side the weights lean on,
 * then the cheaper test.
 */
export function chooseTest(
  expl: HunchExplanation[],
  known: Set<string>,
  tests: TestRow[],
  country: string | null,
  names: Record<string, string>,
): HunchTest | null {
  const codes = [
    ...new Set(expl.flatMap((e) => (e.check ? [e.check.code] : []))),
  ].filter((c) => !known.has(c));
  let best: { test: HunchTest; score: number; lean: number } | null = null;
  for (const code of codes) {
    const on = expl.filter((e) => e.check?.code === code);
    const split = Math.min(on.length, expl.length - on.length);
    if (!split) continue;
    const test = priceTest(code, tests, country, names[code] ?? code);
    const score = split / Math.max(test.eur, MIN_EUR);
    const lean = on.reduce((s, e) => s + e.weight, 0);
    if (
      !best ||
      score > best.score ||
      (score === best.score && lean > best.lean) ||
      (score === best.score && lean === best.lean && test.eur < best.test.eur)
    )
      best = { test, score, lean };
  }
  return best?.test ?? null;
}

const opText = (c: Check, unit: string) =>
  c.op === "between"
    ? `between ${fmt((c.value as number[])[0]!)} and ${fmt((c.value as number[])[1]!)}${unit}`
    : `${c.op === "<" ? "under" : "over"} ${fmt(c.value as number)}${unit}`;

/** The opposite of an out-of-range check, as "normal" on the same marker. */
function normalOf(c: Check): Check {
  if (c.op === "<") return { code: c.code, op: ">", value: c.value };
  if (c.op === ">") return { code: c.code, op: "<", value: c.value };
  // ponytail: outside a band is two ranges; "under the low end" stands in.
  return { code: c.code, op: "<", value: (c.value as number[])[0]! };
}

/**
 * B4: what each explanation says the test will show, written before the
 * result. An explanation whose check names the test predicts its threshold;
 * every other one predicts normal on the same marker.
 */
export function predictionsOf(
  expl: HunchExplanation[],
  test: HunchTest,
  name: string,
  unit: string | null,
): HunchPrediction[] | null {
  const anchor = expl.find((e) => e.check?.code === test.code)?.check;
  if (!anchor) return null;
  const u = unit ? ` ${unit}` : "";
  return expl.map((e) => {
    const check = e.check?.code === test.code ? e.check : normalOf(anchor);
    return {
      explanationId: e.id,
      check,
      text: `If ${e.text.replace(/\.$/, "").toLowerCase()}: ${name} ${opText(check, u)}.`,
    };
  });
}

export const holds = (c: Check, v: number) =>
  c.op === "<"
    ? v < (c.value as number)
    : c.op === ">"
      ? v > (c.value as number)
      : v >= (c.value as number[])[0]! && v <= (c.value as number[])[1]!;

/** B5: one match confirms, none rules out, several narrow the hunch. */
export function outcomeOf(
  predictions: HunchPrediction[],
  value: number,
): { outcome: "confirmed" | "ruled_out" | "narrowed"; matched: string[] } {
  const matched = predictions
    .filter((p) => holds(p.check, value))
    .map((p) => p.explanationId);
  return {
    outcome:
      matched.length === 1
        ? "confirmed"
        : matched.length === 0
          ? "ruled_out"
          : "narrowed",
    matched,
  };
}

/* ── the person ────────────────────────────────────────────────────────── */

const factText = (v: unknown) =>
  typeof v === "string"
    ? v
    : Array.isArray(v)
      ? v.join(", ")
      : v == null
        ? ""
        : String(v);

export interface Person {
  input: SignalsInput;
  rows: MetricRow[];
  points: Map<string, LabPoint[]>;
  names: Record<string, string>;
  units: Record<string, string | null>;
  facts: Record<string, string>;
  country: string | null;
  tests: TestRow[];
  beliefs: BeliefSnapshotBeliefs | null;
  /** codes measured on the person's last three draws: their answer is known */
  known: Set<string>;
  /** phase 41B: the causes of each likely or confirmed belief */
  conditionCauses: Record<string, Cause[]>;
  evidence: EvidenceRow[];
  conditionNames: Record<string, string>;
  /** test ids per condition, from `hkb_condition_tests` */
  conditionTests?: Record<string, string[]>;
}

/**
 * A case-research modifier "cause of <id>" (phase 41C round 3) reads as a
 * link on `hypothesis:<id>`, whatever its own feature is: the failure of a
 * treatment is found among people with the condition it treats.
 */
export const linkFeature = (featureId: string, why: string | null | undefined) => {
  const of = why?.match(/cause of (\w+)/)?.[1];
  return of ? `hypothesis:${of}` : featureId;
};

/**
 * Everything the hunch rules read about one person. `asOf` reads them as they
 * stood on that day (the blind replay, phase 41D): readings up to it, goals
 * set by then, facts from their history, and beliefs scored on that day's
 * input rather than the newest snapshot. `beliefs` hands in beliefs the
 * caller already scored.
 */
export async function personOf(
  userId: string,
  today: string,
  opts: {
    asOf?: string;
    beliefs?: BeliefSnapshotBeliefs | null;
    /** a case research dry run's rules and promotions, in memory */
    overlay?: HunchOverlay | null;
  } = {},
): Promise<Person> {
  const db = getDb();
  const asOf = opts.asOf;
  const [
    rows,
    goalRows,
    factRows,
    graph,
    stored,
    testRows,
    snap,
    catalogConds,
    paperLinks,
    condTests,
  ] = await Promise.all([
    getMetricRows(userId, { asOf }),
    db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .then((gs) =>
        asOf ? gs.filter((g) => g.createdAt && day(g.createdAt) <= asOf) : gs,
      ),
    asOf
      ? profileAt(userId, asOf, { timeless: true }).then((p) =>
          Object.entries(p).map(([key, value]) => ({ key, value })),
        )
      : db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
    loadGraph(),
    db
      .select({
        conditionId: hkbEvidence.conditionId,
        conditionName: hkbConditions.name,
        featureId: hkbEvidence.featureId,
        conditionOn: hkbEvidence.conditionOn,
        lrPos: hkbEvidence.lrPos,
        grade: hkbEvidence.grade,
        source: hkbEvidence.source,
        reviewNote: hkbEvidence.reviewNote,
      })
      .from(hkbEvidence)
      .innerJoin(hkbConditions, eq(hkbConditions.id, hkbEvidence.conditionId))
      .where(inArray(hkbEvidence.status, ["seed", "accepted"])),
    db.select().from(hkbTests),
    opts.beliefs !== undefined
      ? [{ beliefs: opts.beliefs }]
      : asOf
        ? beliefsAt(userId, asOf).then((beliefs) => [{ beliefs }])
        : db
            .select({ beliefs: beliefSnapshots.beliefs })
            .from(beliefSnapshots)
            .where(eq(beliefSnapshots.userId, userId))
            .orderBy(desc(beliefSnapshots.computedAt))
            .limit(1),
    db
      .select({
        id: hkbConditions.id,
        name: hkbConditions.name,
        requires: hkbConditions.requires,
      })
      .from(hkbConditions)
      .where(eq(hkbConditions.inCatalog, true)),
    // case research's modifiers on a condition's probability: cause links
    db
      .select({
        conditionId: hkbPriorModifiers.conditionId,
        conditionName: hkbConditions.name,
        featureId: hkbPriorModifiers.featureId,
        conditionOn: hkbPriorModifiers.conditionOn,
        lrPos: hkbPriorModifiers.times,
        grade: hkbPriorModifiers.grade,
        source: hkbPriorModifiers.source,
        why: hkbPriorModifiers.why,
      })
      .from(hkbPriorModifiers)
      .innerJoin(
        hkbConditions,
        eq(hkbConditions.id, hkbPriorModifiers.conditionId),
      )
      .where(
        and(
          or(
            like(hkbPriorModifiers.featureId, "hypothesis:%"),
            like(hkbPriorModifiers.why, "%cause of %"),
          ),
          like(hkbPriorModifiers.why, "%case research%"),
          gt(hkbPriorModifiers.times, 1),
        ),
      ),
    db.select().from(hkbConditionTests),
  ]);
  // an overlay's promoted conditions count as catalog ones; its rules as papers
  const overlay = opts.overlay ?? null;
  const conds: ConditionLink[] = [
    ...(catalogConds as ConditionLink[]),
    ...(overlay?.conditions ?? [])
      .filter((c) => !catalogConds.some((x) => x.id === c.id))
      .map((c) => ({ id: c.id, name: c.name, requires: c.requires ?? null })),
  ];
  const nameOf = (id: string) => conds.find((c) => c.id === id)?.name ?? id;
  const evidence: EvidenceRow[] = [
    ...stored.map(({ reviewNote, ...r }) => ({
      ...r,
      origin: (reviewNote?.startsWith(PAPER_NOTE)
        ? "paper"
        : "catalog") as Origin,
    })),
    ...(overlay?.evidence ?? [])
      .filter((r) => !r.status || r.status === "accepted")
      .map(({ status: _, ...r }) => ({
        ...r,
        conditionName: nameOf(r.conditionId),
        origin: "paper" as const,
      })),
  ];
  const links: EvidenceRow[] = [
    ...paperLinks.map(({ why, ...r }) => ({
      ...r,
      featureId: linkFeature(r.featureId, why),
      grade: r.grade ?? "C",
      source: r.source ?? "",
      origin: "paper" as const,
    })),
    ...(overlay?.modifiers ?? [])
      .filter(
        (m) =>
          linkFeature(m.featureId, m.why).startsWith("hypothesis:") &&
          m.times > 1,
      )
      .map((m) => ({
        conditionId: m.conditionId,
        conditionName: nameOf(m.conditionId),
        featureId: linkFeature(m.featureId, m.why),
        conditionOn: m.conditionOn,
        lrPos: m.times,
        grade: m.grade ?? "C",
        source: m.source ?? "",
        origin: "paper" as const,
      })),
  ];
  const systemOf = new Map(
    graph.nodes
      .filter((n) => n.kind === "metric")
      .flatMap((n) =>
        (n.codes ?? []).map((c) => [c, n.system ?? null] as const),
      ),
  );
  const points = new Map(rows.map((r) => [r.code, labPoints(r.rows)]));
  const facts = Object.fromEntries(
    factRows.map((f) => [f.key, factText(f.value)]),
  );
  const markers = rows
    .filter((r) => points.get(r.code)!.length)
    .map((r) => ({
      code: r.code,
      name: r.name,
      unit: r.unit,
      system: (systemOf.get(r.code) ?? null) as SystemId | null,
      derived: r.derived,
      points: points.get(r.code)!,
    }));
  const draws = [
    ...new Set(markers.flatMap((m) => m.points.map((p) => p.date))),
  ].sort();
  const last3 = new Set(draws.slice(-3));
  return {
    input: {
      markers,
      goals: goalRows.map((g) => ({
        code: g.metricCode,
        low: g.targetLow,
        high: g.targetHigh,
        due: g.due,
      })),
      facts,
      causes: causesFrom(
        graph,
        evidence as EvidenceRow[],
        markers.map((m) => m.code),
      ),
      today,
    },
    rows,
    points,
    names: Object.fromEntries(rows.map((r) => [r.code, r.name])),
    units: Object.fromEntries(rows.map((r) => [r.code, r.unit])),
    facts,
    country: facts.country?.trim().toUpperCase().slice(0, 2) || null,
    tests: testRows.map((t) => ({
      id: t.id,
      name: t.name,
      featureIds: t.featureIds,
      cost: t.cost,
      costByCountry: t.costByCountry,
      lrPos: t.lrPos,
    })),
    conditionTests: condTests.reduce<Record<string, string[]>>((acc, l) => {
      (acc[l.conditionId] ??= []).push(l.testId);
      return acc;
    }, {}),
    beliefs: snap[0]?.beliefs ?? null,
    conditionCauses: Object.fromEntries(
      Object.entries(snap[0]?.beliefs ?? {})
        .filter(([, b]) => SETTLED.has(b.state))
        .map(([id]) => [
          id,
          causesOfCondition(id, graph, evidence, conds, links),
        ]),
    ),
    evidence: evidence as EvidenceRow[],
    conditionNames: Object.fromEntries(conds.map((c) => [c.id, c.name])),
    known: new Set(
      markers
        .filter((m) => m.points.some((p) => last3.has(p.date)))
        .map((m) => m.code),
    ),
  };
}

/**
 * The engine's beliefs on a past day, scored on that day's input with the
 * shared ring-1 catalog: a ring-2 condition woken later is not read.
 */
export async function beliefsAt(
  userId: string,
  asOf: string,
  seed: Record<string, unknown> = {},
): Promise<BeliefSnapshotBeliefs> {
  const [input, catalog] = await Promise.all([
    buildModelInput(userId, asOf, seed),
    loadCatalog(),
  ]);
  return Object.fromEntries(
    scoreHypotheses(input, { catalog }).map((h) => [
      h.id,
      { p: h.score, state: h.state },
    ]),
  );
}

/* ── the model: explanations and one question ──────────────────────────── */

const explainSchema = z.object({
  explanations: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .describe("two to four, ids copied from the LIST"),
  outside: z
    .array(z.object({ text: z.string() }))
    .describe("at most two explanations that are not on the LIST"),
  question: z
    .object({
      text: z.string(),
      chips: z.array(
        z.object({ label: z.string(), favours: z.array(z.string()) }),
      ),
    })
    .nullable(),
});

const EXPLAIN_PROMPT = `You help a person understand a change in their own blood tests.

You get one SIGNAL (what changed, with the numbers), the PERSON's facts, and a closed LIST of explanations the knowledge graph connects to the marker.

RULES:
1. Pick two to four explanations from the LIST that best fit this person and this change. Copy each id exactly. For each, write \`text\`: one plain sentence a non-doctor understands, naming the cause and why it fits (at most 20 words, no percentages, no z-scores).
2. You may add at most two explanations that are not on the LIST in \`outside\`, only when the list misses something common. They are shown as unproven.
3. Write one \`question\` the person can answer from memory that separates the explanations you picked, with three to five short chips. Each chip's \`favours\` lists the ids (from your picks) that the answer makes more likely. An "outside" explanation is referred to as "outside:1" or "outside:2".
4. Never give a probability, a threshold, a diagnosis or a test. Code does that.`;

export interface Explained {
  explanations: HunchExplanation[];
  question: HunchQuestion | null;
  /** "model" or "rules", for As built and /brain */
  by: "model" | "rules";
}

export async function explain(
  s: Signal,
  list: Cause[],
  person: Pick<Person, "facts" | "names">,
): Promise<Explained> {
  const rules = (): Explained => ({
    explanations: list.slice(0, 3).map((c) => toExplanation(c)),
    question: null,
    by: "rules",
  });
  if (!list.length) return { explanations: [], question: null, by: "rules" };
  if (!process.env.OPENROUTER_API_KEY) return rules();

  const f = person.facts;
  const about = [
    f.birth_year ? `born ${f.birth_year}` : null,
    f.sex ? `sex ${f.sex}` : null,
    f.medications ? `medications: ${f.medications}` : null,
    f.conditions ? `conditions: ${f.conditions}` : null,
    ...Object.entries(f)
      .filter(([k]) => k.startsWith("genome:"))
      .map(([k, v]) => `${k.slice(7).toUpperCase()} ${v}`),
  ].filter(Boolean);
  try {
    const { object } = await generateObjectSafe({
      schema: explainSchema,
      system: EXPLAIN_PROMPT,
      prompt: [
        `SIGNAL (${s.kind}, ${s.codes.map((c) => person.names[c] ?? c).join(", ")}):`,
        ...s.rule.map((r) => `- ${r}`),
        ``,
        `PERSON: ${about.join("; ")}`,
        ``,
        `LIST (id | explanation | grade):`,
        ...list.map((c) => `${c.id} | ${c.name} | ${c.grade}`),
      ].join("\n"),
    });
    const byId = new Map(list.map((c) => [c.id, c]));
    const picked: HunchExplanation[] = [];
    for (const e of object.explanations) {
      const c = byId.get(e.id.trim());
      // An id not on the list is dropped, as `pickActs` drops unknown acts.
      if (!c || picked.some((p) => p.id === c.id) || picked.length >= 4)
        continue;
      picked.push(toExplanation(c, e.text.trim().slice(0, 200) || c.name));
    }
    for (const c of list)
      if (picked.length < 2 && !picked.some((p) => p.id === c.id))
        picked.push(toExplanation(c));
    object.outside.slice(0, 2).forEach((o, i) =>
      picked.push({
        id: `outside:${i + 1}`,
        text: o.text.trim().slice(0, 200),
        grade: "E",
        basis: "hypothesis",
        source: null,
        conditionId: null,
        weight: 0,
        predicts: null,
        check: null,
        origin: "model",
      }),
    );
    const ids = new Set(picked.map((p) => p.id));
    const chips = (object.question?.chips ?? []).slice(0, 5).map((c, i) => ({
      id: `c${i + 1}`,
      label: c.label.trim().slice(0, 60),
      favours: c.favours.map((x) => x.trim()).filter((x) => ids.has(x)),
    }));
    const question =
      object.question && chips.length >= 3
        ? { text: object.question.text.trim().slice(0, 200), chips }
        : null;
    return { explanations: picked, question, by: "model" };
  } catch (e) {
    console.error("[hunches] the model layer failed, rules stand:", e);
    return rules();
  }
}

/* ── the lifecycle ─────────────────────────────────────────────────────── */

const day = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/** The code a hunch is "about" first: a lit cluster member, else the first. */
export function primaryOf(s: Pick<Signal, "codes" | "numbers">): string {
  const lit = String(s.numbers?.lit ?? "").split(",");
  return lit.find((c) => s.codes.includes(c)) ?? s.codes[0]!;
}

/**
 * A cause hunch asks which cause it is, so its test is the one that confirms
 * the leading cause: going down the explanations by weight, the first whose
 * condition has a cheap test (special blood at most) not already answered,
 * the highest LR+ of those, the cheaper on a tie.
 */
export function causeTest(
  expl: HunchExplanation[],
  person: Pick<Person, "conditionTests" | "tests" | "known" | "country">,
): HunchTest | null {
  for (const e of [...expl].sort((a, b) => b.weight - a.weight)) {
    const ids = e.conditionId ? person.conditionTests?.[e.conditionId] : null;
    if (!ids?.length) continue;
    const pick = person.tests
      .filter(
        (t) =>
          ids.includes(t.id) &&
          t.cost <= 2 &&
          t.featureIds.length &&
          !t.featureIds.every((c) => person.known.has(c)),
      )
      .sort((a, b) => (b.lrPos ?? 0) - (a.lrPos ?? 0) || a.cost - b.cost)[0];
    if (pick)
      return priceTest(pick.featureIds[0]!, [pick], person.country, pick.name);
  }
  return null;
}

function testFor(s: Signal, expl: HunchExplanation[], person: Person) {
  if (s.kind === "good_news") return null;
  if (s.kind === "cause") {
    const t = causeTest(expl, person);
    if (t) return t;
  }
  if (s.kind === "gap")
    return priceTest(
      s.codes[0]!,
      person.tests,
      person.country,
      person.names[s.codes[0]!] ?? s.codes[0]!,
    );
  return (
    chooseTest(
      expl,
      person.known,
      person.tests,
      person.country,
      person.names,
    ) ??
    // ponytail: nothing on the list names a marker we could order, so the
    // test is a repeat of the marker itself; it confirms the move, it does
    // not split the explanations.
    priceTest(
      primaryOf(s),
      person.tests,
      person.country,
      person.names[primaryOf(s)] ?? primaryOf(s),
    )
  );
}

/** Each explanation's line of what the chosen test will show. */
function predictsOf(
  expl: HunchExplanation[],
  test: HunchTest | null,
  person: Person,
): HunchExplanation[] {
  const said = test?.code
    ? predictionsOf(
        expl,
        test,
        person.names[test.code] ?? test.name,
        person.units[test.code] ?? null,
      )
    : null;
  return expl.map((e) => ({
    ...e,
    predicts: said?.find((p) => p.explanationId === e.id)?.text ?? null,
  }));
}

/** A hunch as it would be written, for a dry run that writes nothing. */
export interface DraftHunch {
  key: string;
  kind: Signal["kind"];
  codes: string[];
  explanations: HunchExplanation[];
  test: HunchTest | null;
  /** a `cause:` hunch's differential, when the caller handed in a catalog */
  differential?: Differential | null;
}

/* ── the differential ──────────────────────────────────────────────────── */

/** One option of a differential: a cause, its share, where the share comes from. */
export interface DifferentialOption {
  id: string;
  name: string;
  /** its share of the open cause, after the remainder is set aside */
  share: number;
  /** P(cause | the condition) the share was read from, before scaling */
  p: number;
  /** the engine's own belief in the cause, P(cause) */
  belief: number;
  /**
   * `share`: a printed share, read as the mixture's P(C | X, data);
   * `requires`: a catalog condition scored only once X holds, its belief is
   * already conditional; `belief`: no share, P(C) / p(X) as the estimate.
   */
  basis: "share" | "requires" | "belief";
  /** a DOI line, or the catalog's source line; never the model's word */
  source: string;
  /** the best grade behind `source` */
  grade: Grade;
  origin: "paper" | "catalog";
  /** the cheapest informative test for this cause alone */
  test: { name: string; codes: string[] } | null;
}

export interface Differential {
  of: string;
  name: string;
  /** the engine's belief in the open condition itself */
  p: number;
  options: DifferentialOption[];
  /** the share nobody on the list explains: other causes, or none found */
  other: number;
  /** the one test whose answer moves the list the most, per unit of cost */
  splitBy: { name: string; codes: string[]; for: string[] } | null;
}

/** The part of the hunch no listed cause takes, however sure the list is. */
export const MIN_OTHER = 0.1;
export const DIFFERENTIAL_SIZE = 3;

type BeliefWithGiven = {
  p: number;
  /** P(this | feature, data) keyed by the feature, from `HypothesisResult.mixture` */
  given?: Record<string, number>;
};

const shortSource = (s: string) =>
  s.split(";").slice(0, 2).join(";").trim().slice(0, 160);

/** "… (grade C)." in a catalog source line, else C. */
const gradeIn = (s: string | undefined): Grade =>
  (s?.match(/\bgrade ([A-E])\b/)?.[1] as Grade | undefined) ?? "C";

/**
 * An open cause as a doctor's differential: up to three causes, each with its
 * share, its source and its own test, the test that splits them, and an
 * "other or unexplained" remainder of at least `MIN_OTHER`, so the list never
 * claims to be complete.
 *
 * The causes are the catalog's: conditions with a printed share among people
 * with the condition (a case-research cause rule), conditions scored only once
 * it holds (`requires`), and conditions whose evidence reads it. A cause's p
 * is P(C | X): the mixture's posterior for a share rule, the belief itself for
 * a `requires` condition, P(C) / p(X) otherwise. Several causes may overlap
 * ("gut loss" holds atrophic gastritis), so the shares are scaled only when
 * they would leave less than `MIN_OTHER`. Pure.
 */
export function differentialOf(
  conditionId: string,
  beliefs: Record<string, BeliefWithGiven> | null,
  catalog: Catalog,
  opts: { known?: Set<string>; size?: number } = {},
): Differential | null {
  const x = beliefs?.[conditionId];
  const self = catalog.find((h) => h.id === conditionId);
  if (!x || !self || !beliefs) return null;
  const feature = `hypothesis:${conditionId}`;
  const causeOfX = (why: string) =>
    why.match(/cause of (\w+)/)?.[1] === conditionId;

  const found: Omit<DifferentialOption, "share" | "test">[] = [];
  for (const h of catalog) {
    const b = beliefs[h.id];
    if (h.id === conditionId || !b) continue;
    const shares = h.priors.modifiers.filter(
      (m) =>
        m.share != null && (m.when.hypothesis === conditionId || causeOfX(m.why)),
    );
    const given = b.given?.[feature] ?? Object.values(b.given ?? {})[0];
    const ev = h.evidence.find(
      (e) => e.input.hypothesis === conditionId && e.lr > 1,
    );
    const base = { id: h.id, name: h.name, belief: b.p };
    if (shares.length)
      found.push({
        ...base,
        p: given ?? Math.min(1, b.p / Math.max(x.p, 1e-6)),
        basis: given != null ? "share" : "belief",
        source: shares.map((m) => shortSource(m.source ?? m.why)).join(" | "),
        grade: shares.map((m) => m.grade ?? "C").sort()[0]!,
        origin: "paper",
      });
    else if (h.requires?.id === conditionId)
      found.push({
        ...base,
        p: b.p,
        basis: "requires",
        source: `catalog: ${shortSource(h.priors.source ?? `scored once ${self.name} holds`)}`,
        grade: gradeIn(h.priors.source),
        origin: "catalog",
      });
    else if (ev)
      found.push({
        ...base,
        p: Math.min(1, b.p / Math.max(x.p, 1e-6)),
        basis: "belief",
        source: `catalog: ${shortSource(ev.source)}`,
        grade: ev.grade,
        origin: "catalog",
      });
  }
  const top = found
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id))
    .slice(0, opts.size ?? DIFFERENTIAL_SIZE);
  const sum = top.reduce((s, o) => s + o.p, 0);
  const scale = sum > 1 - MIN_OTHER ? (1 - MIN_OTHER) / sum : 1;
  const known = opts.known ?? new Set<string>();
  const pOf = (odds: number) => odds / (1 + odds);
  /** the engine's `nextTests` arithmetic: expected move of p, per cost */
  const moves = (d: Discriminator, p: number) => {
    const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
    const odds = q / (1 - q);
    return (
      (Math.abs(pOf(odds * d.lrPos) - q) * 0.5 +
        Math.abs(pOf(odds * d.lrNeg) - q) * 0.5) /
      d.cost
    );
  };
  const open = (h: Hypothesis | undefined) =>
    (h?.discriminators ?? []).filter(
      (d) => !d.codes.every((c) => known.has(c)),
    );
  const options: DifferentialOption[] = top.map((o) => {
    const best = open(catalog.find((h) => h.id === o.id)).sort(
      (a, b) => moves(b, o.p) - moves(a, o.p),
    )[0];
    return {
      ...o,
      p: +o.p.toFixed(3),
      belief: +o.belief.toFixed(3),
      share: +(o.p * scale).toFixed(3),
      test: best ? { name: best.test, codes: best.codes } : null,
    };
  });
  const other = +Math.max(
    0,
    1 - options.reduce((s, o) => s + o.share, 0),
  ).toFixed(3);
  // the test that splits them: the largest expected move it makes on any one
  // option, per cost. Not a sum: two options that overlap ("gut loss" holds
  // coeliac) would count one tTG twice.
  const byTest = new Map<string, { d: Discriminator; gain: number; for: string[] }>();
  for (const o of options)
    for (const d of open(catalog.find((h) => h.id === o.id))) {
      const t = byTest.get(d.test) ?? { d, gain: 0, for: [] };
      t.gain = Math.max(t.gain, moves(d, o.p));
      t.for.push(o.id);
      byTest.set(d.test, t);
    }
  const split = [...byTest.values()].sort(
    (a, b) => b.gain - a.gain || a.d.test.localeCompare(b.d.test),
  )[0];
  return {
    of: conditionId,
    name: self.name,
    p: +x.p.toFixed(3),
    options,
    other,
    splitBy: split
      ? { name: split.d.test, codes: split.d.codes, for: split.for }
      : null,
  };
}

/** "iron deficiency, cause open: GI loss 36 % (doi…), …, other 28 %; test that splits them: …" */
export function differentialLine(d: Differential): string {
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  return `${d.name.toLowerCase()}, cause open: ${[
    ...d.options.map(
      (o) =>
        `${o.name} ${pc(o.share)} (${o.source}${o.test ? `; confirm with ${o.test.name}` : ""})`,
    ),
    `other ${pc(d.other)}`,
  ].join(", ")}; test that splits them: ${d.splitBy?.name ?? "none"}`;
}

export interface Refreshed {
  asOf: string | null;
  raised: Signal[];
  unraised: Signal[];
  explainedBy: Record<string, "model" | "rules">;
  /** `dryRun` only: every raised hunch with its rules explanations and test */
  drafts?: DraftHunch[];
}

/**
 * S5, in order: compute the signals; resolve rows whose test came back;
 * upsert one row per raised key (a closed key that fires on a newer draw
 * reopens); close as faded what no longer fires on a newer draw; fill the
 * explanations of rows that have none. Runs after an upload and in the daily
 * pass (`runCurator`), and lazily from `GET /api/hunches`.
 */
export async function refreshHunches(
  userId: string,
  today = new Date().toISOString().slice(0, 10),
  opts: {
    /** read the person as they stood on this day; `today` becomes it */
    asOf?: string;
    /** compute and return the hunches, write nothing, call no model */
    dryRun?: boolean;
    beliefs?: BeliefSnapshotBeliefs | null;
    /** a case research dry run's rules, read as if they were saved */
    overlay?: HunchOverlay | null;
    /** the catalog the beliefs were scored on; a dry run's `cause:` drafts
     *  then carry their differential */
    catalog?: Catalog;
  } = {},
): Promise<Refreshed> {
  const db = getDb();
  if (opts.asOf) today = opts.asOf;
  const person = await personOf(userId, today, {
    asOf: opts.asOf,
    overlay: opts.overlay,
    ...(opts.beliefs !== undefined ? { beliefs: opts.beliefs } : {}),
  });
  const signals = signalsOf(person.input);
  const { unraised, asOf } = signals;
  const raised = [
    ...signals.raised,
    ...causeSignals(
      person.beliefs,
      person.conditionCauses,
      person.evidence,
      person.input.markers.map((m) => m.code),
      person.conditionNames,
    ),
  ];
  const explainedBy: Refreshed["explainedBy"] = {};
  if (!asOf)
    return {
      asOf,
      raised,
      unraised,
      explainedBy,
      ...(opts.dryRun ? { drafts: [] } : {}),
    };
  if (opts.dryRun) {
    // The rules fallback, never the model: a replay runs dozens of days.
    const drafts = raised.map((s): DraftHunch => {
      const quiet = s.kind === "gap" || s.kind === "good_news";
      const list = quiet
        ? []
        : s.kind === "cause"
          ? (person.conditionCauses[String(s.numbers.conditionId)] ?? [])
          : closedList(s, person.input.causes);
      const expl = weightsOf(
        list.slice(0, 3).map((c) => toExplanation(c)),
        person.beliefs,
      );
      explainedBy[s.key] = "rules";
      const test = testFor(s, expl, person);
      return {
        key: s.key,
        kind: s.kind,
        codes: s.codes,
        explanations: predictsOf(expl, test, person),
        test,
        ...(s.kind === "cause" && opts.catalog
          ? {
              differential: differentialOf(
                String(s.numbers.conditionId),
                person.beliefs,
                opts.catalog,
                { known: person.known },
              ),
            }
          : {}),
      };
    });
    return { asOf, raised, unraised, explainedBy, drafts };
  }
  const now = new Date();
  const existing = await db
    .select()
    .from(hunches)
    .where(eq(hunches.userId, userId));
  const byKey = new Map(existing.map((h) => [h.key, h]));
  const asOfOf = (h: Hunch) => String(h.signal.asOf ?? "");
  const done = new Set<string>();

  // 4. A test written down, and a reading of it newer than the writing.
  for (const h of existing) {
    if (h.state !== "testing" || !h.test?.code || !h.writtenAt) continue;
    const reading = (person.points.get(h.test.code) ?? []).find(
      (p) => p.date > day(h.writtenAt!),
    );
    if (!reading) continue;
    done.add(h.key);
    const name = person.names[h.test.code] ?? h.test.name;
    const u = person.units[h.test.code] ? ` ${person.units[h.test.code]}` : "";
    if (!h.predictions?.length) {
      await db
        .update(hunches)
        .set({
          state: "open",
          test: null,
          outcomeLine: `${name} came back ${fmt(reading.value)}${u} on ${reading.date}.`,
          updatedAt: now,
        })
        .where(eq(hunches.id, h.id));
      continue;
    }
    const { outcome, matched } = outcomeOf(h.predictions, reading.value);
    const expl = h.explanations ?? [];
    const said = (id: string) => expl.find((e) => e.id === id)?.text ?? id;
    await recordHunchCalibration(
      userId,
      h.id,
      expl
        .filter((e) => outcome !== "narrowed" || !matched.includes(e.id))
        .map((e) => ({
          conditionId: e.conditionId ?? `hunch:${h.key}:${e.id}`,
          predicted: e.weight,
          resolved: matched.includes(e.id) ? 1 : 0,
        })),
    );
    if (outcome === "narrowed") {
      const kept = weightsOf(
        expl.filter((e) => matched.includes(e.id)),
        person.beliefs,
      );
      const next = testFor(h.signal as unknown as Signal, kept, person);
      await db
        .update(hunches)
        .set({
          state: "open",
          explanations: predictsOf(kept, next, person),
          test: next,
          predictions: null,
          writtenAt: null,
          answer: null,
          outcomeLine: `${name} came back ${fmt(reading.value)}${u}: ${matched.length} explanations still fit.`,
          updatedAt: now,
        })
        .where(eq(hunches.id, h.id));
      continue;
    }
    await db
      .update(hunches)
      .set({
        state: "closed",
        outcome,
        outcomeLine:
          outcome === "confirmed"
            ? `${name} came back ${fmt(reading.value)}${u} on ${reading.date}, as written down for "${said(matched[0]!)}".`
            : `${name} came back ${fmt(reading.value)}${u} on ${reading.date}; none of the explanations predicted that. Kept as seen, unexplained.`,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(hunches.id, h.id));
  }

  // 2. One row per raised key. A `cause:` row keeps its differential on the
  // signal (jsonb), so the case reads the same list the refresh computed.
  const catalog = raised.some((s) => s.kind === "cause")
    ? (opts.catalog ?? (await catalogFor(userId)))
    : null;
  for (const s of raised) {
    const differential =
      s.kind === "cause" && catalog
        ? differentialOf(String(s.numbers.conditionId), person.beliefs, catalog, {
            known: person.known,
          })
        : undefined;
    const signal = {
      ...s,
      asOf,
      ...(differential ? { differential } : {}),
    } as unknown as Record<string, unknown>;
    const h = byKey.get(s.key);
    if (!h) {
      await db
        .insert(hunches)
        .values({
          userId,
          key: s.key,
          kind: s.kind,
          codes: s.codes,
          system: s.system,
          signal,
        })
        .onConflictDoNothing();
    } else if (h.state === "closed" && !done.has(h.key)) {
      if (asOf > asOfOf(h))
        await db
          .update(hunches)
          .set({
            signal,
            codes: s.codes,
            system: s.system,
            state: "open",
            outcome: null,
            outcomeLine: null,
            explanations: null,
            question: null,
            answer: null,
            test: null,
            predictions: null,
            writtenAt: null,
            seenAt: null,
            closedAt: null,
            openedAt: now,
            updatedAt: now,
          })
          .where(eq(hunches.id, h.id));
    } else if (!done.has(h.key)) {
      await db
        .update(hunches)
        .set({ signal, codes: s.codes, system: s.system, updatedAt: now })
        .where(eq(hunches.id, h.id));
    }
  }

  // 3. Faded: the key no longer fires on a newer draw.
  const firing = new Set([...raised, ...unraised].map((s) => s.key));
  for (const h of existing) {
    if (h.state === "closed" || done.has(h.key) || firing.has(h.key)) continue;
    if (asOf <= asOfOf(h)) continue;
    await db
      .update(hunches)
      .set({
        state: "closed",
        outcome: "faded",
        outcomeLine:
          h.kind === "gap"
            ? `Measured on ${asOf}; the gap is closed.`
            : `The draw of ${asOf} no longer fires the rule.`,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(hunches.id, h.id));
  }

  // 5. Explanations for rows that have none: the one model call per hunch.
  const open = await db
    .select()
    .from(hunches)
    .where(and(eq(hunches.userId, userId), eq(hunches.state, "open")));
  for (const h of open) {
    if (h.explanations != null) continue;
    const s = h.signal as unknown as Signal;
    const quiet = s.kind === "gap" || s.kind === "good_news";
    const got = quiet
      ? ({ explanations: [], question: null, by: "rules" } as Explained)
      : await explain(
          s,
          s.kind === "cause"
            ? (person.conditionCauses[String(s.numbers.conditionId)] ?? [])
            : closedList(s, person.input.causes),
          person,
        );
    explainedBy[h.key] = got.by;
    const explanations = weightsOf(got.explanations, person.beliefs).map(
      (e) => ({ ...e, predicts: null }),
    );
    const test = testFor(s, explanations, person);
    await db
      .update(hunches)
      .set({
        explanations: predictsOf(explanations, test, person),
        question: got.question,
        test,
        updatedAt: now,
      })
      .where(eq(hunches.id, h.id));
  }

  return { asOf, raised, unraised, explainedBy };
}

/**
 * After case research saved rules: open hunches lose their explanations, test
 * and question, so the next refresh fills them again off the grown catalog. A
 * hunch with a test written down keeps it; a quiet one has nothing to lose.
 */
export async function forgetExplanations(userId: string): Promise<number> {
  const cleared = await getDb()
    .update(hunches)
    .set({
      explanations: null,
      question: null,
      answer: null,
      test: null,
      predictions: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(hunches.userId, userId),
        eq(hunches.state, "open"),
        notInArray(hunches.kind, ["gap", "good_news"]),
      ),
    )
    .returning({ id: hunches.id });
  return cleared.length;
}

/* ── the person's actions ──────────────────────────────────────────────── */

async function mine(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [h] = await getDb()
    .select()
    .from(hunches)
    .where(and(eq(hunches.userId, userId), eq(hunches.id, id)));
  return h ?? null;
}

/** A tapped chip: re-weight, and choose the test again on the new weights. */
export async function answerHunch(userId: string, id: string, chipId: string) {
  const h = await mine(userId, id);
  if (!h) return { error: "not found" as const };
  const chip = h.question?.chips.find((c) => c.id === chipId);
  if (!chip) return { error: "no such chip" as const };
  if (h.state !== "open") return { error: "not open" as const };
  const person = await personOf(userId, new Date().toISOString().slice(0, 10));
  const weighed = weightsOf(h.explanations ?? [], person.beliefs, chip);
  const test = testFor(h.signal as unknown as Signal, weighed, person);
  const explanations = predictsOf(weighed, test, person);
  await getDb()
    .update(hunches)
    .set({ answer: chip.id, explanations, test, updatedAt: new Date() })
    .where(eq(hunches.id, h.id));
  return { ok: true as const };
}

/**
 * "Write it down": store what each explanation predicts, move to testing, and
 * put the test on the next draw the way "Plan retest" does (a goal row with a
 * due date and no target), never touching a goal the person already set.
 */
export async function acceptTest(userId: string, id: string) {
  const h = await mine(userId, id);
  if (!h) return { error: "not found" as const };
  if (h.state !== "open" || !h.test)
    return { error: "no test to accept" as const };
  const code = h.test.code;
  const names = Object.fromEntries(
    (await getMetricRows(userId)).map((r) => [
      r.code,
      [r.name, r.unit] as const,
    ]),
  );
  const predictions = code
    ? predictionsOf(
        h.explanations ?? [],
        h.test,
        names[code]?.[0] ?? h.test.name,
        names[code]?.[1] ?? null,
      )
    : null;
  const now = new Date();
  await getDb()
    .update(hunches)
    .set({ predictions, writtenAt: now, state: "testing", updatedAt: now })
    .where(eq(hunches.id, h.id));
  if (code) {
    const due = new Date(now.getTime() + 28 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    // ponytail: four weeks out, like a short "Plan retest"; the goal's FK to
    // `metrics` means a test code with no metric row is skipped, not planned.
    await getDb()
      .insert(goalsTable)
      .values({
        userId,
        metricCode: code,
        due,
        note: `hunch test: ${h.test.name}`,
      })
      .onConflictDoNothing()
      .catch(() => undefined);
  }
  return { ok: true as const };
}

/** Good news, "Got it". */
export async function seeHunch(userId: string, id: string) {
  const h = await mine(userId, id);
  if (!h) return { error: "not found" as const };
  await getDb()
    .update(hunches)
    .set({ seenAt: new Date(), updatedAt: new Date() })
    .where(eq(hunches.id, h.id));
  return { ok: true as const };
}

export async function hunchRows(userId: string): Promise<Hunch[]> {
  return getDb()
    .select()
    .from(hunches)
    .where(eq(hunches.userId, userId))
    .orderBy(desc(hunches.openedAt));
}

export { mine as hunchOf };
