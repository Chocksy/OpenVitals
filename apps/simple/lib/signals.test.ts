import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { signalsOf, type SignalsInput } from "./signals";

/** The eval personas; `owner` is the owner's real draws, anonymised. */
const cases = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../evals/hunches/cases.json",
    ),
    "utf8",
  ),
);
const input = (id: string): SignalsInput => {
  const p = cases.personas.find((x: { id: string }) => x.id === id);
  return {
    markers: p.markers.map(
      (m: {
        points: [string, number, number | null, number | null, string | null][];
      }) => ({
        ...m,
        points: m.points.map(([date, value, refLow, refHigh, unit]) => ({
          date,
          value,
          refLow,
          refHigh,
          unit,
        })),
      }),
    ),
    goals: p.goals,
    facts: p.facts,
    causes: cases.causes,
    today: p.today,
  };
};

describe("signalsOf on the owner's real draws", () => {
  const { raised, unraised, asOf } = signalsOf(input("owner"));
  const get = (key: string) => raised.find((s) => s.key === key)!;

  it("reads as of the last draw and raises exactly the five of S2", () => {
    expect(asOf).toBe("2026-04-23");
    expect(raised.map((s) => s.key).sort()).toEqual([
      "cluster:iron",
      "drift:ldl_cholesterol",
      "gap:folic_acid",
      "good_news:crp",
      "step:eosinophils_abs",
    ]);
  });

  it("eosinophils: a step up since 2024-11-20, first firing 2025-12-09", () => {
    const s = get("step:eosinophils_abs");
    expect(s).toMatchObject({ dir: "up", since: "2024-11-20", why: "graph" });
    expect(s.firedAt[0]).toBe("2025-12-09");
  });

  it("the iron and vitamins cluster fires on 2026-04-23, ferritin first", () => {
    const s = get("cluster:iron");
    expect(s.why).toBe("cluster");
    expect(s.firedAt).toEqual(["2026-04-23"]);
    expect([...s.codes].sort()).toEqual([
      "ferritin",
      "homocysteine",
      "vitamin_b12",
      "vitamin_d",
    ]);
    expect(String(s.numbers.lit).split(",")[0]).toBe("ferritin");
    // its members fold into it instead of raising one each
    expect(
      unraised.find((x) => x.key === "step:ferritin")?.numbers.foldedInto,
    ).toBe("cluster:iron");
  });

  it("LDL drifts away from the goal at +16.0 a year", () => {
    const s = get("drift:ldl_cholesterol");
    expect(s.why).toBe("goal");
    expect(Number(s.numbers.perYear)).toBeCloseTo(16.0, 1);
  });

  it("folate is a gap: MTHFR het and not in the last three draws", () => {
    expect(get("gap:folic_acid").numbers).toMatchObject({
      gene: "MTHFR",
      lastSeen: "2024-05-13",
    });
  });

  it("CRP is good news: out in 2023, back since", () => {
    expect(get("good_news:crp").numbers).toMatchObject({
      was: 15.8,
      wasDate: "2023-03-17",
    });
  });

  it("keeps the rest as unraised, never silently dropped", () => {
    expect(unraised.length).toBeGreaterThan(5);
    expect(unraised.every((s) => s.why === null)).toBe(true);
  });
});

describe("signalsOf guards", () => {
  it("a flat healthy series raises nothing", () => {
    expect(signalsOf(input("flat")).raised).toEqual([]);
  });

  it("a jump on a new reference range is a lab change, not raised", () => {
    const { raised, unraised } = signalsOf(input("lab_jump"));
    expect(raised).toEqual([]);
    expect(
      unraised.find((s) => s.key === "left_band:tsh")?.numbers.labChange,
    ).toBe(true);
  });

  it("the same jump with the old range raises", () => {
    const i = input("lab_jump");
    const tsh = i.markers.find((m) => m.code === "tsh")!;
    tsh.points = tsh.points.map((p) => ({ ...p, refLow: 0.4, refHigh: 4.0 }));
    expect(signalsOf(i).raised.map((s) => s.key)).toContain("left_band:tsh");
  });

  it("a gap closes once the code is in the last three draws", () => {
    const i = input("owner");
    const folate = i.markers.find((m) => m.code === "folic_acid")!;
    folate.points = [
      ...folate.points,
      {
        date: "2026-04-23",
        value: 9,
        refLow: 3.2,
        refHigh: 19.6,
        unit: "ng/mL",
      },
    ];
    expect(signalsOf(i).raised.map((s) => s.key)).not.toContain(
      "gap:folic_acid",
    );
  });
});

