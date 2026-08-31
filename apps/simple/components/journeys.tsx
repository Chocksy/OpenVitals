"use client";

/**
 * The Journeys tab on /brain: a scripted person with a hidden truth, run
 * through the engine step by step, drawn from the prior to the moment the true
 * condition crosses "likely".
 *
 * The page owns no health logic and no arithmetic beyond pixels. Everything it
 * draws comes out of one `JourneyResult` from /api/journeys. The chart is one
 * SVG with a viewBox, the way `graph-map.tsx` draws its arcs: no chart library.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Journey, JourneyResult, JourneyStep } from "@/lib/journey";
import { money } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { Badge, Button, Card } from "./ui-kit";

interface StoredRun {
  id: string;
  journeyId: string;
  ranAt: string;
  kbRevision: number | null;
  result: JourneyResult;
}

/** The catalog rows the select needs, without the truth's labs. */
type JourneySummary = Pick<
  Journey,
  "id" | "title" | "budget" | "maxSteps" | "expect" | "truth"
>;

/* ── the track ────────────────────────────────────────────────────────── */

const W = 960;
const H = 260;
const PAD = { top: 12, right: 130, bottom: 26, left: 34 };

/** The five states, as bands behind the lines. Same cuts as `stateFor`. */
const BANDS: { from: number; to: number; name: string; fill: string }[] = [
  { from: 0, to: 5, name: "ruled out", fill: "var(--color-neutral-100)" },
  { from: 5, to: 25, name: "unlikely", fill: "var(--color-neutral-50)" },
  { from: 25, to: 60, name: "possible", fill: "var(--color-health-info-bg)" },
  { from: 60, to: 90, name: "likely", fill: "var(--color-health-warning-bg)" },
  {
    from: 90,
    to: 100,
    name: "confirmed",
    fill: "var(--color-health-critical-bg)",
  },
];

const LINE = [
  "var(--color-health-info)",
  "var(--color-health-warning)",
  "var(--color-health-normal)",
  "#7c3aed",
  "#0891b2",
];

const pctOf = (v: number) => Math.round(v * 100);

