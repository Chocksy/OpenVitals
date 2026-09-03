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

    /// `-OVGallery YES` opens the design-system gallery instead of the app.
    static var gallery: Bool {
        #if DEBUG
        return UserDefaults.standard.bool(forKey: "OVGallery")
        #else
        return false
        #endif
    }

    /// `-OVBottom YES` opens every screen at the foot of its scroll, so a
    /// screenshot can prove the last row clears the tab bar.
    static var atBottom: Bool {
        on && UserDefaults.standard.bool(forKey: "OVBottom")
    }

    /// The canned answer for one endpoint, or nil when the app should ask the
    /// server like it always does.
    static func canned<T: Decodable>(_ name: String) -> T? {
        #if DEBUG
        guard on, let text = json[name] else { return nil }
        return try? JSONDecoder().decode(T.self, from: Data(text.utf8))
        #else
        return nil
        #endif
    }

    /// Fifty-odd kilobytes of JSON that a release build must never carry.
    #if DEBUG
    static let json: [String: String] = [
        "body": #"""
{
  "day": "2026-08-31",
  "synced": {
    "types": 12,
    "lastAt": "2026-09-01T07:18:24.094Z"
  },
  "rows": [
    {
      "type": "steps",
      "name": "Steps",
      "identifier": "HKQuantityTypeIdentifierStepCount",
      "source": "phone",
      "value": 7000,
      "unit": "steps",
      "display": "7 000",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "activeEnergyKcal",
      "name": "Active energy",
      "identifier": "HKQuantityTypeIdentifierActiveEnergyBurned",
      "source": "phone",
      "value": 500,
      "unit": "kcal",
      "display": "500",
      "note": "45 kcal below the 90-day mean of 545 kcal",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "exerciseMin",
      "name": "Exercise minutes",
      "identifier": "HKQuantityTypeIdentifierAppleExerciseTime",
      "source": "phone",
      "value": 20,
      "unit": "min",
      "display": "20",
      "note": "18 min below the 90-day mean of 38 min",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "standHours",
      "name": "Stand hours",
      "identifier": "HKCategoryTypeIdentifierAppleStandHour",
      "source": "phone",
      "value": 10,
      "unit": "hours",
      "display": "10",
      "note": "2.5 below the 90-day mean of 12.5",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "distanceKm",
      "name": "Distance",
      "identifier": "HKQuantityTypeIdentifierDistanceWalkingRunning",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "flights",
      "name": "Flights climbed",
      "identifier": "HKQuantityTypeIdentifierFlightsClimbed",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "resting_heart_rate",
      "name": "Resting Heart Rate",
      "identifier": "HKQuantityTypeIdentifierRestingHeartRate",
      "source": "phone",
      "value": 56,
      "unit": "bpm",
      "display": "56",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "hrv_sdnn",
      "name": "HRV (SDNN)",
      "identifier": "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      "source": "phone",
      "value": 48,
      "unit": "ms",
      "display": "48",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "respiratory_rate",
      "name": "Respiratory Rate",
      "identifier": "HKQuantityTypeIdentifierRespiratoryRate",
      "source": "phone",
      "value": 14,
      "unit": "breaths/min",
      "display": "14",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "spo2",
      "name": "SpO2",
      "identifier": "HKQuantityTypeIdentifierOxygenSaturation",
      "source": "phone",
      "value": 97,
      "unit": "%",
      "display": "97",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "walking_hr_avg",
      "name": "Walking heart rate average",
      "identifier": "HKQuantityTypeIdentifierWalkingHeartRateAverage",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "hr_recovery_1min",
      "name": "Heart rate recovery, one minute",
      "identifier": "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "sleep_duration",
      "name": "Sleep Duration",
      "identifier": "HKCategoryTypeIdentifierSleepAnalysis",
      "source": "phone",
      "value": null,
      "unit": "h",
      "display": "7:00",
      "note": "at your 90-day mean",
      "word": "never measured",
      "when": "2026-08-31"
    },
    {
      "type": "vo2max_est",
      "name": "VO2max (estimated)",
      "identifier": "HKQuantityTypeIdentifierVO2Max",
      "source": "phone",
      "value": 44,
      "unit": "mL/kg/min",
      "display": "44",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "weight",
      "name": "Weight",
      "identifier": "HKQuantityTypeIdentifierBodyMass",
      "source": "phone",
      "value": 181,
      "unit": "lbs",
      "display": "181",
      "note": "at your 90-day mean",
      "word": "good",
      "when": "2026-08-31"
    },
    {
      "type": "body_fat_pct",
      "name": "Body fat",
      "identifier": "HKQuantityTypeIdentifierBodyFatPercentage",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "waist_cm",
      "name": "Waist",
      "identifier": "HKQuantityTypeIdentifierWaistCircumference",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "bp_systolic",
      "name": "Blood pressure, systolic",
      "identifier": "HKQuantityTypeIdentifierBloodPressureSystolic",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "bp_diastolic",
      "name": "Blood pressure, diastolic",
      "identifier": "HKQuantityTypeIdentifierBloodPressureDiastolic",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "glucose",
      "name": "Glucose",
      "identifier": "HKQuantityTypeIdentifierBloodGlucose",
      "source": "phone",
      "value": 101,
      "unit": "mg/dL",
      "display": "101",
      "note": "at your 90-day mean",
      "word": "borderline",
      "when": "2026-08-31"
    },
    {
      "type": "wrist_temp",
      "name": "Sleeping wrist temperature",
      "identifier": "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "mindfulMin",
      "name": "Mindful minutes",
      "identifier": "HKCategoryTypeIdentifierMindfulSession",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "kcal",
      "name": "Dietary energy",
      "identifier": "HKQuantityTypeIdentifierDietaryEnergyConsumed",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "proteinG",
      "name": "Dietary protein",
      "identifier": "HKQuantityTypeIdentifierDietaryProtein",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "carbsG",
      "name": "Dietary carbohydrates",
      "identifier": "HKQuantityTypeIdentifierDietaryCarbohydrates",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    },
    {
      "type": "fatG",
      "name": "Dietary fat",
      "identifier": "HKQuantityTypeIdentifierDietaryFatTotal",
      "source": "phone",
      "value": null,
      "unit": "",
      "display": "—",
      "note": "",
      "word": "never measured",
      "when": ""
    }
  ]
}
"""#,
        "genome": #"""
{
  "file": {
    "name": "genome_Razvan_Ciocanel_v5_Full_20211206122835.txt",
    "readAt": "2026-08-28"
  },
  "verdicts": [
    {
      "conditionId": "coeliac_disease",
      "name": "Coeliac disease",
      "direction": "down",
      "factor": 0.1,
      "grade": "A",
      "reason": "HLA DR3-DQ2.5 haplotype tag · Coeliac disease is essentially excluded: over 99 % of people with it carry one of these two haplotypes.",
      "testNeeded": false,
      "absent": true
    },
    {
      "conditionId": "type2_diabetes",
      "name": "Type 2 diabetes",
      "direction": "up",
      "factor": 1.4,
      "grade": "A",
      "reason": "TCF7L2 · One TCF7L2 T allele raises type 2 diabetes risk about 1.4-fold (A).",
      "testNeeded": true,
      "absent": false
    },
    {
      "conditionId": "insulin_resistance",
      "name": "Insulin resistance",
      "direction": "up",
      "factor": 1.44,
      "grade": "B",
      "reason": "FTO · Two FTO A alleles double that nudge (B).",
      "testNeeded": true,
      "absent": false
    },
    {
      "conditionId": "ascvd_risk",
      "name": "Atherosclerotic risk",
      "direction": "none",
      "factor": null,
      "grade": "A",
      "reason": "APOE · no rule for Atherosclerotic risk fired on this call (e2/e3).",
      "testNeeded": false,
      "absent": false
    },
    {
      "conditionId": "lpa_elevated",
      "name": "High lipoprotein(a)",
      "direction": "none",
      "factor": null,
      "grade": "A",
      "reason": "LPA · no rule for High lipoprotein(a) fired on this call (non-carrier).",
      "testNeeded": false,
      "absent": false
    },
    {
      "conditionId": "haemochromatosis",
      "name": "Haemochromatosis",
      "direction": "none",
      "factor": null,
      "grade": "A",
      "reason": "HFE · no rule for Haemochromatosis fired on this call (no C282Y or H63D).",
      "testNeeded": false,
      "absent": false
    },
    {
      "conditionId": "hashimoto",
      "name": "Autoimmune thyroiditis (Hashimoto's)",
      "direction": "none",
      "factor": null,
      "grade": "A",
      "reason": "HLA DR3-DQ2.5 haplotype tag · no rule for Autoimmune thyroiditis (Hashimoto's) fired on this call (no DQ2.5 or DQ8 tag).",
      "testNeeded": false,
      "absent": false
    },
    {
      "conditionId": "atrophic_gastritis",
      "name": "Atrophic gastritis",
      "direction": "none",
      "factor": null,
      "grade": "A",
      "reason": "HLA DR3-DQ2.5 haplotype tag · no rule for Atrophic gastritis fired on this call (no DQ2.5 or DQ8 tag).",
      "testNeeded": false,
      "absent": false
    },
    {
      "conditionId": "folate_deficiency",
      "name": "Folate deficiency",
      "direction": "none",
      "factor": null,
      "grade": "C",
      "reason": "MTHFR · no rule for Folate deficiency fired on this call (C677T heterozygous).",
      "testNeeded": false,
      "absent": false
    }
  ],
  "genes": [
    {
      "verdict": "e2/e3: ε2 lowers LDL and lowers dementia risk, and in rare cases carries type III hyperlipoproteinaemia.",
      "gene": "APOE",
      "call": "e2/e3",
      "grade": "A",
      "moved": false,
      "source": "Bennet 2007 JAMA (APOE genotype and coronary risk, 82 studies); Farrer 1997 JAMA (APOE and Alzheimer meta-analysis); ClinVar rs429358 / rs7412.",
      "rsids": [
        "rs429358",
        "rs7412"
      ]
    },
    {
      "verdict": "Neither risk allele.",
      "gene": "LPA",
      "call": "non-carrier",
      "grade": "A",
      "moved": false,
      "source": "Clarke 2009 N Engl J Med (PROCARDIS: rs10455872 and rs3798220 with Lp(a) and coronary disease); Kamstrup 2009 JAMA.",
      "rsids": [
        "rs10455872",
        "rs3798220"
      ]
    },
    {
      "verdict": "Neither common HFE variant, so the usual genetic cause of iron overload is off the table.",
      "gene": "HFE",
      "call": "no C282Y or H63D",
      "grade": "A",
      "moved": false,
      "source": "Feder 1996 Nat Genet (HFE discovery); EASL 2022 clinical practice guidelines on haemochromatosis; ClinVar rs1800562 (C282Y), rs1799945 (H63D).",
      "rsids": [
        "rs1800562",
        "rs1799945"
      ]
    },
    {
      "verdict": "Coeliac disease is essentially excluded: over 99 % of people with it carry one of these two haplotypes.",
      "gene": "HLA DR3-DQ2.5 haplotype tag",
      "call": "no DQ2.5 or DQ8 tag",
      "grade": "A",
      "moved": true,
      "source": "Monsuur 2008 PLoS ONE (the rs2187668 T allele tags DQ2.5-DR3, rs7454108 C tags DQ8); Karell 2003 Hum Immunol; NICE NG20 coeliac guidance on HLA testing as a rule-out; Zeitlin 2008 Clin Endocrinol and Jacobson 2008 Clin Immunol for DR3/DR4 and autoimmunity; rs660895 tags DRB1*04:01 (Raychaudhuri 2012 Nat Genet).",
      "rsids": [
        "rs2187668",
        "rs7454108",
        "rs660895"
      ]
    },
    {
      "verdict": "1 risk allele: about 40 % above the background risk, and the DPP trial showed lifestyle change erases most of it.",
      "gene": "TCF7L2",
      "call": "CT",
      "grade": "A",
      "moved": true,
      "source": "Grant 2006 Nat Genet (deCODE, TCF7L2 and type 2 diabetes); Florez 2006 N Engl J Med (DPP: the risk is preventable by lifestyle).",
      "rsids": [
        "rs7903146"
      ]
    },
    {
      "verdict": "One copy, essentially no effect on homocysteine at normal folate intake.",
      "gene": "MTHFR",
      "call": "C677T heterozygous",
      "grade": "C",
      "moved": false,
      "source": "Frosst 1995 Nat Genet (C677T); Clarke 2012 PLoS Med (MTHFR, homocysteine and disease: the effect is small and folate-dependent); ACMG 2013 statement against routine MTHFR testing.",
      "rsids": [
        "rs1801133"
      ]
    },
    {
      "verdict": "Caffeine clears quickly; a morning coffee moves a draw much less.",
      "gene": "CYP1A2",
      "call": "fast metaboliser",
      "grade": "B",
      "moved": false,
      "source": "Cornelis 2006 JAMA (CYP1A2 genotype, coffee and myocardial infarction); PharmGKB rs762551 caffeine annotation.",
      "rsids": [
        "rs762551"
      ]
    },
    {
      "verdict": "Lactase switches off after weaning.",
      "gene": "LCT / MCM6",
      "call": "lactase non-persistent",
      "grade": "A",
      "moved": false,
      "source": "Enattah 2002 Nat Genet (MCM6 rs4988235 and lactase persistence); Storhaug 2017 Lancet Gastroenterol Hepatol (global prevalence).",
      "rsids": [
        "rs4988235"
      ]
    },
    {
      "verdict": "2 risk alleles: roughly 2.4 kg more body weight on average, through appetite.",
      "gene": "FTO",
      "call": "AA",
      "grade": "B",
      "moved": true,
      "source": "Frayling 2007 Science (FTO and BMI); Kilpeläinen 2011 PLoS Med (physical activity attenuates the FTO effect by about 30 %).",
      "rsids": [
        "rs9939609"
      ]
    },
    {
      "verdict": "The common allele; the usual haemolysis triggers are safe on this account.",
      "gene": "G6PD",
      "call": "no G6PD A− variant",
      "grade": "A",
      "moved": false,
      "source": "Luzzatto 2020 Blood (G6PD deficiency); ClinVar rs1050828 (Val68Met, the A− allele); WHO G6PD classification.",
      "rsids": [
        "rs1050828"
      ]
    },
    {
      "verdict": "The usual transporter; no statin dose change on genetic grounds.",
      "gene": "SLCO1B1",
      "call": "typical",
      "grade": "A",
      "moved": false,
      "source": "SEARCH Collaborative Group 2008 N Engl J Med (SLCO1B1 variants and statin-induced myopathy); CPIC 2022 guideline for statins and SLCO1B1.",
      "rsids": [
        "rs4149056"
      ]
    }
  ]
}
"""#,
        "habits": #"""
{
  "ok": true,
  "id": "hl_1",
  "itemId": "pi_selenium",
  "day": "2026-08-31",
  "done": true
}
"""#,
        "meal": #"""
{
  "id": "0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71",
  "time": "13:05",
  "photo": null,
  "label": "grilled salmon, white rice, green beans",
  "items": [
    {
      "name": "grilled salmon",
      "portion": "150 g",
      "kcal": 310,
      "protein_g": 34,
      "carbs_g": 0,
      "fat_g": 19,
      "estimated": true
    },
    {
      "name": "white rice",
      "portion": "200 g cooked",
      "kcal": 260,
      "protein_g": 5,
      "carbs_g": 57,
      "fat_g": 1,
      "estimated": true
    },
    {
      "name": "green beans",
      "portion": "100 g",
      "kcal": 35,
      "protein_g": 2,
      "carbs_g": 7,
      "fat_g": 0,
      "estimated": true
    }
  ],
  "totals": {
    "kcal": 605,
    "protein_g": 41,
    "carbs_g": 64,
    "fat_g": 20,
    "estimated": true
  },
  "moves": []
}
"""#,
        "meals": #"""
{
  "day": "2026-08-31",
  "meals": [
    {
      "id": "0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71",
      "time": "13:05",
      "photo": null,
      "label": "grilled salmon, white rice, green beans",
      "items": [
        {
          "name": "grilled salmon",
          "portion": "150 g",
          "kcal": 310,
          "protein_g": 34,
          "carbs_g": 0,
          "fat_g": 19,
          "estimated": true
        },
        {
          "name": "white rice",
          "portion": "200 g cooked",
          "kcal": 260,
          "protein_g": 5,
          "carbs_g": 57,
          "fat_g": 1,
          "estimated": true
        },
        {
          "name": "green beans",
          "portion": "100 g",
          "kcal": 35,
          "protein_g": 2,
          "carbs_g": 7,
          "fat_g": 0,
          "estimated": true
        }
      ],
      "totals": {
        "kcal": 605,
        "protein_g": 41,
        "carbs_g": 64,
        "fat_g": 20,
        "estimated": true
      },
      "moves": []
    }
  ],
  "totals": {
    "kcal": 605,
    "protein_g": 41,
    "carbs_g": 64,
    "fat_g": 20,
    "estimated": true
  }
}
"""#,
        "plan-today": #"""
{
  "day": "2026-08-31",
  "done": 0,
  "total": 4,
  "rows": [
    {
      "itemId": null,
      "time": null,
      "slot": null,
      "title": "Resistance training twice a week",
      "why": "Pattern insulin_resistance_early is the top system; resistance training is listed first in the management sequence and is the cheapest lever before any supplement.",
      "tag": "suggested",
      "done": false,
      "adherence": null
    },
    {
      "itemId": null,
      "time": null,
      "slot": null,
      "title": "Walk 10 minutes after the largest meal every day",
      "why": "Management of insulin_resistance_early lists a walk after the largest meal as the third lever; this is sequenced after confirming OGTT but can start immediately.",
      "tag": "suggested",
      "done": false,
      "adherence": null
    },
    {
      "itemId": null,
      "time": null,
      "slot": null,
      "title": "Vitamin D3 4000 IU daily with largest meal",
      "why": "Vitamin D 32.68 is below 40 and edge vitamin_d->insulin exists; raise before judging testosterone or lipids because user is 39-year-old male with no prior supplements.",
      "tag": "suggested",
      "done": false,
      "adherence": null
    },
    {
      "itemId": null,
      "time": null,
      "slot": null,
      "title": "Protein and fibre at the start of every meal",
      "why": "Management of insulin_resistance_early lists protein and fibre at the start of meals as second lever; sequenced after training starts because user has zero adherence.",
      "tag": "suggested",
      "done": false,
      "adherence": null
    }
  ]
}
"""#,
        "research": #"""
{
  "rows": [
    {
      "id": "fa01b993-b78b-4c6d-b9e7-1d234d65465c",
      "conditionId": "ascvd_risk",
      "source": "epmc",
      "externalId": "10.1016/j.ypmed.2026.108653",
      "title": "Concurrent psychiatric, somatic, and social vulnerabilities in patients at increased cardiovascular risk in the Netherlands",
      "journal": "Prev Med",
      "url": "https://doi.org/10.1016/j.ypmed.2026.108653",
      "publishedAt": "2026-08-27",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Objective</h4>To evaluate clinical, psychiatric, demographic, and socioeconomic vulnerability in a Dutch primary care setting.<h4>Methods</h4>We included 34,392 patients aged 40-70 years who were registered for cardiovascular risk management in general practice before 2018. Latent class analysis was performed using 17 indicators across seven themes: somatic morbidity, adverse lifestyle, psychiatric, age, sex, ethnicity, and socioeconomic factors. We compared five-year risk of major adverse cardiovascular events using Fine-Gray competing risk models and assessed annual medical expenditures (2018-2022) across the derived latent classes.<h4>Results</h4>Clustering factors into four latent classes was considered optimal: class 1 (n = 6329; 18%), \"mental and socioeconomic vulnerability\"; class 2 (n = 11,888; 35%), \"healthy and socioeconomic advantage\"; class 3 (n = 4630; 13%), \"senior and socioeconomic vulnerability\"; class 4 (n = 11,545; 34%), \"somatic burden and socioeconomic advantage\". Class 1 had the highest cardiovascular risk after adjustment (subdistribution hazard ratio 1.52, 95% confidence interval 1.23, 1.87). It also showed the highest age-standardized mean expenditures: total (€5273), general practitioners (€253), and mental healthcare (€742).<h4>Conclusions</h4>Concurrent psychiatric disorders and socioeconomic deprivation increased cardiovascular risk. Cardiovascular risk management should be more integrated and person-centered to address multimorbidity, social determinants, and behavioral risk factors.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:37.375Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "1aad62c5-3f7d-40ca-aa04-45ca9a75269a",
      "conditionId": "ascvd_risk",
      "source": "epmc",
      "externalId": "10.21203/rs.3.rs-10391004/v1",
      "title": "Sex-Specific Cardiovascular Risk Phenotypes Integrating Cardiometabolic, Psychosocial, and Autoimmune Determinants: A Population-Based Cross-sectional Study",
      "journal": null,
      "url": "https://doi.org/10.21203/rs.3.rs-10391004/v1",
      "publishedAt": "2026-08-27",
      "grade": null,
      "finding": null,
      "abstract": "<title>Abstract</title>  <p>  <bold>Background</bold>  Emerging evidence suggests that psychosocial, autoimmune, and reproductive factors contribute substantially to cardiovascular vulnerability, yet these domains are rarely integrated within population-based cardiovascular risk assessments. We aimed to identify sex-specific cardiovascular risk phenotypes combining traditional and non-traditional determinants and to evaluate factors associated with established CVD in women.  <bold>Methods</bold>  We conducted a population-based cross-sectional study using linked electronic health records from 138,507 adults aged 18–90 years residing in Catalonia, Spain. Sex differences in cardiovascular risk profiles were assessed using descriptive and comparative analyses. Latent cardiovascular risk phenotypes were identified through unsupervised Two-Step cluster analysis incorporating cardiometabolic, psychosocial, autoimmune, socioeconomic, and female-specific reproductive variables. Exploratory Factor analysis, multivariable logistic regression, variance inflation factors, and ROC curves were used to determine factors independently associated with established CVD among women.  <bold>Results</bold>  The study included 67,512 women (48.7%) and 70,995 men (51.3%). Five statistical cardiovascular risk phenotypes were identified: cardiometabolic, metabolic-inflammatory, psychosocial vulnerability, advanced multimorbidity, and autoimmune profiles. Women were overrepresented in psychosocial and metabolic-inflammatory phenotypes, while men predominated in the classical cardiometabolic phenotype. Among women, established CVD was independently associated with age (OR 1.07 per year; 95%CI 1.071–1.080), hypertension (OR 1.88; 95%CI 1.708–2.076), diabetes mellitus (OR 1.40; 95%CI 1.26–1.56), dyslipidaemia (OR 1.227; 95%CI 1.11–1.33), (OR 1.10 per unit; 95%CI 1.00–1.20), depression (OR 1.11; 95%CI 1.00–1.24), and multimorbidity burden (OR 1.92; 95%CI 1.84–2.00). Systemic lupus erythematosus showed particularly strong associations with CVD among younger women.  <bold>Conclusions</bold>  Women do not follow a single pathway to cardiovascular disease. Instead, cardiovascular vulnerability develops through distinct multidimensional life-course phenotypes that complement conventional risk factors. This approach may improve identification of vulnerable women and help reduce the burden of cardiovascular disease.  </p>",
      "moves": null,
      "foundAt": "2026-09-03T07:51:37.375Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "75c5f3c6-c41f-471b-9d93-c66b9a9d34b1",
      "conditionId": "ascvd_risk",
      "source": "epmc",
      "externalId": "10.1093/nutrit/nuag116",
      "title": "Association Between Vitamin D Deficiency and Cardiovascular Risk Factors in Children and Adolescents: A Systematic Review",
      "journal": "Nutr Rev",
      "url": "https://doi.org/10.1093/nutrit/nuag116",
      "publishedAt": "2026-08-25",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Context</h4>Vitamin D deficiency is prevalent among children and adolescents and has emerged as a potential contributor to early cardiometabolic dysfunction. Growing evidence suggests links between low serum 25-hydroxyvitamin D (25[OH]D) concentrations and adverse cardiovascular risk profiles; however, the magnitude, independence, and clinical relevance of these associations in pediatric populations remain controversial.<h4>Objective</h4>This review aimed to critically evaluate evidence regarding the relationship between vitamin D deficiency and cardiovascular risk factors in pediatric populations.<h4>Data sources</h4>This review was conducted in accordance with Preferred Reporting Items for Systematic reviews and Meta-Analyses (PRISMA) guidelines and registered in the International Prospective Register of Systematic Reviews (PROSPERO). A comprehensive electronic search of PubMed, SciELO, and Embase was performed up to September 10, 2025.<h4>Data extraction</h4>Studies assessing serum (25[OH]D) levels in relation to established cardiovascular risk factors in pediatric populations were included.<h4>Data analysis</h4>Risks of bias and overall quality of evidence were evaluated. Findings were synthesized through a structured qualitative narrative approach. In observational studies, a consistent inverse association was observed with markers of adiposity, with lower circulating 25(OH)D concentrations repeatedly reported in study participants with overweight or obesity. Associations with dyslipidemia, insulin resistance, and elevated blood pressure were also described; however, these relationships were heterogeneous and frequently attenuated after adjustment. Interventional studies showed largely null or clinically modest effects of vitamin D supplementation on pediatric cardiovascular risk.<h4>Conclusions</h4>Considerable heterogeneity was observed across studies regarding participant age, developmental stage, vitamin D thresholds, outcome definitions, and study design. Current evidence does not support a clearly established causal relationship between vitamin D deficiency and pediatric cardiovascular risk. The observed associations with certain cardiovascular risk markers, particularly those related to obesity and adiposity, appear substantially influenced by confounding and shared lifestyle determinants, and further research is needed to fully elucidate the nature of the relationship. Vitamin D status should be interpreted within a broader cardiometabolic and behavioural framework. Well-designed longitudinal studies and randomized controlled trials are warranted to clarify whether vitamin D plays an independent role in the early development of cardiovascular risk.<h4>Systematic review registration</h4>PROSPERO registration No. [CRD420251137216].",
      "moves": null,
      "foundAt": "2026-09-03T07:51:37.375Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "b4aa8733-2e0d-44b2-8e84-46f63db84e12",
      "conditionId": "ascvd_risk",
      "source": "epmc",
      "externalId": "10.1097/hco.0000000000001335",
      "title": "Plaque vulnerability and cardiovascular risk factor burden in acute coronary syndromes: insights from optical coherence tomography",
      "journal": "Curr Opin Cardiol",
      "url": "https://doi.org/10.1097/hco.0000000000001335",
      "publishedAt": "2026-08-27",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Purpose of review</h4>Both cardiovascular risk factors and features of coronary plaque vulnerability are associated with adverse cardiovascular outcomes, including acute coronary syndromes (ACS); however, these epidemiological and pathological concepts have evolved along largely separate tracks. This review discusses emerging evidence that modifiable cardiovascular risk factor burden is associated with plaque vulnerability, as assessed by optical coherence tomography (OCT).<h4>Recent findings</h4>Recent large-scale OCT analyses suggest that, in patients with ACS, increasing modifiable cardiovascular risk factor burden is associated with a stepwise increase in culprit plaque features of vulnerability, including lipid-rich plaque, thin-cap fibroatheroma, macrophage accumulation, microvessels, and cholesterol crystals. This association was weaker in nonculprit plaques. In contrast, nonmodifiable risk factor burden was not associated with plaque vulnerability. These findings extend previous studies of individual risk factors by showing that cumulative modifiable risk burden is reflected in plaque phenotype.<h4>Summary</h4>Current evidence supports the concept that cumulative modifiable cardiovascular risk factor burden may reflect coronary plaque biology, linking epidemiological risk assessment with imaging-defined plaque vulnerability. In this framework, cardiovascular risk factor burden may be understood as a surrogate of plaque vulnerability, linked to inflammatory, oxidative, and metabolic pathways. This association may help identify higher risk patients.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:37.375Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "ef031fda-9dd9-40c7-99ab-ce9b84c002a3",
      "conditionId": "hypertension",
      "source": "epmc",
      "externalId": "10.1007/s40292-026-00802-8",
      "title": "Correction: Triglyceride-Glucose Index and Mortality Risk in the General Population: A Systematic Review and Meta-analysis of Prospective Studies",
      "journal": "High Blood Press Cardiovasc Prev",
      "url": "https://doi.org/10.1007/s40292-026-00802-8",
      "publishedAt": "2026-07-01",
      "grade": null,
      "finding": null,
      "abstract": null,
      "moves": null,
      "foundAt": "2026-09-03T07:51:36.475Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "a724a224-1ba9-4d1d-bfdc-bd9bb7c5d276",
      "conditionId": "hypertension",
      "source": "epmc",
      "externalId": "10.1007/s40292-026-00813-5",
      "title": "Pathophysiology and Clinical Relevance of Microvascular Remodeling in Arterial Hypertension",
      "journal": "High Blood Press Cardiovasc Prev",
      "url": "https://doi.org/10.1007/s40292-026-00813-5",
      "publishedAt": "2026-07-31",
      "grade": null,
      "finding": null,
      "abstract": "Long-term exposure to high blood pressure leads to systemic structural and functional changes of microcirculation, a condition named microvascular remodeling. Microvascular remodeling can be assessed in subcutaneous small resistance arteries or non-invasively at the retinal level using Scanning Laser Doppler Flowmetry and Adaptive Optics. Capillary rarefaction is also a marker of hypertensive vascular impairment resulting in a lack of nutrient and oxygen supply. In hypertension, microvascular remodeling and large artery damage are part of a vicious cycle that eventually leads to target organ damage and worsen cardio-renal-cerebrovascular outcomes. This review describes the inflammatory nature of microvascular remodeling and aims to unravel the association of microvascular remodeling with hypertension-mediated organ damage, also providing an overview on its clinical relevance.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:36.475Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "d3c2ca17-c1e5-4d11-8d11-68f728fd9bab",
      "conditionId": "hypertension",
      "source": "epmc",
      "externalId": "10.1080/08037051.2026.2715846",
      "title": "Burden of high blood pressure and associated risk for all-cause and cardiovascular mortality among US young adults",
      "journal": "Blood Press",
      "url": "https://doi.org/10.1080/08037051.2026.2715846",
      "publishedAt": "2026-08-14",
      "grade": null,
      "finding": null,
      "abstract": "<i>Background:</i> High blood pressure (BP) in young adults is an underrecognised public health issue with potential long-term health consequences, including increased mortality risk. To examine the prevalence of prehypertension among US young adults and assess its association with all-cause and cardiovascular mortality. <i>Methods:</i> This cohort study utilised data from the National Health and Nutrition Examination Survey (NHANES) 1999-2016. Cox proportional hazards (PHs) regression models were used to estimate hazard ratios (HRs) for mortality. The Fine and Gray subdistribution hazard model was applied to account for competing risks in cardiovascular mortality. Population attributable fractions (PAFs) were calculated to assess the mortality burden associated with prehypertension and hypertension in this population. Prehypertension was defined as a systolic BP (SBP) of 120-139 mm Hg or a diastolic BP (DBP) of 80-89 mm Hg. All-cause and cardiovascular mortality were ascertained through linkage to the National Death Index (NDI) (up to 2019). <i>Results:</i> Among 18,271 participants (mean [SE] age, 28.6 [0.1] years; 49.6% female), the design-weighted prevalence was 23.9% for prehypertension and 14.3% for hypertension. Compared with normotensive individuals, the adjusted HRs for all-cause mortality were 1.82 (95% CI, 1.20-2.74) for prehypertension and 2.39 (95% CI, 1.50-3.81) for hypertension. The HRs for cardiovascular mortality were 1.37 (95% CI, 0.45-4.15) for prehypertension and 4.17 (95% CI, 1.51-11.51) for hypertension. The PAFs for all-cause mortality were 15.1% for individuals with prehypertension and 16.5% for those with hypertension. For cardiovascular mortality, the PAFs were 6.0% for prehypertension and 36.7% for hypertension. <i>Conclusions:</i> In this nationally representative cohort, prehypertension and hypertension were common among US young adults and associated with increased all-cause mortality. These findings highlight the need for early detection and management of high BP in young adults to reduce mortality risk.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:36.475Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "55d6ef99-7a48-444b-8b91-c66044d81ea0",
      "conditionId": "hypertension",
      "source": "epmc",
      "externalId": "10.64898/2026.07.22.26358725",
      "title": "Under Pressure: The Burden of Hypertension on Armenia’s Ambulance System",
      "journal": null,
      "url": "https://doi.org/10.64898/2026.07.22.26358725",
      "publishedAt": "2026-07-24",
      "grade": null,
      "finding": null,
      "abstract": "Hypertension is a leading cause of premature mortality globally. Armenia, a country located in the South Caucasus, has one of the highest rates of hypertension in the world, with an estimated prevalence of 51% among adults aged 30-79. A previous analysis of ambulance calls from 2016-2022 revealed that high blood pressure was the most common ambulance complaint in Armenia. In the present study, we analyzed a de-identified database of all ambulance calls logged on the Locator™ software in Armenia from January 1, 2016 to July 31, 2022. Among all adults who reported at least one chief complaint, 28.8% listed high blood pressure as their sole complaint. Within this cohort, 61.0% of patients were over 60 years old, and 70.1% of patients were women. The rate of transfer to the hospital was 9.2%. Call volume fluctuated by season, with higher frequencies in the winter and spring and lower frequencies in the summer and fall. Results indicate that a significant proportion of ambulance calls are for non-emergency cases of high blood pressure with no additional reported medical complaints, indicating that Armenia’s elevated prevalence of hypertension places a significant burden on its ambulance system. Policymakers should prioritize hypertension as a national issue, and consider multi-modal policy interventions aimed at reducing ambulance utilization for high blood pressure.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:36.475Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "bea9e73c-0695-46d0-bdbc-f4ce2832612f",
      "conditionId": "hypertension",
      "source": "epmc",
      "externalId": "10.1177/20420188261480541",
      "title": "Unrecognized primary aldosteronism may confound outcomes in adrenal Cushing's syndrome",
      "journal": "Ther Adv Endocrinol Metab",
      "url": "https://doi.org/10.1177/20420188261480541",
      "publishedAt": "2026-08-21",
      "grade": null,
      "finding": null,
      "abstract": "Patients with adrenal Cushing's syndrome may also have undiagnosed primary aldosteronism-a condition that causes high blood pressure and low potassium. Both hormone problems can arise from the same adrenal tumor. In a Colombian registry study of 130 patients, none of the 22 with adrenal Cushing's syndrome were screened for aldosterone excess before surgery. Because high blood pressure and low potassium occur in both conditions, some postoperative problems may be due to unrecognized aldosterone excess rather than cortisol alone. We suggest routine screening for primary aldosteronism in patients with adrenal Cushing's syndrome who have high blood pressure, as recommended by current guidelines, to enable more accurate diagnosis and personalized treatment.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:36.475Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "c1990e5e-31d9-4e68-80ab-c8cadf4cb958",
      "conditionId": "insulin_resistance",
      "source": "epmc",
      "externalId": "10.1111/jog.70480",
      "title": "Perinatal Changes in Serum Fibroblast Growth Factor 21 and Their Association With Postpartum Insulin Resistance in Women With Gestational Diabetes Mellitus",
      "journal": "J Obstet Gynaecol Res",
      "url": "https://doi.org/10.1111/jog.70480",
      "publishedAt": "2026-09-01",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Aim</h4>This study aimed to clarify the clinical significance of perinatal changes in fibroblast growth factor 21 and their association with postpartum metabolic outcomes in women with gestational diabetes mellitus.<h4>Methods</h4>This single-center retrospective observational study used prospectively collected residual serum samples to investigate longitudinal changes in serum fibroblast growth factor 21 concentrations at approximately 26 (T1) and 36 (T2) weeks of gestation and within 7 days postpartum (T3) in 45 women with gestational diabetes mellitus and 30 controls. Associations between fibroblast growth factor 21 concentrations and postpartum metabolic outcomes were evaluated in the gestational diabetes mellitus group.<h4>Results</h4>Serum fibroblast growth factor 21 concentrations increased significantly from T1 to T2 and remained elevated at T3, irrespective of gestational diabetes mellitus status, as assessed using the Friedman test with post hoc comparisons. In women with gestational diabetes mellitus, fibroblast growth factor 21 showed predictive performance for postpartum insulin resistance, as assessed using the homeostasis model assessment of insulin resistance. Receiver operating characteristic analysis showed the highest area under the curve for predicting postpartum insulin resistance at T1 (area under the curve, 0.871; bootstrap 95% confidence interval, 0.732-0.973). Fibroblast growth factor 21 concentrations appeared to decline during the early postpartum period, as indicated by significantly lower T3/T1 ratios in samples from postpartum Days 5-7 compared with those from Days 1-4.<h4>Conclusions</h4>These findings suggest that perinatal fibroblast growth factor 21 dynamics may reflect physiological changes in insulin sensitivity and that fibroblast growth factor 21 concentrations measured during pregnancy may serve as a complementary indicator for postpartum metabolic risk stratification in women with gestational diabetes mellitus. Further validation is needed before clinical application.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:35.803Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "e40c64c4-f7c3-40a4-a26d-db192a463c4d",
      "conditionId": "insulin_resistance",
      "source": "epmc",
      "externalId": "10.14814/phy2.71093",
      "title": "Sex differences in insulin resistance and associated metabolic and inflammatory markers among adults with and without HIV in Zambia",
      "journal": "Physiol Rep",
      "url": "https://doi.org/10.14814/phy2.71093",
      "publishedAt": "2026-09-01",
      "grade": null,
      "finding": null,
      "abstract": "Insulin resistance (IR) contributes substantially to cardiovascular disease and type 2 diabetes mellitus, with increasing concern among people living with HIV (PLWH). However, sex-specific factors of IR in sub-Saharan Africa remain poorly understood. This study evaluated sex-specific associations between IR and clinical, metabolic, and inflammatory markers among adults with and without HIV in Zambia. A cross-sectional study was conducted among 233 adults in Zambia. Insulin resistance was assessed using the Homeostatic Model Assessment for Insulin Resistance (HOMA-IR). Sex-stratified multivariable linear regression models were used to identify factors associated with IR. Females had higher body mass index (26.9 vs. 23.5 kg/m<sup>2</sup>, p < 0.001), waist circumference (88.3 vs. 83.2 cm, p = 0.008), fasting insulin, and HOMA-IR compared with males. In the adjusted overall model, female sex was associated with higher HOMA-IR (β = 0.95, 95% CI: 0.06-1.84; p = 0.037), while HIV-positive status was associated with lower HOMA-IR (β = -1.54, 95% CI: -3.06 to -0.02; p = 0.046). Among males, hypertension was associated with higher HOMA-IR (β = 0.61; p = 0.019), whereas among females, HIV-positive status was inversely associated with HOMA-IR (β = -2.31; p = 0.049). Insulin resistance highlighted sex-specific patterns, with greater metabolic risk among females and distinct clinical factors among males. Future studies incorporating lifestyle and hormonal factors are needed to clarify these relationships.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:35.803Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "40306d41-3af5-4a8e-90d9-8bfe0b65fc50",
      "conditionId": "insulin_resistance",
      "source": "epmc",
      "externalId": "10.1097/pn9.0000000000000143",
      "title": "Determining the mediation role of CRP and IL-6 for associations between carotenoids, vitamin A, and vitamin E and insulin resistance in elderly",
      "journal": "Precis Nutr",
      "url": "https://doi.org/10.1097/pn9.0000000000000143",
      "publishedAt": "2026-09-01",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Objectives</h4>This study aimed to investigate whether C-reactive protein (CRP) and interleukin-6 (IL-6) mediate the relationship between various antioxidants-specifically vitamin A, vitamin E isoforms, and carotenoids-and insulin resistance (IR).<h4>Methods</h4>We conducted a bias-corrected bootstrapping cross-sectional mediation analysis using biomarker data from the Midlife in the United States (MIDUS3) study (2017-2022). Antioxidants evaluated included Total lycopene, β-cryptoxanthin, retinol, and α- and γ-tocopherol. Insulin resistance was assessed using the Homeostatic Model Assessment for Insulin Resistance (HOMA-IR). CRP and IL-6 were included as mediators. Analyses were adjusted for age, sex, waist-hip ratio (WHR), smoking status, physical activity, dyslipidemia (assessed via Total to HDL cholesterol ratio), and dietary quality, with all continuous covariates mean-centered.<h4>Results</h4>The analytic sample comprised 747 participants (56% female; mean age, 66 years; SD = 9.6). After adjustment, higher Total lycopene and β-cryptoxanthin levels were significantly associated with lower HOMA-IR, with no evidence of mediation by CRP or IL-6. In contrast, γ-tocopherol was associated with higher HOMA-IR, an effect partially mediated by elevated CRP (percent change per 10-unit increase: 7.79%; 95% CI: 2.12 to 18.53). Retinol showed significant indirect mediating associations through reduced CRP (-31.48%; 95% CI: -50.24 to -13.50) and IL-6 (-15.46%; 95% CI: -33.57 to-1.49), though these effects did not yield a significant total association. However, α-tocopherol didn't demonstrate a significant indirect or total association.<h4>Conclusion</h4>Among older adults, γ-tocopherol was positively associated with insulin resistance, partially mediated by CRP, whereas β-cryptoxanthin and lycopene were inversely associated with HOMA-IR without a significant mediation for inflammatory markers. Although retinol reduced insulin resistance via reduced inflammatory markers, its overall association with insulin resistance was not significant.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:35.803Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "6224bb62-f4ab-4737-a643-a4ed16ffee86",
      "conditionId": "insulin_resistance",
      "source": "epmc",
      "externalId": "10.1016/j.jdiacomp.2026.109360",
      "title": "Brain insulin resistance: A link between obstructive sleep apnea and cognitive impairment",
      "journal": "J Diabetes Complications",
      "url": "https://doi.org/10.1016/j.jdiacomp.2026.109360",
      "publishedAt": "2026-08-22",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Objectives</h4>Insulin resistance has been an established risk factor for cognitive impairment. Patients with moderate to severe obstructive sleep apnea (OSA) are at an increased risk of insulin resistance. However, the correlation between insulin resistance and cognitive impairment in OSA has not yet been confirmed. This study aims to investigate the relationship between brain insulin resistance and mild cognitive impairment (MCI) in patients with OSA.<h4>Methods</h4>A total of 284 participants with complete clinical data were evaluated at baseline. Brain insulin resistance was assessed using phosphorylated insulin receptor substrate-1 (phospho-IRS-1) and IRS-1 phosphorylation at serine site 312 (pS312-IRS-1) from neuron-derived exosomes isolated by co-immunoprecipitation, while peripheral insulin resistance was evaluated using the triglyceride-glucose (TyG) index. Follow-up measurements of phospho-IRS-1 and pS312-IRS-1 were obtained in 23 patients after weight loss and in 23 patients after continuous positive airway pressure (CPAP) therapy.<h4>Results</h4>Higher TyG index, phospho-IRS-1, and pS312-IRS-1 levels were associated with an increased risk of cognitive impairment in OSA. Poor cognitive performance correlated with higher phospho-IRS-1 and pS312-IRS-1 levels but not the TyG index. Exploratory mediation models suggested that phospho-IRS-1 and pS312-IRS-1 may partly account for the association between hypoxia and cognitive impairment in OSA, with mediated proportions ranging from 79.64% to 252.03%. Areas under the receiver-operating characteristic curve for insulin resistance-associated proteins ranged from 0.775 to 0.914. Weight loss reduced the phospho-IRS-1 and pS312-IRS-1 levels, while CPAP therapy did not significantly change the phospho-IRS-1 or pS312-IRS-1 levels.<h4>Conclusions</h4>This study provides evidence of brain insulin resistance in OSA, which has an essential effect on intermittent hypoxia-mediated cognitive impairment. Insulin sensitivity is improved with weight reduction but not CPAP therapy. Brain insulin resistance represents a potential target for early intervention in OSA.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:35.803Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "990d7c60-3e40-4930-ac12-6e453f422f7e",
      "conditionId": "insulin_resistance",
      "source": "epmc",
      "externalId": "10.1007/s00592-026-02795-1",
      "title": "Exploring the therapeutic response to sodium-glucose cotransporter-2 inhibition in INSR-related insulin resistance monogenic diabetes: case-based analysis and narrative review",
      "journal": "Acta Diabetol",
      "url": "https://doi.org/10.1007/s00592-026-02795-1",
      "publishedAt": "2026-09-01",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Background</h4>INSR-related insulin resistance is a form of monogenic diabetes caused by pathogenic variants in the INSR gene, resulting in impaired insulin receptor signalling and a spectrum of insulin resistance. Conventional diabetes management strategies relying on insulin sensitisation or augmentation are often less effective and evidence to guide treatment in those with heterozygous INSR mutations remains limited.<h4>Index case analysis</h4>A 63-year-old male diagnosed with type 2 diabetes aged 40 presented with a relatively stable fasting glucose and disproportionate postprandial hyperglycaemia despite prandial insulin. He had bilateral asymmetric mixed hearing loss (conductive/sensorineural) and early cardiovascular disease. C-peptide was preserved at 1.3 nmol/L with serum glucose at 7.1 mmol/L. Monogenic diabetes genetic testing identified a heterozygous likely pathogenic variant (i.e. mutation) in INSR (c.3473G > A, (p.Arg1158Gln)). Treatment with a sodium-glucose cotransporter-2 inhibitor (SGLT2 inhibitor) achieved 78% time-in-range (TIR). Subsequent SGLT2 inhibitor withdrawal for four months due to pyelonephritis led to TIR deterioration to 2% despite intensified basal insulin. Berberine initiation produced modest improvement (TIR 24%). Following re-introduction of the SGLT2 inhibitor, TIR rapidly improved to 85%, with restoration of a stable overnight profile.<h4>Literature review</h4>A narrative review identified eight cases with INSR-related insulin resistance (Donohue/Rabson-Mendenhall/type A insulin resistance) treated with a SGLT2 inhibitor. All reports documented clinically meaningful HbA1c reductions (1.4-3.6%) and, where available, improved CGM metrics.<h4>Conclusions</h4>SGLT2 inhibitors provide insulin-independent glycaemic benefit in INSR-related insulin resistance. AMPK-activating strategies, including metformin, berberine, and exercise, may provide adjunctive benefit via cellular glucose uptake, although evidence remains limited. We propose a two-factor therapeutic framework targeting (1) insulin-independent glucosuria and (2) AMPK-mediated glucose uptake as a rational management approach for this rare form of diabetes.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:35.803Z",
      "seenAt": null,
      "dismissedAt": null
    },
    {
      "id": "daf2052c-d99e-424f-a26f-e426a42871a3",
      "conditionId": "ascvd_risk",
      "source": "epmc",
      "externalId": "10.1111/ijpo.70148",
      "title": "Hepatic Steatosis and Cardiovascular Risk in Obesity: A 10-Year Follow-Up Study From Childhood Into Young Adulthood",
      "journal": "Pediatr Obes",
      "url": "https://doi.org/10.1111/ijpo.70148",
      "publishedAt": "2026-09-01",
      "grade": null,
      "finding": null,
      "abstract": "<h4>Background</h4>The early vascular impact of metabolic dysfunction-associated steatotic liver disease (MASLD) remains unclear. This study examined associations of steatosis in childhood and young adulthood with cardiovascular risk in adulthood.<h4>Methods</h4>Children with severe obesity were investigated for MASLD and cardiovascular risk, with 10-year follow-up. Hepatic steatosis was measured using proton magnetic resonance spectroscopy and cardiovascular risk by ultrasound carotid intima-media thickness (cIMT). Participants were categorised into four trajectory groups based on presence of steatosis in childhood and/or adulthood: 'absent', 'diminishing', 'adult-onset' and 'persistent'. Associations between steatosis (presence and change over time) and cIMT, and between childhood metabolic factors and cIMT progression, were evaluated.<h4>Results</h4>Of 52 participants, 46% had steatosis in childhood ('diminishing' or 'persistent'), and 46% in adulthood ('adult-onset' or 'persistent'). Childhood steatosis was not associated with cIMT in adulthood, whereas adulthood steatosis was independently associated with increased cIMT (mean difference 0.035 mm, 95% CI: 0.010-0.060 mm; p-adjusted = 0.008). Mean cIMT at follow-up increased progressively across steatosis trajectory groups; (adjusted p-for-trend = 0.003). Childhood steatosis was the only metabolic factor associated with cIMT progression (β = 0.006, p = 0.030).<h4>Conclusions</h4>Hepatic steatosis in young adulthood is independently associated with increased cardiovascular risk, and childhood steatosis relates to cIMT progression, supporting early MASLD detection and prevention.",
      "moves": null,
      "foundAt": "2026-09-03T07:51:37.375Z",
      "seenAt": "2026-09-03T07:56:48.706Z",
      "dismissedAt": null
    }
  ]
}
"""#,
        "today": #"""
{
  "sentence": {
    "head": "Insulin resistance:",
    "tail": "possible",
    "tone": "bad"
  },
  "status": {
    "off": 6,
    "borderline": 22,
    "optimal": 82,
    "drawDate": "2026-04-23",
    "since": "2026-09-02"
  },
  "body": {
    "headline": "31.8",
    "unit": "years",
    "line": "PhenoAge · at 39"
  },
  "blood": {
    "off": 6,
    "total": 110,
    "nextDraw": {
      "weeks": 13,
      "codes": [
        {
          "code": "ldl_cholesterol",
          "name": "LDL cholesterol"
        }
      ]
    }
  },
  "plan": {
    "headline": "0 / 4",
    "todo": 4,
    "next": "Resistance training twice a week"
  },
  "systems": [
    {
      "id": "lipids",
      "name": "Lipids",
      "word": "off",
      "value": 50,
      "unit": "mg/dL",
      "marker": "HDL cholesterol"
    },
    {
      "id": "metabolic",
      "name": "Blood sugar and insulin",
      "word": "borderline",
      "value": 87,
      "unit": "mg/dL",
      "marker": "Fasting glucose"
    },
    {
      "id": "blood",
      "name": "Blood count",
      "word": "borderline",
      "value": 13.1,
      "unit": "%",
      "marker": "RDW"
    },
    {
      "id": "vitamins",
      "name": "Vitamins",
      "word": "borderline",
      "value": 472,
      "unit": "pg/mL",
      "marker": "Vitamin B12"
    },
    {
      "id": "liver",
      "name": "Liver",
      "word": "borderline",
      "value": 85.33,
      "unit": "U/L",
      "marker": "Alkaline phosphatase"
    },
    {
      "id": "thyroid",
      "name": "Thyroid",
      "word": "borderline",
      "value": 4.17,
      "unit": "pg/mL",
      "marker": "Free T3"
    },
    {
      "id": "adrenal",
      "name": "Stress hormones",
      "word": "borderline",
      "value": 16.29,
      "unit": "mcg/dL",
      "marker": "Cortisol"
    },
    {
      "id": "inflammation",
      "name": "Inflammation",
      "word": "good",
      "value": 0.64,
      "unit": "mg/L",
      "marker": "CRP"
    },
    {
      "id": "kidney",
      "name": "Kidneys",
      "word": "good",
      "value": 0.9,
      "unit": "mg/dL",
      "marker": "Creatinine"
    },
    {
      "id": "sex_hormones",
      "name": "Sex hormones",
      "word": "good",
      "value": 29,
      "unit": "pg/mL",
      "marker": "Estradiol"
    },
    {
      "id": "iron",
      "name": "Iron",
      "word": "good",
      "value": 79.6,
      "unit": "ng/mL",
      "marker": "Ferritin"
    },
    {
      "id": "lifestyle",
      "name": "Lifestyle",
      "word": "never measured",
      "value": null,
      "unit": null,
      "marker": null
    }
  ]
}
"""#,
    ]
    #endif
}
