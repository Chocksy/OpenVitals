/**
 * One run of the whole engine over one scenario, as plain data: the pillars
 * ranked, the hypotheses scored, the cheapest path through the tests that are
 * still open, the patterns, the graph, and the context pack the model would
 * see, split by section with a token count each.
 *
 * `/brain` is a thin client over this. Nothing here writes anything.
 */
import {
  coverage,
  fireRules,
  profileQuestions,
  type CoverageRow,
  type ModelInput,
} from "./coverage";
import { computeGraphState, type NodeState } from "./graph-state";
import {
  scoreHypotheses,
  type Discriminator,
  type HypothesisResult,
  type Lens,
} from "./hypotheses";
import { matchPatterns } from "./patterns";
import { buildContextFromInput } from "./report";
import { buildScenarioInput, EMPTY_OVERLAY, type Overlay, type Scenario } from "./sample";
import type { Vector } from "./vectors";

export interface BrainRun {
  scenario: Scenario;
  overlay: Overlay;
  pillars: {
    vector: Vector;
    state: CoverageRow["state"];
    grade: string;
    distance: number;
    trend: "up" | "down" | "flat" | "n/a";
    rank: number;
    lenses: Lens[];
    detail?: string;
    lastDate?: string;
  }[];
  hypotheses: HypothesisResult[];
  path: {
    step: number;
    /** free = an unanswered interview question, rule = a fired escalation,
     *  test = a discriminator the hypotheses would move on. */
    kind: "question" | "rule" | "test";
    test: string;
    cost: number;
    moves: { id: string; shift: number }[];
    howTo?: string;
  }[];
  patterns: ReturnType<typeof matchPatterns>;
  graph: { hot: NodeState[]; activeEdges: number };
  pack: { section: string; text: string; tokens: number }[];
  totalTokens: number;
  /** what the run read, for the facts panel */
  facts: Record<string, unknown>;
  lens: Lens;
  today: string;
}

/**
 * ponytail: swap for a real tokenizer when we pick the model for good. Four
 * characters per token is within about 10 % on English prose and lab lines.
 */
export const countTokens = (text: string): number =>
  Math.ceil(text.length / 4);

const round2 = (v: number) => Math.round(v * 100) / 100;

/** How wide the band is, so distance can be expressed in bands not units. */
function bandWidth(row: {
  optimalLow: number | null;
  optimalHigh: number | null;
  refLow: number | null;
  refHigh: number | null;
}): number {
  const spans = [
    row.optimalHigh != null && row.optimalLow != null
      ? row.optimalHigh - row.optimalLow
      : null,
    row.refHigh != null && row.refLow != null ? row.refHigh - row.refLow : null,
    row.optimalHigh ?? row.optimalLow ?? row.refHigh ?? row.refLow,
  ].filter((v): v is number => v != null && v > 0);
  return spans[0] ?? 1;
}

/** How far outside the optimal band, in band widths. 0 when inside. */
function distanceOf(m: ModelInput, vector: Vector): number {
  let worst = 0;
  for (const code of vector.codes ?? []) {
    const row = m.latest[code];
    if (row?.value == null) continue;
    const out =
      row.optimalLow != null && row.value < row.optimalLow
        ? row.optimalLow - row.value
        : row.optimalHigh != null && row.value > row.optimalHigh
          ? row.value - row.optimalHigh
          : 0;
    worst = Math.max(worst, out / bandWidth(row));
  }
  return round2(worst);
}

function trendOf(m: ModelInput, vector: Vector): BrainRun["pillars"][number]["trend"] {
  for (const code of vector.codes ?? []) {
    const row = m.latest[code];
    if (row?.value == null || row.prev == null) continue;
    if (row.value > row.prev) return "up";
    if (row.value < row.prev) return "down";
    return "flat";
  }
  return "n/a";
}

/** Never measured first, then how far out of band, then tier. */
const STATE_BONUS = { never: 0.5, stale: 0.25, current: 0, "n/a": -1 } as const;

