/**
 * Facts with a history, and the two kinds of edit that make one.
 *
 * Principle 4 of `ROADMAP.md`: every input is disputable and versioned. A fact
 * can be edited two ways and they mean opposite things:
 *
 *  - **changed**: a new value from a date. The old value was true for its own
 *    period, so its row is closed the day before and kept.
 *  - **corrected**: the old value never held. Its row is marked `corrected`
 *    with a note and the new one takes over its whole period.
 *
 * `profile_facts` stays the current view; `profile_fact_history` is the
 * timeline behind it, and `factAt` reads the value that held on a day. The
 * planning half is pure, so both sequences are testable without a database.
 */
import { and, asc, eq } from "drizzle-orm";
import {
  getDb,
  profileFactHistory,
  profileFacts,
  type LifeEvent,
  type ProfileFactHistory,
} from "@/db";
import { localDay } from "./daily";
import { CONFOUNDERS } from "./hypotheses";
import { addDays, revisitAtFor, SKIP_DAYS } from "./revisit";

export type ChangeKind = "initial" | "changed" | "corrected";
export type FactSource = "user" | "document" | "genome" | "system";

/** The cycle answer is about one draw, so its row is dated to that draw. */
export const CYCLE_FACT = "cycle_phase_at_last_draw";

const DAY = 86_400_000;

/** "2026-09-01" minus a day, as a date string. */
export const dayBefore = (date: string): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() - DAY)
    .toISOString()
    .slice(0, 10);

/** What the history rows look like to the planner. */
export interface HistoryRow {
  id: string;
  validFrom: string;
  validTo: string | null;
  changeKind: string;
  value: unknown;
}

export interface Edit {
  kind: ChangeKind;
  /** The day the new value starts holding. Today when it is left out. */
  date?: string;
  note?: string;
}

export interface Plan {
  /** The row the edit closes or crosses out, when there is one. */
  close: {
    id: string;
    validTo?: string | null;
    changeKind?: ChangeKind;
    note?: string | null;
  } | null;
  open: {
    validFrom: string;
    validTo: string | null;
    changeKind: ChangeKind;
    note: string | null;
  };
}

/**
 * The two rows an edit writes. The first fact anybody states is `initial`
 * whatever the button said, because there is nothing to have changed from.
 */
export function planEdit(
  previous: HistoryRow | null,
  edit: Edit,
  today: string,
): Plan {
  const note = edit.note?.trim() || null;
  const from = edit.date ?? today;

  if (!previous)
    return {
      close: null,
      open: { validFrom: from, validTo: null, changeKind: "initial", note },
    };

  if (edit.kind === "corrected")
    return {
      // the old value never held, so its row is crossed out rather than closed
      close: { id: previous.id, changeKind: "corrected", note },
      open: {
        validFrom: previous.validFrom,
        validTo: previous.validTo,
        changeKind: previous.changeKind as ChangeKind,
        note,
      },
    };

  // A change dated on or before the row it follows leaves that row no day at
  // all. It never held, so it is crossed out rather than closed backwards.
  if (dayBefore(from) < previous.validFrom)
    return {
      close: {
        id: previous.id,
        changeKind: "corrected",
        note: note ?? `superseded by a value starting ${from}`,
      },
      open: { validFrom: from, validTo: null, changeKind: "changed", note },
    };

  return {
    close: { id: previous.id, validTo: dayBefore(from) },
    open: { validFrom: from, validTo: null, changeKind: "changed", note },
  };
}

/** The row that held on a day: the latest one that started by then and still stood. */
export function valueAt(rows: HistoryRow[], date: string): HistoryRow | null {
  return (
    rows
      .filter(
        (r) =>
          r.changeKind !== "corrected" &&
          r.validFrom <= date &&
          (r.validTo == null || r.validTo >= date),
      )
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
      .at(-1) ?? null
  );
}

/** "since 2026-03: no; before: yes", the line `/feel` prints under an answer. */
export function historyLine(rows: HistoryRow[]): string | null {
  const live = rows
    .filter((r) => r.changeKind !== "corrected")
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  if (live.length < 2) return null;
  const now = live.at(-1)!;
  const before = live.at(-2)!;
  const text = (v: unknown) =>
    Array.isArray(v) ? v.join(", ") : String(v ?? "");
  return `since ${now.validFrom.slice(0, 7)}: ${text(now.value)}; before: ${text(before.value)}`;
}

/* ── the database half ────────────────────────────────────────────────── */

