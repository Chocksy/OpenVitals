import { describe, expect, it, vi } from "vitest";
import {
  applyChips,
  composeReceipt,
  mergeChips,
  NOTHING_TO_KEEP,
  replyFallback,
  writeReply,
  postsToReread,
  understandRead,
  UNREAD_RECEIPT,
  edgeSuggestion,
  heldChips,
  followUp,
  leftover,
  phenotypeChips,
  plainReply,
  readActionStatement,
  timeTokens,
  understandRules,
  verifyModelChips,
  whenOf,
  worthModelling,
  type ActionSubject,
  type Chip,
  type ReplyPack,
} from "./compose";
import type { LatestValue, ModelInput } from "./coverage";
import { computeGraphState } from "./graph-state";
import { CODE_GRAPH } from "./kg";
import type { RankedTerm } from "./lookup";
import { CATALOG } from "./hkb-catalog";

/**
 * The two things `understandRead` reaches out to: the model layer and the
 * ontology search. Both are stubbed, so the reader's failure is a switch this
 * file can flip rather than a provider it has to wait for.
 */
const ai = vi.hoisted(() => ({ down: false, chips: [] as unknown[] }));
vi.mock("ai", () => ({
  generateObject: async () => {
    if (ai.down) {
      // What OpenRouter sends back with the key exhausted, in shape: the
      // production line is `[compose] the model layer failed, rules stand:
      // Error [AI_APICallError]`.
      const e = new Error("Provider returned error");
      e.name = "AI_APICallError";
      throw e;
    }
    return { object: { chips: ai.chips } };
  },
  generateText: async () => ({ text: "" }),
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
  defaultSettingsMiddleware: () => ({}),
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => "stub-model",
}));
vi.mock("./lookup", () => ({ searchTerms: async () => [] }));

/** Monday. Every relative date in this file is measured from it. */
const TODAY = "2026-08-31";

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: TODAY,
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

const value = (v: number, extra: Partial<LatestValue> = {}): LatestValue => ({
  value: v,
  unit: null,
  date: "2026-08-01",
  status: "green",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...extra,
});

const chips = (text: string, m = input()) => understandRules(text, m, TODAY);
const byKey = (text: string, key: string, m = input()) =>
  chips(text, m).find((c) => c.key === key);

describe("dates in the words", () => {
  it("reads yesterday and the day before", () => {
    expect(whenOf("felt awful yesterday", TODAY)?.date).toBe("2026-08-30");
    expect(whenOf("the day before yesterday", TODAY)?.date).toBe("2026-08-29");
  });

  it("reads a span, in words or in digits", () => {
    expect(whenOf("tired for two weeks", TODAY)?.date).toBe("2026-08-17");
    expect(whenOf("since 3 days", TODAY)?.date).toBe("2026-08-28");
    expect(whenOf("dizzy for a month now", TODAY)?.date).toBe("2026-08-01");
  });

  it("reads how long ago", () => {
    expect(whenOf("started two months ago", TODAY)?.date).toBe("2026-07-02");
  });

  it("reads a weekday as the most recent one", () => {
    // 2026-08-31 is a Monday, so "since Monday" is today, not a week ago.
    expect(whenOf("since Monday", TODAY)?.date).toBe(TODAY);
    expect(whenOf("since Friday", TODAY)?.date).toBe("2026-08-28");
  });

  it("reads last week and an absolute date", () => {
    expect(whenOf("since last week", TODAY)?.date).toBe("2026-08-24");
    expect(whenOf("on 12 Aug", TODAY)?.date).toBe("2026-08-12");
    expect(whenOf("Aug 12", TODAY)?.date).toBe("2026-08-12");
    expect(whenOf("on 2026-07-04", TODAY)?.date).toBe("2026-07-04");
  });

  it("puts a date that has not happened yet into last year", () => {
    expect(whenOf("on 12 December", TODAY)?.date).toBe("2025-12-12");
  });

  it("says nothing when the words say nothing", () => {
    expect(whenOf("I feel tired", TODAY)).toBeNull();
  });
});

