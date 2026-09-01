import { describe, expect, it } from "vitest";
import {
  aggregate,
  cycleFacts,
  dayOf,
  exerciseDaysWeek,
  hourOf,
  HK_METRICS,
  HK_TYPES,
  mappingFor,
  mergeDaily,
  mergeNutrition,
  seenNotUsed,
  shortType,
  toStored,
  workoutsFrom,
  workoutTicks,
  type Sample,
} from "./healthkit";

const sample = (
  over: Partial<Sample> & Pick<Sample, "type" | "value">,
): Sample => ({
  start: "2026-08-30T09:00:00+03:00",
  unit: null,
  ...over,
});

const at = (day: string, time: string) => `${day}T${time}:00+03:00`;

/** "07:00" to "08:05" is 65, the number the phone puts in a workout's value. */
const minutes = (from: string, to: string) => {
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number) as [number, number];
    return h * 60 + m;
  };
  return mins(to) - mins(from);
};

describe("the type names", () => {
  it("takes the identifier with or without its prefix", () => {
    expect(shortType("HKQuantityTypeIdentifierStepCount")).toBe("StepCount");
    expect(shortType("stepCount")).toBe("StepCount");
    expect(mappingFor("HKCategoryTypeIdentifierSleepAnalysis")?.key).toBe(
      "sleep_duration",
    );
    expect(mappingFor("HKQuantityTypeIdentifierDietaryFiber")).toBe(null);
  });

  it("lists what it cannot use rather than dropping it silently", () => {
    expect(
      seenNotUsed([
        sample({ type: "StepCount", value: 10 }),
        sample({ type: "HKQuantityTypeIdentifierDietaryWater", value: 500 }),
        sample({ type: "HKQuantityTypeIdentifierDietaryFiber", value: 30 }),
      ]),
    ).toEqual(["DietaryFiber", "DietaryWater"]);
  });

  it("does not call a workout unused: it is a list, not a table row", () => {
    expect(
      seenNotUsed([
        sample({ type: "HKWorkout", unit: "running", value: 30 }),
        sample({ type: "HKWorkoutEnergy", unit: "kcal", value: 300 }),
      ]),
    ).toEqual([]);
  });

  it("gives every reading type a metric the catalog can hold", () => {
    const minted = new Set(HK_METRICS.map((m) => m.code));
    const catalog = new Set([
      "resting_heart_rate",
      "respiratory_rate",
      "spo2",
      "sleep_duration",
      "weight",
      "bp_systolic",
      "bp_diastolic",
      "glucose",
      ...minted,
    ]);
    for (const m of HK_TYPES.filter((x) => x.lands === "reading"))
      expect(catalog.has(m.key), `${m.type} -> ${m.key}`).toBe(true);
  });
});

describe("units, in the catalog's own", () => {
  const m = (type: string) => mappingFor(type)!;

  it("converts kilograms to the pounds weight is stored in", () => {
    expect(toStored(82, "kg", m("BodyMass"))).toBeCloseTo(180.779, 2);
    expect(toStored(180.8, "lb", m("BodyMass"))).toBeCloseTo(180.8, 2);
  });

  it("reads a percent sent as a fraction", () => {
    expect(toStored(0.97, "%", m("OxygenSaturation"))).toBe(97);
    expect(toStored(97, "%", m("OxygenSaturation"))).toBe(97);
    expect(toStored(0.184, "%", m("BodyFatPercentage"))).toBeCloseTo(18.4, 3);
  });

  it("converts mmol/L glucose the way the lab path does", () => {
    expect(toStored(5.5, "mmol/L", m("BloodGlucose"))).toBeCloseTo(99, 0);
  });

  it("takes a waist in metres, centimetres or inches", () => {
    expect(toStored(0.94, "m", m("WaistCircumference"))).toBe(94);
    expect(toStored(94, "cm", m("WaistCircumference"))).toBe(94);
    expect(toStored(37, "in", m("WaistCircumference"))).toBeCloseTo(93.98, 2);
  });

  it("refuses a value outside the plausible range", () => {
    expect(toStored(9000, "count/min", m("RestingHeartRate"))).toBe(null);
    expect(toStored(0, "count/min", m("RestingHeartRate"))).toBe(null);
  });

  it("refuses a unit it cannot convert rather than guessing", () => {
    expect(toStored(5, "furlongs", m("WaistCircumference"))).toBe(null);
  });
});

describe("the day a sample belongs to", () => {
  it("is the date the phone wrote, offset and all", () => {
    expect(dayOf("2026-08-30T23:10:00+03:00")).toBe("2026-08-30");
    expect(dayOf("nonsense")).toBe(null);
    expect(hourOf("2026-08-30T21:40:00+03:00")).toBeCloseTo(21.667, 2);
  });
});

