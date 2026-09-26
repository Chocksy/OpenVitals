/**
 * Phase 39 B1: what in a person's own history is worth a look.
 *
 * Seven rules read each marker against the person's own band, and a guard
 * decides which results are raised: a rule firing is not enough, it also needs
 * a graph edge that could explain it, a cluster, or the person's goal. The
 * rest are kept as unraised signals for `/brain`, where the owner judges the
 * thresholds on real data (finding 4).
 *
 * Pure. `lib/hunches.ts` loads the rows, the graph causes and the goals.
 */
import type { SystemId } from "./graph";
import {
  bandOf,
  fitOf,
  labChange,
  stepOf,
  zOf,
  type Band,
  type LabPoint,
} from "./personal";

export type Kind =
  | "left_band"
  | "step"
  | "drift"
  | "discordance"
  | "cluster"
  | "gap"
  | "good_news";

export type Dir = "up" | "down";

export interface Signal {
  /** stable: kind + code, or kind + group for a cluster */
  key: string;
  kind: Kind;
  codes: string[];
  system: SystemId | null;
  dir: Dir | null;
  /** where the change began: the step's first draw, else the first draw of the run */
  since: string | null;
  numbers: Record<string, number | string | boolean>;
  rule: string[];
  why: "graph" | "cluster" | "goal" | null;
  /** the draw dates the rule fired on, oldest first, for the replay dots */
  firedAt: string[];
}

/** A machine-checkable prediction on one marker. */
export interface Check {
  code: string;
  op: "<" | ">" | "between";
  value: number | [number, number];
}

/** One thing the graph says can move a marker. */
export interface Cause {
  id: string;
  name: string;
  /** which move it explains; null explains either */
  dir: Dir | null;
  grade: string;
  basis: "science" | "opinion" | "anecdotal" | "hypothesis";
  source: string | null;
  /** the hkb condition, when the engine scores one */
  conditionId: string | null;
  /** the threshold the evidence names, code-owned, for the test that splits */
  check: Check | null;
}

export interface MarkerIn {
  code: string;
  name: string;
  unit: string | null;
  system: SystemId | null;
  derived?: boolean;
  points: LabPoint[];
}

export interface GoalIn {
  code: string;
  low: number | null;
  high: number | null;
  due: string | null;
}

export interface SignalsInput {
  markers: MarkerIn[];
  goals: GoalIn[];
  /** profile facts, key to the answer as text */
  facts: Record<string, string>;
  /** code to the causes the graph lists for it */
  causes: Record<string, Cause[]>;
  /** kg pairs marked same-direction; none exist yet, so discordance is idle */
  sameDirection?: [string, string][];
  today: string;
}

/**
 * Which way is worse for a marker. A move the other way is benign and stays
 * unraised; a code not in the table has no side and is judged by the guard.
 */
export const WORSE: Record<string, Dir> = {
  ldl_cholesterol: "up",
  apolipoprotein_b: "up",
  total_cholesterol: "up",
  triglycerides: "up",
  non_hdl_cholesterol: "up",
  lp_a: "up",
  hba1c: "up",
  glucose: "up",
  insulin: "up",
  homa_ir: "up",
  alt: "up",
  ast: "up",
  ggt: "up",
  alp: "up",
  creatinine: "up",
  uric_acid: "up",
  crp: "up",
  hs_crp: "up",
  homocysteine: "up",
  eosinophils_abs: "up",
  esr: "up",
  bp_systolic: "up",
  bmi: "up",
  hdl_cholesterol: "down",
  ferritin: "down",
  transferrin_saturation: "down",
  iron: "down",
  vitamin_d: "down",
  vitamin_b12: "down",
  folic_acid: "down",
  hemoglobin: "down",
};

/**
 * The smallest slope per year that counts as a drift. Grade C throughout:
 * no guideline prints a per-year threshold for these. LDL and ApoB at 10 and
 * 8 sit beside the hkb slope rows (grade C, Ference 2017 reasoning); TSH 0.5
 * is the hkb hypothyroidism slope row (grade B). The rest are the round
 * fifteen placeholders, to be judged in the /brain window.
 */
