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
import { Badge } from "./ui-kit";
import { cn } from "@/lib/utils";

export interface HistoryFact {
  key: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  changeKind: string;
  source: string;
  note: string | null;
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
const LANE = { facts: 60, actions: 120, markers: 200 };
const PAD = { left: 96, right: 24, top: 24, bottom: 28 };

const day = (d: string) => new Date(d).getTime();
const short = (d: string) => d.slice(2).replace(/-/g, "/");
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function HistoryLanes({
  facts,
  actions,
  markers,
  snapshots,
}: {
  facts: HistoryFact[];
  actions: HistoryAction[];
  markers: HistoryMarker[];
  snapshots: HistorySnapshot[];
}) {
  const [at, setAt] = useState(snapshots.length - 1);
  const [hover, setHover] = useState<HistoryFact | null>(null);

  // The axis is the window the path happened in: facts, actions, projections
  // and snapshots. An HbA1c from 2016 would otherwise squeeze the last two
  // years into a centimetre, so old readings are dropped rather than drawn.
  const anchors = [
    ...facts.map((f) => f.validFrom),
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

  const height =
    PAD.top + LANE.markers + markers.length * 46 + PAD.bottom;

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
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full">
        {/* the axis */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top - 10}
          y2={PAD.top - 10}
          stroke="var(--color-neutral-200)"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const d = new Date(from + f * span).toISOString().slice(0, 10);
          return (
            <text
              key={f}
              x={x(d)}
              y={PAD.top - 16}
              textAnchor="middle"
              className="fill-neutral-400 font-mono text-[9px]"
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
            stroke="var(--color-accent-500)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {/* lane 1: facts */}
        <text x={4} y={LANE.facts} className="fill-neutral-400 font-mono text-[10px]">
          facts
        </text>
        {facts.map((f, i) => (
          <g
            key={`${f.key}-${f.validFrom}-${i}`}
            opacity={dim(f.validFrom)}
            onMouseEnter={() => setHover(f)}
            onMouseLeave={() => setHover(null)}
          >
            <line
              x1={x(f.validFrom)}
              x2={x(f.validFrom)}
              y1={LANE.facts - 12}
              y2={LANE.facts + 4}
              stroke={
                f.changeKind === "corrected"
                  ? "var(--color-health-warning)"
                  : "var(--color-neutral-400)"
              }
              strokeWidth={2}
              strokeDasharray={f.changeKind === "corrected" ? "3 2" : undefined}
            />
            <text
              x={x(f.validFrom) + 3}
              y={LANE.facts - 14 + (i % 3) * 9}
              className={cn(
                "font-mono text-[9px]",
                f.changeKind === "corrected"
                  ? "fill-neutral-400 [text-decoration:line-through]"
                  : "fill-neutral-600",
              )}
            >
              {f.key.replace(/_/g, " ")} {f.value.slice(0, 18)}
            </text>
          </g>
        ))}

        {/* lane 2: actions and adherence */}
        <text x={4} y={LANE.actions} className="fill-neutral-400 font-mono text-[10px]">
          actions
        </text>
        {actions.map((a, i) => {
          const y = LANE.actions - 14 + (i % 3) * 14;
          const x1 = x(a.from);
          const x2 = W - PAD.right;
          return (
            <g key={a.id} opacity={dim(a.from)}>
              <rect
                x={x1}
                y={y}
                width={Math.max(2, x2 - x1)}
                height={10}
                fill="var(--color-accent-500)"
                fillOpacity={0.15 + a.adherence * 0.55}
                stroke="var(--color-accent-500)"
                strokeOpacity={0.5}
              />
              <text
                x={x1 + 4}
                y={y + 8}
                className="fill-neutral-700 font-mono text-[9px]"
              >
                {a.text.slice(0, 46)} · {pct(a.adherence)}
              </text>
            </g>
          );
        })}

        {/* lane 3: markers, one row each */}
        <text x={4} y={LANE.markers} className="fill-neutral-400 font-mono text-[10px]">
          markers
        </text>
        {markers.map((marker, i) => {
          // Only the readings inside the window; the older ones live in the
          // table below and on /m/[code].
          const m = {
            ...marker,
            points: marker.points.filter((p) => day(p.date) >= from),
          };
          const top0 = LANE.markers + i * 46 - 10;
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
                className="fill-neutral-500 font-mono text-[9px]"
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
                    fill="var(--color-accent-500)"
                    fillOpacity={0.16}
                    stroke="var(--color-accent-500)"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={x(p.madeAt) + 3}
                    y={y(p.high) - 3}
                    className="fill-[var(--color-accent-600)] font-mono text-[8px]"
                  >
                    expected {p.expected}
                  </text>
                  {p.verdict && p.resolvedAt && (
                    <text
                      x={x(p.resolvedAt) + 4}
                      y={y(p.resolvedValue ?? p.expected) - 6}
                      className={cn(
                        "font-mono text-[8px]",
                        p.verdict === "worse"
                          ? "fill-[var(--color-health-critical)]"
                          : p.verdict === "better"
                            ? "fill-[var(--color-health-normal)]"
                            : "fill-neutral-500",
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
                fill="none"
                stroke="var(--color-neutral-500)"
                strokeWidth={1.5}
              />
              {m.points.map((p) => (
                <g key={p.date} opacity={dim(p.date)}>
                  <circle cx={x(p.date)} cy={y(p.value)} r={3} fill="white" stroke="var(--color-neutral-600)" strokeWidth={1.5}>
                    <title>{`${m.code} ${p.value}${m.unit ? ` ${m.unit}` : ""} on ${p.date}`}</title>
                  </circle>
                  <text
                    x={x(p.date)}
                    y={y(p.value) + 12}
                    textAnchor="middle"
                    className="fill-neutral-500 font-mono text-[8px] tabular-nums"
                  >
                    {p.value}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {snapshots.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            replay
          </span>
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={at}
            onChange={(e) => setAt(Number(e.target.value))}
            className="flex-1"
          />
          <span className="font-mono text-[11px] text-neutral-600">
            {snapshots[at]?.at}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {top.map(([id, p]) => (
          <span key={id} className="font-mono text-[11px] text-neutral-600">
            {id.replace(/_/g, " ")}{" "}
            <span className="tabular-nums text-neutral-900">{pct(p)}</span>
          </span>
        ))}
        {!top.length && (
          <span className="font-mono text-[11px] text-neutral-400">
            no beliefs recorded on that day
          </span>
        )}
      </div>

      {hover && (
        <p className="font-mono text-[11px] text-neutral-600">
          <Badge variant={hover.changeKind === "corrected" ? "warning" : "info"}>
            {hover.changeKind}
          </Badge>{" "}
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
