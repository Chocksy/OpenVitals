import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryChart } from "./history-chart";
import { goalAim, goalWords, markTitle, Ruler } from "./ruler";

/**
 * Phase 31a items 5, 6 and 7, on the owner's own LDL.
 *
 * The goal is 70–100 mg/dL by Dec 1 2026 and the last draw is 131. The ruler
 * used to hatch from 131 down to 100 and print "target 100", which is one edge
 * of a goal rather than the goal. Every mark had a number and no date. And the
 * `mini` chart kept a y gutter it prints no ticks into.
 */
const ldl = {
  refLow: 0,
  refHigh: 100,
  optimalLow: 0,
  optimalHigh: 70,
  unit: "mg/dL",
} as const;

const draws = [
  { date: "2025-12-09", value: 106 },
  { date: "2026-04-23", value: 131 },
];

describe("goalAim", () => {
  it("aims at the near edge of a band from outside it", () => {
    expect(goalAim(131, 70, 100)).toBe(100);
    expect(goalAim(40, 70, 100)).toBe(70);
  });

  it("aims at the value itself once the goal is reached", () => {
    expect(goalAim(85, 70, 100)).toBe(85);
  });

  it("is its own bound when the goal has one side", () => {
    expect(goalAim(131, null, 100)).toBe(100);
    expect(goalAim(20, 30, null)).toBe(30);
    expect(goalAim(20, null, null)).toBe(null);
  });
});

describe("goalWords", () => {
  it("says a two-sided goal as a band", () => {
    expect(goalWords(70, 100)).toBe("70–100");
  });

  it("says a one-sided goal as its bound", () => {
    expect(goalWords(null, 100)).toBe("100");
    expect(goalWords(70, null)).toBe("over 70");
  });
});

describe("markTitle", () => {
  it("reads a mark out: date, value with unit, state", () => {
    expect(markTitle(131, "mg/dL", "2026-04-23", "off")).toBe(
      "Apr 23 2026 · 131 mg/dL · off",
    );
  });

  it("drops what it does not have", () => {
    expect(markTitle(131, "mg/dL")).toBe("131 mg/dL");
  });
});

describe("the ruler, with a goal that has two bounds", () => {
  const raw = renderToStaticMarkup(
    <Ruler
      value={131}
      valueDate="2026-04-23"
      prev={106}
      prevDate="2025-12-09"
      {...ldl}
      target={100}
      targetLow={70}
      targetHigh={100}
      targetDate="2026-12-01"
    />,
  );

  it("draws the goal as a band, not a tick", () => {
    expect(raw).toContain("goal wide");
    expect(raw).toContain("band goal-in");
  });

  it("labels the band, with its date", () => {
    expect(raw).toContain('data-label="target 70–100 · Dec 1 2026"');
    expect(raw).not.toContain("target 100 ·");
  });

  it("keeps a shorter label for the phone, where the date has no room", () => {
    expect(raw).toContain('data-short="target 70–100"');
  });

  it("still draws a tick for a one-sided goal", () => {
    const one = renderToStaticMarkup(
      <Ruler
        value={131}
        {...ldl}
        target={100}
        targetHigh={100}
        targetDate="2026-12-01"
      />,
    );
    expect(one).not.toContain("goal wide");
    expect(one).toContain('data-label="target 100 · Dec 1 2026"');
  });

  it("hatches from the value to the nearer edge of the band", () => {
    /* 131 down to 100, never down to 70: the pace band's own two ends. */
    expect(raw).toContain("band pace");
    const pace = /class="band pace" style="--a:([\d.]+)%;--b:([\d.]+)%"/.exec(
      raw,
    );
    expect(pace).not.toBeNull();
    const scale = renderToStaticMarkup(
      <Ruler value={131} {...ldl} target={100} targetHigh={100} />,
    );
    const one = /class="band pace" style="--a:([\d.]+)%;--b:([\d.]+)%"/.exec(
      scale,
    );
    expect(pace![1]).toBe(one![1]);
  });

  it("reads every mark out on hover and in a title", () => {
    expect(raw).toContain('data-hover="Apr 23 2026 · 131 mg/dL · off"');
    expect(raw).toContain(
      'data-hover="Dec 9 2025 · 106 mg/dL · the draw before"',
    );
    expect(raw).toContain('title="Apr 23 2026 · 131 mg/dL · off"');
  });
});

describe("the history chart, with the same goal", () => {
  const raw = renderToStaticMarkup(
    <HistoryChart
      title="LDL cholesterol"
      points={draws}
      {...ldl}
      target={100}
      targetLow={70}
      targetHigh={100}
      targetDate="2026-12-01"
    />,
  );

  it("draws the goal band and names it, once", () => {
    expect(raw).toContain("hist-band goal");
    expect(raw).toContain("target 70–100");
    /* the band carries the name; the bar does not print it a second time
       over the last diamond */
    expect(raw.match(/target 70–100/g)).toHaveLength(2);
  });

  it("says the whole goal in the legend, with its unit and its date", () => {
    expect(raw).toContain("target — 70–100");
    expect(raw).toContain("mg/dL by Dec 1 2026");
  });

  it("gives every diamond a title and a hover label", () => {
    expect(raw).toContain('title="Apr 23 2026 · 131 mg/dL · off"');
    expect(raw).toContain('class="lbl"');
    expect(raw).toContain("Dec 9 2025 · 106 mg/dL · off");
  });

  it("keeps a one-sided goal as one bar", () => {
    const one = renderToStaticMarkup(
      <HistoryChart
        title="LDL cholesterol"
        points={draws}
        {...ldl}
        target={100}
        targetHigh={100}
        targetDate="2026-12-01"
      />,
    );
    expect(one).not.toContain("hist-band goal");
    expect(one).toContain("target 100");
  });
});

describe("the chart's left gutter", () => {
  const props = { title: "LDL cholesterol", points: draws, ...ldl };

  it("is the widest tick label plus 8 px", () => {
    const raw = renderToStaticMarkup(<HistoryChart {...props} />);
    const gut = /--gut:(\d+)px/.exec(raw);
    expect(gut).not.toBeNull();
    /* the ticks here are 160, 100 and 0: three glyphs at 6.4 px, plus 8. */
    expect(Number(gut![1])).toBe(Math.ceil(3 * 6.4 + 8));
    expect(Number(gut![1])).toBeLessThan(60);
  });

  it("is nothing at all on the mini chart, which prints no ticks", () => {
    const raw = renderToStaticMarkup(<HistoryChart {...props} mini />);
    expect(raw).toContain("--gut:0px");
    expect(raw).not.toContain("hist-y");
  });
});
