"use client";

/**
 * The bubbles stage and its side panel, as `docs/mockups/brain-bubbles.html`
 * draws them. The server computed every number and every position
 * (`lib/bubbles.ts`), so this file only draws, pans, zooms and selects.
 *
 * ponytail: no d3 and no layout here. Pan and pinch are three pointer handlers
 * over one `viewBox`, which is also what makes fit-to-view a one-liner.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import type {
  Bubble,
  BubbleGraph,
  BubbleKind,
  BubbleLink,
  BubbleState,
} from "@/lib/bubbles";
import type { Relation } from "@/lib/graph";
import { AskBox } from "./ask-box";
import { AskLink } from "./ask-link";

/** The mockup's palette, verbatim, except that grey follows the theme. */
const FILL: Record<BubbleState, string> = {
  high: "#dc2626",
  amber: "#d97706",
  ok: "#15803d",
  yes: "#d97706",
  gene: "#0369a1",
  unknown: "var(--color-neutral-200)",
  faint: "var(--color-neutral-150)",
};

/** The outline says what kind of thing the bubble is. */
const STROKE: Record<BubbleKind, string> = {
  marker: "var(--color-neutral-900)",
  cond: "#fb923c",
  life: "#f472b6",
  gene: "#38bdf8",
  /** worth testing: a thing to do, not a thing you have */
  test: "#7c3aed",
};

/** The line colour says what the edge claims. */
const LINK_COLOR: Record<Relation, string> = {
  raises: "var(--color-health-critical)",
  worsens: "var(--color-health-critical)",
  lowers: "var(--color-health-normal)",
  treats: "var(--color-health-normal)",
  indicates: "var(--color-accent-500)",
  confounds: "var(--color-neutral-400)",
  requires_test: "var(--color-neutral-400)",
  modifies_target: "var(--color-neutral-400)",
};

/** Solid established, dashed probable, dotted speculative. */
const DASH: Record<BubbleLink["confidence"], string | undefined> = {
  established: undefined,
  probable: "6 4",
  speculative: "2 4",
};

const CHIP =
  "inline-flex items-center border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.05em]";
const LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400";

