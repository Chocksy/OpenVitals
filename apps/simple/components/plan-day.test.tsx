import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Phase 32a section 2, on `docs/mockups/v4/plan-month.html`.
 *
 * The mockup's own "Where the numbers come from" note calls its clock times,
 * its training weekdays and its alternate-day iron parity illustrative. So the
 * lock is mostly about what the page refuses to print: no invented time, no
 * suggestion nobody proposed, no draw dot in a month with no planned draw.
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

const { PlanDay, atLabel, doseOf, tagOf } = await import("./plan-day");
const { PlanMonth, Supplements, dotOf } = await import("./plan-month");
type PlanItem = Parameters<typeof PlanDay>[0]["items"][number];

const strip = (done: number[] = []): number[] =>
  Array.from({ length: 30 }, (_, i) => (done.includes(i) ? 1 : 0));

const item = (over: Partial<PlanItem> & { id: string }): PlanItem => ({
  text: over.id,
  why: null,
  metricCodes: [],
  cadence: "daily",
  active: true,
  startedAt: null,
  timeOfDay: null,
  daysOfWeek: null,
  doseAmount: null,
  doseUnit: null,
  withWhat: null,
  endsAt: null,
  adherence30: 0,
  strip30: strip(),
  ...over,
});

const nameOf = (code: string) => code.replace(/_/g, " ");

/** A Thursday, so the weekday arithmetic is checkable. */
const TODAY = "2026-09-03";

describe("the time column", () => {
  it("prints a stored clock time exactly", () => {
    expect(atLabel("21:00", null)).toBe("21:00");
  });

  it("prints the slot's own word, never a made-up clock time", () => {
    expect(atLabel(null, "breakfast")).toBe("breakfast");
    expect(atLabel(null, "bedtime")).toBe("bedtime");
  });

  it("prints nothing when the line said nothing", () => {
    expect(atLabel(null, null)).toBe("");
  });
});

describe("the dose", () => {
  it("prints the amount and the unit the line was written in", () => {
    expect(doseOf(item({ id: "se", doseAmount: "200", doseUnit: "µg" }))).toBe(
      "200 µg",
    );
  });

  it("is nothing when no amount was stored", () => {
    expect(doseOf(item({ id: "walk" }))).toBe(null);
  });
});

describe("the tag", () => {
  const goal = { metricCode: "ferritin", metricName: "ferritin" };

  it("says suggested when nothing was adopted", () => {
    expect(tagOf(null, undefined)).toBe("suggested");
  });

  it("says every day for a rule with no dose and no weekday", () => {
    expect(tagOf(item({ id: "fibre" }), undefined)).toBe("every day");
  });

  it("names the goal rather than printing 0 %", () => {
    expect(
      tagOf(
        item({ id: "iron", doseAmount: "60", metricCodes: ["ferritin"] }),
        goal,
      ),
    ).toBe("goal · ferritin");
  });

  it("prints the adherence once there is one", () => {
    expect(
      tagOf(
        item({
          id: "se",
          doseAmount: "200",
          adherence30: 86,
          strip30: strip([1, 2, 3]),
          metricCodes: ["tpo"],
        }),
        { metricCode: "tpo", metricName: "TPO" },
      ),
    ).toBe("protocol · 86 %");
  });
});

const day = (props: Partial<Parameters<typeof PlanDay>[0]> = {}) =>
  renderToStaticMarkup(
    <PlanDay
      day={TODAY}
      dayName="Thursday Sep 3 2026"
      items={[]}
      goals={[]}
      suggested={[]}
      reportId={null}
      nameOf={nameOf}
      {...props}
    />,
  );

