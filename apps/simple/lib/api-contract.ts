/**
 * The contract the native app consumes, phase 32a section 6.
 *
 * One module, so the shapes live in one place and the routes are four lines
 * each. `apps/simple/fixtures/api/*.json` is one real body per endpoint, and
 * `lib/api-contract.test.ts` validates every fixture against the shape below,
 * which is what `apps/ios` decodes with `Codable` structs.
 *
 * Rules, from the spec and enforced by the validator: dates are `YYYY-MM-DD`,
 * times are `HH:MM`, numbers are numbers, every number carries its unit, and
 * every estimate carries `estimated: true`.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  getDb,
  habitLogs,
  readings,
  uploads,
  type Hunch,
  type HunchExplanation,
  type HunchPrediction,
  type HunchQuestion,
  type HunchTest,
} from "@/db";
import { SYSTEMS } from "@/lib/graph";
import { loadGraph } from "@/lib/kg";
import {
  hunchOf,
  hunchRows,
  primaryOf,
  refreshHunches,
} from "@/lib/hunches";
import {
  bandOf,
  fitOf,
  labPoints,
  recentSlope,
  zOf,
  type Band,
  type LabPoint,
} from "@/lib/personal";
import { fmt, type Signal } from "@/lib/signals";
import { getBodyDay } from "@/lib/body-data";
import type { Status } from "@/lib/status";
import { goalGap, inGoal, localDay } from "@/lib/daily";
import { getGoals, getProtocol, getToday } from "@/lib/daily-data";
import { getMeals } from "@/lib/meals";
import {
  genesLayer,
  scoreOf,
  type ScoreInput,
  type ScoreResult,
} from "@/lib/score";
import { targetsFor, type Targets } from "@/lib/targets";
import { occurrenceItemOf, occurrences } from "@/lib/plan-line";
import { inputOn, labsOf } from "@/lib/score-days";
import {
  getMetricRows,
  sortForBiomarkerList,
  toBiomarkerRow,
  type MetricRow,
} from "@/lib/data";
import {
  buildToday,
  firstMoveSentence,
  goalsSentence,
  railCards,
  systemTiles,
  type RailTone,
} from "@/lib/home-data";
import { actionsForAll } from "@/lib/actions";
import { buildLedger } from "@/lib/ledger";
import { explainKey } from "@/lib/explain";
import { latestReport } from "@/lib/report";
import { MAX_CHANGE, projectionLine } from "@/lib/projection";
import { projectionsFor } from "@/lib/projections";
import { fmtCategory } from "@/lib/utils";
import { genomeVerdicts, loadGenome, movedIds } from "@/lib/genome";
import { genomeVerdict } from "@/lib/genome-catalog";
import { orderVerdicts } from "@/lib/genome-view";
import { previewLines } from "@/lib/projections";
import { listWatch, toApiPaper, type ApiPaper } from "@/lib/research-watch";
import {
  designWords,
  findingsFor,
  getTopic,
  isAssociation,
  listTopics,
  relevanceOf,
  topicCounts,
  topicPerson,
  verdictsOf,
} from "@/lib/topic-watch";
import type { TopicFinding as TopicFindingRow } from "@/db";

/* ── GET /api/today ───────────────────────────────────────────────────── */

/**
 * One goal, as Today prints it. Phase 34 section 1.
 *
 * `toGo` is the distance to the nearer edge of the target band, in the
 * marker's own unit, and is 0 once the value is inside it and null when the
 * marker has never been measured.
 */
export interface TodayGoal {
  code: string;
  name: string;
  value: number | null;
  unit: string | null;
  target: { low: number | null; high: number | null; due: string | null };
  toGo: number | null;
  onPace: boolean | null;
  paceLine: string | null;
  moves: { title: string; done: boolean }[];
  /**
   * Phase 37: the projection the Heading shelf draws. `levers` are its
   * contributions, one per adopted action; `history` is this marker's lab
   * readings, oldest first. Null when nothing projects this marker.
   */
  projection: {
    from: number;
    fromDate: string;
    expected: number;
    low: number;
    high: number;
    horizonWeeks: number;
    retestAt: string | null;
    levers: { name: string; delta: number; grade: string }[];
    history: { date: string; value: number }[];
  } | null;
  /**
   * Phase 39: least squares over the last three lab draws inside 24 months
   * (`recentSlope`), and that line read on the goal's due date. Null with
   * fewer than three draws, or, for `landing`, with no due date.
   */
  recentSlope: { perYear: number; n: number; from: string; to: string } | null;
  landing: { date: string; value: number } | null;
}

export interface TodayBody {
  sentence: { head: string; tail: string; tone: RailTone };
  goals: TodayGoal[];
  status: {
    off: number;
    borderline: number;
    optimal: number;
    drawDate: string | null;
    since: string | null;
  };
  body: { headline: string | null; unit: string | null; line: string };
  blood: {
    off: number;
    total: number;
    nextDraw: {
      weeks: number | null;
      codes: { code: string; name: string }[];
    } | null;
  };
  plan: {
    /** "0 / 4": what is done out of what today asks for */
    headline: string;
    /** how many of today's rows are not done */
    todo: number;
    /** the next undone row's title, or null when the day is finished */
    next: string | null;
  };
  systems: {
    id: string;
    name: string;
    word: string;
    value: number | null;
    unit: string | null;
    marker: string | null;
  }[];
  /**
   * Phase 37: the day's score. `input` travels with the result so the phone
   * can preview a tick or a portion through its port of `scoreOf` before the
   * server answers; `maxChange` is `MAX_CHANGE`, for lever previews.
   */
  score: {
    day: string;
    input: ScoreInput;
    result: ScoreResult;
    targets: Targets;
    /** `streak()` over the active days `getToday` counts */
    streak: number;
    maxChange: Record<string, number>;
  };
  /**
   * Last night, on the morning it ended. `bed`, `wake` and `stages` are
   * empty today: a sync stores minutes per stage (`wearable.sleepStages`), not
   * the intervals a hypnogram needs.
   */
  sleep: {
    hours: number | null;
    bed: string | null;
    wake: string | null;
    stages: {
      stage: "awake" | "rem" | "core" | "deep";
      start: string;
      end: string;
    }[];
  } | null;
  /** Phase 39: open hunches first, then unseen good news, at most 5 */
  hunches: HunchRow[];
  /** Phase 39: one word per system in `SYSTEMS`, for the header's Heading */
  heading: HeadingRow[];
  /** Phase 39: "Last draw N days ago · M of 12 systems · K open" */
  confidence: {
    lastDraw: string | null;
    days: number | null;
    measured: number;
    total: number;
    open: number;
  };
}

/** `GET /api/score/days`: the score per day, for the calendar. Phase 37. */
export interface ScoreDays {
  days: {
    day: string;
    score: number | null;
    life: number | null;
    blood: number | null;
    genes: number | null;
    /** a lab draw was observed that day */
    draw: boolean;
    reason: { text: string; sub: string; effect: number | null } | null;
  }[];
}

