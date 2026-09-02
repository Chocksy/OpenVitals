"use client";

/**
 * A person's history as a path: three lanes on one time axis.
 *
 *  - **facts**: what they told us and when it changed, with a corrected entry
 *    struck through, because a correction replaces its whole period;
 *  - **actions**: each adopted item as a bar, shaded by how much of it was
 *    actually done;
 *  - **markers**: the draws, with the projection band drawn ahead of the
 *    action that caused it and the verdict where the retest landed.
 *
 * The replay control walks the belief snapshots: everything after the chosen
 * date is dimmed and the beliefs of that day are listed, so the owner can
 * watch a person's conclusions move as facts, actions and draws arrive.
 *
 * One SVG, no chart library, the same way `graph-map.tsx` and the journeys
 * track are drawn.
 */
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { StateWord } from "./ui-kit";
import { cn } from "@/lib/utils";

export interface HistoryFact {
  key: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  changeKind: string;
  source: string;
  note: string | null;
  /** phase 20: the days somebody said "still true" without changing it */
  confirmations?: string[];
}

/** One check-in, as a dot on the facts lane. */
export interface HistoryPost {
  id: string;
  date: string;
  text: string;
  chips: number;
}

export interface HistoryAction {
  id: string;
  text: string;
  from: string;
  active: boolean;
  /** 0..1 over the last 30 days */
  adherence: number;
}

export interface HistoryMarker {
  code: string;
  unit: string | null;
  points: { date: string; value: number }[];
  projections: {
    madeAt: string;
    retestAt: string;
    expected: number;
    low: number;
    high: number;
    verdict: string | null;
    resolvedValue: number | null;
    resolvedAt: string | null;
  }[];
}

export interface HistorySnapshot {
  at: string;
  beliefs: Record<string, number>;
}

const W = 960;
const PAD = { left: 96, right: 24, top: 24, bottom: 28 };
/** One row of labels in each lane, and how many rows a lane may grow to. */
const ROW = { fact: 13, action: 14 };
const MAX_ROWS = 4;
/** Geist Mono at 11 px measures about this per character; the 8 is the gap. */
const CHAR = 6.2;
const GAP = 8;

