import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getMetricRows } from "@/lib/data";
import { getGoalFor } from "@/lib/daily-data";
import { goalGap, inGoal } from "@/lib/daily";
import { formatRange, statusOf, type Status } from "@/lib/status";
import { projectionsFor } from "@/lib/projections";
import { projectionLine } from "@/lib/projection";
import { dayLabel, fmtCategory, plural } from "@/lib/utils";

/** "vital_sign" -> "Vital sign": a system is a name, so it starts with one. */
const systemName = (c: string) => {
  const t = fmtCategory(c);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
import { HistoryChart } from "@/components/history-chart";
import { Ruler, digits } from "@/components/ruler";
import { GoalForm, OptimalForm } from "@/components/tracker";
import { StateWord, type StateTone } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

/**
 * One marker: `docs/mockups/v4/marker.html`.
 *
 * The header says the state in a word, the ruler puts the number against its
 * own bands with the draw before it and the target it is aimed at, the
 * history chart draws every draw at its own date, the two forms set the
 * optimal band and the goal, and the table is every reading on file. Phase
 * 30c: the ruler and the chart are the shared components, so this page, the
 * drawer on `/blood?tab=markers`, Key trends and the conclusion cards cannot
 * drift apart. It absorbs `/m/[code]`, which is now a redirect.
 */
const TONE: Record<Status, StateTone> = {
  red: "off",
  amber: "border",
  green: "on",
  gray: "none",
};

const WORD: Record<Status, string> = {
  red: "off",
  amber: "borderline",
  green: "optimal",
  gray: "no band to judge it by",
};

/** A phone signal has hundreds of rows; the table shows the last quarter. */
const PHONE_ROWS = 90;

export default async function MarkerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const userId = await requireUserId();
  const [rows, goal, made] = await Promise.all([
    getMetricRows(userId),
    getGoalFor(userId, code),
    projectionsFor(userId, code),
  ]);
  // The newest projection is the one drawn; an unresolved one takes priority
  // over a resolved one, because that is the one still being judged.
  const projection = made.find((p) => !p.resolvedAt) ?? made[0] ?? null;
  const metric = rows.find((m) => m.code === code);
  if (!metric) notFound();

  // A marker whose latest reading came from a device is a daily series: it
  // gets a line, not one diamond per draw, and the table shows 90 days.
  const phone = metric.rows.some((r) => r.source != null);
  const tableRows = [...metric.rows].reverse().slice(0, phone ? PHONE_ROWS : undefined);

  const values = metric.rows.filter((r) => r.value != null);
  const before = values[values.length - 2];
  const status = metric.status;
  const target = goal?.targetHigh ?? goal?.targetLow ?? null;
  const unit = metric.latest.unit ?? metric.unit;
  const delta =
    metric.latest.value != null && before?.value != null
      ? Math.round((metric.latest.value - before.value) * 100) / 100
      : null;

  return (
    <div className="stackv gap-[var(--s21)]">
      <div>
        <Link className="asklink" href="/blood?tab=markers">
          <ChevronLeft className="ic" aria-hidden="true" />
          Markers
        </Link>
        <div className="rowh mt-[var(--s8)]">
          <h1 className="c-title">{metric.name}</h1>
          <StateWord tone={TONE[status]} dot tri={status === "red"}>
            {WORD[status]}
          </StateWord>
          <span className="src">
            · {systemName(metric.category)} · {phone ? "phone" : "lab"}
            {metric.derived ? " · derived, not stored" : ""}
          </span>
        </div>
      </div>

      <div className="panel hi">
        <div className="panel-head">
          <h3>
            The latest reading{" "}
            <span className="src">· {dayLabel(metric.latest.observedAt, true)}</span>
          </h3>
          <span className="r">
            {plural(metric.points.length, phone ? "reading" : "draw")} on file
          </span>
        </div>
        <div className="kpi">
          <div>
            <b>
              {metric.latest.value != null
                ? digits(metric.latest.value)
                : (metric.latest.valueText ?? "—")}
            </b>
            <span>
              {unit ? `${unit} · ` : ""}
              {dayLabel(metric.latest.observedAt, true)}
            </span>
          </div>
          {delta != null && (
            <div>
              <b>
                {delta > 0 ? "+" : ""}
                {digits(delta)}
              </b>
              <span>
                since {before?.observedAt ? dayLabel(before.observedAt, true) : "the draw before"}
              </span>
            </div>
          )}
          {goal && (
            <div>
              <b>{target != null ? digits(target) : "—"}</b>
              <span>
                target{goal.due ? ` by ${dayLabel(goal.due, true)}` : ""}
                {metric.latest.value != null && target != null
                  ? inGoal(metric.latest.value, goal.targetLow, goal.targetHigh)
                    ? " · reached"
                    : ` · ${digits(Math.round(goalGap(metric.latest.value, goal.targetLow, goal.targetHigh) * 100) / 100)} to go`
                  : ""}
              </span>
            </div>
          )}
        </div>

        <Ruler
          value={metric.latest.value}
          prev={before?.value ?? null}
          prevDate={before?.observedAt ?? null}
          refLow={metric.latest.refLow}
          refHigh={metric.latest.refHigh}
          optimalLow={metric.optimalLow}
          optimalHigh={metric.optimalHigh}
          target={target}
          targetLow={goal?.targetLow ?? null}
          targetHigh={goal?.targetHigh ?? null}
          targetDate={goal?.due ?? null}
          unit={unit}
          say={
            <>
              Normal is what the lab prints; optimal is{" "}
              {metric.optimalSource ?? "the catalog"}
              {metric.optimalBasis ? ` · ${metric.optimalBasis}` : ""}.
              {metric.optimalRationale ? ` ${metric.optimalRationale}` : ""}
            </>
          }
        />
      </div>

      <HistoryChart
        title={`${metric.name} — every ${phone ? "reading" : "draw"}, and where the plan is aimed`}
        unit={unit}
        points={metric.points}
        refLow={metric.latest.refLow}
        refHigh={metric.latest.refHigh}
        optimalLow={metric.optimalLow}
        optimalHigh={metric.optimalHigh}
        target={target}
        targetLow={goal?.targetLow ?? null}
        targetHigh={goal?.targetHigh ?? null}
        targetDate={goal?.due ?? null}
        noun={phone ? "readings" : "draws"}
      />

      {projection && (
        <div className="panel">
          <div className="panel-head">
            <h3>The last projection</h3>
            {projection.verdict && (
              <StateWord
                tone={
                  projection.verdict === "better"
                    ? "on"
                    : projection.verdict === "worse"
                      ? "off"
                      : "none"
                }
              >
                {projection.verdict === "as_expected"
                  ? "as expected"
                  : projection.verdict}
              </StateWord>
            )}
          </div>
          <p className="t-body">
            {projectionLine({ ...projection, unit: unit ?? "" })}
            {projection.resolvedValue != null &&
              ` · measured ${digits(projection.resolvedValue)} on ${projection.resolvedAt}`}
          </p>
          {projection.assumptions.map((a) => (
            <p className="cap" key={a}>
              {a}
            </p>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>The bands, and the goal</h3>
          <span className="r">
            normal {formatRange(metric.latest.refLow, metric.latest.refHigh)}
          </span>
        </div>
        <div className="stackv">
          <div className="rowh">
            <p className="t-body m-0">
              Optimal {formatRange(metric.optimalLow, metric.optimalHigh, unit)}
              {metric.optimalSource ? ` · ${metric.optimalSource}` : ""}
              {metric.optimalBasis ? ` · ${metric.optimalBasis}` : ""}
            </p>
            <OptimalForm
              metricCode={metric.code}
              low={metric.optimalLow}
              high={metric.optimalHigh}
              unit={unit}
              mine={metric.optimalSource === "user"}
            />
          </div>
          <div className="rowh">
            <p className="t-body m-0">
              {goal
                ? `Goal ${formatRange(goal.targetLow, goal.targetHigh, unit)}${goal.due ? ` by ${dayLabel(goal.due, true)}` : ""}${goal.note ? ` · ${goal.note}` : ""}`
                : "No goal set for this marker."}
            </p>
            <GoalForm
              metricCode={metric.code}
              targetLow={goal?.targetLow ?? metric.optimalLow}
              targetHigh={goal?.targetHigh ?? metric.optimalHigh}
              due={goal?.due ?? null}
              note={goal?.note ?? null}
              exists={Boolean(goal)}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Every reading</h3>
          <span className="r">
            {tableRows.length} of {metric.rows.length}
          </span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Drawn</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Reference</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => {
                const s = statusOf({
                  value: r.value,
                  refLow: r.refLow,
                  refHigh: r.refHigh,
                  optimalLow: metric.optimalLow,
                  optimalHigh: metric.optimalHigh,
                });
                return (
                  <tr key={`${r.observedAt}-${i}`}>
                    <td className="n">{dayLabel(r.observedAt, true)}</td>
                    <td className="n">
                      {r.value != null ? digits(r.value) : (r.valueText ?? "—")}
                    </td>
                    <td className="n">{r.unit ?? ""}</td>
                    <td className="n">{formatRange(r.refLow, r.refHigh)}</td>
                    <td>
                      <StateWord tone={TONE[s]} dot>
                        {WORD[s]}
                      </StateWord>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
