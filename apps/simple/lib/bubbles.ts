/**
 * The bubbles picture: one circle per node of this person's graph, filled by
 * state, outlined by kind, sized by how much it matters, with the edges between
 * them. A port of `docs/mockups/brain-bubbles.html`, with the mockup's four
 * illustrative personas replaced by the real thing: `graphState` for the nodes
 * and the edges, `scoreHypotheses` for the conditions, `nextMoves` for what
 * would change them. Nothing here calls a model.
 *
 * Everything is pure and deterministic, positions included, so the same person
 * renders the same picture on the server and after hydration. ponytail: no d3.
 * `layout` is a fixed number of ticks of spring + repulsion + collision, seeded
 * off a golden-angle spiral, which is the part of `forceSimulation` the picture
 * actually uses; 300 ticks over ~30 bodies is under a millisecond.
 */
import { asksFromMoves, type Ask } from "./asking";
import type { ModelInput } from "./coverage";
import {
  gradeOfEdge,
  type GraphEdge,
  type GraphNode,
  type Relation,
} from "./graph";
import {
  explainInput,
  explainKey,
  type CalledRow,
} from "./explain";
import { evaluateWhen, type GraphState } from "./graph-state";
import {
  isRiskState,
  type Grade,
  type HypothesisResult,
  type HState,
  type Lens,
} from "./hypotheses";
import { byRank, displayNameOf, titleOf } from "./ledger";
import type { Move } from "./infogain";
import type { Graph } from "./kg";

/**
 * The outlines. "test" is its own since phase 24a: a test bubble is not a
 * marker you have, it is a thing worth doing, and it is sized by what it would
 * settle rather than by what it says about you.
 */
export type BubbleKind = "marker" | "cond" | "life" | "gene" | "test";

/** The mockup's fill states, minus `event` and `low` (see the deviations). */
export type BubbleState =
  | "high"
  | "amber"
  | "ok"
  | "yes"
  | "gene"
  | "unknown"
  | "faint";

/** Under this a condition is "ruled out" and hidden, as it is everywhere else. */
export const RULED_OUT = 0.05;

/** How many bubbles the stage draws before it stops. */
export const BUBBLE_LIMIT = 28;

/** How many conditions get a bubble of their own. */
export const CONDITION_LIMIT = 8;

/** And how many of the dismissed ones join them when they are asked for. */
export const RULED_OUT_LIMIT = 16;

/** The logical box `layout` works in. The client fits it to the viewport. */
export const STAGE = { w: 1200, h: 780 };

/** Graph condition nodes whose id is not the hypothesis id. */
const HYPOTHESIS_ALIAS: Record<string, string> = {
  osa: "sleep_apnoea",
  coeliac: "coeliac_disease",
};

const KIND_OF: Record<GraphNode["kind"], BubbleKind> = {
  metric: "marker",
  test: "test",
  condition: "cond",
  risk: "cond",
  behavior: "life",
  fact: "life",
  intervention: "life",
  phenotype: "life",
  gene: "gene",
  system: "marker", // never drawn: systems stay in the deep view
};

// The mockup's palette lives in `components/bubbles.tsx`: this module reaches
// `lib/kg.ts` and therefore Postgres, so nothing in it may be imported by a
// client component at runtime. The client takes the types only.

export interface Bubble {
  /** a graph node id, or `belief:<hypothesis id>` for a condition with no node */
  id: string;
  kind: BubbleKind;
  name: string;
  /** one line of plain language: the node's note or the condition's summary */
  what: string;
  /** 0..1, what the radius is drawn from */
  imp: number;
  st: BubbleState;
  /** the metric code, when this is a marker that has one */
  code?: string;
  /** "18 ng/mL", when there is a reading */
  value?: string;
  /** the profile answer, when this is a life or gene bubble */
  answer?: string;
  /** the hypothesis this bubble is, when it is a condition the engine scores */
  belief?: string;
  x: number;
  y: number;
  r: number;
}

export interface BubbleLink {
  id: string;
  from: string;
  to: string;
  relation: Relation;
  confidence: GraphEdge["confidence"];
  grade: Grade;
  strength: number;
  mechanism: string;
  /** true for you, false not for you, null waiting on an answer. */
  on: boolean | null;
  /** why it holds, or the clause that failed, or what it is still waiting on. */
  why?: string;
  /** `graph` is a real edge; `belief` is a discriminator the engine would read. */
  source: "graph" | "belief";
}

/**
 * One line of evidence for the panel. `text` is the sentence `explainInput`
 * writes; the panel is a client component, so it is written here on the server
 * rather than pulling the whole catalog into the browser bundle.
 */
