import { describe, it, expect } from "vitest";
import {
  dayBefore,
  eventConfounders,
  historyLine,
  planEdit,
  tagsOfEvent,
  valueAt,
  type Edit,
  type HistoryRow,
} from "./facts";

const TODAY = "2026-08-29";

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: "h1",
  validFrom: "2026-01-01",
  validTo: null,
  changeKind: "initial",
  value: "yes",
  ...over,
});

/** The whole sequence an edit writes, applied to a list, so a run of edits reads. */
function apply(rows: HistoryRow[], edit: Edit & { value: unknown }) {
  const open = rows
    .filter((r) => r.changeKind !== "corrected" && r.validTo == null)
    .at(-1);
  const plan = planEdit(open ?? null, edit, TODAY);
  const next = rows.map((r) =>
    plan.close && r.id === plan.close.id
      ? {
          ...r,
          ...(plan.close.validTo !== undefined
            ? { validTo: plan.close.validTo }
            : {}),
          ...(plan.close.changeKind
            ? { changeKind: plan.close.changeKind }
            : {}),
        }
      : r,
  );
  return [
    ...next,
    {
      id: `h${rows.length + 1}`,
      validFrom: plan.open.validFrom,
      validTo: plan.open.validTo,
      changeKind: plan.open.changeKind,
      value: edit.value,
    } as HistoryRow & { value: unknown },
  ];
}

describe("dayBefore", () => {
  it("steps back one day across a month and a year", () => {
    expect(dayBefore("2026-09-01")).toBe("2026-08-31");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
  });
});

describe("planEdit", () => {
  it("calls the first value initial, whichever button was pressed", () => {
    const plan = planEdit(null, { kind: "changed", date: "2026-05-01" }, TODAY);
    expect(plan.close).toBeNull();
    expect(plan.open).toMatchObject({
      validFrom: "2026-05-01",
      validTo: null,
      changeKind: "initial",
    });
    expect(planEdit(null, { kind: "corrected" }, TODAY).open.changeKind).toBe(
      "initial",
    );
  });

  it("changed closes the old period the day before the new one opens", () => {
    const plan = planEdit(
      row(),
      { kind: "changed", date: "2026-06-15" },
      TODAY,
    );
    expect(plan.close).toEqual({ id: "h1", validTo: "2026-06-14" });
    expect(plan.open).toMatchObject({
      validFrom: "2026-06-15",
      validTo: null,
      changeKind: "changed",
    });
  });

  it("changed defaults to today", () => {
    expect(planEdit(row(), { kind: "changed" }, TODAY).open.validFrom).toBe(
      TODAY,
    );
  });

  it("crosses out a row the change date leaves no day for", () => {
    const plan = planEdit(
      row({ validFrom: "2026-08-30" }),
      { kind: "changed", date: "2026-06-15" },
      TODAY,
    );
    expect(plan.close).toMatchObject({ id: "h1", changeKind: "corrected" });
    expect(plan.close).not.toHaveProperty("validTo");
    expect(plan.open).toMatchObject({
      validFrom: "2026-06-15",
      validTo: null,
      changeKind: "changed",
    });
  });

  it("corrected crosses the old row out and takes over its whole period", () => {
    const plan = planEdit(
      row({ validFrom: "2026-01-01", validTo: "2026-06-14" }),
      { kind: "corrected", note: "I misread the letter" },
      TODAY,
    );
    expect(plan.close).toEqual({
      id: "h1",
      changeKind: "corrected",
      note: "I misread the letter",
    });
    expect(plan.open).toMatchObject({
      validFrom: "2026-01-01",
      validTo: "2026-06-14",
      changeKind: "initial",
      note: "I misread the letter",
    });
  });
});

