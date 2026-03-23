import { ReactNode } from "react";

export function BrowserWindow({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 px-2 h-5 border-b border-neutral-100">
        <div className="size-[6px] rounded-full bg-neutral-300" />
        <div className="size-[6px] rounded-full bg-neutral-300" />
        <div className="size-[6px] rounded-full bg-neutral-300" />
        {title && (
          <>
            <span className="flex-1 text-center font-mono text-[8px] text-neutral-300">
              {title}
            </span>
            <div className="w-[30px]" />
          </>
        )}
      </div>
      {children}
    </div>
  );
}