const pct = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)}%` : `${(p * 100).toPrecision(2)}%`;

const ARROW: Record<string, string> = {
  raises: "▲",
  worsens: "▲",
  lowers: "▼",
  treats: "▼",
  indicates: "→",
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How far a finger may travel and still count as a tap, in px of screen. The
 * pan starts past it; the selection happens under it.
 */
const TAP = 6;

const parse = (viewBox: string): Box => {
  const [x, y, w, h] = viewBox.split(" ").map(Number);
  return { x: x ?? 0, y: y ?? 0, w: w ?? 1200, h: h ?? 780 };
};

export function Bubbles({
  graph,
  viewBox,
  ruledOutHref,
  showRuledOut,
}: {
  graph: BubbleGraph;
  viewBox: string;
  ruledOutHref: string;
  showRuledOut: boolean;
}) {
  const [box, setBox] = useState<Box>(() => parse(viewBox));
  const [selected, setSelected] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const moved = useRef(0);
  /** the bubble the finger went down on, or null for empty stage */
  const down = useRef<string | null>(null);

  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  const neighbours = new Set<string>();
  if (selected) {
    neighbours.add(selected);
    for (const l of graph.links) {
      if (l.from === selected) neighbours.add(l.to);
      if (l.to === selected) neighbours.add(l.from);
    }
  }

  /** One pixel of the stage, in user units. */
  const perPixel = () => {
    const rect = svg.current?.getBoundingClientRect();
    return rect?.width ? box.w / rect.width : 1;
  };

  const zoom = (factor: number, cx: number, cy: number) => {
    setBox((b) => {
      const w = Math.min(Math.max(b.w * factor, 240), 6000);
      const k = w / b.w;
      return { x: cx - (cx - b.x) * k, y: cy - (cy - b.y) * k, w, h: b.h * k };
    });
  };

  const point = (e: { clientX: number; clientY: number }) => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: box.x + ((e.clientX - rect.left) / rect.width) * box.w,
      y: box.y + ((e.clientY - rect.top) / rect.height) * box.h,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    /**
     * The tap target is read here and nowhere else. `setPointerCapture` sends
     * every later pointer event — and the click the browser synthesises — to
     * the `<svg>`, so a handler on the circle never runs. Reading
     * `event.target` on the way down is what makes a bubble tappable at all.
     */
    down.current =
      (e.target as Element | null)
        ?.closest?.("[data-bubble]")
        ?.getAttribute("data-bubble") ?? null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
    svg.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const was = pointers.current.get(e.pointerId);
    if (!was) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const now = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch.current > 0 && now > 0) {
        const mid = point({
          clientX: (a!.x + b!.x) / 2,
          clientY: (a!.y + b!.y) / 2,
        });
        zoom(pinch.current / now, mid.x, mid.y);
      }
      pinch.current = now;
      moved.current = 99;
      return;
    }

    const dx = e.clientX - was.x;
    const dy = e.clientY - was.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    // A tap wobbles. Nothing pans until the finger has really travelled, so
    // "everything moves with it" stops happening to somebody trying to select.
    if (moved.current <= TAP) return;
    const scale = perPixel();
    setBox((b) => ({ ...b, x: b.x - dx * scale, y: b.y - dy * scale }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = 0;
    if (moved.current > TAP) return;
    const hit = down.current;
    down.current = null;
    setSelected((s) => (hit == null ? null : s === hit ? null : hit));
  };

  const node = selected ? at.get(selected) : null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="card relative h-[60vh] min-h-[380px] min-w-0 overflow-hidden lg:h-[calc(100vh-15rem)]">
        <svg
          ref={svg}
          className="block h-full w-full touch-none select-none"
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => {
            const p = point(e);
            zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
          }}
        >
          <g>
            {graph.links.map((link) => {
              const a = at.get(link.from);
              const b = at.get(link.to);
              if (!a || !b) return null;
              const dim =
                selected && !(link.from === selected || link.to === selected);
              const dr = Math.hypot(b.x - a.x, b.y - a.y) * 1.6;
              return (
                <path
                  key={link.id}
                  d={`M${a.x},${a.y}A${dr},${dr} 0 0,1 ${b.x},${b.y}`}
                  fill="none"
                  stroke={LINK_COLOR[link.relation]}
                  strokeWidth={
                    link.grade === "A" ? 2.2 : link.grade === "B" ? 1.6 : 1
                  }
                  strokeDasharray={DASH[link.confidence]}
                  opacity={
                    dim
                      ? 0.08
                      : link.on === false
                        ? 0.2
                        : link.on === null
                          ? 0.35
                          : 1
                  }
                >
                  <title>{`${link.mechanism}${link.why ? ` — ${link.why}` : ""}`}</title>
                </path>
              );
            })}
          </g>
          {/* circles first, then every label, so no bubble covers a name */}
          <g>
            {graph.nodes.map((n) => {
              const dim = selected != null && !neighbours.has(n.id);
              return (
                <circle
                  key={n.id}
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill={FILL[n.st]}
                  fillOpacity={
                    n.st === "unknown" ? 0.7 : n.st === "faint" ? 0.5 : 0.92
                  }
                  stroke={STROKE[n.kind]}
                  strokeWidth={n.kind === "cond" ? 3 : 2}
                  opacity={dim ? 0.25 : 1}
                  className="cursor-pointer"
                  data-bubble={n.id}
                >
                  <title>{`${n.name}${n.value ? ` · ${n.value}` : ""}`}</title>
                </circle>
              );
            })}
          </g>
          <g>
            {graph.nodes.map((n) => {
              const dim = selected != null && !neighbours.has(n.id);
              return (
                <text
                  key={n.id}
                  data-bubble={n.id}
                  className="cursor-pointer"
                  x={n.x}
                  y={n.y + (n.imp > 0.55 ? 5 : n.r + 18)}
                  textAnchor="middle"
                  fontSize={n.imp > 0.5 ? 15 : 12}
                  fontWeight={n.imp > 0.5 ? 600 : 400}
                  fill="var(--color-neutral-900)"
                  stroke="var(--color-card)"
                  strokeWidth={4}
                  paintOrder="stroke"
                  opacity={dim ? 0.3 : 1}
                >
                  {n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}
                </text>
              );
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[78%] flex-wrap gap-x-3 gap-y-1 font-body text-[11px] text-neutral-500">
          <Swatch fill="#dc2626" label="off" />
          <Swatch fill="#d97706" label="borderline" />
          <Swatch fill="#15803d" label="optimal" />
          <Swatch
            fill="var(--color-neutral-200)"
            border="var(--color-neutral-400)"
            label="not measured"
          />
          <Swatch fill="#0369a1" label="your genotype" />
          <span>
            · outline:{" "}
            <span style={{ color: "var(--color-neutral-900)" }}>marker</span>,{" "}
            <span style={{ color: "#fb923c" }}>condition</span>,{" "}
            <span style={{ color: "#f472b6" }}>lifestyle</span>,{" "}
            <span style={{ color: "#38bdf8" }}>gene</span>,{" "}
            <span style={{ color: "#7c3aed" }}>worth testing</span>
          </span>
          <span className="hidden sm:inline">
            · condition size = belief × lens; test size = how much it would
            settle
          </span>
          <span className="hidden sm:inline">
            · line: solid established, dashed probable, dotted speculative;
            faint = not for you
          </span>
        </div>

        <div className="absolute bottom-2 left-3 right-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.05em] text-neutral-400">
          <span className="truncate">{graph.hint}</span>
          <button
            onClick={() => setBox(parse(viewBox))}
            className="ml-auto inline-flex h-10 cursor-pointer items-center border border-neutral-200 bg-card px-3 transition-[color,border-color,scale] duration-150 ease-out hover:text-neutral-700 active:scale-[0.96]"
          >
            Fit
          </button>
        </div>
      </div>

      <aside className="space-y-3 lg:max-h-[calc(100vh-15rem)] lg:overflow-auto">
        {node ? (
          <Detail
            node={node}
            graph={graph}
            at={at}
            onBack={() => setSelected(null)}
          />
        ) : (
          <Overview
            graph={graph}
            ruledOutHref={ruledOutHref}
            showRuledOut={showRuledOut}
          />
        )}
      </aside>
    </div>
  );
}

function Swatch({
  fill,
  border,
  label,
}: {
  fill: string;
  border?: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <i
        className="inline-block size-2.5 rounded-full"
        style={{
          background: fill,
          border: border ? `1px solid ${border}` : undefined,
        }}
      />
      {label}
    </span>
  );
}

function Overview({
  graph,
  ruledOutHref,
  showRuledOut,
}: {
  graph: BubbleGraph;
  ruledOutHref: string;
  showRuledOut: boolean;
}) {
  // One entry per question key with every delta it carries, not one per
  // condition: the waist question used to fill this panel three times.
  const questions = graph.asks.slice(0, 4);
  return (
    <>
      <div className="card p-3">
        <AskBox compact />
      </div>

      <div className="card p-4">
        <div className={LABEL}>Conditions, ranked for you</div>
        <div className="mt-1 divide-y divide-neutral-100">
          {graph.beliefs.length === 0 && (
            <p className="py-2 font-body text-[13px] text-neutral-500">
              Nothing is on the table. Upload a lab result or answer a question
              and this fills in.
            </p>
          )}
          {graph.beliefs.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span
                className="min-w-0 flex-1 truncate font-body text-[13px]"
                title={b.title}
              >
                {b.name}
              </span>
              <span className="font-display text-[20px] font-light tabular-nums">
                {pct(b.p)}
              </span>
              {b.risk ? (
                <span
                  className={`${CHIP} border-[var(--color-health-warning-border)] text-[var(--color-health-warning)]`}
                >
                  risk
                </span>
              ) : (
                <StateChip state={b.state} />
              )}
            </div>
          ))}
        </div>
        {graph.ruledOut > 0 && (
          <Link
            href={ruledOutHref}
            className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400 hover:text-neutral-700"
          >
            {showRuledOut
              ? "hide ruled out"
              : `show ruled out (${graph.ruledOut})`}
          </Link>
        )}
      </div>

      {questions.length > 0 && (
        <div className="card p-4">
          <div className={LABEL}>Questions that change the picture</div>
          {questions.map((q) => (
            <AskLink key={q.key} ask={q} />
          ))}
        </div>
      )}
    </>
  );
}

function StateChip({ state }: { state: string }) {
  const tone =
    state === "confirmed" || state === "likely"
      ? "border-[var(--color-health-critical-border)] text-[var(--color-health-critical)]"
      : state === "possible"
        ? "border-[var(--color-health-warning-border)] text-[var(--color-health-warning)]"
        : "border-neutral-200 text-neutral-500";
  return <span className={`${CHIP} ${tone}`}>{state.replace("_", " ")}</span>;
}

function EdgeRow({
  link,
  other,
}: {
  link: BubbleLink;
  other: Bubble | undefined;
}) {
  return (
    <div
      className={`border-t border-neutral-100 py-2 ${link.on === false ? "opacity-45" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-body text-[13px]">
          {ARROW[link.relation] ?? "≈"} <b>{other?.name ?? link.to}</b>{" "}
          <span className="font-mono text-[10px] uppercase text-neutral-400">
            {link.relation.replace("_", " ")}
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          <span className={`${CHIP} border-neutral-200 text-neutral-500`}>
            {link.confidence}
          </span>
          <span className={`${CHIP} border-neutral-200 text-neutral-500`}>
            {link.grade}
          </span>
        </span>
      </div>
      <p className="mt-1 font-body text-[12px] text-neutral-500">
        {link.mechanism}
      </p>
      {link.why && (
        <p
          className="mt-0.5 font-mono text-[11px]"
          style={{
            color:
              link.on === false
                ? "var(--color-neutral-400)"
                : link.on === null
                  ? "var(--color-health-warning)"
                  : "var(--color-health-normal)",
          }}
        >
          {link.on === false
            ? `not for you: ${link.why}`
            : link.on === null
              ? `unknown: ${link.why}`
              : `for you: ${link.why}`}
        </p>
      )}
    </div>
  );
}

