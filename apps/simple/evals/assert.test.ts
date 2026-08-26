import { describe, it, expect } from "vitest";
import type { ReportAction, ReportBody } from "@/db";
import { checkAssertion, doseMicrograms, runAssertions } from "./assert";

const action = (over: Partial<ReportAction> = {}): ReportAction => ({
  title: "Selenium",
  kind: "supplement",
  weight: 4,
  basis: "science",
  why: "Antibodies fall on 200 µg a day in several trials.",
  reasoning: "tpo_antibodies 320 IU/mL, edge selenium->tpo_antibodies",
  dose: { amount: "200 µg", schedule: "daily with food" },
  targets: [],
  evidence: [{ kind: "meta", title: "Wichman 2016 Thyroid" }],
  followUp: [],
  ...over,
});

const body = (over: Partial<ReportBody> = {}): ReportBody => ({
  summary: ["one"],
  eli5: "Your thyroid is under attack and the plan is to watch it closely.",
  systems: [],
  actions: [
    action(),
    action({
      title: "Iron bisglycinate",
      reasoning: "ferritin 22 ng/mL, under the 30 floor",
      dose: { amount: "60 mg elemental", schedule: "alternate days" },
    }),
    action({ title: "Levothyroxine 25 µg", kind: "doctor", dose: undefined }),
  ],
  questions: [
    {
      key: "pregnancy_plans",
      text: "Planning a pregnancy in the next 12 months?",
      why: "It changes the TSH target.",
    },
  ],
  patterns: [
    {
      id: "hashimoto",
      stage: "early",
      verdict: "Antibody-positive, TSH climbing.",
    },
  ],
  ...over,
});

describe("dose parsing", () => {
  it("converts mg to micrograms and leaves µg alone", () => {
    expect(doseMicrograms(action())).toBe(200);
    expect(
      doseMicrograms(action({ dose: { amount: "60 mg", schedule: "d" } })),
    ).toBe(60_000);
  });

  it("gives up on a dose that is not a mass", () => {
    expect(
      doseMicrograms(action({ dose: { amount: "4000 IU", schedule: "d" } })),
    ).toBeNull();
  });
});

describe("assertions", () => {
  it("matches on kind and title", () => {
    expect(
      checkAssertion(body(), { kind: "supplement", title: "selenium" }),
    ).toBe(true);
    expect(checkAssertion(body(), { kind: "food", title: "selenium" })).toBe(
      false,
    );
  });

  it("matches on reasoning", () => {
    expect(
      checkAssertion(body(), {
        kind: "supplement",
        title: "iron",
        reasoning: "ferritin",
      }),
    ).toBe(true);
    expect(
      checkAssertion(body(), {
        kind: "supplement",
        title: "iron",
        reasoning: "coeliac",
      }),
    ).toBe(false);
  });

  it("matches a question by regex", () => {
    expect(checkAssertion(body(), { question: "pregnan" })).toBe(true);
    expect(checkAssertion(body(), { question: "colonoscopy" })).toBe(false);
  });

  it("holds a must-dose at or under the ceiling", () => {
    expect(checkAssertion(body(), { title: "selenium", doseMaxUg: 200 })).toBe(
      true,
    );
    expect(checkAssertion(body(), { title: "selenium", doseMaxUg: 100 })).toBe(
      false,
    );
  });

  it("reads doseMaxUg in mustNot as over the dose", () => {
    expect(
      checkAssertion(body(), { title: "iron", doseMaxUg: 100_000 }, true),
    ).toBe(false);
    expect(
      checkAssertion(body(), { title: "iron", doseMaxUg: 10_000 }, true),
    ).toBe(true);
  });

  it("checks basis exactly", () => {
    expect(
      checkAssertion(body(), { title: "selenium", basis: "science" }),
    ).toBe(true);
    expect(
      checkAssertion(body(), { title: "selenium", basis: "opinion" }),
    ).toBe(false);
  });

  it("checks the matched pattern ids", () => {
    expect(checkAssertion(body(), { patternMatched: "hashimoto" })).toBe(true);
    expect(checkAssertion(body(), { patternMatched: "lmhr" })).toBe(false);
  });

  it("exempts a kind with unlessKind", () => {
    expect(checkAssertion(body(), { title: "levothyroxine" })).toBe(true);
    expect(
      checkAssertion(body(), { title: "levothyroxine", unlessKind: "doctor" }),
    ).toBe(false);
  });

  it("spots a dose over a ceiling", () => {
    expect(checkAssertion(body(), { overCeiling: true })).toBe(false);
    const overdosed = body({
      actions: [
        action({
          title: "Vitamin D3",
          dose: { amount: "20000 IU", schedule: "daily" },
        }),
      ],
    });
    expect(checkAssertion(overdosed, { overCeiling: true })).toBe(true);
  });

  it("counts the actions", () => {
    expect(checkAssertion(body(), { maxActions: 5 })).toBe(true);
    expect(checkAssertion(body(), { maxActions: 2 })).toBe(false);
  });
});

describe("runAssertions", () => {
  it("reports each failure and flags a failed must", () => {
    const out = runAssertions(
      body(),
      [{ kind: "test", title: "coeliac" }],
      [{ title: "iodine|kelp" }],
    );
    expect(out).toMatchObject({ passed: 1, total: 2, failedMust: true });
    expect(out.failed).toEqual(["must: kind=test title=coeliac"]);
  });
});
