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
import { and, desc, eq } from "drizzle-orm";
import { getDb, habitLogs, uploads } from "@/db";
import { getBodyDay } from "@/lib/body-data";
import type { Status } from "@/lib/status";
import { goalGap, inGoal, localDay } from "@/lib/daily";
import { getGoals, getProtocol } from "@/lib/daily-data";
import { occurrences } from "@/lib/plan-line";
import {
  getMetricRows,
  sortForBiomarkerList,
  toBiomarkerRow,
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
import { projectionLine } from "@/lib/projection";
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
 */
export async function todayGoals(
  userId: string,
  day: string = localDay(),
): Promise<TodayGoal[]> {
  const [views, protocol, projections] = await Promise.all([
    getGoals(userId),
    getProtocol(userId),
    projectionsFor(userId),
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
  const goals = await todayGoals(userId, day);
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

  return {
    sentence,
    goals,
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
  const [metrics, goals] = await Promise.all([
    getMetricRows(userId),
    getGoals(userId),
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
    time: string | null;
    slot: string | null;
    title: string;
    why: string;
    tag: "protocol" | "goal" | "every day" | "suggested";
    done: boolean;
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

  const due = occurrences(
    active.map((p) => ({
      id: p.id,
      title: p.text,
      timeOfDay: p.timeOfDay,
      daysOfWeek: p.daysOfWeek,
      startedAt: p.startedAt,
      endsAt: p.endsAt,
      active: p.active,
    })),
    day,
    day,
  );

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
      time: o.time,
      slot: o.slot,
      title: item.text,
      why: item.why ?? "",
      tag,
      done: doneIds.has(o.itemId),
      adherence: item.adherence30,
    };
  });

  /**
   * The plan's own actions that were never adopted. A suggestion says out loud
   * that it is one, carries no item id and counts toward nothing — which is
   * the whole reason the tag exists.
   */
  const adopted = active.map((p) => p.text);
  for (const action of report?.body.actions ?? []) {
    if (action.kind === "test") continue;
    if (adopted.some((t) => t.startsWith(action.title))) continue;
    rows.push({
      itemId: null,
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
