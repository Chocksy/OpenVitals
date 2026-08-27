"use client";

/**
 * The arcs over the system grid. The tiles are server-rendered and passed in as
 * children; this component only measures them and draws one SVG on top.
 *
 * ponytail: no layout engine and no 3D. A fixed 4x3 grid plus
 * `getBoundingClientRect` is the whole geometry, so the arcs land wherever CSS
 * put the tiles, at any width.
 */
import { useEffect, useRef, useState } from "react";

export interface SystemLink {
  /** System ids, which are also the `data-system` attributes on the tiles. */
  from: string;
  to: string;
  /** bad = raises/worsens/confounds, good = lowers/treats/indicates. */
  tone: "bad" | "good" | "neutral";
  confidence: "established" | "probable" | "speculative";
  strength: number;
  /** Hover text: the mechanism sentence. */
  title: string;
}

const STROKE: Record<SystemLink["tone"], string> = {
  bad: "var(--color-health-critical)",
  good: "var(--color-health-normal)",
  neutral: "var(--color-neutral-400)",
};

const DASH: Record<SystemLink["confidence"], string | undefined> = {
  established: undefined,
  probable: "6 4",
  speculative: "1 5",
};

interface Spot {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

/** Where the line leaves a tile: its border, in the direction of the target. */
function border(spot: Spot, dx: number, dy: number) {
  const sx = dx === 0 ? Infinity : spot.halfW / Math.abs(dx);
  const sy = dy === 0 ? Infinity : spot.halfH / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: spot.x + dx * s, y: spot.y + dy * s };
}

export function SystemLinks({
  links,
  children,
}: {
  links: SystemLink[];
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [spots, setSpots] = useState<Record<string, Spot>>({});

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const next: Record<string, Spot> = {};
      for (const tile of el.querySelectorAll<HTMLElement>("[data-system]")) {
        const r = tile.getBoundingClientRect();
        next[tile.dataset.system!] = {
          x: r.left - base.left + r.width / 2,
          y: r.top - base.top + r.height / 2,
          halfW: r.width / 2 - 3,
          halfH: r.height / 2 - 3,
        };
      }
      setSize({ w: base.width, h: base.height });
      setSpots(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const tones = [...new Set(links.map((l) => l.tone))];

  return (
    <div ref={box} className="relative">
      {size.w > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 z-10"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <defs>
            {tones.map((tone) => (
              <marker
                key={tone}
                id={`arrow-${tone}`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0,1 L7,4 L0,7 z" fill={STROKE[tone]} />
              </marker>
            ))}
          </defs>
          {links.map((link) => {
            const a = spots[link.from];
            const b = spots[link.to];
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const start = border(a, dx, dy);
            const end = border(b, -dx, -dy);
            const length = Math.hypot(dx, dy) || 1;
            // A perpendicular bow, so a->b and b->a never sit on top of
            // each other.
            const bow = 0.1 * length;
            const cx = (start.x + end.x) / 2 + (-dy / length) * bow;
            const cy = (start.y + end.y) / 2 + (dx / length) * bow;
            return (
              <path
                key={`${link.from}-${link.to}-${link.tone}-${link.confidence}`}
                d={`M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`}
                fill="none"
                stroke={STROKE[link.tone]}
                strokeWidth={link.strength}
                strokeDasharray={DASH[link.confidence]}
                strokeOpacity={0.75}
                markerEnd={`url(#arrow-${link.tone})`}
              >
                <title>{link.title}</title>
              </path>
            );
          })}
        </svg>
      )}
      {children}
    </div>
  );
}