const toRow = (r: ProfileFactHistory): HistoryRow => ({
  id: r.id,
  validFrom: r.validFrom,
  validTo: r.validTo,
  changeKind: r.changeKind,
  value: r.value,
});

/** Every row this fact ever had, oldest first. */
export async function historyFor(
  userId: string,
  key: string,
): Promise<HistoryRow[]> {
  const rows = await getDb()
    .select()
    .from(profileFactHistory)
    .where(
      and(
        eq(profileFactHistory.userId, userId),
        eq(profileFactHistory.key, key),
      ),
    )
    .orderBy(asc(profileFactHistory.validFrom));
  return rows.map(toRow);
}

/** The whole timeline for one user, oldest first. */
export async function allHistory(
  userId: string,
): Promise<ProfileFactHistory[]> {
  return getDb()
    .select()
    .from(profileFactHistory)
    .where(eq(profileFactHistory.userId, userId))
    .orderBy(asc(profileFactHistory.validFrom));
}

/** The value this fact held on a date, or null if it held none. */
export async function factAt(
  userId: string,
  key: string,
  date: string,
): Promise<unknown> {
  return valueAt(await historyFor(userId, key), date)?.value ?? null;
}

/** Every fact as it stood on a date: the profile the engine had back then. */
export async function profileAt(
  userId: string,
  date: string,
): Promise<Record<string, unknown>> {
  const rows = await allHistory(userId);
  const byKey = new Map<string, HistoryRow[]>();
  for (const r of rows)
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), toRow(r)]);
  const out: Record<string, unknown> = {};
  for (const [key, list] of byKey) {
    const held = valueAt(list, date);
    if (held) out[key] = held.value;
  }
  return out;
}

/**
 * One fact written: the current value in `profile_facts`, and the period it
 * holds for in `profile_fact_history`. Everything that writes a fact goes
 * through here, so nothing can move without leaving a row behind.
 */
export async function writeFact(
  userId: string,
  key: string,
  value: unknown,
  opts: {
    kind?: "changed" | "corrected";
    /** The day the value starts holding. Today by default. */
    date?: string;
    note?: string;
    source?: FactSource;
  } = {},
): Promise<void> {
  const db = getDb();
  const source = opts.source ?? "user";
  const today = localDay();
  const rows = await backfilled(userId, key);
  const previous = rows
    .filter((r) => r.changeKind !== "corrected" && r.validTo == null)
    .at(-1);

  const plan = planEdit(
    previous ?? null,
    { kind: opts.kind ?? "changed", date: opts.date, note: opts.note },
    today,
  );

  if (plan.close)
    await db
      .update(profileFactHistory)
      .set({
        ...(plan.close.validTo !== undefined
          ? { validTo: plan.close.validTo }
          : {}),
        ...(plan.close.changeKind ? { changeKind: plan.close.changeKind } : {}),
        ...(plan.close.note ? { note: plan.close.note } : {}),
      })
      .where(eq(profileFactHistory.id, plan.close.id));

  await db.insert(profileFactHistory).values({
    userId,
    key,
    value,
    validFrom: plan.open.validFrom,
    validTo: plan.open.validTo,
    changeKind: plan.open.changeKind,
    note: plan.open.note,
    source,
  });

  // Phase 20: a new value restarts the cadence from the day it starts holding,
  // and clears the last "still true" — that confirmation was about the old
  // answer and says nothing about this one.
  const revisitAt = revisitAtFor(key, plan.open.validFrom, value);
  await db
    .insert(profileFacts)
    .values({ userId, key, value, source, revisitAt, confirmedAt: null })
    .onConflictDoUpdate({
      target: [profileFacts.userId, profileFacts.key],
      set: {
        value,
        source,
        answeredAt: new Date(),
        revisitAt,
        confirmedAt: null,
      },
    });
}

/**
 * "Still true": the answer did not change, so nothing new is true and no
 * history row is written. What changes is when we ask again, and the fact that
 * somebody looked at it today — which is kept on the open history row so
 * `/history` can draw a tick without a table of its own.
 */
