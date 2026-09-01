import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The lock on phase 25a's first regression.
 *
 * Phase 24d animated the ledger by rebuilding React's own nodes:
 * `group.replaceChildren()` and `appendChild(span)` for the digit pop-in, and
 * a hand-rolled reorder for the FLIP. React commits against the tree it
 * believes it rendered, so the next commit — "Add to protocol", which calls
 * `router.refresh()` — threw `NotFoundError: Failed to execute 'removeChild'
 * on 'Node'` and took the page down.
 *
 * So the rule is checked, not remembered: nothing under `components/` may
 * restructure the DOM. Animation is state, keys and (for the FLIP) a
 * transform written back onto a node React already placed.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

const BANNED =
  /\b(replaceChildren|appendChild|insertBefore|removeChild)\b|innerHTML/;

/** No file is allowed to mutate React-owned structure. Keep this empty. */
const ALLOWED: string[] = [];

/** Comments name the bug on purpose; the lock is about code. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [full]
      : [];
  });
}

describe("components never mutate React-owned DOM", () => {
  const files = sources(HERE);

  it("has components to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never restructures the DOM by hand", () => {
    const hits = files
      .filter((f) => !ALLOWED.includes(path.basename(f)))
      .filter((f) => BANNED.test(code(readFileSync(f, "utf8"))))
      .map((f) => path.relative(HERE, f));
    expect(hits).toEqual([]);
  });

  it("keeps the allowlist empty", () => {
    expect(ALLOWED).toEqual([]);
  });
});
