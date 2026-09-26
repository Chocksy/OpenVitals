/**
 * The words and numbers of the Hybrid Home (phase 40b, `53-web.html`), pure,
 * so the page stays a printer and every sentence here is tested
 * (`lib/home-hybrid.test.ts`). Client-safe: no database, no server imports.
 */
import type {
  HeadingRow,
  HunchRow,
  TodayBody,
  TodayGoal,
} from "./api-contract";
import { nice } from "@/components/corridor";
import { dayLabel } from "./utils";
import type { MetricRow } from "./data";
import { bandOf, labPoints, zOf, type Band } from "./personal";

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
const word = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const and = (xs: string[]) =>
  xs.length < 2
    ? (xs[0] ?? "")
    : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/**
 * 53's header sentence, built from `today.heading`: "Two systems heading
 * away, one toward, four holding." and the line under it.
 */
export function headingSentence(heading: HeadingRow[]): {
  lead: string;
  away: string;
  rest: string;
  sub: string;
} {
  const n = (w: HeadingRow["word"]) =>
    heading.filter((h) => h.word === w).length;
  const away = n("away");
  const lead = `${cap(word(away))} ${away === 1 ? "system" : "systems"} heading `;
  const rest = `, ${word(n("toward"))} toward, ${word(n("holding"))} holding.`;
  const names = heading.filter((h) => h.word === "away").map((h) => h.name);
  const un = n("unmeasured");
  const sub = [
    names.length
      ? `${and(names)} ${names.length === 1 ? "is" : "are"} moving away from your own history.`
      : "Nothing is moving away from your own history.",
    un === 0
      ? ""
      : un === 1
        ? "One system has no recent readings, so it counts as unknown, not fine."
        : `${cap(word(un))} systems have no recent readings, so they count as unknown, not fine.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { lead, away: "away", rest, sub };
}

/** The draws of one marker and the band as it stood before each (as the case has). */
export function corridorSeries(metric: MetricRow): {
  series: { date: string; value: number }[];
  bandAt: { date: string; median: number; sd: number }[];
  lab: [number | null, number | null];
} {
  const pts = labPoints(metric.rows);
  const last = pts.at(-1);
  return {
    series: pts.map((p) => ({ date: p.date, value: p.value })),
    bandAt: pts.flatMap((p, i) => {
      const b = bandOf(pts.slice(0, i + 1), { code: metric.code });
      return b ? [{ date: p.date, median: b.median, sd: b.sd }] : [];
    }),
    lab: [last?.refLow ?? null, last?.refHigh ?? null],
  };
}

const T = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const YEAR = 365.25 * 86_400_000;

/**
 * 53's "Five years" slope: least squares over every draw inside five years
 * of `day`, read on the due date. Null with fewer than three draws.
 */
export function longLanding(
  series: { date: string; value: number }[],
  day: string,
  due: string | null,
): { perYear: number; value: number; date: string } | null {
  if (!due) return null;
  const w = series.filter(
    (p) => T(p.date) <= T(day) && T(day) - T(p.date) <= 5 * YEAR,
  );
  if (w.length < 3) return null;
  const xs = w.map((p) => T(p.date) / YEAR);
  const ys = w.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  if (!sxx) return null;
  const b = sxy / sxx;
  return { perYear: b, value: my + b * (T(due) / YEAR - mx), date: due };
}

/** Whole months from one day to another, for "Last 17 months". */
export function monthsBetween(from: string, to: string): number {
  const a = new Date(T(from));
  const b = new Date(T(to));
  return Math.max(
    1,
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
      b.getUTCMonth() -
      a.getUTCMonth(),
  );
}

/** A day `months` before another, as YYYY-MM-DD. */
export function monthsBefore(day: string, months: number): string {
  const d = new Date(T(day));
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

const group = (n: number) =>
  Math.round(n).toLocaleString("en-GB").replace(/,/g, " ");

export interface TodayLine {
  id: "sleep" | "moves" | "kcal" | "protein";
  name: string;
  said: string;
  /** 0–100, the score's own row */
  pct: number;
  /** a token name for the bar */
  tone: string;
}

/** 53's Today column, off `todayBody().score`: sleep, moves, calories, protein. */
export function todayLines(score: TodayBody["score"]): TodayLine[] {
  const { input, result } = score;
  const h = input.sleepHours;
  const pct = (v: number | null | undefined) =>
    Math.max(0, Math.min(100, v ?? 0));
  return [
    {
      id: "sleep",
      name: "Sleep",
      said:
        h == null
          ? "not logged yet"
          : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} · aim 7 to 9 h`,
      pct: pct(result.rows.sleep),
      tone: "var(--gene-l)",
    },
    {
      id: "moves",
      name: "Moves",
      said: input.moves
        ? `${input.moves.done} of ${input.moves.due} ticked`
        : "nothing due today",
      pct: pct(result.rows.moves),
      tone: "var(--life)",
    },
    {
      id: "kcal",
      name: "Calories",
      said:
        input.kcal == null
          ? "no meals logged yet"
          : input.targets.kcal
            ? `${group(input.kcal)} of ${group(input.targets.kcal)} kcal`
            : `${group(input.kcal)} kcal`,
      pct: pct(result.rows.kcal),
      tone: "var(--life-l)",
    },
    {
      id: "protein",
      name: "Protein",
      said:
        input.proteinG == null
          ? "no meals logged yet"
          : input.targets.proteinG
            ? `${Math.round(input.proteinG)} of ${Math.round(input.targets.proteinG)} g`
            : `${Math.round(input.proteinG)} g`,
      pct: pct(result.rows.protein),
      tone: "var(--life-l)",
    },
  ];
}

