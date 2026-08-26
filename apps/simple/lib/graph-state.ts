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
  EDGES,
  NODES,
  SYSTEMS,
  type GraphEdge,
  type GraphNode,
  type SystemId,
} from "./graph";
import { matchPatterns, type PatternMatch } from "./patterns";
import { VECTORS } from "./vectors";

export interface NodeState {
  id: string;
  importance: number;
  reasons: string[];
}

export interface ActiveEdge extends GraphEdge {
  impact: number;
  overriddenConfidence?: GraphEdge["confidence"];
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
function namedByPattern(match: PatternMatch): Set<string> {
  const ids = new Set<string>();
  const edgeIds = new Set([
    ...EDGES.filter((e) => e.when?.pattern === match.pattern.id).map(
      (e) => e.id,
    ),
    ...(match.pattern.effects.edgeOverrides ?? []).map((o) => o.edgeId),
  ]);
  for (const edge of EDGES) {
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

/** Does this edge's `when` hold for this person? */
function whenHolds(
  edge: GraphEdge,
  m: ModelInput,
  matched: Set<string>,
): boolean {
  const w = edge.when;
  if (!w) return true;
  if (w.pattern && !matched.has(w.pattern)) return false;
  if (w.sex && m.sex !== w.sex) return false;
  if (w.fact) {
    const raw = m.profile[w.fact.key];
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    if (!text.toLowerCase().includes(w.fact.includes.toLowerCase()))
      return false;
  }
  const side = (endpoint: string, want: "high" | "low") => {
    if (!endpoint.startsWith("metric:")) return false;
    const row = m.latest[endpoint.slice(7)];
    if (row?.value == null) return false;
    if (row.status !== "red" && row.status !== "amber") return false;
    const mid = row.optimalHigh ?? row.refHigh;
    const floor = row.optimalLow ?? row.refLow;
    return want === "high"
      ? mid != null && row.value > mid
      : floor != null && row.value < floor;
  };
  if (w.from && !side(edge.from, w.from)) return false;
  if (w.to && !side(edge.to, w.to)) return false;
  return true;
}

/**
 * Importance per the knowledge-graph doc section 3, then one round of
 * propagation along the active edges.
 */
export function computeGraphState(
  m: ModelInput,
  opts: { focus?: string[]; adoptedCodes?: string[]; top?: number } = {},
): GraphState {
  const patterns = matchPatterns(m);
  const matched = patterns.filter((p) => p.matched);
  const matchedIds = new Set(matched.map((p) => p.pattern.id));

  const patternNames = new Map<string, string[]>();
  for (const match of matched)
    for (const id of namedByPattern(match))
      patternNames.set(id, [...(patternNames.get(id) ?? []), match.pattern.id]);

  const history = [m.profile.family_history, m.profile.conditions]
    .flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v ?? "")]))
    .join(", ");
  const focus = (opts.focus ?? [])
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  const adopted = new Set(opts.adoptedCodes ?? []);

  const state = new Map<string, NodeState>();
  for (const node of NODES) {
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
    const node = state.get(`system:${system.id}`)!;
    const members = NODES.filter(
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
  for (const edge of EDGES) {
    const from = state.get(edge.from);
    const to = state.get(edge.to);
    if (!from || !to) continue;
    if (from.importance < ACTIVE_AT || to.importance < ACTIVE_AT) continue;
    if (!whenHolds(edge, m, matchedIds)) continue;
    const override = overrides.get(edge.id);
    const confidence = override?.confidence ?? edge.confidence;
    activeEdges.push({
      ...edge,
      mechanism: override?.note
        ? `${edge.mechanism} (${override.note})`
        : edge.mechanism,
      confidence,
      overriddenConfidence: override?.confidence,
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
