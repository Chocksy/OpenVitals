import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MetricRow } from "./data";
import { occurrenceItemOf, occurrences } from "./plan-line";
import { scoreOf } from "./score";
import {
  bloodAsOf,
  daysFrom,
  drawLine,
  inputOn,
  kcalLine,
  labsOf,
  movesOn,
  sleepLine,
  type ScoreRows,
} from "./score-days";

/** Mon 2026-09-21 to Thu 2026-09-24, one item due daily and one on weekdays 1 and 3. */
const rows = (over: Partial<ScoreRows> = {}): ScoreRows => ({
  logs: [
    { day: "2026-09-21", sleepHours: 7.5 },
    { day: "2026-09-22", sleepHours: 5.5 },
    { day: "2026-09-23", sleepHours: 8 },
  ],
  items: [
    {
      id: "walk",
      title: "Walk after lunch",
      timeOfDay: "midday",
      daysOfWeek: null,
      startedAt: "2026-09-01",
      endsAt: null,
      active: true,
    },
    {
      id: "lift",
      title: "Resistance training",
      timeOfDay: "evening",
      daysOfWeek: [1, 3],
      startedAt: "2026-09-01",
      endsAt: null,
      active: true,
    },
  ],
  ticks: [
    { itemId: "walk", day: "2026-09-21", done: true },
    { itemId: "lift", day: "2026-09-21", done: true },
    { itemId: "walk", day: "2026-09-22", done: true },
  ],
  meals: [
    { day: "2026-09-21", kcal: 900, proteinG: 60 },
    { day: "2026-09-21", kcal: 800, proteinG: 50 },
    { day: "2026-09-23", kcal: 1240, proteinG: 62 },
  ],
  labs: [
    {
      code: "ldl_cholesterol",
      name: "LDL",
      day: "2026-04-23",
      value: 168,
      status: "red",
      draw: true,
    },
    {
      code: "hdl_cholesterol",
      name: "HDL",
      day: "2026-04-23",
      value: 50,
      status: "amber",
      draw: true,
    },
    {
      code: "ldl_cholesterol",
      name: "LDL",
      day: "2026-09-23",
      value: 131,
      status: "amber",
      draw: true,
    },
    {
      code: "hdl_cholesterol",
      name: "HDL",
      day: "2026-09-23",
      value: 52,
      status: "amber",
      draw: true,
    },
  ],
  targets: { kcal: 1900, proteinG: 120 },
  genes: 63,
  ...over,
});

const WINDOW = { to: "2026-09-24", n: 4 };