describe("chronic (phase 41B)", () => {
  const ferritin = (values: number[]) => ({
    ...input("owner"),
    goals: [],
    facts: {},
    today: "2026-08-20",
    markers: [
      {
        code: "ferritin",
        name: "Ferritin",
        unit: "ng/mL",
        system: "iron" as const,
        derived: false,
        points: values.map((value, i) => ({
          date: `${2023 + Math.floor(i / 2)}-${i % 2 ? "08" : "02"}-15`,
          value,
          refLow: 13,
          refHigh: 150,
          unit: "ng/mL",
        })),
      },
    ],
  });

  it("raises a long run under the lab range the band had learned as normal", () => {
    const { raised } = signalsOf(ferritin([9, 8.5, 10, 9.2, 8.8, 9.5, 8.2]));
    const s = raised.find((x) => x.key === "chronic:ferritin");
    expect(s).toMatchObject({ dir: "down", why: "graph" });
    expect(s!.numbers).toMatchObject({ out: 7, n: 7, last: 8.2 });
    expect(raised.some((x) => x.key === "left_band:ferritin")).toBe(false);
  });

  it("reads ferritin against the WHO floor of 30 where the lab prints lower", () => {
    // every draw is over the lab's 13 and under 30
    const { raised } = signalsOf(ferritin([16, 24, 19, 14, 22, 18, 17]));
    const s = raised.find((x) => x.key === "chronic:ferritin");
    expect(s!.numbers).toMatchObject({ out: 7, floor: 30 });
    expect(s!.rule[0]).toContain("under 30 ng/mL");
    expect(s!.rule[0]).toContain("WHO 2020");
  });

  it("names no floor when the lab range decided every draw", () => {
    const s = signalsOf(ferritin([9, 8.5, 10, 9.2, 8.8, 9.5, 8.2])).raised.find(
      (x) => x.key === "chronic:ferritin",
    );
    expect(s!.numbers.floor).toBeUndefined();
    expect(s!.rule[0]).toContain("the range their own lab printed");
  });

  it("needs 60 % of the draws out, the last one included", () => {
    expect(
      signalsOf(ferritin([20, 9, 25, 8, 22, 9, 30])).raised.some(
        (x) => x.kind === "chronic",
      ),
    ).toBe(false);
    expect(
      signalsOf(ferritin([9, 8, 9, 8, 9, 8, 30])).raised.some(
        (x) => x.kind === "chronic",
      ),
    ).toBe(false);
  });
});

describe("good news (phase 43E)", () => {
  // Synthetic ferritin, lab range 20-250, one draw every six months. Seven
  // draws near 16 teach the band that 16 is usual; 5 leaves it the worse way.
  const series = (values: number[], extra: Partial<SignalsInput> = {}): SignalsInput => ({
    ...input("owner"),
    goals: [],
    facts: {},
    today: "2028-01-01",
    markers: [
      {
        code: "ferritin",
        name: "Ferritin",
        unit: "ng/mL",
        system: "iron" as const,
        derived: false,
        points: values.map((value, i) => ({
          date: `${2023 + Math.floor(i / 2)}-${i % 2 ? "08" : "02"}-15`,
          value,
          refLow: 20,
          refHigh: 250,
          unit: "ng/mL",
        })),
      },
    ],
    ...extra,
  });
  const all = (i: SignalsInput) => {
    const { raised, unraised } = signalsOf(i);
    return [...raised, ...unraised].map((s) => s.key);
  };

  const low = [15, 17, 16, 18, 15, 17, 16, 5];

  it("raises no good news when the last draw sits under the lab range", () => {
    expect(all(series([...low, 16, 17]))).not.toContain(
      "good_news:ferritin",
    );
  });

  it("still raises it when the last draw is back inside the lab range", () => {
    expect(all(series([...low, 22, 24]))).toContain(
      "good_news:ferritin",
    );
  });

  it("raises none while a likely or confirmed condition reads the marker", () => {
    expect(
      all(series([...low, 22, 24], { settled: ["ferritin"] })),
    ).not.toContain("good_news:ferritin");
  });
});

describe("drift numbers (phase 43I)", () => {
  it("carries the first draw and the span the slope was read over", () => {
    const i: SignalsInput = {
      markers: [
        {
          code: "ldl_cholesterol",
          name: "LDL Cholesterol",
          unit: "mg/dL",
          system: "lipids",
          points: [
            ["2026-03-05", 101],
            ["2026-05-20", 114],
            ["2026-08-18", 133],
          ].map(([date, value]) => ({
            date: String(date),
            value: Number(value),
            refLow: null,
            refHigh: 130,
            unit: "mg/dL",
          })),
        },
      ],
      goals: [],
      facts: {},
      causes: {},
      today: "2026-09-01",
    };
    const { raised, unraised } = signalsOf(i);
    const d = [...raised, ...unraised].find((s) => s.key === "drift:ldl_cholesterol")!;
    expect(d.numbers).toMatchObject({ first: 101, firstDate: "2026-03-05", spanDays: 166 });
  });
});