describe("clock times", () => {
  it("only counts a number that can be a time", () => {
    expect(timeTokens("waist 94 cm")).toEqual([]);
    expect(timeTokens("last coffee at 16").map((t) => t.hour)).toEqual([16]);
    expect(timeTokens("coffee at 4pm").map((t) => t.hour)).toEqual([16]);
    expect(timeTokens("in bed by 23:30").map((t) => t.hour)).toEqual([23.5]);
  });
});

describe("understandRules: the twenty-five sentences", () => {
  it("1. a symptom in plain words", () => {
    expect(byKey("I feel tired", "sym_energy")?.value).toBe("Yes");
    expect(byKey("I feel tired", "sym_energy")?.kind).toBe("symptom");
  });

  it("2. a symptom with a time of day", () => {
    const c = chips("tired in the afternoons since last week");
    expect(c.find((x) => x.key === "sym_energy")?.value).toBe("Yes");
    expect(c.find((x) => x.key === "energy_when")?.value).toBe("Afternoons");
  });

  it("3. every chip carries the date the words gave", () => {
    for (const c of chips("tired in the afternoons since last week"))
      expect(c.date).toBe("2026-08-24");
  });

  it("4. a clock time against the coffee fact", () => {
    expect(byKey("last coffee at 4pm", "coffee_last_hour")?.value).toBe(
      "16:00",
    );
  });

  it("5. the same in 24-hour with minutes", () => {
    expect(byKey("my last coffee is at 16:30", "coffee_last_hour")?.value).toBe(
      "16:30",
    );
  });

  it("6. bedtime", () => {
    expect(byKey("in bed by 23:30 most nights", "bedtime_hour")?.value).toBe(
      "23:30",
    );
  });

  it("7. the last meal", () => {
    expect(byKey("dinner at 21:00", "last_meal_hour")?.value).toBe("21:00");
  });

  it("8. a home glucose with no unit lands in mg/dL", () => {
    const c = byKey("glucose 98 this morning", "glucose");
    expect(c?.value).toBe(98);
    expect(c?.unit).toBe("mg/dL");
    expect(c?.kind).toBe("reading");
  });

  it("9. a millimolar glucose is converted, not believed", () => {
    expect(byKey("glucose 5.4 mmol/l", "glucose")?.value).toBeCloseTo(97.2, 1);
  });

  it("10. and the unit can be left out when only one is plausible", () => {
    expect(byKey("blood sugar 5.4", "glucose")?.value).toBeCloseTo(97.2, 1);
  });

  it("11. a weight in kilos becomes the catalog's pounds", () => {
    expect(byKey("weight 82 kg", "weight")?.value).toBeCloseTo(180.8, 1);
  });

  it("12. HbA1c", () => {
    expect(byKey("hba1c 5.4%", "hba1c")?.value).toBe(5.4);
  });

  it("13. sleep in hours becomes minutes", () => {
    expect(byKey("slept 6h", "sleep_duration")?.value).toBe(360);
  });

  it("14. blood pressure is two readings", () => {
    const c = chips("BP 128/82 this morning");
    expect(c.find((x) => x.key === "bp_systolic")?.value).toBe(128);
    expect(c.find((x) => x.key === "bp_diastolic")?.value).toBe(82);
  });

  it("15. a waist is a fact, not a reading", () => {
    const c = byKey("waist 94", "waist_cm");
    expect(c?.kind).toBe("fact");
    expect(c?.value).toBe("94");
  });

  it("16. a resting heart rate", () => {
    expect(byKey("resting heart rate 54", "resting_hr")?.value).toBe("54");
  });

  it("17. cold intolerance", () => {
    expect(byKey("my hands are always cold", "sym_cold")?.value).toBe("Yes");
  });

  it("18. weight gain, as the option the question offers", () => {
    expect(byKey("I have put on weight", "sym_weight")?.value).toBe("Gained");
  });

  it("19. bowel pattern picks one option only", () => {
    expect(byKey("constipated most weeks", "sym_bowel")?.value).toBe(
      "Constipation",
    );
  });

  it("20. snoring", () => {
    expect(byKey("I snore every night", "sleep_snoring")?.value).toBe(
      "Most nights",
    );
  });

  it("21. smoking, in the past tense", () => {
    expect(byKey("I quit smoking in March", "smoking")?.value).toBe("Former");
  });

  it("22. periods", () => {
    expect(byKey("heavy periods again", "sym_cycle")?.value).toBe("Heavy");
  });

  it("22b. periods all over the place, and the acne next to them", () => {
    const text =
      "my periods have been all over the place and I keep breaking out";
    expect(byKey(text, "sym_cycle")?.value).toBe("Irregular");
    const acne = byKey(text, "hirsutism_acne");
    expect(acne?.value).toBe("Yes");
    expect(acne?.kind).toBe("symptom");
  });

  it("22c. a plant-based diet, which is what the B12 rules read", () => {
    expect(byKey("I went vegan in the spring", "diet")?.value).toBe("Vegan");
  });

  it("23. a life event keeps its own sentence", () => {
    const c = byKey("I had the flu last week. Now I am fine.", "acute_illness");
    expect(c?.kind).toBe("event");
    expect(c?.value).toBe("I had the flu last week");
  });

  it("24. a surgery is the post-viral tag, dated", () => {
    const c = byKey("gallbladder surgery on 12 Aug", "post_viral");
    expect(c?.date).toBe("2026-08-12");
  });

  it("25. a sentence the rules know nothing about produces no chip", () => {
    expect(chips("bought a new bike and the weather is good")).toEqual([]);
  });

  it("never invents a value the question does not offer", () => {
    for (const c of chips("tired, cold, constipated, snoring every night"))
      if (c.kind === "symptom" || c.kind === "fact")
        expect(typeof c.value).toBe("string");
  });
});