describe("daysFrom", () => {
  const days = daysFrom(rows(), WINDOW);

  it("returns n days, oldest first, ending on `to`", () => {
    expect(days.map((d) => d.day)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
  });

  it("scores a day off its own rows, blood as of that day", () => {
    // Mon: sleep 100, moves 2/2 100, kcal 1700 → 100, protein 110/120 → 92.
    // life 98; blood as of Mon: one rose, one amber → 25; genes 63.
    // 0.4 × 98 + 0.45 × 25 + 0.15 × 63 = 39.2 + 11.25 + 9.45 = 59.9 → 60.
    expect(days[0]).toMatchObject({
      score: 60,
      life: 98,
      blood: 25,
      genes: 63,
      draw: false,
    });
  });

  it("has no reason effect on the first scored day", () => {
    expect(days[0]!.reason).toMatchObject({ sub: "Lifestyle", effect: null });
  });

  it("names the row that moved most, with the score change", () => {
    // Tue: sleep 5.5 → 63, moves 1/1 → 100, no meal: life 82.
    // 32.8 + 11.25 + 9.45 = 53.5 → 54; Mon was 60.
    expect(days[1]).toMatchObject({ score: 54, life: 82 });
    expect(days[1]!.reason).toEqual({
      text: "Sleep 5h 30",
      sub: "Lifestyle",
      effect: -6,
    });
  });

  it("puts the draw first on a draw day, with the marker that moved most", () => {
    // Wed: LDL 131 amber and HDL 52 amber → blood 50.
    expect(days[2]).toMatchObject({ draw: true, blood: 50 });
    expect(days[2]!.reason).toMatchObject({
      text: "Blood draw: LDL 168 → 131",
      sub: "Blood",
    });
  });

  it("leaves a day with no data at all unscored, with no reason", () => {
    expect(days[3]).toEqual({
      day: "2026-09-24",
      score: null,
      life: null,
      blood: null,
      genes: null,
      draw: false,
      reason: null,
    });
  });

  it("does not count an item before it started", () => {
    const late = daysFrom(
      rows({
        items: rows().items.map((i) => ({ ...i, startedAt: "2026-09-22" })),
      }),
      { to: "2026-09-21", n: 1 },
    );
    // Mon: no move due, so life is sleep, kcal and protein: (100 + 100 + 92) / 3.
    expect(late[0]!.life).toBe(97);
  });
});

describe("bloodAsOf", () => {
  it("takes the newest value per marker on or before the day", () => {
    const labs = rows().labs;
    expect(bloodAsOf(labs, "2026-04-22")).toBeNull();
    expect(bloodAsOf(labs, "2026-05-01")).toEqual({
      green: 0,
      amber: 1,
      rose: 1,
    });
    expect(bloodAsOf(labs, "2026-09-23")).toEqual({
      green: 0,
      amber: 2,
      rose: 0,
    });
  });

  it("leaves a marker with no band out of the count", () => {
    expect(
      bloodAsOf(
        [
          {
            code: "x",
            name: "X",
            day: "2026-01-01",
            value: 1,
            status: "gray",
            draw: true,
          },
        ],
        "2026-02-01",
      ),
    ).toBeNull();
  });
});

describe("today and the calendar share one input", () => {
  const DAY = "2026-09-23";

  /** What `todayBody` hands `inputOn`, built the way it builds it. */
  const todayInput = (r: ScoreRows) => {
    const done = new Set(
      r.ticks.filter((t) => t.day === DAY && t.done).map((t) => t.itemId),
    );
    // `planTodayBody`: one row per occurrence, done off that day's ticks
    const adopted = occurrences(r.items, DAY, DAY).map((o) => ({
      itemId: o.itemId,
      done: done.has(o.itemId),
    }));
    const eaten = r.meals.filter((m) => m.day === DAY);
    return inputOn(DAY, {
      sleepHours: r.logs.find((l) => l.day === DAY)?.sleepHours ?? null,
      dueIds: adopted.map((a) => a.itemId),
      ticks: adopted,
      kcal: eaten.reduce((n, m) => n + (m.kcal ?? 0), 0),
      proteinG: eaten.reduce((n, m) => n + (m.proteinG ?? 0), 0),
      targets: r.targets,
      labs: r.labs,
      genes: r.genes,
    });
  };

  it("scores daysFrom's last day exactly as todayBody scores today", () => {
    const r = rows({
      ticks: [
        ...rows().ticks,
        { itemId: "walk", day: DAY, done: true },
        { itemId: "lift", day: DAY, done: false },
      ],
    });
    const last = daysFrom(r, { to: DAY, n: 3 }).at(-1)!;
    const input = todayInput(r);
    expect(input.moves).toEqual({ done: 1, due: 2 });
    expect(input.blood).toEqual({ green: 0, amber: 2, rose: 0 });
    const today = scoreOf(input);
    expect(last).toMatchObject({
      day: DAY,
      score: today.score,
      life: today.life,
      blood: today.blood,
      genes: today.genes,
    });
  });

  it("counts a move from the day it was adopted when it has no start", () => {
    const item = occurrenceItemOf({
      id: "walk",
      text: "Walk",
      timeOfDay: null,
      daysOfWeek: null,
      startedAt: null,
      endsAt: null,
      active: true,
      createdAt: new Date(2026, 8, 23, 9),
    });
    expect(item.startedAt).toBe("2026-09-23");
    expect(occurrences([item], "2026-09-22", "2026-09-22")).toEqual([]);
    expect(occurrences([item], "2026-09-23", "2026-09-23")).toHaveLength(1);
  });

  it("counts a done tick only on a move due that day", () => {
    expect(movesOn([], [{ itemId: "walk", done: true }])).toBeNull();
    expect(
      movesOn(
        ["walk"],
        [
          { itemId: "walk", done: true },
          { itemId: "lift", done: true },
          { itemId: null, done: true },
        ],
      ),
    ).toEqual({ done: 1, due: 1 });
  });

  it("reads blood off the metric rows as the Status counters do, as of the day", () => {
    const metric = (
      code: string,
      rs: { observedAt: string; value: number; source?: string | null }[],
      status: MetricRow["status"],
    ) =>
      ({
        code,
        name: code.toUpperCase(),
        optimalLow: 40,
        optimalHigh: 100,
        derived: false,
        rows: rs.map((x) => ({
          valueText: null,
          unit: null,
          refLow: 0,
          refHigh: 130,
          source: null,
          ...x,
        })),
        status,
      }) as unknown as MetricRow;
    const metrics = [
      // the phone's reading and the draw on one day: the draw is `latest`
      metric(
        "ldl",
        [
          { observedAt: "2026-04-23", value: 168 },
          { observedAt: "2026-09-23", value: 150, source: "healthkit" },
          { observedAt: "2026-09-23", value: 90 },
        ],
        "green",
      ),
      metric("hdl", [{ observedAt: "2026-09-23", value: 120 }], "amber"),
    ];
    const counters = { green: 0, amber: 0, rose: 0 };
    for (const m of metrics)
      if (m.status === "green") counters.green++;
      else if (m.status === "amber") counters.amber++;
      else if (m.status === "red") counters.rose++;
    expect(bloodAsOf(labsOf(metrics), "2026-09-23")).toEqual(counters);
    // before the September draw only the April LDL existed, and it was off
    expect(bloodAsOf(labsOf(metrics), "2026-05-01")).toEqual({
      green: 0,
      amber: 0,
      rose: 1,
    });
  });
});

describe("the reason lines", () => {
  it("writes sleep in hours and minutes", () => {
    expect(sleepLine(5 + 40 / 60)).toBe("Sleep 5h 40");
    expect(sleepLine(7)).toBe("Sleep 7h 00");
    expect(sleepLine(6.999)).toBe("Sleep 7h 00");
  });

  it("groups thousands with a space", () => {
    expect(kcalLine(1240, 1900)).toBe("1 240 of 1 900 kcal");
    expect(kcalLine(820, 1900)).toBe("820 of 1 900 kcal");
  });

  it("names the marker that moved most, by share", () => {
    expect(drawLine(rows().labs, "2026-09-23")).toBe(
      "Blood draw: LDL 168 → 131",
    );
  });

  it("names a first draw's first marker with no arrow", () => {
    expect(drawLine(rows().labs, "2026-04-23")).toBe("Blood draw: LDL 168");
  });
});

describe("GET /api/score/days", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/score/days/route.ts", import.meta.url)),
    "utf8",
  );

  it("is signed in, clamps n to 1–91 and defaults `to` to today", () => {
    expect(route).toContain("currentUserId()");
    expect(route).toMatch(/Math\.min\(91, Math\.max\(1,/);
    expect(route).toContain("localDay()");
  });
});
