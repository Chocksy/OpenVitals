import { describe, expect, it } from "vitest";
import type { HunchExplanation } from "@/db";
import {
  checkPost,
  probeOf,
  roundInputOf,
  sinceOf,
  watchOf,
} from "./checkin-server";
import type { ModelInput } from "./coverage";
import type { Catalog, HypothesisResult } from "./hypotheses";
import type { Move } from "./infogain";

describe("checkPost", () => {
  it("rejects a later without an offset", () => {
    expect(checkPost({ later: true } as never)).toMatch(/offset/);
  });
  it("rejects an answer that is not one of the options", () => {
    expect(
      checkPost({ screen: "question", key: "sym_cold", value: "Maybe" }),
    ).toMatch(/option/);
  });
  it("takes a listed answer, a skip, and the fixed follow-up answers", () => {
    expect(
      checkPost({ screen: "question", key: "sym_cold", value: "Yes" }),
    ).toBeNull();
    expect(
      checkPost({ screen: "question", key: "sym_cold", skip: true }),
    ).toBeNull();
    expect(
      checkPost({
        screen: "question",
        key: "followup_adherence:item-1",
        value: "Most days",
      }),
    ).toBeNull();
    expect(
      checkPost({
        screen: "question",
        key: "followup_effect:item-1",
        value: "Most days",
      }),
    ).toMatch(/option/);
  });
  it("takes later, skip and done", () => {
    expect(checkPost({ later: true, offsetMin: 120 })).toBeNull();
    expect(checkPost({ skip: true })).toBeNull();
    expect(checkPost({ done: true })).toBeNull();
  });
});

describe("sinceOf", () => {
  it("says which answer moved a bar", () => {
    const out = sinceOf(
      { a: 0.43 },
      [{ id: "a", p: 0.61 }],
      [{ key: "sym_energy", kind: "fact", pool: 1, why: "", ids: ["a"] }],
      new Map([["a", "Iron deficiency"]]),
      new Map([["sym_energy", "your tiredness answer"]]),
    );
    expect(out[0]).toEqual({
      id: "a",
      name: "Iron deficiency",
      from: 43,
      to: 61,
      by: "your tiredness answer",
    });
  });
  it("leaves out a bar that moved under 2 points", () => {
    expect(
      sinceOf(
        { a: 0.43 },
        [{ id: "a", p: 0.44 }],
        [],
        new Map([["a", "A"]]),
        new Map(),
      ),
    ).toEqual([]);
  });
});

/* ── round input from engine output (synthetic) ───────────────────────── */

type Row = Pick<HypothesisResult, "id" | "name" | "score" | "for" | "against"> &
  Partial<Pick<HypothesisResult, "missing">>;
/** A scorer row with only the fields the check-in reads. */
const row = (r: Row): HypothesisResult =>
  ({ missing: [], ...r }) as unknown as HypothesisResult;

const fact = (key: string, weight?: number) => ({
  rule: `r_${key}`,
  input: key,
  value: "No",
  lr: 0.5,
  grade: "B" as const,
  ...(weight != null ? { faded: { key, days: 200, weight } } : {}),
});

const lead = (conditionId: string, weight: number): HunchExplanation => ({
  id: `e_${conditionId}`,
  text: "",
  grade: "C",
  basis: "science",
  source: null,
  conditionId,
  weight,
  predicts: null,
  check: null,
});

function mv(featureId: string, kind: Move["kind"] = "question"): Move {
  return {
    kind,
    featureId,
    label: featureId,
    cost: 0,
    outcomes: [],
    entropyBefore: 0,
    entropyAfter: 0,
    gain: 0,
    ratio: 0,
    shift: 0,
    moves: [],
  };
}

