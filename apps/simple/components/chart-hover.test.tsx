import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  cardDate,
  ChartHover,
  type ChartHoverProps,
  flipOf,
  hoverLabel,
  movePct,
} from "./chart-hover";
import { HistoryChart } from "./history-chart";
import { Ruler } from "./ruler";

/**
 * Phase 32a section 5, on the owner's own numbers.
 *
 * `docs/mockups/v4/chart-hover.html`: TPO antibodies 412 IU/mL on Dec 9 2025
 * and 320 on Aug 1 2026, normal 0–34, optimal 0–9, a draw planned for
 * Nov 24 2026 and a target under 100 by Feb 16 2027; LDL 168 mg/dL on
 * Dec 9 2025 and 131 on Aug 1 2026, goal band 70–100 by Dec 1 2026. The −22 %
 * on both cards is the arithmetic between those two pairs.
 */
const tpo: ChartHoverProps = {
  date: "2026-08-01",
  value: 320,
  unit: "IU/mL",
  state: "off",
  tone: "off",
  band: "normal 0–34 · optimal 0–9",
  was: { value: 412, date: "2025-12-09" },
};

const html = (props: ChartHoverProps) =>
  renderToStaticMarkup(<ChartHover {...props} />);

/* ── the five lines ───────────────────────────────────────────────────── */

