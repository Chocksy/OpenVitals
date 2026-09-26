/**
 * The corridor charts, phase 40a. Server-renderable SVG, as `ruler.tsx` is:
 * no state, no measuring, plain numbers into a viewBox. Safe to render from
 * a client component too (the Drawer's case), because nothing here touches
 * the server.
 *
 * - `MiniCorridor` is 55's row mark: a track, your own band (dashed when
 *   provisional) or the goal zone, the lab limits as ticks, the draw before
 *   as a hollow mark with a trail, and the last draw as a solid dot.
 * - `CorridorChart` is 53's `chart()`: the draws on a time axis, your band
 *   as it stood before each draw (or one band), the lab limits as dashed
 *   lines, the goal band, the step's earlier ceiling, and the "if nothing
 *   changes" landing line. Labels sit on the right and are pushed apart so
 *   they never overlap.
 *
 * The band drawn is the median ± one spread, as in 53; a draw outside it is
 * marked. The engine's own rule for leaving the band (2.5 spreads,
 * `lib/signals.ts`) is untouched and lives in the words, not the picture.
 */
import { cn } from "@/lib/utils";

const T = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** 53's `nice`: whole numbers from 20 up, one decimal from 1, two below. */
export function nice(v: number): string {
  const a = Math.abs(v);
  const s =
    a >= 20
      ? Math.round(v)
      : a >= 1
        ? Math.round(v * 10) / 10
        : Math.round(v * 100) / 100;
  return String(s);
}

