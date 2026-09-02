/**
 * The three server-rendered tabs of Blood: Draws, Phone and Uploads.
 *
 * `docs/mockups/v4/blood.html` sections 01 (the draw line), 02 (the phone),
 * 04 (uploads) and 07 (the empty states, which are quiet and never dashed).
 * The Markers tab holds a search box, a filter and a drawer, so it is the one
 * client component and lives in `blood-markers.tsx`.
 */
import Link from "next/link";
import { CalendarDays, ChevronDown, Download, FileText } from "lucide-react";
import type { DrawView, PhoneMetric } from "@/lib/daily-data";
import { formatRange, type Status } from "@/lib/status";
import { dayLabel, plural } from "@/lib/utils";
import { DeleteUpload, ReanalyzeUpload, UploadButton } from "./client";
import { digits } from "./ruler";
import { StateWord, type StateTone } from "./ui-kit";

const TONE: Record<Status, StateTone> = {
  red: "off",
  amber: "border",
  green: "on",
  gray: "none",
};

/** How many marks the axis carries before the rest becomes one sentence. */
const ON_AXIS = 6;

export interface PlannedDraw {
  day: string;
  codes: string[];
}

/* ── Draws ─────────────────────────────────────────────────────────────── */

export function BloodDraws({
  draws,
  planned,
}: {
  draws: DrawView[];
  planned: PlannedDraw[];
}) {
  if (draws.length === 0 && planned.length === 0)
    return (
      <div className="empty">
        <span className="k">No draws</span>
        <b className="text-[length:var(--type-md)] font-normal">
          No blood draws on file
        </b>
        <p>
          The engine can still read your phone, but every likelihood on this
          page needs at least one draw behind it.
        </p>
        <Link href="/blood/plan">Plan a draw</Link>
      </div>
    );

  // Oldest first on the axis, which is how time runs, and only the last few:
  // seventeen marks on a 390 px screen is a smear.
  const recent = [...draws].sort((a, b) => a.day.localeCompare(b.day));
  const earlier = recent.slice(0, Math.max(0, recent.length - ON_AXIS));
  const onAxis = recent.slice(-ON_AXIS);

  return (
    <div className="stackv">
      <div className="panel hi">
        <div className="panel-head">
          <h3>Draws</h3>
          <span className="r">
            {plural(draws.length, "draw")} in the archive
            {planned.length > 0 ? ` · ${planned.length} planned` : ""}
          </span>
        </div>
        <div className="drawline">
          <div className="axis" />
          <div className="marks">
            {onAxis.map((d) => (
              <a className="dmark" key={d.day} href={`#draw-${d.day}`}>
                <b>{dayLabel(d.day)}</b>
                <i />
                <span className="n">{d.count}</span>
                <span className="max-w-[13ch] overflow-hidden text-ellipsis">
                  {d.count === 1 ? d.rows[0]!.name : "results"}
                  {d.flagged > 0 ? ` · ${d.flagged} off` : ""}
                </span>
              </a>
            ))}
            {planned.map((p) => (
              <span className="dmark planned" key={p.day}>
                <b>{dayLabel(p.day)}</b>
                <i />
                <span className="n">{p.codes.length}</span>
                <span>planned</span>
              </span>
            ))}
          </div>
        </div>
        {earlier.length > 0 && (
          <p className="t-meta mt-[var(--s13)]">
            Earlier: {plural(earlier.length, "more draw")},{" "}
            {dayLabel(earlier[0]!.day, true)} to{" "}
            {dayLabel(earlier[earlier.length - 1]!.day, true)},{" "}
            {plural(earlier.reduce((n, d) => n + d.count, 0), "result")}.
          </p>
        )}
        <div className="rowh mt-[var(--s13)]">
          <Link className="b b-ink b-sm" href="/blood/plan">
            <CalendarDays className="ic" aria-hidden="true" />
            Plan a draw
          </Link>
          <UploadButton />
        </div>
      </div>

      {[...draws].map((d) => (
        <details className="panel" key={d.day} id={`draw-${d.day}`}>
          <summary className="disclose rowh cursor-pointer list-none">
            <span className="t-title text-[length:var(--type-md)]">
              {dayLabel(d.day, true)}
            </span>
            <span className="t-num text-[length:var(--type-xs)] text-[var(--ink-3)]">
              {plural(d.count, "result")}
            </span>
            {d.flagged > 0 && (
              <StateWord tone="off" dot>
                {d.flagged} off
              </StateWord>
            )}
            {d.fileName && (
              <span className="src inline-flex items-center gap-[var(--s3)]">
                <FileText className="ic" aria-hidden="true" />
                {d.fileName}
              </span>
            )}
            <ChevronDown className="ic ml-auto" aria-hidden="true" />
          </summary>
          <div className="tblwrap mt-[var(--s13)]">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Marker</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Reference</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {/* One draw can hold several rows for the same code (a
                    susceptibility panel, or the same analyte in blood and
                    urine), so the index is part of the key. */}
                {d.rows.map((r, i) => (
                  <tr key={`${r.code}-${i}`}>
                    <td className="k">
                      <Link href={`/blood/m/${r.code}`}>{r.name}</Link>
                    </td>
                    <td className="n">
                      {r.value != null ? digits(r.value) : (r.valueText ?? "—")}
                    </td>
                    <td className="n">{r.unit ?? ""}</td>
                    <td className="n">{formatRange(r.refLow, r.refHigh)}</td>
                    <td>
                      <StateWord tone={TONE[r.status]} dot>
                        {r.status === "red"
                          ? "off"
                          : r.status === "amber"
                            ? "borderline"
                            : r.status === "green"
                              ? "optimal"
                              : "no band"}
                      </StateWord>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

/* ── Phone ─────────────────────────────────────────────────────────────── */

export function BloodPhone({ rows }: { rows: PhoneMetric[] }) {
  if (rows.length === 0)
    return (
      <div className="empty">
        <span className="k">No phone data</span>
        <b className="text-[length:var(--type-md)] font-normal">
          Nothing from a phone yet
        </b>
        <p>
          Sync Apple Health from the iOS app and your daily numbers land here,
          one point a day.
        </p>
      </div>
    );

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>From your phone</h3>
        <span className="r">
          {plural(rows.length, "signal")}
        </span>
      </div>
      <div className="rowlist">
        {rows.map((m) => {
          const body = (
            <>
              <div className="nm">
                <b>{m.name}</b>
                <span>
                  {plural(m.count, m.noun.replace(/s$/, ""), m.noun)} since{" "}
                  {dayLabel(m.since, true)}
                  {m.latestAt ? ` · newest ${dayLabel(m.latestAt, true)}` : ""}
                </span>
              </div>
              <div className="t-meta text-[length:var(--type-xs)]">
                {m.optimalLow != null || m.optimalHigh != null
                  ? `optimal ${formatRange(m.optimalLow, m.optimalHigh)}`
                  : "no band"}
              </div>
              <div className="val">
                {m.latest == null ? "—" : digits(m.latest)}
                {m.unit && <em>{m.unit}</em>}
              </div>
              <div className="wd">
                <StateWord tone={TONE[m.status]} dot tri={m.status === "red"}>
                  {m.status === "red"
                    ? "off"
                    : m.status === "amber"
                      ? "borderline"
                      : m.status === "green"
                        ? "optimal"
                        : "no band"}
                </StateWord>
              </div>
            </>
          );
          return m.href ? (
            <Link
              key={m.code}
              className="markerrow said"
              href={`/blood/m/${m.code}`}
            >
              {body}
            </Link>
          ) : (
            <div key={m.code} className="markerrow said">
              {body}
            </div>
          );
        })}
      </div>
      <p className="cap">
        Steps, exercise, active energy and workouts have no lab equivalent, so
        they stay here and carry no band.
      </p>
    </div>
  );
}

/* ── Uploads ───────────────────────────────────────────────────────────── */

export interface UploadRow {
  id: string;
  fileName: string | null;
  status: string;
  error: string | null;
  createdAt: string | null;
  source: string | null;
  kind: string | null;
  pages: number | null;
  count: number;
  flagged: number;
  firstDay: string | null;
  lastDay: string | null;
  deleted: boolean;
  canRedo: boolean;
  readings: {
    metricCode: string;
    value: number | null;
    valueText: string | null;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
    observedAt: string;
    flags: string[];
  }[];
}

const UPLOAD_TONE: Record<string, StateTone> = {
  done: "on",
  needs_review: "border",
  extracting: "none",
  pending: "none",
  failed: "off",
  deleted: "none",
};

/** The engine's own status, in the words the page speaks. */
const UPLOAD_WORD: Record<string, string> = {
  done: "parsed",
  needs_review: "needs a check",
  extracting: "reading it now",
  pending: "waiting",
  failed: "could not read it",
  deleted: "deleted",
};

export function BloodUploads({ uploads }: { uploads: UploadRow[] }) {
  const live = uploads.filter((u) => !u.deleted);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Uploads</h3>
        <span className="r">
          {plural(live.length, "file")} ·{" "}
          {plural(live.reduce((n, u) => n + u.count, 0), "reading")} ·{" "}
          {live.filter((u) => u.status === "needs_review").length} need a check
        </span>
      </div>

      {uploads.length === 0 ? (
        <div className="empty">
          <span className="k">No uploads</span>
          <b className="text-[length:var(--type-md)] font-normal">
            Nothing uploaded yet
          </b>
          <p>
            A photo of a lab sheet is enough. The reader takes about a minute on
            a PDF and a few seconds on a photo.
          </p>
        </div>
      ) : (
        <div className="rowlist">
          {uploads.map((u) => (
            <div className="uprow" key={u.id}>
              <span className="pg">
                <FileText className="ic" aria-hidden="true" />
              </span>
              <div>
                <Link href={`/blood/uploads/${u.id}`}>
                  <b>{u.fileName ?? "(no name)"}</b>
                </Link>
                <div className="meta">
                  <span>
                    {(u.kind ?? "lab").toUpperCase()}
                    {u.createdAt ? ` · read ${dayLabel(u.createdAt, true)}` : ""}
                    {u.pages ? ` · ${u.pages} pages` : ""}
                  </span>
                  <span>
                    {u.deleted
                      ? "deleted, its readings were removed"
                      : plural(u.count, "reading")}
                    {u.flagged > 0 ? ` · ${u.flagged} flagged` : ""}
                    {u.firstDay
                      ? ` · ${u.firstDay}${u.lastDay !== u.firstDay ? `–${u.lastDay}` : ""}`
                      : ""}
                  </span>
                </div>
                {u.error && (
                  <p className="t-meta text-[var(--bad)]">{u.error}</p>
                )}
                {u.readings.length > 0 && (
                  <details className="disclose mt-[var(--s8)]">
                    <summary>
                      The {plural(u.readings.length, "row")} it read
                      <ChevronDown className="ic" aria-hidden="true" />
                    </summary>
                    <div className="inner tblwrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Marker</th>
                            <th>Value</th>
                            <th>Unit</th>
                            <th>Ref low</th>
                            <th>Ref high</th>
                            <th>Drawn</th>
                          </tr>
                        </thead>
                        <tbody>
                          {u.readings.map((r, i) => (
                            <tr key={`${r.metricCode}-${i}`}>
                              <td className="k">{r.metricCode}</td>
                              <td className="n">
                                {r.value != null
                                  ? digits(r.value)
                                  : (r.valueText ?? "—")}
                              </td>
                              <td className="n">{r.unit ?? ""}</td>
                              <td className="n">{r.refLow ?? "—"}</td>
                              <td className="n">{r.refHigh ?? "—"}</td>
                              <td className="n">{r.observedAt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
              <div className="rowh gap-[var(--s5)]">
                <StateWord tone={UPLOAD_TONE[u.status] ?? "none"} dot>
                  {UPLOAD_WORD[u.status] ?? u.status}
                </StateWord>
                {!u.deleted && (
                  <>
                    <ReanalyzeUpload
                      id={u.id}
                      disabled={!u.canRedo}
                      title={
                        u.canRedo ? undefined : "the original file is not on this machine"
                      }
                    />
                    <DeleteUpload id={u.id} name={u.fileName ?? "this upload"} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rowh mt-[var(--s13)]">
        <UploadButton />
        <a className="b b-text b-sm" href="/api/export.csv">
          <Download className="ic" aria-hidden="true" />
          Readings CSV
        </a>
        <a className="b b-text b-sm" href="/api/export-daily.csv">
          <Download className="ic" aria-hidden="true" />
          Daily log CSV
        </a>
      </div>
    </div>
  );
}