export interface EvidenceText {
  rule: string;
  input: string;
  value: string;
  lr: number;
  grade: Grade;
  text: string;
}

/** Everything the panel prints about one condition, already computed. */
export interface BubbleBelief {
  id: string;
  name: string;
  /** "Cardiovascular risk: raised" — the same grammar the ledger prints */
  title: string;
  /** a risk state, not a disease */
  risk?: true;
  p: number;
  state: HState;
  summary: string;
  /** the lens weight 0..3 that sized the bubble */
  weight: number;
  for: EvidenceText[];
  against: EvidenceText[];
  missing: string[];
  /** the moves that would change this one, best first */
  moves: {
    kind: Move["kind"];
    label: string;
    cost: number;
    priced?: boolean;
    from: number;
    to: number;
  }[];
}

export interface BubbleGraph {
  nodes: Bubble[];
  links: BubbleLink[];
  beliefs: BubbleBelief[];
  /**
   * The questions worth answering, one entry per fact key with every condition
   * each would move. The panel prints them once; the answer is taken on Home.
   */
  asks: Ask[];
  /** conditions under 5 %, scored and dismissed, not drawn */
  ruledOut: number;
  /** the mockup's hint line under the stage */
  hint: string;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** The mockup's radius curve. */
export const radiusOf = (imp: number) => round2(10 + clamp01(imp) * 44);

/** The answer to any of a node's profile keys, as text. */
function answerOf(m: ModelInput, node: GraphNode): string {
  for (const key of node.codes ?? []) {
    const raw = m.profile[key];
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    if (text.trim()) return text.trim();
  }
  return "";
}

/** A clause that failed only because the person has not said anything yet. */
const WAITING = /not answered|not been called|do not know|has not/i;

/* ── layout ───────────────────────────────────────────────────────────── */

export interface Body {
  id: string;
  imp: number;
  r: number;
  x: number;
  y: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * A deterministic force relaxation: heaviest bubble nearest the middle, springs
 * along the edges, everything pushing everything else apart, and a collision
 * pass so no two circles overlap. No randomness anywhere, so the same person
 * gets the same picture every time and the test can assert it.
 */
export function layout(
  bodies: Body[],
  links: { from: string; to: string; on: boolean | null }[],
  ticks = 300,
): void {
  const n = bodies.length;
  if (!n) return;
  const cx = STAGE.w / 2;
  const cy = STAGE.h / 2;
  const spread = Math.min(STAGE.w, STAGE.h) * 0.46;

  // Seed: a golden-angle spiral, biggest first, so the picture starts from the
  // middle outwards rather than from a random cloud.
  const order = [...bodies].sort(
    (a, b) => b.imp - a.imp || (a.id < b.id ? -1 : 1),
  );
  order.forEach((body, rank) => {
    const t = (rank + 0.5) / n;
    const angle = rank * GOLDEN;
    body.x = cx + spread * Math.sqrt(t) * Math.cos(angle) * 1.25;
    body.y = cy + spread * Math.sqrt(t) * Math.sin(angle) * 0.8;
  });

  const at = new Map(bodies.map((b) => [b.id, b]));
  const springs = links
    .map((l) => ({ a: at.get(l.from), b: at.get(l.to), on: l.on }))
    .filter(
      (l): l is { a: Body; b: Body; on: boolean | null } => !!l.a && !!l.b,
    );

  for (let step = 0; step < ticks; step++) {
    const alpha = 1 - step / ticks;

    for (const { a, b, on } of springs) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const want = a.r + b.r + 80;
      const k = (on === false ? 0.04 : 0.14) * alpha;
      const shift = ((d - want) / d) * k;
      a.x += dx * shift;
      a.y += dy * shift;
      b.x -= dx * shift;
      b.y -= dy * shift;
    }

    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = (i - j) * 0.5;
          dy = 0.5;
          d = Math.hypot(dx, dy);
        }
        // The gap is wide enough for the label that hangs under a small bubble.
        const min = a.r + b.r + 46;
        // collision first: it is the only thing that has to hold at the end
        const push =
          d < min
            ? (min - d) / 2 / d
            : (Math.min(2600 / (d * d), 6) * alpha) / d;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }

    for (const body of bodies) {
      body.x += (cx - body.x) * 0.014 * alpha;
      body.y += (cy - body.y) * 0.014 * alpha;
    }
  }

  for (const body of bodies) {
    body.x = round2(body.x);
    body.y = round2(body.y);
  }
}