/**
 * What this person is moving, and whether it is going to get there.
 *
 * A goal is a row in `goals`: a target band, a date, or both. A row with a
 * date and no number is a planned draw — the Next draw tile is where that
 * already reads — so only the ones with a number to reach are goals here.
 * Achieved goals drop out; the order is `getGoals`'s own, nearest date first.
 *
 * `onPace` is the app's one real projection (`lib/projection.ts`) read against
 * the target: what the adopted actions, at the adherence on file, are expected
 * to do to this marker by its own retest date. True when that expected value
 * lands inside the target band, false when it does not, and **null when no
 * projection exists** — nothing adopted moves this marker, or it has never
 * been measured — because a projection nobody made is not a "no". A goal
 * already inside its band is on pace by measurement rather than by forecast.
 *
 * `paceLine` is the sentence the marker page prints under the same
 * projection, `projectionLine`, so the phone and the web never word it two
 * ways. Null when there is no projection.
 *
 * `moves` are the adopted protocol items whose own `metric_codes` name this
 * marker, with today's tick off `habit_logs`. Nothing is inferred from the
 * text of an action: an item that never named the marker never appears.
 *
 * `projection` is the same stored projection `onPace` reads, with its
 * contributions as levers and the marker's lab draws as its history. `rows`
 * is `getMetricRows` when the caller already has it.
 */
export async function todayGoals(
  userId: string,
  day: string = localDay(),
  rows?: MetricRow[],
): Promise<TodayGoal[]> {
  const [views, protocol, projections, metrics] = await Promise.all([
    getGoals(userId),
    getProtocol(userId),
    projectionsFor(userId),
    rows ?? getMetricRows(userId),
  ]);

  const open = views.filter(
    (g) =>
      !g.achievedAt && (g.targetLow != null || g.targetHigh != null),
  );
  if (!open.length) return [];

  const ticks = await getDb()
    .select({ itemId: habitLogs.itemId, done: habitLogs.done })
    .from(habitLogs)
    .where(and(eq(habitLogs.userId, userId), eq(habitLogs.day, day)));
  const doneIds = new Set(ticks.filter((t) => t.done).map((t) => t.itemId));

  return open.map((g) => {
    const projection =
      projections.find((p) => p.code === g.metricCode && !p.resolvedAt) ??
      projections.find((p) => p.code === g.metricCode) ??
      null;
    const reached = inGoal(g.current, g.targetLow, g.targetHigh);
    const points = labPoints(
      metrics.find((m) => m.code === g.metricCode)?.rows ?? [],
    );
    const slope = recentSlope(points, day);
    const at = g.due ? fitOf(points, day)?.at(g.due) : undefined;
    return {
      code: g.metricCode,
      name: g.metricName,
      value: g.current,
      unit: g.unit,
      target: { low: g.targetLow, high: g.targetHigh, due: g.due },
      toGo:
        g.current == null
          ? null
          : Math.round(goalGap(g.current, g.targetLow, g.targetHigh) * 100) /
            100,
      onPace: reached
        ? true
        : projection
          ? inGoal(projection.expected, g.targetLow, g.targetHigh)
          : null,
      paceLine: projection
        ? projectionLine({ ...projection, unit: g.unit ?? "" })
        : null,
      moves: protocol
        .filter((p) => p.active && p.metricCodes.includes(g.metricCode))
        .map((p) => ({ title: p.text, done: doneIds.has(p.id) })),
      projection: projection
        ? {
            from: projection.from,
            fromDate: projection.fromDate,
            expected: projection.expected,
            low: projection.low,
            high: projection.high,
            horizonWeeks: projection.horizonWeeks,
            retestAt: projection.retestAt ?? null,
            levers: projection.contributions.map((c) => ({
              name: c.intervention,
              delta: c.delta,
              grade: c.grade,
            })),
            history: (
              metrics.find((m) => m.code === g.metricCode)?.rows ?? []
            )
              .filter((r) => r.source == null && r.value != null)
              .map((r) => ({ date: r.observedAt, value: r.value! })),
          }
        : null,
      recentSlope: slope
        ? { ...slope, perYear: Math.round(slope.perYear * 100) / 100 }
        : null,
      landing:
        at != null && g.due
          ? { date: g.due, value: Math.round(at * 10) / 10 }
          : null,
    };
  });
}

/**
 * The Home page as one JSON body.
 *
 * Every number comes off the same three functions the page calls —
 * `buildLedger`, `railCards`, `systemTiles` — so the phone and the web can
 * never print different counters for the same day.
 */