describe("the ontology layer", () => {
  const terms: RankedTerm[] = [
    {
      id: "HP:0002315",
      ontology: "HP",
      name: "Headache",
      synonyms: ["Headaches"],
      score: 0.9,
    },
    {
      id: "HP:0000988",
      ontology: "HP",
      name: "Skin rash",
      synonyms: ["Rash"],
      score: 0.7,
      via: "rash",
    },
    {
      id: "MONDO:0005044",
      ontology: "MONDO",
      name: "Hypertension",
      synonyms: [],
      score: 0.95,
    },
    {
      id: "HP:0001250",
      ontology: "HP",
      name: "Seizure",
      synonyms: [],
      score: 0.3,
    },
  ];

  it("takes HPO terms above the floor and never a disease", () => {
    const out = phenotypeChips("headache and a rash", terms, TODAY);
    expect(out.map((c) => c.key)).toEqual(["HP:0002315", "HP:0000988"]);
    expect(out[0]!.kind).toBe("phenotype");
    expect(out[0]!.value).toBe("present");
    expect(out[0]!.label).toContain("a finding the engine reads");
  });

  it("drops a weak match", () => {
    expect(phenotypeChips("x", [terms[3]!], TODAY).map((c) => c.key)).toEqual(
      [],
    );
  });
});

describe("what is left for the model", () => {
  it("subtracts every quote the rules consumed", () => {
    const text = "tired in the afternoons, last coffee at 4pm";
    expect(leftover(text, chips(text)).length).toBeLessThan(text.length / 2);
  });

  it("only calls the model when real words are left", () => {
    expect(worthModelling("i am and the")).toBe(false);
    expect(worthModelling("burning soles after a hot shower")).toBe(true);
  });

  it("drops a model chip whose quote is not in the note", () => {
    const out = verifyModelChips(
      [
        {
          kind: "fact",
          key: "sym_thirst",
          value: "Yes",
          quote: "drinking litres",
          confidence: 0.8,
        },
        {
          kind: "fact",
          key: "sym_thirst",
          value: "Yes",
          quote: "a sentence that is not there",
          confidence: 0.9,
        },
      ],
      "I keep drinking litres of water",
      [],
      TODAY,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.by).toBe("model");
  });

  it("drops a model chip whose key or value is not on the list", () => {
    const out = verifyModelChips(
      [
        {
          kind: "fact",
          key: "made_up",
          value: "Yes",
          quote: "x",
          confidence: 1,
        },
        {
          kind: "fact",
          key: "sym_energy",
          value: "Sometimes",
          quote: "x",
          confidence: 1,
        },
        {
          kind: "phenotype",
          key: "HP:9999999",
          value: "present",
          quote: "x",
          confidence: 1,
        },
        {
          kind: "reading",
          key: "glucose",
          value: "9000",
          quote: "x",
          confidence: 1,
        },
      ],
      "x",
      [],
      TODAY,
    );
    expect(out).toEqual([]);
  });
});

