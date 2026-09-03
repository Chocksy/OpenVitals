import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getDb, goals, readings, uploads } from "@/db";
import {
  getMetricRows,
  sortForBiomarkerList,
  toBiomarkerRow,
} from "@/lib/data";
import { getDraws, getPhoneMetrics } from "@/lib/daily-data";
import { localPath, MIN_RAW_TEXT } from "@/lib/uploads";
import { PillTabs } from "@/components/pill-tabs";
import {
  BloodDraws,
  BloodPhone,
  BloodUploads,
  type PlannedDraw,
  type UploadRow,
} from "@/components/blood";
import { BloodMarkers, type MarkerRow } from "@/components/blood-markers";

export const dynamic = "force-dynamic";

/**
 * Blood, phase 30c. `docs/mockups/v4/blood.html`.
 *
 * Four tabs on one URL, because they are four views of the same pile of
 * numbers: the draws on their own axis, every marker with a search and a
 * ruler, the daily signals the phone sends, and the files all of it came out
 * of. It absorbs `/labs`, `/labs/phone`, `/biomarkers` and `/uploads`, which
 * are now redirects.
 */
const TABS = [
  { id: "draws", label: "Draws" },
  { id: "markers", label: "Markers" },
  { id: "phone", label: "Phone" },
  { id: "uploads", label: "Uploads" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** How many points the drawer's mini chart draws before it reads as a smear. */
const DRAWER_POINTS = 24;

export default async function BloodPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = TABS.some((t) => t.id === tab) ? (tab as Tab) : "draws";
  const userId = await requireUserId();
  const db = getDb();

  /* Each tab reads only what it draws: /blood used to run four page bodies. */
  const openGoals = await db
    .select({
      metricCode: goals.metricCode,
      due: goals.due,
      targetLow: goals.targetLow,
      targetHigh: goals.targetHigh,
    })
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.achievedAt)));
  const goalByCode = new Map(openGoals.map((g) => [g.metricCode, g]));

  let body: React.ReactNode = null;

  if (active === "draws") {
    const draws = await getDraws(userId);
    /* A planned draw is a goal with a date on it: the same row /plan writes
       when an answer says "retest this in twelve weeks". Several goals due on
       the same day are one draw. */
    const byDay = new Map<string, string[]>();
    for (const g of openGoals) {
      if (!g.due) continue;
      byDay.set(g.due, [...(byDay.get(g.due) ?? []), g.metricCode]);
    }
    const planned: PlannedDraw[] = [...byDay.entries()]
      .map(([day, codes]) => ({ day, codes }))
      .sort((a, b) => a.day.localeCompare(b.day));
    body = <BloodDraws draws={draws} planned={planned} />;
  }

  if (active === "markers") {
    const metrics = await getMetricRows(userId);
    const rows: MarkerRow[] = metrics.map((m) => {
      const flat = toBiomarkerRow(m);
      const values = m.rows.filter((r) => r.value != null);
      const before = values[values.length - 2];
      const goal = goalByCode.get(m.code);
      return {
        code: m.code,
        name: m.name,
        category: m.category,
        unit: flat.unit,
        value: m.latest.value,
        valueText: m.latest.valueText,
        observedAt: m.latest.observedAt,
        phone: flat.phone,
        derived: m.derived,
        status: m.status,
        refLow: m.latest.refLow,
        refHigh: m.latest.refHigh,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
        prev: before?.value ?? null,
        prevDate: before?.observedAt ?? null,
        spark: flat.spark,
        points: m.points.slice(-DRAWER_POINTS),
        draws: m.points.length,
        goalLow: goal?.targetLow ?? null,
        goalHigh: goal?.targetHigh ?? null,
        goalDue: goal?.due ?? null,
      };
    });
    const order = new Map(
      sortForBiomarkerList(metrics.map(toBiomarkerRow)).map((r, i) => [
        r.code,
        i,
      ]),
    );
    rows.sort((a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0));
    body = <BloodMarkers rows={rows} />;
  }

  if (active === "phone") {
    body = <BloodPhone rows={await getPhoneMetrics(userId)} />;
  }

  if (active === "uploads") {
    const uploadId = sql`"uploads"."id"`;
    const files = await db
      .select({
        id: uploads.id,
        fileName: uploads.fileName,
        status: uploads.status,
        error: uploads.error,
        createdAt: uploads.createdAt,
        source: uploads.source,
        kind: uploads.kind,
        pages: uploads.pages,
        blobPath: uploads.blobPath,
        textLength: sql<number>`length(coalesce(${uploads.rawText}, ''))`,
        count: sql<number>`(select count(*)::int from ${readings} r where r.upload_id = ${uploadId})`,
        flagged: sql<number>`(select count(*)::int from ${readings} r
          where r.upload_id = ${uploadId}
            and (r.flags @> '["foreign_reading"]'::jsonb or r.flags @> '["implausible"]'::jsonb))`,
        firstDay: sql<
          string | null
        >`(select min(r.observed_at)::text from ${readings} r where r.upload_id = ${uploadId})`,
        lastDay: sql<
          string | null
        >`(select max(r.observed_at)::text from ${readings} r where r.upload_id = ${uploadId})`,
      })
      .from(uploads)
      .where(
        and(
          eq(uploads.userId, userId),
          // A deleted file stays visible for a day, then goes quiet.
          or(
            isNull(uploads.deletedAt),
            gt(uploads.deletedAt, sql`now() - interval '24 hours'`),
          ),
        ),
      )
      // Phase 32a section 3: the genome file first when there is one. It is
      // read once and answers questions for good, so it does not belong
      // wherever the calendar happens to put it; the labs keep their own
      // newest-first order under it.
      .orderBy(
        sql`case when ${uploads.kind} = 'genome' then 0 else 1 end`,
        desc(uploads.createdAt),
      );

    const detail = await db
      .select({
        uploadId: readings.uploadId,
        metricCode: readings.metricCode,
        value: readings.value,
        valueText: readings.valueText,
        unit: readings.unit,
        refLow: readings.refLow,
        refHigh: readings.refHigh,
        observedAt: readings.observedAt,
        flags: readings.flags,
      })
      .from(readings)
      .where(eq(readings.userId, userId))
      .orderBy(asc(readings.metricCode));

    const byUpload = new Map<string, UploadRow["readings"]>();
    for (const r of detail) {
      if (!r.uploadId) continue;
      byUpload.set(r.uploadId, [
        ...(byUpload.get(r.uploadId) ?? []),
        {
          metricCode: r.metricCode,
          value: r.value,
          valueText: r.valueText,
          unit: r.unit,
          refLow: r.refLow,
          refHigh: r.refHigh,
          observedAt: r.observedAt,
          flags: (r.flags ?? []).filter(
            (f): f is string => typeof f === "string",
          ),
        },
      ]);
    }

    const rows: UploadRow[] = files.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      status: u.status ?? "pending",
      error: u.error,
      createdAt: u.createdAt ? u.createdAt.toISOString().slice(0, 10) : null,
      source: u.source,
      kind: u.kind,
      pages: u.pages,
      count: u.count,
      flagged: u.flagged,
      firstDay: u.firstDay,
      lastDay: u.lastDay,
      deleted: u.status === "deleted",
      canRedo: !!localPath(u.blobPath) || u.textLength > MIN_RAW_TEXT,
      readings: byUpload.get(u.id) ?? [],
    }));
    body = <BloodUploads uploads={rows} />;
  }

  return (
    <div className="stackv gap-[var(--s21)]">
      <div>
        <h1 className="c-title">Blood</h1>
        <p className="t-meta mt-[var(--s3)]">
          Every draw, every marker, everything your phone measures, and the
          files it all came out of.
        </p>
      </div>
      <PillTabs
        label="Blood"
        active={active}
        tabs={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          href: `/blood?tab=${t.id}`,
        }))}
      />
      {body}
    </div>
  );
}
