"use client";

/**
 * The bubbles stage and its side panel, as `docs/mockups/v4/graph.html`
 * section 01 draws them. The server computed every number and every position
 * (`lib/bubbles.ts`), so this file only draws, pans, zooms and selects.
 *
 * ponytail: no d3 and no layout here. Pan and pinch are three pointer handlers
 * over one `viewBox`, which is also what makes fit-to-view a one-liner.
 *
 * Phase 30e took the colour out of the picture. A bubble is an outline on the
 * flat surface and its ring is the state; an edge is a hairline. The spectrum
 * is text, a ring or a dot, never a fill, so the old `FILL` / `STROKE` /
 * `LINK_COLOR` palettes and the swatch legend are gone: one `.stagenote`
 * sentence says what a ring and a size mean.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { askHref, effectLine } from "@/lib/asking";
import type {
  Bubble,
  BubbleGraph,
  BubbleLink,
  BubbleState,
} from "@/lib/bubbles";
import { AskBox } from "./ask-box";
import { StateWord, type StateTone } from "./ui-kit";

/** The ring is the state. `.bubbles circle.bb.<ring>` in `globals.css`. */
const RING: Record<BubbleState, StateTone> = {
  high: "off",
  amber: "border",
  ok: "on",
  yes: "border",
  gene: "none",
  unknown: "none",
  faint: "none",
};

/** The word the panel prints for a bubble that is not a scored condition. */
const STATE_WORD: Record<BubbleState, string> = {
  high: "off",
  amber: "borderline",
  ok: "optimal",
  yes: "yes",
  gene: "your genotype",
  unknown: "never measured",
  faint: "ruled out",
};

/** A ruled-out condition is still drawn, but quietly. */
const FAINT = 0.45;

const pct = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)}%` : `${(p * 100).toPrecision(2)}%`;

const pctNum = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)}` : `${(p * 100).toPrecision(2)}`;

const ARROW: Record<string, string> = {
  raises: "▲",
  worsens: "▲",
  lowers: "▼",
  treats: "▼",
  indicates: "→",
};

const CONFIDENCE_TONE: Record<string, StateTone> = {
  established: "on",
  probable: "none",
  speculative: "none",
};

/** One hot node, exactly the row `graph.hot` printed before. */
export interface HotRow {
  id: string;
  /** the node's own name, so a row never prints `metric:glucose` at a reader */
  name: string;
  importance: number;
  reasons: string[];
}