describe("the follow-up", () => {
  const male41 = input({
    sex: "male",
    age: 41,
    profile: { sex: "male", birth_year: 1985 },
  });

  it("asks when in the day, on the tired path", () => {
    const q = followUp(chips("I feel tired", male41), male41, CATALOG);
    expect(q?.key).toBe("energy_when");
    expect(q?.options).toContain("Afternoons");
  });

  it("asks how long, once the time of day is on file", () => {
    const m = input({
      ...male41,
      profile: { ...male41.profile, energy_when: "Afternoons" },
    });
    expect(followUp(chips("I feel tired", m), m, CATALOG)?.key).toBe(
      "sym_energy_duration",
    );
  });

  it("asks for the last coffee once the afternoon slump is on file", () => {
    const m = input({
      ...male41,
      profile: {
        ...male41.profile,
        energy_when: "Afternoons",
        sym_energy_duration: "Over a month",
        sym_energy: "Yes",
      },
    });
    const q = followUp(chips("still tired every afternoon", m), m, CATALOG);
    expect(q?.key).toBe("coffee_last_hour");
  });

  it("asks nothing about a bruise", () => {
    expect(followUp([], male41, CATALOG)).toBeNull();
    const bruise: Chip[] = [
      {
        kind: "unknown",
        key: "bruise",
        label: "bruise",
        value: "a bruise on my shin",
        date: TODAY,
        quote: "bruise",
        confidence: 0.4,
        by: "rule",
      },
    ];
    expect(followUp(bruise, male41, CATALOG)).toBeNull();
  });

  it("asks whether a home glucose was fasting", () => {
    const q = followUp(
      chips("glucose 98 this morning", male41),
      male41,
      CATALOG,
    );
    expect(q?.key).toBe("glucose_when");
    expect(q?.options).toEqual(["Fasting", "After a meal"]);
  });

  it("asks about witnessed apnoea after snoring", () => {
    const q = followUp(chips("I snore every night", male41), male41, CATALOG);
    expect(q?.key).toBe("sleep_apnoea_witnessed");
  });
});

describe("what the composer refuses to write yet", () => {
  it("holds the tiredness symptom until it has lasted a month", () => {
    const m = input();
    expect([...heldChips(chips("I feel tired", m), m)]).toEqual(["sym_energy"]);
  });

  it("writes it when the post itself says it has been longer", () => {
    const m = input();
    expect([...heldChips(chips("tired for two months", m), m)]).toEqual([]);
  });

  it("writes it once the duration answer is on file", () => {
    const m = input({ profile: { sym_energy_duration: "Over a month" } });
    expect([...heldChips(chips("I feel tired", m), m)]).toEqual([]);
  });
});

describe("chips as an overlay", () => {
  it("puts facts, readings and phenotypes where the engine reads them", () => {
    const m = applyChips(
      input(),
      chips("tired in the afternoons, glucose 98, last coffee at 4pm").concat({
        kind: "phenotype",
        key: "HP:0002315",
        label: "Headache",
        value: "present",
        date: TODAY,
        quote: "headache",
        confidence: 0.9,
        by: "rule",
      }),
    );
    expect(m.profile.energy_when).toBe("Afternoons");
    expect(m.profile.coffee_last_hour).toBe("16:00");
    expect(m.profile["hp:HP:0002315"]).toBe("present");
    expect(m.latest.glucose?.value).toBe(98);
  });
});

