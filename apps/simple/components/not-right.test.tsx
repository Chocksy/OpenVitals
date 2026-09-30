import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Phase 44A: a fact the card read says how much it still counts, so a
 * year-old "No" is never shown as if it were today's.
 */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
  }) => createElement("a", { href, ...rest }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/",
}));

const { ConclusionCard } = await import("./home");

const conclusion = (note?: string) =>
  ({
    id: "hypothyroidism",
    kind: "condition",
    rank: 1,
    title: "Hypothyroidism: possible",
    probability: 0.3,
    state: "possible",
    lenses: {},
    matters: 0.3,
    for: [],
    against: [],
    missing: [],
    confounded: [],
    inputs: [
      {
        kind: "fact",
        id: "sym_cold",
        label: "Cold hands",
        value: "No",
        ...(note ? { note } : {}),
      },
    ],
    next: [],
  }) as never;

const render = (note?: string) =>
  renderToStaticMarkup(createElement(ConclusionCard, { c: conclusion(note) }));

describe("Something's off? (44A)", () => {
  it("prints the fade note next to a faded answer", () => {
    expect(render("you said No, 11 months ago, counting half")).toContain(
      "· you said No, 11 months ago, counting half",
    );
  });

  it("prints nothing extra for a fresh answer", () => {
    expect(render()).not.toContain("you said");
  });
});
