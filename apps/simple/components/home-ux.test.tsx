import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The lock on `docs/plans/2026-09-02-phase30d-home-ux-notes.md`: eleven things
 * the owner tripped on reading the desktop Home on 2026-09-02. Notes 2, 3, 5,
 * 6, 7 and 10 are locked where their arithmetic lives (`lib/ledger.test.ts`,
 * `lib/ledger-line.test.ts`, `lib/actions.test.ts`, `lib/home-data.test.ts`);
 * this file locks the four that are only visible once a card is rendered:
 *
 * 1. the ruler under a card prints one reading, not three;
 * 4. the lens line reads "weighs most on energy · evidence A";
 * 8. no glyph is printed without its grade letter, and the legend is printed;
 * 9. a card ends with three controls, not seven.
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

const { ConclusionCard, EvidenceLegend } = await import("./home");
const { Ruler } = await import("./ruler");

/** Every string a reader would see, with the markup taken out. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/&middot;|&#xB7;/g, "·")
    .replace(/\s+/g, " ")
    .trim();

const evidence = (over: Record<string, unknown> = {}) =>
  ({
    rule: `r-${String(over.input ?? "hba1c")}`,
    input: "hba1c",
    value: "5.9 %",
    lr: 3.2,
    grade: "B",
    ...over,
  }) as never;

const conclusion = {
  id: "insulin_resistance",
  kind: "condition",
  rank: 3,
  title: "Insulin resistance: likely",
  probability: 0.64,
  state: "likely",
  lenses: { energy: { w: 1, grade: "A" }, weight: { w: 0.6, grade: "B" } },
  matters: 0.64,
  for: [evidence()],
  against: [],
  missing: [],
  confounded: [],
  inputs: [
    {
      kind: "reading",
      id: "r1",
      label: "HbA1c",
      value: "5.9 %",
      date: "2026-08-11",
    },
  ],
  next: [],
  rangeBar: {
    value: 320,
    prev: 412,
    prevDate: "2025-12-09",
    refLow: 0,
    refHigh: 34,
    optimalLow: 0,
    optimalHigh: 9,
    unit: "IU/mL",
  },
} as never;

const card = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ConclusionCard, { c: conclusion, ...over } as never),
  );

/* ── 1 · the ruler prints one reading ─────────────────────────────────── */

describe("the ruler under a card (UX note 1)", () => {
  const raw = renderToStaticMarkup(
    createElement(Ruler, {
      value: 320,
      prev: 412,
      prevDate: "2025-12-09",
      refLow: 0,
      refHigh: 34,
      optimalLow: 0,
      optimalHigh: 9,
      unit: "IU/mL",
    }),
  );
  const out = text(
    renderToStaticMarkup(
      createElement(Ruler, {
        value: 320,
        prev: 412,
        prevDate: "2025-12-09",
        refLow: 0,
        refHigh: 34,
        optimalLow: 0,
        optimalHigh: 9,
        unit: "IU/mL",
      }),
    ),
  );

  it("prints the value once, with its unit", () => {
    expect(out.match(/320/g)).toHaveLength(1);
    expect(out).toContain("IU/mL");
  });

  it("prints the bands as bands, not as readings", () => {
    expect(out).toContain("normal 0–34");
    expect(out).toContain("optimal 0–9");
  });

  it("dates the previous draw instead of hiding it in a title", () => {
    /* the mark's label is drawn by the CSS from `data-label`, so a phone
       reads it too; a `title` attribute never was reachable on a phone.
       Phase 31a item 6 adds the title and the CSS-only hover label on top of
       that, never instead of it: the date is still on the screen without one. */
    expect(raw).toContain('data-label="was 412 · Dec 9"');
    for (const title of raw.match(/title="[^"]*"/g) ?? [])
      expect(raw).toContain(title.replace("title=", "data-hover="));
  });

  it("reads every mark out on hover, with its date and its state", () => {
    expect(raw).toContain('data-hover="Dec 9 2025 · 412 IU/mL · the draw before"');
    expect(raw).toContain('data-hover="320 IU/mL · off"');
  });

  it("rounds the axis ends: no decimal is ever a reading", () => {
    /* every number on the scale row is an end, a band edge or the value */
    const ends = out.split("normal")[0]!.trim();
    expect(ends).not.toMatch(/\d+\.\d/);
    expect(out).not.toContain("-12.24");
  });
});

/* ── 4 · the lens line ────────────────────────────────────────────────── */

describe("the lens line (UX note 4)", () => {
  const out = card();

  it("says what the lens weight actually means", () => {
    expect(text(out)).toContain("weighs most on energy");
    expect(text(out)).toContain("evidence A");
  });

  it("never says 'matters most for … (grade A)' again", () => {
    expect(text(out)).not.toContain("matters most for");
  });

  it("keeps the grade one hover from its meaning", () => {
    expect(out).toContain("ov-term-trigger");
  });
});

/* ── 8 · never a bare glyph, and one legend ───────────────────────────── */

describe("the evidence glyphs (UX note 8)", () => {
  it("prints the legend once, in the ledger's own words", () => {
    expect(text(renderToStaticMarkup(createElement(EvidenceLegend)))).toBe(
      "● trial · ◐ observational · ○ anecdote",
    );
  });

  it("gives every glyph on a card a letter or a word beside it", () => {
    const out = text(card());
    for (const m of out.matchAll(/[●◐○]\s*(\S+)/g))
      expect(m[1]).toMatch(/^[A-E]$|^(study|opinion|anecdote)$/);
    expect(out).toMatch(/[●◐○]/);
  });
});

/* ── 9 · three controls, not seven ────────────────────────────────────── */

describe("what a card ends with (UX note 9)", () => {
  const out = card({ management: "Track TSH every 6 months." });
  const body = text(out);

  it("keeps the doctor's note inside the why disclosure", () => {
    expect(body).toContain("Track TSH every 6 months.");
    expect(body).not.toContain("Doctor's note");
    expect(body).toContain("Copy the doctor's note");
    const why = out.slice(out.indexOf("Why this number"));
    expect(why).toContain("Copy the doctor");
  });

  it("keeps Something's off? inside the same disclosure", () => {
    const why = out.slice(out.indexOf("Why this number"));
    expect(why).toContain("Something\u2019s off?");
  });

  it("has exactly two disclosures on the card", () => {
    expect(out.match(/<details/g)).toHaveLength(2);
  });

  it("never offers Add and Add all twice for one job", () => {
    expect(body).not.toContain("Add to your protocol");
  });
});
