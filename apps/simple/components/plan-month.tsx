/**
 * This month: the grid, the week, the rules, the supplements and what is
 * coming.
 *
 * Phase 32a section 2, `docs/mockups/v4/plan-month.html` sections 01, 03, 04
 * and 05. One cell a day, today outlined, and the dots are what the day asks
 * for — never what was done. What was done is the 30-cell strip under it, the
 * same `strip30` `getProtocol` has always returned; there is no second store.
 *
 * A dot only appears when the data says the day asks for it. There is no draw
 * dot in a month with no planned draw, and the mockup says so out loud, so
 * this prints the absence instead of drawing a mark for it.
 *
 * Every one of these is a server component: markup over numbers the page
 * already fetched, plus `occurrences()`, which is pure.
 */
import Link from "next/link";
import { lastDays } from "@/lib/daily";
import { occurrences, slotBucket } from "@/lib/plan-line";
import { formatRange } from "@/lib/status";
import { cn, dayLabel, plural } from "@/lib/utils";
import type { GoalView } from "@/lib/daily-data";
import { Ruler } from "./ruler";
import { StateWord } from "./ui-kit";
import { doseOf, hasDose, toOccurrenceItem, type PlanItem } from "./plan-day";

/** The five marks the key names, plus the honest sixth. */
export type Dot = "train" | "supp" | "food" | "draw" | "check" | "";

const TRAINING =
  /\b(train|training|resistance|strength|session|workout|exercise|gym|lift|cardio|run|running|walk|walking|steps|swim|swimming|yoga|cycle|cycling)\b/i;
const FOOD =
  /\b(eat|eating|food|meal|meals|diet|sugar|starch|carb|carbs|protein|fibre|fiber|sardine|sardines|fish|vegetable|vegetables|breakfast|lunch|dinner|alcohol|coffee|caffeine|fast|fasting|water|salt)\b/i;

/**
 * Which dot one item earns.
 *
 * A dose is a supplement, whatever the words around it say. Otherwise the
 * item's own words decide between a session and a food rule, and an item that
 * is neither gets the plain dot rather than being filed under a heading it
 * does not belong to.
 */
export function dotOf(it: PlanItem): Dot {
  if (hasDose(it)) return "supp";
  if (TRAINING.test(it.text)) return "train";
  if (FOOD.test(it.text)) return "food";
  return "";
}

