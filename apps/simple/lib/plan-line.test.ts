import { describe, expect, it } from "vitest";
import {
  addMonths,
  occurrences,
  scheduleOf,
  slotBucket,
  spreadDays,
  SLOT_LABEL,
  SLOT_MINUTES,
  SLOTS,
  type OccurrenceItem,
} from "./plan-line";

/**
 * Phase 32a section 2. `plan-month.html` prints a day in clock order and a
 * supplements table with a dose, a slot, a "with what" and an "until". The
 * lines these come off are the owner's own, so they are here verbatim.
 */
const SELENIUM =
  "Selenium 200 µg/day as selenomethionine for 6 months · capsule · once daily with breakfast";

const item = (over: Partial<OccurrenceItem> & { id: string }): OccurrenceItem => ({
  title: over.id,
  timeOfDay: null,
  daysOfWeek: null,
  startedAt: null,
  endsAt: null,
  active: true,
  ...over,
});

describe("the owner's three lines", () => {
  it("reads the selenium line whole", () => {
    expect(scheduleOf(SELENIUM)).toEqual({
      timeOfDay: "breakfast",
      daysOfWeek: null,
      doseAmount: 200,
      doseUnit: "µg",
      withWhat: "with breakfast",
      months: 6,
    });
  });

  it("spreads three sessions a week over Mon, Wed and Fri", () => {
    expect(scheduleOf("Resistance training 3x/week")).toEqual({
      timeOfDay: null,
      daysOfWeek: [1, 3, 5],
      doseAmount: null,
      doseUnit: null,
      withWhat: null,
      months: null,
    });
  });

  it("leaves a daily rule with no time and no dose", () => {
    expect(scheduleOf("10 000 steps daily")).toEqual({
      timeOfDay: null,
      daysOfWeek: null,
      doseAmount: null,
      doseUnit: null,
      withWhat: null,
      months: null,
    });
  });
});

describe("the dose", () => {
  it("takes both micro signs and mcg as one unit", () => {
    for (const line of ["Selenium 200 µg", "Selenium 200 μg", "Selenium 200 mcg"]) {
      const s = scheduleOf(line);
      expect(s.doseAmount).toBe(200);
      expect(s.doseUnit).toBe("µg");
    }
  });

  it("keeps mg, g, IU and ml apart", () => {
    expect(scheduleOf("Iron 60 mg")).toMatchObject({ doseAmount: 60, doseUnit: "mg" });
    expect(scheduleOf("Creatine 5 g daily")).toMatchObject({ doseAmount: 5, doseUnit: "g" });
    expect(scheduleOf("Vitamin D3 4 000 IU")).toMatchObject({
      doseAmount: 4000,
      doseUnit: "IU",
    });
    expect(scheduleOf("Olive oil 15 ml")).toMatchObject({ doseAmount: 15, doseUnit: "ml" });
  });

  it("reads a grouped number through a thin space", () => {
    expect(scheduleOf("Vitamin D3 4 000 IU").doseAmount).toBe(4000);
    expect(scheduleOf("Vitamin D3 4 000 IU").doseAmount).toBe(4000);
  });

  it("finds no dose where the line names no unit", () => {
    expect(scheduleOf("Sardines, three tins a week").doseAmount).toBeNull();
    expect(scheduleOf("Walk 30 minutes after dinner").doseUnit).toBeNull();
  });
});

