import { notFound } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Download } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { plural } from "@/lib/utils";
import { getDb, pool, curatorRuns } from "@/db";
import { StateWord } from "@/components/ui-kit";
import { RunCurator } from "@/components/client";

export const dynamic = "force-dynamic";

/**
 * Admin, phase 30e. `docs/mockups/v4/admin.html` section 03.
 *
 * A restyle, not a redesign: the same six stats, the same four summary lines,
 * the same three tables and the same two CSV links, drawn on the system's
 * panels, statgrid and tables. Every query below is untouched.
 */

/** Raw SQL, because every stat here is a one-off aggregate. */
async function stats() {
  const db = pool();
  const q = async <T,>(text: string): Promise<T[]> =>
    (await db.query(text)).rows as T[];

  const [
    counts,
    uploadsByStatus,
    flagCounts,
    reviewByKind,
    unitMismatches,
    minted,
  ] = await Promise.all([
    q<Record<string, number>>(`
      SELECT (SELECT count(*)::int FROM users) AS users,
             (SELECT count(*)::int FROM uploads) AS uploads,
             (SELECT count(*)::int FROM readings) AS readings,
             (SELECT count(*)::int FROM readings WHERE ref_low IS NULL AND ref_high IS NULL) AS no_range,
             (SELECT count(*)::int FROM metrics) AS metrics,
             (SELECT count(*)::int FROM metrics WHERE optimal_low IS NOT NULL OR optimal_high IS NOT NULL) AS with_optimal,
             (SELECT count(*)::int FROM metrics WHERE needs_review) AS needs_review,
             (SELECT count(*)::int FROM metrics WHERE category = 'other') AS minted,
             (SELECT count(*)::int FROM review_items WHERE status = 'open') AS open_items`),
    q<{ status: string; n: number }>(
      `SELECT coalesce(status, 'pending') AS status, count(*)::int AS n FROM uploads GROUP BY 1 ORDER BY 2 DESC`,
    ),
    q<{ flag: string; n: number }>(
      `SELECT f #>> '{}' AS flag, count(*)::int AS n
         FROM readings, jsonb_array_elements(flags) f
        WHERE jsonb_typeof(f) = 'string' GROUP BY 1 ORDER BY 2 DESC`,
    ),
    q<{ kind: string; status: string; n: number }>(
      `SELECT kind, status, count(*)::int AS n FROM review_items GROUP BY 1, 2 ORDER BY 3 DESC`,
    ),
    q<{ name: string; canonical: string; reading_unit: string; n: number }>(
      `SELECT m.name, m.unit AS canonical, r.unit AS reading_unit, count(*)::int AS n
         FROM readings r JOIN metrics m ON m.code = r.metric_code
        WHERE r.unit IS NOT NULL AND m.unit IS NOT NULL
          AND lower(r.unit) <> lower(m.unit)
        GROUP BY 1, 2, 3 ORDER BY 4 DESC`,
    ),
    q<{ code: string; name: string; unit: string; n: number }>(
      `SELECT m.code, m.name, m.unit,
              (SELECT count(*)::int FROM readings r WHERE r.metric_code = m.code) AS n
         FROM metrics m WHERE m.category = 'other' ORDER BY 4 DESC, m.name`,
    ),
  ]);

  return {
    counts: counts[0]!,
    uploadsByStatus,
    flagCounts,
    reviewByKind,
    unitMismatches,
    minted,
  };
}

