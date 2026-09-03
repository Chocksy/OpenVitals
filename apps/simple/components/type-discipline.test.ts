import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The lock on phase 25b item 2.
 *
 * The owner read a card and said: "gray mono text and black text and different
 * sizes in the same sentence, hard to follow". He was right — the effect line,
 * the lens line, "Never measured: …" and "Next: …" were all prose set in
 * monospace at 10 or 11 px next to 13 px sans.
 *
 * The rule, checked rather than remembered: **monospace is for numbers, units,
 * codes and dates only, never for a sentence.** Home's cards are rendered to a
 * string, every element carrying `font-mono` or `.t-num` is walked, and its
 * text has to be made of numbers, units, glossary codes and punctuation.
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

const {
  ConclusionCard,
  FindingsCard,
  ImprovedCard,
  MarkersCard,
  QuietLine,
  SinceLine,
  TodayQuestions,
} = await import("./home");
/* Phase 28c: `Cockpit`, `SystemsGrid` and `TodayCard` are gone — the rail and
   the chips replaced them, so those two surfaces are what the lock reads. */
const { HomeRail, SystemChips } = await import("./home-rail");
const { railCards } = await import("@/lib/home-data");
const { termFor } = await import("@/lib/glossary");

/* ── the checker ──────────────────────────────────────────────────────── */

const VOID = new Set([
  "area",
  "br",
  "circle",
  "col",
  "hr",
  "img",
  "input",
  "line",
  "path",
  "polyline",
  "rect",
  "source",
  "text",
  "use",
]);

const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every element whose class list asks for the monospace family.
 *
 * Phase 30a moved the type discipline out of Tailwind utilities and into the
 * design system's own classes, so the check follows the new names: `.t-num`
 * and `font-mono` still count, and so do `.c-num` (a card's big number),
 * `.conc-pct` (a likelihood) and `.conc-rank` (a rank), which set the mono
 * family in `globals.css`. `.c-label` is deliberately not here: it is the
 * system's one-word label voice (STATUS, BODY, BLOOD), never a sentence.
 */
const MONO_CLASS =
  /class="[^"]*\b(?:font-mono|t-num|c-num|conc-pct|conc-rank)\b[^"]*"/;


export function monoTexts(html: string): string[] {
  const out: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  const stack: { mono: boolean; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html))) {
    const [full, close, name, , self] = m;
    if (self === "/" || VOID.has(name!)) continue;
    if (close === "/") {
      const top = stack.pop();
      if (top?.mono) out.push(decode(html.slice(top.start, m.index)));
      continue;
    }
    stack.push({
      mono: MONO_CLASS.test(full),
      start: m.index + full.length,
    });
  }
  return out.filter(Boolean);
}

/** The units this app prints. Anything not here is a word, and words are sans. */
const UNITS = new Set(
  `% mg/dL U/L mmHg ng/mL pg/mL ng/dL mIU/L IU/L µIU/mL nmol/L µmol/L g/dL
   mg/L K/µL M/µL fL h wk yr kg/m² mL/min/1.73m² LR pts €`
    .split(/\s+/)
    .filter(Boolean),
);

const NUMBER = /^[+-]?[\d,]*\d(?:[.,]\d+)?%?$/;
/** "4–5.7" and "5.6 → 5.9": a band and a move are still numbers. */
const RANGE = /^[+-]?\d+(?:\.\d+)?[–—-][+-]?\d+(?:\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^€\d+$/;
const PUNCT = /^[·→—–…,.;:()[\]{}/%<>=+~-]+$/;
const GRADE = /^[A-E]$/;
/** `formatDate` writes "Aug 25, 2026", which is still a date. */
const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;

/** Is this token a number, a unit, a code or a date? */
function ok(token: string): boolean {
  // The coral ▲ is a glyph, not a word: it rides on the number it warns
  // about ("▲3"), so it comes off before the token is judged.
  const t = token.replace(/^▲/, "").replace(/[,.;:]+$/, "");
  if (!t) return true;
  if (NUMBER.test(t) || RANGE.test(t) || DATE.test(t) || MONEY.test(t) || PUNCT.test(t))
    return true;
  if (UNITS.has(t) || GRADE.test(t) || MONTH.test(t)) return true;
  return termFor(t) != null;
}

export function monoViolations(html: string): string[] {
  return monoTexts(html).filter((text) =>
    text.split(/\s+/).some((token) => !ok(token)),
  );
}

/* ── the fixtures ─────────────────────────────────────────────────────── */

const evidence = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    rule: `r-${Math.random()}`,
    input: "hba1c",
    value: "5.9 %",
    lr: 2.4,
    grade: "B",
    ...over,
  }) as never;