describe("the time of day", () => {
  it("takes every slot word", () => {
    const said: [string, string][] = [
      ["Ten minutes outside in the morning", "morning"],
      ["Selenium at breakfast", "breakfast"],
      ["Protein before the starch at lunch", "midday"],
      ["A walk at noon", "midday"],
      ["A nap in the afternoon", "afternoon"],
      ["Vitamin D with dinner", "dinner"],
      ["Magnesium with supper", "dinner"],
      ["Reading in the evening", "evening"],
      ["Magnesium at bedtime", "bedtime"],
      ["Magnesium before bed", "bedtime"],
      ["Magnesium at night", "bedtime"],
    ];
    for (const [line, slot] of said)
      expect([line, scheduleOf(line).timeOfDay]).toEqual([line, slot]);
  });

  it("lets a literal clock time beat a slot word", () => {
    expect(scheduleOf("Iron 60 mg at 21:00, with dinner").timeOfDay).toBe("21:00");
    expect(scheduleOf("Outside at 7:10 in the morning").timeOfDay).toBe("07:10");
  });

  it("takes the first slot the line names", () => {
    expect(scheduleOf("Breakfast, then a walk in the afternoon").timeOfDay).toBe(
      "breakfast",
    );
  });

  it("says nothing when the line says nothing", () => {
    expect(scheduleOf("Cut added sugar").timeOfDay).toBeNull();
  });
});

