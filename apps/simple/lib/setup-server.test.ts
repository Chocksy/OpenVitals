import { describe, expect, it } from "vitest";
import {
  checkPost,
  checkTreatment,
  optionsOf,
  pictureOf,
  toStored,
} from "./setup-server";

const names = new Map([
  ["iron_deficiency", "Iron deficiency"],
  ["hypothyroidism", "Hypothyroidism"],
  ["x", "X"],
  ["y", "Y"],
]);

describe("pictureOf", () => {
  it("keeps the top three at or above the quiet floor", () => {
    const rows = pictureOf(
      [
        { id: "x", p: 0.1 },
        { id: "iron_deficiency", p: 0.6 },
        { id: "hypothyroidism", p: 0.3 },
        { id: "y", p: 0.26 },
      ],
      names,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "iron_deficiency",
      "hypothyroidism",
      "y",
    ]);
    expect(rows[0]).toEqual({
      id: "iron_deficiency",
      name: "Iron deficiency",
      p: 0.6,
    });
  });
  it("is empty when nothing stands out", () => {
    expect(pictureOf([{ id: "x", p: 0.1 }], names)).toEqual([]);
  });
});

describe("optionsOf", () => {
  it("names the condition each answer moves most, in whole percent", () => {
    const move = {
      kind: "question",
      featureId: "fact:sym_energy",
      label: "Tired?",
      cost: 0,
      outcomes: [
        {
          label: "No",
          prob: 0.5,
          beliefs: [{ id: "iron_deficiency", p: 0.1 }],
          apply: {},
        },
        {
          label: "Yes",
          prob: 0.5,
          beliefs: [{ id: "iron_deficiency", p: 0.31 }],
          apply: {},
        },
      ],
      entropyBefore: 1,
      entropyAfter: 0.9,
      gain: 0.1,
      ratio: 0.1,
      shift: 0.2,
    } as never;
    const before = [{ id: "iron_deficiency", p: 0.12 }];
    const out = optionsOf(move, names, before);
    expect(out[1]).toEqual({
      label: "Yes",
      moves: {
        id: "iron_deficiency",
        name: "Iron deficiency",
        from: 12,
        to: 31,
      },
    });
    expect(out[0]!.moves).toEqual({
      id: "iron_deficiency",
      name: "Iron deficiency",
      from: 12,
      to: 10,
    });
  });
  it("gives null when an answer moves nothing by 2 points", () => {
    const move = {
      outcomes: [{ label: "No", beliefs: [{ id: "x", p: 0.51 }] }],
    } as never;
    expect(optionsOf(move, names, [{ id: "x", p: 0.5 }])[0]!.moves).toBeNull();
  });
});

describe("checkTreatment", () => {
  it("accepts a full row and rejects bad months or routes", () => {
    expect(
      checkTreatment({ what: "Iron", route: "oral", started: "2024-09" }),
    ).toBe(true);
    expect(
      checkTreatment({
        what: "Iron",
        route: "oral",
        started: "2024-09",
        stopped: "2026-09",
      }),
    ).toBe(true);
    expect(
      checkTreatment({ what: "Iron", route: "pill", started: "2024-09" }),
    ).toBe(false);
    expect(
      checkTreatment({ what: "", route: "oral", started: "2024-09" }),
    ).toBe(false);
    expect(
      checkTreatment({ what: "Iron", route: "oral", started: "Sept" }),
    ).toBe(false);
    expect(
      checkTreatment({
        what: "Iron",
        route: "oral",
        started: "2025-09",
        stopped: "2024-01",
      }),
    ).toBe(false);
  });
  it("stores months as the first of the month, as the reader expects", () => {
    expect(
      toStored({
        what: " Iron ",
        route: "iv",
        started: "2024-09",
        stopped: "2025-01",
      }),
    ).toEqual({
      what: "Iron",
      route: "iv",
      started: "2024-09-01",
      stopped: "2025-01-01",
    });
  });
});

describe("checkPost", () => {
  it("passes a whole screen of valid answers", () => {
    expect(
      checkPost({
        screen: "basics",
        sex: "Female",
        birthYear: "1990",
        country: "RO",
      }),
    ).toBeNull();
    expect(checkPost({ screen: "intro", goal: "Prevention", hasReport: false }))
      .toBeNull();
  });
  it("stops at the first bad answer, before anything is written", () => {
    expect(
      checkPost({
        screen: "basics",
        sex: "Other",
        birthYear: "1990",
        country: "RO",
      }),
    ).toBe("not one of the options");
    expect(checkPost({ screen: "intro", goal: "Prevention" } as never)).toBe(
      "say whether you have a report",
    );
    expect(checkPost({ screen: "question", key: "nope", value: "Yes" })).toBe(
      "unknown question",
    );
    expect(checkPost({ screen: "body", weightKg: "heavy" })).toBe(
      "weight is not a number",
    );
    expect(
      checkPost({
        screen: "treatments",
        treatments: [{ what: "Iron", route: "pill", started: "2024-09" }],
      } as never),
    ).toBe("bad treatment");
    expect(checkPost({ screen: "nope" } as never)).toBe("unknown screen");
  });
  it("lets a skip through with no answers", () => {
    expect(
      checkPost({ screen: "question", key: "sym_energy", skip: true }),
    ).toBeNull();
    expect(checkPost({ screen: "body", skip: true })).toBeNull();
  });
});
