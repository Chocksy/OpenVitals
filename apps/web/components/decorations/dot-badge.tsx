import { cn } from "@/lib/utils";
import { ReactNode } from "react";
export function DotBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="size-[7px] rounded-full bg-accent-500" />
      <span className="whitespace-nowrap text-foreground text-pretty font-mono text-[12px] leading-[100%] tracking-[-0.015rem] uppercase">
        {children}
      </span>
    </div>
  );
}
export function DashBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="h-[15px] w-[3px] bg-accent-500" />
      <span className="whitespace-nowrap text-inherit text-pretty font-mono text-[12px] leading-[100%] tracking-[-0.015rem] uppercase">
        {children}
      </span>
    </div>
  );
}
export function CubeBadge({
  children,
  className,
  border,
}: {
  children: ReactNode;
  className?: string;
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        border && "border border-accent-500 px-1 py-1 pl-1.5",
        className,
      )}
    >
      <div className="size-[5px] bg-accent-500" />
      <span className="whitespace-nowrap text-inherit text-pretty font-mono text-[12px] pt-px leading-none tracking-[-0.015rem] uppercase">
        {children}
      </span>
    </div>
  );
}
