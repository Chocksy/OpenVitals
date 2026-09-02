"use client";

import { useEffect, useState } from "react";
import { PillTabs } from "./pill-tabs";

type Pref = "light" | "system" | "dark";
const TABS = [
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
  { id: "dark", label: "Dark" },
];

declare global {
  interface Window {
    __applyTheme?: () => void;
  }
}

/**
 * Three-way theme picker, drawn as the one tab control in the app (the
 * sliding pill). The inline script in `app/layout.tsx` does the resolving.
 */
export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") setPref(stored);
  }, []);

  function choose(next: string) {
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    setPref(next as Pref);
    window.__applyTheme?.();
  }

  return (
    <div className="theme-row">
      <span className="grp">Theme</span>
      <PillTabs tabs={TABS} active={pref} label="Theme" onSelect={choose} />
    </div>
  );
}