function pillars(m: ModelInput): BrainRun["pillars"] {
  const rows = coverage(m).map((row) => ({
    vector: row.vector,
    state: row.state,
    grade: row.vector.grade,
    distance: row.vector.codes?.length ? distanceOf(m, row.vector) : 0,
    trend: trendOf(m, row.vector),
    rank: 0,
    lenses: row.vector.lenses,
    detail: row.detail,
    lastDate: row.lastDate,
  }));
  const score = (r: (typeof rows)[number]) =>
    r.distance + STATE_BONUS[r.state] - r.vector.tier * 0.05;
  rows.sort((a, b) => score(b) - score(a) || a.vector.tier - b.vector.tier);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

const MAX_PATH = 24;

/**
 * Greedy on expected shift per unit of cost, with the free things first: an
 * unanswered interview question costs nothing, and a rule the app already
 * fired is a decision that has been made, so both jump the queue. Then the
 * discriminators, best ratio first, each one scored as if nothing after it had
 * been answered. Deduped on the codes a test reads, so one draw is never
 * listed twice.
 */
function bestPath(rows: HypothesisResult[], m: ModelInput): BrainRun["path"] {
  const byKey = new Map<
    string,
    {
      test: Discriminator;
      shift: number;
      moves: { id: string; shift: number }[];
    }
  >();
  for (const h of rows) {
    // A hypothesis nobody believes does not get to order tests. Its card still
    // lists them; the path is what you would actually do next.
    if (h.state === "ruled_out" || h.state === "unlikely") continue;
    for (const d of h.tests) {
      const key = d.codes.slice().sort().join("+");
      const next = h.nextTests.find((t) => t.test === d.test);
      if (!next) continue;
      const found = byKey.get(key) ?? { test: d, shift: 0, moves: [] };
      found.shift += next.expectedShift;
      found.moves.push({ id: h.id, shift: next.expectedShift });
      byKey.set(key, found);
    }
  }
  const free: Omit<BrainRun["path"][number], "step">[] = [
    ...profileQuestions(m).map((q) => ({
      kind: "question" as const,
      test: q.question,
      cost: 0,
      moves: [],
      howTo: `Answers the ${q.key} question. Free.`,
    })),
    ...fireRules(m).map((r) => ({
      kind: "rule" as const,
      test: r.suggest,
      cost: 1,
      moves: [],
      howTo: r.why,
    })),
  ];

  const tests = [...byKey.values()]
    .sort((a, b) => b.shift / b.test.cost - a.shift / a.test.cost)
    .map((row) => ({
      kind: "test" as const,
      test: row.test.test,
      cost: row.test.cost,
      moves: row.moves.sort((a, b) => b.shift - a.shift),
      howTo: row.test.howTo,
    }));

  const seen = new Set<string>();
  return [...free, ...tests]
    .filter((row) => !seen.has(row.test) && (seen.add(row.test), true))
    .slice(0, MAX_PATH)
    .map((row, i) => ({ ...row, step: i + 1 }));
}

/** A line that opens a section: two or more capitals, then a colon somewhere. */
const isHeading = (line: string) =>
  /^[A-Z][A-Z0-9]{2,}/.test(line) && line.includes(":");

const headingName = (line: string) =>
  line.split(/[:(]/)[0]!.trim() || line.trim();

/** The context pack, cut at its own headings, with a token count each. */
export function splitPack(context: string): BrainRun["pack"] {
  const out: BrainRun["pack"] = [];
  let section = "PREAMBLE";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) out.push({ section, text, tokens: countTokens(text) });
    buffer = [];
  };
  for (const line of context.split("\n")) {
    if (isHeading(line)) {
      flush();
      section = headingName(line);
    }
    buffer.push(line);
  }
  flush();
  return out;
}

export async function runBrain(
  s: Scenario,
  overlay: Overlay = EMPTY_OVERLAY,
  lens: Lens = "lifespan",
): Promise<BrainRun> {
  const input = await buildScenarioInput(s, overlay);
  const hypotheses = scoreHypotheses(input, {
    confounderTags: overlay.confounders,
    lens,
  });
  const graph = computeGraphState(input);
  const { context } = buildContextFromInput(input, {
    tracker: {
      from: input.today,
      to: input.today,
      items: [],
      averages: {},
      loggedDays: 0,
      adherencePct: 0,
    },
  });
  const pack = splitPack(context);

  return {
    scenario: s,
    overlay,
    pillars: pillars(input),
    hypotheses,
    path: bestPath(hypotheses, input),
    patterns: matchPatterns(input),
    graph: { hot: graph.hot, activeEdges: graph.activeEdges.length },
    pack,
    totalTokens: pack.reduce((sum, p) => sum + p.tokens, 0),
    facts: input.profile,
    lens,
    today: input.today,
  };
}

/** The context pack again, for the Generate button. */
export async function brainContext(s: Scenario, overlay: Overlay = EMPTY_OVERLAY) {
  const input = await buildScenarioInput(s, overlay);
  return buildContextFromInput(input, {
    tracker: {
      from: input.today,
      to: input.today,
      items: [],
      averages: {},
      loggedDays: 0,
      adherencePct: 0,
    },
  });
}
