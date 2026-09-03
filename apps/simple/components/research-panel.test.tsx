import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Phase 32a section 1, on `docs/mockups/v4/research.html`.
 *
 * Two rules, and the page is mostly the second one. First: the panel is
 * sorted by what it moves, and `sortWatch` in `lib/research-watch.ts` owns
 * that, so nothing here re-sorts. Second: a paper that moves nothing says
 * "nothing for you", and the compact panel does not appear at all when no row
 * moved anything — a panel that always says "nothing new" trains the eye to
 * skip it.
 */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { PaperRow, ResearchCompact, ResearchSection, deltaWords, movesLine } =
  await import("./research-panel");

type Row = Parameters<typeof PaperRow>[0]["row"];

const paper = (over: Partial<Row> & { id: string }): Row =>
  ({
    userId: "u1",
    conditionId: "hashimoto",
    source: "epmc",
    externalId: `doi:${over.id}`,
    title: "Selenium lowers thyroid peroxidase antibodies",
    journal: "J Clin Endocrinol Metab",
    url: "https://doi.org/10.1/x",
    publishedAt: "2026-08-01",
    grade: "A",
    finding: "Three months of selenium cut TPO antibodies by 21 %.",
    abstract: null,
    moves: null,
    foundAt: new Date("2026-08-01T00:00:00Z"),
    seenAt: null,
    dismissedAt: null,
    ...over,
  }) as Row;

const moved = (name: string, delta: number) => ({
  conclusionId: "hashimoto",
  name,
  direction: delta > 0 ? ("up" as const) : ("down" as const),
  delta,
});

describe("what a move is worth in words", () => {
  it("says a fraction as points", () => {
    expect(deltaWords(0.04)).toBe("4 points");
    expect(deltaWords(-0.01)).toBe("1 point");
  });

  it("keeps one decimal on a small move", () => {
    expect(deltaWords(0.015)).toBe("1.5 points");
  });
});

describe("the moves line", () => {
  it("says nothing for you when the intake proposed no rule", () => {
    expect(movesLine(paper({ id: "a" }))).toBe("nothing for you");
  });

  it("says the direction and the size when it did", () => {
    expect(
      movesLine(paper({ id: "b", moves: moved("Hashimoto's", -0.04) })),
    ).toBe("down 4 points");
  });
});

describe("one paper row", () => {
  const html = renderToStaticMarkup(<PaperRow row={paper({ id: "a" })} />);

  it("prints the title, the journal and the day it was published", () => {
    expect(html).toContain("Selenium lowers thyroid peroxidase antibodies");
    expect(html).toContain("J Clin Endocrinol Metab");
    expect(html).toContain("published Aug 1 2026");
  });

  it("prints the intake's own sentence, and no other", () => {
    expect(html).toContain("cut TPO antibodies by 21 %");
  });

  it("says nothing for you rather than leaving the line off", () => {
    expect(html).toContain("nothing for you");
  });

  it("opens the paper where it was stored", () => {
    expect(html).toContain('href="https://doi.org/10.1/x"');
  });

  it("names the condition it moved when it moved one", () => {
    const html2 = renderToStaticMarkup(
      <PaperRow row={paper({ id: "b", moves: moved("Hashimoto's", -0.04) })} />,
    );
    expect(html2).toContain("Hashimoto&#x27;s");
    expect(html2).toContain("down 4 points");
  });
});

const section = (props: Partial<Parameters<typeof ResearchSection>[0]> = {}) =>
  renderToStaticMarkup(
    <ResearchSection
      rows={[]}
      conditions={[
        {
          id: "hashimoto",
          name: "Hashimoto's",
          probability: 0.95,
          state: "likely",
        },
      ]}
      lastRun="2026-08-01"
      cooldownDays={90}
      {...props}
    />,
  );

describe("the empty state", () => {
  it("names the day it looked and the conditions it looked for", () => {
    const html = section();
    expect(html).toContain("No new papers since Aug 1 2026");
    expect(html).toContain("Hashimoto&#x27;s");
    expect(html).toContain("90 days without a read");
  });

  it("says there is nothing to watch when the ledger is quiet", () => {
    expect(section({ conditions: [] })).toContain(
      "no condition in your ledger",
    );
  });

  it("prints the last run and the cooldown on the run receipt", () => {
    expect(section()).toContain("last run Aug 1 2026");
  });
});

describe("the compact panel", () => {
  it("does not appear when nothing moved", () => {
    expect(
      renderToStaticMarkup(<ResearchCompact rows={[paper({ id: "a" })]} />),
    ).toBe("");
  });

  it("prints the movers, then counts the rest in one row", () => {
    const rows = [
      paper({ id: "a", moves: moved("Hashimoto's", -0.04) }),
      paper({ id: "b", title: "Second", moves: moved("Coeliac", -0.02) }),
      paper({ id: "c", title: "Third" }),
      paper({ id: "d", title: "Fourth" }),
    ];
    const html = renderToStaticMarkup(<ResearchCompact rows={rows} />);
    expect(html).toContain("2 of 4 papers moved something");
    expect(html).toContain("2 more papers moved nothing");
    expect(html).not.toContain("Third");
  });
});