describe("the card's five lines", () => {
  const raw = html(tpo);

  it("carries the date, the value, the state, the band and the was", () => {
    expect(raw).toContain('<div class="hdate">Sat Aug 1 2026</div>');
    expect(raw).toContain("320<em>IU/mL</em>");
    expect(raw).toContain('<span class="state off">off</span>');
    expect(raw).toContain("normal 0–34 · optimal 0–9");
    expect(raw).toContain("was 412 on Dec 9 2025 · −22 %");
  });

  it("prints them in the mockup's own order", () => {
    const order = ["hdate", "hval", "state off", "t-meta", "hwas"].map((c) =>
      raw.indexOf(c),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is a surface, never a spectrum fill: the state word is text", () => {
    expect(raw).toContain('class="state off"');
    expect(raw).not.toContain("background");
  });

  it("omits the whole was line when there is no previous value", () => {
    const first = html({ ...tpo, was: null });
    expect(first).not.toContain("hwas");
    expect(first).toContain("hdate");
  });
});

/* ── the arithmetic ───────────────────────────────────────────────────── */

describe("movePct", () => {
  it("is −22 % on the real TPO pair", () => {
    expect(movePct(412, 320)).toBe("−22 %");
  });

  it("is −22 % on the real LDL pair too", () => {
    expect(movePct(168, 131)).toBe("−22 %");
  });

  it("signs a rise", () => {
    expect(movePct(106, 131)).toBe("+24 %");
  });

  it("has no percentage to give from zero", () => {
    expect(movePct(0, 12)).toBeNull();
    expect(movePct(Number.NaN, 12)).toBeNull();
  });
});

describe("cardDate", () => {
  it("prints the weekday, the month, the day and the year", () => {
    expect(cardDate("2026-08-01")).toBe("Sat Aug 1 2026");
    expect(cardDate("2025-12-09")).toBe("Tue Dec 9 2025");
  });
});

/* ── the mark with no value ───────────────────────────────────────────── */

describe("a mark with no value yet", () => {
  const raw = html({
    date: "2026-11-24",
    value: null,
    unit: "IU/mL",
    state: "planned",
    tone: "border",
    band: "normal 0–34 · optimal 0–9",
  });

  it("says so in words rather than showing a blank", () => {
    expect(raw).toContain('<div class="hval">no value yet</div>');
    expect(raw).toContain('<span class="state border">planned</span>');
  });

  it("never prints a unit it has no number for", () => {
    expect(raw).not.toContain("<em>IU/mL</em>");
  });

  it("reads out as planned, with no value yet", () => {
    expect(
      hoverLabel({
        date: "2026-11-24",
        value: null,
        unit: "IU/mL",
        state: "planned",
        tone: "border",
        band: null,
      }),
    ).toBe("Tue Nov 24 2026 · no value yet · planned");
  });
});

/* ── the flip ─────────────────────────────────────────────────────────── */

describe("flipOf", () => {
  it("flips the card below a mark above the plot's midline", () => {
    expect(flipOf(20, 8.44).below).toBe(true);
    expect(flipOf(20, 28.89).below).toBe(true);
  });

  it("keeps the card above a mark under the midline", () => {
    expect(flipOf(20, 57.14).below).toBe(false);
    expect(flipOf(20, 77.78).below).toBe(false);
  });

  it("slides the stem right near the right edge", () => {
    expect(flipOf(80.65, 57.14).stemRight).toBe(true);
    expect(flipOf(100, 77.78).stemRight).toBe(true);
  });

  it("leaves the stem on the left everywhere else", () => {
    expect(flipOf(0, 8.44).stemRight).toBe(false);
    expect(flipOf(54.15, 28.89).stemRight).toBe(false);
  });

  it("writes the flip onto the card's own classes", () => {
    expect(html({ ...tpo, below: true })).toContain('class="hovercard below"');
    expect(html({ ...tpo, stemRight: true })).toContain(
      'class="hovercard stem-right"',
    );
    expect(html(tpo)).toContain('class="hovercard"');
  });
});

/* ── the aria-label ───────────────────────────────────────────────────── */

describe("hoverLabel", () => {
  it("carries all five facts as one sentence", () => {
    expect(hoverLabel(tpo)).toBe(
      "Sat Aug 1 2026 · 320 IU/mL · off · normal 0–34 · optimal 0–9 · was 412 on Dec 9 2025 · −22 %",
    );
  });

  it("drops the state word for a target, which has none", () => {
    expect(
      hoverLabel({
        date: "2026-12-01",
        value: 100,
        unit: "mg/dL",
        state: "",
        tone: "none",
        band: "target 70–100",
      }),
    ).toBe("Tue Dec 1 2026 · 100 mg/dL · target 70–100");
  });
});

/* ── the two components that hold it ──────────────────────────────────── */

describe("every mark on the history chart carries a card", () => {
  const raw = renderToStaticMarkup(
    <HistoryChart
      title="TPO antibodies"
      unit="IU/mL"
      points={[
        { date: "2025-12-09", value: 412 },
        { date: "2026-08-01", value: 320 },
      ]}
      refLow={0}
      refHigh={34}
      optimalLow={0}
      optimalHigh={9}
      target={100}
      targetDate="2027-02-16"
      plannedDate="2026-11-24"
    />,
  );

  it("gives the was, the now, the planned draw and the target one each", () => {
    expect(raw.match(/class="hovercard/g)).toHaveLength(4);
  });

  it("makes every one of them a focusable hovermark", () => {
    expect(raw.match(/hovermark" tabindex="0" role="img"/g)).toHaveLength(4);
  });

  it("says the planned draw has no value yet", () => {
    expect(raw).toContain(
      'aria-label="Tue Nov 24 2026 · no value yet · planned',
    );
  });

  it("fires one tooltip, not two: no mark keeps its title", () => {
    expect(raw).not.toContain("<div title=");
    expect(raw).not.toContain(' title="');
  });

  it("reads the now mark out with its date, band and was", () => {
    expect(raw).toContain(
      'aria-label="Sat Aug 1 2026 · 320 IU/mL · off · normal 0–34 · optimal 0–9 · was 412 on Dec 9 2025 · −22 %"',
    );
  });
});

describe("every mark on the ruler carries a card", () => {
  const raw = renderToStaticMarkup(
    <Ruler
      value={131}
      valueDate="2026-08-01"
      prev={168}
      prevDate="2025-12-09"
      refLow={0}
      refHigh={100}
      optimalLow={0}
      optimalHigh={70}
      target={100}
      targetLow={70}
      targetHigh={100}
      targetDate="2026-12-01"
      unit="mg/dL"
    />,
  );

  it("gives the mark, the ghost and the goal one each", () => {
    expect(raw.match(/class="hovercard/g)).toHaveLength(3);
    expect(raw.match(/hovermark/g)).toHaveLength(3);
  });

  it("carries the goal band on the mark's own card", () => {
    expect(raw).toContain("goal band 70–100");
  });

  it("is the LDL pair from the mockup: −22 %", () => {
    expect(raw).toContain("was 168 on Dec 9 2025 · −22 %");
  });

  it("gives the goal a date instead of a state word", () => {
    expect(raw).toContain(
      'aria-label="Tue Dec 1 2026 · 100 mg/dL · target 70–100"',
    );
  });

  it("keeps no native tooltip beside the card", () => {
    expect(raw).not.toContain(' title="');
  });
});
