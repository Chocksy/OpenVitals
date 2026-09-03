/**
 * Today, in the order the day runs.
 *
 * Phase 32a section 2, `docs/mockups/v4/plan-month.html` section 02. One row
 * per thing the day asks for: the time on the left, the tick, what it is, why
 * it is there, and where it came from.
 *
 * Everything a row prints is stored. The mockup's own "Where the numbers come
 * from" note calls its clock times illustrative — "no protocol item carries a
 * time of day" — so a row here prints a literal `HH:MM` only when the line
 * carried one, and otherwise prints the slot's own word. A slot is not an
 * alarm and this page never invents one.
 *
 * A server component but for the tick and the one Add: both are in
 * `components/plan-tick.tsx`, and the tick posts the same `/api/habits` row
 * the 30-cell strip already reads.
 */
import {
  occurrences,
  SLOT_LABEL,
  SLOTS,
  type OccurrenceItem,
  type Slot,
} from "@/lib/plan-line";
import { plural } from "@/lib/utils";
import { AdoptSuggested, DayRow } from "./plan-tick";

/**
 * One protocol item as every section of the month reads it.
 *
 * The shape `getProtocol` returns, narrowed to the columns these sections
 * print. `doseAmount` is a string because Postgres `numeric` is: the exact
 * amount somebody typed is not a float, and it is printed, never summed.
 */
export interface PlanItem {
  id: string;
  text: string;
  why: string | null;
  metricCodes: string[];
  cadence: string;
  active: boolean;
  startedAt: string | null;
  timeOfDay: string | null;
  daysOfWeek: number[] | null;
  doseAmount: string | null;
  doseUnit: string | null;
  withWhat: string | null;
  endsAt: string | null;
  adherence30: number;
  strip30: number[];
}

/** A marker with a goal on it, as the tag and the schedule table name one. */
export interface GoalRef {
  metricCode: string;
  metricName: string;
}

/** One action the report proposed that nobody has adopted. */
export interface Suggestion {
  title: string;
  why: string;
  /** its place in `reports.body.actions`, which is how it is adopted */
  index: number;
}

/** The columns `occurrences()` reads, off a stored item. */
export const toOccurrenceItem = (it: PlanItem): OccurrenceItem => ({
  id: it.id,
  title: it.text,
  timeOfDay: it.timeOfDay,
  daysOfWeek: it.daysOfWeek,
  startedAt: it.startedAt,
  endsAt: it.endsAt,
  active: it.active,
});

/** True when the item carries an amount worth printing. */
export const hasDose = (it: PlanItem): boolean =>
  it.doseAmount != null && it.doseAmount !== "";

/** "200 µg", or nothing. The unit is the one the line was written in. */
export function doseOf(it: PlanItem): string | null {
  if (!hasDose(it)) return null;
  const amount = String(Number(it.doseAmount));
  return it.doseUnit ? `${amount} ${it.doseUnit}` : amount;
}

/**
 * The tag: where this row came from, said in as few words as are true.
 *
 * The four the spec names, in the order it names them, with one rule about
 * which wins. "protocol · 0 %" is true of a row nobody has ever ticked and it
 * says nothing, so a row like that names the goal it is aimed at instead —
 * which is the reason it is on the list at all. Every other adopted row
 * prints its own adherence, because that number is the point of adopting.
 */
export function tagOf(it: PlanItem | null, goal: GoalRef | undefined): string {
  if (!it) return "suggested";
  if (it.daysOfWeek == null && !hasDose(it)) return "every day";
  const ticked = it.strip30.some((v) => v === 1);
  if (!ticked && goal) return `goal · ${goal.metricName}`;
  return `protocol · ${it.adherence30} %`;
}

const isSlot = (s: string | null): s is Slot =>
  s != null && (SLOTS as readonly string[]).includes(s);

/**
 * What the time column says.
 *
 * A literal clock time when the line carried one. Otherwise the slot's own
 * word, lowercase, because "breakfast" is when the person's breakfast is and
 * printing 08:00 next to it would be an alarm nobody set.
 */
export function atLabel(time: string | null, slot: string | null): string {
  if (time) return time;
  return isSlot(slot) ? SLOT_LABEL[slot].toLowerCase() : "";
}

/**
 * The one line under the title.
 *
 * The item's own `why` when it has one, then what it is taken with, then the
 * markers it is aimed at. Nothing is written here that is not already stored.
 */
export function whyLine(it: PlanItem, names: (code: string) => string): string {
  const parts = [
    it.why?.trim() || "",
    it.withWhat?.trim() || "",
    it.metricCodes.length
      ? `aimed at ${it.metricCodes.map(names).join(", ")}`
      : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function PlanDay({
  day,
  dayName,
  items,
  goals,
  suggested,
  reportId,
  nameOf,
}: {
  /** the local `YYYY-MM-DD` this column is for */
  day: string;
  /** "Thursday Sep 3 2026", written by the page */
  dayName: string;
  items: PlanItem[];
  goals: GoalRef[];
  suggested: Suggestion[];
  /** the report the suggestions came from; without one there are none */
  reportId: string | null;
  nameOf: (code: string) => string;
}) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const rows = occurrences(items.map(toOccurrenceItem), day, day);
  const goalFor = (it: PlanItem) =>
    goals.find((g) => it.metricCodes.includes(g.metricCode));

  const done = rows.filter(
    (r) => byId.get(r.itemId)?.strip30.at(-1) === 1,
  ).length;
  const total = rows.length + (reportId ? suggested.length : 0);

  return (
    <section id="today" className="panel scroll-mt-24">
      <div className="panel-head">
        <h3>Today</h3>
        <span className="r">
          {dayName}
          {total > 0 ? ` · ${done} of ${total} done` : ""}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty">
          <span className="k">Nothing today</span>
          <b className="t-title text-[length:var(--type-md)] font-normal">
            The day asks for nothing
          </b>
          <p>
            Nothing you have adopted falls on today, and the plan has proposed
            nothing you have not already taken. Adopt an action below and it
            appears here the same day.
          </p>
        </div>
      ) : (
        <div className="daycol">
          {rows.map((r) => {
            const it = byId.get(r.itemId);
            if (!it) return null;
            const dose = doseOf(it);
            return (
              <DayRow
                key={r.itemId}
                itemId={it.id}
                day={day}
                done={it.strip30.at(-1) === 1}
                at={atLabel(r.time, r.slot)}
              >
                <span className="what">
                  {it.text}
                  {dose && !it.text.includes(String(Number(it.doseAmount)))
                    ? ` — ${dose}`
                    : ""}
                </span>
                <span className="why">{whyLine(it, nameOf)}</span>
                <span className="tag">{tagOf(it, goalFor(it))}</span>
              </DayRow>
            );
          })}

          {reportId &&
            suggested.map((s) => (
              <DayRow
                key={`s-${s.index}`}
                itemId={null}
                day={day}
                done={false}
                at=""
              >
                <span className="what">{s.title}</span>
                <span className="why">
                  {s.why} The plan proposed it; you have not adopted it, so it
                  counts toward nothing yet.
                </span>
                <span className="tag">
                  suggested
                  <br />
                  <AdoptSuggested reportId={reportId} actionIndex={s.index} />
                </span>
              </DayRow>
            ))}
        </div>
      )}

      {rows.length > 0 && (
        <p className="cap">
          Ticking a row writes the same day-and-item tick the 30-day strip
          reads. There is no second store, and a day with three doses is still
          one tick.
          {suggested.length > 0 && reportId
            ? ` ${plural(suggested.length, "row")} came from the plan and not from you; each one says so.`
            : ""}
        </p>
      )}
    </section>
  );
}