describe("one day of samples", () => {
  it("sums steps and takes the median resting heart rate", () => {
    const agg = aggregate([
      sample({
        type: "StepCount",
        value: 4000,
        unit: "count",
        start: at("2026-08-30", "09:00"),
      }),
      sample({
        type: "StepCount",
        value: 3120,
        unit: "count",
        start: at("2026-08-30", "18:00"),
      }),
      sample({
        type: "RestingHeartRate",
        value: 54,
        unit: "count/min",
        start: at("2026-08-30", "07:00"),
      }),
      sample({
        type: "RestingHeartRate",
        value: 58,
        unit: "count/min",
        start: at("2026-08-30", "08:00"),
      }),
      sample({
        type: "RestingHeartRate",
        value: 62,
        unit: "count/min",
        start: at("2026-08-30", "09:00"),
      }),
    ]);
    expect(agg.daily).toEqual([
      { day: "2026-08-30", field: "steps", value: 7120 },
    ]);
    expect(agg.readings).toEqual([
      {
        day: "2026-08-30",
        code: "resting_heart_rate",
        value: 58,
        unit: "bpm",
        samples: 3,
      },
    ]);
  });

  it("does not care what order the phone sent them in", () => {
    const xs = [
      sample({
        type: "BodyMass",
        value: 82,
        unit: "kg",
        start: at("2026-08-30", "07:00"),
      }),
      sample({
        type: "BodyMass",
        value: 81.4,
        unit: "kg",
        start: at("2026-08-30", "21:00"),
      }),
    ];
    const forwards = aggregate(xs);
    const backwards = aggregate([...xs].reverse());
    expect(forwards).toEqual(backwards);
    // `last` is the newest sample of the day, not the last one in the array.
    expect(forwards.readings[0]!.value).toBeCloseTo(179.456, 2);
  });

  it("counts a night on the morning it ended and only the asleep stages", () => {
    const agg = aggregate([
      {
        type: "SleepAnalysis",
        unit: "asleepCore",
        value: 1,
        start: "2026-08-29T23:30:00+03:00",
        end: "2026-08-30T03:00:00+03:00",
      },
      {
        type: "SleepAnalysis",
        unit: "asleepDeep",
        value: 1,
        start: "2026-08-30T03:00:00+03:00",
        end: "2026-08-30T04:30:00+03:00",
      },
      {
        type: "SleepAnalysis",
        unit: "asleepREM",
        value: 1,
        start: "2026-08-30T04:30:00+03:00",
        end: "2026-08-30T06:30:00+03:00",
      },
      {
        type: "SleepAnalysis",
        unit: "awake",
        value: 1,
        start: "2026-08-30T06:30:00+03:00",
        end: "2026-08-30T06:50:00+03:00",
      },
    ]);
    expect(agg.readings).toEqual([
      {
        day: "2026-08-30",
        code: "sleep_duration",
        value: 420,
        unit: "min",
        samples: 3,
      },
    ]);
    expect(agg.stages).toEqual([
      {
        day: "2026-08-30",
        stages: { core: 210, deep: 90, rem: 120, awake: 20 },
      },
    ]);
  });

  it("drops a device artefact and says how many", () => {
    const agg = aggregate([
      sample({ type: "RestingHeartRate", value: 300, unit: "count/min" }),
      sample({ type: "RestingHeartRate", value: 55, unit: "count/min" }),
    ]);
    expect(agg.dropped).toBe(1);
    expect(agg.readings[0]!.value).toBe(55);
  });

  it("keeps every CGM reading of a day as one median glucose", () => {
    const agg = aggregate(
      [88, 96, 101, 140, 92].map((v, i) =>
        sample({
          type: "BloodGlucose",
          value: v,
          unit: "mg/dL",
          start: at("2026-08-30", `1${i}:00`),
        }),
      ),
    );
    expect(agg.readings).toEqual([
      {
        day: "2026-08-30",
        code: "glucose",
        value: 96,
        unit: "mg/dL",
        samples: 5,
      },
    ]);
  });

  it("sends the food another app logged to nutrition, not to a reading", () => {
    const agg = aggregate([
      sample({ type: "DietaryEnergyConsumed", value: 800, unit: "kcal" }),
      sample({ type: "DietaryEnergyConsumed", value: 1100, unit: "kcal" }),
      sample({ type: "DietaryProtein", value: 120, unit: "g" }),
    ]);
    expect(agg.daily).toEqual([
      { day: "2026-08-30", field: "kcal", value: 1900 },
      { day: "2026-08-30", field: "proteinG", value: 120 },
    ]);
    expect(agg.readings).toEqual([]);
  });
});

