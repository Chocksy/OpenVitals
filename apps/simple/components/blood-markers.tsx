"use client";

/**
 * The Markers tab of Blood: fifty-two markers with a value, grouped by
 * system, filtered by one field and one tab row, and no pagination —
 * `docs/mockups/v4/blood.html` section 03.
 *
 * Every row carries its own range scale, so a bar is readable without opening
 * the marker: the ruler is the same component the marker page draws, at row
 * size. The whole row is the link; there is no chevron and no second target.
 *
 * On a screen wide enough for it the row opens the marker in the `Drawer`
 * instead of navigating — the ruler on top, the history at drawer size, and
 * the retest. On the phone it navigates to `/blood/m/[code]`, which is the
 * same content at one column.
 *
 * Phase 40c (`55-corridors.html`): above the groups sit the hunches (Worth a
 * look, Good news) and the markers outside your own band, each with 55's
 * mini corridor. The search narrows those rows too; the tab row only
 * filters the groups, because it filters by the lab's range, and a marker
 * can be inside the lab's range and outside your own.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { HunchRow } from "@/lib/api-contract";
import type { MarkerLane } from "@/lib/home-hybrid";
import type { Status } from "@/lib/status";
import { dayLabel, fmtCategory, plural } from "@/lib/utils";
import { MiniCorridor } from "./corridor";
import { Drawer } from "./drawer";
import { HistoryChart } from "./history-chart";
import { HunchBoard, HunchShelf } from "./hunch-board";
import { PillTabs } from "./pill-tabs";
import { Ruler, digits } from "./ruler";
import { StateWord, type StateTone } from "./ui-kit";

export interface MarkerRow {
  code: string;
  name: string;
  category: string;
  unit: string | null;
  value: number | null;
  valueText: string | null;
  observedAt: string;
  phone: boolean;
  derived: boolean;
  status: Status;
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  prev: number | null;
  prevDate: string | null;
  spark: number[];
  points: { date: string; value: number }[];
  draws: number;
  goalLow: number | null;
  goalHigh: number | null;
  goalDue: string | null;
  /** phase 40c: 55's mini corridor and status word; null with no lab draw */
  lane?: MarkerLane | null;
}

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
  gray: "no band",
};

/** A number with no band is not the same thing as no number at all. */
const wordFor = (m: MarkerRow): string =>
  m.status !== "gray"
    ? WORD[m.status]
    : m.value == null && !m.valueText
      ? "never measured"
      : "no band";