const move = (label: string, cost = 0) =>
  ({
    kind: "test",
    featureId: "metric:alp",
    label,
    cost,
    priced: cost > 0,
    outcomes: [],
    entropyBefore: 1,
    entropyAfter: 0.8,
    gain: 0.12,
    ratio: 0.1,
    shift: 0.2,
    moves: [],
  }) as never;

const conclusion = {
  id: "insulin_resistance",
  kind: "condition",
  rank: 1,
  title: "Insulin resistance",
  probability: 0.64,
  state: "likely",
  lenses: { energy: { w: 1, grade: "A" }, weight: { w: 0.6, grade: "B" } },
  matters: 0.64,
  for: [evidence(), evidence({ input: "alp", value: "128 U/L", lr: 1.6 })],
  against: [evidence({ input: "hdl_cholesterol", value: "68 mg/dL", lr: 0.6 })],
  missing: ["ALP", "Fasting insulin"],
  confounded: ["hs-CRP"],
  inputs: [
    {
      kind: "reading",
      id: "r1",
      label: "HbA1c",
      value: "5.9 %",
      date: "2026-08-11",
    },
    { kind: "fact", id: "smoking", label: "Smoking", value: "no" },
  ],
  next: [move("2-hour OGTT with insulin", 57), move("Do you snore?")],
  rangeBar: {
    value: 5.9,
    refLow: 4,
    refHigh: 5.7,
    optimalLow: 4.5,
    optimalHigh: 5.4,
    unit: "%",
  },
  trend: {
    code: "hba1c",
    points: [
      { date: "2026-01-01", value: 5.6 },
      { date: "2026-08-11", value: 5.9 },
    ],
  },
  projection: {
    code: "hba1c",
    line: "On track: HbA1c expected 5.6 by Nov 20",
    verdict: null,
  },
  changed: { to: "likely", deltaP: 0.08, kind: "data", line: "" },
} as never;

const ledger = {
  bioAge: undefined,
  bioAgeMissing: ["ALP"],
  counters: {
    optimal: 12,
    normal: 7,
    off: 3,
    questions: 4,
    nextDrawWeeks: 12,
    nextDrawCodes: ["ApoB", "Lp(a)"],
  },
  systems: [
    {
      id: "liver",
      name: "Liver",
      score: 0.72,
      worst: { code: "alp", value: 128, unit: "U/L", status: "red" },
    },
    { id: "thyroid", name: "Thyroid", score: 0, worst: undefined },
  ],
  conclusions: [],
  asks: [],
  quiet: {
    unlikely: 2,
    ruledOut: 1,
    ids: ["a", "b", "c"],
    rows: [{ id: "a", name: "Coeliac disease", p: 0.03 }],
    ruledOutRows: [{ id: "c", name: "Wilson disease", p: 0.00002 }],
  },
  improved: [
    {
      code: "ferritin",
      name: "Ferritin",
      from: 12,
      to: 48,
      unit: "ng/mL",
      since: "2026-03-02",
    },
  ],
  since: { at: "2026-08-31", resolved: 0, new: 2, stronger: 1, weaker: 0 },
} as never;

const today = {
  due: [
    {
      key: "sym_cold",
      question: "Do you still feel cold when others do not?",
      original: "yes",
      options: ["yes", "no"],
      current: "yes",
    },
  ],
  post: { date: "2026-08-31", text: "ran 10 km", reply: "Logged the run." },
} as never;

const markerGroup = {
  id: "markers:lipids",
  systemName: "Lipids",
  rank: 6,
  markers: [
    { code: "ldl_cholesterol", name: "LDL cholesterol", value: "141 mg/dL" },
  ],
  inputs: [
    {
      kind: "reading",
      id: "r2",
      label: "LDL cholesterol",
      value: "141 mg/dL",
      date: "2026-08-11",
    },
  ],
} as never;