export const DRIFT_MIN: Record<string, number> = {
  ldl_cholesterol: 10,
  apolipoprotein_b: 8,
  hdl_cholesterol: 6,
  ferritin: 10,
  vitamin_b12: 150,
  vitamin_d: 8,
  homocysteine: 0.5,
  hba1c: 0.3,
  insulin: 2,
  tsh: 0.5,
};

/**
 * Gene call to a marker the call makes worth measuring. A gap is open while
 * the code (with its partner on the same day) is missing from the person's
 * last three draws.
 */
export const GAP_RULES: {
  fact: string;
  gene: string;
  match: RegExp;
  code: string;
  with?: string;
  why: string;
  source: string;
}[] = [
  {
    fact: "genome:mthfr",
    gene: "MTHFR",
    match: /c677t|a1298c/i,
    code: "folic_acid",
    why: "MTHFR variants raise homocysteine mainly when folate runs low, so folate is the number that decides.",
    source: "Jacques 1996 Circulation (C677T, folate and homocysteine)",
  },
  {
    fact: "genome:tcf7l2",
    gene: "TCF7L2",
    match: /^(ct|tc|tt)$/i,
    code: "insulin",
    with: "glucose",
    why: "TCF7L2 T-allele carriers lose insulin secretion first, which a fasting insulin with glucose on the same day shows.",
    source: "Grant 2006 Nat Genet (TCF7L2 and type 2 diabetes)",
  },
];

/** Iron and vitamins read as one store (finding 3), keyed "iron". */
const groupOf = (s: SystemId | null) =>
  s === "vitamins" || s === "iron" ? "iron" : s;

const LEFT_Z = 2.5;

/**
 * Sums of other markers: total cholesterol and non-HDL move with LDL by
 * arithmetic, so they never make a cluster on their own account.
 */
const CLUSTER_SKIP = new Set(["total_cholesterol", "non_hdl_cholesterol"]);
const STALE_MS = 2 * 365.25 * 86_400_000;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

export const fmt = (v: number) => {
  const a = Math.abs(v);
  return a < 1
    ? v.toFixed(2)
    : a < 10
      ? String(+v.toFixed(2))
      : a < 100
        ? String(+v.toFixed(1))
        : String(Math.round(v));
};
const signed = (v: number) => (v >= 0 ? "+" : "−") + fmt(Math.abs(v));

/* ── one marker, as the rules read it on one day ───────────────────────── */

export interface MarkerRead {
  band: Band | undefined;
  z: number | null;
  last: LabPoint;
  hits: Omit<Signal, "why" | "firedAt" | "key">[];
}

/**
 * A draw that left the person's band (a full one) or, with no full band yet,
 * the lab range. Only the worse way counts when the marker has a worse side.
 * The band wins over the lab range where both exist, because lab ranges
 * change between labs (the owner's CRP range went from 49.9 to 0.33 to 3.3).
 */
const outAt = (pts: LabPoint[], i: number, code: string): Dir | null => {
  const p = pts[i]!;
  const worse = WORSE[code];
  const b = bandOf(pts.slice(0, i + 1), { code });
  let dir: Dir | null = null;
  if (b && !b.provisional) {
    const z = zOf(p.value, b);
    if (Math.abs(z) >= LEFT_Z) dir = z > 0 ? "up" : "down";
  } else if (p.refHigh != null && p.value > p.refHigh) dir = "up";
  else if (p.refLow != null && p.value < p.refLow) dir = "down";
  return dir && (!worse || dir === worse) ? dir : null;
};

/**
 * A marker that once left its band the worse way and whose last two draws
 * are back inside, with no worse-way exit in between.
 */
// ponytail: good news for at most four draws after the exit, so it is news
// once; lift the cap if the owner wants it on the shelf longer.
function goodNewsOf(m: MarkerIn, pts: LabPoint[]) {
  for (let i = pts.length - 1; i >= 0; i--) {
    const dir = outAt(pts, i, m.code);
    if (!dir) continue;
    const back = pts.length - 1 - i;
    if (back < 2 || back > 4) return undefined;
    return { was: pts[i]!, dir, back, since: pts[i + 1]!.date };
  }
  return undefined;
}

