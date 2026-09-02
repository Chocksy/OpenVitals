import { describe, expect, it } from "vitest";
import type { ReportAction } from "@/db";
import {
  actionLine,
  aimOf,
  basisOfGrade,
  doseParts,
  labelOf,
  pickActions,
  saysSomething,
  type InterventionLine,
  type PlanLine,
} from "./actions";

const action = (over: Partial<ReportAction> = {}): ReportAction => ({
  title: "Selenium 200 µg/day",
  kind: "supplement",
  weight: 4,
  basis: "science",
  why: "TPO antibodies fall on selenium in Hashimoto's.",
  reasoning: "",
  targets: [
    {
      code: "tpo_antibodies",
      direction: "down" as const,
      expect: "under 300 IU/mL",
      measureAfterWeeks: 12,
    },
  ],
  evidence: [],
  followUp: [],
  ...over,
});

const paper = (over: Partial<InterventionLine> = {}): InterventionLine => ({
  id: "int-1",
  conditionId: "hashimoto",
  name: "Selenomethionine",
  dose: "200 µg/day",
  duration: "6 months",
  effect: "-40 %",
  direction: "down",
  outcomeFeatureId: "metric:tpo_antibodies",
  grade: "B",
  ...over,
});

describe("labels", () => {
  it("says which of the three bases a grade is", () => {
    expect(basisOfGrade("A")).toBe("science");
    expect(basisOfGrade("C")).toBe("science");
    expect(basisOfGrade("D")).toBe("anecdotal");
    expect(basisOfGrade("E")).toBe("anecdotal");
  });

  it("prints the grade only when there is one", () => {
    expect(labelOf("science", "A")).toBe("[science, A]");
    expect(labelOf("opinion")).toBe("[opinion]");
    expect(labelOf("anecdotal", "E")).toBe("[anecdotal, E]");
  });
});

