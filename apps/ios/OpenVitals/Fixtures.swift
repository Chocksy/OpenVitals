import Foundation

/// The contract's fixtures, compiled in so a DEBUG build can draw every
/// screen with no server behind it.
///
/// The text below is generated from `apps/ios/Tests/Fixtures/*.json`, which
/// are the canonical files. `ContractTests.testTheCompiledFixturesMatchTheFiles`
/// fails the moment the two drift apart. When
/// `apps/simple/fixtures/api/*.json` lands, that directory becomes the source
/// and the tests read it instead; see `ContractTests.fixtureURL`.
enum Fixtures {

    /// On when the app is launched with `-OVFixtures YES`, which is how the
    /// screenshots are taken. Never on in a release build.
    static var on: Bool {
        #if DEBUG
        return UserDefaults.standard.bool(forKey: "OVFixtures")
        #else
        return false
        #endif
    }

    /// Which sheet a screenshot run should open on launch: `-OVSheet capture`
    /// or `-OVSheet settings`. Only read when the fixtures are on.
    static var sheet: String? {
        on ? UserDefaults.standard.string(forKey: "OVSheet") : nil
    }

    /// `-OVScheme dark` pins the appearance for a screenshot run. Nil in every
    /// other build, so the app follows the phone.
    static var scheme: String? {
        on ? UserDefaults.standard.string(forKey: "OVScheme") : nil
    }

    /// `-OVBottom YES` opens every screen at the foot of its scroll, so a
    /// screenshot can prove the last row clears the tab bar.
    static var atBottom: Bool {
        on && UserDefaults.standard.bool(forKey: "OVBottom")
    }

    /// The canned answer for one endpoint, or nil when the app should ask the
    /// server like it always does.
    static func canned<T: Decodable>(_ name: String) -> T? {
        guard on, let text = json[name] else { return nil }
        return try? JSONDecoder().decode(T.self, from: Data(text.utf8))
    }