const dayMonth = (d: string) => {
  const t = new Date(T(d));
  return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}`;
};

export interface BandLike {
  median: number;
  sd: number;
  provisional?: boolean;
}

type Lab = [number | null, number | null] | null | undefined;

const labsOf = (lab: Lab): number[] =>
  ((lab ?? []) as (number | null)[]).filter(
    (v): v is number => v != null && Number.isFinite(v),
  );

/* ── MiniCorridor ──────────────────────────────────────────────────────── */

export interface MiniProps {
  band: BandLike | null;
  lab?: Lab;
  last: number | null;
  /** the draw before, drawn hollow with a trail to the last */
  prev?: number | null;
  /** when set, the zone drawn is the goal, not the own band (55) */
  goal?: [number | null, number | null] | null;
  /** the last dot's ink; the kind's colour on a hunch row */
  tone?: string;
  width?: number;
  className?: string;
}

/** The domain a mini corridor spans: every mark plus a little air. */
export function miniDomain({
  band,
  lab,
  last,
  prev,
  goal,
}: Omit<MiniProps, "tone" | "width" | "className">): [number, number] | null {
  const vs: number[] = [];
  if (last != null) vs.push(last);
  if (prev != null) vs.push(prev);
  if (band) vs.push(band.median - band.sd, band.median + band.sd);
  for (const g of labsOf(goal ?? null)) vs.push(g);
  if (!vs.length) return null;
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  const span = hi - lo || Math.abs(hi) * 0.2 || 1;
  /* a lab limit joins the domain only when it is near (55: 35 % of the span) */
  for (const L of labsOf(lab)) {
    if (L >= lo - 0.35 * span && L <= hi + 0.35 * span) {
      lo = Math.min(lo, L);
      hi = Math.max(hi, L);
    }
  }
  const pad = (hi - lo || span) * 0.08;
  return [lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad];
}

export function MiniCorridor({
  band,
  lab,
  last,
  prev,
  goal,
  tone = "var(--plum)",
  width = 121,
  className,
}: MiniProps) {
  const dom = miniDomain({ band, lab, last, prev, goal });
  if (!dom || last == null) return null;
  const [a, b] = dom;
  const W = width;
  const X = (v: number) =>
    Math.max(0, Math.min(W, ((v - a) / (b - a || 1)) * W));
  const f = (v: number) => X(v).toFixed(1);
  const g = labsOf(goal ?? null);
  return (
    <svg
      className={cn("mini-cor", className)}
      viewBox={`0 0 ${W} 21`}
      width={W}
      height={21}
      aria-hidden="true"
    >
      <rect className="base" x="0" y="7" width={W} height="8" rx="4" />
      {g.length === 2 ? (
        <rect
          className="gz"
          x={f(g[0]!)}
          y="7"
          width={(X(g[1]!) - X(g[0]!)).toFixed(1)}
          height="8"
          rx="4"
        />
      ) : band ? (
        <rect
          className={cn("cz", band.provisional && "prov")}
          x={f(band.median - band.sd)}
          y={band.provisional ? 7.5 : 7}
          width={(X(band.median + band.sd) - X(band.median - band.sd)).toFixed(
            1,
          )}
          height={band.provisional ? 7 : 8}
          rx={band.provisional ? 3.5 : 4}
        />
      ) : null}
      {labsOf(lab)
        .filter((v) => v > 0 && v >= a && v <= b)
        .map((v) => (
          <line key={v} className="lab" x1={f(v)} x2={f(v)} y1="3" y2="19" />
        ))}
      {prev != null && (
        <>
          <line className="trail" x1={f(prev)} x2={f(last)} y1="11" y2="11" />
          <circle className="pv" cx={f(prev)} cy="11" r="2.5" />
        </>
      )}
      <circle className="dt" cx={f(last)} cy="11" r="5" fill={tone} />
    </svg>
  );
}

/* ── CorridorChart ─────────────────────────────────────────────────────── */

export interface CorridorProps {
  series: { date: string; value: number }[];
  /** the band as it stood before each draw; drawn as a ribbon */
  bandAt?: { date: string; median: number; sd: number }[];
  /** one band across the whole chart, when there is no `bandAt` */
  band?: BandLike | null;
  lab?: Lab;
  goal?: { low: number | null; high: number | null } | null;
  /** the step's earlier ceiling (or floor) and where the step began */
  step?: { prior: number; since: string; word?: string } | null;
  /** "if nothing changes": the slope's line read on a date */
  landing?: { date: string; value: number } | null;
  /** show only draws from this day; earlier ones become a "← 2019 · 98" note */
  from?: string | null;
  unit?: string | null;
  label?: string;
  width?: number;
  height?: number;
  /** the right gutter for the labels */
  gutter?: number;
  /** how many of the last draws print their value */
  labels?: number;
  /** draw in on mount (53 `.anim`); reduced motion keeps it still */
  anim?: boolean;
  /** 53's `short`: the phone's labels ("you 94 to 123", the landing without its lead-in) */
  short?: boolean;
  className?: string;
}

export interface RightLabel {
  y: number;
  t: string;
  k: string;
}

/** 53's right-hand labels: sorted, then pushed down to 13 px apart. */
export function pushApart(labels: RightLabel[], gap = 13): RightLabel[] {
  const out = [...labels].sort((p, q) => p.y - q.y).map((l) => ({ ...l }));
  for (let i = 1; i < out.length; i++)
    if (out[i]!.y - out[i - 1]!.y < gap) out[i]!.y = out[i - 1]!.y + gap;
  return out;
}

export function CorridorChart({
  series,
  bandAt,
  band,
  lab,
  goal,
  step,
  landing,
  from,
  unit,
  label = "Chart",
  width = 610,
  height = 233,
  gutter = 89,
  labels = 3,
  anim,
  short,
  className,
}: CorridorProps) {
  const all = series
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ d: p.date.slice(0, 10), x: T(p.date), v: p.value }))
    .sort((p, q) => p.x - q.x);
  const early = from ? all.filter((p) => p.x < T(from)) : [];
  const pts = from ? all.filter((p) => p.x >= T(from)) : all;
  if (!pts.length) return null;

  const W = width;
  const H = height;
  const P = { l: 8, r: gutter, t: 13, b: 21 };
  const ext = landing && T(landing.date) > pts.at(-1)!.x ? landing : null;

  const x0 = from ? Math.min(T(from), pts[0]!.x) : pts[0]!.x;
  const x1 = ext ? T(ext.date) : pts.at(-1)!.x;
  const xspan = x1 - x0 || 86_400_000 * 30;
  const xp = xspan * 0.03;
  const X = (x: number) =>
    P.l + ((x - x0 + xp) / (xspan + 2 * xp)) * (W - P.l - P.r);

  /* the ribbon: each draw's band from the draw before it to this one */
  const ribbon = (bandAt ?? [])
    .map((b) => ({ x: T(b.date), m: b.median, sd: b.sd }))
    .filter((b) => b.x >= x0 - xp && Number.isFinite(b.sd) && b.sd > 0);
  const flat = !ribbon.length && band ? band : null;
  const bandLast =
    ribbon.at(-1) ?? (flat ? { m: flat.median, sd: flat.sd } : null);

  const vals = pts.map((p) => p.v);
  for (const r of ribbon) vals.push(r.m - r.sd, r.m + r.sd);
  if (flat) vals.push(flat.median - flat.sd, flat.median + flat.sd);
  if (goal?.low != null) vals.push(goal.low);
  if (goal?.high != null) vals.push(goal.high);
  if (ext) vals.push(ext.value);
  if (step) vals.push(step.prior);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const r0 = hi - lo || Math.abs(hi) * 0.2 || 1;
  const labs = labsOf(lab).filter((L) =>
    L === 0 ? lo < 0.5 * r0 : L >= lo - 1.5 * r0 && L <= hi + 1.5 * r0,
  );
  for (const L of labs) {
    lo = Math.min(lo, L);
    hi = Math.max(hi, L);
  }
  const yp = (hi - lo || r0) * 0.08;
  lo = lo === 0 ? 0 : lo >= 0 ? Math.max(0, lo - yp) : lo - yp;
  hi += yp;
  const Y = (v: number) =>
    P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const xr = W - P.r;

  const right: RightLabel[] = [];
  const u = unit ? ` ${unit}` : "";

  /* year ticks, every one or every other so they keep 55 px apart */
  const years: number[] = [];
  {
    const y0 = new Date(x0 - xp).getUTCFullYear() + 1;
    const y1 = new Date(x1 + xp).getUTCFullYear();
    const every =
      (y1 - y0) / Math.max(1, Math.floor((W - P.l - P.r) / 55)) > 1 ? 2 : 1;
    for (let y = y0; y <= y1; y += every) years.push(y);
  }

  const gl = goal?.low ?? null;
  const gh = goal?.high ?? null;
  let goalRect: { y: number; h: number } | null = null;
  if (gl != null || gh != null) {
    const top = Y(gh ?? hi);
    const bot = Y(gl ?? lo);
    goalRect = { y: top, h: Math.max(1, bot - top) };
    right.push({
      y: (top + bot) / 2,
      t:
        gl != null && gh != null
          ? `goal ${nice(gl)} to ${nice(gh)}`
          : gh != null
            ? `goal under ${nice(gh)}`
            : `goal over ${nice(gl!)}`,
      k: "gl",
    });
  }
  if (bandLast)
    right.push({
      y: Y(bandLast.m),
      t: `${short ? "you" : "your band"} ${nice(bandLast.m - bandLast.sd)} to ${nice(bandLast.m + bandLast.sd)}`,
      k: "bl",
    });
  for (const L of labs) right.push({ y: Y(L), t: `lab ${nice(L)}`, k: "" });

  const path = pts
    .map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.v).toFixed(1)}`)
    .join("");
  const last = pts.at(-1)!;

  /* the band a draw is judged against: the one that stood before it */
  const bandFor = (x: number) => {
    let b: { m: number; sd: number } | null = flat
      ? { m: flat.median, sd: flat.sd }
      : null;
    for (const r of ribbon) if (r.x <= x) b = r;
    return b;
  };

  return (
    <svg
      className={cn("cor", anim && "anim", className)}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      {years.map((y) => {
        const x = X(Date.UTC(y, 0, 1));
        if (x < P.l || x > xr) return null;
        return (
          <g key={y}>
            <line className="tick" x1={x} x2={x} y1={P.t} y2={H - P.b} />
            <text x={x} y={H - 5} textAnchor="middle">
              {y}
            </text>
          </g>
        );
      })}
      {goalRect && (
        <rect
          className="goal"
          x={P.l}
          width={xr - P.l}
          y={goalRect.y}
          height={goalRect.h}
          rx="5"
        />
      )}
      {flat && (
        <>
          <rect
            className={cn("band", flat.provisional && "prov")}
            x={P.l}
            width={xr - P.l}
            y={Y(flat.median + flat.sd)}
            height={Y(flat.median - flat.sd) - Y(flat.median + flat.sd)}
            rx="3"
          />
          <line
            className="med"
            x1={P.l}
            x2={xr}
            y1={Y(flat.median)}
            y2={Y(flat.median)}
          />
        </>
      )}
      {ribbon.map((b, i) => {
        /* the band that stood before a draw spans the gap leading up to it;
           the newest one runs on to the right edge */
        const before = all.filter((p) => p.x < b.x).at(-1);
        const xa = Math.max(P.l, before ? X(before.x) : X(b.x) - 8);
        const xb = i === ribbon.length - 1 ? xr : X(b.x);
        return (
          <g key={b.x}>
            <rect
              className="band"
              x={xa}
              width={Math.max(1, xb - xa)}
              y={Y(b.m + b.sd)}
              height={Math.max(1, Y(b.m - b.sd) - Y(b.m + b.sd))}
            />
            <line className="med" x1={xa} x2={xb} y1={Y(b.m)} y2={Y(b.m)} />
          </g>
        );
      })}
      {labs.map((L) => (
        <line key={L} className="lab" x1={P.l} x2={xr} y1={Y(L)} y2={Y(L)} />
      ))}
      {step && (
        <>
          <line
            className="step"
            x1={P.l}
            x2={Math.max(P.l, X(T(step.since)))}
            y1={Y(step.prior)}
            y2={Y(step.prior)}
          />
          <text className="bl" x={P.l + 3} y={Y(step.prior) - 5}>
            {`${step.word ?? "earlier ceiling"} ${nice(step.prior)}`}
          </text>
        </>
      )}
      <path className="ln" pathLength={1} d={path} />
      {ext && (
        <>
          <path
            className="ext"
            d={`M${X(last.x)} ${Y(last.v)}L${X(T(ext.date))} ${Y(ext.value)}`}
          />
          <circle
            className="ext dot"
            cx={X(T(ext.date))}
            cy={Y(ext.value)}
            r="5"
          />
          <text
            className="xl"
            x={X(T(ext.date)) - 8}
            y={Y(ext.value) - 13}
            textAnchor="end"
          >
            {short
              ? `${nice(ext.value)} on ${dayMonth(ext.date)}`
              : `if nothing changes · ${nice(ext.value)}${u} on ${dayMonth(ext.date)}`}
          </text>
        </>
      )}
      {pts.map((p, i) => {
        const b = bandFor(p.x);
        const out = b != null && Math.abs(p.v - b.m) > b.sd;
        const isLast = i === pts.length - 1;
        return (
          <g key={`${p.d}-${i}`}>
            <circle
              className={cn("d", out && "out")}
              style={{ "--k": i } as React.CSSProperties}
              cx={X(p.x)}
              cy={Y(p.v)}
              r={isLast ? 5 : 3.5}
            >
              <title>{`${dayMonth(p.d)} ${p.d.slice(0, 4)}: ${nice(p.v)}${u}`}</title>
            </circle>
            {labels > pts.length - 1 - i && (
              <text
                className="v"
                x={X(p.x)}
                y={Y(p.v) - 10}
                textAnchor="middle"
              >
                {nice(p.v)}
              </text>
            )}
          </g>
        );
      })}
      {early.length > 0 && (
        <text x={P.l + 3} y={P.t + 3}>
          {`← ${new Date(early.at(-1)!.x).getUTCFullYear()} · ${nice(early.at(-1)!.v)}`}
        </text>
      )}
      {pushApart(right).map((l) => (
        <text
          key={`${l.k}${l.t}`}
          className={l.k || undefined}
          x={xr + 5}
          y={l.y + 4}
        >
          {l.t}
        </text>
      ))}
    </svg>
  );
}
