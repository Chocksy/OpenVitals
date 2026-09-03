/**
 * The history chart: every draw at its own date and its own value, drawn by
 * hand.
 *
 * Phase 30c. It replaces recharts' `TrendChart` everywhere — the marker page,
 * the marker drawer, Key trends on Home and the conclusion cards — and it is
 * `docs/mockups/v4/v4.css` section 7 plus the "phase 29 · the history chart,
 * rebuilt" block, which is the owner's own list of what the old chart got
 * wrong:
 *
 * 1. every dated mark prints its date under the axis;
 * 2. the target is labelled "target" on the axis and named in the legend;
 * 3. the planned draw rides the projection at its own date, never the zero
 *    line, because a mark at zero reads as a value of zero;
 * 4. a dotted projection runs from now to the target, with the hatched
 *    stretch it still has to close under it;
 * 5. at most three y ticks, in the gutter, in the marker's own unit;
 * 6. a band labels itself only when it has the room; otherwise the gutter
 *    carries it;
 * 7. every value label sits above its own diamond, on the side with room;
 * 8. one legend, and it names every mark on the chart.
 *
 * A server component with no chart library: `chartDomain` below is the y
 * scale and `components/chart-domain.test.ts` is its contract.
 */
import { statusOf } from "@/lib/status";
import { dayLabel, plural } from "@/lib/utils";
import {
  ChartHover,
  type ChartHoverProps,
  flipOf,
  hoverLabel,
} from "./chart-hover";
import {
  decimalsOf,
  goalAim,
  goalWords,
  markTitle,
  niceEnd,
  STATE_TONE,
  STATE_WORD,
} from "./ruler";

/* ── the y domain ───────────────────────────────────────────────────────
 * Moved here from `components/chart-domain.ts` in phase 30c, unchanged.
 *
 * Phase 24d: the spear card printed "glucose, 45 draws" under a blank box.
 * One NaN in 45 draws made the whole domain NaN, which draws as nothing at
 * all, and a bad domain and a broken container look identical. So the domain
 * is a pure function over the points a card hands the chart: given them, say
 * whether the chart can draw them, and with what bounds.
 */

export interface ChartPoint {
  date: string;
  value: number;
}

export interface ChartBands {
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  optimalRangeLow?: number | null;
  optimalRangeHigh?: number | null;
  goalLow?: number | null;
  goalHigh?: number | null;
}

export interface ChartDomain {
  /** the points the chart can actually plot: a finite value and a date */
  points: ChartPoint[];
  yMin: number;
  yMax: number;
  /** false when there is nothing to draw, so the card says so instead */
  drawable: boolean;
}

/** How much air the line gets above and below the widest band. */
const PAD = 0.15;

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** A band edge only widens the domain when it is a real number. */
const bandValues = (b: ChartBands): number[] =>
  [
    b.referenceRangeLow,
    b.referenceRangeHigh,
    b.optimalRangeLow,
    b.optimalRangeHigh,
    b.goalLow,
    b.goalHigh,
  ].filter(isNum);

export function chartDomain(
  points: readonly ChartPoint[],
  bands: ChartBands = {},
): ChartDomain {
  const clean = points.filter(
    (p) => isNum(p.value) && typeof p.date === "string" && p.date !== "",
  );
  if (clean.length === 0)
    return { points: [], yMin: 0, yMax: 1, drawable: false };

  const all = [...clean.map((p) => p.value), ...bandValues(bands)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const padding = (max - min) * PAD || 1;
  return {
    points: clean,
    /* the padding never takes the axis below zero for a quantity that has no
       negative half: "−6 IU/mL" is not a number this app can print */
    yMin:
      min >= 0
        ? Math.max(0, Math.floor(min - padding))
        : Math.floor(min - padding),
    yMax: Math.ceil(max + padding),
    drawable: true,
  };
}

/* ── the element ───────────────────────────────────────────────────────── */

const VB_W = 1000;
const VB_H = 100;

/** Above this many draws the diamonds crowd each other, so only the ends
 *  carry a mark and the legend says how many readings the line is made of. */
const DENSE = 24;

/** The plot's own height in `globals.css`, so a band can ask if it has room. */
const PLOT_H = 144;

const num = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

/** 34 stays 34, 16.29 stays 16.29. */
const digits = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);

