/**
 * Population priors into `hkb_priors`.
 *
 *   pnpm --filter simple hkb:import:priors
 *   pnpm --filter simple hkb:import:priors --offline   # 200-row fixtures
 *
 * Two sources.
 *
 * 1. NCD-RisC, open and free, no login. Checked 2026-08-28; the download index
 *    moved from ncdrisc.org/data-downloads.html (that URL now redirects to a
 *    registration form) to one page per topic, linked from
 *    https://ncdrisc.org/data-downloads-base.html. The three country files:
 *
 *    - hypertension, country × sex × 5-year age band × year
 *      https://ncdrisc.org/downloads/hypertension/NCD-RisC_Lancet_2021_Hypertension_age_specific_estimates_by_country.csv
 *    - diabetes, country × sex × year, crude 18+
 *      https://ncdrisc.org/downloads/dm-2024/NCD_RisC_Lancet_2024_Diabetes_crude_countries.csv
 *    - BMI, country × sex × year, age-standardised, with a BMI ≥ 30 column
 *      https://ncdrisc.org/downloads/bmi-2026/adult/NCD_RisC_Nature_2026_BMI_age_standardised_country.csv
 *
 *    Only the most recent year in each file is imported. The obesity column
 *    becomes an `insulin_resistance` prior through a documented factor (see
 *    IR_FROM_OBESITY below); that row is graded C on purpose.
 *
 * 2. GBD. The IHME results tool needs a login, so there is no download here.
 *    Export the query below yourself and drop the CSV at
 *    `data/hkb/gbd-prevalence.csv`; this script picks it up and skips silently
 *    when it is not there.
 *
 *      https://vizhub.healthdata.org/gbd-results/
 *      GBD Estimate: Cause of death or injury · Measure: Prevalence ·
 *      Metric: Rate (per 100 000) or Percent · Cause: the ones in GBD_CAUSES
 *      below · Location: all countries · Age: 20+ five-year bands ·
 *      Sex: Male, Female · Year: the latest.
 *      Columns as exported: location, sex, age, cause, metric, val.
 *
 * Idempotent: every row is an upsert on (condition, country, sex, age band).
 */
import { getDb, hkbPriors } from "@/db";
import { fromIso3 } from "@/lib/countries";
import {
  CACHE,
  columnOf,
  offline,
  readCsv,
  recordRun,
  source,
  took,
} from "@/lib/hkb-import";
import path from "node:path";
import { stat } from "node:fs/promises";

const NCDRISC = "https://ncdrisc.org";

/**
 * How many adults are insulin-resistant for every adult with a BMI ≥ 30.
 *
 * Grade C, and it is an assumption rather than a measured ratio: obesity is
 * the largest single driver of insulin resistance, but HOMA-IR-defined
 * resistance also covers metabolically unhealthy normal-weight adults, so the
 * count is larger than the obesity count. 1.5 is the figure this app uses
 * until a country-level HOMA-IR dataset exists.
 */
const IR_FROM_OBESITY = 1.5;

interface Row {
  conditionId: string;
  country: string | null;
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  prevalence: number;
  source: string;
}

const FILES = {
  hypertension: {
    name: "ncdrisc-hypertension-age-specific-countries.csv",
    url: `${NCDRISC}/downloads/hypertension/NCD-RisC_Lancet_2021_Hypertension_age_specific_estimates_by_country.csv`,
    referer: `${NCDRISC}/data-downloads-hypertension.html`,
  },
  diabetes: {
    name: "ncdrisc-diabetes-crude-countries.csv",
    url: `${NCDRISC}/downloads/dm-2024/NCD_RisC_Lancet_2024_Diabetes_crude_countries.csv`,
    referer: `${NCDRISC}/data-downloads-diabetes.html`,
  },
  bmi: {
    name: "ncdrisc-bmi-age-standardised-countries.csv",
    url: `${NCDRISC}/downloads/bmi-2026/adult/NCD_RisC_Nature_2026_BMI_age_standardised_country.csv`,
    referer: `${NCDRISC}/data-downloads-adiposity.html`,
  },
};

const sexOf = (raw: string): string | null =>
  raw === "Men" ? "male" : raw === "Women" ? "female" : null;

