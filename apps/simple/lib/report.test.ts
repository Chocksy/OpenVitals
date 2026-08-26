import { describe, it, expect, vi } from "vitest";
import type { ReportAction, ReportBody } from "@/db";
import type { Rule } from "./vectors";

// The model never runs in tests. `postProcess` is pure, but the mock makes it
// impossible for an import to reach OpenRouter by accident.
vi.mock("ai", () => ({
  generateObject: vi.fn(async () => {
    throw new Error("the model must not be called in tests");
  }),
}));

const { postProcess } = await import("./report");

const action = (over: Partial<ReportAction> = {}): ReportAction => ({
  title: "Walk 8000 steps",
  kind: "exercise",
  weight: 3,
  basis: "science",
  why: "Steps are the cheapest lever you have.",
  reasoning: "",
  targets: [],
  evidence: [{ kind: "meta", title: "Paluch 2022" }],
  followUp: [],
  ...over,
});

const body = (over: Partial<ReportBody> = {}): ReportBody => ({
  summary: ["one", "two", "three", "four"],
  eli5: "Your engine runs fine, the fuel filter needs a look.",
  systems: [],
  actions: [],
  questions: [],
  ...over,
});

const rule = (over: Partial<Rule> = {}): Rule => ({
  id: "lpa_once",
  when: () => true,
  suggest: "Measure Lp(a) once",
  why: "Lp(a) is inherited and barely moves in a lifetime, so one measurement settles it for good.",
  tier: 1,
  basis: "science",
  ref: "EAS 2022 consensus on Lp(a)",
  ...over,
});

describe("dose ceilings", () => {
  const overdose = action({
    title: "Vitamin D3",
    kind: "supplement",
    basis: "opinion",
    reasoning: "Vitamin D was 23.3 ng/mL in 2024-11.",
    dose: { amount: "20000 IU", schedule: "daily with the largest meal" },
  });

  it("drops a 20000 IU vitamin D action", () => {
    const out = postProcess(body({ actions: [overdose] }), []);
    expect(out.actions.map((a) => a.title)).not.toContain("Vitamin D3");
  });

  it("replaces it with a question naming the ceiling", () => {
    const out = postProcess(body({ actions: [overdose] }), []);
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0]!.text).toContain("20000 IU");
    expect(out.questions[0]!.text).toContain("10000 IU");
  });

  it("keeps a dose inside the ceiling", () => {
    const safe = action({
      ...overdose,
      dose: { amount: "4000 IU", schedule: "daily with the largest meal" },
    });
    const out = postProcess(body({ actions: [safe] }), []);
    expect(out.actions.map((a) => a.title)).toContain("Vitamin D3");
  });

  it("refuses a potassium supplement at any dose", () => {
    const potassium = action({
      title: "Potassium citrate",
      kind: "supplement",
      dose: { amount: "99 mg", schedule: "daily" },
    });
    const out = postProcess(body({ actions: [potassium] }), []);
    expect(out.actions).toHaveLength(0);
  });
});

describe("fired rules", () => {
  it("appends a test action for a rule the model forgot", () => {
    const out = postProcess(body({ actions: [action()] }), [rule()]);
    const appended = out.actions.find((a) => a.title === "Measure Lp(a) once")!;
    expect(appended).toBeDefined();
    expect(appended.kind).toBe("test");
    expect(appended.basis).toBe("science");
    expect(appended.evidence[0]!.title).toBe("EAS 2022 consensus on Lp(a)");
  });

  it("does not duplicate a rule the model already covered", () => {
    const covered = action({
      title: "Measure Lp(a) once",
      kind: "test",
      why: rule().why,
    });
    const out = postProcess(body({ actions: [covered] }), [rule()]);
    expect(
      out.actions.filter((a) => a.title === "Measure Lp(a) once"),
    ).toHaveLength(1);
  });
});

describe("limits", () => {
  it("keeps at most ten actions, heaviest first", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      action({
        title: `Improve ${["lipids","sleep","iron","kidney","liver","thyroid","glucose","fitness","vitamin","alcohol","protein","hydration"][i]} markers`,
        weight: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      }),
    );
    const out = postProcess(body({ actions: many }), []);
    expect(out.actions).toHaveLength(10);
    expect(out.actions[0]!.weight).toBe(5);
    const weights = out.actions.map((a) => a.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it("trims the summary to three lines and the questions to three", () => {
    const out = postProcess(
      body({
        questions: Array.from({ length: 5 }, (_, i) => ({
          key: `q${i}`,
          text: `question ${i}`,
          why: "because",
        })),
      }),
      [],
    );
    expect(out.summary).toHaveLength(3);
    expect(out.questions).toHaveLength(3);
  });
});
