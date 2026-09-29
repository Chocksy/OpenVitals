/**
 * Phase 41A item 9: repair what the old pipelines left in `readings`.
 *
 *   pnpm repair:readings [--user <id>] [--apply]
 *
 * Dry run by default. Every step runs inside one transaction per user and
 * prints each change as it makes it; without `--apply` the transaction is
 * rolled back, so the dry run prints exactly what `--apply` would do, later
 * steps seeing the earlier ones. A second `--apply` finds nothing to do.
 *
 * The steps, in order:
 *  1. `globulin` rows in IU/mL are anti-thyroglobulin (legacy alias mix-up);
 *  2. `atypical_lymphocytes_abs(olute)` rows in the plain lymphocyte range are
 *     absolute lymphocyte counts (the phase 39 "z = 107" noise);
 *  3. unresolved legacy `flagged_extractions` whose metric, unit and value
 *     resolve cleanly are imported; the rest are listed with the reason;
 *  4. rows with no upload are linked to the one upload of that user and day;
 *  5. exact duplicates (metric, day, value) go, keeping the row with an upload;
 *  6. `uploads.readings_count` is recounted where it drifted.
 *
 * Reads `flagged_extractions` and `import_jobs`, never writes them.
 */
import type { PoolClient } from "pg";
import { pool } from "@/db";
import { slugify } from "@/lib/extract";
import {
  CANONICAL_BY_NAME,
  canonicalCode,
  normalizeName,
} from "@/lib/merge-metrics";
import { conversionFactor, normalizeUnit, round } from "@/lib/units";

export interface MetricRow {
  code: string;
  name: string;
  unit: string | null;
  aliases: string[] | null;
}

const COUNT_UNITS = new Set(["/mm3", "10^3/ul", "10^9/l", "/ul", "10^6/ul"]);

/** Pure: a legacy analyte name and unit onto a catalog metric, or why not. */
export function resolveLegacy(
  analyte: string,
  unit: string | null,
  metrics: MetricRow[],
): { code: string; factor: number } | { reason: string } {
  const byCode = new Map(metrics.map((m) => [m.code, m]));
  const index = new Map<string, string>();
  for (const m of metrics)
    for (const n of [m.code.replace(/_/g, " "), m.name, ...(m.aliases ?? [])])
      if (!index.has(normalizeName(n))) index.set(normalizeName(n), m.code);

  const u = normalizeUnit(unit);
  // "Lymphocytes /mm³" is the absolute count, "Lymphocytes %" the share.
  const names = COUNT_UNITS.has(u)
    ? [`${analyte} abs`, analyte]
    : u === "%"
      ? [`${analyte} pct`, analyte]
      : [analyte];
  const candidates: string[] = [];
  for (const n of names)
    for (const code of [
      index.get(normalizeName(n)),
      CANONICAL_BY_NAME[normalizeName(n)],
      canonicalCode(slugify(n), n),
    ])
      if (code && byCode.has(code) && !candidates.includes(code))
        candidates.push(code);
  if (!candidates.length) return { reason: `no metric for "${analyte}"` };

  for (const code of candidates) {
    const m = byCode.get(code)!;
    const factor = !m.unit && !u ? 1 : conversionFactor(unit, m.unit, code);
    if (factor != null) return { code, factor };
  }
  const m = byCode.get(candidates[0]!)!;
  return {
    reason: `unit ${unit ?? "(none)"} does not convert to ${m.code} (${m.unit ?? "no unit"})`,
  };
}

/** Pure: a value far off this person's own history is a unit mix-up. */
export const implausible = (value: number, history: number[]) => {
  if (!history.length) return false;
  const s = [...history].sort((a, b) => a - b);
  const median = s[Math.floor(s.length / 2)]!;
  if (median <= 0) return false;
  return value / median > 10 || value / median < 0.1;
};

/** Pure: which absolute count an `atypical_lymphocytes_abs` row really is. */
export function lymphocyteCount(
  value: number | null,
  unit: string | null,
): number | null {
  if (value == null) return null;
  const u = normalizeUnit(unit);
  if ((u === "10^3/ul" || u === "10^9/l") && value >= 0.5 && value <= 5)
    return value;
  if ((u === "/mm3" || u === "/ul") && value >= 500 && value <= 5000)
    return round(value / 1000);
  return null;
}