describe("the Today column", () => {
  const items = [
    item({
      id: "iron",
      text: "Iron 60 mg",
      timeOfDay: "21:00",
      doseAmount: "60",
      doseUnit: "mg",
      metricCodes: ["ferritin"],
    }),
    item({
      id: "se",
      text: "Selenium 200 µg",
      timeOfDay: "breakfast",
      doseAmount: "200",
      doseUnit: "µg",
      adherence30: 86,
      strip30: strip([0, 1, 2]),
    }),
  ];

  it("runs in clock order, breakfast before bedtime", () => {
    const html = day({ items });
    expect(html.indexOf("Selenium")).toBeLessThan(html.indexOf("Iron"));
  });

  it("gives every adopted row a tick that posts the day and the item", () => {
    expect(day({ items })).toContain('role="checkbox"');
  });

  it("prints no suggestion when the report proposed none", () => {
    expect(day({ items })).not.toContain("suggested");
  });

  it("prints a suggestion only with the report that proposed it", () => {
    const props = {
      items,
      suggested: [
        {
          title: "Ten minutes outside",
          why: "Before the first coffee.",
          index: 0,
        },
      ],
    };
    expect(day(props)).not.toContain("Ten minutes outside");
    expect(day({ ...props, reportId: "r1" })).toContain("Ten minutes outside");
  });

  it("says so when the day asks for nothing", () => {
    expect(day()).toContain("The day asks for nothing");
  });

  it("skips an item whose days of the week miss today", () => {
    const monday = item({
      id: "train",
      text: "Resistance training",
      daysOfWeek: [1],
    });
    expect(day({ items: [monday] })).not.toContain("Resistance training");
  });
});

describe("the month's dots", () => {
  it("files a dose under supplements whatever the words say", () => {
    expect(dotOf(item({ id: "se", text: "Selenium", doseAmount: "200" }))).toBe(
      "supp",
    );
  });

  it("reads a session and a food rule off the words", () => {
    expect(dotOf(item({ id: "t", text: "Resistance training" }))).toBe("train");
    expect(dotOf(item({ id: "f", text: "Cut added sugar" }))).toBe("food");
  });

  it("gives an item it cannot classify the plain dot", () => {
    expect(dotOf(item({ id: "x", text: "Ten minutes of daylight" }))).toBe("");
  });
});

const month = (props: Partial<Parameters<typeof PlanMonth>[0]> = {}) =>
  renderToStaticMarkup(
    <PlanMonth
      today={TODAY}
      items={[]}
      goals={[]}
      checkDays={[]}
      nameOf={nameOf}
      {...props}
    />,
  );

describe("the month strip", () => {
  it("outlines today and no other day", () => {
    const html = month();
    expect(html.match(/class="d today"/g)).toHaveLength(1);
  });

  it("draws one cell a day, plus the seven day names", () => {
    const html = month();
    expect(html.match(/class="dow"/g)).toHaveLength(7);
    expect(html.match(/<span class="dn">/g)).toHaveLength(30);
  });

  it("draws no draw dot, and says so, when no goal is dated this month", () => {
    const html = month();
    // the one left is the key's own swatch, which always names the five
    expect(html.match(/<i class="draw"/g)).toHaveLength(1);
    expect(html).toContain("There is no draw dot this month");
  });

  it("draws the draw dot on the day a goal is due", () => {
    const html = month({
      goals: [
        {
          id: "g1",
          metricCode: "ldl",
          metricName: "LDL",
          unit: "mg/dL",
          targetLow: 70,
          targetHigh: 100,
          due: "2026-09-24",
          note: null,
          achievedAt: null,
          current: 131,
          currentAt: "2026-08-01",
          start: 168,
          gap: 31,
          progress: 54,
          reached: false,
        },
      ],
    });
    expect(html.match(/<i class="draw"/g)).toHaveLength(2);
    expect(html).not.toContain("There is no draw dot this month");
  });
});

describe("the supplements schedule", () => {
  const row = item({
    id: "sardines",
    text: "Sardines, three tins",
    doseAmount: "3",
    doseUnit: "tins",
    daysOfWeek: [1, 3, 5],
  });

  const html = renderToStaticMarkup(
    <Supplements items={[row]} goals={[]} nameOf={nameOf} />,
  );

  it("says 'no stop date' rather than leaving the cell blank", () => {
    expect(html).toContain("no stop date");
  });

  it("draws the four slots, none of them on when nothing said when", () => {
    expect(html.match(/<i>M<\/i>/g)).toHaveLength(1);
    expect(html).not.toContain('class="on">M');
  });

  it("lights the slot the line was written in", () => {
    const withSlot = renderToStaticMarkup(
      <Supplements
        items={[{ ...row, timeOfDay: "breakfast" }]}
        goals={[]}
        nameOf={nameOf}
      />,
    );
    expect(withSlot).toContain('class="on">M');
  });

  it("prints nothing at all when no item carries a dose", () => {
    expect(
      renderToStaticMarkup(
        <Supplements
          items={[item({ id: "walk" })]}
          goals={[]}
          nameOf={nameOf}
        />,
      ),
    ).toBe("");
  });
});