function Detail({
  node,
  graph,
  at,
  onBack,
}: {
  node: Bubble;
  graph: BubbleGraph;
  at: Map<string, Bubble>;
  onBack: () => void;
}) {
  const incoming = graph.links.filter((l) => l.to === node.id);
  const outgoing = graph.links.filter((l) => l.from === node.id);
  const belief = graph.beliefs.find((b) => b.id === node.belief);

  return (
    <>
      <button
        onClick={onBack}
        className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400 hover:text-neutral-700"
      >
        ← everything
      </button>
      <div>
        <h2 className="font-display text-[20px] font-medium tracking-[-0.02em]">
          {node.name}
        </h2>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className={`${CHIP} border-neutral-200 text-neutral-500`}>
            {node.kind}
          </span>
          {node.value && (
            <span className={`${CHIP} border-neutral-200 text-neutral-700`}>
              {node.value}
            </span>
          )}
          {node.answer && (
            <span className={`${CHIP} border-neutral-200 text-neutral-700`}>
              {node.answer}
            </span>
          )}
          {!node.value && !node.answer && !belief && (
            <span className={`${CHIP} border-neutral-200 text-neutral-400`}>
              not measured
            </span>
          )}
        </div>
        {node.what && (
          <p className="mt-2 font-body text-[13px] text-neutral-600">
            {node.what}
          </p>
        )}
        {node.code && (
          <Link
            href={`/m/${node.code}`}
            className="mt-1 inline-block font-mono text-[11px] text-neutral-400 hover:text-neutral-700"
          >
            open {node.code} →
          </Link>
        )}
      </div>

      {belief && (
        <div className="card p-4">
          <div className="font-display text-[38px] font-light leading-none tracking-[-0.04em] tabular-nums">
            {pct(belief.p)}
            <span className="ml-2 align-middle font-body text-[13px] text-neutral-500">
              for you
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {belief.risk ? (
              <span
                className={`${CHIP} border-[var(--color-health-warning-border)] text-[var(--color-health-warning)]`}
              >
                risk
              </span>
            ) : (
              <StateChip state={belief.state} />
            )}
            <span className="font-body text-[13px] text-neutral-600">
              {belief.title}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
              lens weight {belief.weight}
            </span>
          </div>

          {belief.for.length > 0 && (
            <>
              <div className={`${LABEL} mt-3`}>Why</div>
              <ul className="mt-1 space-y-1">
                {belief.for.map((f) => (
                  <li key={f.rule} className="font-body text-[12px]">
                    {f.text}
                    <span className="ml-1 font-mono text-[11px] text-neutral-400">
                      LR {f.lr} · {f.grade}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {belief.against.length > 0 && (
            <>
              <div className={`${LABEL} mt-3`}>Against</div>
              <ul className="mt-1 space-y-1">
                {belief.against.map((f) => (
                  <li
                    key={f.rule}
                    className="font-body text-[12px] text-neutral-500"
                  >
                    {f.text}
                    <span className="ml-1 font-mono text-[11px] text-neutral-400">
                      LR {f.lr} · {f.grade}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {belief.moves.length > 0 && (
            <>
              <div className={`${LABEL} mt-3`}>What would move it</div>
              <ul className="mt-1 space-y-1">
                {belief.moves.map((m) => (
                  <li key={m.label} className="font-body text-[12px]">
                    <span className="font-mono text-[10px] uppercase text-neutral-400">
                      {m.kind}
                      {m.cost > 0
                        ? ` · ${m.priced ? `€${m.cost}` : `cost ${m.cost}`}`
                        : " · free"}
                    </span>{" "}
                    {m.label}
                    <span className="ml-1 font-mono text-[11px] tabular-nums text-neutral-400">
                      {pct(m.from)} → {pct(m.to)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {belief.missing.length > 0 && (
            <p className="mt-3 font-mono text-[11px] text-neutral-400">
              waiting on: {belief.missing.join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="card p-4">
        <div className={LABEL}>What pushes this</div>
        {incoming.length ? (
          incoming.map((l) => (
            <EdgeRow key={l.id} link={l} other={at.get(l.from)} />
          ))
        ) : (
          <p className="mt-1 font-body text-[12px] text-neutral-400">
            Nothing drawn here pushes it.
          </p>
        )}
      </div>

      <div className="card p-4">
        <div className={LABEL}>What this affects</div>
        {outgoing.length ? (
          outgoing.map((l) => (
            <EdgeRow key={l.id} link={l} other={at.get(l.to)} />
          ))
        ) : (
          <p className="mt-1 font-body text-[12px] text-neutral-400">
            Nothing drawn here follows from it.
          </p>
        )}
      </div>
    </>
  );
}
