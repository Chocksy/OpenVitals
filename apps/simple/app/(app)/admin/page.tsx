import { notFound } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Download } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { getDb, pool, curatorRuns } from "@/db";
import { RunCurator } from "@/components/client";

export const dynamic = "force-dynamic";

/** Raw SQL, because every card here is a one-off aggregate. */
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

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[20px] font-semibold tabular-nums">
        {value}
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
        {label}
      </p>
    </div>
  );
}

const TH = "px-3 py-1.5 text-left font-bold";
const TD = "px-3 py-1.5 font-mono tabular-nums";

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            Admin
          </h1>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            Data state and curator history.{" "}
            <Link href="/review" className="underline">
              {c.open_items} open questions
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <a
          href="/api/export.csv"
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:border-accent-200 hover:text-neutral-900"
        >
          <Download className="size-3.5" />
          Readings CSV
        </a>
        <a
          href="/api/export-daily.csv"
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:border-accent-200 hover:text-neutral-900"
        >
          <Download className="size-3.5" />
          Daily log CSV
        </a>
      </div>
          <RunCurator />
        </div>
      </div>

      <Card title="Data state">
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
          <Stat label="users" value={c.users} />
          <Stat label="uploads" value={c.uploads} />
          <Stat label="readings" value={c.readings} />
          <Stat label="no range" value={c.no_range} />
          <Stat label="metrics" value={c.metrics} />
          <Stat label="open items" value={c.open_items} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 font-mono text-[11px] text-neutral-600 md:grid-cols-4">
          <p>
            uploads:{" "}
            {s.uploadsByStatus.map((u) => `${u.status} ${u.n}`).join(", ") ||
              "none"}
          </p>
          <p>
            metrics: {c.with_optimal} with optimal · {c.needs_review} needs
            review · {c.minted} minted
          </p>
          <p>
            reading flags:{" "}
            {s.flagCounts.map((f) => `${f.flag} ${f.n}`).join(", ") || "none"}
          </p>
          <p>
            review items:{" "}
            {s.reviewByKind
              .map((r) => `${r.kind}/${r.status} ${r.n}`)
              .join(", ") || "none"}
          </p>
        </div>
      </Card>

      <Card title={`Curator runs (${runs.length})`}>
        <table className="w-full font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>Started</th>
              <th className={TH}>Trigger</th>
              <th className={TH}>Took</th>
              <th className={TH}>Stats</th>
              <th className={TH}>Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {runs.length === 0 && (
              <tr>
                <td className={TD} colSpan={5}>
                  never run
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id}>
                <td className={TD}>
                  {r.startedAt?.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className={TD}>{r.trigger}</td>
                <td className={TD}>
                  {r.finishedAt && r.startedAt
                    ? `${((+r.finishedAt - +r.startedAt) / 1000).toFixed(1)}s`
                    : "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-neutral-500">
                  {Object.entries(r.stats ?? {})
                    .map(
                      ([k, v]) => `${k}: ${v.checked}/${v.fixed}f/${v.queued}q`,
                    )
                    .join("  ") || "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--color-health-critical)]">
                  {r.error ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title={`Unit mismatches (${s.unitMismatches.reduce((n, r) => n + r.n, 0)})`}
      >
        <table className="w-full font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>Metric</th>
              <th className={TH}>Canonical</th>
              <th className={TH}>Reading</th>
              <th className={TH}>Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {s.unitMismatches.length === 0 && (
              <tr>
                <td className={TD} colSpan={4}>
                  none
                </td>
              </tr>
            )}
            {s.unitMismatches.map((r) => (
              <tr key={`${r.name}-${r.reading_unit}`}>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className={TD}>{r.canonical}</td>
                <td className={TD}>{r.reading_unit || "(blank)"}</td>
                <td className={TD}>{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Minted metrics (${s.minted.length})`}>
        <table className="w-full font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>Code</th>
              <th className={TH}>Name</th>
              <th className={TH}>Unit</th>
              <th className={TH}>Readings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {s.minted.length === 0 && (
              <tr>
                <td className={TD} colSpan={4}>
                  none — every metric came from the catalog
                </td>
              </tr>
            )}
            {s.minted.map((m) => (
              <tr key={m.code}>
                <td className={TD}>
                  <Link href={`/m/${m.code}`} className="hover:underline">
                    {m.code}
                  </Link>
                </td>
                <td className="px-3 py-1.5">{m.name}</td>
                <td className={TD}>{m.unit ?? "—"}</td>
                <td className={TD}>{m.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