describe("a run of edits", () => {
  it("changed then changed leaves three periods that do not overlap", () => {
    let rows = apply([], { kind: "changed", date: "2026-01-01", value: "no" });
    rows = apply(rows, { kind: "changed", date: "2026-03-01", value: "yes" });
    rows = apply(rows, { kind: "changed", date: "2026-07-01", value: "no" });
    expect(
      rows.map((r) => [r.validFrom, r.validTo, r.changeKind, r.value]),
    ).toEqual([
      ["2026-01-01", "2026-02-28", "initial", "no"],
      ["2026-03-01", "2026-06-30", "changed", "yes"],
      ["2026-07-01", null, "changed", "no"],
    ]);
  });

  it("corrected replaces the value for the period that never held", () => {
    let rows = apply([], { kind: "changed", date: "2026-01-01", value: "no" });
    rows = apply(rows, { kind: "changed", date: "2026-03-01", value: "yes" });
    rows = apply(rows, { kind: "corrected", value: "maybe", note: "wrong" });
    expect(rows.map((r) => [r.validFrom, r.changeKind, r.value])).toEqual([
      ["2026-01-01", "initial", "no"],
      ["2026-03-01", "corrected", "yes"],
      ["2026-03-01", "changed", "maybe"],
    ]);
    // the value that never held is gone from every reading of the timeline
    expect(valueAt(rows, "2026-05-01")?.value).toBe("maybe");
    expect(valueAt(rows, "2026-02-01")?.value).toBe("no");
  });
});

describe("valueAt", () => {
  const rows: HistoryRow[] = [
    row({
      id: "a",
      validFrom: "2026-01-01",
      validTo: "2026-02-28",
      value: "no",
    }),
    row({
      id: "b",
      validFrom: "2026-03-01",
      validTo: null,
      changeKind: "changed",
      value: "yes",
    }),
  ];

  it("reads the value that held on a day, at both edges", () => {
    expect(valueAt(rows, "2026-01-01")?.value).toBe("no");
    expect(valueAt(rows, "2026-02-28")?.value).toBe("no");
    expect(valueAt(rows, "2026-03-01")?.value).toBe("yes");
    expect(valueAt(rows, "2030-01-01")?.value).toBe("yes");
  });

  it("says nothing about a day before the fact existed", () => {
    expect(valueAt(rows, "2025-12-31")).toBeNull();
  });

  it("never reads a value that was corrected away", () => {
    expect(
      valueAt([row({ changeKind: "corrected", value: "wrong" })], "2026-06-01"),
    ).toBeNull();
  });
});

describe("historyLine", () => {
  it("says since when, and what it was before", () => {
    expect(
      historyLine([
        row({
          id: "a",
          validFrom: "2026-01-01",
          validTo: "2026-02-28",
          value: "yes",
        }),
        row({
          id: "b",
          validFrom: "2026-03-01",
          changeKind: "changed",
          value: "no",
        }),
      ]),
    ).toBe("since 2026-03: no; before: yes");
  });

  it("says nothing about a fact that never moved", () => {
    expect(historyLine([row()])).toBeNull();
    expect(historyLine([])).toBeNull();
  });
});

describe("life events as draw context", () => {
  const event = (
    text: string,
    startedAt: string,
    endedAt: string | null = null,
  ) => ({
    kind: "document",
    text,
    startedAt,
    endedAt,
  });

  it("reads the tag out of the event's own words", () => {
    expect(tagsOfEvent(event("Influenza A, bed rest", "2026-02-01"))).toEqual([
      "acute_illness",
    ]);
    expect(tagsOfEvent(event("Appendectomy", "2026-02-01"))).toEqual([
      "post_viral",
    ]);
    expect(tagsOfEvent(event("Ran the Berlin marathon", "2026-02-01"))).toEqual(
      ["heavy_training"],
    );
    expect(tagsOfEvent(event("Pregnancy, second child", "2026-02-01"))).toEqual(
      ["pregnancy"],
    );
    expect(tagsOfEvent(event("Moved house", "2026-02-01"))).toEqual([]);
  });

  it("tags only the markers drawn while the event was going on", () => {
    const events = [event("Severe influenza", "2026-02-01", "2026-02-20")];
    expect(
      eventConfounders(events, {
        ferritin: "2026-02-10",
        ldl_cholesterol: "2026-02-10",
        hs_crp: "2026-06-01",
      }),
    ).toEqual({ ferritin: ["acute_illness"] });
  });

  it("keeps an open-ended event running", () => {
    expect(
      eventConfounders([event("Pregnancy", "2026-01-01")], {
        ferritin: "2026-08-01",
      }),
    ).toEqual({ ferritin: ["pregnancy"] });
  });

  it("says nothing about a draw with no event around it", () => {
    expect(
      eventConfounders([event("Influenza", "2026-02-01", "2026-02-20")], {
        ferritin: "2026-05-05",
      }),
    ).toEqual({});
  });
});