describe("pickActions", () => {
  it("puts the person's own plan first and the papers after", () => {
    const rows = pickActions({
      codes: ["tpo_antibodies", "tsh"],
      actions: [action()],
      interventions: [paper({ name: "Myo-inositol", grade: "C" })],
    });
    expect(rows.map((r) => r.source)).toEqual(["plan", "papers"]);
    expect(rows[0]!.title).toBe("Selenium 200 µg/day");
    expect(rows[0]!.index).toBe(0);
    expect(rows[1]!.title).toBe("Myo-inositol");
  });

  it("falls back to the graded interventions when the plan has nothing", () => {
    const rows = pickActions({
      codes: ["tpo_antibodies"],
      actions: [],
      interventions: [paper()],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("papers");
    expect(rows[0]!.interventionId).toBe("int-1");
  });

  it("ignores a plan action that targets another condition's markers", () => {
    const rows = pickActions({
      codes: ["tpo_antibodies"],
      actions: [
        action({
          title: "Walk after dinner",
          targets: [
            {
              code: "hba1c",
              direction: "down" as const,
              expect: "5.4 %",
              measureAfterWeeks: 12,
            },
          ],
        }),
      ],
      interventions: [],
    });
    expect(rows).toEqual([]);
  });

  it("takes every plan action when no condition was named", () => {
    const rows = pickActions({
      codes: [],
      actions: [action({ title: "Walk after dinner", weight: 5 }), action()],
      interventions: [],
      anyAction: true,
    });
    expect(rows.map((r) => r.title)).toEqual([
      "Walk after dinner",
      "Selenium 200 µg/day",
    ]);
  });

  it("orders the papers by grade, best first", () => {
    const rows = pickActions({
      codes: [],
      actions: [],
      interventions: [
        paper({ id: "e", name: "Beef liver", grade: "E" }),
        paper({ id: "a", name: "Levothyroxine", grade: "A" }),
        paper({ id: "c", name: "Myo-inositol", grade: "C" }),
      ],
      limit: 5,
    });
    expect(rows.map((r) => r.grade)).toEqual(["A", "C", "E"]);
    expect(rows.map((r) => r.label)).toEqual([
      "[science, A]",
      "[science, C]",
      "[anecdotal, E]",
    ]);
  });

  it("passes the dose through exactly as its source wrote it", () => {
    const [fromPlan] = pickActions({
      codes: ["tpo_antibodies"],
      actions: [
        action({
          dose: {
            amount: "200 µg",
            form: "selenomethionine",
            schedule: "once daily with breakfast",
            duration: "6 months",
          },
        }),
      ],
      interventions: [],
    });
    expect(fromPlan!.dose).toBe(
      "200 µg · selenomethionine · once daily with breakfast · for 6 months",
    );

    const [fromPapers] = pickActions({
      codes: [],
      actions: [],
      interventions: [paper()],
    });
    expect(fromPapers!.dose).toBe("200 µg/day");
  });

  it("says what each line should move and by when", () => {
    const [fromPlan] = pickActions({
      codes: ["tpo_antibodies"],
      actions: [action()],
      interventions: [],
    });
    expect(fromPlan!.target).toBe(
      "tpo antibodies down → under 300 IU/mL, measure after 12 weeks",
    );

    const [fromPapers] = pickActions({
      codes: [],
      actions: [],
      interventions: [paper()],
    });
    expect(fromPapers!.target).toBe(
      "tpo antibodies down -40 %, remeasure after 6 months",
    );
  });

  it("never prints the same thing twice from both sources", () => {
    const rows = pickActions({
      codes: ["tpo_antibodies"],
      actions: [action({ title: "Selenium" })],
      interventions: [paper({ name: "Selenium" })],
      limit: 5,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("plan");
  });

  it("puts a test action behind the things a person can do today", () => {
    const rows = pickActions({
      codes: ["tpo_antibodies"],
      actions: [
        action({ title: "Repeat TPO in 12 weeks", kind: "test", weight: 5 }),
        action(),
      ],
      interventions: [],
      limit: 5,
    });
    expect(rows.map((r) => r.title)).toEqual([
      "Selenium 200 µg/day",
      "Repeat TPO in 12 weeks",
    ]);
  });

  it("cuts to the limit the cards print", () => {
    const rows = pickActions({
      codes: [],
      actions: [],
      interventions: [
        paper({ id: "1", name: "One" }),
        paper({ id: "2", name: "Two" }),
        paper({ id: "3", name: "Three" }),
        paper({ id: "4", name: "Four" }),
      ],
    });
    expect(rows).toHaveLength(3);
  });

  it("writes one line a prompt and a card can both print", () => {
    const [row] = pickActions({
      codes: [],
      actions: [],
      interventions: [paper()],
    });
    expect(actionLine(row!)).toBe(
      "Selenomethionine · 200 µg/day · [science, B] · tpo antibodies down -40 %, remeasure after 6 months",
    );
  });
});


/* ── what a target reads like (phase 30d, UX note 6) ──────────────────── */

describe("aimOf", () => {
  it("turns a ceiling into 'under', with the marker's real name", () => {
    expect(
      aimOf({
        code: "tpo_antibodies",
        direction: "down" as const,
        expect: "<100 IU/mL",
        measureAfterWeeks: 24,
      }),
    ).toBe("aim: TPO antibodies under 100 IU/mL · retest in 24 weeks");
  });

  it("turns a floor into 'over'", () => {
    expect(
      aimOf({
        code: "ferritin",
        direction: "down" as const,
        expect: "≥ 50 ng/mL",
        measureAfterWeeks: 12,
      }),
    ).toBe("aim: Ferritin over 50 ng/mL · retest in 12 weeks");
  });

  it("turns a bare value into 'to'", () => {
    expect(
      aimOf({
        code: "vitamin_d",
        direction: "down" as const,
        expect: "45 ng/mL",
        measureAfterWeeks: 8,
      }),
    ).toContain("Vitamin D to 45 ng/mL");
  });

  it("prints a non-numeric target whole, with no direction word", () => {
    expect(
      aimOf({
        code: "thyroid_ultrasound",
        direction: "down" as const,
        expect: "no nodules or documented baseline",
        measureAfterWeeks: 4,
      }),
    ).toBe("aim: no nodules or documented baseline · in 4 weeks");
  });

  it("never prints the engine's own arrow grammar", () => {
    const out = aimOf({
      code: "alt",
        direction: "down" as const,
      expect: "<25 U/L",
      measureAfterWeeks: 24,
    });
    expect(out).not.toContain("→");
    expect(out).not.toContain("down");
    expect(out).not.toContain("measure after");
  });

  it("does not print the marker's name twice when `expect` carries it", () => {
    expect(
      aimOf({
        code: "homa_ir",
        direction: "down" as const,
        expect: "HOMA-IR <=1.0",
        measureAfterWeeks: 12,
      }),
    ).toBe("aim: HOMA-IR under 1.0 · retest in 12 weeks");
    expect(
      aimOf({
        code: "fasting_insulin",
        direction: "down" as const,
        expect: "fasting insulin <=5.0 uIU/mL",
        measureAfterWeeks: 12,
      }),
    ).toBe("aim: fasting insulin under 5.0 uIU/mL · retest in 12 weeks");
  });

  it("prints a band as a band", () => {
    expect(
      aimOf({
        code: "vitamin_d",
        direction: "up" as const,
        expect: "45-55 ng/mL",
        measureAfterWeeks: 12,
      }),
    ).toBe("aim: Vitamin D to 45–55 ng/mL · retest in 12 weeks");
  });

  /* Phase 30d follow-up, read off the owner's own Chronic inflammation and
     Iron deficiency cards: "aim: Ferritin to 45 ng/mL by 2026-11-01 · retest
     in 12 weeks" printed a machine's date and then a second, different
     deadline next to it. */
  it("prints a date the target carries in words, not as an ISO string", () => {
    expect(
      aimOf({
        code: "ferritin",
        direction: "up" as const,
        expect: "45 ng/mL by 2026-11-01",
        measureAfterWeeks: 12,
      }),
    ).toBe("aim: Ferritin to 45 ng/mL by Nov 1 2026");
  });

  it("drops the retest tail when the target already names the day", () => {
    const out = aimOf({
      code: "tpo_antibodies",
      direction: "down" as const,
      expect: "<100 IU/mL by 2027-02-16",
      measureAfterWeeks: 24,
    });
    expect(out).toBe("aim: TPO antibodies under 100 IU/mL by Feb 16 2027");
    expect(out).not.toContain("retest in");
    expect(out).not.toContain("2027-02-16");
  });

  it("dates a non-numeric target the same way", () => {
    expect(
      aimOf({
        code: "thyroid_ultrasound",
        direction: "up" as const,
        expect: "no nodules by 2026-11-01",
        measureAfterWeeks: 4,
      }),
    ).toContain("by Nov 1 2026");
  });

  it("keeps the retest tail when there is no date to keep instead", () => {
    expect(
      aimOf({
        code: "ferritin",
        direction: "up" as const,
        expect: "45 ng/mL",
        measureAfterWeeks: 12,
      }),
    ).toBe("aim: Ferritin to 45 ng/mL · retest in 12 weeks");
  });

  it("agrees with its noun for one week", () => {
    expect(
      aimOf({
        code: "alt",
        direction: "down" as const,
        expect: "<25 U/L",
        measureAfterWeeks: 1,
      }),
    ).toContain("retest in 1 week");
  });
});

describe("doseParts", () => {
  it("drops every part the title already says (UX note 5)", () => {
    expect(
      doseParts("Selenium 200 µg/day as selenomethionine for 6 months", [
        "200 µg",
        "capsule",
        "once daily",
        "for 6 months",
      ]),
    ).toBe("capsule · once daily");
  });

  it("prints nothing when the title carries the whole dose", () => {
    expect(doseParts("Selenium 200 µg", ["200 µg"])).toBe(null);
  });
});

describe("saysSomething (UX note 7)", () => {
  const line = (over: Partial<PlanLine>): PlanLine => ({
    id: "int:x",
    title: "Dihydromyricetin",
    source: "papers",
    dose: null,
    basis: "science",
    label: "[science, A]",
    why: "what the papers report for this condition, grade A",
    target: null,
    aim: null,
    ...over,
  });

  it("rejects a name, a glyph and nothing else", () => {
    expect(saysSomething(line({}))).toBe(false);
  });

  it("accepts a row with a dose", () => {
    expect(saysSomething(line({ dose: "300 mg" }))).toBe(true);
  });

  it("accepts a row with a sentence somebody wrote", () => {
    expect(
      saysSomething(line({ why: "It lowers ALT in a small RCT." })),
    ).toBe(true);
  });
});
