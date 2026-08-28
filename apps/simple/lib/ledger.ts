/**
 * The ledger: every conclusion the engine will stand behind today, ranked by
 * how much it matters, with what moved since the last time we looked.
 *
 * Deterministic end to end. `scoreHypotheses` says what is true, `nextMoves`
 * says what to do about it, the readings say what improved. The LLM only ever
 * writes the one sentence on a card, and that arrives from the latest report.
 */
import { and, asc, desc, eq, lt } from "drizzle-orm";
import {
  beliefSnapshots,
  getDb,
  protocolItems,
  readings,
  type ReportAction,
} from "@/db";
import type { RangeBarProps } from "@/components/range-bar";
import { buildModelInput, type ModelInput } from "./coverage";
import { getMetricRows, type MetricRow, type Point } from "./data";
import { SYSTEMS } from "./graph";
import { computeGraphState, worstMember } from "./graph-state";
import { loadCatalog } from "./hkb";
import {
  scoreHypotheses,
  type Grade,
  type HState,
  type Hypothesis,
  type HypothesisResult,
  type Lens,
} from "./hypotheses";
import { nextMoves, type Move } from "./infogain";
import { latestReport } from "./report";
import type { Status } from "./status";

/** One line of evidence, exactly as `scoreHypotheses` emits it. */
export type EvidenceLine = HypothesisResult["for"][number];

export interface Conclusion {
  /** condition id, `marker:<code>` for an off marker no condition reads */
  id: string;
  kind: "condition" | "marker" | "improved";
  rank: number;
  /** "<name>: <state>", or "<metric> <value> <unit>, <status>" for a marker */
  title: string;
  probability?: number;
  state?: HState;
  lenses: Partial<Record<Lens, { w: number; grade: Grade }>>;
  /** score × lensWeight for the chosen lens, the number `rank` sorts on */
  matters: number;
  for: EvidenceLine[];
  against: EvidenceLine[];
  missing: string[];
  confounded: string[];
  inputs: {
    kind: "reading" | "fact";
    id: string;
    label: string;
    value: string;
    date?: string;
  }[];
  /** the three best moves that touch this conclusion */
  next: Move[];
  /** the best free question among `next`, rendered inline on the card */
  question?: Move;
  /** the latest report action whose targets name one of this one's codes */
  action?: ReportAction;
  rangeBar?: RangeBarProps;
  trend?: { code: string; points: Point[] };
  changed?: { from?: HState; to: HState; deltaP: number };
}

export interface Ledger {
  bioAge?: { pheno: number; chrono: number; inputs: string[] };
  /** what PhenoAge is still waiting for, when `bioAge` is undefined */
  bioAgeMissing: string[];
  counters: {
    optimal: number;
    normal: number;
    off: number;
    questions: number;
    nextDrawWeeks?: number;
    nextDrawCodes: string[];
  };
  systems: {
    id: string;
    name: string;
    score: number;
    worst?: {
      code: string;
      value: number | null;
      unit: string | null;
      status: Status;
    };
  }[];
  spear?: Conclusion;
  conclusions: Conclusion[];
  quiet: {
    unlikely: number;
    ruledOut: number;
    ids: string[];
    /** the same rows again with what the line prints: name and probability */
    rows: { id: string; name: string; p: number }[];
  };
  improved: {
    code: string;
    name: string;
    from: number;
    to: number;
    unit: string | null;
    since: string;
  }[];
  since?: {
    at: string;
    resolved: number;
    new: number;
    stronger: number;
    weaker: number;
  };
}

/* ── the small rules the whole file leans on ──────────────────────────── */

const RANK: Record<HState, number> = {
  ruled_out: 0,
  unlikely: 1,
  possible: 2,
  likely: 3,
  confirmed: 4,
};

/** "possible" is the line between a card and a line in the quiet list. */
export const isLoud = (state: HState) => RANK[state] >= RANK.possible;

