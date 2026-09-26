import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { signalsOf, type SignalsInput } from "./signals";

/** The eval personas; `owner` is the owner's real draws, anonymised. */
const cases = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../evals/hunches/cases.json"),
    "utf8",
  ),
);
const input = (id: string): SignalsInput => {
  const p = cases.personas.find((x: { id: string }) => x.id === id);
  return {
    markers: p.markers.map((m: { points: [string, number, number | null, number | null, string | null][] }) => ({
      ...m,
      points: m.points.map(([date, value, refLow, refHigh, unit]) => ({ date, value, refLow, refHigh, unit })),
    })),
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
    expect(raised.map((s) => s.key).sort()).toEqual(
      ["cluster:iron", "drift:ldl_cholesterol", "gap:folic_acid", "good_news:crp", "step:eosinophils_abs"],
    );
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
    expect([...s.codes].sort()).toEqual(["ferritin", "homocysteine", "vitamin_b12", "vitamin_d"]);
    expect(String(s.numbers.lit).split(",")[0]).toBe("ferritin");
    // its members fold into it instead of raising one each
    expect(unraised.find((x) => x.key === "step:ferritin")?.numbers.foldedInto).toBe("cluster:iron");
  });

  it("LDL drifts away from the goal at +16.0 a year", () => {
    const s = get("drift:ldl_cholesterol");
    expect(s.why).toBe("goal");
    expect(Number(s.numbers.perYear)).toBeCloseTo(16.0, 1);
  });

  it("folate is a gap: MTHFR het and not in the last three draws", () => {
    expect(get("gap:folic_acid").numbers).toMatchObject({ gene: "MTHFR", lastSeen: "2024-05-13" });
  });

  it("CRP is good news: out in 2023, back since", () => {
    expect(get("good_news:crp").numbers).toMatchObject({ was: 15.8, wasDate: "2023-03-17" });
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
    expect(unraised.find((s) => s.key === "left_band:tsh")?.numbers.labChange).toBe(true);
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
    folate.points = [...folate.points, { date: "2026-04-23", value: 9, refLow: 3.2, refHigh: 19.6, unit: "ng/mL" }];
    expect(signalsOf(i).raised.map((s) => s.key)).not.toContain("gap:folic_acid");
  });
});
