import { describe, it, expect } from "vitest";
import {
  coverage,
  fireRules,
  profileQuestions,
  splitListFact,
  type LatestValue,
  type ModelInput,
} from "./coverage";

const value = (
  v: number | null,
  date: string,
  extra: Partial<LatestValue> = {},
): LatestValue => ({
  value: v,
  unit: null,
  date,
  status: "green",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...extra,
});

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-26",
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

const stateOf = (rows: ReturnType<typeof coverage>, id: string) =>
  rows.find((r) => r.vector.id === id)!;

describe("coverage by sex and age", () => {
  const female30 = input({
    sex: "female",
    age: 30,
    profile: { sex: "female", birth_year: 1996 },
  });

  it("hides the male and the over-40 vectors from a woman of 30", () => {
    const rows = coverage(female30);
    expect(stateOf(rows, "psa").state).toBe("n/a");
    expect(stateOf(rows, "mammography").state).toBe("n/a");
    expect(stateOf(rows, "hormones_male").state).toBe("n/a");
  });

  it("keeps the female hormone panel, which she has never had", () => {
    const rows = coverage(female30);
    expect(stateOf(rows, "hormones_female").state).toBe("never");
  });

  it("says to answer sex and age first when they are unknown", () => {
    const rows = coverage(input());
    expect(stateOf(rows, "psa")).toMatchObject({
      state: "n/a",
      detail: "answer sex and age first",
    });
  });
});

describe("coverage by recency", () => {
  const male41 = input({
    sex: "male",
    age: 41,
    profile: { sex: "male", birth_year: 1985 },
    latest: {
      apolipoprotein_b: value(97, "2024-05-13"),
      hba1c: value(5.4, "2025-12-09"),
    },
  });

  it("calls a 2024 ApoB stale", () => {
    expect(stateOf(coverage(male41), "apob")).toMatchObject({
      state: "stale",
      lastDate: "2024-05-13",
      detail: "last 2024-05",
    });
  });

  it("calls a recent HbA1c current", () => {
    expect(stateOf(coverage(male41), "hba1c").state).toBe("current");
  });

  it("calls Lp(a) never measured", () => {
    expect(stateOf(coverage(male41), "lpa").state).toBe("never");
  });
});

describe("profileQuestions", () => {
  it("puts sex first, then birth year", () => {
    const asks = profileQuestions(input());
    expect(asks[0]!.key).toBe("sex");
    expect(asks[0]!.options).toEqual(["Female", "Male"]);
    expect(asks[1]!.key).toBe("birth_year");
    expect(asks[1]!.free).toBe(true);
  });

  it("drops the ones already answered", () => {
    const asks = profileQuestions(
      input({
        sex: "male",
        age: 41,
        profile: { sex: "male", birth_year: 1985 },
      }),
    );
    expect(asks.map((a) => a.key)).not.toContain("sex");
    expect(asks.map((a) => a.key)).not.toContain("birth_year");
  });

  it("never asks a man about menopause", () => {
    const asks = profileQuestions(
      input({
        sex: "male",
        age: 50,
        profile: { sex: "male", birth_year: 1976 },
      }),
    );
    expect(asks.map((a) => a.key)).not.toContain("menopause_status");
    expect(asks.map((a) => a.key)).not.toContain("cycle_phase_at_last_draw");
  });
});

const fired = (m: ModelInput) => fireRules(m).map((r) => r.id);

describe("rules", () => {
  it("fires lpa_once when Lp(a) was never measured", () => {
    expect(fired(input())).toContain("lpa_once");
    expect(
      fired(input({ latest: { lp_a: value(20, "2025-01-01") } })),
    ).not.toContain("lpa_once");
  });

  it("uses the sex threshold for a high ferritin", () => {
    const high = {
      ferritin: value(250, "2025-12-09"),
      transferrin_saturation: value(52, "2025-12-09"),
    };
    expect(fired(input({ sex: "female", age: 41, latest: high }))).toContain(
      "ferritin_high",
    );
    expect(fired(input({ sex: "male", age: 41, latest: high }))).not.toContain(
      "ferritin_high",
    );
  });

  it("needs age 40 before it asks for a calcium score", () => {
    const risky = { apolipoprotein_b: value(97, "2024-05-13") };
    expect(fired(input({ sex: "male", age: 39, latest: risky }))).not.toContain(
      "cac_if_risk",
    );
    expect(fired(input({ sex: "male", age: 41, latest: risky }))).toContain(
      "cac_if_risk",
    );
  });

  it("asks for ApoB when the lipids are fresh and ApoB is not", () => {
    const m = input({
      sex: "male",
      age: 41,
      latest: {
        apolipoprotein_b: value(97, "2024-05-13"),
        ldl_cholesterol: value(110, "2026-08-01"),
      },
    });
    expect(fired(m)).toContain("apob_on_every_draw");
  });

  it("only discusses PSA with a man over 50", () => {
    expect(fired(input({ sex: "female", age: 60 }))).not.toContain(
      "psa_discuss",
    );
    expect(fired(input({ sex: "male", age: 60 }))).toContain("psa_discuss");
    expect(fired(input({ sex: "male", age: 46 }))).not.toContain("psa_discuss");
  });

  it("says measure, not retest, when vitamin D was never measured", () => {
    const never = fired(input());
    expect(never).toContain("vitamin_d_measure");
    expect(never).not.toContain("vitamin_d_refresh");
  });

  it("says retest once there is a reading that is old or low", () => {
    const oldReading = fired(
      input({ latest: { vitamin_d: value(52, "2024-01-05") } }),
    );
    expect(oldReading).toContain("vitamin_d_refresh");
    expect(oldReading).not.toContain("vitamin_d_measure");

    const lowAndFresh = fired(
      input({ latest: { vitamin_d: value(24, "2026-08-01") } }),
    );
    expect(lowAndFresh).toContain("vitamin_d_refresh");

    const fine = fired(
      input({ latest: { vitamin_d: value(52, "2026-08-01") } }),
    );
    expect(fine).not.toContain("vitamin_d_refresh");
    expect(fine).not.toContain("vitamin_d_measure");
  });

  it("stops asking for a home BP log once the log reads normal", () => {
    expect(fired(input({ profile: { bp_home: "118/74" } }))).not.toContain(
      "bp_log",
    );
    expect(fired(input({ profile: { bp_home: "134/86" } }))).toContain(
      "bp_log",
    );
    expect(fired(input())).toContain("bp_log");
  });
});

describe("splitListFact", () => {
  it("keeps a pasted paragraph whole", () => {
    const paragraph =
      "My grandmother from my father side died in her sleep, probably a heart attack, but she had speech problems. My father got kidney cancer and stomach and pancreatic cancer, he also had diabetes type 2. My mother still lives and her parents lived past 80.";
    expect(splitListFact(paragraph)).toEqual([paragraph]);
  });

  it("still splits a real comma list", () => {
    expect(splitListFact("father MI 52, T2D mother")).toEqual([
      "father MI 52",
      "T2D mother",
    ]);
  });

  it("splits on newlines and semicolons whatever the length", () => {
    expect(splitListFact("father MI 52\nT2D mother")).toEqual([
      "father MI 52",
      "T2D mother",
    ]);
    expect(splitListFact("father MI 52; T2D mother")).toEqual([
      "father MI 52",
      "T2D mother",
    ]);
  });

  it("keeps a long comma line whole", () => {
    const long = "a".repeat(100) + ", " + "b".repeat(30);
    expect(splitListFact(long)).toEqual([long]);
  });

  it("returns nothing for an empty answer", () => {
    expect(splitListFact("   ")).toEqual([]);
  });
});