describe("workouts", () => {
  const workout = (
    activity: string,
    day: string,
    from: string,
    to: string,
  ): Sample => ({
    type: "HKWorkout",
    unit: activity,
    value: minutes(from, to),
    start: at(day, from),
    end: at(day, to),
  });
  const energy = (
    kcal: number,
    day: string,
    from: string,
    to: string,
  ): Sample => ({
    type: "HKWorkoutEnergy",
    unit: "kcal",
    value: kcal,
    start: at(day, from),
    end: at(day, to),
  });

  it("keeps the name, the minutes and the paired energy", () => {
    expect(
      workoutsFrom([
        workout("strengthTraining", "2026-08-30", "07:00", "08:05"),
        energy(430, "2026-08-30", "07:00", "08:05"),
        workout("running", "2026-08-30", "18:00", "18:42"),
        energy(390, "2026-08-30", "18:00", "18:42"),
      ]),
    ).toEqual([
      {
        day: "2026-08-30",
        workouts: [
          { type: "strengthTraining", min: 65, kcal: 430 },
          { type: "running", min: 42, kcal: 390 },
        ],
      },
    ]);
  });

  it("counts a session the watch and the phone both saw once", () => {
    const day = workoutsFrom([
      workout("running", "2026-08-30", "18:00", "18:40"),
      workout("running", "2026-08-30", "18:01", "18:42"),
    ])[0]!;
    expect(day.workouts).toEqual([{ type: "running", min: 41 }]);
  });

  it("keeps two sessions of the same kind that do not overlap apart", () => {
    const day = workoutsFrom([
      workout("walking", "2026-08-30", "09:00", "09:30"),
      workout("walking", "2026-08-30", "19:00", "19:25"),
    ])[0]!;
    expect(day.workouts.map((w) => w.min)).toEqual([30, 25]);
  });

  it("leaves the energy off a workout that has none", () => {
    const day = workoutsFrom([
      workout("yoga", "2026-08-30", "07:00", "07:30"),
    ])[0]!;
    expect(day.workouts[0]).toEqual({ type: "yoga", min: 30 });
  });

  it("rides the same batch as everything else", () => {
    const agg = aggregate([
      workout("cycling", "2026-08-30", "17:00", "18:00"),
      sample({
        type: "StepCount",
        value: 4000,
        unit: "count",
        start: at("2026-08-30", "09:00"),
      }),
    ]);
    expect(agg.workouts).toEqual([
      { day: "2026-08-30", workouts: [{ type: "cycling", min: 60 }] },
    ]);
    expect(agg.days).toEqual(["2026-08-30"]);
  });

  it("puts a day with only a workout on it into the day list", () => {
    expect(
      aggregate([workout("swimming", "2026-08-31", "07:00", "07:45")]).days,
    ).toEqual(["2026-08-31"]);
  });

  it("sums distance and flights into the day", () => {
    const agg = aggregate([
      sample({ type: "DistanceWalkingRunning", value: 3.2, unit: "km" }),
      sample({ type: "DistanceWalkingRunning", value: 1.8, unit: "km" }),
      sample({ type: "FlightsClimbed", value: 7, unit: "count" }),
      sample({ type: "FlightsClimbed", value: 5, unit: "count" }),
    ]);
    expect(agg.daily).toEqual([
      { day: "2026-08-30", field: "distanceKm", value: 5 },
      { day: "2026-08-30", field: "flights", value: 12 },
    ]);
  });

  it("takes a distance in metres too", () => {
    expect(toStored(3200, "m", mappingFor("DistanceWalkingRunning")!)).toBe(
      3.2,
    );
  });
});

describe("the exercise answer", () => {
  const day = (n: number) =>
    new Date(Date.parse("2026-09-01T00:00:00Z") - n * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const trained = (n: number, min = 45) => ({
    day: day(n),
    workouts: [{ type: "strengthTraining", min }],
  });

  it("reads three sessions a week as 3-4", () => {
    // Twelve training days spread over the 28-day window.
    const days = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25].map((n) =>
      trained(n),
    );
    expect(exerciseDaysWeek(days, "2026-09-01")).toBe("3–4");
  });

  it("reads two a week as 1-2 and six as 5+", () => {
    const every = (step: number) =>
      Array.from({ length: Math.ceil(28 / step) }, (_, i) => trained(i * step));
    expect(exerciseDaysWeek(every(4), "2026-09-01")).toBe("1–2");
    expect(exerciseDaysWeek(every(1).slice(0, 24), "2026-09-01")).toBe("5+");
  });

  it("does not count a ten-minute walk as a training day", () => {
    expect(
      exerciseDaysWeek(
        [0, 2, 4, 7, 9, 11].map((n) => trained(n, 10)),
        "2026-09-01",
      ),
    ).toBe(null);
  });

  it("ignores days outside the window", () => {
    expect(exerciseDaysWeek([trained(40), trained(60)], "2026-09-01")).toBe(
      null,
    );
  });

  it("never says zero: an empty HealthKit is not proof nobody trained", () => {
    expect(exerciseDaysWeek([], "2026-09-01")).toBe(null);
    expect(
      exerciseDaysWeek([{ day: "2026-09-01", workouts: [] }], "2026-09-01"),
    ).toBe(null);
  });
});