describe("the reply", () => {
  const pack: ReplyPack = {
    today: TODAY,
    wrote: [
      { label: "energy · yes", date: "2026-08-24", quote: "tired" },
      { label: "last coffee 16:00", date: TODAY, quote: "coffee at 4pm" },
    ],
    moved: [],
    edges: [
      {
        id: "coffee_after_15->sym_energy@afternoons",
        mechanism: "Caffeine six hours before bed cost an hour of sleep.",
        grade: "B",
        source: "Drake 2013 J Clin Sleep Med",
        reasons: ["coffee last hour 16:00"],
      },
    ],
    suggestion: {
      text: "Move your coffee before 15:00 for two weeks, then post how it went.",
      grade: "B",
      basis: "science",
    },
    memory: { posts: [], facts: [] },
    followUp: null,
  };

  it("writes three plain lines with the model off", () => {
    const lines = plainReply(pack).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("2026-08-24");
    expect(lines[1]).toBe(pack.edges[0]!.mechanism);
    expect(lines[2]).toContain("[B]");
  });

  it("stops after the mechanism when there is nothing to suggest", () => {
    expect(plainReply({ ...pack, suggestion: null }).split("\n")).toHaveLength(
      2,
    );
  });

  it("turns a timing edge into a suggestion with no per-edge text", () => {
    const edge = CODE_GRAPH.edges.find(
      (e) => e.id === "coffee_after_15->sym_energy@afternoons",
    )!;
    expect(edgeSuggestion(edge, "Coffee after 15:00")).toBe(
      "Move your coffee before 15:00 for two weeks, then post how it went.",
    );
  });

  it("suggests nothing for an edge that is not a behaviour with a clock", () => {
    const edge = CODE_GRAPH.edges.find(
      (e) => e.id === "glucose->sym_energy@dip",
    )!;
    expect(edgeSuggestion(edge, "Glucose")).toBeNull();
  });
});

describe("the phase-20 edges", () => {
  const sleepy = {
    sleep_duration: value(330, { status: "red", optimalLow: 420 }),
  };

  it("fires the afternoon coffee edge only with both answers", () => {
    const m = input({
      profile: {
        coffee_last_hour: "16:00",
        energy_when: "Afternoons",
        sym_energy: "Yes",
      },
    });
    const state = computeGraphState(m);
    expect(state.activeEdges.map((e) => e.id)).toContain(
      "coffee_after_15->sym_energy@afternoons",
    );
  });

  it("does not fire it for a morning slump", () => {
    const m = input({
      profile: {
        coffee_last_hour: "16:00",
        energy_when: "Mornings",
        sym_energy: "Yes",
      },
    });
    const state = computeGraphState(m);
    expect(state.activeEdges.map((e) => e.id)).not.toContain(
      "coffee_after_15->sym_energy@afternoons",
    );
  });

  it("carries a source and a grade on every edge it added", () => {
    for (const id of [
      "coffee_after_15->sleep_duration@anyone",
      "coffee_after_15->sym_energy@afternoons",
      "genome:CYP1A2->coffee_after_15",
      "glucose->sym_energy@dip",
    ]) {
      const edge = CODE_GRAPH.edges.find((e) => e.id === id)!;
      expect(edge, id).toBeDefined();
      expect(edge.grade).toMatch(/^[A-E]$/);
      expect(edge.evidence.length).toBeGreaterThan(0);
      expect(edge.evidence[0]!.title.length).toBeGreaterThan(10);
    }
    void sleepy;
  });
});

/**
 * Phase 27 addendum, from the owner: Discuss on the plan action "Resistance
 * training 3x/week", typed "i already do this", and the box answered "I don't
 * know that word. Ask it as a question, or try the disease name." A subject
 * forced the ask route and a statement fell through to the ontology lookup.
 *
 * A statement about an action is one of five things, and every one of them has
 * a route that already writes it.
 */
