import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The lock on phase 25a item 4.
 *
 * The Today card printed "Still yes? SYM COLD" and "CONDITIONS": the fact key,
 * shouted, next to a question that had lost its words. `lib/revisit.ts` now
 * carries the interview's own wording (`lib/revisit.test.ts` is the other half
 * of this lock) and the row is not allowed to print the key beside it.
 */
const client = readFileSync(
  fileURLToPath(new URL("./client.tsx", import.meta.url)),
  "utf8",
);

/** The body of one exported component. */
function component(source: string, name: string): string {
  const from = source.indexOf(`export function ${name}(`);
  expect(from).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", from + 1);
  return source.slice(from, next === -1 ? source.length : next);
}

describe("the still-true row", () => {
  const src = component(client, "StillTrue");

  it("never renders the fact key", () => {
    expect(src).not.toContain("factKey.replace");
    expect(src).not.toMatch(/\{\s*factKey\s*\}/);
  });

  it("prints the answer on file in words", () => {
    expect(src).toContain("you said");
  });

  it("still posts under the key", () => {
    expect(src).toContain("key: factKey");
  });
});