describe("the habit a workout ticks", () => {
  const items = [
    { id: "a", text: "Lift weights three times a week" },
    { id: "b", text: "Walk 30 minutes after dinner" },
    { id: "c", text: "Take vitamin D" },
  ];

  it("ticks the habit the activity names, and nothing else", () => {
    expect(
      workoutTicks(
        [
          {
            day: "2026-08-30",
            workouts: [
              { type: "strengthTraining", min: 65 },
              { type: "walking", min: 32 },
            ],
          },
        ],
        items,
      ),
    ).toEqual([
      { itemId: "a", day: "2026-08-30" },
      { itemId: "b", day: "2026-08-30" },
    ]);
  });

  it("ticks a habit once however many sessions the day held", () => {
    expect(
      workoutTicks(
        [
          {
            day: "2026-08-30",
            workouts: [
              { type: "functionalStrengthTraining", min: 30 },
              { type: "traditionalStrengthTraining", min: 40 },
            ],
          },
        ],
        items,
      ),
    ).toEqual([{ itemId: "a", day: "2026-08-30" }]);
  });

  it("has nothing to tick when no habit names the activity", () => {
    expect(
      workoutTicks(
        [{ day: "2026-08-30", workouts: [{ type: "swimming", min: 40 }] }],
        items,
      ),
    ).toEqual([]);
  });
});

describe("the cycle answer", () => {
  it("says nothing from one period", () => {
    expect(cycleFacts(["2026-08-01", "2026-08-02", "2026-08-03"])).toEqual({});
  });

  it("reads the length between two starts", () => {
    expect(
      cycleFacts([
        "2026-06-01",
        "2026-06-02",
        "2026-06-29",
        "2026-06-30",
        "2026-07-27",
      ]),
    ).toEqual({ cycle_length_days: "21 to 35" });
  });

  it("calls a spread of more than nine days what it is", () => {
    expect(
      cycleFacts(["2026-05-01", "2026-06-01", "2026-06-20", "2026-08-10"]),
    ).toEqual({ cycle_length_days: "It varies a lot" });
  });

  it("reads a long cycle", () => {
    expect(cycleFacts(["2026-05-01", "2026-06-20"])).toEqual({
      cycle_length_days: "Over 35",
    });
  });
});

describe("the daily row a sync may touch", () => {
  it("fills an empty column and leaves a typed one alone", () => {
    const merged = mergeDaily(
      { row: { steps: 9000, sleepHours: null }, wearable: null },
      {
        columns: { steps: 7120, sleepHours: 7 },
        wearable: { standHours: 11 },
      },
    );
    expect(merged.row).toEqual({ sleepHours: 7 });
    expect(merged.wearable.wrote).toEqual(["sleepHours"]);
    expect(merged.wearable.standHours).toBe(11);
  });

  it("refreshes a column it filled itself", () => {
    const first = mergeDaily(null, {
      columns: { steps: 7120 },
      wearable: {},
    });
    const second = mergeDaily(
      { row: { steps: 7120 }, wearable: first.wearable },
      { columns: { steps: 9400 }, wearable: {} },
    );
    expect(second.row.steps).toBe(9400);
    expect(second.wearable.wrote).toEqual(["steps"]);
  });
});

describe("the day's food", () => {
  it("totals the entries and keeps the estimate label", () => {
    const one = mergeNutrition(null, {
      label: "salmon, rice",
      source: "capture",
      estimated: true,
      kcal: 620,
      proteinG: 41,
    });
    expect(one.kcal).toBe(620);
    expect(one.estimated).toBe(true);

    const two = mergeNutrition(one, {
      label: "logged in Health",
      source: "healthkit",
      estimated: false,
      kcal: 300,
      proteinG: 10,
    });
    expect(two.kcal).toBe(920);
    expect(two.proteinG).toBe(51);
    expect(two.entries).toHaveLength(2);
    expect(two.estimated).toBe(true);
  });

  it("replaces its own entry on a re-sync instead of doubling", () => {
    const one = mergeNutrition(
      null,
      {
        label: "logged in Health",
        source: "healthkit",
        estimated: false,
        kcal: 1900,
      },
      { replaceSource: true },
    );
    const again = mergeNutrition(
      one,
      {
        label: "logged in Health",
        source: "healthkit",
        estimated: false,
        kcal: 2100,
      },
      { replaceSource: true },
    );
    expect(again.entries).toHaveLength(1);
    expect(again.kcal).toBe(2100);
  });
});
