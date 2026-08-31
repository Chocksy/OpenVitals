import { describe, it, expect } from "vitest";
import type { ModelInput } from "./coverage";
import {
  MARKER_HPO,
  WAKE_LABS,
  firedWakeLabs,
  personPhenotypes,
  rankByPhenotype,
  unresolved,
  type AnnotationRow,
} from "./wake";
import type { HypothesisResult } from "./hypotheses";

const reading = (value: number, prev?: number) => ({
  value,
  unit: null,
  date: "2026-08-01",
  status: "red" as const,
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  prev: prev ?? null,
});

const input = (
  latest: Record<string, ReturnType<typeof reading>>,
  profile: Record<string, unknown> = {},
): ModelInput => ({
  today: "2026-08-30",
  profile,
  sex: "male",
  age: 44,
  latest,
  derived: {},
});

describe("WAKE_LABS", () => {
  it("gives every rule a source and at least one MONDO id", () => {
    for (const row of WAKE_LABS) {
      expect(row.source.length).toBeGreaterThan(40);
      expect(row.mondoIds.length).toBeGreaterThan(0);
      for (const id of row.mondoIds) expect(id).toMatch(/^MONDO:\d+$/);
    }
  });

  it("gives every marker-to-phenotype row a source and a real HPO id", () => {
    for (const row of MARKER_HPO) {
      expect(row.hpoId).toMatch(/^HP:\d{7}$/);
      expect(row.source.length).toBeGreaterThan(40);
    }
  });

  it("wants a ferritin over 1000 on two draws, not one", () => {
    expect(firedWakeLabs(input({ ferritin: reading(1200) }))).toHaveLength(0);
    const twice = firedWakeLabs(input({ ferritin: reading(1200, 1100) }));
    expect(twice.map((r) => r.id)).toEqual(["ferritin_over_1000"]);
    expect(twice[0]!.mondoIds).toContain("MONDO:0021001");
  });

  it("fires a single hypercalcaemia or a single low platelet count", () => {
    expect(firedWakeLabs(input({ calcium: reading(12.1) }))[0]!.id).toBe(
      "calcium_over_11_5",
    );
    expect(firedWakeLabs(input({ platelets: reading(38) }))[0]!.id).toBe(
      "platelets_under_50",
    );
  });

  it("leaves a normal panel alone", () => {
    expect(
      firedWakeLabs(
        input({
          ferritin: reading(120, 130),
          calcium: reading(9.5),
          platelets: reading(250),
        }),
      ),
    ).toHaveLength(0);
  });
});

describe("personPhenotypes", () => {
  it("reads symptom answers and off markers as HPO terms", () => {
    const p = personPhenotypes(
      input(
        { ferritin: reading(1200, 1100), calcium: reading(9.4) },
        { sym_energy: "Yes", sym_joint: "Yes" },
      ),
    );
    const ids = p.map((x) => x.hpoId);
    expect(ids).toContain("HP:0012378"); // fatigue
    expect(ids).toContain("HP:0002829"); // arthralgia
    expect(ids).toContain("HP:0003281"); // hyperferritinaemia
    expect(ids).not.toContain("HP:0003072"); // calcium is normal
  });

  it("says what said so, so a card can print it", () => {
    const p = personPhenotypes(input({ ferritin: reading(1200) }));
    expect(p[0]!.because).toContain("ferritin 1200");
  });

  it("answers nothing for a person who answered nothing", () => {
    expect(personPhenotypes(input({}))).toHaveLength(0);
  });
});

/**
 * The fixture the spec asks for: fatigue + high ferritin + arthralgia has to
 * rank haemochromatosis and Still's disease above the noise. The noise here is
 * two real HPOA shapes — a syndrome that lists a hundred frequent phenotypes
 * including fatigue, and a disease that shares exactly one finding.
 */
