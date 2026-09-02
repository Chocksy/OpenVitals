"use client";

/**
 * One sliding pill for a group of tabs (`16-tabs-sliding.md`).
 *
 * Before this, every tab group on the site drew its own static highlight:
 * `/graph` carried two of them side by side (four lenses, then a second
 * bordered Bubbles/Systems toggle), which read as two competing controls.
 * Now the group has a single pill that travels between the options, and the
 * view switch is a plain link, so there is one pill on the page.
 *
 * The JS is the skill's own orchestration: it writes the active tab's
 * `offsetLeft` / `offsetWidth` onto the pill and CSS owns the tween. First
 * paint and resize are written with the transition suspended, or the pill
 * animates in from `translateX(0)` / `width: 0`.
 */
import Link from "next/link";
import { useEffect, useRef } from "react";

export interface PillTab {
  id: string;
  label: string;
  /** a tab that navigates; omit it and the group calls `onSelect` instead */
  href?: string;
}

export function PillTabs({
  tabs,
  active,
  label,
  className,
  onSelect,
}: {
  tabs: PillTab[];
  active: string;
  label: string;
  className?: string;
  /** for a group that switches state in place instead of navigating */
  onSelect?: (id: string) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const painted = useRef(false);

  const moveTo = (tab: HTMLElement | null, animate: boolean) => {
    const el = pill.current;
    if (!el || !tab) return;
    if (!animate) {
      const prev = el.style.transition;
      el.style.transition = "none";
      el.style.transform = `translateX(${tab.offsetLeft}px)`;
      el.style.width = `${tab.offsetWidth}px`;
      void el.offsetWidth;
      el.style.transition = prev;
    } else {
      el.style.transform = `translateX(${tab.offsetLeft}px)`;
      el.style.width = `${tab.offsetWidth}px`;
    }
    // Under 620 px the row scrolls rather than truncating a label, so the
    // selected tab is brought into view. A scroll offset, not a DOM change.
    const wrap = el.parentElement;
    if (wrap && wrap.scrollWidth > wrap.clientWidth) {
      wrap.scrollLeft = Math.max(
        0,
        tab.offsetLeft - (wrap.clientWidth - tab.offsetWidth) / 2,
      );
    }
  };

  const activeTab = () =>
    bar.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null;

  useEffect(() => {
    const animate = painted.current;
    painted.current = true;
    const frame = requestAnimationFrame(() => moveTo(activeTab(), animate));
    const onResize = () => moveTo(activeTab(), false);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [active]);

  return (
    <div
      ref={bar}
      role="tablist"
      aria-label={label}
      className={className}
      style={{ display: "inline-flex" }}
    >
      <div className="t-tabs">
        <span ref={pill} className="t-tabs-pill" aria-hidden="true" />
        {tabs.map((tab) => {
          const props = {
            role: "tab",
            "aria-selected": tab.id === active,
            className:
              "t-tab font-mono text-[11px] font-medium uppercase tracking-[0.04em]",
          } as const;
          return tab.href ? (
            <Link
              key={tab.id}
              href={tab.href}
              {...props}
              onClick={(e) => moveTo(e.currentTarget, true)}
            >
              {tab.label}
            </Link>
          ) : (
            <button
              key={tab.id}
              type="button"
              {...props}
              onClick={(e) => {
                moveTo(e.currentTarget, true);
                onSelect?.(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
