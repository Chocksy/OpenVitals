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
import { generateObject } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  beliefSnapshots,
  getDb,
  goals as goalsTable,
  hkbConditions,
  hkbEvidence,
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
import { getMetricRows, type MetricRow } from "./data";
import { model } from "./extract";
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

/* ── pure: the closed list ─────────────────────────────────────────────── */

export interface EvidenceRow {
  conditionId: string;
  conditionName: string;
  featureId: string;
  conditionOn: Record<string, unknown>;
  lrPos: number;
  grade: string;
  source: string;
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
      });
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

const toExplanation = (c: Cause, text = c.name): HunchExplanation => ({
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
}

export async function personOf(userId: string, today: string): Promise<Person> {
  const db = getDb();
  const [rows, goalRows, factRows, graph, evidence, testRows, snap] =
    await Promise.all([
      getMetricRows(userId),
      db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
      db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
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
        })
        .from(hkbEvidence)
        .innerJoin(hkbConditions, eq(hkbConditions.id, hkbEvidence.conditionId))
        .where(inArray(hkbEvidence.status, ["seed", "accepted"])),
      db.select().from(hkbTests),
      db
        .select({ beliefs: beliefSnapshots.beliefs })
        .from(beliefSnapshots)
        .where(eq(beliefSnapshots.userId, userId))
        .orderBy(desc(beliefSnapshots.computedAt))
        .limit(1),
    ]);
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
    })),
    beliefs: snap[0]?.beliefs ?? null,
    known: new Set(
      markers
        .filter((m) => m.points.some((p) => last3.has(p.date)))
        .map((m) => m.code),
    ),
  };
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
    const { object } = await generateObject({
      model: model(),
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

function testFor(s: Signal, expl: HunchExplanation[], person: Person) {
  if (s.kind === "good_news") return null;
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

export interface Refreshed {
  asOf: string | null;
  raised: Signal[];
  unraised: Signal[];
  explainedBy: Record<string, "model" | "rules">;
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
): Promise<Refreshed> {
  const db = getDb();
  const person = await personOf(userId, today);
  const { raised, unraised, asOf } = signalsOf(person.input);
  const explainedBy: Refreshed["explainedBy"] = {};
  if (!asOf) return { asOf, raised, unraised, explainedBy };
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

  // 2. One row per raised key.
  for (const s of raised) {
    const signal = { ...s, asOf } as unknown as Record<string, unknown>;
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
      : await explain(s, closedList(s, person.input.causes), person);
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