describe("the days of the week", () => {
  it("reads every way a line counts a week", () => {
    expect(scheduleOf("Resistance training 3 times a week").daysOfWeek).toEqual([1, 3, 5]);
    expect(scheduleOf("Resistance training three times a week").daysOfWeek).toEqual([
      1, 3, 5,
    ]);
    expect(scheduleOf("Sauna twice weekly").daysOfWeek).toEqual([1, 4]);
    expect(scheduleOf("Long run once a week").daysOfWeek).toEqual([1]);
    expect(scheduleOf("Sardines 3 tins / week").daysOfWeek).toEqual([1, 3, 5]);
  });

  it("spreads n days evenly from Monday", () => {
    expect(spreadDays(1)).toEqual([1]);
    expect(spreadDays(2)).toEqual([1, 4]);
    expect(spreadDays(3)).toEqual([1, 3, 5]);
    expect(spreadDays(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  /**
   * `days_of_week` cannot hold a parity: a two-day cycle drifts across the
   * week. Phase 32a added no `interval` column, so these lines stay every-day
   * and the page says "alternate days" as a note. It is a known gap.
   */
  it("leaves alternate days as every day, because no column holds a parity", () => {
    for (const line of [
      "Iron 60 mg every other day",
      "Iron 60 mg on alternate days",
      "Iron alternating days",
      "Iron, alt. days",
    ])
      expect([line, scheduleOf(line).daysOfWeek]).toEqual([line, null]);
  });

  it("leaves a daily line alone", () => {
    expect(scheduleOf("Cut added sugar every day").daysOfWeek).toBeNull();
  });
});

describe("with what, exactly as written", () => {
  it("keeps the phrase", () => {
    expect(scheduleOf("Selenium 200 µg with breakfast").withWhat).toBe("with breakfast");
    expect(scheduleOf("Vitamin D3 with the largest fat of the day").withWhat).toBe(
      "with the largest fat of the day",
    );
  });

  it("keeps both halves of an empty-stomach line", () => {
    expect(scheduleOf("Iron 60 mg, on an empty stomach, with vitamin C").withWhat).toBe(
      "on an empty stomach · with vitamin C",
    );
  });

  it("stops before the duration", () => {
    expect(scheduleOf("Selenium with breakfast for 6 months").withWhat).toBe(
      "with breakfast",
    );
  });

  it("invents nothing", () => {
    expect(scheduleOf("10 000 steps daily").withWhat).toBeNull();
  });
});

describe("how long it runs", () => {
  it("reads the months off the line", () => {
    expect(scheduleOf(SELENIUM).months).toBe(6);
    expect(scheduleOf("Ashwagandha for 3 months").months).toBe(3);
    expect(scheduleOf("Creatine daily").months).toBeNull();
  });

  it("turns months into a day, clamped to the end of the month", () => {
    expect(addMonths("2026-09-03", 6)).toBe("2027-03-03");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 3)).toBe("2027-03-15");
  });
});

describe("the four columns of the schedule table", () => {
  it("buckets every slot", () => {
    expect(SLOTS.map(slotBucket)).toEqual(["M", "M", "N", "N", "E", "E", "B"]);
    expect(slotBucket(null)).toBeNull();
    expect(slotBucket("21:00")).toBeNull();
  });

  it("names and places all seven slots", () => {
    for (const s of SLOTS) {
      expect(SLOT_LABEL[s]).toMatch(/^[A-Z]/);
      expect(SLOT_MINUTES[s]).toBeGreaterThan(0);
    }
    expect(SLOTS.map((s) => SLOT_MINUTES[s])).toEqual(
      [...SLOTS.map((s) => SLOT_MINUTES[s])].sort((a, b) => a - b),
    );
  });
});

describe("occurrences", () => {
  const day = (o: { day: string }) => o.day;

  it("expands an every-day item across an inclusive range", () => {
    const out = occurrences([item({ id: "a" })], "2026-09-01", "2026-09-03");
    expect(out.map(day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(out.every((o) => o.itemId === "a" && o.order === 0)).toBe(true);
  });

  it("never runs an inactive item", () => {
    expect(
      occurrences([item({ id: "a", active: false })], "2026-09-01", "2026-09-30"),
    ).toEqual([]);
  });

  it("starts on startedAt, not before", () => {
    const out = occurrences(
      [item({ id: "a", startedAt: "2026-09-02" })],
      "2026-08-31",
      "2026-09-03",
    );
    expect(out.map(day)).toEqual(["2026-09-02", "2026-09-03"]);
  });

  it("runs through endsAt and stops the day after", () => {
    const out = occurrences(
      [item({ id: "a", endsAt: "2026-09-02" })],
      "2026-09-01",
      "2026-09-04",
    );
    expect(out.map(day)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("keeps a weekday-restricted item to its days across a month", () => {
    const out = occurrences(
      [item({ id: "gym", daysOfWeek: [1, 3, 5] })],
      "2026-09-01",
      "2026-09-30",
    );
    // September 2026 starts on a Tuesday.
    expect(out.slice(0, 4).map(day)).toEqual([
      "2026-09-02",
      "2026-09-04",
      "2026-09-07",
      "2026-09-09",
    ]);
    expect(out).toHaveLength(13);
  });

  it("puts the day in clock order, a time before a slot before nothing", () => {
    const out = occurrences(
      [
        item({ id: "sugar", title: "Cut added sugar" }),
        item({ id: "iron", title: "Iron", timeOfDay: "21:00" }),
        item({ id: "sel", title: "Selenium", timeOfDay: "breakfast" }),
        item({ id: "sun", title: "Ten minutes outside", timeOfDay: "morning" }),
        item({ id: "d3", title: "Vitamin D3", timeOfDay: "dinner" }),
      ],
      "2026-09-03",
      "2026-09-03",
    );
    expect(out.map((o) => o.itemId)).toEqual(["sun", "sel", "d3", "iron", "sugar"]);
    expect(out.map((o) => o.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns a time only for a literal clock time", () => {
    const out = occurrences(
      [
        item({ id: "iron", timeOfDay: "21:00" }),
        item({ id: "sel", timeOfDay: "breakfast" }),
        item({ id: "sugar" }),
      ],
      "2026-09-03",
      "2026-09-03",
    );
    expect(out.map((o) => [o.itemId, o.time, o.slot])).toEqual([
      ["sel", null, "breakfast"],
      ["iron", "21:00", null],
      ["sugar", null, null],
    ]);
  });

  it("sorts the untimed rows by title, so the order is stable", () => {
    const out = occurrences(
      [item({ id: "b", title: "Zinc" }), item({ id: "a", title: "Ashwagandha" })],
      "2026-09-03",
      "2026-09-03",
    );
    expect(out.map((o) => o.itemId)).toEqual(["a", "b"]);
  });

  it("returns nothing when the range runs backwards", () => {
    expect(occurrences([item({ id: "a" })], "2026-09-03", "2026-09-01")).toEqual([]);
  });
});
