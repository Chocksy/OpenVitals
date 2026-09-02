/**
 * The design system's own primitives, phase 30a. One button family with
 * three jobs, one add control, one state word. Everything else that used to
 * live here (eight `cva` button variants, seven `Badge` variants, `TierChip`,
 * `StatusBadge`) is gone: the spectrum is never a surface, so a filled badge
 * cannot exist, and eight variants for three jobs was the inventory's
 * loudest inconsistency.
 *
 * The classes are `app/globals.css`, copied from `docs/mockups/v4/system.css`
 * sections 04 (buttons), 06 (state words) and 07 (cards).
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/** ink is the one primary per screen; quiet is bordered; text has no box. */
export type ButtonJob = "ink" | "quiet" | "text";
export type ButtonSize = "md" | "sm" | "icon";

const JOB: Record<ButtonJob, string> = {
  ink: "b-ink",
  quiet: "b-quiet",
  text: "b-text",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  job?: ButtonJob;
  size?: ButtonSize;
  /** draws the button as working: it keeps its width and stops taking taps */
  busy?: boolean;
}

export function Button({
  className,
  job = "ink",
  size = "md",
  busy,
  ...props
}: ButtonProps) {
  return (
    <button
      data-busy={busy ? "true" : undefined}
      className={cn(
        "b",
        JOB[job],
        size === "sm" && "b-sm",
        size === "icon" && "b-icon",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The lime +. The one control in the app that puts data in, and there is one
 * of it per screen: the header on desktop, the middle of the tab bar on the
 * phone. Lime is never text and never state.
 */
export function AddButton({
  className,
  label = "Add data",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("plusbtn", className)}
      {...props}
    />
  );
}

/**
 * A state is a word in its colour: off is `--bad`, borderline `--warn`,
 * optimal `--ok`, never-measured `--ink-3`. No fill, no border, no uppercase
 * mono. The ▲ is the one extra mark and it only rides on `off`.
 */
export type StateTone = "off" | "border" | "on" | "none";

const HEALTH_TONE: Record<string, StateTone> = {
  critical: "off",
  red: "off",
  warning: "border",
  amber: "border",
  normal: "on",
  green: "on",
  info: "none",
  neutral: "none",
  gray: "none",
};

/** Maps the engine's own status words onto the four states. */
export const toneOf = (status?: string | null): StateTone =>
  (status && HEALTH_TONE[status]) || "none";

export function StateWord({
  tone = "none",
  dot,
  tri,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StateTone;
  /** a filled dot before the word; hollow when nothing was measured */
  dot?: boolean;
  /** the coral ▲, only ever on what is off */
  tri?: boolean;
}) {
  return (
    <span className={cn("state", tone, className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn("dot", tone === "none" && "hollow")}
        />
      )}
      {children}
      {tri && tone === "off" && (
        <span aria-hidden="true" className="tri">
          ▲
        </span>
      )}
    </span>
  );
}

/** How settled the thing behind an action is, as a word, not a chip. */
export function Tier({ tier }: { tier?: string | null }) {
  if (!tier) return null;
  return <span className={cn("tier", tier)}>{tier}</span>;
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

/**
 * The tick a button wears the moment a write lands: fade, rotate upright,
 * settle with a Y-bob, and draw the stroke (`10-success-check.md`). The
 * dasharray in `globals.css` is 21, which is `M5 13l4 4L19 7`'s own length
 * (19.8) rounded up by one, so the stroke neither pre-reveals nor overdraws.
 */
export function SuccessCheck({ shown }: { shown: boolean }) {
  return (
    <span
      className="t-success-check"
      data-state={shown ? "in" : "out"}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function MiniSparkline({
  data,
  color,
  width = 120,
  height = 32,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 4;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const [cx, cy] = points[points.length - 1]!.split(",");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x={parseFloat(cx!) - 3}
        y={parseFloat(cy!) - 3}
        width="6"
        height="6"
        fill={color}
      />
    </svg>
  );
}
