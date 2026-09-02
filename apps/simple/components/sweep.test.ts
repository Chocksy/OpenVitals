import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The lock on the phase-30e sweep.
 *
 * 30a re-pointed the old Tailwind scales (`neutral-*`, `accent-*`,
 * `health-*`) onto the ink ladder as a shim, so the routes that had not been
 * rewritten yet stayed warm instead of going grey between slices. 30e deleted
 * the shim. Nothing checks a colour that no longer exists — a class like
 * `text-neutral-500` simply stops painting — so the rule is checked here
 * rather than noticed six months later on one card nobody opens.
 *
 * The same goes for the other names the rewrite retired: the dashed empty
 * state, the second radius, the filled badges, the simple/deep switch.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** Every `.ts`/`.tsx` under a directory, tests excluded. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [full]
      : [];
  });
}

/** Comments name the deleted things on purpose; the lock is about code. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FILES = [
  ...sources(path.join(ROOT, "app")),
  ...sources(path.join(ROOT, "components")),
  ...sources(path.join(ROOT, "lib")),
].map((f) => [path.relative(ROOT, f), code(readFileSync(f, "utf8"))] as const);

/** What the sweep removed, and what took its place. */
const RETIRED: [RegExp, string][] = [
  [/\bneutral-\d/, "the ink ladder: var(--ink) / --ink-2 / --ink-3 / --hair"],
  [/\baccent-\d/, "the ink ladder, or --lime on the one add control"],
  [
    /--color-health-|\bhealth-(normal|warning|critical|info|optimal)\b/,
    "--ok / --warn / --bad",
  ],
  [/\bbg-white\b/, "var(--surface) or var(--surface-flat)"],
  [/\brounded-sm\b/, "--r-inner, --r-card, --r-hero or --r-pill"],
  [/\bborder-dashed\b/, "the .empty tile: one sentence and one link"],
  [/\bcard-elevated\b/, ".card"],
  [/\bdata-view\b/, "nothing: the simple/deep switch is gone"],
];

describe("the compat shim is gone from the stylesheet", () => {
  it("declares no old scale", () => {
    expect(CSS).not.toMatch(/--color-(neutral|accent|health)-/);
  });

  it("has no simple/deep rule left to hide anything", () => {
    expect(CSS).not.toContain('[data-view="simple"]');
  });

  it("still declares the ladder and the spectrum the app reads", () => {
    for (const token of [
      "--ink:",
      "--ink-2:",
      "--ink-3:",
      "--hair:",
      "--ok:",
      "--warn:",
      "--bad:",
      "--lime:",
    ])
      expect(CSS).toContain(token);
  });
});

describe("no component reaches for a name the rewrite retired", () => {
  it("has files to check", () => {
    expect(FILES.length).toBeGreaterThan(80);
  });

  for (const [pattern, instead] of RETIRED) {
    it(`never says ${pattern.source} — use ${instead}`, () => {
      expect(
        FILES.filter(([, src]) => pattern.test(src)).map(([f]) => f),
      ).toEqual([]);
    });
  }
});

describe("monospace is the number voice, not a body font", () => {
  /**
   * `font-mono` on prose is what `type-discipline.test.ts` locks for Home.
   * Outside it, the only honest uses left are the two places that print a
   * document exactly as it arrived: the upload's raw text and the editable
   * copy of it. Anything else has `.t-num`, `.c-num` or a table's `td.n`.
   */
  const ALLOWED = new Set([
    "app/(app)/blood/uploads/[id]/page.tsx",
    "components/document-items.tsx",
  ]);

  it("keeps the Tailwind mono utility to the two raw-text surfaces", () => {
    const hits = FILES.filter(
      ([f, src]) => /\bfont-mono\b/.test(src) && !ALLOWED.has(f),
    ).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});