/** One active edge, exactly the row `graph.activeEdges` printed before. */
export interface ActiveRow {
  id: string;
  /** the two endpoints, named: "Fasting glucose → HbA1c" */
  name: string;
  confidence: string;
  mechanism: string;
  impact: number;
}

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
  hot,
  active,
}: {
  graph: BubbleGraph;
  viewBox: string;
  ruledOutHref: string;
  showRuledOut: boolean;
  hot: HotRow[];
  active: ActiveRow[];
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
  const beliefOf = new Map(graph.beliefs.map((b) => [b.id, b]));

  return (
    <div className="stagesplit">
      {/* `graph.html` section 03: on a phone the graph is a scroll, not a
          canvas. The stage goes; the same nodes are already stacked as the
          ranked rows in the panel below, with the panel under the one you
          tapped. Nothing is hidden, it is only drawn as a list. */}
      <div className="bubbles max-[900px]:hidden">
        <svg
          ref={svg}
          className="touch-none select-none"
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          role="img"
          aria-label={`${graph.nodes.length} nodes joined by ${graph.links.length} edges`}
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
              /* "hot" is an edge the panel would call strong: grade A, or a
                 confidence the graph calls established. The mockup draws two
                 of eight hot, and this is the rule that picks them. */
              const hotEdge =
                link.grade === "A" || link.confidence === "established";
              return (
                <path
                  key={link.id}
                  className={hotEdge ? "edge hot" : "edge"}
                  d={`M${a.x},${a.y}A${dr},${dr} 0 0,1 ${b.x},${b.y}`}
                  fill="none"
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
          <g>
            {graph.nodes.map((n) => {
              const dim = selected != null && !neighbours.has(n.id);
              const belief = n.belief ? beliefOf.get(n.belief) : undefined;
              /* Inside the bubble: the likelihood for a condition, the
                 reading's own number for a marker. Nothing decorative. */
              const inner = belief
                ? `${pctNum(belief.p)} %`
                : (n.value?.split(" ")[0] ?? "");
              return (
                <g
                  key={n.id}
                  data-bubble={n.id}
                  className="cursor-pointer"
                  opacity={dim ? 0.25 : n.st === "faint" ? FAINT : 1}
                >
                  <circle
                    className={`bb ${RING[n.st]}`}
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    data-bubble={n.id}
                  >
                    <title>{`${n.name}${n.value ? ` · ${n.value}` : ""}`}</title>
                  </circle>
                  {inner && (
                    <text className="bn" data-bubble={n.id} x={n.x} y={n.y + 4}>
                      {inner}
                    </text>
                  )}
                  {/* The server placed this, or found no free slot and left
                      it off; a name half over another name says less than no
                      name at all. The circle's `<title>` and the panel still
                      carry it either way. */}
                  {n.label && (
                    <text
                      className="bl"
                      data-bubble={n.id}
                      x={n.lx}
                      y={n.ly}
                      /* `.bubbles text.bl` sets `text-anchor: middle` in the
                         stylesheet, which beats the presentation attribute;
                         an inline style is what the server's slot needs. */
                      style={{ textAnchor: n.anchor }}
                      stroke="var(--surface-flat)"
                      strokeWidth={4}
                      paintOrder="stroke"
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="stagenote">
          <span>
            Ring: off · borderline · optimal · never measured. Size: how much it
            matters in this lens.
          </span>
          <span>{graph.hint}</span>
          <button
            type="button"
            className="b b-quiet b-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setBox(parse(viewBox))}
          >
            Fit
          </button>
        </div>
      </div>

      <div className="stackv">
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
            hot={hot}
            active={active}
            ruledOutHref={ruledOutHref}
            showRuledOut={showRuledOut}
          />
        )}
      </div>
    </div>
  );
}

/* ── no selection ─────────────────────────────────────────────────────── */

function Overview({
  graph,
  hot,
  active,
  ruledOutHref,
  showRuledOut,
}: {
  graph: BubbleGraph;
  hot: HotRow[];
  active: ActiveRow[];
  ruledOutHref: string;
  showRuledOut: boolean;
}) {
  const questions = graph.asks.slice(0, 4);
  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Ask about the graph</h3>
          <span className="r">the same field as everywhere</span>
        </div>
        <AskBox compact />
        {questions.length > 0 && (
          <div className="chips" style={{ marginTop: "var(--s13)" }}>
            {questions.map((q) => (
              <Link key={q.key} href={askHref(q.key)} className="chip quiet">
                <span>
                  {q.question}
                  {q.moves.length > 0 && (
                    <span className="t-meta block">
                      moves {effectLine(q.moves)}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Conditions, ranked for you</h3>
          <span className="r">{graph.beliefs.length}</span>
        </div>
        {graph.beliefs.length === 0 ? (
          <p className="t-body">
            Nothing is on the table. Upload a lab result or answer a question
            and this fills in.
          </p>
        ) : (
          <div className="rowlist">
            {graph.beliefs.map((b) => (
              <div key={b.id} className="markerrow said">
                <div className="nm">
                  <b>{b.name}</b>
                  {/* `graph.html` prints the markers behind the likelihood,
                      not the condition's essay: "HbA1c 5.6 %, no fasting
                      insulin". The evidence rows are that sentence. */}
                  <span>
                    {b.for.length
                      ? b.for
                          .slice(0, 2)
                          .map((f) => f.text)
                          .join(" · ")
                      : b.title}
                  </span>
                </div>
                <div className="t-meta" style={{ fontSize: 11 }}>
                  lens weight {b.weight}
                </div>
                <div className="val">
                  {pctNum(b.p)}
                  <em>%</em>
                </div>
                <div className="wd">
                  <StateWord tone={b.risk ? "border" : stateTone(b.state)}>
                    {b.risk ? "risk" : b.state.replace("_", " ")}
                  </StateWord>
                </div>
              </div>
            ))}
          </div>
        )}
        {graph.ruledOut > 0 && (
          <Link href={ruledOutHref} className="b b-text b-sm">
            {showRuledOut
              ? "Hide ruled out"
              : `Show ruled out (${graph.ruledOut})`}
          </Link>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Hot nodes</h3>
          <span className="r">{hot.length}</span>
        </div>
        {hot.length === 0 ? (
          <p className="t-body">
            Nothing is hot yet. Upload a lab result and this fills in.
          </p>
        ) : (
          <div className="rowlist">
            {hot.map((n) => (
              <div key={n.id} className="markerrow said">
                <div className="nm">
                  <b>{n.name}</b>
                  <span>{n.reasons.join("; ") || "no reason recorded"}</span>
                </div>
                <div />
                <div className="val">{n.importance.toFixed(2)}</div>
                <div className="wd">
                  <StateWord tone={n.importance >= 0.6 ? "off" : "border"}>
                    {n.importance >= 0.6 ? "leading" : "moving"}
                  </StateWord>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Active edges</h3>
          <span className="r">{active.length}</span>
        </div>
        {active.length === 0 ? (
          <p className="t-body">No edge is active for you.</p>
        ) : (
          <details className="disclose">
            <summary>Edges</summary>
            <div className="inner">
              <div className="rowlist">
                {active.map((e) => (
                  <div key={e.id} className="markerrow said">
                    <div className="nm">
                      <b>{e.name}</b>
                      <span>{e.mechanism}</span>
                    </div>
                    <div />
                    <div className="val">{e.impact}</div>
                    <div className="wd">
                      <StateWord tone={CONFIDENCE_TONE[e.confidence] ?? "none"}>
                        {e.confidence}
                      </StateWord>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </>
  );
}

/** The engine's own condition states, on the four spectrum words. */
function stateTone(state: string): StateTone {
  if (state === "confirmed" || state === "likely") return "off";
  if (state === "possible") return "border";
  return "none";
}

/* ── one node ─────────────────────────────────────────────────────────── */

function EdgeRow({
  link,
  other,
}: {
  link: BubbleLink;
  other: Bubble | undefined;
}) {
  return (
    <div
      className="markerrow said"
      style={link.on === false ? { opacity: 0.55 } : undefined}
    >
      <div className="nm">
        <b>
          {ARROW[link.relation] ?? "≈"} {other?.name ?? link.to}
        </b>
        <span>{link.relation.replace("_", " ")}</span>
      </div>
      <div className="t-meta" style={{ fontSize: 11 }}>
        {link.mechanism}
      </div>
      <div className="val">{link.grade}</div>
      <div className="wd">
        <StateWord tone={CONFIDENCE_TONE[link.confidence] ?? "none"}>
          {link.confidence}
        </StateWord>
      </div>
      {link.why && (
        <div className="bar t-meta">
          {link.on === false
            ? `not for you: ${link.why}`
            : link.on === null
              ? `unknown: ${link.why}`
              : `for you: ${link.why}`}
        </div>
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

  /** Every marker code the panel can open, from the evidence behind it. */
  const nameByCode = new Map<string, string>();
  for (const n of at.values()) if (n.code) nameByCode.set(n.code, n.name);
  const behind = [
    ...new Set([
      ...(node.code ? [node.code] : []),
      ...(belief?.for.map((f) => f.input) ?? []),
    ]),
  ];

  return (
    <>
      <button type="button" className="b b-text b-sm" onClick={onBack}>
        ← everything
      </button>

      <div className="panel hi">
        <div className="panel-head">
          <h3>{node.name}</h3>
          <StateWord
            tone={belief ? stateTone(belief.state) : RING[node.st]}
            tri={!belief && node.st === "high"}
          >
            {belief
              ? belief.risk
                ? "risk"
                : belief.state.replace("_", " ")
              : STATE_WORD[node.st]}
          </StateWord>
        </div>

        <div className="kpi">
          {belief ? (
            <>
              <div>
                <b>{pctNum(belief.p)}</b>
                <span>% for you</span>
              </div>
              <div>
                <b>{behind.length}</b>
                <span>markers behind it</span>
              </div>
              <div>
                <b>{belief.weight}</b>
                <span>lens weight</span>
              </div>
            </>
          ) : (
            <>
              {node.value && (
                <div>
                  <b>{node.value.split(" ")[0]}</b>
                  <span>
                    {node.value.split(" ").slice(1).join(" ") || node.kind}
                  </span>
                </div>
              )}
              <div>
                <b>{node.imp.toFixed(2)}</b>
                <span>weight in this lens</span>
              </div>
            </>
          )}
        </div>

        {belief && <p className="t-body mt-2">{belief.title}</p>}
        {node.answer && <p className="t-body mt-2">You said: {node.answer}</p>}
        {node.what && <p className="t-body mt-2">{node.what}</p>}
        {!node.value && !node.answer && !belief && (
          <p className="t-meta mt-2">Never measured.</p>
        )}

        {behind.length > 0 && (
          <div className="rowh mt-3">
            {behind.map((code) =>
              nameByCode.has(code) ? (
                <Link
                  key={code}
                  href={`/blood/m/${code}`}
                  className="b b-quiet b-sm"
                >
                  {nameByCode.get(code)}
                </Link>
              ) : (
                <span key={code} className="chip">
                  {code}
                </span>
              ),
            )}
          </div>
        )}
      </div>

      {belief && belief.for.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Why</h3>
            <span className="r">{belief.for.length}</span>
          </div>
          <div className="rowlist">
            {belief.for.map((f) => (
              <EvidenceRow key={f.rule} f={f} />
            ))}
          </div>
        </div>
      )}

      {belief && belief.against.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Against</h3>
            <span className="r">{belief.against.length}</span>
          </div>
          <div className="rowlist">
            {belief.against.map((f) => (
              <EvidenceRow key={f.rule} f={f} />
            ))}
          </div>
        </div>
      )}

      {belief && belief.moves.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>What would move it</h3>
            <span className="r">{belief.moves.length}</span>
          </div>
          <div className="rowlist">
            {belief.moves.map((m) => (
              <div key={m.label} className="markerrow said">
                <div className="nm">
                  <b>{m.label}</b>
                  <span>
                    {m.kind}
                    {m.cost > 0
                      ? ` · ${m.priced ? `€${m.cost}` : `cost band ${m.cost}`}`
                      : " · free"}
                  </span>
                </div>
                <div className="t-meta" style={{ fontSize: 11 }}>
                  {pct(m.from)} → {pct(m.to)}
                </div>
                <div className="val">
                  {pctNum(m.to)}
                  <em>%</em>
                </div>
                <div className="wd">
                  <StateWord tone="none">{m.kind}</StateWord>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {belief && belief.missing.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Waiting on</h3>
            <span className="r">{belief.missing.length}</span>
          </div>
          <p className="t-body">{belief.missing.join(", ")}</p>
        </div>
      )}

      {node.settles?.length ? (
        <div className="panel">
          <div className="panel-head">
            <h3>What this would settle</h3>
            <span className="r">
              {node.cost === 0
                ? "free"
                : node.priced
                  ? `€${node.cost}`
                  : `cost band ${node.cost}`}
            </span>
          </div>
          <div className="rowlist">
            {node.settles.map((row) => (
              <div key={row.id} className="markerrow said">
                <div className="nm">
                  <b>{row.name}</b>
                  <span>
                    {row.outcomes
                      .map((o) => `${pct(o.to)} if ${o.label}`)
                      .join(", ")}
                  </span>
                </div>
                <div />
                <div className="val">
                  {pctNum(row.from)}
                  <em>%</em>
                </div>
                <div className="wd">
                  <StateWord tone="none">now</StateWord>
                </div>
              </div>
            ))}
          </div>
          {node.howTo && <p className="t-body mt-2">{node.howTo}</p>}
        </div>
      ) : null}

      {incoming.length || !node.settles?.length ? (
        <div className="panel">
          <div className="panel-head">
            <h3>What pushes this</h3>
            <span className="r">{incoming.length}</span>
          </div>
          {incoming.length ? (
            <div className="rowlist">
              {incoming.map((l) => (
                <EdgeRow key={l.id} link={l} other={at.get(l.from)} />
              ))}
            </div>
          ) : (
            <p className="t-body">Nothing drawn here pushes it.</p>
          )}
        </div>
      ) : null}

      {outgoing.length || !node.settles?.length ? (
        <div className="panel">
          <div className="panel-head">
            <h3>What this affects</h3>
            <span className="r">{outgoing.length}</span>
          </div>
          {outgoing.length ? (
            <div className="rowlist">
              {outgoing.map((l) => (
                <EdgeRow key={l.id} link={l} other={at.get(l.to)} />
              ))}
            </div>
          ) : (
            <p className="t-body">Nothing drawn here follows from it.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

/** One line of evidence: the sentence, the input, its LR and its grade. */
function EvidenceRow({
  f,
}: {
  f: BubbleGraph["beliefs"][number]["for"][number];
}) {
  return (
    <div className="markerrow said">
      <div className="nm">
        <b>{f.text}</b>
        <span>{f.input}</span>
      </div>
      <div className="t-meta" style={{ fontSize: 11 }}>
        {f.value}
      </div>
      <div className="val">
        {f.lr}
        <em>LR</em>
      </div>
      <div className="wd">
        <StateWord tone="none">{f.grade}</StateWord>
      </div>
    </div>
  );
}
