import { describe, expect, it } from "vitest";
import type { ModelInput } from "./coverage";
import {
  addDays,
  dueFacts,
  revisitAtFor,
  revisitDaysOf,
  SKIP_DAYS,
  type RevisitRow,
} from "./revisit";

const TODAY = "2026-09-01";

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: TODAY,
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

const row = (over: Partial<RevisitRow> & { key: string }): RevisitRow => ({
  value: "Yes",
  validFrom: "2026-01-01",
  revisitAt: null,
  ...over,
});

describe("the cadence", () => {
  it("never re-asks the facts that cannot change", () => {
    for (const key of ["sex", "birth_year", "ancestry", "country", "height_cm"])
      expect(revisitDaysOf(key)).toBeNull();
  });

  it("uses the table for the ones that can", () => {
    expect(revisitDaysOf("medications")).toBe(90);
    expect(revisitDaysOf("smoking")).toBe(180);
    expect(revisitDaysOf("family_history")).toBe(365);
    expect(revisitDaysOf("coffee_last_hour")).toBe(180);
    expect(revisitDaysOf("sym_energy")).toBe(90);
    expect(revisitDaysOf("sleep_snoring")).toBe(90);
  });

  it("stops asking about menopause once the answer is post", () => {
    expect(revisitDaysOf("menopause_status", "Peri")).toBe(365);
    expect(revisitDaysOf("menopause_status", "Post")).toBeNull();
    expect(revisitAtFor("menopause_status", TODAY, "Post")).toBeNull();
  });

  it("counts from the day the value starts holding, not from today", () => {
    expect(revisitAtFor("medications", "2026-01-01")).toBe("2026-04-01");
    expect(revisitAtFor("sex", "2026-01-01")).toBeNull();
    expect(addDays(TODAY, SKIP_DAYS)).toBe("2026-10-01");
  });

  it("treats the cycle answer as per-draw, not per-clock", () => {
    expect(revisitDaysOf("cycle_phase_at_last_draw")).toBeNull();
  });
});

describe("what is due today", () => {
  it("asks a fact whose revisit day has arrived, and not one a day early", () => {
    const rows = [
      row({ key: "medications", value: "None", revisitAt: TODAY }),
      row({ key: "supplements", value: "None", revisitAt: "2026-09-02" }),
    ];
    const due = dueFacts(input(), rows, {}, TODAY);
    expect(due.map((d) => d.key)).toEqual(["medications"]);
    expect(due[0]!.why).toBe("due");
  });

  it("derives the re-ask from the value, and keeps the original question", () => {
    const due = dueFacts(
      input(),
      [row({ key: "coffee_last_hour", value: "16:00", revisitAt: TODAY })],
      {},
      TODAY,
    );
    expect(due[0]!.question).toBe("Still 16:00?");
    expect(due[0]!.original).toContain("last coffee");
    expect(due[0]!.current).toBe("16:00");
    expect(due[0]!.since).toBe("2026-01-01");
  });

  it("lowercases an option in the re-ask", () => {
    const due = dueFacts(
      input(),
      [row({ key: "sym_energy", value: "Yes", revisitAt: TODAY })],
      {},
      TODAY,
    );
    expect(due[0]!.question).toBe("Still yes?");
    expect(due[0]!.options).toEqual(["No", "Yes"]);
  });

  it("never asks a never-fact on the clock", () => {
    const rows = [row({ key: "sex", value: "female", revisitAt: null })];
    expect(dueFacts(input(), rows, {}, TODAY)).toEqual([]);
  });

  it("asks the cycle answer again when a draw arrived after it", () => {
    const rows = [
      row({
        key: "cycle_phase_at_last_draw",
        value: "Follicular",
        validFrom: "2026-05-01",
      }),
    ];
    expect(
      dueFacts(input(), rows, { newDrawSince: "2026-08-20" }, TODAY)[0]!.why,
    ).toBe("draw");
    // A draw older than the answer says nothing new.
    expect(
      dueFacts(input(), rows, { newDrawSince: "2026-04-01" }, TODAY),
    ).toEqual([]);
  });

  it("asks about coffee when an adopted action names it, and not otherwise", () => {
    const rows = [
      row({ key: "coffee_last_hour", value: "16:00", revisitAt: "2026-08-01" }),
    ];
    expect(
      dueFacts(
        input(),
        rows,
        { adopted: ["Cut coffee after 14:00"] },
        TODAY,
      )[0]!.why,
    ).toBe("action");
    expect(
      dueFacts(input(), rows, { adopted: ["Walk 30 minutes"] }, TODAY)[0]!.why,
    ).toBe("due");
  });

  it("lets a life event ask early, before the clock says so", () => {
    const rows = [
      row({ key: "sym_cycle", value: "Regular", revisitAt: "2027-01-01" }),
    ];
    const her = input({ sex: "female", age: 34 });
    expect(dueFacts(her, rows, {}, TODAY)).toEqual([]);
    const onEvent = dueFacts(her, rows, { eventTags: ["pregnancy"] }, TODAY);
    expect(onEvent[0]!.why).toBe("event");
  });

  it("puts information gain first, then the draw, then the clock", () => {
    const rows = [
      row({ key: "medications", value: "None", revisitAt: "2026-01-02" }),
      row({
        key: "cycle_phase_at_last_draw",
        value: "Luteal",
        validFrom: "2026-02-01",
      }),
      row({ key: "sym_cold", value: "No", revisitAt: "2026-01-03" }),
    ];
    const due = dueFacts(
      input(),
      rows,
      { newDrawSince: "2026-08-30", gainKeys: ["sym_cold"] },
      TODAY,
      3,
    );
    expect(due.map((d) => d.why)).toEqual(["gain", "draw", "due"]);
    expect(due[0]!.key).toBe("sym_cold");
  });

  it("never returns more than the daily cap", () => {
    const rows = ["medications", "supplements", "waist_cm", "resting_hr"].map(
      (key) => row({ key, value: "80", revisitAt: "2026-08-01" }),
    );
    expect(dueFacts(input(), rows, {}, TODAY)).toHaveLength(2);
    expect(dueFacts(input(), rows, {}, TODAY, 1)).toHaveLength(1);
    expect(dueFacts(input(), rows, {}, TODAY, 0)).toHaveLength(0);
  });

  it("does not re-ask a question that no longer applies to this person", () => {
    const rows = [
      row({ key: "sym_cycle", value: "Regular", revisitAt: "2026-01-01" }),
    ];
    expect(
      dueFacts(input({ sex: "female", age: 40 }), rows, {}, TODAY),
    ).toHaveLength(1);
    expect(dueFacts(input({ sex: "male", age: 40 }), rows, {}, TODAY)).toEqual(
      [],
    );
    expect(
      dueFacts(input({ sex: "female", age: 62 }), rows, {}, TODAY),
    ).toEqual([]);
  });

  it("ignores a fact with no value and one the app never asks", () => {
    const rows = [
      row({ key: "medications", value: "", revisitAt: TODAY }),
      row({ key: "not_a_question", value: "x", revisitAt: TODAY }),
    ];
    expect(dueFacts(input(), rows, {}, TODAY)).toEqual([]);
  });
});
