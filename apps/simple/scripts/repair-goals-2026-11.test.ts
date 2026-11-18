import { describe, expect, it } from "vitest";
import { closedOnOldNews, noteRepair } from "./repair-goals-2026-11";

describe("noteRepair", () => {
  it("aims a '<a> to about <b>' goal at <b>", () => {
    expect(
      noteRepair(
        "Psyllium husk 5 g with lunch and dinner: 131 to about 118 mg/dL",
      ),
    ).toEqual({ targetLow: null, targetHigh: 118, due: null });
    expect(
      noteRepair("Vitamin D3: 22 to about 35 ng/mL by 2027-01-10"),
    ).toEqual({
      targetLow: 35,
      targetHigh: null,
      due: "2027-01-10",
    });
  });

  it("leaves every other note alone", () => {
    expect(noteRepair("retest HbA1c after 12 weeks")).toBeNull();
    expect(noteRepair(null)).toBeNull();
  });
});

describe("closedOnOldNews", () => {
  const goal = {
    createdAt: new Date("2026-10-05T12:00:00Z"),
    achievedAt: new Date("2026-10-06T03:00:00Z"),
  };
  it("reopens the psyllium goal closed the night after on the April draw", () => {
    const april = new Date("2026-04-24T08:00:00Z");
    const november = new Date("2026-11-17T18:00:00Z");
    expect(closedOnOldNews(goal, [april, november])).toBe(true);
  });
  it("keeps a goal closed by a reading stored in its lifetime", () => {
    expect(closedOnOldNews(goal, [new Date("2026-10-05T20:00:00Z")])).toBe(
      false,
    );
    expect(closedOnOldNews({ ...goal, achievedAt: null }, [])).toBe(false);
  });
});