export async function confirmFact(
  userId: string,
  key: string,
  today = localDay(),
): Promise<{ revisitAt: string | null } | null> {
  const db = getDb();
  const [current] = await db
    .select()
    .from(profileFacts)
    .where(and(eq(profileFacts.userId, userId), eq(profileFacts.key, key)));
  if (!current) return null;

  const revisitAt = revisitAtFor(key, today, current.value);
  await db
    .update(profileFacts)
    .set({ confirmedAt: today, revisitAt })
    .where(eq(profileFacts.id, current.id));

  const rows = await backfilled(userId, key);
  const open = rows
    .filter((r) => r.changeKind !== "corrected" && r.validTo == null)
    .at(-1);
  if (open) {
    const [row] = await db
      .select({ confirmations: profileFactHistory.confirmations })
      .from(profileFactHistory)
      .where(eq(profileFactHistory.id, open.id));
    const ticks = new Set([...(row?.confirmations ?? []), today]);
    await db
      .update(profileFactHistory)
      .set({ confirmations: [...ticks].sort() })
      .where(eq(profileFactHistory.id, open.id));
  }
  return { revisitAt };
}

/** "Not now": the same question, a month later, whatever its own cadence says. */
export async function skipFact(
  userId: string,
  key: string,
  today = localDay(),
): Promise<{ revisitAt: string } | null> {
  const revisitAt = addDays(today, SKIP_DAYS);
  const rows = await getDb()
    .update(profileFacts)
    .set({ revisitAt })
    .where(and(eq(profileFacts.userId, userId), eq(profileFacts.key, key)))
    .returning({ id: profileFacts.id });
  return rows.length ? { revisitAt } : null;
}

/**
 * The history of a fact that was answered before this table existed.
 *
 * Phase 15 added the timeline; the values already in `profile_facts` predate
 * it. The first edit of one of them opens its `initial` row from the day it
 * was answered, so "This changed" keeps the old value instead of pretending
 * there never was one.
 */
async function backfilled(userId: string, key: string): Promise<HistoryRow[]> {
  const rows = await historyFor(userId, key);
  if (rows.length) return rows;

  const db = getDb();
  const [current] = await db
    .select()
    .from(profileFacts)
    .where(and(eq(profileFacts.userId, userId), eq(profileFacts.key, key)));
  if (!current) return rows;

  const [seeded] = await db
    .insert(profileFactHistory)
    .values({
      userId,
      key,
      value: current.value,
      validFrom: (current.answeredAt ?? new Date()).toISOString().slice(0, 10),
      changeKind: "initial",
      note: "answered before the timeline existed",
      source: current.source,
    })
    .returning();
  return seeded ? [toRow(seeded)] : rows;
}

/* ── the timeline as draw context ─────────────────────────────────────── */

/**
 * What a life event does to a blood draw taken while it was going on. The
 * kinds are free text, so the words decide; a surgery leaves the same
 * acute-phase response a virus does, which is what `post_viral` describes.
 */
export const EVENT_TAGS: { tag: string; words: RegExp }[] = [
  {
    tag: "pregnancy",
    words: /pregnan|postpartum|post-partum|childbirth|birth of/i,
  },
  {
    tag: "post_viral",
    words:
      /surgery|surgical|operation|resection|ectomy|hospitalis|hospitaliz|post-?viral/i,
  },
  {
    tag: "acute_illness",
    words:
      /infection|illness|flu\b|influenza|covid|fever|pneumonia|sepsis|bronchitis|tonsillitis/i,
  },
  {
    tag: "heavy_training",
    words:
      /marathon|triathlon|ultra|race|training camp|heavy training|weightlifting/i,
  },
];

/** The tags a life event carries, from its kind and its own words. */
export const tagsOfEvent = (event: { kind: string; text: string }): string[] =>
  EVENT_TAGS.filter((t) => t.words.test(`${event.kind} ${event.text}`)).map(
    (t) => t.tag,
  );

const overlaps = (
  event: { startedAt: string | null; endedAt: string | null },
  date: string,
) =>
  !!event.startedAt &&
  event.startedAt <= date &&
  (event.endedAt == null || event.endedAt >= date);

/**
 * Confounder tags per metric code, from the events that were going on when
 * that marker was last drawn. Old draws get their context from the timeline,
 * not from a question nobody remembers the answer to.
 */
export function eventConfounders(
  events: Pick<LifeEvent, "kind" | "text" | "startedAt" | "endedAt">[],
  drawDates: Record<string, string | undefined>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [code, date] of Object.entries(drawDates)) {
    if (!date) continue;
    const tags = new Set<string>();
    for (const event of events) {
      if (!overlaps(event, date)) continue;
      for (const tag of tagsOfEvent(event))
        if (CONFOUNDERS.some((c) => c.tag === tag && c.markers.includes(code)))
          tags.add(tag);
    }
    if (tags.size) out[code] = [...tags];
  }
  return out;
}