describe("readActionStatement", () => {
  const training: ActionSubject = {
    title: "Resistance training 3x/week",
    reportId: "r1",
    index: 2,
  };
  const today = "2026-09-01";
  const read = (text: string, subject = training) =>
    readActionStatement(text, subject, today);

  it("reads the owner's own sentence", () => {
    const r = read("i already do this")!;
    expect(r.stance).toBe("doing");
    expect(r.label).toBe(
      "Already doing: Resistance training 3x/week (since long-standing)",
    );
  });

  it("carries the day it started when the words carry one", () => {
    const r = read("I've been doing this for two months")!;
    expect(r.stance).toBe("doing");
    expect(r.since).toBe("2026-07-03");
    expect(r.label).toContain("since 2026-07-03");
  });

  it("reads a start, and dates it today when nothing else is said", () => {
    const r = read("started last week")!;
    expect(r.stance).toBe("started");
    expect(r.since).toBe("2026-08-25");
    expect(r.label).toBe("Started: Resistance training 3x/week on 2026-08-25");
  });

  it("reads a stop", () => {
    expect(read("i stopped in July")!.stance).toBe("stopped");
    expect(read("quit that months ago")!.stance).toBe("stopped");
  });

  it("reads a refusal, with the reason when there is one", () => {
    const r = read("i can't, because my knee is wrecked")!;
    expect(r.stance).toBe("refused");
    expect(r.reason).toBe("my knee is wrecked");
    expect(r.label).toBe(
      "Not for me: Resistance training 3x/week — my knee is wrecked",
    );
  });

  it("reads a tick for today", () => {
    const r = read("did it today")!;
    expect(r.stance).toBe("done");
    expect(r.since).toBe(today);
  });

  /**
   * Phase 24b: a user's own answer beats the phone's derived one, and "I
   * already do this" about an action with a weekly frequency in its title is
   * a user's own answer.
   */
  it("turns a weekly frequency into the exercise answer", () => {
    expect(read("i already do this")!.exerciseDays).toBe("3–4");
    expect(
      read("i already do this", {
        title: "Walk 5 times a week",
      })!.exerciseDays,
    ).toBe("5+");
    expect(
      read("i already do this", { title: "Zone 2 cardio 2x/week" })!
        .exerciseDays,
    ).toBe("1–2");
  });

  it("writes no exercise answer for an action that is not training", () => {
    expect(
      read("i already do this", { title: "Selenium 200 µg/day" })!.exerciseDays,
    ).toBeUndefined();
  });

  it("says nothing about a sentence that is not about the action", () => {
    expect(read("my hands are cold")).toBeNull();
    expect(read("")).toBeNull();
  });
});

/* ── phase 34a: the reader was down ───────────────────────────────────── */

/**
 * The defect: the owner wrote "took omega 3, berberine and magnesium today,
 * ate some duck feet meat, some bread with sausages and some pancakes with
 * jam", the OpenRouter key was exhausted, the model layer threw, and the
 * phone printed "nothing in that was a fact this app stores". The words were
 * gone. A reader that cannot run is not a verdict about what somebody wrote.
 */