/** 53's `stateOf` on a glance row: the state word and what comes next. */
export function rowState(r: Pick<HunchRow, "kind" | "state" | "action">): {
  word: string;
  next: string;
  tone: string;
} {
  if (r.kind === "good_news")
    return { word: "good news", next: "kept", tone: "confirmed" };
  if (r.state === "closed")
    return { word: "closed", next: "see result", tone: "faded" };
  if (r.state === "testing")
    return { word: "testing", next: "waiting for the result", tone: "testing" };
  return {
    word: "open",
    next: r.action.kind === "answer" ? "1 question" : "1 test",
    tone: "",
  };
}

/** One view of the goal hero: a tab, its chart window and its sentence. */
export interface GoalView {
  id: "recent" | "five" | "all";
  tab: string;
  from: string | null;
  landing: { date: string; value: number } | null;
  /** the sentence around the landing number: `pre` <b>`b`</b> `post` */
  sentence: { pre: string; b: string; post: string } | null;
}

export interface GoalHeroProps {
  code: string;
  label: string;
  value: string;
  unit: string | null;
  gap: string;
  word: "toward" | "away" | "holding";
  slope: string | null;
  facts: string[];
  goal: { low: number | null; high: number | null };
  series: { date: string; value: number }[];
  bandAt: { date: string; median: number; sd: number }[];
  lab: [number | null, number | null];
  views: GoalView[];
}

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${nice(Math.abs(v))}`;

/** How far a value sits past the nearer goal edge, in words ("31 over the goal"). */
function gapOf(v: number, low: number | null, high: number | null): string {
  if (high != null && v > high) return `${nice(v - high)} over the goal`;
  if (low != null && v < low) return `${nice(low - v)} under the goal`;
  return "inside the goal";
}

/**
 * 53's goal hero, every string built here from `todayBody().goals[i]` and
 * the marker's own draws. Null when the goal has never been measured.
 */
export function goalHero(
  g: TodayGoal,
  cs: ReturnType<typeof corridorSeries>,
  day: string,
): GoalHeroProps | null {
  if (g.value == null || cs.series.length === 0) return null;
  const { low, high, due } = g.target;
  const unit = g.unit;
  const u = unit ? ` ${unit}` : "";
  const s = g.recentSlope?.perYear ?? null;
  const outside =
    (high != null && g.value > high) || (low != null && g.value < low);
  const word: GoalHeroProps["word"] =
    !outside || !s
      ? "holding"
      : (high != null && g.value > high) === s < 0
        ? "toward"
        : "away";
  const aim =
    low != null && high != null
      ? `${nice(low)} to ${nice(high)}`
      : high != null
        ? `${nice(high)} or under`
        : low != null
          ? `${nice(low)} or over`
          : "";
  const band = cs.bandAt.at(-1);
  // a lab floor of 0 is no floor: "under 100", not "0 to 100"
  const labLo = cs.lab[0] ? cs.lab[0] : null;
  const labHi = cs.lab[1];
  const labSaid =
    labLo != null && labHi != null
      ? `${nice(labLo)} to ${nice(labHi)}`
      : labHi != null
        ? `under ${nice(labHi)}`
        : labLo != null
          ? `over ${nice(labLo)}`
          : null;
  const facts = [
    `Last ${Math.min(3, cs.series.length)} draws ${cs.series
      .slice(-3)
      .map((p) => nice(p.value))
      .join(", ")}`,
    [
      band
        ? `Your band ${nice(band.median - band.sd)} to ${nice(band.median + band.sd)}`
        : "No band yet",
      labSaid ? `the lab's ${labSaid}` : null,
    ]
      .filter(Boolean)
      .join(", "),
  ];
  const by = due ? dayLabel(due, true) : null;
  const views: GoalView[] = [];
  if (g.recentSlope)
    views.push({
      id: "recent",
      tab: `Last ${monthsBetween(g.recentSlope.from, day)} months`,
      from: g.recentSlope.from,
      landing: g.landing,
      sentence:
        g.landing && by
          ? {
              pre: `If nothing changes, ${g.name} lands near `,
              b: nice(g.landing.value),
              post: ` on ${by}, ${gapOf(g.landing.value, low, high)}.`,
            }
          : null,
    });
  const long = longLanding(cs.series, day, due);
  if (long && by)
    views.push({
      id: "five",
      tab: "Five years",
      from: monthsBefore(day, 60),
      landing: { date: long.date, value: long.value },
      sentence: {
        pre: `On the five-year slope, ${signed(long.perYear)}${u} a year, ${g.name} lands near `,
        b: nice(long.value),
        post: ` on ${by}, ${gapOf(long.value, low, high)}.`,
      },
    });
  if (!views.length)
    views.push({
      id: "all",
      tab: "All draws",
      from: null,
      landing: null,
      sentence: null,
    });
  return {
    code: g.code,
    label: `Goal · ${g.name}${aim ? ` ${aim}` : ""}${by ? ` by ${by}` : ""}`,
    value: nice(g.value),
    unit,
    gap: gapOf(g.value, low, high),
    word,
    slope: s ? `${signed(s)}/yr` : null,
    facts,
    goal: { low, high },
    series: cs.series,
    bandAt: cs.bandAt,
    lab: cs.lab,
    views,
  };
}