/* ── the picture ──────────────────────────────────────────────────────── */

export interface BubbleOptions {
  graph: Graph;
  state: GraphState;
  m: ModelInput;
  beliefs: HypothesisResult[];
  moves: Move[];
  lens: Lens;
  /** the ids of the patterns that matched, for `evaluateWhen` */
  matched: Set<string>;
  /** this person's genome calls, so a gene bubble prints its own sentence */
  genome?: CalledRow[];
  /** draw the conditions the engine scored and dismissed too */
  showRuledOut?: boolean;
  limit?: number;
}

/** The mockup's condition fill bands, off the posterior. */
const conditionState = (p: number): BubbleState =>
  p >= 0.6
    ? "high"
    : p >= 0.25
      ? "amber"
      : p >= RULED_OUT
        ? "unknown"
        : "faint";

/** How much a condition matters here: the mockup's `0.15 + p × lens × 0.5`. */
const conditionImportance = (p: number, weight: number) =>
  clamp01(0.15 + p * weight * 0.5);

/**
 * A test bubble is sized by how much it would settle, not by how much it
 * matters. The OGTT was the biggest circle on the page for a person whose
 * type-2 diabetes sits at 9 %, which is the information-gain engine being
 * right and the picture saying the wrong thing. Same curve as a condition, on
 * gain relative to the best test on the table.
 */
const testImportance = (gain: number, best: number) =>
  clamp01(0.15 + (best > 0 ? gain / best : 0) * 0.5);

/** A move's name against a test node's, both stripped to letters and digits. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The best information gain among the moves that name this test node. */
function gainOfTest(node: GraphNode, moves: Move[]): number {
  const id = slug(node.id.slice(node.id.indexOf(":") + 1));
  const name = slug(node.name);
  let best = 0;
  for (const m of moves) {
    if (m.kind !== "test") continue;
    const label = slug(m.label);
    const test = m.testId ? slug(m.testId) : "";
    const hit =
      label === name ||
      name.includes(label) ||
      label.includes(name) ||
      (!!test && (test === id || id.includes(test) || test.includes(id)));
    if (hit && m.gain > best) best = m.gain;
  }
  return best;
}

function markerState(m: ModelInput, code: string | undefined): BubbleState {
  const row = code ? m.latest[code] : undefined;
  if (row?.value == null) return "unknown";
  if (row.status === "red") return "high";
  if (row.status === "amber") return "amber";
  if (row.status === "green") return "ok";
  return "unknown";
}

