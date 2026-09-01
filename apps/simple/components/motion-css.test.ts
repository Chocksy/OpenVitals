import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The lock on the motion install (phase 24d).
 *
 * Every transition in `app/globals.css` is copied from
 * `~/.claude/skills/transitions-dev`, and every one of those snippets ships a
 * `prefers-reduced-motion` guard. Deleting a guard is the easy mistake — the
 * page still looks right to whoever made the change and fails an
 * accessibility audit for everyone who asked their OS for less motion. So the
 * rule is checked, not remembered: anything that animates must be named in a
 * reduced-motion block, and nothing may say `transition: all`.
 */
const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

/** Every `@media (prefers-reduced-motion: reduce) { … }` body, concatenated. */
function reducedMotionBlocks(source: string): string {
  const out: string[] = [];
  const marker = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(source))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    out.push(source.slice(from, i - 1));
  }
  return out.join("\n");
}

/** The source with every reduced-motion block removed. */
function withoutGuards(source: string): string {
  let rest = source;
  const marker = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/;
  for (;;) {
    const m = marker.exec(rest);
    if (!m) return rest;
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < rest.length && depth > 0) {
      if (rest[i] === "{") depth++;
      else if (rest[i] === "}") depth--;
      i++;
    }
    rest = rest.slice(0, m.index) + rest.slice(i);
  }
}

/** The `t-*` classes named by any rule that declares a transition/animation. */
function animatedClasses(source: string): string[] {
  const found = new Set<string>();
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(source))) {
    const selector = m[1]!;
    const body = m[2]!;
    if (!/(^|[\s;])(transition|animation)(-property)?\s*:/.test(body)) continue;
    // `@keyframes` steps look like rules; their selectors are `0%` / `from`.
    if (/@/.test(selector)) continue;
    for (const cls of selector.match(/\.t-[a-z0-9-]+/g) ?? []) found.add(cls);
  }
  return [...found].sort();
}

const guards = reducedMotionBlocks(css);
const animated = animatedClasses(withoutGuards(css));

describe("the transitions.dev install", () => {
  it("installs the motion tokens exactly once", () => {
    expect(css.match(/--resize-dur:/g)).toHaveLength(1);
    expect(css.match(/--stagger-stagger:\s*40ms/g)).toHaveLength(1);
    expect(css.match(/--toast-open:/g)).toHaveLength(1);
  });

  it("has every snippet it claims to have", () => {
    for (const cls of [
      ".t-resize",
      ".t-digit-group",
      ".t-text-swap",
      ".t-panel-slide",
      ".t-icon-swap",
      ".t-success-check",
      ".t-skel",
      ".t-tabs-pill",
      ".t-stagger-line",
      ".t-toast",
      ".t-flip",
    ])
      expect(css).toContain(cls);
  });

  it("guards every animated class with prefers-reduced-motion", () => {
    expect(animated.length).toBeGreaterThan(8);
    const uncovered = animated.filter(
      (cls) => !new RegExp(`${cls}\\b`).test(guards),
    );
    expect(uncovered).toEqual([]);
  });

  it("never says transition: all", () => {
    expect(/transition\s*:\s*all\b/.test(css)).toBe(false);
    expect(/transition-property\s*:\s*all\b/.test(css)).toBe(false);
  });

  it("keeps will-change off anything the GPU cannot composite", () => {
    const props = [...css.matchAll(/will-change:\s*([^;]+);/g)].flatMap((m) =>
      m[1]!.split(",").map((p) => p.trim()),
    );
    expect(props.length).toBeGreaterThan(0);
    for (const p of props)
      expect(["transform", "opacity", "filter", "width", "height"]).toContain(
        p,
      );
  });
});
