import { describe, expect, it } from "vitest";
import {
  captureSchema,
  cleanCaptureChips,
  clockOf,
  mealTotals,
  routeOf,
  toChips,
  type CaptureExtract,
} from "./capture";
import type { Chip } from "./compose";

const TODAY = "2026-08-31";

const meal = (over: Partial<CaptureExtract> = {}): CaptureExtract => ({
  kind: "meal",
  basis: "grilled salmon, white rice, green beans",
  confidence: 0.7,
  items: [
    {
      name: "grilled salmon",
      portion: "150 g",
      kcal: 310,
      proteinG: 34,
      carbsG: 0,
      fatG: 19,
      confidence: 0.7,
    },
    {
      name: "white rice",
      portion: "200 g cooked",
      kcal: 260,
      proteinG: 5,
      carbsG: 57,
      fatG: 1,
      confidence: 0.6,
    },
    {
      name: "green beans",
      portion: "100 g",
      kcal: 35,
      proteinG: 2,
      carbsG: 7,
      fatG: 0,
      confidence: 0.8,
    },
  ],
  ...over,
});

const label = (over: Partial<CaptureExtract> = {}): CaptureExtract => ({
  kind: "supplement_label",
  basis: "Vitamin D3 4000 IU, 120 softgels",
  confidence: 0.9,
  items: [],
  product: { name: "Vitamin D3", dose: "4000 IU", confidence: 0.9 },
  ...over,
});

describe("the schema stays closed", () => {
  it("refuses a kind nobody defined", () => {
    expect(
      captureSchema.safeParse({ ...meal(), kind: "dinner_party" }).success,
    ).toBe(false);
  });
});

describe("the server does the arithmetic", () => {
  it("totals the plate the model never totalled", () => {
    const totals = mealTotals(meal())!;
    expect(totals.kcal).toBe(605);
    expect(totals.proteinG).toBe(41);
    expect(totals.carbsG).toBe(64);
    expect(totals.fatG).toBe(20);
    // A total is only as good as the item the model was least sure of.
    expect(totals.confidence).toBe(0.6);
    expect(totals.label).toBe("grilled salmon, white rice, green beans");
  });

  it("throws away an implausible total instead of storing it", () => {
    const totals = mealTotals(
      meal({
        items: [
          {
            name: "typo",
            portion: "1",
            kcal: 90000,
            proteinG: 20,
            carbsG: 10,
            fatG: 5,
            confidence: 0.5,
          },
        ],
      }),
    )!;
    expect(totals.kcal).toBe(null);
    expect(totals.proteinG).toBe(20);
  });

  it("has nothing to say about an empty plate", () => {
    expect(mealTotals(meal({ items: [] }))).toBe(null);
  });
});

describe("the chips a photo comes back as", () => {
  it("splits a meal into four nutrition chips, all labelled estimate", () => {
    const chips = toChips(meal(), { today: TODAY });
    expect(chips.map((c) => c.key)).toEqual([
      "kcal",
      "proteinG",
      "carbsG",
      "fatG",
    ]);
    expect(chips.every((c) => c.kind === "nutrition")).toBe(true);
    expect(chips[0]!.label).toBe("605 kcal · estimate");
    // The quote is what the model says it saw, so a chip is never unattributable.
    expect(chips[0]!.quote).toBe("grilled salmon, white rice, green beans");
    expect(chips.some((c) => c.kind === "reading")).toBe(false);
  });

  it("offers the timing fact when the photo says when it was taken", () => {
    const chips = toChips(meal(), {
      today: TODAY,
      takenAt: "2026-08-31T21:40:00+03:00",
    });
    const fact = chips.find((c) => c.key === "last_meal_hour")!;
    expect(fact.kind).toBe("fact");
    expect(fact.value).toBe("21:40");
  });

  it("prefers a clock the model read in the photo itself", () => {
    expect(clockOf(meal({ clockTime: "20:15" }), "2026-08-31T21:40:00Z")).toBe(
      "20:15",
    );
    expect(clockOf(meal(), null)).toBe(null);
  });

  it("dates a meal to the day the photo was taken, never to the future", () => {
    expect(
      toChips(meal(), {
        today: TODAY,
        takenAt: "2026-08-29T20:00:00+03:00",
      })[0]!.date,
    ).toBe("2026-08-29");
    expect(
      toChips(meal(), {
        today: TODAY,
        takenAt: "2027-01-01T20:00:00+03:00",
      })[0]!.date,
    ).toBe(TODAY);
  });

  it("turns a supplement label into one list-fact chip", () => {
    const chips = toChips(label(), { today: TODAY });
    expect(chips).toHaveLength(1);
    expect(chips[0]!.key).toBe("supplements");
    expect(chips[0]!.value).toBe("Vitamin D3 4000 IU");
    expect(chips[0]!.kind).toBe("fact");
  });

  it("turns a medication label into the medications fact", () => {
    const chips = toChips(
      label({
        kind: "medication_label",
        product: { name: "Euthyrox", dose: "75 mcg", confidence: 0.8 },
      }),
      { today: TODAY },
    );
    expect(chips[0]!.key).toBe("medications");
    expect(chips[0]!.value).toBe("Euthyrox 75 mcg");
  });

  it("writes no chip at all for a lab sheet or a letter", () => {
    expect(
      toChips(meal({ kind: "lab_sheet", items: [] }), { today: TODAY }),
    ).toEqual([]);
    expect(routeOf("lab_sheet")).toBe("lab");
    expect(routeOf("other_medical")).toBe("document");
    expect(routeOf("meal")).toBe(null);
  });
});

describe("what comes back from the browser is checked again", () => {
  const chip = (over: Partial<Chip>): Chip => ({
    kind: "nutrition",
    key: "kcal",
    label: "605 kcal · estimate",
    value: 605,
    date: TODAY,
    quote: "a plate",
    confidence: 0.6,
    by: "model",
    ...over,
  });

  it("keeps an edited number and drops an impossible one", () => {
    expect(cleanCaptureChips([chip({ value: 720 })], TODAY)[0]!.value).toBe(
      720,
    );
    expect(cleanCaptureChips([chip({ value: 99999 })], TODAY)).toEqual([]);
    expect(cleanCaptureChips([chip({ value: "not a number" })], TODAY)).toEqual(
      [],
    );
  });

  it("drops a key nobody offered and a date in the future", () => {
    expect(cleanCaptureChips([chip({ key: "vitamin_d" })], TODAY)).toEqual([]);
    expect(
      cleanCaptureChips([chip({ date: "2099-01-01" })], TODAY)[0]!.date,
    ).toBe(TODAY);
  });

  it("only lets the three fact keys this route owns through", () => {
    expect(
      cleanCaptureChips(
        [chip({ kind: "fact", key: "supplements", value: "Vitamin D3" })],
        TODAY,
      ),
    ).toHaveLength(1);
    expect(
      cleanCaptureChips(
        [chip({ kind: "fact", key: "sex", value: "male" })],
        TODAY,
      ),
    ).toEqual([]);
    expect(
      cleanCaptureChips(
        [chip({ kind: "reading", key: "glucose", value: 98 })],
        TODAY,
      ),
    ).toEqual([]);
  });
});