const day = (d: string) => new Date(d).getTime();
const pct = (v: number) => `${Math.round(v * 100)}%`;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-01-30" reads as "Jan 30 2026", not as "26/01/30". */
const short = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-");
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${Number(dd)} ${y}` : d;
};

/**
 * Lay labels out in rows so none of them lands on top of another.
 *
 * Each item claims the span its own text needs at its own date. It goes in
 * the first row where that span is free; if all `MAX_ROWS` rows are taken at
 * that date it goes to `overflow`, which the chart prints as one "+N" mark
 * per date and the disclosure below lists in full.
 */
export function packRows<T>(
  items: T[],
  spanOf: (item: T) => { from: number; to: number },
  maxRows = MAX_ROWS,
): { placed: { item: T; row: number }[]; overflow: T[] } {
  const rows: { from: number; to: number }[][] = [];
  const placed: { item: T; row: number }[] = [];
  const overflow: T[] = [];

  for (const item of items) {
    const span = spanOf(item);
    let row = 0;
    while (row < maxRows) {
      const taken = (rows[row] ??= []);
      if (!taken.some((s) => span.from < s.to && s.from < span.to)) {
        taken.push(span);
        placed.push({ item, row });
        break;
      }
      row++;
    }
    if (row === maxRows) overflow.push(item);
  }
  return { placed, overflow };
}

/** Geist Mono at 9 px, the size the action label is set in. */
const ACT_CHAR = 5.4;

/** Cut a label to the room it has, with an ellipsis rather than a clip. */
export const fit = (text: string, room: number, char: number): string => {
  const max = Math.floor(room / char);
  if (max <= 1) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

/** What a collapsed group of labels prints. */
const labelText = (n: number) => `+${n} more`;

/** The span a label of this text claims, starting at `x`. */
const labelSpan = (x: number, text: string) => ({
  from: x,
  to: x + text.length * CHAR + GAP,
});

export function HistoryLanes({
  facts,
  actions,
  markers,
  snapshots,
  posts = [],
}: {
  facts: HistoryFact[];
  actions: HistoryAction[];
  markers: HistoryMarker[];
  snapshots: HistorySnapshot[];
  posts?: HistoryPost[];
}) {
  const [at, setAt] = useState(snapshots.length - 1);
  const [hover, setHover] = useState<HistoryFact | null>(null);
  // Phase 24b: the lane is what the person said. A watch that restated the
  // resting heart rate every morning turned it into a wall of struck-through
  // numbers, so anything the system derived is off by default.
  const [showSystem, setShowSystem] = useState(false);
  const systemCount = facts.filter((f) => f.source === "system").length;
  const shown = useMemo(
    () => (showSystem ? facts : facts.filter((f) => f.source !== "system")),
    [facts, showSystem],
  );

  // The axis is the window the path happened in: facts, actions, projections
  // and snapshots. An HbA1c from 2016 would otherwise squeeze the last two
  // years into a centimetre, so old readings are dropped rather than drawn.
  const anchors = [
    ...shown.map((f) => f.validFrom),
    ...posts.map((p) => p.date),
    ...actions.map((a) => a.from),
    ...markers.flatMap((m) => m.projections.map((p) => p.madeAt)),
    ...snapshots.map((s) => s.at),
  ].filter(Boolean);
  const ends = [
    ...markers.flatMap((m) => m.projections.map((p) => p.retestAt)),
    ...markers.flatMap((m) => m.points.map((p) => p.date)),
    ...snapshots.map((s) => s.at),
  ].filter(Boolean);
  const allDates = [
    ...anchors,
    ...ends,
    ...markers.flatMap((m) => m.points.map((p) => p.date)),
  ];
  const from = anchors.length
    ? Math.min(...anchors.map(day)) - 30 * 86_400_000
    : allDates.length
      ? Math.min(...allDates.map(day))
      : Date.now();
  const to = ends.length
    ? Math.max(...ends.map(day))
    : allDates.length
      ? Math.max(...allDates.map(day))
      : Date.now();
  const span = Math.max(to - from, 86_400_000);
  const x = (d: string) =>
    PAD.left + ((day(d) - from) / span) * (W - PAD.left - PAD.right);

  const cut = snapshots[at]?.at ?? null;
  const dim = (d: string) => (cut && day(d) > day(cut) ? 0.18 : 1);

  /* ── the lanes, packed so no label lands on another ─────────────────── */

  const factText = (f: HistoryFact) =>
    `${f.key.replace(/_/g, " ")} ${f.value.slice(0, 18)}`;

  const factPack = packRows(shown, (f) =>
    labelSpan(x(f.validFrom) + 3, factText(f)),
  );
  // An action is a bar from its start to the right edge, so two of them can
  // never share a row. It is still the same packer: the span is the bar.
  const actionPack = packRows(actions, (a) => ({
    from: x(a.from),
    to: W - PAD.right,
  }));

  const factRows =
    Math.max(1, ...factPack.placed.map((p) => p.row + 1)) +
    (factPack.overflow.length ? 1 : 0);
  const actionRows =
    Math.max(1, ...actionPack.placed.map((p) => p.row + 1)) +
    (actionPack.overflow.length ? 1 : 0);

  const factsTop = PAD.top + 12;
  /** the band under the fact labels: confirmation ticks and check-in dots */
  const factTickY = factsTop + factRows * ROW.fact;
  const actionsTop = factTickY + 26;
  const markersTop = actionsTop + actionRows * ROW.action + 34;
  const height = markersTop + markers.length * 46 + PAD.bottom;

  const factRowY = (row: number) => factsTop + row * ROW.fact;
  const actionRowY = (row: number) => actionsTop + row * ROW.action;

  /**
   * Overflow collapses to one "+N more" per date in the lane's last row, and
   * two of those that would collide merge into the earlier one — otherwise
   * the fix for overlapping labels grows its own overlapping labels.
   */
  const overflowMarks = <T,>(items: T[], dateOf: (item: T) => string) => {
    const byDate = new Map<string, number>();
    for (const item of items)
      byDate.set(dateOf(item), (byDate.get(dateOf(item)) ?? 0) + 1);
    const out: { date: string; n: number }[] = [];
    for (const [date, n] of [...byDate].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const last = out[out.length - 1];
      const room = last
        ? x(last.date) + labelText(last.n).length * CHAR + GAP
        : -Infinity;
      if (last && x(date) < room) last.n += n;
      else out.push({ date, n });
    }
    return out;
  };
  const factOverflow = overflowMarks(factPack.overflow, (f) => f.validFrom);
  const actionOverflow = overflowMarks(actionPack.overflow, (a) => a.from);

  /** What this fact moved, from the snapshots either side of it. */
  const movedBy = useMemo(() => {
    if (!hover) return [];
    const before = [...snapshots]
      .reverse()
      .find((s) => day(s.at) <= day(hover.validFrom));
    const after = snapshots.find((s) => day(s.at) > day(hover.validFrom));
    if (!before || !after) return [];
    return Object.entries(after.beliefs)
      .map(([id, p]) => ({ id, from: before.beliefs[id] ?? 0, to: p }))
      .filter((r) => Math.abs(r.to - r.from) >= 0.02)
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
      .slice(0, 4);
  }, [hover, snapshots]);

  const beliefs = snapshots[at]?.beliefs ?? {};
  const top = Object.entries(beliefs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="lanes flex flex-col gap-[var(--s13)]">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full">
        {/* the axis */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top - 10}
          y2={PAD.top - 10}
          className="axis-line"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const d = new Date(from + f * span).toISOString().slice(0, 10);
          // The end ticks anchor inward, or "Nov 23 2026" runs off the box.
          const anchor = f === 0 ? "start" : f === 1 ? "end" : "middle";
          return (
            <text
              key={f}
              x={x(d)}
              y={PAD.top - 16}
              textAnchor={anchor}
              className="tickt"
            >
              {short(d)}
            </text>
          );
        })}
        {cut && (
          <line
            x1={x(cut)}
            x2={x(cut)}
            y1={PAD.top - 12}
            y2={height - PAD.bottom}
            className="cut"
          />
        )}

        {/* lane 1: facts, one per free row */}
        <text x={4} y={factsTop} className="lane-label">
          facts
        </text>
        {factPack.placed.map(({ item: f, row }, i) => (
          <g
            key={`${f.key}-${f.validFrom}-${i}`}
            opacity={dim(f.validFrom)}
            onMouseEnter={() => setHover(f)}
            onMouseLeave={() => setHover(null)}
          >
            <line
              x1={x(f.validFrom)}
              x2={x(f.validFrom)}
              y1={factRowY(row) - 9}
              y2={factRowY(row) + 3}
              className={cn("fact", f.changeKind === "corrected" && "struck")}
              strokeWidth={2}
              strokeDasharray={f.changeKind === "corrected" ? "3 2" : undefined}
            />
            <text
              x={x(f.validFrom) + 3}
              y={factRowY(row)}
              className={cn("factt", f.changeKind === "corrected" && "struck")}
            >
              {factText(f)}
            </text>
          </g>
        ))}
        {factOverflow.map(({ date, n }) => (
          <text
            key={`fmore-${date}`}
            x={x(date) + 3}
            y={factRowY(factRows - 1)}
            className="more"
            opacity={dim(date)}
          >
            {labelText(n)}
          </text>
        ))}

        {/* the ticks: a day somebody confirmed a fact without changing it */}
        {shown.flatMap((f, i) =>
          (f.confirmations ?? []).map((day) => (
            <path
              key={`tick-${f.key}-${i}-${day}`}
              d={`M${x(day) - 3} ${factTickY + 4} l3 3 l5 -6`}
              className="tick"
              opacity={dim(day)}
            >
              <title>{`${f.key.replace(/_/g, " ")} confirmed on ${day}`}</title>
            </path>
          )),
        )}

        {/* the posts: one dot each, on the same lane the facts land on */}
        {posts.map((p) => (
          <circle
            key={`post-${p.id}`}
            cx={x(p.date)}
            cy={factTickY + 12}
            r={3}
            className="post"
            opacity={dim(p.date)}
          >
            <title>{`${p.date}: ${p.text.slice(0, 120)} (${p.chips} chips)`}</title>
          </circle>
        ))}

        {/* lane 2: actions and adherence, one bar per row */}
        <text x={4} y={actionsTop + 8} className="lane-label">
          actions
        </text>
        {actionPack.placed.map(({ item: a, row }) => {
          const y = actionRowY(row);
          const x1 = x(a.from);
          const x2 = W - PAD.right;
          return (
            <g key={a.id} opacity={dim(a.from)}>
              <rect
                x={x1}
                y={y}
                width={Math.max(2, x2 - x1)}
                height={10}
                className="actbar"
                fillOpacity={0.15 + a.adherence * 0.55}
              />
              <text x={x1 + 4} y={y + 8} className="actt">
                {fit(`${a.text} · ${pct(a.adherence)}`, x2 - x1 - 10, ACT_CHAR)}
              </text>
            </g>
          );
        })}
        {actionOverflow.map(({ date, n }) => (
          <text
            key={`amore-${date}`}
            x={x(date) + 4}
            y={actionRowY(actionRows - 1) + 8}
            className="more"
            opacity={dim(date)}
          >
            {labelText(n)}
          </text>
        ))}

        {/* lane 3: markers, one row each */}
        <text
          x={4}
          y={markersTop}
          className="lane-label"
        >
          markers
        </text>
        {markers.map((marker, i) => {
          // Only the readings inside the window; the older ones live in the
          // table below and on /m/[code].
          const m = {
            ...marker,
            points: marker.points.filter((p) => day(p.date) >= from),
          };
          const top0 = markersTop + i * 46 - 10;
          const values = [
            ...m.points.map((p) => p.value),
            ...m.projections.flatMap((p) => [p.low, p.high]),
          ];
          const lo = Math.min(...values);
          const hi = Math.max(...values);
          const range = hi - lo || 1;
          const y = (v: number) => top0 + 30 - ((v - lo) / range) * 26;
          return (
            <g key={m.code}>
              <text
                x={4}
                y={top0 + 20}
                className="actt"
              >
                {m.code.replace(/_/g, " ")}
              </text>
              {m.projections.map((p, k) => (
                <g key={k} opacity={dim(p.madeAt)}>
                  <rect
                    x={x(p.madeAt)}
                    y={y(p.high)}
                    width={Math.max(3, x(p.retestAt) - x(p.madeAt))}
                    height={Math.max(3, y(p.low) - y(p.high))}
                    className="band"
                  />
                  <text
                    x={x(p.madeAt) + 3}
                    y={y(p.high) - 3}
                    className="bandt"
                  >
                    expected {p.expected}
                  </text>
                  {p.verdict && p.resolvedAt && (
                    <text
                      x={x(p.resolvedAt) + 4}
                      y={y(p.resolvedValue ?? p.expected) - 6}
                      className={cn(
                        "verdict",
                        p.verdict === "worse"
                          ? "off"
                          : p.verdict === "better"
                            ? ""
                            : "none",
                      )}
                    >
                      {p.verdict === "as_expected" ? "as expected" : p.verdict}
                    </text>
                  )}
                </g>
              ))}
              <path
                d={m.points
                  .map((p, k) => `${k ? "L" : "M"} ${x(p.date)} ${y(p.value)}`)
                  .join(" ")}
                className="mline"
              />
              {m.points.map((p) => (
                <g key={p.date} opacity={dim(p.date)}>
                  <circle
                    cx={x(p.date)}
                    cy={y(p.value)}
                    r={3}
                    className="mdot"
                  >
                    <title>{`${m.code} ${p.value}${m.unit ? ` ${m.unit}` : ""} on ${p.date}`}</title>
                  </circle>
                  <text
                    x={x(p.date)}
                    y={y(p.value) + 12}
                    textAnchor="middle"
                    className="mvt"
                  >
                    {p.value}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {(factPack.overflow.length > 0 || actionPack.overflow.length > 0) && (
        <details className="disclose">
          <summary>
            {factPack.overflow.length + actionPack.overflow.length} more on
            crowded dates
            <ChevronDown className="ic" aria-hidden="true" />
          </summary>
          <div className="inner">
            <div className="rowlist">
              {factPack.overflow.map((f, i) => (
                <div className="markerrow said" key={`of-${f.key}-${i}`}>
                  <div className="nm">
                    <b>{f.key.replace(/_/g, " ")}</b>
                    <span>
                      {f.changeKind} · {f.source}
                    </span>
                  </div>
                  <div className="note">{f.value}</div>
                  <div className="val">{short(f.validFrom)}</div>
                  <div className="wd" />
                </div>
              ))}
              {actionPack.overflow.map((a) => (
                <div className="markerrow said" key={`oa-${a.id}`}>
                  <div className="nm">
                    <b>{a.text}</b>
                    <span>{a.active ? "adopted" : "dropped"}</span>
                  </div>
                  <div className="note">{pct(a.adherence)} of the last 30 days</div>
                  <div className="val">{short(a.from)}</div>
                  <div className="wd" />
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {systemCount > 0 && (
        <button
          onClick={() => setShowSystem((v) => !v)}
          className="b b-text b-sm"
        >
          {showSystem ? "Hide" : "Show"} what the phone derived ({systemCount})
        </button>
      )}

      {snapshots.length > 1 && (
        <div className="rangewrap">
          <input
            className="rng"
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={at}
            aria-label="Replay to a date"
            onChange={(e) => setAt(Number(e.target.value))}
          />
          <span className="rv">{snapshots[at]?.at}</span>
        </div>
      )}

      <div className="rowlist">
        {top.map(([id, p]) => (
          <div className="markerrow" key={id}>
            <div className="nm">
              <b>{id.replace(/_/g, " ")}</b>
            </div>
            <div />
            <div className="val">
              {pct(p).replace("%", "")}
              <em>%</em>
            </div>
            <div className="wd" />
          </div>
        ))}
        {!top.length && (
          <p className="cap">No beliefs were recorded on that day.</p>
        )}
      </div>

      {hover && (
        <p className="t-meta">
          <StateWord tone={hover.changeKind === "corrected" ? "border" : "none"}>
            {hover.changeKind}
          </StateWord>{" "}
          {hover.key.replace(/_/g, " ")} = {hover.value} ·{" "}
          {movedBy.length
            ? movedBy
                .map((r) => `${r.id} ${pct(r.from)} → ${pct(r.to)}`)
                .join(", ")
            : "moved no conclusion"}
        </p>
      )}
    </div>
  );
}