export async function todayBody(
  userId: string,
  day: string = localDay(),
): Promise<TodayBody> {
  const [ledger, rows, today, report] = await Promise.all([
    buildLedger(userId),
    getMetricRows(userId),
    buildToday(userId),
    latestReport(userId),
  ]);

  const loudIds = [ledger.spear, ...ledger.conclusions]
    .filter((c) => c != null)
    .filter((c) => c.state === "likely" || c.state === "confirmed")
    .map((c) => c.id);
  const todo = await actionsForAll(userId, [...new Set(loudIds)]);
  const todoCount = Object.values(todo).reduce((n, l) => n + l.length, 0);

  const drawDate =
    rows.reduce(
      (max, m) => (m.latest.observedAt > max ? m.latest.observedAt : max),
      "",
    ) || null;

  const actions = report?.body.actions ?? [];
  const cards = railCards(ledger, today, {
    actions: actions.length,
    todo: todoCount,
    ...(drawDate ? { drawDate } : {}),
  });
  const cardOf = (kind: string) => cards.find((c) => c.kind === kind);

  // `titleOf` already ends the title with its state word ("High blood
  // pressure: possible"), so the tail is the state and the head is the rest.
  const { spear, counters } = ledger;
  const cut = spear ? spear.title.lastIndexOf(": ") : -1;

  const body = cardOf("body");
  const total = counters.off + counters.normal + counters.optimal;

  /**
   * The Body card is a number with its unit, its day and its writer.
   *
   * The rail's own Body card is a PhenoAge with "at 39" in the unit slot and
   * whatever question was due underneath, which is a sentence, not a number
   * with a unit. When a phone has synced, the card is today's steps — the
   * number a person recognises — dated and attributed. When none has, it falls
   * back to PhenoAge, and says so rather than leaving the unit slot to a
   * chronological age.
   */
  const phone = await bodyBody(userId, day);
  const steps = phone.rows.find((r) => r.type === "steps" && r.value != null);
  const newest = steps ?? phone.rows.find((r) => r.value != null);
  const bodyCard = newest
    ? {
        headline: newest.display,
        unit: newest.unit || null,
        line: [newest.when || phone.day, newest.source]
          .filter(Boolean)
          .join(" · "),
      }
    : {
        headline: ledger.bioAge ? ledger.bioAge.pheno.toFixed(1) : null,
        unit: ledger.bioAge ? "years" : null,
        line: ledger.bioAge
          ? `PhenoAge · at ${ledger.bioAge.chrono}`
          : ledger.bioAgeMissing.length
            ? `PhenoAge is waiting on ${ledger.bioAgeMissing.join(", ")}`
            : (body?.line ?? ""),
      };

  /**
   * The Plan card counts, and the sentence moves beside it.
   *
   * `plan.headline` used to be the first action's title, which a client cannot
   * add up. It is the done-of-total for today, off the same `planTodayBody`
   * `/api/plan/today` returns, so the two can never disagree; `plan.next`
   * keeps the sentence the web rail prints.
   */
  const planToday = await planTodayBody(userId, day);
  const undone = planToday.rows.filter((r) => !r.done);

  /**
   * Goals first. Phase 34 section 1.
   *
   * With a goal on file the sentence is what this person is moving and how
   * much of today is done; the ledger's own sentence — the spear, which is
   * what "seven markers off" reads as here — moves down to the Status card,
   * which is where the web rail now prints it.
   *
   * With no goal the sentence names the loudest system and says it is the one
   * to move first. It never says sick: this app can say a marker is off its
   * band and it cannot diagnose anybody.
   */
  const goals = await todayGoals(userId, day, rows);
  const goalSaid = goalsSentence(goals, {
    done: planToday.done,
    total: planToday.total,
  });
  const fallback = firstMoveSentence(ledger.systems);
  const sentence = goalSaid
    ? {
        ...goalSaid,
        tone: (goals.some((g) => g.onPace === false)
          ? "warn"
          : goals.some((g) => g.onPace === true)
            ? "ok"
            : "none") as RailTone,
      }
    : fallback;

  /**
   * The score. Phase 37 task A3.
   *
   * Every input is a number another part of this body already stands on:
   * moves are the adopted rows `planTodayBody` counts (suggestions tick
   * nothing), food is the meals card's own `dayTotals`, genes is `genesLayer`
   * over the genome page's verdicts. `inputOn` is the function `daysFrom`
   * builds every calendar day with, so blood is `bloodAsOf` over the same
   * metric rows (as of `day`, which the ledger's counters are not) and moves
   * are `movesOn`: the header and the calendar's last cell cannot disagree.
   * The Status block keeps the ledger's counters.
   */
  const [log, food, genome, targets] = await Promise.all([
    getToday(userId, day),
    getMeals(userId, day),
    genomeBody(userId),
    targetsFor(userId, day),
  ]);
  const adopted = planToday.rows.filter((r) => r.itemId != null);
  const input: ScoreInput = inputOn(day, {
    sleepHours: log.values.sleepHours ?? null,
    dueIds: adopted.map((r) => r.itemId!),
    ticks: adopted,
    kcal: food.totals.kcal,
    proteinG: food.totals.protein_g,
    targets: { kcal: targets.kcal, proteinG: targets.proteinG },
    labs: labsOf(rows),
    genes: genesLayer(genome.file ? genome.verdicts : null),
  });

  const glance = await todayHunches(userId, rows, goals, day);

  return {
    sentence,
    goals,
    ...glance,
    status: {
      off: counters.off,
      borderline: counters.normal,
      optimal: counters.optimal,
      drawDate,
      since: ledger.since ? ledger.since.at.slice(0, 10) : null,
    },
    body: bodyCard,
    blood: {
      off: counters.off,
      total,
      nextDraw: counters.nextDrawCodes.length
        ? {
            weeks: counters.nextDrawWeeks ?? null,
            codes: counters.nextDrawCodes.map((code) => ({
              code,
              name: explainKey(code),
            })),
          }
        : null,
    },
    plan: {
      headline: `${planToday.done} / ${planToday.total}`,
      todo: undone.length,
      next: undone[0]?.title ?? null,
    },
    systems: systemTiles(ledger.systems).map((t) => ({
      id: t.id,
      name: t.name,
      word: t.word,
      // The tile prints a string because it prints; the contract says numbers
      // are numbers, so the number goes back to being one here.
      value:
        t.value != null && Number.isFinite(Number(t.value))
          ? Number(t.value)
          : null,
      unit: t.unit ?? null,
      marker: t.markerName ?? null,
    })),
    score: {
      day,
      input,
      result: scoreOf(input),
      targets,
      streak: log.streak,
      maxChange: MAX_CHANGE,
    },
    sleep:
      input.sleepHours == null
        ? null
        : { hours: input.sleepHours, bed: null, wake: null, stages: [] },
  };
}

/* ── GET /api/body ────────────────────────────────────────────────────── */

/* ── GET /api/markers (phase 34 section 2) ───────────────────────────── */

export interface MarkersBody {
  /** how many days of history each `series` carries */
  days: number;
  markers: {
    code: string;
    name: string;
    /** the system the Markers tab groups it under, in the words it prints */
    system: string;
    value: number | null;
    unit: string | null;
    date: string;
    word: string;
    /** the lab's own reference range */
    band: { low: number | null; high: number | null };
    optimal: { low: number | null; high: number | null };
    series: { date: string; value: number }[];
    goal: { low: number | null; high: number | null; due: string | null } | null;
    /**
     * Phase 39: the person's own band from the draws before the last
     * (`bandOf`), named `personalBand` because `band` is the lab range above.
     */
    personalBand: Band | null;
    /** where the last draw sits on `personalBand`, in spreads */
    z: number | null;
    /** the live hunch this marker belongs to, if any */
    signal: { kind: Signal["kind"]; hunchId: string } | null;
  }[];
}

/**
 * The word a marker row wears, exactly as the Markers tab prints it.
 *
 * This is not `wordOf`: Blood says "optimal" where the Body page says "good",
 * and it tells "no band" (a number nothing can judge) apart from "never
 * measured" (no number at all). The phone's Blood tab is the Markers tab, so
 * it gets the Markers tab's words.
 */
export function markerWord(
  status: Status,
  hasValue: boolean,
): "off" | "borderline" | "optimal" | "no band" | "never measured" {
  if (status === "red") return "off";
  if (status === "amber") return "borderline";
  if (status === "green") return "optimal";
  return hasValue ? "no band" : "never measured";
}

