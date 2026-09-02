/**
 * The daily line, drawn by hand.
 *
 * Phase 30b replaces recharts' `DailyCharts` with the system page's own
 * `.daily` element (`docs/mockups/v4/system.css` section 10): one polyline on
 * a real value scale and a real date scale, at most three y ticks in the
 * signal's own unit, the mean as a dashed reference, the blood draws as dated
 * diamonds, and a legend that names every mark. No chart library, and a
 * server component, because none of it holds state.
 */
import { formatDate } from "@/lib/utils";
import { daysBetween, shiftDay } from "@/lib/daily";
import { digits } from "@/lib/body-data";
import type { BodySeries } from "@/lib/body-data";

const VB_W = 1000;
const VB_H = 100;

/** A 0–1 fraction of the plot as the CSS percentage the element reads. */
const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

/** "Jun 4" — the axis has no room for a year it already prints in the head. */
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export function DailyLine({
  series,
  draws,
  days,
  from,
  to,
}: {
  series: BodySeries;
  /** the days a blood draw landed, inside the window */
  draws: string[];
  days: number;
  /** the window, so an empty stretch still takes its own width */
  from: string;
  to: string;
}) {
  const points = series.points;
  const span = Math.max(1, daysBetween(from, to));
  const x = (d: string) => (daysBetween(from, d) / span) * VB_W;
  const xFraction = (d: string) => daysBetween(from, d) / span;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  // The domain is the data plus a twelfth of its own spread, so the highest
  // reading is not welded to the top rule. A flat series gets a window of its
  // own two percent instead of a zero-height box.
  const pad = (hi - lo) / 12 || Math.max(Math.abs(hi) * 0.02, 0.5);
  const top = hi + pad;
  const range = top - (lo - pad);
  /** value → 0 at the top of the box, 100 at the bottom. */
  const y = (v: number) => ((top - v) / range) * VB_H;

  const line = points.map(
    (p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(2)}`,
  );
  const marks = draws.filter((d) => d >= from && d <= to);

  // Three ticks and no more: the top, the mean, the bottom. A fourth would
  // sit on top of one of them at 128 px of plot height.
  const ticks = [hi, mean, lo]
    .map((v) => ({ v, y: (top - v) / range }))
    .filter(
      (t, i, all) =>
        all.findIndex((o) => Math.abs(o.v - t.v) < range / 40) === i,
    );

  return (
    <div className="daily">
      <div className="daily-head">
        <h3>{series.label}</h3>
        <span className="unit">
          {series.unit ? `${series.unit} · ` : ""}
          {days} days · {series.source}
        </span>
      </div>
      <div className="daily-body">
        <div className="daily-y">
          {ticks.map((t) => (
            <span key={t.v} style={{ "--y": pct(t.y) } as React.CSSProperties}>
              {digits(t.v)}
            </span>
          ))}
        </div>
        <div>
          <div className="daily-plot">
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                className="ref"
                points={`0,${y(mean).toFixed(2)} ${VB_W},${y(mean).toFixed(2)}`}
              />
              <polyline className="series" points={line.join(" ")} />
            </svg>
            {marks.map((d) => (
              <div
                key={d}
                className="daily-draw"
                style={{ "--x": pct(xFraction(d)) } as React.CSSProperties}
              >
                <i />
              </div>
            ))}
          </div>
          <div className="daily-x">
            <span
              className="first"
              style={{ "--x": "0%" } as React.CSSProperties}
            >
              {shortDate(from)}
            </span>
            <span style={{ "--x": "50%" } as React.CSSProperties}>
              {shortDate(shiftDay(from, Math.round(span / 2)))}
            </span>
            <span
              className="last"
              style={{ "--x": "100%" } as React.CSSProperties}
            >
              {shortDate(to)}
            </span>
          </div>
        </div>
      </div>
      <div className="hist-legend">
        <span>
          <u className="line" /> one value a day, {points.length} of {days} days
          with a value
        </span>
        <span>
          <u className="dash" /> mean over the window, {digits(mean)}
          {series.unit ? ` ${series.unit}` : ""}
        </span>
        {marks.length > 0 && (
          <span>
            <i /> blood draw — {marks.map((d) => formatDate(d)).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