const FIXTURE: AnnotationRow[] = [
  // haemochromatosis: three of three, on a narrow annotation set
  { diseaseId: "OMIM:235200", hpoId: "HP:0012378", frequency: "HP:0040281" },
  { diseaseId: "OMIM:235200", hpoId: "HP:0002829", frequency: "HP:0040282" },
  { diseaseId: "OMIM:235200", hpoId: "HP:0003281", frequency: "HP:0040281" },
  { diseaseId: "OMIM:235200", hpoId: "HP:0001394", frequency: "HP:0040282" },
  { diseaseId: "OMIM:235200", hpoId: "HP:0000855", frequency: "HP:0040283" },
  // adult-onset Still disease: three of three too, a little broader
  { diseaseId: "ORPHA:829", hpoId: "HP:0012378", frequency: "HP:0040282" },
  { diseaseId: "ORPHA:829", hpoId: "HP:0002829", frequency: "HP:0040281" },
  { diseaseId: "ORPHA:829", hpoId: "HP:0003281", frequency: "HP:0040281" },
  { diseaseId: "ORPHA:829", hpoId: "HP:0001945", frequency: "HP:0040281" },
  { diseaseId: "ORPHA:829", hpoId: "HP:0000988", frequency: "HP:0040282" },
  { diseaseId: "ORPHA:829", hpoId: "HP:0002716", frequency: "HP:0040282" },
  { diseaseId: "ORPHA:829", hpoId: "HP:0001744", frequency: "HP:0040283" },
  // a syndrome that matches everybody: fatigue plus arthralgia, but 30 more
  ...Array.from({ length: 30 }, (_, i) => ({
    diseaseId: "OMIM:999999",
    hpoId: `HP:900${String(i).padStart(4, "0")}`,
    frequency: "HP:0040281",
  })),
  { diseaseId: "OMIM:999999", hpoId: "HP:0012378", frequency: "HP:0040281" },
  { diseaseId: "OMIM:999999", hpoId: "HP:0002829", frequency: "HP:0040281" },
  // one shared finding only: never ranked at all
  { diseaseId: "OMIM:111111", hpoId: "HP:0012378", frequency: "HP:0040281" },
  { diseaseId: "OMIM:111111", hpoId: "HP:0000407", frequency: "HP:0040281" },
  // a disease whose only match is a rare feature of it
  { diseaseId: "OMIM:222222", hpoId: "HP:0003281", frequency: "HP:0040284" },
  { diseaseId: "OMIM:222222", hpoId: "HP:0012378", frequency: "HP:0040284" },
];

describe("rankByPhenotype", () => {
  const person = ["HP:0012378", "HP:0003281", "HP:0002829"];

  it("ranks haemochromatosis and Still's disease above the noise", () => {
    const ranked = rankByPhenotype(person, FIXTURE);
    expect(
      ranked
        .slice(0, 2)
        .map((r) => r.diseaseId)
        .sort(),
    ).toEqual(["OMIM:235200", "ORPHA:829"]);
    const noise = ranked.find((r) => r.diseaseId === "OMIM:999999")!;
    expect(ranked[0]!.score).toBeGreaterThan(noise.score * 2);
  });

  it("never ranks a disease that shares only one finding", () => {
    const ranked = rankByPhenotype(person, FIXTURE);
    expect(ranked.some((r) => r.diseaseId === "OMIM:111111")).toBe(false);
  });

  it("ignores phenotypes the disease calls very rare", () => {
    // Both of OMIM:222222's matches are "very rare" (2.5 %), under the
    // "frequent" floor, so it never enters the ranking.
    const ranked = rankByPhenotype(person, FIXTURE);
    expect(ranked.some((r) => r.diseaseId === "OMIM:222222")).toBe(false);
  });

  it("says which findings matched, so the wake can name them", () => {
    const hit = rankByPhenotype(person, FIXTURE).find(
      (r) => r.diseaseId === "OMIM:235200",
    )!;
    expect(hit.matched).toEqual(["HP:0002829", "HP:0003281", "HP:0012378"]);
    expect(hit.breadth).toBe(4);
  });
});

const scored = (
  id: string,
  score: number,
  inputs: string[],
): HypothesisResult =>
  ({
    id,
    name: id,
    prior: 0.1,
    score,
    state: "possible",
    for: inputs.map((input) => ({
      rule: `${id}_${input}`,
      input,
      value: "x",
      lr: 2,
      grade: "B" as const,
    })),
    against: [],
    missing: [],
    superseded: [],
    confounded: [],
    nextTests: [],
    lenses: {},
    lensWeight: 1,
    tests: [],
    summary: "",
    management: "",
  }) as unknown as HypothesisResult;

describe("unresolved", () => {
  it("is true when an off marker has no condition reading it", () => {
    const m = input({ ferritin: reading(1200), calcium: reading(12) });
    expect(unresolved(m, [scored("iron", 0.4, ["ferritin"])])).toBe(true);
  });

  it("is false once every off marker is explained", () => {
    const m = input({ ferritin: reading(1200) });
    expect(unresolved(m, [scored("iron", 0.4, ["ferritin"])])).toBe(false);
  });

  it("does not count an unlikely condition as an explanation", () => {
    const m = input({ ferritin: reading(1200) });
    expect(unresolved(m, [scored("iron", 0.1, ["ferritin"])])).toBe(true);
  });
});