const finding = {
  id: "u1",
  kind: "genome",
  title: "What your genome changed",
  at: "2026-08-25",
  href: "/blood/uploads/u1",
  lines: [
    { label: "TCF7L2 CT", text: "Raises the odds of type 2 diabetes ×1.4." },
  ],
  total: 9,
} as never;

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const SURFACES: [string, () => string][] = [
  [
    "SinceLine",
    () =>
      html(
        createElement(SinceLine, {
          since: (ledger as never as { since: never }).since,
          day: "2026-09-01",
        }),
      ),
  ],
  [
    "HomeRail",
    () =>
      html(
        createElement(HomeRail, {
          cards: railCards(ledger, today, { todo: 2, actions: 1 }),
        }),
      ),
  ],
  [
    "HomeRail (goals first)",
    () =>
      html(
        createElement(HomeRail, {
          cards: railCards(ledger, today, {
            todo: 2,
            actions: 1,
            sentence: "Autoimmune thyroiditis: confirmed",
            goals: [
              {
                code: "ldl_cholesterol",
                name: "LDL cholesterol",
                said: "70\u2013100",
                now: "131 mg/dL",
                progress: 29,
                pace: "off pace",
                paceTone: "warn",
              },
            ],
          }),
        }),
      ),
  ],
  [
    "SystemChips",
    () =>
      html(
        createElement(SystemChips, {
          systems: (ledger as never as { systems: never }).systems,
        }),
      ),
  ],
  [
    "ConclusionCard",
    () => html(createElement(ConclusionCard, { c: conclusion })),
  ],
  [
    "ConclusionCard (start here)",
    () => html(createElement(ConclusionCard, { c: conclusion, spear: true })),
  ],
  [
    "MarkersCard",
    () => html(createElement(MarkersCard, { group: markerGroup })),
  ],
  ["FindingsCard", () => html(createElement(FindingsCard, { finding }))],
  [
    "ImprovedCard",
    () =>
      html(
        createElement(ImprovedCard, {
          improved: (ledger as never as { improved: never }).improved,
        }),
      ),
  ],
  [
    "QuietLine",
    () =>
      html(
        createElement(QuietLine, {
          quiet: (ledger as never as { quiet: never }).quiet,
        }),
      ),
  ],
  [
    "TodayQuestions",
    () => html(createElement(TodayQuestions, { today, day: "2026-09-01" })),
  ],
];

/* ── the lock ─────────────────────────────────────────────────────────── */

describe("the checker itself", () => {
  it("passes a number, a unit and a date", () => {
    expect(
      monoViolations('<span class="t-num">128 U/L · 2026-08-11</span>'),
    ).toEqual([]);
  });

  it("fails a sentence", () => {
    expect(
      monoViolations('<span class="t-num">a liver enzyme from bone</span>'),
    ).toEqual(["a liver enzyme from bone"]);
  });

  it("fails the old lens line", () => {
    expect(
      monoViolations(
        '<p class="mt-1 font-mono text-[11px] text-neutral-400">matters most for energy (A)</p>',
      ),
    ).toHaveLength(1);
  });
});

describe("monospace is for numbers, units, codes and dates", () => {
  for (const [name, render] of SURFACES) {
    it(`${name} sets no sentence in mono`, () => {
      expect(monoViolations(render())).toEqual([]);
    });
  }

  it("still renders something", () => {
    expect(SURFACES.map(([, r]) => r().length).every((n) => n > 40)).toBe(true);
  });
});

describe("every abbreviation on a card has its meaning attached", () => {
  it("marks ALP up wherever the cards print it", () => {
    const out = html(createElement(ConclusionCard, { c: conclusion }));
    expect(out).toContain("ov-term-trigger");
    expect(out).toContain("A liver enzyme that also comes from bone.");
    expect(out).toContain("Alkaline phosphatase");
  });

  it("never nests a term inside a link", () => {
    for (const [, render] of SURFACES) {
      const out = render();
      const inside = out.match(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?ov-term\b/);
      expect(inside).toBeNull();
    }
  });
});