describe("the model layer fails", () => {
  const NOTE =
    "took omega 3, berberine and magnesium today, ate some duck feet meat, some bread with sausages and some pancakes with jam";

  const withKey = async <T>(fn: () => Promise<T>): Promise<T> => {
    const had = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";
    try {
      return await fn();
    } finally {
      if (had == null) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = had;
    }
  };

  it("says the reader failed instead of swallowing it", async () => {
    ai.down = true;
    const read = await withKey(() => understandRead(NOTE, input()));
    expect(read.modelRan).toBe(true);
    expect(read.modelFailed).toBe(true);
  });

  it("saves the words with the exact receipt, unread", async () => {
    ai.down = true;
    const read = await withKey(() => understandRead(NOTE, input()));
    const receipt = composeReceipt(read);
    expect(receipt.saved).toBe(true);
    expect(receipt.read).toBe(false);
    expect(receipt.readState).toBe("unread");
    expect(receipt.reply).toBe(
      "Saved. The reader could not run right now; your words will be read when it is back.",
    );
    expect(receipt.reply).toBe(UNREAD_RECEIPT);
  });

  /**
   * The lie the phone printed. "Nothing in that was a fact" is only ever true
   * of a note a reader actually read, so the receipt for a failed read never
   * carries it and `read: false` is what tells the client to say nothing.
   */
  it("never claims nothing in the note was a fact", async () => {
    ai.down = true;
    const failed = composeReceipt(
      await withKey(() => understandRead(NOTE, input())),
    );
    expect(failed.reply).not.toContain("nothing in that was a fact");
    expect(failed.read).toBe(false);

    // The model ran over words nobody could store anything from: that, and
    // only that, is a client's cue to say the note held no fact.
    ai.down = false;
    ai.chips = [];
    const ran = composeReceipt(await withKey(() => understandRead("ok", input())));
    expect(ran.read).toBe(true);
    expect(ran.readState).toBe("read");
    expect(ran.reply).toBe(NOTHING_TO_KEEP);
    expect(ran.reply).toBe("Nothing to keep from that.");
  });

  /**
   * Phase 34b. The second shape of the same morning: the key was exhausted,
   * the reader came back with nothing rather than an error, and the phone was
   * told the note held no fact. Zero chips out of a sentence that names three
   * supplements and four foods is a reader that did not work.
   */
  it("saves a note the reader kept nothing from unread, for one more look", async () => {
    ai.down = false;
    ai.chips = [];
    const read = await withKey(() => understandRead(NOTE, input()));
    expect(read.modelRan).toBe(true);
    expect(read.modelFailed).toBe(false);
    expect(read.chips).toHaveLength(0);
    expect(read.worthReading).toBe(true);

    const receipt = composeReceipt(read);
    expect(receipt.read).toBe(false);
    expect(receipt.readState).toBe("unread");
    expect(receipt.reply).toBe(UNREAD_RECEIPT);
  });

  /** A reading that kept something is a reading, whatever else it missed. */
  it("stays read when the reader kept anything at all", async () => {
    ai.down = false;
    ai.chips = [];
    const read = await withKey(() =>
      understandRead("weight 84 kg, took omega 3 and magnesium today", input()),
    );
    expect(read.chips.map((c) => c.key)).toContain("weight");
    const receipt = composeReceipt(read);
    expect(receipt.read).toBe(true);
    expect(receipt.readState).toBe("read");
    expect(receipt.reply).toContain("Kept: ");
  });

  /**
   * The exact sentence, and the two shapes next to it. `STOP` eats "took",
   * "ate" and "had" as filler, so the note that started this had to be worth
   * a model call on its verbs alone.
   */
  it("sends anything a person took, ate or measured to the model", () => {
    expect(worthModelling(NOTE)).toBe(true);
    expect(worthModelling("ate a salad with tuna")).toBe(true);
    expect(worthModelling("took 2000 IU vitamin D")).toBe(true);
    expect(worthModelling("took my magnesium")).toBe(true);
    expect(worthModelling("ok thanks")).toBe(false);
    expect(worthModelling("ok")).toBe(false);
    expect(worthModelling("thanks")).toBe(false);
  });

  /**
   * The last thing the owner saw was `reply: ""`. Nothing the composer sends
   * back is ever the empty string: with chips it is what was kept, without
   * them it is the receipt for the read that happened.
   */
  describe("the reply is never empty", () => {
    const label = (l: string): { label: string } => ({ label: l });

    it("falls back to what was kept", () => {
      expect(
        replyFallback([label("Omega-3 · yes"), label("Magnesium · yes")], {
          reply: NOTHING_TO_KEEP,
        }),
      ).toBe("Kept: Omega-3 · yes, Magnesium · yes.");
    });

    it("falls back to the receipt when nothing was kept", () => {
      expect(replyFallback([], { reply: UNREAD_RECEIPT })).toBe(UNREAD_RECEIPT);
      expect(replyFallback([], { reply: NOTHING_TO_KEEP })).toBe(
        "Nothing to keep from that.",
      );
      // Even handed an empty receipt, it says something true.
      expect(replyFallback([], { reply: "" })).toBe("Nothing to keep from that.");
    });

    it("is what the route prints when the reply model gives it nothing", async () => {
      const pack: ReplyPack = {
        wrote: [],
        moved: [],
        edges: [],
        suggestion: null,
        said: [],
      } as unknown as ReplyPack;
      // The provider is the same one the reader uses: it answers with "".
      const written = await writeReply(pack);
      expect(written.trim()).toBe("");
      expect(written.trim() || replyFallback([], { reply: UNREAD_RECEIPT })).toBe(
        UNREAD_RECEIPT,
      );
    });
  });

  it("keeps whatever the rules alone understood", async () => {
    ai.down = true;
    const read = await withKey(() =>
      understandRead(
        "weight 84 kg, ate some duck feet meat and some pancakes with jam",
        input(),
      ),
    );
    expect(read.modelFailed).toBe(true);
    expect(read.chips.map((c) => c.key)).toContain("weight");
  });

  it("does not call the model at all without a key", async () => {
    ai.down = true;
    const had = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const read = await understandRead(NOTE, input());
    if (had != null) process.env.OPENROUTER_API_KEY = had;
    expect(read.modelRan).toBe(false);
    expect(read.modelFailed).toBe(false);
    expect(composeReceipt(read).read).toBe(true);
  });
});

