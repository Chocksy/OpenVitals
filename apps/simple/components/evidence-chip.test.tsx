import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
import { evidenceTip, showsGrade, splitLabels } from "@/lib/evidence";
import { ActOnIt } from "./act-on-it";
import { AskAnswer } from "./ask-answer";
import { EvidenceChip, LabelledProse } from "./evidence-chip";
import { WhatToDo } from "./what-to-do";

/**
 * Phase 28a, item 2. `[opinion]` and `[science, A]` were printed after every
 * action on every surface, so a plan of five actions printed the word
 * "science" five times. The label still travels through the code, because the
 * eval reads the brackets to check the answer only claimed what it was given;
 * nothing rendered is allowed to show one.
 */
const BRACKETS = [/\[science/, /\[opinion\]/, /\[anecdotal\]/];

const clean = (out: string) => {
  for (const re of BRACKETS) expect(out).not.toMatch(re);
};

describe("splitLabels", () => {
  it("cuts the prose around every bracket label", () => {
    expect(splitLabels("Take selenium [science, A] daily.")).toEqual([
      "Take selenium ",
      { basis: "science", grade: "A" },
      " daily.",
    ]);
  });

  it("reads a label with no grade", () => {
    expect(splitLabels("Sleep earlier [opinion].")).toEqual([
      "Sleep earlier ",
      { basis: "opinion" },
      ".",
    ]);
  });

  it("leaves prose with no label alone", () => {
    expect(splitLabels("Nothing to swap here.")).toEqual([
      "Nothing to swap here.",
    ]);
  });

  it("handles two in one sentence, in order", () => {
    const out = splitLabels("A [science, B] and B [anecdotal] too");
    expect(out.filter((p) => typeof p !== "string")).toEqual([
      { basis: "science", grade: "B" },
      { basis: "anecdotal" },
    ]);
  });
});

describe("the tooltip spells the glyph out", () => {
  it("names the basis and the grade", () => {
    expect(evidenceTip("science", "A")).toBe(
      "Science, grade A: meta-analysis or guideline.",
    );
    expect(evidenceTip("opinion")).toBe(
      "Opinion: a clinician's judgement, not a study.",
    );
  });

  it("prints the grade letter for science only", () => {
    expect(showsGrade("science", "C")).toBe(true);
    expect(showsGrade("anecdotal", "D")).toBe(false);
    expect(showsGrade("science", null)).toBe(false);
  });
});

describe("the chip", () => {
  it("carries the glyph, the letter and the sentence", () => {
    const out = renderToStaticMarkup(
      createElement(EvidenceChip, { basis: "science", grade: "A" }),
    );
    expect(out).toContain("●");
    expect(out).toContain("A");
    expect(out).toContain("Science, grade A");
  });

  it("swaps every label out of the model's own paragraph", () => {
    const out = renderToStaticMarkup(
      createElement(LabelledProse, {
        text: "Selenium 200 µg/day [science, B] and earlier nights [opinion].",
      }),
    );
    expect(out).toContain("●");
    expect(out).toContain("◐");
    clean(out);
  });
});

describe("no surface prints a bracket label", () => {
  it("not the What to do block on a condition card", () => {
    clean(
      renderToStaticMarkup(
        createElement(WhatToDo, {
          conditionId: "hashimoto",
          conditionName: "Hashimoto's",
          reportId: "r1",
          lines: [
            {
              id: "plan:r1:0",
              title: "Selenium 200 µg/day",
              source: "plan" as const,
              index: 0,
              dose: "200 µg",
              basis: "science",
              label: "[science, B]",
              grade: "B",
              why: "TPO antibodies fall on selenium.",
              target: null,
            },
          ],
        }),
      ),
    );
  });

  it("not the Act on it row under an answer", () => {
    clean(
      renderToStaticMarkup(
        createElement(ActOnIt, {
          acts: {
            actions: [
              {
                id: "int:iron",
                title: "Iron bisglycinate",
                dose: "60 mg",
                label: "[science, C]",
                basis: "science",
                grade: "C",
                target: null,
              },
            ],
            tests: [],
            questions: [],
          },
        }),
      ),
    );
  });

  it("not the answer's own paragraph", () => {
    clean(
      renderToStaticMarkup(
        createElement(AskAnswer, {
          answer: {
            route: "question" as const,
            matches: [],
            term: null,
            condition: null,
            woken: null,
            probability: null,
            state: null,
            moves: [],
            finding: null,
            canConsider: false,
            reply: "Take selenium 200 µg/day [science, B]. Sleep more [opinion].",
          },
        }),
      ),
    );
  });
});