/** "vital_sign" -> "Vital sign": a system is a name, so it starts with one. */
const systemName = (c: string) => {
  const t = fmtCategory(c);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The last `days` of a marker's own history, counted from its newest point. */
export function seriesOf(
  points: { date: string; value: number }[],
  days: number,
): { date: string; value: number }[] {
  const last = points[points.length - 1];
  if (!last) return [];
  const from = new Date(new Date(last.date).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return points.filter((p) => p.date >= from);
}

/**
 * Every marker with the history behind it. Phase 34 section 2.
 *
 * Grouped and sorted the way `/blood?tab=markers` is: `sortForBiomarkerList`
 * decides the order, then the rows of one system stay together in the order
 * that sort first met them, which is what the tab's own `Map` does. The list
 * is flat and every row names its system, so a client groups it by reading
 * the rows in order and never has to re-sort.
 *
 * `days` is counted back from each marker's **own** newest reading, not from
 * today. Counted from today it empties the series of every marker last drawn
 * before the window — this account's oldest draws are from 2021 — and a phone
 * that got an empty series would draw nothing where the web draws a full
 * history. A marker with one draw still sends that one point.
 */
export async function markersBody(
  userId: string,
  days = 365,
): Promise<MarkersBody> {
  const [metrics, goals, live] = await Promise.all([
    getMetricRows(userId),
    getGoals(userId),
    hunchRows(userId).then((hs) => hs.filter((h) => h.state !== "closed")),
  ]);
  const goalByCode = new Map(
    goals.filter((g) => !g.achievedAt).map((g) => [g.metricCode, g]),
  );
  const order = new Map(
    sortForBiomarkerList(metrics.map(toBiomarkerRow)).map((r, i) => [r.code, i]),
  );
  const sorted = [...metrics].sort(
    (a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0),
  );

  /* One bucket per system, in the order the sort first met it: the same
     grouping `BloodMarkers` builds, so the phone's sections match the web's. */
  const groups = new Map<string, typeof sorted>();
  for (const m of sorted)
    groups.set(m.category, [...(groups.get(m.category) ?? []), m]);

  return {
    days,
    markers: [...groups.values()].flat().map((m) => {
      const goal = goalByCode.get(m.code);
      const points = labPoints(m.rows);
      const personalBand = bandOf(points, { code: m.code }) ?? null;
      const last = points[points.length - 1];
      const hunch = live.find((h) => h.codes.includes(m.code));
      return {
        code: m.code,
        name: m.name,
        system: systemName(m.category),
        value: m.latest.value,
        unit: m.latest.unit ?? m.unit,
        date: m.latest.observedAt,
        word: markerWord(
          m.status,
          m.latest.value != null || m.latest.valueText != null,
        ),
        band: { low: m.latest.refLow, high: m.latest.refHigh },
        optimal: { low: m.optimalLow, high: m.optimalHigh },
        series: seriesOf(m.points, days),
        goal: goal
          ? { low: goal.targetLow, high: goal.targetHigh, due: goal.due }
          : null,
        personalBand,
        z:
          personalBand && last
            ? Math.round(zOf(last.value, personalBand) * 100) / 100
            : null,
        signal: hunch
          ? { kind: hunch.kind as Signal["kind"], hunchId: hunch.id }
          : null,
      };
    }),
  };
}

export interface BodyBody {
  day: string;
  synced: { types: number; lastAt: string | null };
  rows: {
    type: string;
    name: string;
    identifier: string;
    source: string;
    value: number | null;
    unit: string;
    display: string;
    note: string;
    word: string;
    when: string;
  }[];
}

/**
 * Who wrote a row, in words.
 *
 * The phone sends `sourceRevision.source.bundleIdentifier` on every sample —
 * `com.apple.health` for the Health app itself, `com.dexcom.g7` for a monitor
 * — and that is the writer. "healthkit" is the pipeline that carried it and
 * says nothing about who wrote it, so it is never printed here.
 *
 * "phone" is the fallback and means exactly what it says: a phone wrote this
 * and did not name itself.
 */
export function writerOf(device: string | null | undefined): string {
  const bundle = (device ?? "").trim();
  if (!bundle || bundle === "healthkit") return "phone";
  // Apple writes device-authored data as `com.apple.health.<device uuid>`.
  if (/^com\.apple\.health\b/i.test(bundle)) return "Apple Health";
  return bundle;
}

/**
 * The word a row wears.
 *
 * The Body page prints nothing for a signal that is fine, because a column of
 * "good" is a column nobody reads. The contract is not a page: a client that
 * decodes an empty string has to invent the meaning, so every row with a value
 * gets one of the four words, and a type with no band to judge it by is
 * "good".
 */
export function wordOf(status: Status, hasValue: boolean): string {
  if (!hasValue) return "never measured";
  if (status === "red") return "off";
  if (status === "amber") return "borderline";
  return "good";
}

/**
 * One day of everything the phone knows.
 *
 * `getBodyDay` formats for print — its `value` is the digits and its `date`
 * may be null — so the contract's `value` is parsed back into a number and
 * `display` keeps the formatted one. The unit is never dropped.
 */
export async function bodyBody(
  userId: string,
  day: string = localDay(),
): Promise<BodyBody> {
  const view = await getBodyDay(userId, day);
  return {
    day: view.day,
    // The newest write from any phone, not this day's: a day the phone has not
    // touched today still has a last sync, and null means never.
    synced: { types: view.typesSeen, lastAt: view.lastSyncAt },
    rows: view.rows.map((r) => {
      const n = Number(r.value.replace(/[  \s,]/g, ""));
      const value = r.value === "—" || !Number.isFinite(n) ? null : n;
      return {
        type: r.key,
        name: r.name,
        identifier: r.identifier,
        source: writerOf(r.device),
        value,
        unit: r.unit,
        display: r.value,
        note: r.note,
        word: wordOf(r.status, value != null),
        when: r.date ?? "",
      };
    }),
  };
}

/* ── GET /api/plan/today ──────────────────────────────────────────────── */

export interface PlanTodayBody {
  day: string;
  done: number;
  total: number;
  rows: {
    /** null for a suggested row: nothing has been adopted, so nothing is tickable */
    itemId: string | null;
    /**
     * Phase 38. What `/api/plan/adopt` takes as `{ id }` for a suggested row
     * (`plan:<reportId>:<actionIndex>`, the form `adoptBodyOf` reads); null for
     * a row that is already on the protocol.
     */
    adoptId: string | null;
    time: string | null;
    slot: string | null;
    title: string;
    why: string;
    tag: "protocol" | "goal" | "every day" | "suggested";
    done: boolean;
    /** 0 to 1: the share of the last 30 days it was done. */
    adherence: number | null;
  }[];
}

/**
 * The day in the order it runs.
 *
 * `occurrences` decides which items are due and in what order; `habit_logs`
 * decides which are done. A slot is not a clock time, so `time` is null unless
 * the line carried a literal `HH:MM` and `slot` carries the word instead.
 *
 * "Suggested" rows are the report's own actions that have not been adopted.
 * Nothing here invents one: an action the plan never wrote never appears.
 */
export async function planTodayBody(
  userId: string,
  day: string = localDay(),
): Promise<PlanTodayBody> {
  const [protocol, goals, report] = await Promise.all([
    getProtocol(userId),
    getGoals(userId),
    latestReport(userId),
  ]);

  const active = protocol.filter((p) => p.active);
  const byId = new Map(active.map((p) => [p.id, p]));
  const goalCodes = new Set(
    goals.filter((g) => !g.achievedAt).map((g) => g.metricCode),
  );

  const due = occurrences(active.map(occurrenceItemOf), day, day);

  const ticks = await getDb()
    .select({ itemId: habitLogs.itemId, done: habitLogs.done })
    .from(habitLogs)
    .where(and(eq(habitLogs.userId, userId), eq(habitLogs.day, day)));
  const doneIds = new Set(ticks.filter((t) => t.done).map((t) => t.itemId));

  const rows: PlanTodayBody["rows"] = due.map((o) => {
    const item = byId.get(o.itemId)!;
    const codes = item.metricCodes ?? [];
    const tag: PlanTodayBody["rows"][number]["tag"] = codes.some((c) =>
      goalCodes.has(c),
    )
      ? "goal"
      : item.timeOfDay == null &&
          item.daysOfWeek == null &&
          item.doseAmount == null
        ? "every day"
        : "protocol";
    return {
      itemId: o.itemId,
      adoptId: null,
      time: o.time,
      slot: o.slot,
      title: item.text,
      why: item.why ?? "",
      tag,
      done: doneIds.has(o.itemId),
      // `adherence30` is a whole percent; the contract carries a fraction.
      adherence: item.adherence30 / 100,
    };
  });

  /**
   * The plan's own actions that were never adopted. A suggestion says out loud
   * that it is one, carries no item id and counts toward nothing — which is
   * the whole reason the tag exists.
   */
  const adopted = active.map((p) => p.text);
  /* the index counts every action, tests included: it is the one `adopt` reads back */
  for (const [i, action] of (report?.body.actions ?? []).entries()) {
    if (action.kind === "test") continue;
    if (adopted.some((t) => t.startsWith(action.title))) continue;
    rows.push({
      itemId: null,
      adoptId: `plan:${report!.id}:${i}`,
      time: null,
      slot: null,
      title: action.title,
      why: action.why,
      tag: "suggested",
      done: false,
      adherence: null,
    });
  }

  return {
    day,
    done: rows.filter((r) => r.done).length,
    total: rows.length,
    rows,
  };
}

/* ── GET /api/genome ──────────────────────────────────────────────────── */

export interface GenomeBody {
  file: { name: string; readAt: string } | null;
  verdicts: {
    conditionId: string;
    name: string;
    direction: "up" | "down" | "none";
    factor: number | null;
    grade: string;
    reason: string;
    testNeeded: boolean;
    absent: boolean;
  }[];
  genes: {
    verdict: string;
    gene: string;
    call: string | null;
    grade: string;
    moved: boolean;
    source: string;
    rsids: string[];
  }[];
}

/**
 * The genome page as one JSON body. Phase 32a section 3 and section 6.
 *
 * The same three calls `/blood/genome` makes — `loadGenome`,
 * `genomeVerdicts`, `orderVerdicts` — so the phone prints the cards in the
 * order the web draws them.
 *
 * `moved` is `movedIds`, not `genomeVerdict().moved`: the latter answers true
 * for a row no rule reads at all (silence is not evidence of no effect), which
 * is the right answer for a page that explains itself and the wrong one for a
 * client deciding whether to show a badge. Here it means what it says — this
 * gene moved a condition.
 *
 * `verdicts` carries the eight fields section 3 names and not the internal
 * `geneIds`; the gene list below is where a client goes for the rows.
 */
export async function genomeBody(userId: string): Promise<GenomeBody> {
  const [file] = await getDb()
    .select({ name: uploads.fileName, at: uploads.createdAt })
    .from(uploads)
    .where(and(eq(uploads.userId, userId), eq(uploads.kind, "genome")))
    .orderBy(desc(uploads.createdAt))
    .limit(1);

  const results = file ? await loadGenome(userId) : [];
  const verdicts = orderVerdicts(
    genomeVerdicts(
      results.map((r) => r.row),
      results,
    ),
  );
  const moved = movedIds(verdicts);

  return {
    file:
      file && file.at
        ? { name: file.name ?? "", readAt: file.at.toISOString().slice(0, 10) }
        : null,
    verdicts: verdicts.map((v) => ({
      conditionId: v.conditionId,
      name: v.name,
      direction: v.direction,
      factor: v.factor,
      grade: v.grade,
      reason: v.reason,
      testNeeded: v.testNeeded,
      absent: v.absent,
    })),
    genes: results.map((r) => {
      const g = genomeVerdict(r);
      return {
        verdict: g.verdict,
        gene: g.gene,
        call: g.call,
        grade: g.grade,
        moved: moved.has(g.id),
        source: g.source,
        rsids: g.rsids,
      };
    }),
  };
}

/* ── GET /api/research/topics ─────────────────────────────────────────── */

/**
 * One topic on this person's watch list. Phase 35 section B.
 *
 * `outcomes` and `papers` are counts off `topic_findings`, so a topic that
 * has been searched and not read prints `papers: 0` and says "found, not read
 * yet" rather than a grade nobody earned.
 */
export interface ApiTopic {
  topic: string;
  label: string;
  /** adopted | goal | asked | typed */
  origin: string;
  lastRunAt: string | null;
  relevance: string;
  outcomes: number;
  papers: number;
  /** how many `paper_watch` rows this topic has found, read or not */
  found: number;
}

export interface TopicsBody {
  topics: ApiTopic[];
}

/** One graded finding: a trial, or an association, in the same shape. */
export interface ApiFinding {
  id: string;
  name: string;
  dose: string | null;
  duration: string | null;
  outcomeText: string;
  outcomeFeatureId: string | null;
  effect: string | null;
  /** up | down | none */
  direction: string;
  /** A–E */
  grade: string;
  studyType: string;
  /** "randomised, n = 46" */
  design: string;
  n: number | null;
  population: string | null;
  /** true when the design can only show two things travelled together */
  association: boolean;
  paper: {
    title: string;
    journal: string | null;
    year: number | null;
    url: string;
    doi: string | null;
    pmid: string | null;
  } | null;
  quote: string;
}

/** One line of the verdict strip. */
export interface ApiVerdict {
  outcomeText: string;
  outcomeFeatureId: string | null;
  direction: string;
  /** on | off | none: good, bad, or neither, by the outcome */
  tone: string;
  grade: string;
  trials: number;
  association: boolean;
  doseRange: string | null;
}

export interface TopicBody {
  topic: string;
  label: string;
  origin: string;
  lastRunAt: string | null;
  relevance: string;
  /** the projection line, when a marker outcome makes one */
  forYou: string[];
  verdicts: ApiVerdict[];
  trials: ApiFinding[];
  associations: ApiFinding[];
  papers: ApiPaper[];
}

/** A stored finding as the contract prints it. */
export function toApiFinding(f: TopicFindingRow): ApiFinding {
  return {
    id: f.id,
    name: f.name,
    dose: f.dose,
    duration: f.duration,
    outcomeText: f.outcomeText,
    outcomeFeatureId: f.outcomeFeatureId,
    effect: f.effect,
    direction: f.direction,
    grade: f.grade,
    studyType: f.studyType,
    design: designWords(f.studyType, f.n),
    n: f.n,
    population: f.population,
    association: isAssociation(f.studyType),
    paper: f.paper
      ? {
          title: f.paper.title,
          journal: f.paper.journal,
          year: f.paper.year,
          url: f.paper.url,
          doi: f.paper.doi,
          pmid: f.paper.pmid,
        }
      : null,
    quote: f.quote,
  };
}

export async function topicsBody(userId: string): Promise<TopicsBody> {
  const [rows, person] = await Promise.all([
    listTopics(userId),
    topicPerson(userId),
  ]);
  const counts = await topicCounts(rows.map((r) => r.topic));
  const found = await Promise.all(
    rows.map((r) => listWatch(userId, { topic: r.topic, limit: 200 })),
  );

  return {
    topics: rows.map((r, i) => {
      const c = counts.get(r.topic) ?? { outcomes: 0, papers: 0 };
      return {
        topic: r.topic,
        label: r.label,
        origin: r.origin,
        lastRunAt: r.lastRunAt?.toISOString().slice(0, 10) ?? null,
        relevance: relevanceOf(r, person),
        outcomes: c.outcomes,
        papers: c.papers,
        found: found[i]?.length ?? 0,
      };
    }),
  };
}

export async function topicBody(
  userId: string,
  wanted: string,
): Promise<TopicBody | null> {
  const row = await getTopic(userId, wanted);
  if (!row) return null;

  const [findings, papers, person] = await Promise.all([
    findingsFor(row.topic),
    listWatch(userId, { topic: row.topic, limit: 200 }),
    topicPerson(userId),
  ]);

  const relevance = relevanceOf(row, person, findings);
  const labels = new Map([[`topic:${row.topic}`, row.label]]);
  const marked = findings.filter((f) => f.outcomeFeatureId);
  const preview = marked.length
    ? await previewLines([...new Set(marked.map((f) => f.name))].slice(0, 4))
    : {};

  return {
    topic: row.topic,
    label: row.label,
    origin: row.origin,
    lastRunAt: row.lastRunAt?.toISOString().slice(0, 10) ?? null,
    relevance,
    forYou: Object.values(preview),
    verdicts: verdictsOf(findings),
    trials: findings.filter((f) => !isAssociation(f.studyType)).map(toApiFinding),
    associations: findings
      .filter((f) => isAssociation(f.studyType))
      .map(toApiFinding),
    papers: papers.map((p) => toApiPaper(p, labels)),
  };
}

/* ── GET /api/hunches (phase 39 S7) ──────────────────────────────────── */

type HunchKind = Signal["kind"];

/** One hunch at a glance: a row on Today's shelf and the Blood tab. */
export interface HunchRow {
  id: string;
  kind: HunchKind;
  /** STEP, CLUSTER, DRIFT, GAP, GOOD NEWS, OUT OF BAND or APART */
  stamp: string;
  system: string | null;
  /** one plain sentence from a code template: no z, no percentages */
  line: string;
  number: { value: number | null; unit: string | null };
  mini: {
    band: Band | null;
    lab: [number | null, number | null] | null;
    last: number | null;
    goal: [number | null, number | null] | null;
  };
  action: { kind: "answer" | "book" | "got_it" | "result"; label: string };
  state: "open" | "testing" | "closed";
}

type CaseSeries = {
  date: string;
  value: number;
  file: string | null;
  /** phase 40 (optional): the upload behind `file`, for `/blood/uploads/[id]` */
  upload?: string | null;
}[];
type BandAt = { date: string; median: number; sd: number }[];

/** `GET /api/hunches/[id]`: the case behind a row. */
export interface HunchCase extends HunchRow {
  say: string;
  /** every lab draw of the lead marker; `file` null = imported from the old app */
  series: CaseSeries;
  /** the band as it stood before each draw, for the corridor and the replay */
  bandAt: BandAt;
  explanations: HunchExplanation[];
  question: HunchQuestion | null;
  answer: string | null;
  test: HunchTest | null;
  predictions: HunchPrediction[] | null;
  writtenAt: string | null;
  outcome: string | null;
  outcomeLine: string | null;
  rule: string[];
  unknowns: string[];
  firedAt: string[];
  /** a cluster's members, one lane each; empty for every other kind */
  markers: {
    code: string;
    name: string;
    unit: string | null;
    last: number | null;
    band: Band | null;
    series: CaseSeries;
    bandAt: BandAt;
  }[];
}

export interface HunchesBody {
  open: HunchRow[];
  goodNews: HunchRow[];
  closed: HunchRow[];
}

export interface HeadingRow {
  id: string;
  name: string;
  word: "toward" | "holding" | "away" | "unmeasured";
  why: string;
}

const STAMP: Record<HunchKind, string> = {
  step: "STEP",
  cluster: "CLUSTER",
  drift: "DRIFT",
  gap: "GAP",
  good_news: "GOOD NEWS",
  left_band: "OUT OF BAND",
  discordance: "APART",
};

const monthOf = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

interface HunchCtx {
  byCode: Map<string, MetricRow>;
  points: Map<string, LabPoint[]>;
  goals: Map<string, { low: number | null; high: number | null }>;
}

async function hunchCtx(userId: string, rows?: MetricRow[]): Promise<HunchCtx> {
  const [metrics, goals] = await Promise.all([
    rows ?? getMetricRows(userId),
    getGoals(userId),
  ]);
  return {
    byCode: new Map(metrics.map((m) => [m.code, m])),
    points: new Map(metrics.map((m) => [m.code, labPoints(m.rows)])),
    goals: new Map(
      goals
        .filter(
          (g) => !g.achievedAt && (g.targetLow != null || g.targetHigh != null),
        )
        .map((g) => [g.metricCode, { low: g.targetLow, high: g.targetHigh }]),
    ),
  };
}

/** The glance sentence and the case's `say`, from the signal, in code. */
export function wordsOf(
  s: Pick<Signal, "kind" | "codes" | "dir" | "since" | "numbers" | "system">,
  name: (code: string) => string,
  unit: (code: string) => string,
): { line: string; say: string } {
  const n = s.numbers;
  const c = primaryOf(s);
  const nm = name(c);
  const u = unit(c);
  const up = s.dir === "up";
  switch (s.kind) {
    case "step":
      return {
        line: `${nm} moved to a ${up ? "higher" : "lower"} level in ${monthOf(s.since!)}.`,
        say: `Your last ${n.k} draws all sit ${up ? "above" : "below"} every earlier draw. That is a new level, not one odd result.`,
      };
    case "drift": {
      const rate = `${fmt(Math.abs(Number(n.perYear)))}${u} a year`;
      const goal = n.goalLow != null || n.goalHigh != null;
      return {
        line: goal
          ? `${nm} is moving away from your goal, ${up ? "up" : "down"} ${rate}.`
          : `${nm} is ${up ? "rising" : "falling"} ${rate}.`,
        say:
          n.landing != null
            ? `On the line through your last three draws it lands near ${fmt(Number(n.landing))}${u} on ${n.due}.`
            : `The line through your last three draws points ${up ? "up" : "down"}.`,
      };
    }
    case "cluster": {
      const group =
        s.system === "iron"
          ? "iron and vitamin"
          : (SYSTEMS.find((x) => x.id === s.system)?.name.toLowerCase() ??
            String(s.system));
      return {
        line: `${s.codes.length} ${group} markers moved the worse way together, led by ${nm}.`,
        say: `${s.codes.map(name).join(", ")} all sit on the worse side of their own middle on the same draw. One question covers the group.`,
      };
    }
    case "gap":
      return {
        line: `${n.gene} ${n.call} makes ${nm} worth a check; ${n.lastSeen === "never" ? "it was never measured" : `last measured ${monthOf(String(n.lastSeen))}`}.`,
        say: `Your genome makes this marker worth having, and your last three draws did not include it.`,
      };
    case "good_news":
      return {
        line: `${nm} is back in your usual range since ${monthOf(s.since!)}.`,
        say: `It was ${fmt(Number(n.was))}${u} on ${n.wasDate}. The ${n.back} draws since are back inside.`,
      };
    case "left_band":
      return {
        line: `${nm} is ${up ? "above" : "below"} your usual range.`,
        say: `The last draw sits far outside the range your own earlier draws set.`,
      };
    case "discordance":
      return {
        line: `${name(s.codes[0]!)} and ${name(s.codes[1]!)} are moving apart.`,
        say: `The graph says these two move together; on your draws they move apart.`,
      };
  }
}

function actionOf(h: Hunch): HunchRow["action"] {
  if (h.state === "closed") return { kind: "result", label: "See result" };
  if (h.kind === "good_news") return { kind: "got_it", label: "Got it" };
  if (h.state === "testing")
    return { kind: "result", label: "Waiting for the result" };
  if (h.question && !h.answer) return { kind: "answer", label: "Answer" };
  return { kind: "book", label: "Book the test" };
}

const lastOf = (ctx: HunchCtx, code: string) => {
  const p = ctx.points.get(code);
  return p?.[p.length - 1];
};

function rowOf(h: Hunch, ctx: HunchCtx): HunchRow {
  const s = h.signal as unknown as Signal;
  const c = primaryOf(s);
  const name = (x: string) => ctx.byCode.get(x)?.name ?? x;
  const unitOf = (x: string) => ctx.byCode.get(x)?.unit ?? null;
  const last = lastOf(ctx, c);
  const goal = ctx.goals.get(c);
  return {
    id: h.id,
    kind: h.kind as HunchKind,
    stamp: STAMP[h.kind as HunchKind] ?? h.kind.toUpperCase(),
    system: h.system,
    line: wordsOf(s, name, (x) => (unitOf(x) ? ` ${unitOf(x)}` : "")).line,
    number: { value: last?.value ?? null, unit: last?.unit ?? unitOf(c) },
    mini: {
      band: bandOf(ctx.points.get(c) ?? [], { code: c }) ?? null,
      lab:
        last && (last.refLow != null || last.refHigh != null)
          ? [last.refLow, last.refHigh]
          : null,
      last: last?.value ?? null,
      goal: goal ? [goal.low, goal.high] : null,
    },
    action: actionOf(h),
    state: h.state as HunchRow["state"],
  };
}

/** Every draw of one marker, and the band as it stood before each. */
function corridorOf(
  code: string,
  ctx: HunchCtx,
  files: Map<string, FileOf>,
): { series: CaseSeries; bandAt: BandAt } {
  const pts = ctx.points.get(code) ?? [];
  return {
    series: pts.map((p) => {
      const f = files.get(`${code}|${p.date}`);
      return {
        date: p.date,
        value: p.value,
        file: f?.file ?? null,
        upload: f?.upload ?? null,
      };
    }),
    bandAt: pts.flatMap((p, i) => {
      const b = bandOf(pts.slice(0, i + 1), { code });
      return b ? [{ date: p.date, median: b.median, sd: b.sd }] : [];
    }),
  };
}

type FileOf = { file: string | null; upload: string | null };

/** `readings.upload_id` to `uploads.file_name`, per code and draw day. */
async function filesOf(userId: string, codes: string[]) {
  const rows = await getDb()
    .select({
      code: readings.metricCode,
      at: readings.observedAt,
      file: uploads.fileName,
      upload: uploads.id,
    })
    .from(readings)
    .leftJoin(uploads, eq(uploads.id, readings.uploadId))
    .where(
      and(
        eq(readings.userId, userId),
        inArray(readings.metricCode, codes),
        isNull(readings.source),
      ),
    );
  const out = new Map<string, FileOf>();
  for (const r of rows) {
    const k = `${r.code}|${String(r.at).slice(0, 10)}`;
    if (r.file || !out.has(k))
      out.set(k, { file: r.file ?? null, upload: r.file ? String(r.upload) : null });
  }
  return out;
}

function caseOf(
  h: Hunch,
  ctx: HunchCtx,
  files: Map<string, FileOf>,
): HunchCase {
  const s = h.signal as unknown as Signal;
  const c = primaryOf(s);
  const name = (x: string) => ctx.byCode.get(x)?.name ?? x;
  const unit = (x: string) => {
    const u = ctx.byCode.get(x)?.unit;
    return u ? ` ${u}` : "";
  };
  const row = rowOf(h, ctx);
  const expl = h.explanations ?? [];
  const band = row.mini.band;
  const unknowns = [
    band?.provisional
      ? `${name(c)}'s own range rests on 4 earlier draws, so it is provisional.`
      : null,
    !band && s.kind !== "gap"
      ? `${name(c)} has fewer than 4 earlier draws, so there is no range of your own yet.`
      : null,
    s.kind === "step" || s.kind === "cluster" || s.kind === "drift"
      ? "The rule says the level moved. It does not say why."
      : null,
    expl.length
      ? "The shares come from the engine where it scores a cause and an even split elsewhere. They are not a diagnosis."
      : null,
    expl.some((e) => e.grade === "E")
      ? "Explanations marked unproven are not in the knowledge graph."
      : null,
    h.test?.estimated
      ? "The price is an estimate: no lab price is on file for your country."
      : null,
  ].filter((x): x is string => x != null);
  return {
    ...row,
    say: wordsOf(s, name, unit).say,
    ...corridorOf(c, ctx, files),
    explanations: expl,
    question: h.question,
    answer: h.answer,
    test: h.test,
    predictions: h.predictions,
    writtenAt: h.writtenAt?.toISOString().slice(0, 10) ?? null,
    outcome: h.outcome,
    outcomeLine: h.outcomeLine,
    rule: s.rule ?? [],
    unknowns,
    firedAt: s.firedAt ?? [],
    markers:
      s.kind === "cluster"
        ? s.codes.map((code) => ({
            code,
            name: name(code),
            unit: ctx.byCode.get(code)?.unit ?? null,
            last: lastOf(ctx, code)?.value ?? null,
            band: bandOf(ctx.points.get(code) ?? [], { code }) ?? null,
            ...corridorOf(code, ctx, files),
          }))
        : [],
  };
}

/**
 * Every hunch the person has, split three ways. The first call for a person
 * with no rows runs `refreshHunches`; after that the upload path and the
 * daily pass (`runCurator`) keep them fresh.
 */
// ponytail: "no rows" stands in for "never refreshed", so a person with no
// signal pays one refresh per call; add a refreshed-at column if that shows.
export async function hunchesBody(userId: string): Promise<HunchesBody> {
  let hs = await hunchRows(userId);
  if (!hs.length) {
    await refreshHunches(userId);
    hs = await hunchRows(userId);
  }
  const ctx = await hunchCtx(userId);
  const rows = byStory(hs).map((h) => ({ h, row: rowOf(h, ctx) }));
  return {
    open: rows
      .filter((r) => r.h.state !== "closed" && r.h.kind !== "good_news")
      .map((r) => r.row),
    goodNews: rows
      .filter((r) => r.h.state !== "closed" && r.h.kind === "good_news")
      .map((r) => r.row),
    closed: rows.filter((r) => r.h.state === "closed").map((r) => r.row),
  };
}

export async function hunchBody(
  userId: string,
  id: string,
): Promise<HunchCase | null> {
  const h = await hunchOf(userId, id);
  if (!h) return null;
  const [ctx, files] = await Promise.all([
    hunchCtx(userId),
    filesOf(userId, h.codes),
  ]);
  return caseOf(h, ctx, files);
}

/**
 * The Heading word per system. Pure. A system with no lab draw inside 24
 * months of the last one is `unmeasured`; a live adverse hunch or a goal
 * marker moving away makes it `away`; good news or a goal moving toward
 * makes it `toward`; everything else is `holding`.
 */
export function headingOf(input: {
  systemOf: Map<string, string>;
  lastDraw: string | null;
  points: Map<string, { date: string }[]>;
  hunches: { kind: string; codes: string[]; system: string | null; line: string }[];
  goals: {
    code: string;
    name: string;
    value: number | null;
    target: { low: number | null; high: number | null };
    recentSlope: { perYear: number } | null;
  }[];
}): HeadingRow[] {
  const cutoff = input.lastDraw
    ? new Date(
        new Date(`${input.lastDraw}T00:00:00Z`).getTime() - 2 * 365.25 * 86_400_000,
      )
        .toISOString()
        .slice(0, 10)
    : null;
  const inSystem = (id: string, code: string) => input.systemOf.get(code) === id;
  const touches = (id: string, h: (typeof input.hunches)[number]) =>
    h.system === id || h.codes.some((c) => inSystem(id, c));
  const wayOf = (g: (typeof input.goals)[number]) => {
    const s = g.recentSlope?.perYear;
    if (!s || g.value == null) return null;
    const { low, high } = g.target;
    if (high != null && g.value > high) return s < 0 ? "toward" : "away";
    if (low != null && g.value < low) return s > 0 ? "toward" : "away";
    return null;
  };
  return SYSTEMS.map(({ id, name }) => {
    const measured =
      cutoff != null &&
      [...input.points].some(
        ([code, pts]) =>
          inSystem(id, code) && pts.some((p) => p.date >= cutoff),
      );
    if (!measured)
      return { id, name, word: "unmeasured" as const, why: "No lab draw in the last two years." };
    const bad = input.hunches.find(
      (h) => h.kind !== "good_news" && h.kind !== "gap" && touches(id, h),
    );
    if (bad) return { id, name, word: "away" as const, why: bad.line };
    const goals = input.goals.filter((g) => inSystem(id, g.code));
    const away = goals.find((g) => wayOf(g) === "away");
    if (away)
      return { id, name, word: "away" as const, why: `${away.name} is moving away from your goal.` };
    const good = input.hunches.find(
      (h) => h.kind === "good_news" && touches(id, h),
    );
    if (good) return { id, name, word: "toward" as const, why: good.line };
    const toward = goals.find((g) => wayOf(g) === "toward");
    if (toward)
      return { id, name, word: "toward" as const, why: `${toward.name} is moving toward your goal.` };
    return { id, name, word: "holding" as const, why: "Nothing moved on your own draws." };
  });
}

/** Worth a look reads cluster, then drift, then the rest: the strongest story first. */
const STORY = ["cluster", "drift", "step", "left_band", "discordance", "gap"];
function byStory(hs: Hunch[]): Hunch[] {
  const at = (k: string) => STORY.indexOf(k) + 1 || STORY.length + 1;
  return [...hs].sort((a, b) => at(a.kind) - at(b.kind));
}

/** Today's hunch shelf, Heading and confidence line. */
async function todayHunches(
  userId: string,
  rows: MetricRow[],
  goals: TodayGoal[],
  day: string,
): Promise<Pick<TodayBody, "hunches" | "heading" | "confidence">> {
  const [hs, ctx, graph] = await Promise.all([
    hunchRows(userId),
    hunchCtx(userId, rows),
    loadGraph(),
  ]);
  const live = hs.filter((h) => h.state !== "closed");
  const withRow = byStory(live).map((h) => ({ h, row: rowOf(h, ctx) }));
  const adverse = withRow.filter((x) => x.h.kind !== "good_news");
  const shelf = [
    ...adverse,
    ...withRow.filter((x) => x.h.kind === "good_news" && !x.h.seenAt),
  ]
    .slice(0, 5)
    .map((x) => x.row);
  const systemOf = new Map(
    graph.nodes
      .filter((n) => n.kind === "metric" && n.system)
      .flatMap((n) => (n.codes ?? []).map((c) => [c, n.system!] as const)),
  );
  const lastDraw =
    [...ctx.points.values()]
      .map((p) => p[p.length - 1]?.date ?? "")
      .reduce((a, b) => (b > a ? b : a), "") || null;
  const heading = headingOf({
    systemOf,
    lastDraw,
    points: ctx.points,
    hunches: withRow.map((x) => ({
      kind: x.h.kind,
      codes: x.h.codes,
      system: x.h.system,
      line: x.row.line,
    })),
    goals,
  });
  return {
    hunches: shelf,
    heading,
    confidence: {
      lastDraw,
      days: lastDraw
        ? Math.round(
            (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${lastDraw}T00:00:00Z`)) /
              86_400_000,
          )
        : null,
      measured: heading.filter((x) => x.word !== "unmeasured").length,
      total: heading.length,
      open: adverse.length,
    },
  };
}
