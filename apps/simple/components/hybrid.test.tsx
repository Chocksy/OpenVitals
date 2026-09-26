import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DrawAgeRing, HeadingTile, Stamp } from "./ui-kit";
import { Drawer } from "./drawer";
import {
  CorridorChart,
  MiniCorridor,
  miniDomain,
  nice,
  pushApart,
} from "./corridor";
import { CaseView, HunchRail, WatchList } from "./hunch-board";
import type { HunchCase, HunchRow } from "@/lib/api-contract";
import hunch from "../fixtures/api/hunch.json";
import hunches from "../fixtures/api/hunches.json";

/**
 * Phase 40a: the Hybrid primitives (`docs/mockups/v4/ios-variations/53-web.html`).
 * Server markup only, like `goal-band.test.tsx`: what a primitive prints is
 * its contract.
 */

describe("Stamp", () => {
  it("prints one word per kind, in the kind's class", () => {
    const html = renderToStaticMarkup(<Stamp kind="good_news" />);
    expect(html).toBe('<span class="ks good_news">GOOD NEWS</span>');
    expect(renderToStaticMarkup(<Stamp kind="step" />)).toContain(">STEP<");
    expect(renderToStaticMarkup(<Stamp kind="belief" />)).toContain(">BELIEF<");
  });

  it("takes the server's own word over its own", () => {
    expect(
      renderToStaticMarkup(<Stamp kind="left_band">OUT OF BAND</Stamp>),
    ).toContain(">OUT OF BAND<");
  });

  it("never prints in mono", () => {
    expect(renderToStaticMarkup(<Stamp kind="gap" />)).not.toMatch(
      /font-mono|t-num/,
    );
  });
});

describe("DrawAgeRing", () => {
  const C = 2 * Math.PI * 14;
  const offset = (html: string) =>
    Number(/stroke-dashoffset="([\d.]+)"/.exec(html)![1]);

  it("is full on the day of the draw and empty a year later", () => {
    expect(offset(renderToStaticMarkup(<DrawAgeRing days={0} />))).toBe(0);
    expect(
      offset(renderToStaticMarkup(<DrawAgeRing days={365} />)),
    ).toBeCloseTo(C, 1);
    expect(
      offset(renderToStaticMarkup(<DrawAgeRing days={900} />)),
    ).toBeCloseTo(C, 1);
  });

  it("reads no draw as empty", () => {
    expect(renderToStaticMarkup(<DrawAgeRing days={null} />)).toContain(
      'data-fresh="0.00"',
    );
  });
});

describe("HeadingTile", () => {
  it("carries the word for a screen reader, not only the arrow", () => {
    const html = renderToStaticMarkup(
      <HeadingTile name="Blood fats" word="away" why="LDL is up." />,
    );
    expect(html).toContain('class="htile away"');
    expect(html).toContain("↘");
    expect(html).toContain('<span class="sr-only">away</span>');
    expect(html).toContain('title="Blood fats: LDL is up."');
  });
});

describe("Drawer", () => {
  it("renders a closed native dialog with a named close button", () => {
    const html = renderToStaticMarkup(
      <Drawer open={false} onClose={() => {}} label="Case">
        <p>inside</p>
      </Drawer>,
    );
    expect(html).toMatch(/^<dialog aria-label="Case" class="drawer">/);
    expect(html).toContain('aria-label="Close"');
    // closed: the case is not rendered until it opens
    expect(html).not.toContain("inside");
  });

  it("renders its children and head when open", () => {
    const html = renderToStaticMarkup(
      <Drawer open onClose={() => {}} label="Case" head={<b>STEP</b>}>
        <p>inside</p>
      </Drawer>,
    );
    expect(html).toContain("<b>STEP</b>");
    expect(html).toContain("<p>inside</p>");
  });
});

describe("MiniCorridor", () => {
  it("draws the band, the lab tick, the trail and the last dot", () => {
    const html = renderToStaticMarkup(
      <MiniCorridor
        band={{ median: 100, sd: 10 }}
        lab={[null, 130]}
        last={140}
        prev={120}
      />,
    );
    expect(html).toContain('class="cz"');
    expect(html).toContain('class="lab"');
    expect(html).toContain('class="trail"');
    expect(html).toContain('class="dt"');
  });

  it("draws the goal zone instead of the band when there is a goal", () => {
    const html = renderToStaticMarkup(
      <MiniCorridor
        band={{ median: 100, sd: 10 }}
        goal={[70, 100]}
        last={131}
      />,
    );
    expect(html).toContain('class="gz"');
    expect(html).not.toContain('class="cz"');
  });

  it("dashes a provisional band", () => {
    const html = renderToStaticMarkup(
      <MiniCorridor band={{ median: 5, sd: 1, provisional: true }} last={6} />,
    );
    expect(html).toContain('class="cz prov"');
  });

  it("draws nothing without a last draw", () => {
    expect(renderToStaticMarkup(<MiniCorridor band={null} last={null} />)).toBe(
      "",
    );
  });

  it("keeps a far lab limit out of the domain", () => {
    // lab 1000 is far past 35 % of the span; it must not squash the band
    const [lo, hi] = miniDomain({
      band: { median: 100, sd: 10 },
      lab: [null, 1000],
      last: 110,
    })!;
    expect(lo).toBeGreaterThan(80);
    expect(hi).toBeLessThan(130);
  });
});