export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

  const [s, runs] = await Promise.all([
    stats(),
    getDb()
      .select()
      .from(curatorRuns)
      .orderBy(desc(curatorRuns.startedAt))
      .limit(20),
  ]);
  const c = s.counts;
  const mismatchReadings = s.unitMismatches.reduce((n, r) => n + r.n, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="t-title">Admin</h1>
        <p className="t-meta mt-1">
          Data state and curator history.{" "}
          <Link href="/plan#answer" className="underline">
            {plural(c.open_items, "open question")}
          </Link>
          .
        </p>
      </div>

      <div className="rowh">
        <RunCurator />
        <a href="/api/export.csv" className="b b-quiet b-sm">
          <Download />
          Readings CSV
        </a>
        <a href="/api/export-daily.csv" className="b b-quiet b-sm">
          <Download />
          Daily log CSV
        </a>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Data state</h3>
          <span className="r">
            {plural(c.readings, "reading")} · {plural(c.metrics, "metric")}
          </span>
        </div>
        <div className="statgrid">
          <div>
            <b>{c.users}</b>
            <span>users</span>
          </div>
          <div>
            <b>{c.uploads}</b>
            <span>uploads</span>
          </div>
          <div>
            <b>{c.readings}</b>
            <span>readings</span>
          </div>
          <div>
            <b>{c.no_range}</b>
            <span>no range</span>
          </div>
          <div>
            <b>{c.metrics}</b>
            <span>metrics</span>
          </div>
          <div>
            <b>{c.open_items}</b>
            <span>open items</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <p className="t-meta">
            uploads:{" "}
            {s.uploadsByStatus.map((u) => `${u.status} ${u.n}`).join(", ") ||
              "none"}
          </p>
          <p className="t-meta">
            metrics: {c.with_optimal} with optimal · {c.needs_review} needs
            review · {c.minted} minted
          </p>
          <p className="t-meta">
            reading flags:{" "}
            {s.flagCounts.map((f) => `${f.flag} ${f.n}`).join(", ") || "none"}
          </p>
          <p className="t-meta">
            review items:{" "}
            {s.reviewByKind
              .map((r) => `${r.kind}/${r.status} ${r.n}`)
              .join(", ") || "none"}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Curator runs</h3>
          <span className="r">
            {runs.length ? `${runs.length} shown · newest first` : "never run"}
          </span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Took</th>
                <th>Stats</th>
                <th>State</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6}>never run</td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="k n">
                    {r.startedAt?.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td>{r.trigger}</td>
                  <td className="n">
                    {r.finishedAt && r.startedAt
                      ? `${((+r.finishedAt - +r.startedAt) / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                  <td className="n">
                    {Object.entries(r.stats ?? {})
                      .map(
                        ([k, v]) =>
                          `${k}: ${v.checked}/${v.fixed}f/${v.queued}q`,
                      )
                      .join("  ") || "—"}
                  </td>
                  <td>
                    {r.error ? (
                      <StateWord tone="off">failed</StateWord>
                    ) : r.finishedAt ? (
                      <StateWord tone="on">done</StateWord>
                    ) : (
                      <StateWord tone="none">running</StateWord>
                    )}
                  </td>
                  <td style={{ color: "var(--bad)" }}>{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <h3>Unit mismatches</h3>
            <span className="r">
              {s.unitMismatches.length
                ? `${plural(s.unitMismatches.length, "pair")} · ${plural(mismatchReadings, "reading")}`
                : "none"}
            </span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Canonical</th>
                  <th>Reading</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {s.unitMismatches.length === 0 && (
                  <tr>
                    <td colSpan={4}>none</td>
                  </tr>
                )}
                {s.unitMismatches.map((r) => (
                  <tr key={`${r.name}-${r.reading_unit}`}>
                    <td className="k">{r.name}</td>
                    <td className="n">{r.canonical}</td>
                    <td className="n">{r.reading_unit || "(blank)"}</td>
                    <td className="n">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Minted metrics</h3>
            <span className="r">
              {s.minted.length ? plural(s.minted.length, "metric") : "none"}
            </span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Readings</th>
                </tr>
              </thead>
              <tbody>
                {s.minted.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      none — every metric came from the catalog
                    </td>
                  </tr>
                )}
                {s.minted.map((m) => (
                  <tr key={m.code}>
                    <td className="k">
                      <Link
                        href={`/blood/m/${m.code}`}
                        className="hover:underline"
                      >
                        {m.code}
                      </Link>
                    </td>
                    <td>{m.name}</td>
                    <td className="n">{m.unit ?? "—"}</td>
                    <td className="n">{m.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