/** The later pass: every kept note read exactly once, whatever runs it. */
describe("the re-read", () => {
  const post = (id: string, readState: string) => ({ id, readState });

  it("picks up the unread notes and nothing else", () => {
    const rows = [post("a", "unread"), post("b", "read"), post("c", "unread")];
    expect(postsToReread(rows).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("reads a note once and never twice", () => {
    let rows = [post("a", "unread"), post("b", "read")];
    const first = postsToReread(rows);
    expect(first).toHaveLength(1);
    // What the pass writes for every note it read.
    const done = new Set(first.map((p) => p.id));
    rows = rows.map((r) => (done.has(r.id) ? { ...r, readState: "read" } : r));
    expect(postsToReread(rows)).toHaveLength(0);
    // And a third pass over the same rows still has nothing to do.
    expect(postsToReread(rows)).toHaveLength(0);
  });

  /**
   * Phase 34b. The owner's notes of 3 and 4 September were saved before
   * `read_state` existed: they say `read`, and they carry no chips, because
   * the reader's key was exhausted when they were written. The pass has to
   * pick them up too, and stop after two goes.
   */
  describe("notes that came out empty", () => {
    const NOW = new Date("2026-09-04T09:00:00Z");
    const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
    const empty = (
      id: string,
      createdAt: Date,
      over: { chips?: unknown[]; readAttempts?: number } = {},
    ) => ({
      id,
      readState: "read",
      chips: over.chips ?? [],
      createdAt,
      readAttempts: over.readAttempts ?? 0,
    });

    it("picks up an empty read note from the last fourteen days", () => {
      const rows = [
        empty("sep3", days(1)),
        empty("sep4", days(0)),
        empty("old", days(20)),
        empty("kept", days(1), { chips: [{ key: "weight" }] }),
      ];
      expect(postsToReread(rows, NOW).map((p) => p.id)).toEqual([
        "sep3",
        "sep4",
      ]);
    });

    it("stops after two goes at the same note", () => {
      expect(
        postsToReread([empty("a", days(1), { readAttempts: 1 })], NOW),
      ).toHaveLength(1);
      expect(
        postsToReread([empty("a", days(1), { readAttempts: 2 })], NOW),
      ).toHaveLength(0);
      // The cap holds for a note the reader was down for as well.
      expect(
        postsToReread(
          [{ ...empty("b", days(1), { readAttempts: 2 }), readState: "unread" }],
          NOW,
        ),
      ).toHaveLength(0);
    });
  });

  it("adds only the chips the note did not already carry", () => {
    const chip = (key: string, date: string): Chip => ({
      kind: "fact",
      key,
      label: key,
      value: "yes",
      date,
      quote: key,
      confidence: 1,
      by: "rule",
    });
    const existing = [chip("weight", "2026-08-20")];
    const fresh = [chip("weight", "2026-08-20"), chip("sup_omega3", "2026-08-20")];
    const added = mergeChips(existing, fresh);
    expect(added.map((c) => c.key)).toEqual(["sup_omega3"]);
    // The day the words were written, never the day they were read.
    expect(added[0]!.date).toBe("2026-08-20");
  });
});
