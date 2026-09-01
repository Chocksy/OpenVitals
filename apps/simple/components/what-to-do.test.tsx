import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The block is a client component and calls `useRouter` to re-read the page
// after an add. Rendering it on its own has no app router, so this is the
// smallest possible stand-in: the test is about what the block prints.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
import type { PlanLine } from "@/lib/actions";
import { WhatToDo } from "./what-to-do";

/**
 * Phase 26 items 5 and 6. "Add to protocol" on a condition card did nothing a
 * person could see, because a condition card had no plan action behind it, and
 * the card's only advice was the catalog's shorthand.
 */
const line = (over: Partial<PlanLine> = {}): PlanLine => ({
  id: "plan:r1:0",
  title: "Selenium 200 µg/day",
  source: "plan",
  index: 0,
  dose: "200 µg · once daily with breakfast",
  basis: "science",
  label: "[science]",
  why: "TPO antibodies fall on selenium.",
  target: "tpo antibodies down → under 100 IU/mL, measure after 24 weeks",
  ...over,
});

const html = (props: Parameters<typeof WhatToDo>[0]) =>
  renderToStaticMarkup(createElement(WhatToDo, props));

const base = {
  conditionId: "hashimoto",
  conditionName: "Hashimoto's",
  reportId: "r1",
  management: "Track TSH every 6 months.",
};

describe("the What to do block", () => {
  const out = html({
    ...base,
    lines: [line(), line({ title: "Thyroid ultrasound", index: 1 })],
  });

  it("prints every action with its dose, its label and what it should move", () => {
    expect(out).toContain("Selenium 200 µg/day");
    expect(out).toContain("200 µg · once daily with breakfast");
    expect(out).toContain("[science]");
    expect(out).toContain("measure after 24 weeks");
  });

  it("says what adding will do, with the count", () => {
    expect(out).toContain("Add 2 to your protocol");
  });

  it("keeps the catalog's advice as the quieter doctor's note", () => {
    expect(out).toContain("Doctor");
    expect(out).toContain("Track TSH every 6 months.");
  });

  it("offers to write actions when the condition has none", () => {
    const empty = html({ ...base, lines: [] });
    expect(empty).toContain("Get actions");
    expect(empty).toContain("Nothing has been written for this one yet");
    expect(empty).not.toContain("Add 0");
  });

  it("does not offer Add all for a single action", () => {
    const one = html({ ...base, lines: [line()] });
    expect(one).toContain("Add");
    expect(one).not.toContain("Add 1 to your protocol");
  });
});