/** The whole picture for one person: bubbles, links, beliefs, hint. */
export function buildBubbles(opts: BubbleOptions): BubbleGraph {
  const { graph, state, m, beliefs, moves, lens, matched } = opts;
  const limit = opts.limit ?? BUBBLE_LIMIT;

  const importance = new Map(state.nodes.map((n) => [n.id, n.importance]));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const belief = new Map(beliefs.map((b) => [b.id, b]));
  const hypothesisOf = (node: GraphNode): HypothesisResult | undefined => {
    if (node.kind !== "condition") return undefined;
    const key = node.id.slice(node.id.indexOf(":") + 1);
    return belief.get(HYPOTHESIS_ALIAS[key] ?? key);
  };

  /* the conditions, ranked the way the ledger ranks them */
  const weightOf = (b: HypothesisResult) => b.lenses[lens]?.w ?? 1;
  const matters = (a: HypothesisResult, b: HypothesisResult) =>
    b.score * (weightOf(b) || 1) - a.score * (weightOf(a) || 1) ||
    (a.id < b.id ? -1 : 1);
  const onTable = beliefs
    .filter((b) => b.score >= RULED_OUT)
    .sort(matters)
    .slice(0, CONDITION_LIMIT);
  // The ruled-out ones only ever arrive as extras, drawn faint and last, so
  // asking for them never pushes a live condition off the stage.
  const dismissed = beliefs
    .filter((b) => b.score < RULED_OUT)
    .sort(matters)
    .slice(0, RULED_OUT_LIMIT);
  const drawnBeliefs = opts.showRuledOut ? [...onTable, ...dismissed] : onTable;
  const drawnBeliefIds = new Set(drawnBeliefs.map((b) => b.id));
  const ruledOut = beliefs.filter((b) => b.score < RULED_OUT).length;

  /* the graph nodes, hottest first, the well-connected ones breaking ties */
  const candidates = graph.nodes.filter((n) => n.kind !== "system");
  const bestGain = Math.max(
    0,
    ...candidates
      .filter((n) => n.kind === "test")
      .map((n) => gainOfTest(n, moves)),
  );
  const impOf = (n: GraphNode): number => {
    const h = hypothesisOf(n);
    if (h) return conditionImportance(h.score, weightOf(h) || 1);
    if (n.kind === "test") {
      const gain = gainOfTest(n, moves);
      if (gain > 0) return testImportance(gain, bestGain);
    }
    return importance.get(n.id) ?? 0;
  };
  const rank = impOf;
  const chosen = [...candidates]
    .sort(
      (a, b) =>
        rank(b) - rank(a) ||
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, limit);

  /**
   * The catalog's own sentence about this person's call, which is the best
   * writing in the app and used to live only on the upload page.
   */
  const genomeByFact = new Map(
    (opts.genome ?? [])
      .filter((r) => r.result)
      .map((r) => [r.row.factKey, r.result!.meaning]),
  );
  const geneSentence = (node: GraphNode): string | undefined =>
    node.kind === "gene"
      ? node.codes?.map((k) => genomeByFact.get(k)).find(Boolean)
      : undefined;

  const nodes: Bubble[] = [];
  const drawn = new Set<string>();

  for (const node of chosen) {
    const hypothesis = hypothesisOf(node);
    if (hypothesis && !drawnBeliefIds.has(hypothesis.id)) continue;
    const code = node.kind === "metric" ? node.codes?.[0] : undefined;
    const row = code ? m.latest[code] : undefined;
    const answer = answerOf(m, node);
    const imp = impOf(node);
    const st: BubbleState = hypothesis
      ? conditionState(hypothesis.score)
      : node.kind === "gene"
        ? answer
          ? "gene"
          : "unknown"
        : node.kind === "metric" || node.kind === "test"
          ? markerState(m, code)
          : answer
            ? "yes"
            : "unknown";
    nodes.push({
      id: node.id,
      kind: KIND_OF[node.kind],
      name: node.name,
      what: hypothesis?.summary ?? geneSentence(node) ?? node.note ?? "",
      imp: round2(imp),
      st,
      ...(code ? { code } : {}),
      ...(row?.value != null
        ? { value: `${row.value}${row.unit ? ` ${row.unit}` : ""}` }
        : {}),
      ...(answer ? { answer } : {}),
      ...(hypothesis ? { belief: hypothesis.id } : {}),
      x: 0,
      y: 0,
      r: radiusOf(imp),
    });
    drawn.add(node.id);
  }

  /* the conditions the engine scores that have no node in the graph */
  const hasNode = new Set(
    nodes.map((n) => n.belief).filter((v): v is string => !!v),
  );
  for (const b of drawnBeliefs) {
    if (hasNode.has(b.id)) continue;
    const imp = conditionImportance(b.score, weightOf(b) || 1);
    nodes.push({
      id: `belief:${b.id}`,
      kind: "cond",
      name: b.name,
      what: b.summary,
      imp: round2(imp),
      st: conditionState(b.score),
      belief: b.id,
      x: 0,
      y: 0,
      r: radiusOf(imp),
    });
  }
  const bubbleOfBelief = new Map(
    nodes.filter((n) => n.belief).map((n) => [n.belief!, n.id]),
  );
  const on = new Set(nodes.map((n) => n.id));

  /* the edges between what is drawn */
  const links: BubbleLink[] = [];
  for (const edge of graph.edges) {
    if (!on.has(edge.from) || !on.has(edge.to)) continue;
    const verdict = evaluateWhen(edge, m, matched, graph.nodes);
    const waiting = !verdict.holds && WAITING.test(verdict.failed ?? "");
    links.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      relation: edge.relation,
      confidence: edge.confidence,
      grade: gradeOfEdge(edge),
      strength: edge.strength,
      mechanism: edge.mechanism,
      on: verdict.holds ? true : waiting ? null : false,
      ...(verdict.holds
        ? verdict.reasons.length
          ? { why: verdict.reasons.join(", ") }
          : {}
        : { why: verdict.failed }),
      source: "graph",
    });
  }

  /* and the discriminators: the marker a condition would be settled by */
  for (const b of drawnBeliefs) {
    const target = bubbleOfBelief.get(b.id);
    if (!target) continue;
    let added = 0;
    for (const test of b.tests) {
      if (added >= 4) break;
      for (const code of test.codes) {
        const from = `metric:${code}`;
        if (!on.has(from) || from === target) continue;
        const id = `${code}->${b.id}@test`;
        if (links.some((l) => l.id === id)) continue;
        const measured = m.latest[code]?.value != null;
        links.push({
          id,
          from,
          to: target,
          relation: "indicates",
          confidence: test.lrPos >= 10 ? "established" : "probable",
          grade: test.lrPos >= 10 ? "A" : "B",
          strength: test.lrPos >= 10 ? 3 : 2,
          mechanism: `${test.test} settles it: LR+ ${test.lrPos}, LR− ${test.lrNeg}.`,
          on: measured ? true : null,
          why: measured
            ? `you have a ${code} reading`
            : `${test.test} has not been done`,
          source: "belief",
        });
        added++;
        break;
      }
    }
  }

  /* positions */
  const bodies: Body[] = nodes.map((n) => ({
    id: n.id,
    imp: n.imp,
    r: n.r,
    x: 0,
    y: 0,
  }));
  layout(bodies, links);
  const place = new Map(bodies.map((b) => [b.id, b]));
  for (const node of nodes) {
    const body = place.get(node.id)!;
    node.x = body.x;
    node.y = body.y;
  }

  /* the beliefs, with the moves that would change each one */
  const movesFor = (id: string) =>
    moves
      .map((move) => ({ move, hit: move.moves.find((x) => x.id === id) }))
      .filter((row) => row.hit && Math.abs(row.hit.to - row.hit.from) > 0.001)
      .sort(
        (a, b) =>
          Math.abs(b.hit!.to - b.hit!.from) - Math.abs(a.hit!.to - a.hit!.from),
      )
      .slice(0, 3)
      .map(({ move, hit }) => ({
        kind: move.kind,
        label: move.label,
        cost: move.cost,
        ...(move.priced ? { priced: true as const } : {}),
        from: hit!.from,
        to: hit!.to,
      }));

  const conditionName = new Map(beliefs.map((b) => [b.id, displayNameOf(b)]));
  const evidenceText = ({
    rule,
    input,
    value,
    lr,
    grade,
  }: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: Grade;
  }): EvidenceText => ({
    rule,
    input,
    value,
    lr,
    grade,
    text: explainInput({ input, value, lr }, (id) => conditionName.get(id)),
  });

  const panel: BubbleBelief[] = drawnBeliefs.map((b) => ({
    id: b.id,
    name: displayNameOf(b),
    title: titleOf({ id: b.id, name: b.name, state: b.state }),
    ...(isRiskState(b) ? { risk: true as const } : {}),
    p: b.score,
    state: b.state,
    summary: b.summary,
    weight: weightOf(b),
    for: b.for.slice(0, 6).map(evidenceText),
    against: b.against.slice(0, 4).map(evidenceText),
    missing: b.missing.slice(0, 5).map((x) => explainKey(x.input)),
    moves: movesFor(b.id),
  }));

  const known = nodes.filter(
    (n) => n.st !== "unknown" && n.st !== "faint",
  ).length;
  const live = links.filter((l) => l.on === true).length;
  const dead = links.filter((l) => l.on === false).length;
  const hint = `${known} of ${nodes.length} bubbles known · ${live} edges active for you · ${dead} not for you`;

  // Same order as the ledger: certainty first, then the lens, diseases before
  // risk states. The stage still picks its bubbles by `matters`, because size
  // is belief × lens; only the ranked list follows the cards.
  panel.sort((a, b) =>
    byRank(
      {
        id: a.id,
        state: a.state,
        matters: a.p * a.weight,
        probability: a.p,
        title: a.title,
      },
      {
        id: b.id,
        state: b.state,
        matters: b.p * b.weight,
        probability: b.p,
        title: b.title,
      },
    ),
  );

  const nameOf = new Map(beliefs.map((b) => [b.id, displayNameOf(b)]));
  const asks = asksFromMoves(moves, (id) => nameOf.get(id) ?? id);

  return { nodes, links, beliefs: panel, asks, ruledOut, hint };
}

/** The box the picture ended up in, padded, for the client's fit-to-view. */
export function viewBoxOf(nodes: Bubble[], pad = 110): string {
  if (!nodes.length) return `0 0 ${STAGE.w} ${STAGE.h}`;
  const x0 = Math.min(...nodes.map((n) => n.x - n.r)) - pad;
  const x1 = Math.max(...nodes.map((n) => n.x + n.r)) + pad;
  const y0 = Math.min(...nodes.map((n) => n.y - n.r)) - pad;
  const y1 = Math.max(...nodes.map((n) => n.y + n.r)) + pad;
  return `${round2(x0)} ${round2(y0)} ${round2(x1 - x0)} ${round2(y1 - y0)}`;
}
