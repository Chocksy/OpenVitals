import { describe, expect, it } from "vitest";
import {
  checkinDue,
  firstState,
  laterOf,
  nextDueOf,
  pickRound,
  type RoundInput,
} from "./checkin";
import type { Move } from "./infogain";

/** A question move on `fact:<key>` whose `moves` come from `swings`. */
function mv(key: string, swings: Record<string, [number, number]>): Move {
  return {
    kind: "question",
    featureId: "fact:" + key,
    label: key,
    cost: 0,
    outcomes: [],
    entropyBefore: 0,
    entropyAfter: 0,
    gain: 0,
    ratio: 0,
    shift: 0,
    moves: Object.entries(swings).map(([id, [from, to]]) => ({ id, from, to })),
  };
}

function input(over: Partial<RoundInput>): RoundInput {
  return {
    moves: [],
    watched: new Set(),
    faded: new Map(),
    missing: new Set(),
    followups: [],
    hunches: [],
    recentKeys: new Set(),
    lastRounds: [],
    siblings: new Map(),
    names: new Map(),
    ages: new Map(),
    values: new Map(),
    nowIso: "2026-10-15T10:00:00Z",
    ...over,
  };
}

const keys = (r: RoundInput) => pickRound(r).map((i) => i.key);

describe("timing (44B)", () => {
  it("is 7 days while something is tried, else 14", () => {
    expect(nextDueOf("2026-10-01T10:00:00Z", true)).toBe(
      "2026-10-08T10:00:00.000Z",
    );
    expect(nextDueOf("2026-10-01T10:00:00Z", false)).toBe(
      "2026-10-15T10:00:00.000Z",
    );
  });
  it("asks later in 3 hours before 18:00 local, else next day 09:00 local", () => {
    // 12:00 in UTC+3 is 09:00Z
    expect(laterOf("2026-10-01T09:00:00Z", 180)).toBe(
      "2026-10-01T12:00:00.000Z",
    );
    // 23:30 in UTC+3 is 20:30Z; next day 09:00 local is 06:00Z
    expect(laterOf("2026-10-01T20:30:00Z", 180)).toBe(
      "2026-10-02T06:00:00.000Z",
    );
    // 16:00 local: +3 h is 19:00, past 18:00, so next day 09:00
    expect(laterOf("2026-10-01T13:00:00Z", 180)).toBe(
      "2026-10-02T06:00:00.000Z",
    );
  });
  it("is never due while setup is due or within 7 days of setup", () => {
    const s = firstState("2026-10-01T10:00:00Z", "2026-10-01");
    expect(checkinDue(s, true, null, "2026-12-01T00:00:00Z")).toBe(false);
    expect(
      checkinDue(s, false, "2026-10-01T10:00:00Z", "2026-10-04T10:00:00Z"),
    ).toBe(false);
    expect(
      checkinDue(s, false, "2026-10-01T10:00:00Z", "2026-10-08T10:00:00Z"),
    ).toBe(true);
  });
  it("waits for a snooze", () => {
    const s = {
      ...firstState(null, "2026-10-01"),
      snoozedUntil: "2026-10-09T06:00:00Z",
    };
    expect(checkinDue(s, false, null, "2026-10-08T12:00:00Z")).toBe(false);
    expect(checkinDue(s, false, null, "2026-10-09T06:00:00Z")).toBe(true);
  });
  it("starts an account that never ran setup 7 days after ship", () => {
    expect(firstState(null, "2026-10-01").nextDue).toBe(
      "2026-10-08T00:00:00.000Z",
    );
  });
  it("keeps a round in progress due until it is finished, unless snoozed", () => {
    const s = {
      ...firstState(null, "2026-10-01"),
      nextDue: "2026-10-20T00:00:00.000Z",
      started: "2026-10-09T10:00:00.000Z",
    };
    expect(checkinDue(s, false, null, "2026-10-10T10:00:00Z")).toBe(true);
    expect(
      checkinDue(
        { ...s, snoozedUntil: "2026-10-11T06:00:00Z" },
        false,
        null,
        "2026-10-10T10:00:00Z",
      ),
    ).toBe(false);
    expect(
      checkinDue({ ...s, started: null }, false, null, "2026-10-10T10:00:00Z"),
    ).toBe(false);
  });
});