/** "30-34" → [30, 34]; "Crude" and "Age-standardised" mean "all adults". */
function ageOf(raw: string): [number | null, number | null] {
  const hit = raw.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (hit) return [Number(hit[1]), Number(hit[2])];
  const plus = raw.match(/^(\d+)\+$/);
  if (plus) return [Number(plus[1]), null];
  return [18, null];
}

/** Every row of the file that is in the newest year it covers. */
function latestYear(
  rows: string[][],
  yearAt: number,
): { year: string; rows: string[][] } {
  const year = rows.reduce(
    (best, r) => (r[yearAt]! > best ? r[yearAt]! : best),
    "",
  );
  return { year, rows: rows.filter((r) => r[yearAt] === year) };
}

async function ncdRisc(): Promise<Row[]> {
  const out: Row[] = [];

  const htnFile = await source(
    FILES.hypertension.url,
    FILES.hypertension.name,
    FILES.hypertension.referer,
  );
  const htn = await readCsv(htnFile);
  const hIso = columnOf(htn.header, "ISO");
  const hSex = columnOf(htn.header, "Sex");
  const hYear = columnOf(htn.header, "Year");
  const hAge = columnOf(htn.header, "Age");
  const hVal = columnOf(htn.header, "Prevalence of hypertension");
  const htnLatest = latestYear(htn.rows, hYear);
  for (const r of htnLatest.rows) {
    const country = fromIso3(r[hIso] ?? "");
    const sex = sexOf(r[hSex] ?? "");
    const value = Number(r[hVal]);
    if (!country || !sex || !Number.isFinite(value)) continue;
    const [ageMin, ageMax] = ageOf(r[hAge] ?? "");
    out.push({
      conditionId: "hypertension",
      country,
      sex,
      ageMin,
      ageMax,
      prevalence: value,
      source: `NCD-RisC Lancet 2021 hypertension, ${r[hIso]} ${r[hSex]} ${r[hAge]} ${htnLatest.year} (A).`,
    });
  }

  const dmFile = await source(
    FILES.diabetes.url,
    FILES.diabetes.name,
    FILES.diabetes.referer,
  );
  const dm = await readCsv(dmFile);
  const dIso = columnOf(dm.header, "ISO");
  const dSex = columnOf(dm.header, "Sex");
  const dYear = columnOf(dm.header, "Year");
  const dVal = columnOf(dm.header, "Prevalence of diabetes");
  const dmLatest = latestYear(dm.rows, dYear);
  for (const r of dmLatest.rows) {
    const country = fromIso3(r[dIso] ?? "");
    const sex = sexOf(r[dSex] ?? "");
    const value = Number(r[dVal]);
    if (!country || !sex || !Number.isFinite(value)) continue;
    out.push({
      conditionId: "type2_diabetes",
      country,
      sex,
      ageMin: 18,
      ageMax: null,
      prevalence: value,
      source: `NCD-RisC Lancet 2024 diabetes, crude 18+, ${r[dIso]} ${r[dSex]} ${dmLatest.year} (A).`,
    });
  }

  const bmiFile = await source(
    FILES.bmi.url,
    FILES.bmi.name,
    FILES.bmi.referer,
  );
  const bmi = await readCsv(bmiFile);
  const bIso = columnOf(bmi.header, "ISO");
  const bSex = columnOf(bmi.header, "Sex");
  const bYear = columnOf(bmi.header, "Year");
  const bVal = columnOf(bmi.header, "Prevalence of BMI>=30");
  const bmiLatest = latestYear(bmi.rows, bYear);
  for (const r of bmiLatest.rows) {
    const country = fromIso3(r[bIso] ?? "");
    const sex = sexOf(r[bSex] ?? "");
    const value = Number(r[bVal]);
    if (!country || !sex || !Number.isFinite(value)) continue;
    out.push({
      conditionId: "insulin_resistance",
      country,
      sex,
      ageMin: 18,
      ageMax: null,
      prevalence: Math.min(0.9, value * IR_FROM_OBESITY),
      source:
        `NCD-RisC Nature 2026 obesity (BMI ≥ 30) ${r[bIso]} ${r[bSex]} ${bmiLatest.year}, ` +
        `× ${IR_FROM_OBESITY} as a stand-in for insulin resistance (grade C: the factor is this app's ` +
        `documented assumption, not a measured ratio; obesity is the largest driver but resistance ` +
        `also occurs at a normal BMI).`,
    });
  }

  return out;
}

