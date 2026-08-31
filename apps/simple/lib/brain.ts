/**
 * One run of the whole engine over one scenario, as plain data: the pillars
 * ranked, the hypotheses scored, the moves that would shrink the differential
 * fastest and the tree they make, the patterns, the graph, and the context
 * pack the model would see, split by section with a token count each.
 *
 * `/brain` is a thin client over this. Nothing here writes anything.
 */
import { coverage, type CoverageRow, type ModelInput } from "./coverage";
import { computeGraphState, type NodeState } from "./graph-state";
import { loadGraph } from "./kg";
import { catalogFor, loadCatalog } from "./hkb";
import { scoreHypotheses, type HypothesisResult, type Lens } from "./hypotheses";
import { nextMoves, type Move } from "./infogain";
import { buildTree, type TreeNode } from "./tree";
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
  /** the ten best moves across the whole differential, by information gain */
  path: Move[];
  /** the same choice, taken four times, with the branches drawn */
  tree: TreeNode;
  /** cost the run was allowed to spend, when the scenario bar set one */
  budget?: number;
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

/**
 * A scenario over a real person is scored with that person's rings, so a woken
 * rare disease shows up on /brain exactly where it shows up on their home page.
 * A persona or an empty person has no rings, so it gets ring 1.
 */
const catalogOf = (s: Scenario) =>
  "userId" in s ? catalogFor(s.userId) : loadCatalog();

export async function runBrain(
  s: Scenario,
  overlay: Overlay = EMPTY_OVERLAY,
  lens: Lens = "lifespan",
  budget?: number,
): Promise<BrainRun> {
  const input = await buildScenarioInput(s, overlay);
  const catalog = await catalogOf(s);
  const hypotheses = scoreHypotheses(input, {
    confounderTags: overlay.confounders,
    lens,
    catalog,
  });
  const loaded = await loadGraph();
  const graph = computeGraphState(input, { graph: loaded });
  const { context } = buildContextFromInput(input, {
    catalog,
    graph: loaded,
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
    // The budget ranks the path, it never shortens it: a test past the guide
    // still shows, because hiding it hides the answer.
    path: nextMoves(input, catalog, { lens }).slice(0, 10),
    tree: buildTree(input, catalog, { lens, budget }),
    budget,
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
    catalog: await catalogOf(s),
    graph: await loadGraph(),
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