/** Every rule on one marker, with the points up to and including `d`. */
export function readMarker(
  m: MarkerIn,
  d: string,
  goal?: GoalIn,
): MarkerRead | undefined {
  const pts = m.points.filter((p) => t(p.date) <= t(d));
  const last = pts[pts.length - 1];
  if (!last) return undefined;
  const band = bandOf(pts, { code: m.code });
  const z = band ? zOf(last.value, band) : null;
  const hits: MarkerRead["hits"] = [];
  const base = { codes: [m.code], system: m.system };
  const u = m.unit ? ` ${m.unit}` : "";
  const bandLine = band
    ? `Your usual level from ${band.n} earlier draws: ${fmt(band.median)} ± ${fmt(band.sd)}${u}${band.provisional ? " (provisional, 4 draws)" : ""}.`
    : `Fewer than 4 earlier draws, so no band of your own yet.`;
  const fit = fitOf(pts, d);

  if (goal && (goal.low != null || goal.high != null)) {
    // Finding 2: a goal marker is read against the goal and the recent
    // slope, never against a band that moved up with it.
    if (!fit) return { band, z, last, hits };
    const min = DRIFT_MIN[m.code] ?? 0;
    const landing = goal.due ? fit.at(goal.due) : null;
    const away =
      (goal.high != null &&
        fit.perYear > 0 &&
        (last.value > goal.high || (landing ?? 0) > goal.high)) ||
      (goal.low != null &&
        fit.perYear < 0 &&
        (last.value < goal.low || (landing ?? Infinity) < goal.low));
    if (away && Math.abs(fit.perYear) >= min) {
      const w = pts.filter((p) => t(p.date) >= t(fit.from)).slice(-3);
      hits.push({
        ...base,
        kind: "drift",
        dir: fit.perYear > 0 ? "up" : "down",
        since: fit.from,
        numbers: {
          perYear: +fit.perYear.toFixed(1),
          last: last.value,
          from: fit.from,
          to: fit.to,
          ...(goal.low != null ? { goalLow: goal.low } : {}),
          ...(goal.high != null ? { goalHigh: goal.high } : {}),
          ...(goal.due ? { due: goal.due } : {}),
          ...(landing != null ? { landing: +landing.toFixed(1) } : {}),
          driftMin: min,
        },
        rule: [
          `Least squares over the last three draws (${w.map((p) => fmt(p.value)).join(", ")}): ${signed(fit.perYear)}${u} a year.`,
          `Your goal is ${goal.low != null && goal.high != null ? `${fmt(goal.low)} to ${fmt(goal.high)}` : goal.high != null ? `${fmt(goal.high)} or under` : `${fmt(goal.low!)} or over`}${goal.due ? ` by ${goal.due}` : ""}; the last draw was ${fmt(last.value)}.`,
          ...(landing != null
            ? [`On this line it lands near ${fmt(landing)} on ${goal.due}.`]
            : []),
          `A goal marker is read by its slope and the goal, not by your band (threshold ${fmt(min)} a year, grade C).`,
        ],
      });
    }
    return { band, z, last, hits };
  }

  if (band && !band.provisional && z != null && Math.abs(z) >= LEFT_Z)
    hits.push({
      ...base,
      kind: "left_band",
      dir: z > 0 ? "up" : "down",
      since: last.date,
      numbers: {
        last: last.value,
        median: band.median,
        sd: band.sd,
        n: band.n,
        z: +z.toFixed(2),
      },
      rule: [
        bandLine,
        `The last draw, ${fmt(last.value)}${u}, sits ${fmt(Math.abs(z))} spreads ${z > 0 ? "above" : "below"} it; the rule needs 2.5.`,
      ],
    });

  const good = goodNewsOf(m, pts);
  const step = good ? undefined : stepOf(pts);
  if (good)
    hits.push({
      ...base,
      kind: "good_news",
      dir: good.dir === "up" ? "down" : "up",
      since: good.since,
      numbers: {
        was: good.was.value,
        wasDate: good.was.date,
        last: last.value,
        back: good.back,
      },
      rule: [
        `${fmt(good.was.value)}${u} on ${good.was.date} was outside ${band ? "your band or " : ""}the lab range.`,
        `The ${good.back} draws since are all back inside: ${pts
          .slice(-good.back)
          .map((p) => fmt(p.value))
          .join(", ")}.`,
      ],
    });
  else if (step)
    hits.push({
      ...base,
      kind: "step",
      dir: step.dir,
      since: step.since,
      numbers: {
        k: step.k,
        priorMax: step.priorMax,
        priorMin: step.priorMin,
        last: last.value,
        ...(band ? { median: band.median, sd: band.sd, n: band.n } : {}),
      },
      rule: [
        `Before ${step.since}: ${pts.length - step.k} draws between ${fmt(step.priorMin)} and ${fmt(step.priorMax)}${u}.`,
        `The last ${step.k} draws are all ${step.dir === "up" ? `above ${fmt(step.priorMax)}` : `below ${fmt(step.priorMin)}`}: ${pts
          .slice(-step.k)
          .map((p) => fmt(p.value))
          .join(", ")}.`,
        `A step reads a new level without a spread, so it works where your draws sit close together.`,
      ],
    });

  const min = DRIFT_MIN[m.code];
  if (fit && min != null && Math.abs(fit.perYear) >= min) {
    const w = pts.filter((p) => t(p.date) >= t(fit.from)).slice(-3);
    hits.push({
      ...base,
      kind: "drift",
      dir: fit.perYear > 0 ? "up" : "down",
      since: fit.from,
      numbers: {
        perYear: +fit.perYear.toFixed(2),
        last: last.value,
        from: fit.from,
        to: fit.to,
        driftMin: min,
      },
      rule: [
        `Least squares over the last three draws inside 24 months (${w.map((p) => fmt(p.value)).join(", ")}): ${signed(fit.perYear)}${u} a year.`,
        `The drift threshold for ${m.name} is ${fmt(min)} a year (grade C, to be judged on /brain).`,
      ],
    });
  }
  return { band, z, last, hits };
}

