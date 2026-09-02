import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
import { doseLine, saysSomething, type PlanLine } from "@/lib/actions";
import { WhatToDo } from "./what-to-do";

/**
 * Phase 26 items 5 and 6 built the block. Phase 30d fixed what one row
 * prints, from `docs/plans/2026-09-02-phase30d-home-ux-notes.md`: the dose
 * once and never glued onto a title that already says it (note 5), the
 * target as a sentence (note 6), no row that says nothing (note 7), no bare
 * glyph (note 8), and one quiet Add per row with one ink "Add all n" under
 * them and nothing else (note 9).
 */
const line = (over: Partial<PlanLine> = {}): PlanLine => ({
  id: "plan:r1:0",
  title: "Selenium 200 µg/day",
  source: "plan",
  index: 0,
  dose: "200 µg · once daily with breakfast",
  basis: "science",
  grade: "B",
  label: "[science]",
  why: "TPO antibodies fall on selenium.",
  target: "tpo antibodies down → under 100 IU/mL, measure after 24 weeks",
  aim: "aim: TPO antibodies under 100 IU/mL · retest in 24 weeks",
  ...over,
});

const html = (props: Parameters<typeof WhatToDo>[0]) =>
  renderToStaticMarkup(createElement(WhatToDo, props));

const base = {
  conditionId: "hashimoto",
  conditionName: "Hashimoto's",
  reportId: "r1",
};

describe("the dose line", () => {
  it("drops every part the title already says (UX note 5)", () => {
    expect(doseLine(line())).toBe("once daily with breakfast");
  });

  it("keeps a dose the title never mentions", () => {
    expect(doseLine(line({ title: "Thyroid ultrasound" }))).toBe(
      "200 µg · once daily with breakfast",
    );
  });

  it("prints nothing when the title already is the dose", () => {
    expect(doseLine(line({ dose: "200 µg" }))).toBe(null);
    expect(doseLine(line({ dose: null }))).toBe(null);
  });
});

describe("a row that says nothing (UX note 7)", () => {
  const bare = line({
    id: "int:dhm",
    title: "Dihydromyricetin",
    source: "papers",
    interventionId: "dhm",
    dose: null,
    grade: "A",
    why: "what the papers report for this condition, grade A",
    aim: "aim: ALT lower",
  });

  it("is not a line Home may print", () => {
    expect(saysSomething(bare)).toBe(false);
    expect(saysSomething(line())).toBe(true);
  });

  it("is left off the card entirely", () => {
    const out = html({ ...base, lines: [line(), bare] });
    expect(out).not.toContain("Dihydromyricetin");
    expect(out).toContain("Selenium");
  });

  it("says nothing has been written when every row is bare", () => {
    const out = html({ ...base, lines: [bare] });
    expect(out).toContain("Nothing has been written for this one yet");
  });
});

describe("the What to do block", () => {
  const out = html({
    ...base,
    lines: [line(), line({ title: "Thyroid ultrasound", index: 1 })],
  });

  it("prints the title, then the dose once, then the aim", () => {
    expect(out).toContain("Selenium 200 µg/day");
    expect(out).toContain("once daily with breakfast");
    /* the "200 µg" the title already carries is not repeated under it */
    const one = html({ ...base, lines: [line()] });
    expect(one).toContain(">once daily with breakfast<");
    expect(one).not.toContain(">200 µg · once daily with breakfast<");
  });

  it("prints the target as a sentence, never the engine's grammar", () => {
    expect(out).toContain("aim: TPO antibodies under 100 IU/mL");
    expect(out).toContain("retest in 24 weeks");
    expect(out).not.toContain("→");
    expect(out).not.toContain("measure after");
  });

  it("gives every glyph its grade letter (UX note 8)", () => {
    expect(out).toContain("●");
    expect(out).toContain(">B<");
    expect(out).not.toContain("[science]");
  });

  it("has one Add a row and one ink Add all (UX note 9)", () => {
    expect(out.match(/>Add<\/button>/g)).toHaveLength(2);
    expect(out).toContain("Add all 2");
    expect(out).toContain("b-ink");
  });

  it("carries no doctor's note: it moved into the why disclosure", () => {
    expect(out).not.toContain("Doctor");
  });

  it("offers to write actions when the condition has none", () => {
    const empty = html({ ...base, lines: [] });
    expect(empty).toContain("Get actions");
    expect(empty).toContain("Nothing has been written for this one yet");
    expect(empty).not.toContain("Add all 0");
  });

  it("does not offer Add all for a single action", () => {
    const one = html({ ...base, lines: [line()] });
    expect(one).toContain("Add");
    expect(one).not.toContain("Add all 1");
  });
});
