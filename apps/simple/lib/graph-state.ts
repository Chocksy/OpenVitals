/**
 * The personal overlay on the static graph: which nodes are hot for this
 * person, which edges are live, and why. Pure, so `/plan`, the context pack
 * and the tests all call the same function.
 *
 * ponytail: no `user_graph_state` table in this phase. The whole thing is a
 * few hundred additions over ~140 nodes, so it is cheaper to recompute than to
 * store and invalidate.
 */
import type { ModelInput } from "./coverage";
import {
  NODES,
  SYSTEMS,
  type GraphEdge,
  type GraphNode,
  type SystemId,
} from "./graph";
import { CODE_GRAPH, loadGraph, type Graph } from "./kg";
import { matchPatterns, type PatternMatch } from "./patterns";
import type { Status } from "./status";
import { VECTORS } from "./vectors";

export interface NodeState {
  id: string;
  importance: number;
  reasons: string[];
}

export interface ActiveEdge extends GraphEdge {
  impact: number;
  overriddenConfidence?: GraphEdge["confidence"];
  /** Why this edge applies to this person, one clause at a time. */
  whenReasons?: string[];
}

export interface GraphState {
  nodes: NodeState[];
  activeEdges: ActiveEdge[];
  hot: NodeState[];
  patterns: PatternMatch[];
}

const SEVERITY = { red: 0.4, amber: 0.25, green: 0, gray: 0 } as const;
const CONFIDENCE_WEIGHT = {
  established: 3,
  probable: 2,
  speculative: 1,
} as const;
const ACTIVE_AT = 0.15;

/** The keyword a family-history or conditions answer would use per system. */
const SYSTEM_KEYWORDS: Record<SystemId, RegExp> = {
  lipids: /heart|cardiac|infarct|\bmi\b|stroke|cholesterol/i,
  metabolic: /diabet|insulin resist|metabolic/i,
  liver: /liver|hepat|fatty/i,
  kidney: /kidney|renal|nephro/i,
  thyroid: /thyroid|hashimoto|graves/i,
  sex_hormones: /prostate|breast|menopaus|testosterone|pcos/i,
  adrenal: /adrenal|cortisol|cushing/i,
  inflammation: /cancer|arthrit|autoimmun|inflammat/i,
  blood: /cancer|anaem|anemia|leuk|lymphoma/i,
  iron: /anaem|anemia|haemochromatos|hemochromatos/i,
  vitamins: /osteopor|deficien|b12|pernicious/i,
  lifestyle: /smok|alcohol|apnoea|apnea|obes/i,
};

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const round = (v: number) => Math.round(v * 100) / 100;

const code = (node: GraphNode) =>
  node.kind === "metric" ? node.id.slice(7) : null;

/** How far outside the optimal band a value sits, in raw units. */
function distance(
  value: number,
  low: number | null,
  high: number | null,
): number {
  if (low != null && value < low) return low - value;
  if (high != null && value > high) return value - high;
  return 0;
}

/** Is this metric's vector past its staleDays? */
function isStale(m: ModelInput, metricCode: string): boolean {
  const row = m.latest[metricCode];
  if (!row?.date) return false;
  const vector = VECTORS.find((v) => v.codes?.includes(metricCode));
  if (!vector) return false;
  const days = Math.floor(
    (new Date(m.today).getTime() - new Date(row.date).getTime()) / 86_400_000,
  );
  return days > vector.staleDays;
}

/** Node ids a matched pattern names: its edges' endpoints and its systems. */
function namedByPattern(match: PatternMatch, edges: GraphEdge[]): Set<string> {
  const ids = new Set<string>();
  const edgeIds = new Set([
    ...edges
      .filter((e) => e.when?.pattern === match.pattern.id)
      .map((e) => e.id),
    ...(match.pattern.effects.edgeOverrides ?? []).map((o) => o.edgeId),
  ]);
  for (const edge of edges) {
    if (!edgeIds.has(edge.id)) continue;
    ids.add(edge.from);
    ids.add(edge.to);
  }
  for (const target of Object.keys(match.pattern.effects.targets ?? {}))
    ids.add(`metric:${target}`);
  for (const system of Object.keys(
    match.pattern.effects.systemPriority ?? {},
  )) {
    ids.add(`system:${system}`);
    const headline = SYSTEMS.find((s) => s.id === system)?.headline ?? [];
    for (const c of headline) ids.add(`metric:${c}`);
  }
  return ids;
}