/** `YYYY-MM-DD` for day `n` of a month. */
const dayOf = (year: number, month: number, n: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(n).padStart(2, "0")}`;

/** Monday-first column of a local day, 0..6. */
function column(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 ? 6 : wd - 1;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KEY: [Dot, string][] = [
  ["train", "training session"],
  ["supp", "supplement due"],
  ["food", "food rule"],
  ["draw", "blood draw"],
  ["check", "check-in due"],
];

/** Monday of the week `day` falls in. */
function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const at = new Date(y, m - 1, d - column(day));
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

/** The days one item was ticked, out of the 30 the strip covers. */
function doneDays(it: PlanItem, today: string): Set<string> {
  const window = lastDays(it.strip30.length, today);
  const out = new Set<string>();
  it.strip30.forEach((v, i) => {
    if (v === 1 && window[i]) out.add(window[i]!);
  });
  return out;
}

export function PlanMonth({
  today,
  items,
  goals,
  checkDays,
  nameOf,
}: {
  /** the local `YYYY-MM-DD` the page is on */
  today: string;
  items: PlanItem[];
  goals: GoalView[];
  /** the days a check-in is due, from the open check-in rows */
  checkDays: string[];
  nameOf: (code: string) => string;
}) {
  const [year, month] = today.split("-").map(Number) as [number, number];
  const days = new Date(year, month, 0).getDate();
  const from = dayOf(year, month, 1);
  const to = dayOf(year, month, days);
  const active = items.filter((it) => it.active);

  /** every (item, day) the columns imply this month — nothing materialised */
  const byDay = new Map<string, Set<Dot>>();
  const add = (day: string, dot: Dot) => {
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day)!.add(dot);
  };
  const byId = new Map(active.map((it) => [it.id, it]));
  for (const occ of occurrences(active.map(toOccurrenceItem), from, to)) {
    const it = byId.get(occ.itemId);
    if (it) add(occ.day, dotOf(it));
  }

  /**
   * The draw dot. There is no planned-draw table: a retest is a goal with a
   * due date, which is the only day this app can honestly say a draw is
   * planned for. A month with none gets none, and the caption says so.
   */
  const drawDays = goals
    .filter((g) => g.due && g.due >= from && g.due <= to && !g.reached)
    .map((g) => g.due!);
  for (const day of drawDays) add(day, "draw");
  for (const day of checkDays) if (day >= from && day <= to) add(day, "check");

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  /** the strip with the most days on it: the one worth printing whole */
  const strip = [...active].sort(
    (a, b) =>
      b.strip30.filter((v) => v === 1).length -
      a.strip30.filter((v) => v === 1).length,
  )[0];
  const stripDone = strip?.strip30.filter((v) => v === 1).length ?? 0;

  return (
    <section id="month" className="space-y-6 scroll-mt-24">
      <div className="panel">
        <div className="panel-head">
          <h3>{monthName}</h3>
          <span className="r">
            today is {dayLabel(today, true)}
            {drawDays[0] ? ` · next draw ${dayLabel(drawDays[0], true)}` : ""}
          </span>
        </div>

        <div className="month">
          {DOW.map((d) => (
            <div key={d} className="dow">
              {d}
            </div>
          ))}
          {Array.from({ length: column(from) }, (_, i) => (
            <div key={`pad-${i}`} className="d pad" />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = dayOf(year, month, i + 1);
            const dots = [...(byDay.get(day) ?? [])];
            return (
              <div
                key={day}
                className={cn(
                  "d",
                  day < today && "past",
                  day === today && "today",
                )}
              >
                <span className="dn">{i + 1}</span>
                <span className="dots">
                  {dots.map((dot) => (
                    <i key={dot || "other"} className={dot || undefined} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>

        <div className="monthkey">
          {KEY.map(([dot, label]) => (
            <span key={dot}>
              <i className={dot} /> {label}
            </span>
          ))}
        </div>

        <p className="cap">
          The dots are what the day asks for, not what you did.
          {drawDays.length === 0
            ? " There is no draw dot this month: no goal in this month has a date on it, and the strip will not draw a mark for a draw nobody planned."
            : ""}
        </p>

        {strip && (
          <>
            <div className="sub">
              <h3>What you actually did</h3>
              <span>
                {strip.text} · {stripDone} of the last 30 days · today outlined
              </span>
            </div>
            <div className="strip30" aria-hidden="true">
              {strip.strip30.map((v, i) => (
                <s
                  key={i}
                  className={cn(
                    v === 1 && "on",
                    i === strip.strip30.length - 1 && "today",
                  )}
                />
              ))}
            </div>
            <p className="cap">
              Ticking a row in Today writes the same day-and-item tick this
              strip reads.
            </p>
          </>
        )}
      </div>

      <ThisWeek today={today} items={active} checkDays={checkDays} />
      <Supplements items={active} goals={goals} nameOf={nameOf} />
      <ComingUp today={today} goals={goals} />
    </section>
  );
}

/**
 * This week and every day, side by side.
 *
 * A row with a weekday set has a count this week; a rule with neither a
 * weekday nor a dose has no count and no date, only the 30 days behind it.
 */
export function ThisWeek({
  today,
  items,
  checkDays,
}: {
  today: string;
  items: PlanItem[];
  checkDays: string[];
}) {
  const start = weekStart(today);
  const week = weekDays(start);
  const scheduled = items.filter((it) => it.daysOfWeek != null);
  const rules = items.filter((it) => it.daysOfWeek == null && !hasDose(it));
  const due = checkDays.filter((d) => d >= start && d <= week[6]!);

  return (
    <div className="grid2">
      <div className="panel">
        <div className="panel-head">
          <h3>This week</h3>
          <span className="r">
            {dayLabel(start)} – {dayLabel(week[6]!)}
          </span>
        </div>
        {scheduled.length === 0 && due.length === 0 ? (
          <p className="cap">
            Nothing you have adopted names a set of weekdays, so this week asks
            for the same thing every day.
          </p>
        ) : (
          <div className="rowlist">
            {scheduled.map((it) => {
              const done = doneDays(it, today);
              const planned = occurrences(
                [toOccurrenceItem(it)],
                start,
                week[6]!,
              ).map((o) => o.day);
              const hit = planned.filter((d) => done.has(d)).length;
              return (
                <div key={it.id} className="protorow">
                  <div>
                    <b>{it.text}</b>
                    <div className="psub">
                      {planned.map((d) => dayLabel(d)).join(" · ") ||
                        "no day this week"}
                    </div>
                  </div>
                  <span className="pct">
                    {hit} / {planned.length}
                  </span>
                  <div
                    className="strip30"
                    style={{ gridColumn: "1 / -1" }}
                    aria-hidden="true"
                  >
                    {week.map((d) => (
                      <s
                        key={d}
                        className={cn(
                          done.has(d) && "on",
                          d === today && "today",
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {due.map((d) => (
              <div key={d} className="protorow">
                <div>
                  <b>Check-in</b>
                  <div className="psub">due {dayLabel(d, true)}</div>
                </div>
                <span className="pct">{dayLabel(d)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Every day</h3>
          <span className="r">
            {plural(rules.length, "rule")} · no dose, no date
          </span>
        </div>
        {rules.length === 0 ? (
          <p className="cap">
            Nothing on your protocol is a plain daily rule: every item carries
            either a dose or a set of days.
          </p>
        ) : (
          <div className="rowlist">
            {rules.map((it) => (
              <div key={it.id} className="protorow">
                <div>
                  <b>{it.text}</b>
                  <div className="psub">
                    {it.why ??
                      (it.startedAt
                        ? `since ${dayLabel(it.startedAt, true)}`
                        : "no marker named yet")}
                  </div>
                </div>
                <span className="pct">{it.adherence30} %</span>
                <div className="strip30" aria-hidden="true">
                  {it.strip30.map((v, i) => (
                    <s
                      key={i}
                      className={cn(
                        v === 1 && "on",
                        i === it.strip30.length - 1 && "today",
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The seven days of a week, from its Monday. */
function weekDays(start: string): string[] {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  return Array.from({ length: 7 }, (_, i) => {
    const at = new Date(y, m - 1, d + i);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  });
}

/**
 * The supplements, as a schedule.
 *
 * Six columns and no prose: what, how much, when, with what, until when, and
 * what it is aimed at. "Until" is the column that stops a supplement from
 * running forever, so a row without one says "no stop date" rather than
 * leaving the cell blank.
 */
export function Supplements({
  items,
  goals,
  nameOf,
}: {
  items: PlanItem[];
  goals: GoalView[];
  nameOf: (code: string) => string;
}) {
  const rows = items.filter(hasDose);
  if (rows.length === 0) return null;

  const aimOf = (it: PlanItem) => {
    const goal = goals.find((g) => it.metricCodes.includes(g.metricCode));
    if (goal)
      return `${goal.metricName} ${goal.current ?? "—"} → ${formatRange(
        goal.targetLow,
        goal.targetHigh,
        goal.unit,
      )}`;
    if (it.metricCodes.length) return it.metricCodes.map(nameOf).join(", ");
    return null;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Supplements</h3>
        <span className="r">{plural(rows.length, "row")} · M N E B</span>
      </div>
      <div className="tblwrap">
        <table className="tbl sched">
          <thead>
            <tr>
              <th>What</th>
              <th>Dose</th>
              <th>When</th>
              <th>With what</th>
              <th>Until</th>
              <th>Aimed at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const bucket = slotBucket(it.timeOfDay);
              const aim = aimOf(it);
              return (
                <tr key={it.id}>
                  <td className="k">{it.text}</td>
                  <td className="n">{doseOf(it)}</td>
                  <td className="when">
                    <span className="slots">
                      {(["M", "N", "E", "B"] as const).map((s) => (
                        <i key={s} className={bucket === s ? "on" : undefined}>
                          {s}
                        </i>
                      ))}
                    </span>
                  </td>
                  <td>{it.withWhat ?? "not said"}</td>
                  <td className="until">
                    {it.endsAt ? dayLabel(it.endsAt, true) : "no stop date"}
                  </td>
                  <td>
                    {aim ?? (
                      <StateWord tone="none">
                        nothing measured · {it.adherence30} %
                      </StateWord>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cap">
        M is morning, N is midday, E is evening, B is bedtime, from the slot the
        line was written in. A row with no slot has none of the four filled,
        because nothing said when to take it.
      </p>
    </div>
  );
}

/**
 * Coming up: the things with a date on them.
 *
 * Every date here is a goal's own due date. There is no planned-draw row in
 * the database, so a draw is the soonest dated goal and nothing else pretends
 * to be one.
 */
export function ComingUp({
  today,
  goals,
}: {
  today: string;
  goals: GoalView[];
}) {
  const dated = goals
    .filter((g) => g.due != null && !g.reached)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1));
  if (dated.length === 0) return null;

  const drawn = dated.find(
    (g) => g.current != null && (g.targetLow != null || g.targetHigh != null),
  );

  return (
    <div className="grid2">
      <div className="panel">
        <div className="panel-head">
          <h3>Coming up</h3>
          <span className="r">{plural(dated.length, "thing with a date")}</span>
        </div>
        <div className="rowlist">
          {dated.map((g) => {
            const overdue = g.due! < today;
            return (
              <div key={g.id} className="markerrow said">
                <div className="nm">
                  <b>
                    <Link href={`/blood/m/${g.metricCode}`}>
                      {g.metricName}
                    </Link>{" "}
                    {formatRange(g.targetLow, g.targetHigh, g.unit)}
                  </b>
                  <span>
                    due {dayLabel(g.due!, true)}
                    {g.current != null ? ` · ${g.current} today` : ""}
                    {g.currentAt
                      ? ` · read ${dayLabel(g.currentAt, true)}`
                      : ""}
                  </span>
                </div>
                <div />
                <div className="wd">
                  <StateWord tone={overdue ? "off" : "border"}>
                    {overdue
                      ? "overdue"
                      : g.current == null
                        ? "no reading yet"
                        : "planned"}
                  </StateWord>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {drawn && (
        <div className="panel">
          <div className="panel-head">
            <h3>{drawn.metricName}, against its goal</h3>
            <span className="r">
              {drawn.unit ?? ""} · target{" "}
              {formatRange(drawn.targetLow, drawn.targetHigh, drawn.unit)} by{" "}
              {dayLabel(drawn.due!, true)}
            </span>
          </div>
          <Ruler
            value={drawn.current}
            valueDate={drawn.currentAt}
            targetLow={drawn.targetLow}
            targetHigh={drawn.targetHigh}
            targetDate={drawn.due}
            unit={drawn.unit}
          />
        </div>
      )}
    </div>
  );
}
