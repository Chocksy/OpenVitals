"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Pref = "light" | "system" | "dark";
const OPTIONS: Pref[] = ["light", "system", "dark"];

declare global {
  interface Window {
    __applyTheme?: () => void;
  }
}

/** Three-way theme picker. The inline script in layout.tsx does the resolving. */
export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") setPref(stored);
  }, []);

  function choose(next: Pref) {
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    setPref(next);
    window.__applyTheme?.();
  }

  return (
    <div className="mt-3 border-t border-neutral-200 pt-2">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
        Theme
      </p>
      <div className="pill-tabs w-full">
        {OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => choose(o)}
            className={cn("pill-tab flex-1 capitalize", pref === o && "pill-tab-active")}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
