import { ReactNode } from "react";

export function BrowserWindow({
  children,
  url,
}: {
  url?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white"
      style={{
        boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 12px 48px rgba(0,0,0,0.04)",
      }}
    >
      {/* Chrome */}
      <div className="h-6.5 flex items-center gap-2 border-b border-neutral-100 px-2">
        <div className="flex gap-1.5">
          <div className="size-[9px] rounded-full bg-[#FF5F57]" />
          <div className="size-[9px] rounded-full bg-[#FEBC2E]" />
          <div className="size-[9px] rounded-full bg-[#28C840]" />
        </div>
        {!!url && (
          <div className="flex-1 flex justify-center items-center">
            <span className="text-[10px] text-neutral-400">{url}</span>
          </div>
        )}
        <div className="flex gap-1.5 opacity-0">
          <div className="size-[9px] rounded-full bg-[#FF5F57]" />
          <div className="size-[9px] rounded-full bg-[#FEBC2E]" />
          <div className="size-[9px] rounded-full bg-[#28C840]" />
        </div>
      </div>
      {children}
    </div>
  );
}