function DiscoveryTrack({
  result,
  truth,
  hover,
  onHover,
}: {
  result: JourneyResult;
  truth: string[];
  hover: number | null;
  onHover: (n: number | null) => void;
}) {
  const n = result.steps.length;
  const at = (step: number) =>
    PAD.left + (n === 0 ? 0 : (step / n) * (W - PAD.left - PAD.right));
  const y = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);

  const series = useMemo(() => {
    const ids = new Set<string>([
      ...Object.keys(result.discoveredAt),
      ...truth,
    ]);
    const all = [result.prior, ...result.steps.map((s) => s.beliefs)];
    for (const beliefs of all)
      for (const [id, p] of Object.entries(beliefs)) if (p > 0.05) ids.add(id);
    return [...ids]
      .map((id) => ({
        id,
        isTruth: truth.includes(id),
        points: all.map((b) => b[id] ?? 0),
        peak: Math.max(...all.map((b) => b[id] ?? 0)),
        falseAt: result.falseLikely.find((f) => f.id === id)?.step ?? null,
      }))
      .sort((a, b) => b.peak - a.peak);
  }, [result, truth]);

  /** A stepped line: hold the value until the next step lands. */
  const path = (points: number[]) =>
    points
      .map((p, i) =>
        i === 0
          ? `M ${at(0)} ${y(p)}`
          : `L ${at(i)} ${y(points[i - 1]!)} L ${at(i)} ${y(p)}`,
      )
      .join(" ");

  // ponytail: labels are stacked in series order, never closer than 10px, so
  // two conditions that end at the same probability stay readable.
  let lastLabelY = -Infinity;
  const labelY = (p: number) => {
    const wanted = Math.max(y(p) + 3, lastLabelY + 10);
    lastLabelY = wanted;
    return wanted;
  };

  let colour = 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      onMouseLeave={() => onHover(null)}
    >
      {BANDS.map((band) => (
        <g key={band.name}>
          <rect
            x={PAD.left}
            y={y(band.to / 100)}
            width={W - PAD.left - PAD.right}
            height={y(band.from / 100) - y(band.to / 100)}
            fill={band.fill}
          />
          <text
            x={W - PAD.right + 6}
            y={(y(band.to / 100) + y(band.from / 100)) / 2 + 3}
            className="fill-neutral-400 font-mono text-[9px]"
          >
            {band.name}
          </text>
        </g>
      ))}

      {/* the step grid, one column per move, clickable for the strip */}
      {Array.from({ length: n + 1 }, (_, i) => (
        <g key={i} onMouseEnter={() => onHover(i)}>
          <rect
            x={at(i) - (n ? (W - PAD.left - PAD.right) / n / 2 : 8)}
            y={PAD.top}
            width={n ? (W - PAD.left - PAD.right) / n : 16}
            height={H - PAD.top - PAD.bottom}
            fill={hover === i ? "rgba(0,0,0,0.05)" : "transparent"}
          />
          <line
            x1={at(i)}
            x2={at(i)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--color-neutral-200)"
            strokeWidth={0.5}
          />
          <text
            x={at(i)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            className="fill-neutral-400 font-mono text-[9px]"
          >
            {i}
          </text>
        </g>
      ))}

      {[0, 25, 50, 75, 100].map((p) => (
        <text
          key={p}
          x={PAD.left - 6}
          y={y(p / 100) + 3}
          textAnchor="end"
          className="fill-neutral-400 font-mono text-[9px]"
        >
          {p}
        </text>
      ))}

      {series.map((s) => {
        // Every value on a true condition's line, in per cent, so the curve
        // reads as "5 → 12 → 31 → 83" without hovering anything.
        const labels = s.isTruth || s.falseAt != null;
        const stroke = s.isTruth
          ? LINE[colour++ % LINE.length]!
          : s.falseAt != null
            ? "var(--color-health-critical)"
            : "var(--color-neutral-300)";
        return (
          <g key={s.id}>
            <path
              d={path(s.points)}
              fill="none"
              stroke={stroke}
              strokeWidth={s.isTruth ? 2 : 1}
              strokeOpacity={s.isTruth || s.falseAt != null ? 1 : 0.6}
            >
              <title>{`${s.id}: ${s.points.map(pctOf).join(" → ")}`}</title>
            </path>
            {labels &&
              s.points.map((p, i) =>
                i > 0 && p === s.points[i - 1] ? null : (
                  <text
                    key={`${s.id}-${i}`}
                    x={at(i)}
                    y={y(p) - 4}
                    textAnchor="middle"
                    className="font-mono text-[8px] tabular-nums"
                    fill={stroke}
                  >
                    {pctOf(p)}
                  </text>
                ),
              )}
            {s.points.map((p, i) => (
              <circle
                key={`${s.id}-dot-${i}`}
                cx={at(i)}
                cy={y(p)}
                r={hover === i ? 3 : 1.5}
                fill={stroke}
                opacity={labels ? 1 : 0.5}
              >
                <title>{`${s.id} at step ${i}: ${pctOf(p)} %`}</title>
              </circle>
            ))}
            {labels && (
              <text
                x={W - PAD.right + 6}
                y={labelY(s.points[s.points.length - 1]!)}
                className="font-mono text-[9px]"
                fill={stroke}
              >
                {s.id}
              </text>
            )}
          </g>
        );
      })}

      {Object.entries(result.discoveredAt).map(([id, step]) =>
        step == null ? null : (
          <g key={`found-${id}`}>
            <line
              x1={at(step)}
              x2={at(step)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-health-normal)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={at(step) + 4}
              y={PAD.top + 10}
              className="fill-[var(--color-health-normal)] font-mono text-[9px]"
            >
              {`${id} at ${step}, ${money(result.steps[step - 1]?.cumEur ?? 0)}`}
            </text>
          </g>
        ),
      )}
    </svg>
  );
}

/* ── the step strip ───────────────────────────────────────────────────── */