/** "21:00" and "9pm" and "21" are all 21. Minutes count, so 21:30 is 21.5. */
export function parseHour(raw: unknown): number | null {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase();
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  if (!Number.isFinite(hour) || hour > 24 || minutes > 59) return null;
  if (m[3] === "pm" && hour < 12) hour += 12;
  if (m[3] === "am" && hour === 12) hour = 0;
  return hour + minutes / 60;
}

const asNumber = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : parseHour(raw);
};

const readable = (key: string) => key.replace(/_/g, " ");

const answer = (m: ModelInput, key: string): string => {
  const raw = m.profile[key];
  return Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
};

/** The profile fact a `fact:genome:<gene>` node writes, e.g. `genome:apoe`. */
const genomeFactKey = (gene: string, nodes: GraphNode[]): string =>
  nodes.find((n) => n.id === `fact:genome:${gene}`)?.codes?.[0] ??
  `genome:${gene.toLowerCase()}`;

export interface WhenVerdict {
  holds: boolean;
  /** One line per clause that holds: the "for you: ..." chip. */
  reasons: string[];
  /** The first clause that failed: the "not for you" chip. */
  failed?: string;
}

/**
 * Does this edge's `when` hold for this person, and why?
 *
 * Every clause has to hold. `reasons` is what the pathograph prints next to a
 * live edge ("fast metaboliser, last coffee 13:00"); `failed` is what it
 * prints next to a faint one. Nothing here reads the database.
 */
export function evaluateWhen(
  edge: GraphEdge,
  m: ModelInput,
  matched: Set<string>,
  nodes: GraphNode[] = NODES,
): WhenVerdict {
  const w = edge.when;
  const reasons: string[] = [];
  if (!w) return { holds: true, reasons };
  const no = (failed: string): WhenVerdict => ({
    holds: false,
    reasons,
    failed,
  });

  if (w.pattern) {
    if (!matched.has(w.pattern))
      return no(`the ${w.pattern} pattern does not match you`);
    reasons.push(`pattern ${w.pattern}`);
  }
  if (w.sex) {
    if (m.sex !== w.sex) return no(`only in ${w.sex}s`);
    reasons.push(w.sex);
  }

  for (const clause of [w.fact, ...(w.facts ?? [])]) {
    if (!clause) continue;
    const { key, includes, equals, oneOf, above, below } = clause;
    const text = answer(m, key);
    if (!text.trim()) return no(`you have not answered "${readable(key)}" yet`);
    if (includes && !text.toLowerCase().includes(includes.toLowerCase()))
      return no(`${readable(key)} is "${text}", not "${includes}"`);
    if (equals && text.trim().toLowerCase() !== equals.toLowerCase())
      return no(`${readable(key)} is "${text}", not "${equals}"`);
    if (
      oneOf?.length &&
      !oneOf.some((o) => o.toLowerCase() === text.trim().toLowerCase())
    )
      return no(
        `${readable(key)} is "${text}", not one of ${oneOf.join(", ")}`,
      );
    if (above != null || below != null) {
      const value = asNumber(text);
      if (value == null)
        return no(`${readable(key)} "${text}" is not a number`);
      if (above != null && value < above)
        return no(`${readable(key)} ${text} is below ${above}`);
      if (below != null && value > below)
        return no(`${readable(key)} ${text} is above ${below}`);
    }
    reasons.push(`${readable(key)} ${text}`);
  }

  if (w.genome) {
    const { gene, genotype } = w.genome;
    const call = answer(m, genomeFactKey(gene, nodes));
    if (!call.trim()) return no(`${gene} has not been called from your genome`);
    if (!call.toLowerCase().includes(genotype.toLowerCase()))
      return no(`your ${gene} call is "${call}", not "${genotype}"`);
    reasons.push(`${gene} ${call}`);
  }

  if (w.age) {
    if (m.age == null) return no("we do not know your age yet");
    if (w.age.min != null && m.age < w.age.min)
      return no(`only over ${w.age.min}`);
    if (w.age.max != null && m.age > w.age.max)
      return no(`only under ${w.age.max}`);
    reasons.push(`age ${m.age}`);
  }

  if (w.hoursBefore) {
    const { eventFact, threshold } = w.hoursBefore;
    const event = parseHour(m.profile[eventFact]);
    const bed = parseHour(m.profile[BEDTIME_FACT]);
    if (event == null)
      return no(`you have not answered "${readable(eventFact)}" yet`);
    if (bed == null) return no(`you have not answered "bedtime hour" yet`);
    const gap = (bed - event + 24) % 24;
    if (gap >= threshold)
      return no(
        `${readable(eventFact)} is ${gap.toFixed(1)} h before bed, more than ${threshold}`,
      );
    reasons.push(
      `${readable(eventFact)} ${answer(m, eventFact)}, ${gap.toFixed(1)} h before bed`,
    );
  }

  const side = (endpoint: string, want: "high" | "low", label: string) => {
    if (!endpoint.startsWith("metric:")) return false;
    const row = m.latest[endpoint.slice(7)];
    if (row?.value == null) return false;
    if (row.status !== "red" && row.status !== "amber") return false;
    const mid = row.optimalHigh ?? row.refHigh;
    const floor = row.optimalLow ?? row.refLow;
    const ok =
      want === "high"
        ? mid != null && row.value > mid
        : floor != null && row.value < floor;
    if (ok) reasons.push(`${label} ${want}`);
    return ok;
  };
  if (w.from && !side(edge.from, w.from, readable(edge.from.slice(7))))
    return no(`${readable(edge.from.slice(7))} is not ${w.from} for you`);
  if (w.to && !side(edge.to, w.to, readable(edge.to.slice(7))))
    return no(`${readable(edge.to.slice(7))} is not ${w.to} for you`);

  return { holds: true, reasons };
}