/** Within 2 %, the curator's own tolerance. */
const agrees = (a: number | null, b: number | null) =>
  a != null && b != null && Math.abs(a - b) <= 0.02 * Math.max(a, b, 1e-9);

interface Out {
  changes: number;
  listed: number;
}

async function dropReading(c: PoolClient, id: string) {
  await c.query("delete from review_items where subject->>'readingId' = $1", [
    id,
  ]);
  await c.query("delete from readings where id = $1", [id]);
}

/** The one upload a day's rows belong to, skipping deleted and replaced ones. */
const LIVE_UPLOAD = `(select id from uploads where status <> 'deleted'
                        and doc_meta->>'supersededBy' is null)`;

async function repairUser(
  c: PoolClient,
  userId: string,
  metrics: MetricRow[],
): Promise<Out> {
  const out: Out = { changes: 0, listed: 0 };
  const change = (s: string) => {
    out.changes++;
    console.log(`  + ${s}`);
  };
  const list = (s: string) => {
    out.listed++;
    console.log(`  - ${s}`);
  };

  /* 1. globulin in IU/mL is anti-thyroglobulin */
  const glob = (
    await c.query(
      `select id, value, unit, observed_at::text as day from readings
        where user_id = $1 and metric_code = 'globulin'`,
      [userId],
    )
  ).rows.filter((r) => normalizeUnit(r.unit) === "u/ml");
  for (const r of glob) {
    const twin = (
      await c.query(
        `select id, value from readings where user_id = $1
            and metric_code = 'anti_thyroglobulin' and observed_at = $2`,
        [userId, r.day],
      )
    ).rows;
    if (twin.some((t) => agrees(t.value, r.value))) {
      await dropReading(c, r.id);
      change(
        `${r.day} globulin ${r.value} ${r.unit}: duplicate of anti_thyroglobulin, removed`,
      );
    } else if (twin.length) {
      list(
        `${r.day} globulin ${r.value} ${r.unit}: anti_thyroglobulin ${twin[0].value} already that day, left alone`,
      );
    } else {
      await c.query(
        `update readings set metric_code = 'anti_thyroglobulin', unit = 'IU/mL',
                flags = coalesce(flags, '[]'::jsonb) || $2::jsonb where id = $1`,
        [
          r.id,
          JSON.stringify([
            { moved: { from: "globulin", refLow: null, refHigh: null } },
          ]),
        ],
      );
      change(`${r.day} globulin ${r.value} ${r.unit} → anti_thyroglobulin`);
    }
  }

  /* 2. atypical lymphocytes that are the plain absolute count */
  const atyp = (
    await c.query(
      `select id, metric_code, value, unit, ref_low, ref_high, observed_at::text as day
         from readings where user_id = $1
          and metric_code in ('atypical_lymphocytes_abs', 'atypical_lymphocytes_absolute')
        order by observed_at`,
      [userId],
    )
  ).rows;
  for (const r of atyp) {
    const count = lymphocyteCount(r.value, r.unit);
    if (count == null) {
      list(
        `${r.day} ${r.metric_code} ${r.value} ${r.unit ?? ""}: outside the lymphocyte range, kept as atypical`,
      );
      continue;
    }
    const twin = (
      await c.query(
        `select id, value from readings where user_id = $1
            and metric_code = 'lymphocytes_abs' and observed_at = $2`,
        [userId, r.day],
      )
    ).rows;
    if (twin.some((t) => agrees(t.value, count))) {
      await dropReading(c, r.id);
      change(
        `${r.day} ${r.metric_code} ${r.value}: duplicate of lymphocytes_abs, removed`,
      );
    } else if (twin.length) {
      list(
        `${r.day} ${r.metric_code} ${r.value}: lymphocytes_abs ${twin[0].value} already that day, left alone`,
      );
    } else {
      const scale = count === r.value ? 1 : 1 / 1000;
      await c.query(
        `update readings set metric_code = 'lymphocytes_abs', value = $2, unit = 'K/uL',
                ref_low = $3, ref_high = $4,
                flags = coalesce(flags, '[]'::jsonb) || $5::jsonb where id = $1`,
        [
          r.id,
          count,
          r.ref_low == null ? null : round(r.ref_low * scale),
          r.ref_high == null ? null : round(r.ref_high * scale),
          JSON.stringify([
            {
              moved: {
                from: r.metric_code,
                refLow: r.ref_low,
                refHigh: r.ref_high,
              },
            },
            ...(scale === 1
              ? []
              : [{ orig: { value: r.value, unit: r.unit } }]),
          ]),
        ],
      );
      change(
        `${r.day} ${r.metric_code} ${r.value} ${r.unit ?? ""} → lymphocytes_abs ${count} K/uL`,
      );
    }
  }

  /* 3. the legacy flagged extractions nothing ever imported */
  const flagged = (
    await c.query(
      `select f.id, f.analyte, f.value_numeric, f.value_text, f.unit,
              f.reference_range_low, f.reference_range_high,
              f.observed_at::text as day, f.flag_reason, j.source_artifact_id
         from flagged_extractions f join import_jobs j on j.id = f.import_job_id
        where f.user_id = $1 and not f.resolved
        order by f.observed_at, f.analyte`,
      [userId],
    )
  ).rows;
  let already = 0;
  for (const f of flagged) {
    const what =
      `${f.day} ${f.analyte} ${f.value_text ?? f.value_numeric ?? ""} ${f.unit ?? ""}`.replace(
        /\s+/g,
        " ",
      );
    if (f.value_numeric == null || !f.day) {
      list(`${what}: no number, not imported`);
      continue;
    }
    const hit = resolveLegacy(f.analyte, f.unit, metrics);
    if ("reason" in hit) {
      list(`${what}: ${hit.reason}`);
      continue;
    }
    const m = metrics.find((x) => x.code === hit.code)!;
    const value = round(f.value_numeric * hit.factor);
    const stored = (
      await c.query(
        `select value from readings where user_id = $1 and metric_code = $2
            and observed_at = $3`,
        [userId, hit.code, f.day],
      )
    ).rows;
    if (stored.length) {
      already++;
      continue;
    }
    const history = (
      await c.query(
        `select value from readings where user_id = $1 and metric_code = $2
            and value is not null`,
        [userId, hit.code],
      )
    ).rows.map((r) => Number(r.value));
    if (implausible(value, history)) {
      list(
        `${what}: ${value} ${m.unit ?? ""} is far off this person's ${hit.code} history, not imported`,
      );
      continue;
    }
    // The file's upload, or the upload that replaced it.
    const upload =
      (
        await c.query(
          `select coalesce(doc_meta->>'supersededBy', id::text) as id from uploads
          where id = $1 and status <> 'deleted'`,
          [f.source_artifact_id],
        )
      ).rows[0]?.id ?? null;
    const scale = (v: number | null) =>
      v == null ? null : round(v * hit.factor);
    await c.query(
      `insert into readings (user_id, upload_id, metric_code, value, value_text, unit,
                             ref_low, ref_high, observed_at, flags)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        upload,
        hit.code,
        value,
        f.value_text,
        m.unit ?? f.unit,
        scale(f.reference_range_low),
        scale(f.reference_range_high),
        f.day,
        JSON.stringify([
          "legacy_flagged",
          ...(hit.factor === 1
            ? []
            : [{ orig: { value: f.value_numeric, unit: f.unit } }]),
        ]),
      ],
    );
    change(
      `${what} → ${hit.code} ${value} ${m.unit ?? ""} (flagged ${f.flag_reason})`,
    );
  }
  if (already)
    console.log(
      `  = ${already} flagged extractions already have a reading that day`,
    );

  /* 4. rows with no upload, onto the one upload of that day */
  const loose = (
    await c.query(
      `select r.id, r.metric_code, r.observed_at::text as day,
              array_agg(distinct o.upload_id::text) filter (where o.upload_id is not null) as ups
         from readings r
         left join readings o on o.user_id = r.user_id and o.observed_at = r.observed_at
              and o.upload_id in ${LIVE_UPLOAD}
              and not coalesce(o.flags, '[]'::jsonb) @> '["antecedent"]'::jsonb
        where r.user_id = $1 and r.upload_id is null and r.source is null
        group by r.id, r.metric_code, r.observed_at
        order by r.observed_at`,
      [userId],
    )
  ).rows;
  for (const r of loose) {
    const ups: string[] = r.ups ?? [];
    if (ups.length === 1) {
      await c.query("update readings set upload_id = $2 where id = $1", [
        r.id,
        ups[0],
      ]);
      change(`${r.day} ${r.metric_code}: linked to upload ${ups[0]}`);
    } else
      list(
        `${r.day} ${r.metric_code}: no upload linked (${ups.length} uploads that day)`,
      );
  }

  /* 5. exact duplicates: keep the row with an upload, the newest upload first */
  const dupes = (
    await c.query(
      `select id, metric_code, observed_at::text as day, value, value_text, rn
         from (select r.id, r.metric_code, r.observed_at, r.value, r.value_text,
                      row_number() over (
                        partition by r.metric_code, r.observed_at, r.value,
                                     case when r.value is null then r.value_text end
                        order by (r.upload_id is null), u.created_at desc nulls last,
                                 r.created_at, r.id) as rn
                 from readings r left join uploads u on u.id = r.upload_id
                where r.user_id = $1 and r.source is null) x
        where rn > 1 order by observed_at, metric_code`,
      [userId],
    )
  ).rows;
  for (const d of dupes) {
    await dropReading(c, d.id);
    change(
      `${d.day} ${d.metric_code} ${d.value ?? d.value_text}: exact duplicate removed`,
    );
  }

  /* 6. the denormalised count */
  const drift = (
    await c.query(
      `update uploads u set readings_count = n.n
         from (select u2.id, (select count(*)::int from readings r where r.upload_id = u2.id) as n
                 from uploads u2 where u2.user_id = $1 and u2.kind = 'lab') n
        where u.id = n.id and u.readings_count is distinct from n.n
        returning u.id, u.file_name, u.readings_count`,
      [userId],
    )
  ).rows;
  for (const d of drift)
    change(
      `upload ${d.file_name ?? d.id}: readings_count → ${d.readings_count}`,
    );

  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const only = args.includes("--user")
    ? args[args.indexOf("--user") + 1]
    : null;
  const db = pool();
  const host = (process.env.DATABASE_URL ?? "")
    .replace(/^.*@/, "")
    .replace(/\?.*$/, "");
  console.log(`[repair-readings] ${apply ? "APPLY" : "dry run"} on ${host}`);

  const users = only
    ? [only]
    : (
        await db.query<{ user_id: string }>(
          "select distinct user_id from readings where source is null order by 1",
        )
      ).rows.map((r) => r.user_id);

  let total = 0;
  const c = await db.connect();
  try {
    // The catalog: "Thyroglobulin Antibodies" as a globulin alias is how
    // anti-Tg landed on `globulin`; the extractor reads these aliases.
    await c.query("begin");
    const alias = await c.query(
      `update metrics set aliases = aliases - 'Thyroglobulin Antibodies'
        where code = 'globulin' and aliases ? 'Thyroglobulin Antibodies'
        returning code`,
    );
    if (alias.rowCount) {
      total++;
      console.log(
        'catalog\n  + globulin: alias "Thyroglobulin Antibodies" removed',
      );
    }
    await c.query(apply ? "commit" : "rollback");

    const metrics = (
      await c.query<MetricRow>("select code, name, unit, aliases from metrics")
    ).rows;
    for (const userId of users) {
      console.log(`user ${userId}`);
      await c.query("begin");
      try {
        const out = await repairUser(c, userId, metrics);
        await c.query(apply ? "commit" : "rollback");
        console.log(`  ${out.changes} changes, ${out.listed} left as they are`);
        total += out.changes;
      } catch (e) {
        await c.query("rollback");
        throw e;
      }
    }
  } finally {
    c.release();
  }
  console.log(
    `[repair-readings] ${total} changes ${apply ? "applied" : "pending (dry run; --apply writes them)"}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  main()
    .then(() => pool().end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
