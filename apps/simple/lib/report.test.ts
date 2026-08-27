import { describe, it, expect, vi } from "vitest";
import type { ReportAction, ReportBody } from "@/db";
import type { LatestValue } from "./coverage";
import type { TrackerSummary } from "./daily-data";
import type { Rule } from "./vectors";

// The model never runs in tests. `postProcess` is pure, but the mock makes it
// impossible for an import to reach OpenRouter by accident.
vi.mock("ai", () => ({
  generateObject: vi.fn(async () => {
    throw new Error("the model must not be called in tests");
  }),
}));

const { postProcess, buildContextFromInput } = await import("./report");

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
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      action({
        title: `Improve ${["lipids","sleep","iron","kidney","liver","thyroid","glucose","fitness","vitamin","alcohol","protein","hydration"][i]} markers`,
        weight: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      }),
    );

  it("keeps at most ten actions the person does themselves, heaviest first", () => {
    const out = postProcess(body({ actions: many(12) }), []);
    expect(out.actions).toHaveLength(10);
    expect(out.actions[0]!.weight).toBe(5);
    const weights = out.actions.map((a) => a.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it("never caps the tests, so every fired rule still lands", () => {
    const markers = ["lipoprotein", "apolipoprotein", "haemoglobin", "creatinine", "ferritin", "thyrotropin", "cortisol", "homocysteine", "calcium", "albuminuria", "cystatin", "insulin", "uric", "folate"];
    const rules = markers.map((marker) =>
      rule({
        id: `rule_${marker}`,
        suggest: `Measure ${marker}`,
        why: `${marker} decides what happens next for this person.`,
      }),
    );
    const out = postProcess(body({ actions: many(6) }), rules);
    const tests = out.actions.filter((a) => a.kind === "test");
    const rest = out.actions.filter((a) => a.kind !== "test");
    expect(tests).toHaveLength(14);
    expect(rest).toHaveLength(6);
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

describe("the context pack", () => {
  const tracker: TrackerSummary = {
    from: "2026-07-29",
    to: "2026-08-27",
    items: [],
    averages: { sleepHours: 6.8 },
    loggedDays: 30,
    adherencePct: 0,
  };

  const reading = (
    value: number,
    extra: Partial<LatestValue> = {},
  ): LatestValue => ({
    value,
    unit: null,
    date: "2026-08-01",
    status: "green",
    optimalLow: null,
    optimalHigh: null,
    refLow: null,
    refHigh: null,
    ...extra,
  });

  const hashimoto = buildContextFromInput(
    {
      today: "2026-08-27",
      profile: { sex: "female", birth_year: 1990 },
      sex: "female",
      age: 36,
      latest: {
        tpo_antibodies: reading(320, { status: "red", refHigh: 34, unit: "IU/mL" }),
        tsh: reading(3.9, { refLow: 0.4, refHigh: 4.5, prev: 3.1 }),
      },
      derived: {},
    },
    { tracker },
  );

  it("names the matched pattern with its controversy", () => {
    expect(hashimoto.context).toContain("MATCHED PATTERNS");
    expect(hashimoto.context).toContain("hashimoto (stage: early)");
    expect(hashimoto.context).toContain("controversy:");
  });

  it("prints the hot graph and the active edges", () => {
    expect(hashimoto.context).toContain("HOT GRAPH");
    expect(hashimoto.context).toContain("ACTIVE EDGES");
    expect(hashimoto.context).toContain("metric:tpo_antibodies");
  });

  it("appends the pattern escalations to the fired rules", () => {
    expect(hashimoto.rules.map((r) => r.id)).toContain("hashimoto_full_panel");
  });

  it("queues the pattern's unanswered questions", () => {
    expect(hashimoto.questions.map((q) => q.key)).toContain("pregnancy_plans");
  });
});

describe("traceability", () => {
  const graph = {
    matchedPatternIds: ["hashimoto"],
    activeEdgeIds: ["tsh->ldl_cholesterol", "selenium->tpo_antibodies"],
    hotNodeIds: ["metric:tsh", "metric:ldl_cholesterol"],
    hasReadings: true,
  };

  const opinion = (reasoning: string) =>
    action({
      title: "Selenium 200 µg",
      kind: "supplement",
      basis: "opinion",
      reasoning,
    });

  it("leaves a real citation alone", () => {
    const out = postProcess(
      body({
        actions: [
          opinion("pattern:hashimoto with tsh 3.9 via selenium->tpo_antibodies"),
        ],
      }),
      [],
      graph,
    );
    expect(out.actions[0]!.reasoning).toBe(
      "pattern:hashimoto with tsh 3.9 via selenium->tpo_antibodies",
    );
    expect(out.actions[0]!.basis).toBe("opinion");
  });

  it("strips an id that is not real for this person", () => {
    const out = postProcess(
      body({ actions: [opinion("pattern:lmhr and pattern:hashimoto, tsh 3.9")] }),
      [],
      graph,
    );
    expect(out.actions[0]!.reasoning).toBe(
      "[unverified graph reference removed] and pattern:hashimoto, tsh 3.9",
    );
    expect(out.actions[0]!.basis).toBe("opinion");
  });

  it("flags an opinion that cites nothing", () => {
    const out = postProcess(
      body({ actions: [opinion("Selenium usually helps antibodies.")] }),
      [],
      graph,
    );
    expect(out.actions[0]!.reasoning).toBe(
      "[no graph reference] Selenium usually helps antibodies.",
    );
  });

  it("does not swallow the bracket around a citation", () => {
    const out = postProcess(
      body({ actions: [opinion("(edge tsh->ldl_cholesterol) and tsh 6.2")] }),
      [],
      graph,
    );
    expect(out.actions[0]!.reasoning).not.toContain("[");
  });

  it("reads the arrow the model actually writes", () => {
    const out = postProcess(
      body({ actions: [opinion("via edge tsh\u2192ldl_cholesterol")] }),
      [],
      graph,
    );
    expect(out.actions[0]!.reasoning).not.toContain("[");
  });

  it("checks a metric id against the hot nodes", () => {
    const out = postProcess(
      body({ actions: [opinion("metric:ferritin is low")] }),
      [],
      graph,
    );
    expect(out.actions[0]!.reasoning).toContain(
      "[unverified graph reference removed]",
    );
  });

  it("skips the check for science actions and when no graph is given", () => {
    const science = action({ basis: "science", reasoning: "" });
    expect(postProcess(body({ actions: [science] }), [], graph).actions[0]!.reasoning).toBe("");
    expect(postProcess(body({ actions: [opinion("nothing")] }), []).actions[0]!.reasoning).toBe("nothing");
  });
});

describe("what the model should never have written", () => {
  const cold = {
    matchedPatternIds: [],
    activeEdgeIds: [],
    hotNodeIds: [],
    hasReadings: true,
  };
  const empty = { ...cold, hasReadings: false };

  it("drops opinion actions when nothing in the graph is hot", () => {
    const out = postProcess(
      body({
        actions: [
          action({ basis: "opinion", title: "Take magnesium at night" }),
          action({ basis: "science", title: "Walk 8000 steps" }),
        ],
      }),
      [],
      cold,
    );
    expect(out.actions.map((a) => a.title)).toEqual(["Walk 8000 steps"]);
  });

  it("keeps opinion actions when the graph has hot nodes", () => {
    const out = postProcess(
      body({ actions: [action({ basis: "opinion", title: "Take magnesium" })] }),
      [],
      { ...cold, hotNodeIds: ["metric:tsh"] },
    );
    expect(out.actions).toHaveLength(1);
  });

  it("drops an action that only asks for an interview fact", () => {
    const titles = [
      "Report height in cm and weight in kg",
      "Gather height, weight and waist before any nutrition change",
      "Provide your full medication and supplement list",
      "Answer all remaining tier-0 questions",
      "Collect family history and conditions first",
    ];
    const out = postProcess(
      body({
        actions: [
          ...titles.map((title) => action({ title })),
          action({ title: "Eat 30 g of fibre a day" }),
        ],
      }),
      [],
    );
    expect(out.actions.map((a) => a.title)).toEqual(["Eat 30 g of fibre a day"]);
  });

  it("does not drop a real supplement action for the word supplement", () => {
    const out = postProcess(
      body({ actions: [action({ title: "Supplement vitamin D3 2000 IU" })] }),
      [],
    );
    expect(out.actions).toHaveLength(1);
  });

  it("leaves the fired rules as the whole plan when there are no readings", () => {
    const out = postProcess(
      body({
        actions: [
          action({ kind: "supplement", title: "Magnesium glycinate 300 mg" }),
          action({ kind: "doctor", title: "Ask for a statin" }),
          action({ kind: "test", title: "Measure vitamin D" }),
        ],
      }),
      [rule()],
      empty,
    );
    expect(out.actions.map((a) => a.title).sort()).toEqual([
      "Measure Lp(a) once",
      "Measure vitamin D",
    ]);
  });
});

describe("the prose follows the actions", () => {
  const empty = {
    matchedPatternIds: [],
    activeEdgeIds: [],
    hotNodeIds: [],
    hasReadings: false,
  };

  // The zero-data plan: the model promised two supplements, postProcess threw
  // both away, and the summary was still selling them.
  const zeroData = body({
    summary: [
      "Order every missing tier-0 and tier-1 vector plus the full thyroid panel.",
      "Start food-first levers on protein, sunlight and movement; add vitamin D 4000 IU/day and selenium 200 µg/day.",
      "Expect vitamin D to reach 40 ng/mL by 12 weeks.",
    ],
    eli5:
      "Your body is a new car with the hood still closed. Take vitamin D 4000 IU every morning while we look.",
    actions: [
      action({
        title: "Supplement vitamin D3 4000 IU daily",
        kind: "supplement",
        dose: { amount: "4000 IU", schedule: "daily" },
      }),
      action({ title: "Supplement selenium 200 µg daily", kind: "supplement" }),
      action({ title: "Measure vitamin D", kind: "test" }),
    ],
  });

  it("drops the summary lines and eli5 sentences that sell a dropped action", () => {
    const out = postProcess(zeroData, [], empty);
    expect(out.actions.map((a) => a.title)).toEqual(["Measure vitamin D"]);
    expect(out.summary).toEqual([
      "Order every missing tier-0 and tier-1 vector plus the full thyroid panel.",
    ]);
    expect(out.eli5).toBe("Your body is a new car with the hood still closed.");
  });

  it("says so when nothing is left to say", () => {
    const out = postProcess(
      body({
        summary: ["Add vitamin D 4000 IU/day."],
        eli5: "Take vitamin D every morning.",
        actions: [
          action({
            title: "Supplement vitamin D3 4000 IU daily",
            kind: "supplement",
          }),
        ],
      }),
      [],
      empty,
    );
    expect(out.summary).toEqual(["Nothing to act on beyond the tests listed."]);
    expect(out.eli5).toBe("Nothing to act on beyond the tests listed.");
  });

  it("leaves the prose alone when nothing was dropped", () => {
    const out = postProcess(zeroData, [], { ...empty, hasReadings: true });
    expect(out.summary).toHaveLength(3);
    expect(out.eli5).toBe(zeroData.eli5);
  });
});

describe("rule ids never reach a title", () => {
  it("strips the id the context pack used to hand the model", () => {
    const out = postProcess(
      body({
        actions: [
          action({
            title: "thyroid_workup: Repeat TSH with free T4, free T3 and anti-TPO",
            kind: "test",
          }),
        ],
      }),
      [],
    );
    expect(out.actions[0]!.title).toBe(
      "Repeat TSH with free T4, free T3 and anti-TPO",
    );
  });

  it("strips an id it only knows from the rules it was given", () => {
    const out = postProcess(
      body({ actions: [action({ title: "lpaonce: Measure Lp(a) once", kind: "test" })] }),
      [rule({ id: "lpaonce" })],
    );
    expect(out.actions[0]!.title).toBe("Measure Lp(a) once");
  });

  it("leaves a real colon in a title alone", () => {
    const out = postProcess(
      body({ actions: [action({ title: "Iron: 60 mg on alternate days", kind: "test" })] }),
      [],
    );
    expect(out.actions[0]!.title).toBe("Iron: 60 mg on alternate days");
  });

  it("hands the model the rule id in brackets, not as a prefix", () => {
    const { context } = buildContextFromInput(
      {
        today: "2026-08-27",
        profile: { sex: "female", birth_year: 1992 },
        sex: "female",
        age: 34,
        latest: {},
        derived: {},
      },
      {
        tracker: {
          from: "2026-07-29",
          to: "2026-08-27",
          items: [],
          averages: {},
          loggedDays: 0,
          adherencePct: 0,
        },
      },
    );
    expect(context).toContain("(rule lpa_once)");
    expect(context).not.toContain("- lpa_once:");
  });
});