const STATUS_RANK: Record<Status, number> = {
  red: 3,
  amber: 2,
  gray: 1,
  green: 0,
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** score × lensWeight, the same product `scoreHypotheses` already sorts on. */
export const mattersOf = (h: HypothesisResult) =>
  round3(h.score * h.lensWeight);

/**
 * A condition earns a card when it is at least possible, when a rule fired for
 * it and there is still a test that would move it, or when it changed state
 * since the last snapshot. Everything else is a line in the quiet list.
 */
export const isConclusion = (h: HypothesisResult, changed = false): boolean =>
  isLoud(h.state) ||
  changed ||
  (h.state !== "ruled_out" && h.for.length > 0 && h.nextTests.length > 0);

const metricCodesOf = (h: Hypothesis): string[] => [
  ...new Set([
    ...h.evidence.map((r) => r.input.metric).filter((c): c is string => !!c),
    ...h.discriminators.flatMap((d) => d.codes),
  ]),
];

const factKeysOf = (h: Hypothesis): string[] => [
  ...new Set(
    h.evidence.map((r) => r.input.fact).filter((k): k is string => !!k),
  ),
];

const pretty = (code: string) => code.replace(/_/g, " ");

/* ── snapshots ────────────────────────────────────────────────────────── */

export type Beliefs = Record<string, { p: number; state: string }>;

export const beliefsOf = (rows: HypothesisResult[]): Beliefs =>
  Object.fromEntries(rows.map((h) => [h.id, { p: h.score, state: h.state }]));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The newest snapshot older than an hour: what "since" and "changed" read. */
async function previousSnapshot(userId: string) {
  const [row] = await getDb()
    .select()
    .from(beliefSnapshots)
    .where(
      and(
        eq(beliefSnapshots.userId, userId),
        lt(beliefSnapshots.computedAt, new Date(Date.now() - HOUR)),
      ),
    )
    .orderBy(desc(beliefSnapshots.computedAt))
    .limit(1);
  return row ?? null;
}

async function writeSnapshot(
  userId: string,
  beliefs: Beliefs,
  oncePerDay: boolean,
) {
  const db = getDb();
  if (oncePerDay) {
    const [last] = await db
      .select({ at: beliefSnapshots.computedAt })
      .from(beliefSnapshots)
      .where(eq(beliefSnapshots.userId, userId))
      .orderBy(desc(beliefSnapshots.computedAt))
      .limit(1);
    if (last?.at && Date.now() - last.at.getTime() < DAY) return;
  }
  await db.insert(beliefSnapshots).values({ userId, beliefs });
}

/**
 * Score this person and keep the row. Called after an upload's curator run,
 * an answered question, and an adopted or dismissed action, so the next page
 * load can say what changed.
 */
export async function recordBeliefs(
  userId: string,
  opts: { oncePerDay?: boolean } = {},
): Promise<void> {
  const [input, catalog] = await Promise.all([
    buildModelInput(userId),
    loadCatalog(),
  ]);
  const rows = scoreHypotheses(input, { catalog });
  await writeSnapshot(userId, beliefsOf(rows), opts.oncePerDay ?? false);
}

/* ── the pure halves, so the tests need no database ───────────────────── */

/** resolved / new / stronger / weaker against a snapshot. */
export function sinceOf(
  rows: HypothesisResult[],
  before: Beliefs,
  at: string,
): Ledger["since"] {
  let resolved = 0;
  let added = 0;
  let stronger = 0;
  let weaker = 0;
  const now = new Map(rows.map((h) => [h.id, h]));

  for (const [id, was] of Object.entries(before)) {
    const h = now.get(id);
    const wasLoud = isLoud(was.state as HState);
    if (wasLoud && !(h && isLoud(h.state))) resolved++;
  }
  for (const h of rows) {
    const was = before[h.id];
    if (isLoud(h.state) && !(was && isLoud(was.state as HState))) {
      added++;
      continue;
    }
    if (!was) continue;
    if (isLoud(was.state as HState) && !isLoud(h.state)) continue; // resolved
    const delta = h.score - was.p;
    if (delta >= 0.05) stronger++;
    else if (delta <= -0.05) weaker++;
  }
  return { at, resolved, new: added, stronger, weaker };
}

/**
 * A marker moved toward optimal: inside the band now, outside it two or more
 * draws ago. Anything that was always inside is not news.
 */
export function improvedOf(rows: MetricRow[]): Ledger["improved"] {
  const out: Ledger["improved"] = [];
  for (const m of rows) {
    if (m.points.length < 3) continue;
    if (m.optimalLow == null && m.optimalHigh == null) continue;
    const inside = (v: number) =>
      (m.optimalLow == null || v >= m.optimalLow) &&
      (m.optimalHigh == null || v <= m.optimalHigh);
    const latest = m.points[m.points.length - 1]!;
    if (!inside(latest.value)) continue;
    const older = m.points
      .slice(0, -2)
      .filter((p) => !inside(p.value))
      .pop();
    if (!older) continue;
    out.push({
      code: m.code,
      name: m.name,
      from: older.value,
      to: latest.value,
      unit: m.latest.unit ?? m.unit,
      since: older.date,
    });
  }
  return out;
}

/* ── the ledger ───────────────────────────────────────────────────────── */

/** The nine markers PhenoAge reads, plus the age it needs to read them with. */
const PHENO_INPUTS: [string, string][] = [
  ["albumin", "albumin"],
  ["creatinine", "creatinine"],
  ["glucose", "glucose"],
  ["hs_crp", "hs-CRP"],
  ["lymphocytes_pct", "lymphocytes %"],
  ["mcv", "MCV"],
  ["rdw", "RDW"],
  ["alp", "ALP"],
  ["wbc", "WBC"],
];

function phenoInputs(input: ModelInput) {
  const has = (code: string) =>
    code === "hs_crp"
      ? input.latest.hs_crp?.value != null || input.latest.crp?.value != null
      : code === "rdw"
        ? input.latest.rdw?.value != null || input.latest.rdw_cv?.value != null
        : input.latest[code]?.value != null;
  const present = PHENO_INPUTS.filter(([code]) => has(code)).map(([, l]) => l);
  const missing = PHENO_INPUTS.filter(([code]) => !has(code)).map(([, l]) => l);
  if (input.age == null) missing.push("your birth year");
  return { present, missing };
}

/** Which off-optimal draw the card leads with: worst status wins. */
function headline(codes: string[], byCode: Map<string, MetricRow>) {
  let best: MetricRow | null = null;
  for (const code of codes) {
    const row = byCode.get(code);
    if (!row || row.latest.value == null) continue;
    if (!best || STATUS_RANK[row.status] > STATUS_RANK[best.status]) best = row;
  }
  return best;
}

const rangeBarOf = (m: MetricRow): RangeBarProps => ({
  value: m.latest.value,
  prev: m.rows.filter((r) => r.value != null).at(-2)?.value ?? null,
  refLow: m.latest.refLow,
  refHigh: m.latest.refHigh,
  optimalLow: m.optimalLow,
  optimalHigh: m.optimalHigh,
  unit: m.latest.unit ?? m.unit,
});

const DEFAULT_DRAW_WEEKS = 12;

export async function buildLedger(
  userId: string,
  lens: Lens = "lifespan",
): Promise<Ledger> {
  const db = getDb();
  const [input, catalog, rows, report, protocol, rawReadings, before] =
    await Promise.all([
      buildModelInput(userId),
      loadCatalog(),
      getMetricRows(userId),
      latestReport(userId),
      db
        .select()
        .from(protocolItems)
        .where(
          and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
        ),
      db
        .select({
          id: readings.id,
          metricCode: readings.metricCode,
          value: readings.value,
          unit: readings.unit,
          observedAt: readings.observedAt,
        })
        .from(readings)
        .where(eq(readings.userId, userId))
        .orderBy(asc(readings.observedAt)),
      previousSnapshot(userId),
    ]);

  const scored = scoreHypotheses(input, { catalog, lens });
  const moves = nextMoves(input, catalog, { lens });
  const byId = new Map(catalog.map((h) => [h.id, h]));
  const byCode = new Map(rows.map((m) => [m.code, m]));
  const latestReading = new Map(rawReadings.map((r) => [r.metricCode, r]));
  const was = (before?.beliefs ?? null) as Beliefs | null;

  /* conditions */
  const actions = report?.body.actions ?? [];
  const conclusions: Conclusion[] = [];
  const quiet: Ledger["quiet"] = {
    unlikely: 0,
    ruledOut: 0,
    ids: [],
    rows: [],
  };

  for (const h of scored) {
    const prev = was?.[h.id];
    const changed =
      prev != null && prev.state !== h.state
        ? {
            from: prev.state as HState,
            to: h.state,
            deltaP: round3(h.score - prev.p),
          }
        : undefined;

    if (!isConclusion(h, changed != null)) {
      if (h.state === "ruled_out") quiet.ruledOut++;
      else quiet.unlikely++;
      quiet.ids.push(h.id);
      quiet.rows.push({ id: h.id, name: h.name, p: h.score });
      continue;
    }

    const spec = byId.get(h.id);
    const codes = spec ? metricCodesOf(spec) : [];
    const facts = spec ? factKeysOf(spec) : [];
    const lead = headline(codes, byCode);
    const next = moves
      .filter((m) => m.moves.some((x) => x.id === h.id))
      .slice(0, 3);

    conclusions.push({
      id: h.id,
      kind: "condition",
      rank: 0,
      title: `${h.name}: ${h.state.replace("_", " ")}`,
      probability: h.score,
      state: h.state,
      lenses: h.lenses,
      matters: mattersOf(h),
      for: h.for,
      against: h.against,
      missing: h.missing.map((x) => x.input),
      confounded: h.confounded.map((c) => `${c.input} (${c.tag})`),
      inputs: [
        ...codes.flatMap((code) => {
          const r = latestReading.get(code);
          if (!r) return [];
          return [
            {
              kind: "reading" as const,
              id: r.id,
              label: byCode.get(code)?.name ?? pretty(code),
              value: `${r.value ?? "?"}${r.unit ? ` ${r.unit}` : ""}`,
              date: r.observedAt,
            },
          ];
        }),
        ...facts.flatMap((key) => {
          const v = input.profile[key];
          if (v == null || String(v).trim() === "") return [];
          return [
            {
              kind: "fact" as const,
              id: key,
              label: pretty(key),
              value: Array.isArray(v) ? v.join(", ") : String(v),
            },
          ];
        }),
      ],
      next,
      question: next.find((m) => m.kind === "question" && m.cost === 0),
      action: actions.find((a) =>
        a.targets.some((t) => codes.includes(t.code)),
      ),
      rangeBar: lead ? rangeBarOf(lead) : undefined,
      trend:
        lead && lead.points.length >= 3
          ? { code: lead.code, points: lead.points }
          : undefined,
      changed,
    });
  }

  /* markers nobody explains */
  const explained = new Set(
    conclusions.flatMap((c) => {
      const spec = byId.get(c.id);
      return spec ? metricCodesOf(spec) : [];
    }),
  );
  for (const m of rows) {
    if (m.status !== "red" || explained.has(m.code)) continue;
    const r = latestReading.get(m.code);
    const unit = m.latest.unit ?? m.unit;
    conclusions.push({
      id: `marker:${m.code}`,
      kind: "marker",
      rank: 0,
      title: `${m.name} ${m.latest.value ?? "?"}${unit ? ` ${unit}` : ""}, off`,
      lenses: {},
      matters: 0,
      for: [],
      against: [],
      missing: [],
      confounded: [],
      inputs: r
        ? [
            {
              kind: "reading",
              id: r.id,
              label: m.name,
              value: `${r.value ?? "?"}${r.unit ? ` ${r.unit}` : ""}`,
              date: r.observedAt,
            },
          ]
        : [],
      next: moves.filter((x) => x.featureId === `metric:${m.code}`).slice(0, 3),
      rangeBar: rangeBarOf(m),
      trend:
        m.points.length >= 3 ? { code: m.code, points: m.points } : undefined,
    });
  }

  conclusions.sort(
    (a, b) =>
      b.matters - a.matters ||
      (b.probability ?? 0) - (a.probability ?? 0) ||
      a.title.localeCompare(b.title),
  );
  conclusions.forEach((c, i) => (c.rank = i + 1));

  const first = conclusions[0];
  const spear =
    first && (first.kind === "marker" || (first.state && isLoud(first.state)))
      ? first
      : undefined;

  /* the cockpit row */
  let optimal = 0;
  let normal = 0;
  let off = 0;
  for (const m of rows) {
    if (m.status === "green") optimal++;
    else if (m.status === "amber") normal++;
    else if (m.status === "red") off++;
  }

  const adopted = actions.filter((a) =>
    protocol.some((p) => p.text.startsWith(a.title)),
  );
  const drawTargets = adopted.flatMap((a) => a.targets);
  const nextDrawWeeks = drawTargets.length
    ? Math.min(...drawTargets.map((t) => t.measureAfterWeeks))
    : DEFAULT_DRAW_WEEKS;
  const nextDrawCodes = drawTargets.length
    ? [...new Set(drawTargets.map((t) => t.code))].slice(0, 4)
    : [
        ...new Set(
          moves
            .filter((m) => m.kind === "test")
            .slice(0, 3)
            .map((m) => m.label),
        ),
      ];

  const graph = computeGraphState(input, { top: 60 });
  const importance = new Map(graph.nodes.map((n) => [n.id, n.importance]));
  const systems: Ledger["systems"] = SYSTEMS.map((s) => {
    const worst = worstMember(s.id, input, importance);
    const row = worst ? input.latest[worst.code] : null;
    return {
      id: s.id,
      name: s.name,
      score: round2(importance.get(`system:${s.id}`) ?? 0),
      worst:
        worst && row
          ? {
              code: worst.code,
              value: row.value,
              unit: row.unit,
              status: row.status,
            }
          : undefined,
    };
  }).sort((a, b) => b.score - a.score);

  const pheno = phenoInputs(input);
  await writeSnapshot(userId, beliefsOf(scored), true);

  return {
    bioAge:
      input.derived.phenoAge != null && input.age != null
        ? {
            pheno: input.derived.phenoAge,
            chrono: input.age,
            inputs: pheno.present,
          }
        : undefined,
    bioAgeMissing: pheno.missing,
    counters: {
      optimal,
      normal,
      off,
      questions: moves.filter((m) => m.kind === "question").length,
      nextDrawWeeks,
      nextDrawCodes,
    },
    systems,
    spear,
    conclusions,
    quiet,
    improved: improvedOf(rows),
    since:
      was && before
        ? sinceOf(scored, was, before.computedAt.toISOString().slice(0, 10))
        : undefined,
  };
}

