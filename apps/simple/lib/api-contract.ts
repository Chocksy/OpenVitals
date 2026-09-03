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
import { localDay } from "@/lib/daily";
import { getGoals, getProtocol } from "@/lib/daily-data";
import { occurrences } from "@/lib/plan-line";
import { getMetricRows } from "@/lib/data";
import {
  buildToday,
  railCards,
  systemTiles,
  type RailTone,
} from "@/lib/home-data";
import { actionsForAll } from "@/lib/actions";
import { buildLedger } from "@/lib/ledger";
import { explainKey } from "@/lib/explain";
import { latestReport } from "@/lib/report";
import { genomeVerdicts, loadGenome, movedIds } from "@/lib/genome";
import { genomeVerdict } from "@/lib/genome-catalog";
import { orderVerdicts } from "@/lib/genome-view";

/* ── GET /api/today ───────────────────────────────────────────────────── */

export interface TodayBody {
  sentence: { head: string; tail: string; tone: RailTone };
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
  plan: { headline: string; todo: number };
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
 * The Home page as one JSON body.
 *
 * Every number comes off the same three functions the page calls —
 * `buildLedger`, `railCards`, `systemTiles` — so the phone and the web can
 * never print different counters for the same day.
 */
export async function todayBody(userId: string): Promise<TodayBody> {
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
  const head = spear
    ? cut > 0
      ? spear.title.slice(0, cut + 1)
      : spear.title
    : "All quiet";
  const tail = spear && cut > 0 ? spear.title.slice(cut + 2) : "";

  const body = cardOf("body");
  const plan = cardOf("plan");
  const total = counters.off + counters.normal + counters.optimal;

  return {
    sentence: { head, tail, tone: cards[0]?.tone ?? "none" },
    status: {
      off: counters.off,
      borderline: counters.normal,
      optimal: counters.optimal,
      drawDate,
      since: ledger.since ? ledger.since.at.slice(0, 10) : null,
    },
    body: {
      headline: body && body.headline !== "—" ? body.headline : null,
      unit: body?.sub ?? null,
      line: body?.line ?? "",
    },
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
    plan: { headline: plan?.headline ?? "Your plan", todo: todoCount },
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
    synced: { types: view.typesSeen, lastAt: view.syncedAt },
    rows: view.rows.map((r) => {
      const n = Number(r.value.replace(/[  \s,]/g, ""));
      return {
        type: r.key,
        name: r.name,
        identifier: r.identifier,
        source: r.device ?? "",
        value: r.value === "—" || !Number.isFinite(n) ? null : n,
        unit: r.unit,
        display: r.value,
        note: r.note,
        word: r.word,
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