/**
 * The GBD causes this app knows how to place. Everything else in the export is
 * ignored, so a wider query is harmless.
 */
const GBD_CAUSES: Record<string, string> = {
  "chronic kidney disease": "ckd",
  "diabetes mellitus type 2": "type2_diabetes",
  "diabetes mellitus": "type2_diabetes",
  "ischemic heart disease": "ascvd_risk",
  "depressive disorders": "depression",
  "major depressive disorder": "depression",
  "alcohol use disorders": "alcohol_use_disorder",
  "dietary iron deficiency": "iron_deficiency",
  gout: "gout_hyperuricaemia",
  "cirrhosis and other chronic liver diseases due to hepatitis b":
    "hepatitis_bc",
  "cirrhosis and other chronic liver diseases due to hepatitis c":
    "hepatitis_bc",
};

/** `data/hkb/gbd-prevalence.csv` if it is there. Silent when it is not. */
async function gbd(): Promise<Row[]> {
  const file = path.join(CACHE, "gbd-prevalence.csv");
  if (!(await stat(file).catch(() => null))) return [];
  const { header, rows } = await readCsv(file);
  const at = {
    location: columnOf(header, "location"),
    sex: columnOf(header, "sex"),
    age: columnOf(header, "age"),
    cause: columnOf(header, "cause"),
    metric: columnOf(header, "metric"),
    val: columnOf(header, "val"),
  };
  if (Object.values(at).some((i) => i === -1)) return [];

  const out: Row[] = [];
  for (const r of rows) {
    const conditionId = GBD_CAUSES[(r[at.cause] ?? "").trim().toLowerCase()];
    if (!conditionId) continue;
    const raw = Number(r[at.val]);
    if (!Number.isFinite(raw)) continue;
    const metric = (r[at.metric] ?? "").toLowerCase();
    const prevalence = metric.includes("percent")
      ? raw / 100
      : metric.includes("rate")
        ? raw / 100_000
        : raw;
    const sexRaw = (r[at.sex] ?? "").toLowerCase();
    const [ageMin, ageMax] = ageOf(
      (r[at.age] ?? "").replace(" years", "").trim(),
    );
    out.push({
      conditionId,
      country: null,
      sex: sexRaw === "male" ? "male" : sexRaw === "female" ? "female" : null,
      ageMin,
      ageMax,
      prevalence: Math.min(0.9, Math.max(0.0001, prevalence)),
      source: `GBD ${r[at.cause]} ${r[at.location]} ${r[at.sex]} ${r[at.age]} (${r[at.metric]}) (A).`,
    });
  }
  return out;
}

export async function importPriors() {
  const started = Date.now();
  const rows = [...(await ncdRisc()), ...(await gbd())];
  const db = getDb();
  const counts: Record<string, number> = {};

  for (const row of rows) {
    counts[row.conditionId] = (counts[row.conditionId] ?? 0) + 1;
    await db
      .insert(hkbPriors)
      .values(row)
      .onConflictDoUpdate({
        target: [
          hkbPriors.conditionId,
          hkbPriors.country,
          hkbPriors.sex,
          hkbPriors.ageMin,
          hkbPriors.ageMax,
        ],
        set: { prevalence: row.prevalence, source: row.source },
      });
  }

  const ms = Date.now() - started;
  await recordRun(
    "hkb-import-priors",
    { ...counts, total: rows.length },
    `${offline() ? "offline fixtures" : "NCD-RisC"}, ${took(ms)}`,
  );
  return { counts, total: rows.length, ms };
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  for (const f of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
  const { pool } = await import("@/db");
  importPriors()
    .then((r) => {
      console.log(
        `[hkb:import:priors] ${r.total} rows in ${took(r.ms)} — ` +
          Object.entries(r.counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(" "),
      );
    })
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
