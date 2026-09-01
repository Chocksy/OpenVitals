/**
 * The handful of shadcn primitives the ported pages actually use, in one file.
 * Radix is gone: `Button` drops `asChild`/`Slot`, everything else was already
 * plain markup. `class-variance-authority` stays.
 * ponytail: skeleton/card-header/card-footer were never rendered, so they are
 * not here.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Exact properties, never `transition: all` — an unrelated style change must
  // not ride in for free. 0.96 on press is the checklist's own number.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-display text-[14px] leading-[1.25rem] rounded-sm tracking-[0.04em] transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        default: "bg-neutral-900 text-neutral-0 hover:bg-neutral-800",
        primary: "bg-accent-600 text-white hover:bg-accent-700",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline:
          "border border-neutral-900 bg-neutral-0 text-neutral-900 hover:bg-neutral-900 hover:text-neutral-0",
        "outline-subtle":
          "border border-neutral-200 bg-neutral-0 text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50",
        secondary: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
        ghost:
          "hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 border-transparent",
        link: "text-neutral-900 underline-offset-4 hover:underline tracking-normal normal-case font-display font-medium",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-[12px]",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 t-meta text-[10px] font-bold uppercase tracking-[0.04em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-neutral-900 text-neutral-0",
        secondary: "border-transparent bg-neutral-100 text-neutral-700",
        outline: "border-neutral-200 text-neutral-700",
        normal:
          "bg-[var(--color-health-normal-bg)] text-[var(--color-health-normal)] border-[var(--color-health-normal-border)]",
        warning:
          "bg-[var(--color-health-warning-bg)] text-[var(--color-health-warning)] border-[var(--color-health-warning-border)]",
        critical:
          "bg-[var(--color-health-critical-bg)] text-[var(--color-health-critical)] border-[var(--color-health-critical-border)]",
        info: "bg-[var(--color-health-info-bg)] text-[var(--color-health-info)] border-[var(--color-health-info-border)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

/** science solid, opinion accent, anecdotal dotted. Nothing else hedges. */
const BASIS_CLASS: Record<string, string> = {
  science: "border-neutral-900 text-neutral-900",
  opinion: "border-accent-500 text-accent-600",
  anecdotal: "border-dashed border-neutral-400 text-neutral-500",
};

export function BasisChip({ basis }: { basis: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 t-meta text-[10px] font-bold uppercase tracking-[0.04em]",
        BASIS_CLASS[basis] ?? BASIS_CLASS.science,
      )}
    >
      {basis}
    </span>
  );
}

/** How settled the evidence behind an action is: established, early, horizon. */
const TIER_CLASS: Record<string, string> = {
  established: "border-neutral-300 text-neutral-600",
  early:
    "border-[var(--color-health-warning)] text-[var(--color-health-warning)]",
  experimental: "border-dashed border-neutral-400 text-neutral-500",
};

export function TierChip({ tier }: { tier?: string }) {
  if (!tier) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 t-meta text-[10px] font-bold uppercase tracking-[0.04em]",
        TIER_CLASS[tier] ?? TIER_CLASS.established,
      )}
    >
      {tier}
    </span>
  );
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