/** The bedtime answer every `hoursBefore` clause measures against. */
export const BEDTIME_FACT = "bedtime_hour";

/**
 * Importance per the knowledge-graph doc section 3, then one round of
 * propagation along the active edges.
 */
export function computeGraphState(
  m: ModelInput,
  opts: {
    focus?: string[];
    adoptedCodes?: string[];
    top?: number;
    /** The graph to reason over. Defaults to the one compiled into the app. */
    graph?: Graph;
  } = {},
): GraphState {
  const { nodes: allNodes, edges: allEdges } = opts.graph ?? CODE_GRAPH;
  const patterns = matchPatterns(m);
  const matched = patterns.filter((p) => p.matched);
  const matchedIds = new Set(matched.map((p) => p.pattern.id));

  const patternNames = new Map<string, string[]>();
  for (const match of matched)
    for (const id of namedByPattern(match, allEdges))
      patternNames.set(id, [...(patternNames.get(id) ?? []), match.pattern.id]);

  const history = [m.profile.family_history, m.profile.conditions]
    .flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v ?? "")]))
    .join(", ");
  const focus = (opts.focus ?? [])
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  const adopted = new Set(opts.adoptedCodes ?? []);

  const state = new Map<string, NodeState>();
  for (const node of allNodes) {
    const reasons: string[] = [];
    let importance = 0;
    const metricCode = code(node);

    if (metricCode) {
      const row = m.latest[metricCode];
      if (row?.value != null) {
        importance += SEVERITY[row.status];
        if (row.status !== "green" && row.status !== "gray")
          reasons.push(
            `${metricCode} ${row.value}${row.unit ? ` ${row.unit}` : ""} ${row.status} against optimal ${row.optimalLow ?? "-"}..${row.optimalHigh ?? "-"}`,
          );
        if (
          row.prev != null &&
          distance(row.value, row.optimalLow, row.optimalHigh) >
            distance(row.prev, row.optimalLow, row.optimalHigh)
        ) {
          importance += 0.1;
          reasons.push(`moved away from optimal, was ${row.prev}`);
        }
        if (isStale(m, metricCode)) {
          importance -= 0.1;
          reasons.push("reading is stale");
        }
      }
      if (adopted.has(metricCode)) {
        importance += 0.1;
        reasons.push("an adopted action targets it");
      }
    }

    // A behaviour, a symptom answer or a genotype call is only in play once
    // the person has answered it. That is what makes a conditional edge
    // reachable at all: both its endpoints have to be warm.
    if (
      node.kind === "fact" ||
      node.kind === "behavior" ||
      node.kind === "gene"
    ) {
      const key = node.codes?.find((c) => answer(m, c).trim());
      if (key) {
        importance += 0.2;
        reasons.push(`you answered ${readable(key)}: ${answer(m, key)}`);
      }
    }

    const named = patternNames.get(node.id);
    if (named?.length) {
      importance += 0.3;
      reasons.push(...named.map((id) => `pattern:${id}`));
    }

    if (node.system && SYSTEM_KEYWORDS[node.system].test(history)) {
      importance += 0.2;
      reasons.push("family history or a condition names this system");
    }

    if (
      focus.length &&
      focus.some(
        (f) =>
          f.includes(node.name.toLowerCase()) ||
          node.name.toLowerCase().includes(f) ||
          (node.system != null && f.includes(node.system.replace("_", " "))),
      )
    ) {
      importance += 0.2;
      reasons.push("you said this is what you care about");
    }

    state.set(node.id, { id: node.id, importance: clamp(importance), reasons });
  }

  // A system is as hot as its hottest member.
  for (const system of SYSTEMS) {
    const node = state.get(`system:${system.id}`);
    if (!node) continue;
    const members = allNodes.filter(
      (n) => n.kind === "metric" && n.system === system.id,
    );
    const worst = Math.max(
      node.importance,
      ...members.map((n) => state.get(n.id)?.importance ?? 0),
    );
    node.importance = clamp(worst);
  }

  const overrides = new Map<
    string,
    { confidence?: GraphEdge["confidence"]; note: string }
  >();
  for (const match of matched)
    for (const o of match.pattern.effects.edgeOverrides ?? [])
      overrides.set(o.edgeId, o);

  const activeEdges: ActiveEdge[] = [];
  for (const edge of allEdges) {
    const from = state.get(edge.from);
    const to = state.get(edge.to);
    if (!from || !to) continue;
    if (from.importance < ACTIVE_AT || to.importance < ACTIVE_AT) continue;
    const verdict = evaluateWhen(edge, m, matchedIds, allNodes);
    if (!verdict.holds) continue;
    const override = overrides.get(edge.id);
    const confidence = override?.confidence ?? edge.confidence;
    activeEdges.push({
      ...edge,
      mechanism: override?.note
        ? `${edge.mechanism} (${override.note})`
        : edge.mechanism,
      confidence,
      overriddenConfidence: override?.confidence,
      whenReasons: verdict.reasons.length ? verdict.reasons : undefined,
      impact: round(
        edge.strength * CONFIDENCE_WEIGHT[confidence] * from.importance,
      ),
    });
  }

  // One pass: a hot thyroid warms lipids.
  for (const edge of activeEdges) {
    const from = state.get(edge.from)!;
    const to = state.get(edge.to)!;
    to.importance = clamp(
      to.importance + 0.5 * (edge.strength / 3) * from.importance,
    );
    to.reasons.push(`via ${edge.id}`);
  }

  const nodes = [...state.values()].map((n) => ({
    ...n,
    importance: round(n.importance),
  }));
  const hot = nodes
    .filter((n) => n.importance > 0)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, opts.top ?? 25);

  return {
    nodes,
    activeEdges: activeEdges.sort((a, b) => b.impact - a.impact),
    hot,
    patterns,
  };
}