/** "vital_sign" -> "Vital sign": a system is a name, so it starts with one. */
const systemName = (c: string) => {
  const t = fmtCategory(c);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Filter = "off" | "border" | "on" | "all";

const MATCH: Record<Filter, (s: Status) => boolean> = {
  off: (s) => s === "red",
  border: (s) => s === "amber",
  on: (s) => s === "green",
  all: () => true,
};

/** The 96 px line under a row's name: the last eight values, no axis. */
function Spark({ data }: { data: number[] }) {
  if (data.length < 2)
    return <span className="t-meta text-[11px]">one draw</span>;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((v, i) => {
    const x = 2 + (i / (data.length - 1)) * 92;
    const y = 3 + (1 - (v - lo) / span) * 20;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [ex, ey] = pts[pts.length - 1]!.split(",");
  return (
    <svg className="spark" viewBox="0 0 96 26" aria-hidden="true">
      <polyline points={pts.join(" ")} />
      <rect
        className="end"
        x={Number(ex) - 2.5}
        y={Number(ey) - 2.5}
        width="5"
        height="5"
      />
    </svg>
  );
}

/** "lab · Aug 1 2026 · was 412 on Dec 9" — where the number came from. */
const provenance = (m: MarkerRow): string =>
  [
    m.derived ? "derived" : m.phone ? "phone" : "lab",
    dayLabel(m.observedAt, true),
    m.prev != null && m.prevDate
      ? `was ${digits(m.prev)} on ${dayLabel(m.prevDate, true)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

export function BloodMarkers({
  rows,
  hunches,
  initialHunch,
}: {
  rows: MarkerRow[];
  /** phase 40c: the shelves above the list (`hunchesBody`) */
  hunches?: { open: HunchRow[]; goodNews: HunchRow[] };
  /** `?hunch=<id>`: open that case on load */
  initialHunch?: string | null;
}) {
  const [query, setQuery] = useState("");
  /* The mockup opens on "Off": the seven markers that are off are the reason
     to be on this page. With nothing off it opens on the whole list, and
     either way the selected tab is the row's first, so the tab row starts at
     its own left edge on a 390 px screen instead of scrolling "Off" away. */
  const [filter, setFilter] = useState<Filter>(
    rows.some((r) => r.status === "red") ? "off" : "all",
  );
  const [open, setOpen] = useState<MarkerRow | null>(null);

  const counts = useMemo(
    () => ({
      off: rows.filter((r) => r.status === "red").length,
      border: rows.filter((r) => r.status === "amber").length,
      on: rows.filter((r) => r.status === "green").length,
      all: rows.length,
    }),
    [rows],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, MarkerRow[]>();
    for (const r of rows) {
      if (!MATCH[filter](r.status)) continue;
      if (q && !r.name.toLowerCase().includes(q) && !r.code.includes(q))
        continue;
      map.set(r.category, [...(map.get(r.category) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows, query, filter]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  /* 55's "outside your band on top": the rows whose last draw left the own
     band, or sits past an open goal, farthest first. */
  const outside = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => r.lane?.outside)
      .filter(
        (r) => !q || r.name.toLowerCase().includes(q) || r.code.includes(q),
      )
      .sort((a, b) => b.lane!.rank - a.lane!.rank);
  }, [rows, query]);

  /** Wide enough for a drawer, and the browser has one: open it in place. */
  const openDrawer = (e: React.MouseEvent, m: MarkerRow) => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    e.preventDefault();
    setOpen(m);
  };
  const close = () => setOpen(null);
  const worth = hunches?.open ?? [];
  const good = hunches?.goodNews ?? [];

  return (
    <HunchBoard initial={initialHunch}>
      {worth.length > 0 && (
        <section className="bm-shelf">
          <header>
            <h2>
              Worth a look <small>tap a row to open it</small>
            </h2>
          </header>
          <HunchShelf rows={worth} />
        </section>
      )}
      {good.length > 0 && (
        <section className="bm-shelf">
          <header>
            <h2>Good news</h2>
          </header>
          <HunchShelf rows={good} />
        </section>
      )}
      {outside.length > 0 && (
        <section className="bm-shelf">
          <header>
            <h2>
              Outside your band <small>farthest on top</small>
            </h2>
          </header>
          <div className="bm-list">
            {outside.map((m) => (
              <Link
                key={m.code}
                href={`/blood/m/${m.code}`}
                className="bm-row bm-m"
                onClick={(e) => openDrawer(e, m)}
              >
                <span className="nm">
                  <b>{m.name}</b>
                  <small>{m.unit}</small>
                </span>
                <MiniCorridor
                  band={m.lane!.mini.band}
                  lab={m.lane!.mini.lab}
                  last={m.lane!.mini.last}
                  prev={m.lane!.mini.prev}
                  goal={m.lane!.mini.goal}
                  tone={m.lane!.tone}
                />
                <span
                  className="val"
                  style={{ "--c": m.lane!.tone } as React.CSSProperties}
                >
                  <b>{digits(m.lane!.mini.last)}</b>
                  <small>{m.lane!.word}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="panel">
        <div className="rowh mb-[var(--s13)]">
          <div className="searchbox min-w-[220px] flex-1">
            <Search className="ic" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ferritin, TSH, LDL…"
              aria-label="Search markers"
            />
          </div>
          <PillTabs
            label="Which markers"
            active={filter}
            onSelect={(id) => setFilter(id as Filter)}
            tabs={[
              { id: "off", label: `Off ${counts.off}` },
              { id: "border", label: `Borderline ${counts.border}` },
              { id: "on", label: `Optimal ${counts.on}` },
              { id: "all", label: `All ${counts.all}` },
            ]}
          />
        </div>

        {groups.length === 0 && (
          <p className="never">
            {query
              ? `Nothing matches “${query}”.`
              : "No marker in this group has a value."}
          </p>
        )}

        {groups.map(([category, list]) => (
          <section key={category}>
            <div className="sub">
              <h3>{systemName(category)}</h3>
              <span>
                {list.length} of {shown} shown
              </span>
            </div>
            <div className="rowlist">
              {list.map((m) => (
                <Link
                  key={m.code}
                  href={`/blood/m/${m.code}`}
                  className="markerrow mk"
                  onClick={(e) => openDrawer(e, m)}
                >
                  <div className="nm">
                    <b>{m.name}</b>
                    <span>{provenance(m)}</span>
                  </div>
                  <Spark data={m.spark} />
                  <div className="val">
                    {m.value != null ? digits(m.value) : (m.valueText ?? "—")}
                    {m.unit && <em>{m.unit}</em>}
                  </div>
                  <div className="wd">
                    <StateWord
                      tone={TONE[m.status]}
                      dot
                      tri={m.status === "red"}
                    >
                      {wordFor(m)}
                    </StateWord>
                  </div>
                  <div className="bar">
                    <Ruler
                      size="row"
                      value={m.value}
                      prev={m.prev}
                      prevDate={m.prevDate}
                      refLow={m.refLow}
                      refHigh={m.refHigh}
                      optimalLow={m.optimalLow}
                      optimalHigh={m.optimalHigh}
                      target={m.goalLow ?? m.goalHigh}
                      targetLow={m.goalLow}
                      targetHigh={m.goalHigh}
                      targetDate={m.goalDue}
                      unit={m.unit}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <Drawer
          open={open != null}
          onClose={close}
          label={open?.name ?? "Marker"}
          className="bm-drawer"
          head={
            open ? (
              <h3>
                {open.name}{" "}
                <span className="src">
                  · {systemName(open.category)} ·{" "}
                  {dayLabel(open.observedAt, true)}
                </span>
              </h3>
            ) : null
          }
        >
          {open && (
            <>
              <div className="sheet-body">
                <div className="kpi">
                  <div>
                    <b>
                      {open.value != null
                        ? digits(open.value)
                        : (open.valueText ?? "—")}
                    </b>
                    <span>
                      {open.unit ? `${open.unit} · ` : ""}
                      {dayLabel(open.observedAt, true)}
                    </span>
                  </div>
                  {open.prev != null && open.value != null && (
                    <div>
                      <b>
                        {open.value - open.prev > 0 ? "+" : ""}
                        {digits(
                          Math.round((open.value - open.prev) * 100) / 100,
                        )}
                      </b>
                      <span>
                        since{" "}
                        {open.prevDate
                          ? dayLabel(open.prevDate, true)
                          : "the draw before"}
                      </span>
                    </div>
                  )}
                  <div>
                    <b>{open.draws}</b>
                    <span>
                      {open.draws === 1 ? "reading" : "readings"} on file
                    </span>
                  </div>
                </div>

                <Ruler
                  value={open.value}
                  prev={open.prev}
                  prevDate={open.prevDate}
                  refLow={open.refLow}
                  refHigh={open.refHigh}
                  optimalLow={open.optimalLow}
                  optimalHigh={open.optimalHigh}
                  target={open.goalLow ?? open.goalHigh}
                  targetLow={open.goalLow}
                  targetHigh={open.goalHigh}
                  targetDate={open.goalDue}
                  unit={open.unit}
                />

                <HistoryChart
                  mini
                  title="History"
                  unit={open.unit}
                  points={open.points}
                  refLow={open.refLow}
                  refHigh={open.refHigh}
                  optimalLow={open.optimalLow}
                  optimalHigh={open.optimalHigh}
                  target={open.goalLow ?? open.goalHigh}
                  targetLow={open.goalLow}
                  targetHigh={open.goalHigh}
                  targetDate={open.goalDue}
                  noun={open.phone ? "readings" : "draws"}
                />

                <div>
                  <div className="panel-head">
                    <h3>Retest</h3>
                    <span className="r">
                      {open.goalDue
                        ? dayLabel(open.goalDue, true)
                        : "not planned"}
                    </span>
                  </div>
                  <p className="t-body">
                    {open.goalDue
                      ? `Planned for ${dayLabel(open.goalDue, true)}. Last drawn ${dayLabel(open.observedAt, true)}.`
                      : `Last drawn ${dayLabel(open.observedAt, true)}. Nothing is planned for it yet.`}
                  </p>
                </div>
              </div>
              <div className="sheet-foot">
                <Link
                  className="b b-ink b-sm"
                  href={`/blood/m/${open.code}`}
                  onClick={close}
                >
                  Open the marker
                </Link>
                <Link
                  className="b b-quiet b-sm"
                  href="/blood/plan"
                  onClick={close}
                >
                  Plan a draw
                </Link>
              </div>
            </>
          )}
        </Drawer>
      </div>
    </HunchBoard>
  );
}