const rows = [
  // on the picture: its old "No" on sym_cold has faded below half
  row({
    id: "hypothyroidism",
    name: "Hypothyroidism",
    score: 0.4,
    for: [],
    against: [fact("sym_cold", 0.3), fact("sym_hair_skin", 0.7)],
    missing: [
      { rule: "r1", input: "sym_energy" },
      { rule: "r2", input: "tsh" },
    ],
  }),
  // off the picture, but an open hunch leads with it
  row({
    id: "coeliac",
    name: "Coeliac disease",
    score: 0.1,
    for: [fact("sym_bloating", 0.2)],
    against: [],
  }),
  // off the picture and no hunch: its faded key is not watched
  row({
    id: "gout",
    name: "Gout",
    score: 0.05,
    for: [],
    against: [fact("sym_joint", 0.1)],
  }),
];

const hunches = [
  {
    id: "h1",
    state: "open",
    explanations: [lead("gout", 0.2), lead("coeliac", 0.6)],
  },
  { id: "h2", state: "closed", explanations: [lead("gout", 0.9)] },
];

describe("watchOf", () => {
  it("watches shown beliefs and open hunch leads, and keeps faded under half", () => {
    const w = watchOf(rows, hunches);
    expect([...w.watched].sort()).toEqual(["coeliac", "hypothyroidism"]);
    expect(w.leads).toEqual([
      { hunchId: "h1", conditionId: "coeliac", p: 0.1 },
    ]);
    expect([...w.faded.keys()].sort()).toEqual(["sym_bloating", "sym_cold"]);
  });
});

describe("probeOf", () => {
  it("drops the faded keys so the engine simulates a fresh answer", () => {
    const input = {
      today: "2026-10-15",
      profile: { sym_cold: "No", sym_bloating: "Yes", sex: "female" },
      profileAt: { sym_cold: "2026-01-01", sex: "2020-01-01" },
    } as unknown as ModelInput;
    const probe = probeOf(input, ["sym_cold", "sym_bloating"]);
    expect(probe.profile).toEqual({ sex: "female" });
    expect(probe.profileAt).toEqual({ sex: "2020-01-01" });
    expect(input.profile.sym_cold).toBe("No");
  });
});

describe("roundInputOf", () => {
  const catalog = [
    {
      id: "hypothyroidism",
      name: "Hypothyroidism",
      evidence: [
        { input: { fact: "sym_cold" } },
        { input: { fact: "sym_hair_skin" } },
      ],
    },
    {
      id: "coeliac",
      name: "Coeliac disease",
      evidence: [
        { input: { fact: "sym_bloating" } },
        { input: { metric: "ttg" } },
      ],
    },
  ] as unknown as Catalog;

  const r = roundInputOf({
    rows,
    hunches,
    moves: [
      mv("fact:sym_cold"),
      mv("fact:sym_bloating"),
      mv("fact:waist_cm"), // a number, no tap options
      mv("tsh", "test"),
    ],
    followups: [],
    recentKeys: new Set(["sym_hair_skin"]),
    lastRounds: [["sym_cold"]],
    catalog,
    profile: { sym_cold: "no", sym_bloating: "Yes" },
    nowIso: "2026-10-15T10:00:00Z",
  });

  it("watches open hunch leads next to the picture", () => {
    expect(r.watched.has("coeliac")).toBe(true);
    expect(r.hunches).toEqual([
      { hunchId: "h1", conditionId: "coeliac", p: 0.1 },
    ]);
  });
  it("keeps only faded keys under half on watched rows", () => {
    expect([...r.faded.entries()].sort()).toEqual([
      ["sym_bloating", 0.2],
      ["sym_cold", 0.3],
    ]);
    expect(r.ages.get("sym_cold")).toBe(200);
  });
  it("keeps missing question keys, not markers", () => {
    expect([...r.missing]).toEqual(["sym_energy"]);
  });
  it("keeps only questions with tap options", () => {
    expect(r.moves.map((m) => m.featureId)).toEqual([
      "fact:sym_cold",
      "fact:sym_bloating",
    ]);
  });
  it("shows a stored answer as its option and maps siblings", () => {
    expect(r.values.get("sym_cold")).toBe("No");
    expect([...(r.siblings.get("sym_hair_skin") ?? [])]).toEqual([
      "hypothyroidism",
    ]);
    expect(r.names.get("coeliac")).toBe("Coeliac disease");
  });
});