/** 55's mini corridor and status word for one marker row on Blood's Markers tab (40c). */
export interface MarkerLane {
  mini: {
    band: Band | null;
    lab: [number | null, number | null];
    last: number;
    prev: number | null;
    goal: [number | null, number | null] | null;
  };
  /** "above your band", "12 over goal", "in your band", "too few draws" */
  word: string;
  /** a token for the dot and the word */
  tone: string;
  /** 55's sort key: outside the band first (by how far), then over goal */
  rank: number;
  /** outside the own band (2.5 spreads, the engine's rule) or past the goal */
  outside: boolean;
}

/**
 * 55's `statusOf` on real draws: the band from every lab draw before the
 * last, the last draw's distance from it, and an open goal when there is
 * one. Null for a marker with no lab draw (phone and derived rows).
 */
export function markerLane(
  metric: MetricRow,
  goal: { low: number | null; high: number | null } | null,
): MarkerLane | null {
  const pts = labPoints(metric.rows);
  const last = pts.at(-1);
  if (!last) return null;
  const band = bandOf(pts, { code: metric.code }) ?? null;
  const g = goal && (goal.low != null || goal.high != null) ? goal : null;
  const mini = {
    band,
    lab: [last.refLow ?? null, last.refHigh ?? null] as [
      number | null,
      number | null,
    ],
    last: last.value,
    prev: pts.at(-2)?.value ?? null,
    goal: g ? ([g.low, g.high] as [number | null, number | null]) : null,
  };
  const z = band ? zOf(last.value, band) : null;
  if (z != null && Math.abs(z) >= 2.5)
    return {
      mini,
      word: z > 0 ? "above your band" : "below your band",
      tone: "var(--blood)",
      rank: 5 + Math.abs(z),
      outside: true,
    };
  if (g && g.high != null && last.value > g.high)
    return {
      mini,
      word: `${nice(last.value - g.high)} over goal`,
      tone: "var(--h-amber)",
      rank: 4,
      outside: true,
    };
  if (g && g.low != null && last.value < g.low)
    return {
      mini,
      word: `${nice(g.low - last.value)} under goal`,
      tone: "var(--h-amber)",
      rank: 4,
      outside: true,
    };
  if (z == null)
    return {
      mini,
      word: "too few draws",
      tone: "var(--ink-3)",
      rank: 0,
      outside: false,
    };
  return {
    mini,
    word: "in your band",
    tone: "var(--ink-2)",
    rank: 1 + Math.abs(z) / 10,
    outside: false,
  };
}
