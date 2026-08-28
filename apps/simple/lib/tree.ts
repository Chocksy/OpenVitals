/**
 * The diagnostic tree: take the best move, branch on what it could say, take
 * the best move again. A beam of width one, so it is a path with outcomes
 * hanging off it, which is exactly what a clinic visit looks like.
 *
 * Deterministic and pure. No LLM, no clock, no database.
 */
import type { ModelInput } from "./coverage";
import { scoreHypotheses, type Catalog, type Lens } from "./hypotheses";
import { beliefsOf, nextMoves, type Belief, type Move } from "./infogain";
import { applyOverlay } from "./sample";

export interface TreeNode {
  id: string;
  depth: number;
  /** probability of reaching this node */
  mass: number;
  /** top 8 plus "rest" */
  beliefs: Belief[];
  /** the move taken from this node */
  chosen?: Move;
  branches: { label: string; prob: number; child: TreeNode }[];
  stop?: "likely" | "confirmed" | "exhausted" | "pruned" | "budget";
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The floor under "keep testing". With nothing above a quarter and no move
 * worth a sixth of a bit, the differential is quiet: another test is noise,
 * not an answer.
 */
const QUIET_BELIEF = 0.25;
const QUIET_GAIN = 0.15;

/** The eight that matter, and one bar for everything else. */
function top8(beliefs: Belief[]): Belief[] {
  const sorted = [...beliefs].sort((a, b) => b.p - a.p);
  const head = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  if (!rest.length) return head;
  return [
    ...head,
    { id: "rest", p: round3(rest.reduce((s, b) => s + b.p, 0)) },
  ];
}

/**
 * Depth 4 and a 5 % prune by default: past that the branches are answering
 * questions nobody asked.
 */
export function buildTree(
  m: ModelInput,
  catalog: Catalog,
  opts: { depth?: number; prune?: number; lens?: Lens; budget?: number } = {},
): TreeNode {
  const depth = opts.depth ?? 4;
  const prune = opts.prune ?? 0.05;

  const grow = (
    input: ModelInput,
    d: number,
    mass: number,
    id: string,
    spent: number,
  ): TreeNode => {
    const beliefs = beliefsOf(
      scoreHypotheses(input, { catalog, lens: opts.lens }),
    );
    const node: TreeNode = {
      id,
      depth: d,
      mass: round3(mass),
      beliefs: top8(beliefs),
      branches: [],
    };

    const top = beliefs.reduce((best, b) => Math.max(best, b.p), 0);
    if (top >= 0.9) return { ...node, stop: "confirmed" };
    if (top >= 0.75) return { ...node, stop: "likely" };
    if (d >= depth) return { ...node, stop: "exhausted" };
    if (mass < prune) return { ...node, stop: "pruned" };

    const all = nextMoves(input, catalog, { lens: opts.lens });
    const left = opts.budget == null ? Infinity : opts.budget - spent;
    const affordable = all.filter((mv) => mv.cost <= left);
    if (all.length && !affordable.length) return { ...node, stop: "budget" };

    const chosen = affordable[0];
    if (!chosen || chosen.gain <= 0.01) return { ...node, stop: "exhausted" };
    if (top < QUIET_BELIEF && chosen.gain < QUIET_GAIN)
      return { ...node, stop: "exhausted" };

    return {
      ...node,
      chosen,
      branches: chosen.outcomes.map((o) => ({
        label: o.label,
        prob: o.prob,
        child: grow(
          applyOverlay(input, o.apply),
          d + 1,
          mass * o.prob,
          `${id}>${chosen.featureId}=${o.label}`,
          spent + chosen.cost,
        ),
      })),
    };
  };

  return grow(m, 0, 1, "root", 0);
}

/** Every node by depth, for the column layout. */
export function treeColumns(root: TreeNode): TreeNode[][] {
  const columns: TreeNode[][] = [];
  const walk = (n: TreeNode) => {
    (columns[n.depth] ??= []).push(n);
    for (const b of n.branches) walk(b.child);
  };
  walk(root);
  return columns;
}
