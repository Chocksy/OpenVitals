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
  const head = spear
    ? cut > 0
      ? spear.title.slice(0, cut + 1)
      : spear.title
    : "All quiet";
  const tail = spear && cut > 0 ? spear.title.slice(cut + 2) : "";

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

  return {
    sentence: { head, tail, tone: cards[0]?.tone ?? "none" },
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