    static let json: [String: String] = [
        "body": #"""
{
  "day": "2026-09-02",
  "synced": { "types": 27, "lastAt": "2026-09-03T08:12:00+03:00" },
  "rows": [
    { "type": "StepCount", "name": "Steps",
      "identifier": "HKQuantityTypeIdentifierStepCount", "source": "iPhone",
      "value": 7234, "unit": "steps", "display": "7 234",
      "note": "under 10 000 on 21 of the last 30 days",
      "word": "borderline", "when": "Sep 2" },
    { "type": "RestingHeartRate", "name": "Resting heart rate",
      "identifier": "HKQuantityTypeIdentifierRestingHeartRate", "source": "Apple Watch",
      "value": 55, "unit": "bpm", "display": "55", "note": "",
      "word": "optimal", "when": "Sep 2" },
    { "type": "SleepAnalysis", "name": "Sleep",
      "identifier": "HKCategoryTypeIdentifierSleepAnalysis", "source": "Apple Watch",
      "value": 6.8, "unit": "h", "display": "6.8", "note": "under 7 h on 11 of the last 30 nights",
      "word": "off", "when": "Sep 2" },
    { "type": "AppleExerciseTime", "name": "Exercise time",
      "identifier": "HKQuantityTypeIdentifierAppleExerciseTime", "source": "Apple Watch",
      "value": 42, "unit": "min", "display": "42", "note": "",
      "word": "optimal", "when": "Sep 2" },
    { "type": "DietaryProtein", "name": "Protein",
      "identifier": "HKQuantityTypeIdentifierDietaryProtein", "source": "logged in Health",
      "value": 88, "unit": "g", "display": "88", "note": "",
      "word": "optimal", "when": "Sep 2" },
    { "type": "BloodGlucose", "name": "Blood glucose",
      "identifier": "HKQuantityTypeIdentifierBloodGlucose", "source": "no writer",
      "value": null, "unit": "mg/dL", "display": "—",
      "note": "nothing in the last 90 days", "word": "never measured", "when": "—" }
  ]
}
"""#,
        "genome": #"""
{
  "file": { "name": "AncestryDNA.txt", "readAt": "2026-05-04" },
  "verdicts": [
    { "conditionId": "hashimoto", "name": "Hashimoto's thyroiditis",
      "direction": "up", "factor": 3.0, "grade": "B",
      "reason": "HLA-DQ2.5 carrier · carrier ×3", "testNeeded": false,
      "absent": false },
    { "conditionId": "coeliac", "name": "Coeliac disease",
      "direction": "down", "factor": 0.1, "grade": "A",
      "reason": "no HLA-DQ2.5 and no DQ8 · non-carrier LR 0.1",
      "testNeeded": false, "absent": true },
    { "conditionId": "haemochromatosis", "name": "Haemochromatosis",
      "direction": "none", "factor": 1.0, "grade": "C",
      "reason": "HFE C282Y not on this chip", "testNeeded": true,
      "absent": false }
  ],
  "genes": [
    { "verdict": "carrier", "gene": "HLA-DQA1", "call": "DQ2.5", "grade": "B",
      "moved": "Hashimoto's thyroiditis ×3", "source": "AncestryDNA v2",
      "rsids": ["rs2187668", "rs7454108"] },
    { "verdict": "non-carrier", "gene": "HFE", "call": "not read", "grade": "C",
      "moved": "nothing", "source": "AncestryDNA v2", "rsids": ["rs1800562"] }
  ]
}
"""#,
        "habits": #"""
{ "ok": true }
"""#,
        "meal": #"""
{
  "id": "meal_lunch",
  "time": "13:05",
  "photo": "/api/uploads/meal_lunch/photo",
  "label": "Sardines on rye, tomato, olive oil",
  "items": [
    { "name": "Sardines in olive oil", "portion": "1 tin · ~90 g", "kcal": 220,
      "protein_g": 24, "carbs_g": 0, "fat_g": 13, "estimated": true },
    { "name": "Rye bread", "portion": "2 slices · ~60 g", "kcal": 140,
      "protein_g": 4, "carbs_g": 26, "fat_g": 1, "estimated": true },
    { "name": "Tomato", "portion": "1 medium · ~120 g", "kcal": 22,
      "protein_g": 1, "carbs_g": 5, "fat_g": 0, "estimated": true },
    { "name": "Olive oil", "portion": "~1 tsp", "kcal": 40,
      "protein_g": 0, "carbs_g": 0, "fat_g": 6, "estimated": true }
  ],
  "totals": { "kcal": 422, "protein_g": 29, "carbs_g": 31, "fat_g": 20,
              "estimated": true },
  "moves": [
    { "what": "Sardines, three tins a week",
      "line": "your protocol item, adopted Jun 14 2026 · first tick in eleven weeks" },
    { "what": "Protein today", "line": "59 g → 88 g" },
    { "what": "Last meal", "line": "13:05 · the fact the engine uses for the eating window" }
  ]
}
"""#,
        "meals": #"""
{
  "day": "2026-09-03",
  "meals": [
    {
      "id": "meal_breakfast",
      "time": "08:05",
      "photo": null,
      "label": "Breakfast",
      "items": [
        { "name": "Greek yoghurt", "portion": "200 g", "kcal": 240,
          "protein_g": 20, "carbs_g": 14, "fat_g": 12, "estimated": false },
        { "name": "Oats", "portion": "45 g", "kcal": 170,
          "protein_g": 13, "carbs_g": 26, "fat_g": 0, "estimated": false }
      ],
      "totals": { "kcal": 410, "protein_g": 33, "carbs_g": 40, "fat_g": 12,
                  "estimated": false },
      "moves": []
    },
    {
      "id": "meal_lunch",
      "time": "13:05",
      "photo": "/api/uploads/meal_lunch/photo",
      "label": "Sardines on rye, tomato, olive oil",
      "items": [
        { "name": "Sardines in olive oil", "portion": "1 tin · ~90 g", "kcal": 220,
          "protein_g": 24, "carbs_g": 0, "fat_g": 13, "estimated": true },
        { "name": "Rye bread", "portion": "2 slices · ~60 g", "kcal": 140,
          "protein_g": 4, "carbs_g": 26, "fat_g": 1, "estimated": true },
        { "name": "Tomato", "portion": "1 medium · ~120 g", "kcal": 22,
          "protein_g": 1, "carbs_g": 5, "fat_g": 0, "estimated": true },
        { "name": "Olive oil", "portion": "~1 tsp", "kcal": 40,
          "protein_g": 0, "carbs_g": 0, "fat_g": 6, "estimated": true }
      ],
      "totals": { "kcal": 422, "protein_g": 29, "carbs_g": 31, "fat_g": 20,
                  "estimated": true },
      "moves": [
        { "what": "Sardines, three tins a week",
          "line": "your protocol item, adopted Jun 14 2026 · first tick in eleven weeks" },
        { "what": "Protein today", "line": "59 g → 88 g" },
        { "what": "Last meal", "line": "13:05 · the fact the engine uses for the eating window" }
      ]
    }
  ],
  "totals": { "kcal": 832, "protein_g": 62, "carbs_g": 71, "fat_g": 32,
              "estimated": true }
}
"""#,
        "plan-today": #"""
{
  "day": "2026-09-03",
  "done": 2,
  "total": 7,
  "rows": [
    { "itemId": "pi_selenium", "time": "08:00", "slot": "breakfast",
      "title": "Selenium 200 µg", "why": "with breakfast · TPO 320 → under 100",
      "tag": "protocol", "done": true, "adherence": 0.86 },
    { "itemId": "pi_steps", "time": null, "slot": null,
      "title": "10 000 steps", "why": "7 234 yesterday · 10 000 is the aim",
      "tag": "every day", "done": true, "adherence": null },
    { "itemId": "pi_protein_first", "time": "12:30", "slot": "midday",
      "title": "Protein and fibre first", "why": "at the largest meal · HbA1c 5.6 %",
      "tag": "every day", "done": false, "adherence": null },
    { "itemId": "pi_sardines", "time": "13:00", "slot": "midday",
      "title": "Sardines, 1 of 3 this week", "why": "selenium and omega-3 · TPO 320",
      "tag": "protocol", "done": false, "adherence": 0.0 },
    { "itemId": "pi_resistance", "time": "17:30", "slot": "afternoon",
      "title": "Resistance, 45 min", "why": "3rd of 3 this week",
      "tag": "goal", "done": false, "adherence": null },
    { "itemId": "pi_vitamin_d", "time": "19:30", "slot": "dinner",
      "title": "Vitamin D 4 000 IU", "why": "with dinner · 19 → 40–60 ng/mL",
      "tag": "protocol", "done": false, "adherence": 1.0 },
    { "itemId": "pi_iron", "time": "21:00", "slot": "evening",
      "title": "Iron 60 mg", "why": "empty stomach · alternate days · ferritin 22 → above 50",
      "tag": "protocol", "done": false, "adherence": 0.64 }
  ]
}
"""#,
        "research": #"""
{
  "rows": [
    {
      "id": "pw_1",
      "conditionId": "hashimoto",
      "source": "epmc",
      "externalId": "40123456",
      "title": "Selenium supplementation and thyroid peroxidase antibodies: a randomised trial",
      "journal": "Thyroid",
      "publishedAt": "2026-07-18",
      "grade": "B",
      "finding": "200 µg selenomethionine a day cut TPO antibodies by 31 % over six months.",
      "abstract": "Randomised, double-blind, 184 adults with autoimmune thyroiditis.",
      "moves": { "conclusionId": "hashimoto", "name": "Hashimoto's thyroiditis",
                 "direction": "up", "delta": 0.04 },
      "foundAt": "2026-09-01T06:00:00+03:00",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "pw_2",
      "conditionId": "lipids",
      "source": "epmc",
      "externalId": "40119911",
      "title": "Dietary fibre and LDL cholesterol in adults: an updated meta-analysis",
      "journal": "BMJ",
      "publishedAt": "2026-06-02",
      "grade": "A",
      "finding": "Each 10 g a day of soluble fibre lowered LDL by 5 mg/dL.",
      "abstract": "Meta-analysis of 41 randomised trials, 6 812 adults.",
      "moves": null,
      "foundAt": "2026-09-01T06:00:00+03:00",
      "seenAt": "2026-09-02T09:14:00+03:00",
      "dismissedAt": null
    }
  ]
}
"""#,
        "today": #"""
{
  "sentence": {
    "head": "Seven markers are off.",
    "tail": "Thyroid is the loudest one.",
    "tone": "bad"
  },
  "status": {
    "off": 7,
    "borderline": 19,
    "optimal": 26,
    "drawDate": "2026-08-01",
    "since": "5 weeks ago"
  },
  "body": {
    "headline": "7 234",
    "unit": "steps",
    "line": "Sep 2 · Apple Health"
  },
  "blood": {
    "off": 7,
    "total": 52,
    "nextDraw": {
      "weeks": 6,
      "codes": [
        { "code": "TPO", "name": "Thyroid peroxidase antibodies" },
        { "code": "LDL", "name": "LDL cholesterol" },
        { "code": "FERRITIN", "name": "Ferritin" }
      ]
    }
  },
  "plan": { "headline": "2 / 7", "todo": 5 },
  "systems": [
    { "id": "thyroid", "name": "Thyroid", "word": "off", "value": 320, "unit": "IU/mL", "marker": "TPO" },
    { "id": "vitamins", "name": "Vitamins", "word": "off", "value": 19, "unit": "ng/mL", "marker": "Vitamin D" },
    { "id": "lipids", "name": "Lipids", "word": "off", "value": 131, "unit": "mg/dL", "marker": "LDL" },
    { "id": "blood-sugar", "name": "Blood sugar", "word": "borderline", "value": 5.6, "unit": "%", "marker": "HbA1c" },
    { "id": "iron", "name": "Iron", "word": "borderline", "value": 22, "unit": "ng/mL", "marker": "Ferritin" },
    { "id": "inflammation", "name": "Inflammation", "word": "good", "value": 0.6, "unit": "mg/L", "marker": "hs-CRP" },
    { "id": "kidneys", "name": "Kidneys", "word": "good", "value": 98, "unit": "mL/min/1.73m²", "marker": "eGFR" },
    { "id": "liver", "name": "Liver", "word": "good", "value": 24, "unit": "U/L", "marker": "ALT" },
    { "id": "blood-count", "name": "Blood count", "word": "good", "value": 14.6, "unit": "g/dL", "marker": "Haemoglobin" },
    { "id": "minerals", "name": "Minerals", "word": "good", "value": 2.34, "unit": "mmol/L", "marker": "Calcium" },
    { "id": "heart", "name": "Heart", "word": "good", "value": 55, "unit": "bpm", "marker": "Resting heart rate" },
    { "id": "sex-hormones", "name": "Sex hormones", "word": "never measured", "value": null, "unit": null, "marker": null }
  ]
}
"""#,
    ]
}