const dayMs = (d: string) => new Date(`${d}T00:00:00`).getTime();
const pct = (n: number) => `${n.toFixed(2)}%`;

export interface HistoryChartProps {
  /** what the chart is of; the head prints it */
  title: string;
  unit?: string | null;
  points: ChartPoint[];
  refLow?: number | null;
  refHigh?: number | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  /** the goal, and the day it is due: a bar on the axis, never a diamond */
  target?: number | null;
  /**
   * Phase 31a item 5. The LDL goal is 70–100 by Dec 1 2026. With both bounds
   * the goal draws as a band, the projection aims at the edge the value has
   * to reach, and the legend names the band. One bound keeps the bar.
   */
  targetLow?: number | null;
  targetHigh?: number | null;
  targetDate?: string | null;
  /** a draw that is planned and has no value yet */
  plannedDate?: string | null;
  /** the drawer size: no y gutter, a 55 px plot, the legend kept */
  mini?: boolean;
  /** "readings" for a daily signal, "draws" for blood */
  noun?: string;
}

export function HistoryChart({
  title,
  unit,
  points,
  refLow,
  refHigh,
  optimalLow,
  optimalHigh,
  target,
  targetLow,
  targetHigh,
  targetDate,
  plannedDate,
  mini,
  noun = "draws",
}: HistoryChartProps) {
  const gLow = num(targetLow) ? targetLow : null;
  const gHigh = num(targetHigh) ? targetHigh : null;
  const goalBand = gLow != null && gHigh != null && gHigh > gLow;

  const domain = chartDomain(points, {
    referenceRangeLow: refLow,
    referenceRangeHigh: refHigh,
    optimalRangeLow: optimalLow,
    optimalRangeHigh: optimalHigh,
    goalLow: gLow ?? target,
    goalHigh: gHigh ?? target,
  });
  if (!domain.drawable) return null;

  const rows = [...domain.points].sort((a, b) => a.date.localeCompare(b.date));
  const first = rows[0]!;
  const now = rows[rows.length - 1]!;

  /** The edge the plan is aimed at: the nearer bound of a band, or the bar. */
  const aim = goalBand
    ? goalAim(now.value, gLow, gHigh)
    : num(target)
      ? target
      : goalAim(now.value, gLow, gHigh);
  /** "70–100" or "100": the goal in the words the legend and the axis print. */
  const goalSaid = goalBand
    ? goalWords(gLow, gHigh)
    : aim != null
      ? digits(aim)
      : "";

  /* The y scale: 0 % is the top of the plot, 100 % the bottom. The padded
     ends `chartDomain` returns are arithmetic — 146.72 reads as a second
     value — so the drawn domain rounds outward to the nearest preferred
     number and the gutter's ends are those. `chartDomain` itself is
     untouched: `components/chart-domain.test.ts` is its contract. */
  const places = decimalsOf([
    ...rows.map((p) => p.value),
    refLow,
    refHigh,
    optimalLow,
    optimalHigh,
    target,
    gLow,
    gHigh,
  ]);
  const yMax = niceEnd(domain.yMax, "up", places);
  const yMin = domain.yMin <= 0 ? 0 : niceEnd(domain.yMin, "down", places);
  const ySpan = yMax - yMin || 1;
  const y = (v: number) => ((yMax - v) / ySpan) * 100;

  /** The x scale: real days, from the first draw to the last dated thing. */
  const only = rows.length === 1 && !plannedDate && !targetDate;
  const t0 = dayMs(first.date);
  const lastDate = [now.date, plannedDate ?? "", targetDate ?? ""]
    .filter(Boolean)
    .sort()
    .at(-1)!;
  const tSpan = Math.max(1, dayMs(lastDate) - t0);
  const x = (d: string) => (only ? 50 : ((dayMs(d) - t0) / tSpan) * 100);

  const dense = rows.length > DENSE;
  const line = rows.map(
    (p) => `${(x(p.date) / 100) * VB_W},${(y(p.value) / 100) * VB_H}`,
  );

  /** The projection: now → the target, at the target's own date. */
  const projects = aim != null && targetDate != null;
  const proj = projects
    ? `${(x(now.date) / 100) * VB_W},${(y(now.value) / 100) * VB_H} ${
        (x(targetDate!) / 100) * VB_W
      },${(y(aim!) / 100) * VB_H}`
    : null;

  /** The planned draw sits on that projection at its own date, never at 0. */
  const planOn = (() => {
    if (!plannedDate) return null;
    const px = x(plannedDate);
    if (!projects) return { x: px, y: y(now.value) };
    const a = x(now.date);
    const b = x(targetDate!);
    const f = b === a ? 1 : Math.min(1, Math.max(0, (px - a) / (b - a)));
    return { x: px, y: y(now.value) + (y(aim!) - y(now.value)) * f };
  })();

  /* ── where a band may write its own name ──────────────────────────────
     "normal 0–130" used to be drawn straight through the "was" diamond
     whenever the band's top edge and a draw shared a value. The label now
     looks for a clear slot along the band's top edge, slides right until it
     finds one, and drops to the bottom-left when the whole top is busy.

     The component measures nothing, so the clearance is worked in the plot's
     own coordinates: the label is one line tall and about this wide, and a
     mark within that box is a collision. */
  const LABEL_H = 14;
  const CLEAR = 14;
  /** A monospace 11 px glyph, and the width the plot is assumed to have. */
  const CHAR_PX = 6.4;
  const NOMINAL_W = 560;

  /** Every drawn point, as a fraction of the plot, for the collision test. */
  const drawnMarks = rows.map((p) => ({ x: x(p.date), y: y(p.value) }));

  /**
   * The label's slot, in percent: its own left edge and the width it needs.
   * Slots are tried left to right; a slot is clear when no mark sits inside
   * it with `CLEAR` px of air, counting the line as well as the diamonds.
   */
  /**
   * Phase 31a item 5. A goal band shares an edge with the normal band more
   * often than not — 70–100 against a reference of 0–100 — so a label placed
   * only around the diamonds landed straight on top of the one before it.
   * Every label that has been placed is a box the next one has to miss too,
   * and a label with nowhere to go is dropped: the legend still names it.
   */
  const placed: { left: number; right: number; y: number }[] = [];

  const slotFor = (text: string, edge: number, bottomEdge: number) => {
    const w = ((text.length * CHAR_PX + 12) / NOMINAL_W) * 100;
    const padX = (CLEAR / NOMINAL_W) * 100;
    const padY = ((CLEAR + LABEL_H) / PLOT_H) * 100;
    const busy = (left: number, at: number) =>
      drawnMarks.some(
        (m) =>
          m.x > left - padX &&
          m.x < left + w + padX &&
          Math.abs(m.y - at) < padY,
      ) ||
      placed.some(
        (b) =>
          b.right > left - padX &&
          b.left < left + w + padX &&
          Math.abs(b.y - at) < padY,
      );
    for (const [at, low] of [
      [edge, false],
      [bottomEdge, true],
    ] as const)
      for (let left = 0; left + w <= 100; left += 4)
        if (!busy(left, at)) {
          placed.push({ left, right: left + w, y: at });
          return { left, low };
        }
    return null;
  };

  /** A band as a strip across the plot, clipped to the domain. */
  const strip = (
    lo: number | null | undefined,
    hi: number | null | undefined,
    text: string,
  ) => {
    if (!num(lo) && !num(hi)) return null;
    const top = y(Math.min(num(hi) ? hi : yMax, yMax));
    const bottom = y(Math.max(num(lo) ? lo : yMin, yMin));
    if (bottom <= top) return null;
    /* A band labels itself only when it has the room: at 11 px of strip the
       words sit on the line below. Under that the legend and the y gutter
       carry it, which is the phase 29 fix. */
    const tall = ((bottom - top) / 100) * PLOT_H >= 16;
    const slot = tall && !mini ? slotFor(text, top, bottom) : null;
    return {
      style: {
        "--t": pct(top),
        "--h": pct(bottom - top),
      } as React.CSSProperties,
      slot,
      text,
    };
  };
  const normal = strip(refLow, refHigh, `normal ${bandWords(refLow, refHigh)}`);
  const optimal = strip(
    optimalLow,
    optimalHigh,
    `optimal ${bandWords(optimalLow, optimalHigh)}`,
  );

  /** The hatched stretch the target still has to close, from now to then. */
  /** The word this reading's own state goes by, for the hover. */
  const stateOf = (value: number) =>
    STATE_WORD[statusOf({ value, refLow, refHigh, optimalLow, optimalHigh })];
  const toneOf = (value: number) =>
    STATE_TONE[statusOf({ value, refLow, refHigh, optimalLow, optimalHigh })];

  /**
   * Phase 32a, `docs/mockups/v4/chart-hover.html`. The bands every mark on
   * this chart is judged against, in the words the card's fourth line prints:
   * "normal 0–34 · optimal 0–9", so the state word has a reason beside it.
   */
  const bandSaid =
    [
      num(refLow) || num(refHigh) ? `normal ${bandWords(refLow, refHigh)}` : "",
      num(optimalLow) || num(optimalHigh)
        ? `optimal ${bandWords(optimalLow, optimalHigh)}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || null;

  /** One drawn reading's card: its date, its number, its state, its was. */
  const cardFor = (p: ChartPoint, i: number): ChartHoverProps => {
    const before = i > 0 ? rows[i - 1]! : null;
    return {
      date: p.date,
      value: p.value,
      unit,
      state: stateOf(p.value),
      tone: toneOf(p.value),
      band: bandSaid,
      was: before ? { value: before.value, date: before.date } : null,
      ...flipOf(x(p.date), y(p.value)),
    };
  };

  /** A planned draw has a date and no number, and the card says so in words. */
  const planCard: ChartHoverProps | null =
    planOn && plannedDate
      ? {
          date: plannedDate,
          value: null,
          unit,
          state: "planned",
          tone: "border",
          band: bandSaid,
          was: { value: now.value, date: now.date },
          ...flipOf(planOn.x, planOn.y),
        }
      : null;

  /** The target carries its date instead of a state word: a target has none. */
  const targetCard: ChartHoverProps | null = projects
    ? {
        date: targetDate ?? null,
        value: aim!,
        unit,
        state: "",
        tone: "none",
        /* the goal band already names itself on the band it draws, and the
           axis under it already says "target": the card carries the bands the
           number is judged against instead of printing the goal a third time */
        band: bandSaid,
        ...flipOf(x(targetDate!), y(aim!)),
      }
    : null;

  const goalStrip = goalBand ? strip(gLow, gHigh, `target ${goalSaid}`) : null;

  const pace =
    projects && Math.abs(aim! - now.value) > 0
      ? ({
          "--t": pct(y(Math.max(aim!, now.value))),
          "--h": pct(
            y(Math.min(aim!, now.value)) - y(Math.max(aim!, now.value)),
          ),
          "--l": pct(x(now.date)),
          "--r": "0%",
        } as React.CSSProperties)
      : null;

  /** At most three y ticks: the top of the scale, the band edge, the floor. */
  const ticks = [
    yMax,
    num(refHigh) ? refHigh : num(optimalHigh) ? optimalHigh : null,
    yMin,
  ]
    .filter((v): v is number => v != null)
    .filter(
      (v, i, all) => all.findIndex((o) => Math.abs(o - v) < ySpan / 20) === i,
    );

  /**
   * Phase 31a item 7. The gutter is the widest tick label plus 8 px, counted
   * from the label's own characters — a monospace glyph at 11 px is 6.4 px
   * wide. The `mini` chart prints no ticks, so it gets no gutter at all.
   */
  const gutter = mini
    ? 0
    : Math.ceil(Math.max(...ticks.map((v) => digits(v).length)) * CHAR_PX + 8);

  /** A mark in the right third puts its label on the side that has room. */
  const side = (p: number) => (p > 66 ? " lft" : "");

  /* Two labels closer than this run into each other — "117131" instead of
     117 and 131 — so the older of the pair drops its number and keeps its
     diamond. The legend still names it, with its date and its value. */
  const LABEL_GAP = 15;
  const wasIndex = rows.length - 2;
  const wasCrowded =
    rows.length > 1 &&
    x(now.date) - x(rows[dense ? 0 : wasIndex]!.date) < LABEL_GAP;

  const head = [
    unit ? unit : null,
    plural(rows.length, noun.replace(/s$/, ""), noun),
    plannedDate ? "1 planned" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={mini ? "hist mini" : "hist"}>
      <div className="hist-head">
        <h3>{title}</h3>
        <span className="unit">{head}</span>
      </div>
      <div
        className="hist-body"
        style={{ "--gut": `${gutter}px` } as React.CSSProperties}
      >
        {!mini && (
          <div className="hist-y">
            {ticks.map((v) => (
              <span key={v} style={{ "--y": pct(y(v)) } as React.CSSProperties}>
                {digits(v)}
              </span>
            ))}
          </div>
        )}
        <div>
          <div className="hist-plot">
            {normal && (
              <div className="hist-band normal" style={normal.style}>
                {normal.slot && (
                  <b
                    className={normal.slot.low ? "low" : undefined}
                    style={
                      { "--bx": pct(normal.slot.left) } as React.CSSProperties
                    }
                  >
                    {normal.text}
                  </b>
                )}
              </div>
            )}
            {optimal && (
              <div className="hist-band optimal" style={optimal.style}>
                {optimal.slot && (
                  <b
                    className={optimal.slot.low ? "low" : undefined}
                    style={
                      { "--bx": pct(optimal.slot.left) } as React.CSSProperties
                    }
                  >
                    {optimal.text}
                  </b>
                )}
              </div>
            )}
            {goalStrip && (
              <div className="hist-band goal" style={goalStrip.style}>
                {goalStrip.slot && (
                  <b
                    className={goalStrip.slot.low ? "low" : undefined}
                    style={
                      {
                        "--bx": pct(goalStrip.slot.left),
                      } as React.CSSProperties
                    }
                  >
                    {goalStrip.text}
                  </b>
                )}
              </div>
            )}
            {pace && <div className="hist-band pace seg" style={pace} />}
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline points={line.join(" ")} />
              {proj && <polyline className="proj" points={proj} />}
            </svg>

            {rows.map((p, i) => {
              const isNow = i === rows.length - 1;
              const isWas =
                i === rows.length - 2 || (rows.length === 1 && i === 0);
              if (dense && !isNow && i !== 0) return null;
              const px = x(p.date);
              const cls = isNow ? "now" : i === 0 || isWas ? "was" : "";
              const label =
                isNow ||
                (!wasCrowded && ((!dense && isWas) || (dense && i === 0)));
              const card = cardFor(p, i);
              return (
                <div
                  key={`${p.date}-${i}`}
                  className={`hp ${cls}${side(px)} hovermark`}
                  tabIndex={0}
                  role="img"
                  aria-label={hoverLabel(card)}
                  style={
                    {
                      "--x": pct(px),
                      "--y": pct(y(p.value)),
                    } as React.CSSProperties
                  }
                >
                  {label && <b>{digits(p.value)}</b>}
                  <b className="lbl">
                    {markTitle(p.value, unit, p.date, stateOf(p.value))}
                  </b>
                  <i />
                  <ChartHover {...card} />
                </div>
              );
            })}

            {planOn && planCard && (
              <div
                className={`hp plan${side(planOn.x)} hovermark`}
                tabIndex={0}
                role="img"
                aria-label={hoverLabel(planCard)}
                style={
                  {
                    "--x": pct(planOn.x),
                    "--y": pct(planOn.y),
                  } as React.CSSProperties
                }
              >
                <b>planned · no value yet</b>
                <i />
                <ChartHover {...planCard} />
              </div>
            )}
            {projects && targetCard && (
              <div
                className={`hp target${side(x(targetDate!))} hovermark`}
                tabIndex={0}
                role="img"
                aria-label={`target ${goalSaid}${unit ? ` ${unit}` : ""}${
                  targetDate ? ` by ${dayLabel(targetDate, true)}` : ""
                }`}
                style={
                  {
                    "--x": pct(x(targetDate!)),
                    "--y": pct(y(aim!)),
                  } as React.CSSProperties
                }
              >
                {/* A goal band names itself on the band; only a one-sided
                    goal needs its number printed on the bar as well. */}
                {!goalBand && <b>target {goalSaid}</b>}
                <i />
                <ChartHover {...targetCard} />
              </div>
            )}
          </div>

          <div className={plannedDate ? "hist-x has-plan" : "hist-x"}>
            <span
              className={only ? "" : "first"}
              style={{ "--x": pct(x(first.date)) } as React.CSSProperties}
            >
              {dayLabel(first.date)}
            </span>
            {now.date !== first.date && (
              <span
                className={`now${projects || plannedDate ? "" : " last"}`}
                style={{ "--x": pct(x(now.date)) } as React.CSSProperties}
              >
                {dayLabel(now.date)}
              </span>
            )}
            {plannedDate && (
              <span
                className={`plan${projects ? "" : " last"}`}
                style={{ "--x": pct(x(plannedDate)) } as React.CSSProperties}
              >
                {dayLabel(plannedDate)}
                <em>planned</em>
              </span>
            )}
            {projects && (
              <span
                className="last tgt"
                style={{ "--x": pct(x(targetDate!)) } as React.CSSProperties}
              >
                {dayLabel(targetDate!)}
                <em>target</em>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="hist-legend">
        {rows.length > 1 && (
          <span>
            <i className="hollow" /> was — {dayLabel(first.date, true)},{" "}
            {digits(first.value)}
            {unit ? ` ${unit}` : ""}
          </span>
        )}
        <span>
          <i /> now — {dayLabel(now.date, true)}, {digits(now.value)}
          {unit ? ` ${unit}` : ""}
        </span>
        {dense && rows.length > 2 && (
          <span>
            <u className="line" />{" "}
            {plural(rows.length, noun.replace(/s$/, ""), noun)} between them,
            one line
          </span>
        )}
        {!dense && rows.length > 2 && (
          <span>
            <i className="hollow" /> {rows.length - 2} more{" "}
            {rows.length - 2 === 1 ? noun.replace(/s$/, "") : noun} between them
          </span>
        )}
        {plannedDate && (
          <span>
            <i className="ghost" /> planned draw — {dayLabel(plannedDate, true)}
            , no value yet
          </span>
        )}
        {projects && (
          <>
            <span>
              <u className="dot" /> projection, if the current rate holds
            </span>
            <span>
              <i className="tgt" /> target — {goalSaid}
              {unit ? ` ${unit}` : ""} by {dayLabel(targetDate!, true)}
            </span>
            {pace && (
              <span>
                <u className="hatch" /> the stretch the target has to close
              </span>
            )}
          </>
        )}
        {normal && (
          <span>
            <u className="normal" /> normal {bandWords(refLow, refHigh)}
          </span>
        )}
        {optimal && (
          <span>
            <u className="optimal" /> optimal{" "}
            {bandWords(optimalLow, optimalHigh)}
          </span>
        )}
      </div>
    </div>
  );
}

const bandWords = (
  lo: number | null | undefined,
  hi: number | null | undefined,
): string =>
  num(lo) && num(hi)
    ? `${digits(lo)}–${digits(hi)}`
    : num(hi)
      ? `under ${digits(hi)}`
      : num(lo)
        ? `over ${digits(lo)}`
        : "";