/* ── the whole person ──────────────────────────────────────────────────── */

const causesFor = (input: SignalsInput, code: string, dir: Dir | null) =>
  (input.causes[code] ?? []).filter(
    (c) => dir == null || c.dir == null || c.dir === dir,
  );

/** Every draw date the person has, oldest first. */
const drawDates = (markers: MarkerIn[]) =>
  [...new Set(markers.flatMap((m) => m.points.map((p) => p.date)))].sort();

/** The trailing run of fired dates among the evaluated ones. */
function runStart(evaluated: string[], fired: Set<string>) {
  let start: string | null = null;
  for (let i = evaluated.length - 1; i >= 0; i--) {
    if (!fired.has(evaluated[i]!)) break;
    start = evaluated[i]!;
  }
  return start;
}

interface ClusterHit {
  group: string;
  members: { code: string; value: number; median: number; lit: number }[];
  dir: Dir | null;
}

function clustersAt(
  input: SignalsInput,
  d: string,
  goalCodes: Set<string>,
): ClusterHit[] {
  const lastDraw = drawDates(
    input.markers.map((m) => ({
      ...m,
      points: m.points.filter((p) => t(p.date) <= t(d)),
    })),
  ).pop();
  if (!lastDraw) return [];
  const groups = new Map<string, ClusterHit["members"]>();
  const ok = new Map<string, boolean>();
  for (const m of input.markers) {
    const g = groupOf(m.system);
    const worse = WORSE[m.code];
    if (!g || !worse || m.derived || goalCodes.has(m.code)) continue;
    if (CLUSTER_SKIP.has(m.code)) continue;
    const r = readMarker(m, d);
    if (!r?.band || r.last.date !== lastDraw) continue;
    const onWorse =
      worse === "up"
        ? r.last.value > r.band.median
        : r.last.value < r.band.median;
    // How far past its own threshold, so the most-lit member leads the case.
    const lit = Math.max(
      0,
      ...r.hits
        .filter((h) => h.dir === worse)
        .map((h) =>
          h.kind === "drift"
            ? Math.abs(Number(h.numbers.perYear)) / Number(h.numbers.driftMin)
            : h.kind === "left_band"
              ? Math.abs(Number(h.numbers.z)) / LEFT_Z
              : h.kind === "step"
                ? 1
                : 0,
        ),
    );
    groups.set(g, [
      ...(groups.get(g) ?? []),
      { code: m.code, value: r.last.value, median: r.band.median, lit },
    ]);
    ok.set(g, (ok.get(g) ?? true) && onWorse);
  }
  const out: ClusterHit[] = [];
  for (const [group, members] of groups)
    if (members.length >= 3 && ok.get(group) && members.some((x) => x.lit > 0))
      out.push({ group, members, dir: null });
  return out;
}

