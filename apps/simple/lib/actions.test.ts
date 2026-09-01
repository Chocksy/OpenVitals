import { describe, expect, it } from "vitest";
import type { ReportAction } from "@/db";
import {
  actionLine,
  basisOfGrade,
  labelOf,
  pickActions,
  type InterventionLine,
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
      direction: "down",
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
              direction: "down",
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