describe("CorridorChart", () => {
  const series = [
    { date: "2022-01-10", value: 98 },
    { date: "2023-02-01", value: 102 },
    { date: "2024-03-05", value: 101 },
    { date: "2025-04-01", value: 118 },
    { date: "2026-09-01", value: 131 },
  ];

  it("draws the draws, the band, the goal, the lab line and the landing", () => {
    const html = renderToStaticMarkup(
      <CorridorChart
        series={series}
        band={{ median: 100, sd: 5 }}
        lab={[null, 130]}
        goal={{ low: 70, high: 100 }}
        landing={{ date: "2026-12-01", value: 136 }}
        unit="mg/dL"
        label="LDL"
      />,
    );
    expect(html.match(/class="d( out)?"/g)).toHaveLength(5);
    expect(html).toContain('class="band"');
    expect(html).toContain('class="goal"');
    expect(html).toContain('class="lab"');
    expect(html).toContain("if nothing changes · 136 mg/dL on 1 Dec");
    expect(html).toContain("goal 70 to 100");
    expect(html).toContain("your band 95 to 105");
    // the last two draws sit outside a band of 100 ± 5
    expect(html.match(/class="d out"/g)).toHaveLength(2);
  });

  it("draws the band as it stood before each draw", () => {
    const html = renderToStaticMarkup(
      <CorridorChart
        series={series}
        bandAt={[
          { date: "2025-04-01", median: 100, sd: 3 },
          { date: "2026-09-01", median: 101, sd: 4 },
        ]}
      />,
    );
    expect(html.match(/class="band"/g)).toHaveLength(2);
    expect(html).toContain("your band 97 to 105");
  });

  it("keeps a window and notes the draw before it", () => {
    const html = renderToStaticMarkup(
      <CorridorChart series={series} from="2025-01-01" />,
    );
    expect(html.match(/class="d( out)?"/g)).toHaveLength(2);
    expect(html).toContain("← 2024 · 101");
  });

  it("draws the step's earlier ceiling", () => {
    const html = renderToStaticMarkup(
      <CorridorChart
        series={series}
        step={{ prior: 102, since: "2025-04-01" }}
      />,
    );
    expect(html).toContain('class="step"');
    expect(html).toContain("earlier ceiling 102");
  });

  it("prints nothing with no draws", () => {
    expect(renderToStaticMarkup(<CorridorChart series={[]} />)).toBe("");
  });

  it("pushes the right-hand labels 13 px apart", () => {
    const out = pushApart([
      { y: 50, t: "a", k: "" },
      { y: 44, t: "b", k: "" },
      { y: 52, t: "c", k: "" },
    ]);
    expect(out.map((l) => l.y)).toEqual([44, 57, 70]);
  });

  it("rounds like 53", () => {
    expect(nice(131.4)).toBe("131");
    expect(nice(4.56)).toBe("4.6");
    expect(nice(0.456)).toBe("0.46");
  });
});

describe("the hunch board (40b)", () => {
  const c = hunch as unknown as HunchCase;
  const rows = (hunches as unknown as { open: HunchRow[] }).open;

  it("prints a Watch row and a rail card per hunch, with the stamp", () => {
    const w = renderToStaticMarkup(<WatchList rows={rows} />);
    expect(w.match(/class="wrow"/g)).toHaveLength(rows.length);
    const r = renderToStaticMarkup(<HunchRail rows={rows} />);
    expect(r.match(/class="hc"/g)).toHaveLength(rows.length);
    expect(r).toContain(`class="ks ${rows[0]!.kind}"`);
  });

  it("prints the case: bars heaviest first, chips, the test and five folds", () => {
    const html = renderToStaticMarkup(<CaseView c={c} onCase={() => {}} />);
    const shares = [...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]);
    const byWeight = [...c.explanations]
      .sort((a, b) => b.weight - a.weight)
      .map((e) => e.id);
    expect(shares).toEqual(byWeight);
    expect(html.match(/class="hfold"/g)).toHaveLength(5);
    expect(html).toContain("Write it down");
    for (const chip of c.question!.chips) expect(html).toContain(chip.label.replace(/'/g, "&#x27;"));
    // every draw from a file links to its upload when the server sent one
    const linked = c.series.filter((p) => p.file && p.upload).length;
    expect(html.match(/href="\/blood\/uploads\//g)?.length ?? 0).toBe(linked);
  });
});