/**
 * Every signal for one person, as of their last lab draw, split into raised
 * and unraised by the guard.
 */
export function signalsOf(input: SignalsInput): {
  raised: Signal[];
  unraised: Signal[];
  asOf: string | null;
} {
  const all = drawDates(input.markers).filter((d) => t(d) <= t(input.today));
  const asOf = all[all.length - 1] ?? null;
  if (!asOf) return { raised: [], unraised: [], asOf };
  const goalOf = new Map(input.goals.map((g) => [g.code, g]));
  const goalCodes = new Set(
    input.goals
      .filter((g) => g.low != null || g.high != null)
      .map((g) => g.code),
  );
  const out: Signal[] = [];

  for (const m of input.markers) {
    const lastPt = m.points.filter((p) => t(p.date) <= t(asOf)).pop();
    if (!lastPt || t(asOf) - t(lastPt.date) > STALE_MS) continue;
    const goal = goalOf.get(m.code);
    const now = readMarker(m, asOf, goal);
    if (!now) continue;
    const lc = labChange(m.points.filter((p) => t(p.date) <= t(asOf)));
    const evaluated = m.points
      .map((p) => p.date)
      .filter((d) => t(d) <= t(asOf));
    const replay = new Map(
      evaluated.map((d) => [d, readMarker(m, d, goal)?.hits ?? []]),
    );
    for (const h of now.hits) {
      const fired = new Set(
        evaluated.filter((d) =>
          replay.get(d)!.some((x) => x.kind === h.kind && x.dir === h.dir),
        ),
      );
      const key = `${h.kind}:${m.code}`;
      const firedAt = evaluated.filter((d) => fired.has(d));
      const since =
        h.kind === "step" || h.kind === "good_news" || h.kind === "drift"
          ? h.since
          : runStart(evaluated, fired);
      const numbers = { ...h.numbers };
      let why: Signal["why"] = null;
      const worse = WORSE[m.code];
      if (goalCodes.has(m.code)) why = "goal";
      else if (lc && lastPt.date === asOf && h.kind !== "good_news")
        numbers.labChange = true;
      else if (h.kind !== "good_news" && worse && h.dir !== worse)
        numbers.benign = true;
      else if (
        causesFor(input, m.code, h.kind === "good_news" ? null : h.dir).length
      )
        why = "graph";
      out.push({ ...h, key, since, numbers, why, firedAt });
    }
  }

  // One code, one hunch: a step already says the value left its level, so a
  // band exit or a drift the same way folds into it.
  for (const s of out)
    if (
      (s.kind === "left_band" || s.kind === "drift") &&
      s.why &&
      out.some((x) => x.key === `step:${s.codes[0]}` && x.dir === s.dir)
    ) {
      s.numbers.foldedInto = `step:${s.codes[0]}`;
      s.numbers.guard = s.why;
      s.why = null;
    }

  // Cluster: direction across a store, not size (finding 3).
  const clusterNow = clustersAt(input, asOf, goalCodes);
  for (const c of clusterNow) {
    const fired = new Set(
      all.filter((d) =>
        clustersAt(input, d, goalCodes).some((x) => x.group === c.group),
      ),
    );
    const key = `cluster:${c.group}`;
    const codes = c.members.map((x) => x.code);
    out.push({
      key,
      kind: "cluster",
      codes,
      system: c.group as SystemId,
      dir: null,
      since: runStart(all, fired),
      numbers: {
        lit: c.members
          .filter((x) => x.lit > 0)
          .sort((a, b) => b.lit - a.lit)
          .map((x) => x.code)
          .join(","),
        ...Object.fromEntries(
          c.members.flatMap((x) => [
            [`${x.code}.last`, x.value],
            [`${x.code}.median`, x.median],
          ]),
        ),
      },
      rule: [
        `${codes.length} markers were drawn on ${asOf} and all sit on the worse side of their own middle: ${c.members
          .map((x) => `${x.code} ${fmt(x.value)} against ${fmt(x.median)}`)
          .join("; ")}.`,
        `${c.members
          .filter((x) => x.lit)
          .map((x) => x.code)
          .join(
            ", ",
          )} also passed ${c.members.filter((x) => x.lit).length > 1 ? "their" : "its"} own rule.`,
        `A cluster reads direction, not size: one question for the group, not one per marker.`,
      ],
      why: "cluster",
      firedAt: all.filter((d) => fired.has(d)),
    });
    // The members fold into the cluster rather than raise one each.
    for (const s of out)
      if (
        s.kind !== "cluster" &&
        s.kind !== "good_news" &&
        s.why &&
        s.codes.some((x) => codes.includes(x))
      ) {
        s.numbers.foldedInto = key;
        s.numbers.guard = s.why;
        s.why = null;
      }
  }

  // Gap: a gene call that makes a marker worth having, missing from the
  // last three draws.
  const last3 = all.slice(-3);
  const hasOn = (code: string, d: string) =>
    input.markers.some(
      (m) => m.code === code && m.points.some((p) => p.date === d),
    );
  for (const g of GAP_RULES) {
    const call = input.facts[g.fact];
    if (!call || /^no\b/i.test(call) || !g.match.test(call)) continue;
    if (last3.some((d) => hasOn(g.code, d) && (!g.with || hasOn(g.with, d))))
      continue;
    const seen = input.markers
      .find((m) => m.code === g.code)
      ?.points.filter((p) => !g.with || hasOn(g.with, p.date))
      .pop();
    out.push({
      key: `gap:${g.code}`,
      kind: "gap",
      codes: g.with ? [g.code, g.with] : [g.code],
      system:
        input.markers.find((m) => m.code === g.code)?.system ??
        (g.code === "folic_acid" ? "vitamins" : "metabolic"),
      dir: null,
      since: null,
      numbers: {
        gene: g.gene,
        call,
        lastSeen: seen?.date ?? "never",
        ...(seen ? { lastValue: seen.value } : {}),
      },
      rule: [
        `${g.gene}: ${call}. ${g.why}`,
        seen
          ? `${g.code}${g.with ? ` with ${g.with}` : ""} was last measured on ${seen.date}, not in your last three draws (${last3.join(", ")}).`
          : `${g.code}${g.with ? ` with ${g.with} on the same day` : ""} has never been measured.`,
        `Source: ${g.source}.`,
      ],
      why: "graph",
      firedAt: [],
    });
  }

  // Discordance: two markers the graph says move together, moving apart.
  for (const [a, b] of input.sameDirection ?? []) {
    const ma = input.markers.find((m) => m.code === a);
    const mb = input.markers.find((m) => m.code === b);
    const fa = ma && fitOf(ma.points, asOf);
    const fb = mb && fitOf(mb.points, asOf);
    if (!fa || !fb || Math.sign(fa.perYear) === Math.sign(fb.perYear)) continue;
    if (
      Math.abs(fa.perYear) < (DRIFT_MIN[a] ?? 0) ||
      Math.abs(fb.perYear) < (DRIFT_MIN[b] ?? 0)
    )
      continue;
    out.push({
      key: `discordance:${a},${b}`,
      kind: "discordance",
      codes: [a, b],
      system: ma!.system,
      dir: null,
      since: fa.from,
      numbers: { [`${a}.perYear`]: fa.perYear, [`${b}.perYear`]: fb.perYear },
      rule: [
        `${a} ${signed(fa.perYear)} a year and ${b} ${signed(fb.perYear)} a year, though the graph says they move together.`,
      ],
      why: "graph",
      firedAt: [asOf],
    });
  }

  return {
    raised: out.filter((s) => s.why),
    unraised: out.filter((s) => !s.why),
    asOf,
  };
}