/** The three conditions that moved most at this step. */
function movements(step: JourneyStep, before: Record<string, number>) {
  return Object.entries(step.beliefs)
    .map(([id, p]) => ({ id, from: before[id] ?? 0, to: p }))
    .filter((m) => Math.abs(m.to - m.from) >= 0.01)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, 3);
}

function StepStrip({
  result,
  hover,
  onHover,
}: {
  result: JourneyResult;
  hover: number | null;
  onHover: (n: number | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {result.priorWoken.length > 0 && (
        <div className="min-w-[220px] shrink-0 rounded-sm border border-neutral-200 p-2">
          <div className="font-mono text-[10px] text-neutral-400">step 0</div>
          <p className="mt-1 font-body text-[12px] text-neutral-800">
            What the account already said
          </p>
          {result.priorWoken.map((w) => (
            <p
              key={w}
              className="mt-1 font-mono text-[10px] text-[var(--color-health-warning)]"
            >
              woke: {w}
            </p>
          ))}
        </div>
      )}
      {result.steps.map((step, i) => {
        const before = i === 0 ? result.prior : result.steps[i - 1]!.beliefs;
        return (
          <div
            key={step.n}
            onMouseEnter={() => onHover(step.n)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              "min-w-[220px] shrink-0 rounded-sm border border-neutral-200 p-2",
              hover === step.n && "border-neutral-900 bg-neutral-50",
            )}
          >
            <div className="flex items-center justify-between font-mono text-[10px] text-neutral-400">
              <span>step {step.n}</span>
              <span>
                {step.costEur === 0 ? "free" : money(step.costEur)} ·{" "}
                {money(step.cumEur)}
              </span>
            </div>
            <p className="mt-1 font-body text-[12px] leading-snug text-neutral-800">
              {step.move.label}
            </p>
            <span className="flex flex-wrap gap-1">
              {step.move.specialPath && (
                <Badge variant="info">special path</Badge>
              )}
              {step.move.pursue && <Badge variant="warning">follows a signal</Badge>}
              {step.overBudget && (
                <Badge variant="secondary">over the guide</Badge>
              )}
            </span>
            <p className="mt-1 font-mono text-[11px] text-neutral-600">
              → {step.outcome}
            </p>
            <ul className="mt-1 space-y-0.5">
              {movements(step, before).map((m) => (
                <li
                  key={m.id}
                  className="font-mono text-[10px] text-neutral-500"
                >
                  {m.id} {pctOf(m.from)} → {pctOf(m.to)}
                </li>
              ))}
            </ul>
            {step.woken.map((w) => (
              <p
                key={w}
                className="mt-1 font-mono text-[10px] text-[var(--color-health-warning)]"
              >
                woke: {w}
              </p>
            ))}
            {step.note && (
              <p className="mt-1 font-mono text-[10px] text-neutral-400">
                {step.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── the verdict ──────────────────────────────────────────────────────── */

function Verdict({
  journey,
  result,
  kbRevision,
}: {
  journey: JourneySummary;
  result: JourneyResult;
  kbRevision: number | null;
}) {
  const lines: { label: string; ok: boolean; detail: string }[] = [];
  for (const id of journey.expect.discover)
    lines.push({
      label: `discovers ${id}`,
      ok: result.discoveredAt[id] != null,
      detail:
        result.discoveredAt[id] != null
          ? `step ${result.discoveredAt[id]}`
          : "never reached 60%",
    });
  if (journey.expect.withinDraws != null) {
    const draws = result.steps.filter((s) => s.costEur > 0).length;
    lines.push({
      label: `within ${journey.expect.withinDraws} draws`,
      ok: draws <= journey.expect.withinDraws,
      detail: `${draws} draws, ${result.steps.length - draws} free questions`,
    });
  }
  // Money is reported, never failed: the budget is a guide.
  lines.push({
    label: "money",
    ok: true,
    detail: `spent ${money(result.totalEur)}${
      journey.budget ? ` (guide ${money(journey.budget)})` : ""
    }`,
  });
  for (const [id, want] of Object.entries(journey.expect.reaches ?? {})) {
    const peak = Math.max(
      result.prior[id] ?? 0,
      ...result.steps.map((s) => s.beliefs[id] ?? 0),
    );
    lines.push({
      label: `${id} reaches ${(want * 100).toFixed(2)} %`,
      ok: peak >= want,
      detail: `${(peak * 100).toFixed(2)} %`,
    });
  }
  for (const never of journey.expect.notOrders ?? [])
    lines.push({
      label: `never orders ${never}`,
      ok: !result.steps.some((s) => s.move.label.includes(never)),
      detail: result.steps.some((s) => s.move.label.includes(never))
        ? "ordered"
        : "not ordered",
    });
  if (journey.expect.noFalseLikely)
    lines.push({
      label: "no false likely",
      ok: result.falseLikely.length === 0,
      detail:
        result.falseLikely
          .map((f) => `${f.id} ${pctOf(f.p)}% at step ${f.step}`)
          .join(", ") || "none",
    });
  if (journey.expect.wakeWithin != null)
    lines.push({
      label: `wakes by step ${journey.expect.wakeWithin}`,
      ok:
        result.priorWoken.length > 0 ||
        result.steps.some(
          (s) => s.n <= journey.expect.wakeWithin! && s.woken.length,
        ),
      detail:
        [...result.priorWoken, ...result.steps.flatMap((s) => s.woken)][0] ??
        "nothing woke",
    });
  for (const want of journey.expect.orders ?? [])
    lines.push({
      label: `orders ${want}`,
      ok: result.steps.some((s) => s.move.label.includes(want)),
      detail: result.steps.some((s) => s.move.label.includes(want))
        ? "ordered"
        : "never ordered",
    });
  if (journey.expect.stop)
    lines.push({
      label: `stops "${journey.expect.stop}"`,
      ok: result.stop === journey.expect.stop,
      detail: result.stop,
    });

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={result.pass ? "normal" : "critical"}>
          {result.pass ? "pass" : "fail"}
        </Badge>
        <span className="font-mono text-[11px] text-neutral-500">
          {result.steps.length} steps · {money(result.totalEur)} · stop{" "}
          {result.stop} · kb revision {kbRevision ?? "—"}
        </span>
      </div>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.label} className="font-mono text-[11px]">
            <span
              className={
                l.ok
                  ? "text-[var(--color-health-normal)]"
                  : "text-[var(--color-health-critical)]"
              }
            >
              {l.ok ? "yes" : "no"}
            </span>{" "}
            <span className="text-neutral-700">{l.label}</span>{" "}
            <span className="text-neutral-400">— {l.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── the tab ──────────────────────────────────────────────────────────── */

export function Journeys() {
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [stored, setStored] = useState<StoredRun[]>([]);
  const [id, setId] = useState("");
  const [result, setResult] = useState<JourneyResult | null>(null);
  const [kbRevision, setKbRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [budget, setBudget] = useState(0);
  const [flips, setFlips] = useState<Record<string, string>>({});
  const [labFlips, setLabFlips] = useState<Record<string, number>>({});

  const journey = journeys.find((j) => j.id === id);

  const load = useCallback(async () => {
    const res = await fetch("/api/journeys");
    const data = (await res.json()) as {
      journeys?: JourneySummary[];
      runs?: StoredRun[];
      error?: string;
    };
    if (data.error) return setError(data.error);
    setJourneys(data.journeys ?? []);
    setStored(data.runs ?? []);
    setId((prev) => prev || (data.journeys?.[0]?.id ?? ""));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The overrides belong to the journey, not to the tab.
  useEffect(() => {
    setFlips({});
    setLabFlips({});
    setBudget(0);
    setResult(null);
  }, [id]);

  const run = async (all = false, ephemeral = false) => {
    setBusy(all ? "all" : "one");
    setError("");
    const res = await fetch("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: all ? undefined : id,
        budget: budget || undefined,
        answers: flips,
        labs: labFlips,
        ephemeral,
      }),
    });
    const data = (await res.json()) as {
      results?: JourneyResult[];
      kbRevision?: number | null;
      error?: string;
    };
    setBusy("");
    if (data.error) return setError(data.error);
    setKbRevision(data.kbRevision ?? null);
    setResult(
      data.results?.find((r) => r.id === id) ?? data.results?.[0] ?? null,
    );
    if (!ephemeral) void load();
  };

  const previous = useMemo(
    () => stored.filter((r) => r.journeyId === id).slice(compare ? 1 : 0)[0],
    [stored, id, compare],
  );
  const shown =
    result ?? stored.find((r) => r.journeyId === id)?.result ?? null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            journey
          </span>
          <select
            className="h-8 rounded-sm border border-neutral-200 bg-neutral-0 px-2 font-mono text-[12px]"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            {journeys.map((j) => {
              const last = stored.find((r) => r.journeyId === j.id)?.result;
              return (
                <option key={j.id} value={j.id}>
                  {j.title}
                  {last
                    ? ` — ${last.pass ? "pass" : "FAIL"}, ${last.steps.length} steps, ${money(last.totalEur)}`
                    : ""}
                </option>
              );
            })}
          </select>
        </label>
        <Button disabled={busy !== ""} onClick={() => void run(false)}>
          <RefreshCw className={busy === "one" ? "animate-spin" : ""} />
          Run
        </Button>
        <Button
          variant="outline-subtle"
          size="sm"
          disabled={busy !== ""}
          onClick={() => void run(true)}
        >
          Run all
        </Button>
        <label className="flex items-center gap-1 font-mono text-[11px] text-neutral-500">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
          />
          compare with previous run
        </label>
      </Card>

      {error && (
        <p className="font-mono text-[12px] text-[var(--color-health-critical)]">
          {error}
        </p>
      )}

      {journey && shown && (
        <>
          <Card className="p-3">
            <h2 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
              discovery track, 0–100
            </h2>
            <DiscoveryTrack
              result={shown}
              truth={journey.truth.conditions}
              hover={hover}
              onHover={setHover}
            />
            {compare && previous && (
              <p className="font-mono text-[10px] text-neutral-500">
                previous run {new Date(previous.ranAt).toLocaleString()}:{" "}
                {previous.result.steps.length} steps,{" "}
                {money(previous.result.totalEur)},{" "}
                {previous.result.pass ? "pass" : "FAIL"} (kb revision{" "}
                {previous.kbRevision ?? "—"})
              </p>
            )}
          </Card>

          <StepStrip result={shown} hover={hover} onHover={setHover} />

          <Verdict journey={journey} result={shown} kbRevision={kbRevision} />

          <Card className="space-y-3 p-3">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
              what if
            </h2>
            <label className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-neutral-500">
                budget{" "}
                {budget === 0
                  ? `journey's own (${journey.budget ? money(journey.budget) : "none"})`
                  : money(budget)}
              </span>
              <input
                type="range"
                min={0}
                max={300}
                step={10}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="flex-1"
              />
            </label>

            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(journey.truth.answers).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate font-mono text-[10px] text-neutral-400">
                    {key}
                  </span>
                  <input
                    className="h-7 flex-1 rounded-sm border border-neutral-200 px-2 font-mono text-[11px]"
                    value={flips[key] ?? value}
                    onChange={(e) =>
                      setFlips({ ...flips, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              {Object.entries(journey.truth.labs).map(([code, value]) => (
                <label key={code} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate font-mono text-[10px] text-neutral-400">
                    {code}
                  </span>
                  <input
                    type="number"
                    className="h-7 flex-1 rounded-sm border border-neutral-200 px-2 font-mono text-[11px]"
                    value={labFlips[code] ?? value}
                    onChange={(e) =>
                      setLabFlips({
                        ...labFlips,
                        [code]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <Button
              variant="outline-subtle"
              size="sm"
              disabled={busy !== ""}
              onClick={() => void run(false, true)}
            >
              Re-run with these
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