describe("pickRound (44B)", () => {
  const W = new Set(["hypothyroidism", "iron_deficiency", "sleep_apnoea"]);

  it("never returns more than 5", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.5] }),
        mv("f2", { hypothyroidism: [0.3, 0.48] }),
        mv("f3", { hypothyroidism: [0.3, 0.46] }),
        mv("f4", { hypothyroidism: [0.3, 0.44] }),
        mv("f5", { hypothyroidism: [0.3, 0.42] }),
        mv("f6", { hypothyroidism: [0.3, 0.4] }),
        mv("h1", { coeliac: [0.1, 0.3] }),
        mv("h2", { lupus: [0.2, 0.4] }),
        mv("h3", { gout: [0.3, 0.5] }),
      ],
      faded: new Map(["f1", "f2", "f3", "f4", "f5", "f6"].map((k) => [k, 0.3])),
      hunches: [
        { hunchId: "a", conditionId: "coeliac", p: 0.1 },
        { hunchId: "b", conditionId: "lupus", p: 0.2 },
        { hunchId: "c", conditionId: "gout", p: 0.3 },
      ],
    });
    expect(keys(r)).toEqual(["f1", "f2", "f3", "h1", "h2"]);
  });

  it("gives pool 1 up to 3 and pool 2 up to 2", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.5] }),
        mv("f2", { hypothyroidism: [0.3, 0.45] }),
        mv("f3", { hypothyroidism: [0.3, 0.4] }),
        mv("f4", { hypothyroidism: [0.3, 0.35] }),
        mv("h1", { coeliac: [0.1, 0.13] }),
        mv("h2", { lupus: [0.2, 0.23] }),
      ],
      faded: new Map([
        ["f1", 0.3],
        ["f2", 0.3],
      ]),
      missing: new Set(["f3", "f4"]),
      hunches: [
        { hunchId: "b", conditionId: "lupus", p: 0.2 },
        { hunchId: "a", conditionId: "coeliac", p: 0.1 },
      ],
    });
    const round = pickRound(r);
    expect(round.map((i) => [i.key, i.pool])).toEqual([
      ["f1", 1],
      ["f2", 1],
      ["f3", 1],
      ["h1", 2],
      ["h2", 2],
    ]);
  });

  it("fills a short pool from the other", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.6] }),
        mv("f2", { hypothyroidism: [0.3, 0.55] }),
        mv("f3", { hypothyroidism: [0.3, 0.5] }),
        mv("f4", { hypothyroidism: [0.3, 0.45] }),
        mv("f5", { hypothyroidism: [0.3, 0.4] }),
        mv("f6", { hypothyroidism: [0.3, 0.35] }),
      ],
      faded: new Map(["f1", "f2", "f3", "f4", "f5", "f6"].map((k) => [k, 0.3])),
    });
    expect(keys(r)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  it("drops a key answered or skipped in the last 30 days", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.6] }),
        mv("f2", { hypothyroidism: [0.3, 0.5] }),
        mv("h1", { coeliac: [0.1, 0.4] }),
        mv("h2", { coeliac: [0.1, 0.2] }),
      ],
      faded: new Map([
        ["f1", 0.3],
        ["f2", 0.3],
      ]),
      hunches: [{ hunchId: "a", conditionId: "coeliac", p: 0.1 }],
      recentKeys: new Set(["f1", "h1"]),
    });
    expect(keys(r)).toEqual(["f2", "h2"]);
  });

  it("drops a move under 2 points on watched conditions", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.315], gout: [0.1, 0.5] }),
        mv("f2", { hypothyroidism: [0.3, 0.33] }),
      ],
      missing: new Set(["f1", "f2"]),
    });
    expect(keys(r)).toEqual(["f2"]);
  });

  it("puts a follow-up first in pool 1 and exempts it from the floor", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.6] }),
        mv("f2", { hypothyroidism: [0.3, 0.5] }),
        mv("f3", { hypothyroidism: [0.3, 0.4] }),
      ],
      faded: new Map(["f1", "f2", "f3"].map((k) => [k, 0.3])),
      followups: [
        {
          itemId: "item-new",
          text: "Magnesium at night",
          target: "Sleep",
          startedAt: "2026-10-01T10:00:00Z",
        },
        {
          itemId: "item-old",
          text: "Walk after dinner",
          target: "Energy",
          startedAt: "2026-09-17T10:00:00Z",
        },
      ],
    });
    const round = pickRound(r);
    expect(round.map((i) => i.key)).toEqual([
      "followup_adherence:item-old",
      "followup_effect:item-old",
      "f1",
      "f2",
      "f3",
    ]);
    expect(round[0]).toMatchObject({
      kind: "adherence",
      itemId: "item-old",
      pool: 1,
      why: "You started this 4 weeks ago.",
    });
    expect(round[1]).toMatchObject({ kind: "effect", itemId: "item-old" });
  });

  it("counts a follow-up's two screens as two of the 5 places", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.6] }),
        mv("f2", { hypothyroidism: [0.3, 0.55] }),
        mv("f3", { hypothyroidism: [0.3, 0.5] }),
        mv("f4", { hypothyroidism: [0.3, 0.45] }),
        mv("f5", { hypothyroidism: [0.3, 0.4] }),
        mv("f6", { hypothyroidism: [0.3, 0.35] }),
        mv("h1", { coeliac: [0.1, 0.3] }),
        mv("h2", { lupus: [0.2, 0.4] }),
      ],
      faded: new Map(
        ["f1", "f2", "f3", "f4", "f5", "f6"].map((k) => [k, 0.3]),
      ),
      hunches: [
        { hunchId: "a", conditionId: "coeliac", p: 0.1 },
        { hunchId: "b", conditionId: "lupus", p: 0.2 },
      ],
      followups: [
        {
          itemId: "item-1",
          text: "Walk after dinner",
          target: "Energy",
          startedAt: "2026-09-17T10:00:00Z",
        },
      ],
    });
    expect(keys(r)).toEqual([
      "followup_adherence:item-1",
      "followup_effect:item-1",
      "f1",
      "h1",
      "h2",
    ]);
  });

  it("ranks a sibling above a key asked in the last 2 rounds", () => {
    const r = input({
      watched: W,
      moves: [
        mv("sym_cold", { hypothyroidism: [0.3, 0.6] }),
        mv("sym_snore", { sleep_apnoea: [0.3, 0.5] }),
        mv("sym_dry_skin", { hypothyroidism: [0.3, 0.4] }),
      ],
      missing: new Set(["sym_cold", "sym_snore", "sym_dry_skin"]),
      lastRounds: [["sym_snore"], ["sym_cold"]],
      siblings: new Map([
        ["sym_cold", new Set(["hypothyroidism"])],
        ["sym_dry_skin", new Set(["hypothyroidism"])],
        ["sym_snore", new Set(["sleep_apnoea"])],
      ]),
    });
    // sym_snore has no sibling among the candidates, so it keeps its place.
    expect(keys(r)).toEqual(["sym_snore", "sym_dry_skin", "sym_cold"]);
  });

  it("picks, per hunch, the question that splits its lead condition most", () => {
    const r = input({
      watched: W,
      moves: [
        mv("q_small", { coeliac: [0.1, 0.15], hypothyroidism: [0.3, 0.9] }),
        mv("q_big", { coeliac: [0.1, 0.35] }),
        mv("q_mid", { coeliac: [0.1, 0.25] }),
      ],
      hunches: [{ hunchId: "a", conditionId: "coeliac", p: 0.1 }],
    });
    const round = pickRound(r);
    expect(round.map((i) => [i.key, i.pool])).toEqual([["q_big", 2]]);
  });

  it("only explores hunches whose lead sits between 5% and 40%, lowest first", () => {
    const r = input({
      moves: [
        mv("q_low", { a: [0.03, 0.2] }),
        mv("q_mid", { b: [0.3, 0.5] }),
        mv("q_lo2", { c: [0.08, 0.2] }),
        mv("q_high", { d: [0.45, 0.7] }),
      ],
      hunches: [
        { hunchId: "1", conditionId: "a", p: 0.03 },
        { hunchId: "2", conditionId: "b", p: 0.3 },
        { hunchId: "3", conditionId: "c", p: 0.08 },
        { hunchId: "4", conditionId: "d", p: 0.45 },
      ],
    });
    expect(keys(r)).toEqual(["q_lo2", "q_mid"]);
  });

  it("returns [] when nothing clears the floor", () => {
    const r = input({
      watched: W,
      moves: [
        mv("f1", { hypothyroidism: [0.3, 0.31] }),
        mv("h1", { coeliac: [0.1, 0.11] }),
      ],
      faded: new Map([["f1", 0.3]]),
      hunches: [{ hunchId: "a", conditionId: "coeliac", p: 0.1 }],
    });
    expect(pickRound(r)).toEqual([]);
  });

  it("writes a why for a faded key and for a hunch", () => {
    const r = input({
      watched: W,
      moves: [
        mv("sym_cold", { hypothyroidism: [0.3, 0.5] }),
        mv("sym_fatigue", { iron_deficiency: [0.2, 0.4] }),
        mv("sym_hair", { hypo_hunch: [0.1, 0.3] }),
      ],
      faded: new Map([["sym_cold", 0.3]]),
      missing: new Set(["sym_fatigue"]),
      values: new Map([["sym_cold", "No"]]),
      ages: new Map([["sym_cold", 121]]),
      hunches: [{ hunchId: "h", conditionId: "hypo_hunch", p: 0.1 }],
      names: new Map([
        ["hypo_hunch", "Hypothyroidism"],
        ["iron_deficiency", "Iron deficiency"],
      ]),
    });
    const round = pickRound(r);
    expect(round.map((i) => [i.key, i.why, i.ids])).toEqual([
      ["sym_cold", "It's been 4 months since you said No.", ["hypothyroidism"]],
      [
        "sym_fatigue",
        "This answer moves Iron deficiency.",
        ["iron_deficiency"],
      ],
      [
        "sym_hair",
        "The app has a weak hunch about Hypothyroidism. This answer tells it more.",
        ["hypo_hunch"],
      ],
    ]);
  });
});