const STATUS_RANK: Record<Status, number> = {
  red: 3,
  amber: 2,
  green: 1,
  gray: 0,
};

/**
 * The member metric this person should look at first in this system: worst
 * status wins, importance breaks the tie. Shared by /graph and the Home strip.
 */
export function worstMember(
  system: SystemId,
  m: ModelInput,
  importance: Map<string, number>,
  nodes: GraphNode[] = NODES,
): { node: GraphNode; code: string } | null {
  let best: { node: GraphNode; code: string; rank: number } | null = null;
  for (const node of nodes) {
    if (node.kind !== "metric" || node.system !== system) continue;
    const metricCode = node.id.slice(node.id.indexOf(":") + 1);
    const row = m.latest[metricCode];
    if (row?.value == null) continue;
    const rank = STATUS_RANK[row.status] * 10 + (importance.get(node.id) ?? 0);
    if (!best || rank > best.rank) best = { node, code: metricCode, rank };
  }
  return best ? { node: best.node, code: best.code } : null;
}

/**
 * The personal state over the graph in the database, with the in-code graph as
 * the fallback. Every async caller (`/graph`, `/plan`, the report, the ledger)
 * uses this; `computeGraphState` stays pure for the tests.
 */
export async function graphState(
  m: ModelInput,
  opts: { focus?: string[]; adoptedCodes?: string[]; top?: number } = {},
): Promise<GraphState> {
  return computeGraphState(m, { ...opts, graph: await loadGraph() });
}
