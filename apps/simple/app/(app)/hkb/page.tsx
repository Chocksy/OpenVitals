import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import {
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbEvidence,
  hkbFeatures,
  hkbImportRuns,
  hkbInterventions,
  hkbPriors,
  hkbRevisions,
  hkbTerms,
  hkbTests,
  reviewItems,
} from "@/db";
import {
  bandsOf,
  calibrationRows,
  READABLE_AT,
  RESOLVING_LR,
} from "@/lib/calibration";
import { poolMembers, sizeOf } from "@/lib/hkb-pool";
import { tierOf } from "@/lib/report";
import type { Grade } from "@/lib/hypotheses";
import { countryName } from "@/lib/countries";
import { money } from "@/lib/prices";
import {
  CatalogToggle,
  ClaimBox,
  Override,
  ResearchButton,
  RunImport,
} from "@/components/hkb-controls";
import { StateWord, type StateTone, Tier } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const TABS = [
  "conditions",
  "evidence",
  "interventions",
  "activity",
  "priors",
  "tests",
  "calibration",
  "imports",
] as const;
type Tab = (typeof TABS)[number];

const TH = "px-3 py-1.5 text-left font-bold";
const TD = "px-3 py-1.5 font-mono tabular-nums";
const TDT = "px-3 py-1.5";

const STATUS_TONE: Record<string, StateTone> = {
  seed: "none",
  accepted: "on",
  proposed: "none",
  rejected: "border",
};

/** The row limit on every table here: this is a review page, not an export. */
const LIMIT = 300;

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

async function conditionsTab() {
  const db = getDb();
  const [rows, evidence, priors] = await Promise.all([
    // Ring 1 only. Ring 2 is ten thousand dormant names with a prior and
    // nothing else; it is counted on the Calibration tab and reachable through
    // the ask box, not listed here.
    db
      .select()
      .from(hkbConditions)
      .where(eq(hkbConditions.ring, 1))
      .orderBy(asc(hkbConditions.id)),
    db
      .select({
        conditionId: hkbEvidence.conditionId,
        status: hkbEvidence.status,
        n: sql<number>`count(*)::int`,
      })
      .from(hkbEvidence)
      .groupBy(hkbEvidence.conditionId, hkbEvidence.status),
    db
      .select({ conditionId: hkbPriors.conditionId, source: hkbPriors.source })
      .from(hkbPriors)
      .where(
        and(
          isNull(hkbPriors.country),
          isNull(hkbPriors.sex),
          isNull(hkbPriors.ageMin),
        ),
      ),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const e of evidence)
    counts.set(e.conditionId, {
      ...(counts.get(e.conditionId) ?? {}),
      [e.status]: e.n,
    });
  const priorBy = new Map(priors.map((p) => [p.conditionId, p.source]));

  return (
    <Card title={`Conditions · ring 1 (${rows.length})`}>
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>id</th>
            <th className={TH}>name</th>
            <th className={TH}>MONDO</th>
            <th className={TH}>parent</th>
            <th className={TH}>catalog</th>
            <th className={TH}>evidence</th>
            <th className={TH}>research</th>
            <th className={TH}>why in the catalog · prior source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((c) => {
            const n = counts.get(c.id) ?? {};
            return (
              <tr key={c.id}>
                <td className={TD}>{c.id}</td>
                <td className={TDT}>{c.name}</td>
                <td className={TD}>
                  {c.mondoId ? (
                    <a
                      className="hover:underline"
                      href={`https://monarchinitiative.org/${c.mondoId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.mondoId}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={TD}>{c.parentId ?? "—"}</td>
                <td className={TD}>
                  <CatalogToggle id={c.id} inCatalog={c.inCatalog} />
                </td>
                <td className={TD}>
                  {Object.entries(n)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ") || "none"}
                </td>
                <td className={TDT}>
                  <ResearchButton conditionId={c.id} />
                </td>
                <td className="px-3 py-1.5 text-[11px] text-neutral-500">
                  {c.why ?? "—"}
                  <br />
                  <span className="text-neutral-400">
                    {priorBy.get(c.id) ?? "no base prior"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

async function evidenceTab(status: string, condition: string) {
  const db = getDb();
  const byStatus =
    status === "all" ? undefined : eq(hkbEvidence.status, status);
  const where =
    condition === "all"
      ? byStatus
      : and(byStatus, eq(hkbEvidence.conditionId, condition));
  const [rows, total, conditions, scoring] = await Promise.all([
    db
      .select()
      .from(hkbEvidence)
      .where(where)
      .orderBy(asc(hkbEvidence.conditionId), asc(hkbEvidence.id))
      .limit(LIMIT),
    db
      .select({ status: hkbEvidence.status, n: sql<number>`count(*)::int` })
      .from(hkbEvidence)
      .groupBy(hkbEvidence.status),
    db
      .select({
        conditionId: hkbEvidence.conditionId,
        n: sql<number>`count(*)::int`,
      })
      .from(hkbEvidence)
      .where(byStatus)
      .groupBy(hkbEvidence.conditionId)
      .orderBy(asc(hkbEvidence.conditionId)),
    db
      .select()
      .from(hkbEvidence)
      .where(inArray(hkbEvidence.status, ["seed", "accepted"])),
  ]);

  // The number the engine actually multiplies by: every scoring row on the
  // same (condition, feature, condition_on), pooled in log space.
  const groups = new Map<string, typeof scoring>();
  const keyOf = (e: {
    conditionId: string;
    featureId: string;
    conditionOn: unknown;
  }) => `${e.conditionId}|${e.featureId}|${JSON.stringify(e.conditionOn)}`;
  for (const e of scoring) {
    if (e.grade === "D" || e.grade === "E") continue;
    groups.set(keyOf(e), [...(groups.get(keyOf(e)) ?? []), e]);
  }
  const pooled = new Map<string, { lrPos: number; n: number }>();
  for (const [key, members] of groups) {
    const p = poolMembers(
      members.map((e) => ({
        id: e.id,
        lrPos: e.lrPos,
        lrNeg: e.lrNeg,
        grade: e.grade as Grade,
        source: e.source,
        n: sizeOf(e.source),
      })),
    );
    if (p) pooled.set(key, { lrPos: p.lrPos, n: members.length });
  }

  const href = (s: string, c: string) =>
    `/hkb?tab=evidence&status=${s}&condition=${c}`;

  return (
    <Card
      title={`Evidence · ${status} (${rows.length}${rows.length === LIMIT ? "+" : ""})`}
      action={
        <span className="flex flex-wrap gap-2 font-mono text-[10px]">
          {["all", "proposed", "seed", "accepted", "rejected"].map((s) => (
            <Link
              key={s}
              href={href(s, condition)}
              className={
                s === status
                  ? "font-bold underline"
                  : "underline decoration-dotted"
              }
            >
              {s}{" "}
              {total.find((t) => t.status === s)?.n ??
                (s === "all" ? total.reduce((a, b) => a + b.n, 0) : 0)}
            </Link>
          ))}
        </span>
      }
    >
      <p className="mb-3 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px]">
        {[{ conditionId: "all", n: rows.length }, ...conditions].map((c) => (
          <Link
            key={c.conditionId}
            href={href(status, c.conditionId)}
            className={
              c.conditionId === condition
                ? "font-bold underline"
                : "text-neutral-500 underline decoration-dotted"
            }
          >
            {c.conditionId} {c.n}
          </Link>
        ))}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>condition</th>
              <th className={TH}>rule</th>
              <th className={TH}>reads</th>
              <th className={TH}>when</th>
              <th className={TH}>LR+</th>
              <th className={TH}>LR−</th>
              <th className={TH}>pooled</th>
              <th className={TH}>papers</th>
              <th className={TH}>grade</th>
              <th className={TH}>status</th>
              <th className={TH}>source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td className={TD} colSpan={11}>
                  nothing with that status
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const p = pooled.get(keyOf(e));
              return (
                <tr key={e.id}>
                  <td className={TD}>{e.conditionId}</td>
                  <td className={`${TD} max-w-[150px] truncate`} title={e.id}>
                    {e.id}
                  </td>
                  <td className={TD}>{e.featureId}</td>
                  <td className={TD}>{JSON.stringify(e.conditionOn)}</td>
                  <td className={TD}>{e.lrPos}</td>
                  <td className={TD}>{e.lrNeg ?? "—"}</td>
                  <td className={TD} title="what the engine multiplies by">
                    {p ? p.lrPos : "—"}
                  </td>
                  <td className={TD}>{p ? p.n : 0}</td>
                  <td className={TD}>{e.grade}</td>
                  <td className={TD}>
                    <span className="flex flex-col items-start gap-1">
                      <StateWord tone={STATUS_TONE[e.status]}>{e.status}</StateWord>
                      {e.needsLook && (
                        <StateWord tone="border">needs look</StateWord>
                      )}
                      <Override
                        id={e.id}
                        lrPos={e.lrPos}
                        lrNeg={e.lrNeg}
                        grade={e.grade}
                        status={e.status}
                      />
                    </span>
                  </td>
                  <td className="max-w-[420px] px-3 py-1.5 text-[11px] text-neutral-500">
                    {e.paper && (
                      <>
                        <a
                          href={e.paper.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-neutral-800 underline"
                        >
                          {e.paper.title}
                        </a>{" "}
                        <span className="font-mono text-[10px]">
                          {[e.paper.journal, e.paper.year]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                        <p className="my-1 border-l-2 border-neutral-200 pl-2 italic text-neutral-600">
                          “{e.paper.quote}”
                        </p>
                      </>
                    )}
                    {e.source}
                    {e.reviewNote && (
                      <p className="mt-1 font-mono text-[10px] text-neutral-400">
                        reviewed: {e.reviewNote}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** What the papers say might help, per condition, grade first. */
async function interventionsTab(condition: string) {
  const db = getDb();
  const [rows, byCondition] = await Promise.all([
    db
      .select()
      .from(hkbInterventions)
      .where(
        condition === "all"
          ? undefined
          : eq(hkbInterventions.conditionId, condition),
      )
      .orderBy(
        asc(hkbInterventions.conditionId),
        asc(hkbInterventions.grade),
        asc(hkbInterventions.name),
      )
      .limit(LIMIT),
    db
      .select({
        conditionId: hkbInterventions.conditionId,
        n: sql<number>`count(*)::int`,
      })
      .from(hkbInterventions)
      .groupBy(hkbInterventions.conditionId)
      .orderBy(asc(hkbInterventions.conditionId)),
  ]);

  return (
    <Card
      title={`Interventions (${rows.length}${rows.length === LIMIT ? "+" : ""})`}
      action={
        <span className="font-mono text-[10px] text-neutral-400">
          A and B are candidate actions, C is early, D and E are the horizon and
          only ever offered with a measurement plan
        </span>
      }
    >
      <div className="mb-4 border-b border-neutral-100 pb-4">
        <p className="mb-2 font-body text-[12px] text-neutral-500">
          Whatever is popular this month gets a door in. The engine reads the
          science the claim implies, and files the popular form itself as grade
          E, anecdotal, on the horizon shelf with a measurement plan. Nothing
          filed here can move a probability.
        </p>
        <ClaimBox />
      </div>
      <p className="mb-3 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px]">
        {[{ conditionId: "all", n: rows.length }, ...byCondition].map((c) => (
          <Link
            key={c.conditionId}
            href={`/hkb?tab=interventions&condition=${c.conditionId}`}
            className={
              c.conditionId === condition
                ? "font-bold underline"
                : "text-neutral-500 underline decoration-dotted"
            }
          >
            {c.conditionId} {c.n}
          </Link>
        ))}
      </p>
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>condition</th>
            <th className={TH}>tier</th>
            <th className={TH}>what</th>
            <th className={TH}>dose</th>
            <th className={TH}>for</th>
            <th className={TH}>effect</th>
            <th className={TH}>grade</th>
            <th className={TH}>paper</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 && (
            <tr>
              <td className={TD} colSpan={8}>
                nothing read yet — run the research job on a condition
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={TD}>{r.conditionId}</td>
              <td className={TD}>
                <Tier tier={tierOf(r.grade)} />
                {r.status === "horizon" && (
                  <span className="ml-1 font-mono text-[10px] text-neutral-400">
                    horizon · {r.population ?? "unknown"}
                  </span>
                )}
              </td>
              <td className={TDT}>{r.name}</td>
              <td className={TD}>{r.dose ?? "—"}</td>
              <td className={TD}>{r.duration ?? "—"}</td>
              <td className={TD}>
                {r.direction}
                {r.effect ? ` ${r.effect}` : ""}
                {r.outcomeFeatureId ? ` in ${r.outcomeFeatureId}` : ""}
              </td>
              <td className={TD}>{r.grade}</td>
              <td className="max-w-[460px] px-3 py-1.5 text-[11px] text-neutral-500">
                {r.paper && (
                  <a
                    href={r.paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-neutral-800 underline"
                  >
                    {r.paper.title}
                  </a>
                )}
                {r.quote && (
                  <p className="my-1 border-l-2 border-neutral-200 pl-2 italic text-neutral-600">
                    “{r.quote}”
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** The last 100 things the knowledge base did, newest first. */
async function activityTab() {
  const db = getDb();
  const FEED = 100;
  const [evidence, minted, interventions, runs, secondPass] = await Promise.all([
    db
      .select()
      .from(hkbEvidence)
      .orderBy(desc(hkbEvidence.createdAt))
      .limit(FEED),
    db
      .select({
        id: hkbFeatures.id,
        name: hkbFeatures.name,
        unit: hkbFeatures.unit,
        mintedFrom: hkbFeatures.mintedFrom,
        // hkb_features carries no timestamp of its own; a feature is minted in
        // the same write as the rule that needed it, so that rule dates it.
        at: sql<Date | null>`(
          select min(e.created_at) from hkb_evidence e
          where e.feature_id = ${hkbFeatures.id}
        )`,
      })
      .from(hkbFeatures)
      .where(sql`${hkbFeatures.mintedFrom} is not null`)
      .limit(FEED),
    db
      .select()
      .from(hkbInterventions)
      .orderBy(desc(hkbInterventions.createdAt))
      .limit(FEED),
    db
      .select()
      .from(hkbImportRuns)
      .orderBy(desc(hkbImportRuns.ranAt))
      .limit(FEED),
    // Phase 24e: what the curator's second pass did with the values a lab
    // sheet did not settle. A window on the pass, not a queue: the rows it
    // closed carry the line they were closed on, and the ones it could not
    // settle say so.
    db
      .select({
        at: sql<Date | null>`coalesce(${reviewItems.resolvedAt}, ${reviewItems.createdAt})`,
        answer: reviewItems.answer,
        subject: reviewItems.subject,
        question: reviewItems.question,
        status: reviewItems.status,
      })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.kind, "confirm_value"),
          or(
            sql`${reviewItems.answer} like 'second pass%'`,
            sql`${reviewItems.subject}->>'settledBy' is not null`,
          ),
        ),
      )
      .orderBy(sql`coalesce(resolved_at, created_at) desc`)
      .limit(FEED),
  ]);

  // How many scoring rows share each key, so the feed can say a row was pooled
  // into an existing claim rather than opening a new one.
  const shared = new Map<string, number>();
  for (const e of evidence) {
    const key = `${e.conditionId}|${e.featureId}|${JSON.stringify(e.conditionOn)}`;
    shared.set(key, (shared.get(key) ?? 0) + 1);
  }

  const feed: { at: Date | null; kind: string; text: string }[] = [
    ...evidence.map((e) => ({
      at: e.createdAt,
      kind: e.status === "rejected" ? "rejected" : "evidence",
      text:
        `${e.conditionId} · ${e.featureId} ${JSON.stringify(e.conditionOn)} ` +
        `LR+ ${e.lrPos} grade ${e.grade}` +
        (e.needsLook ? " · needs look" : "") +
        (shared.get(
          `${e.conditionId}|${e.featureId}|${JSON.stringify(e.conditionOn)}`,
        )! > 1
          ? " · pooled with another paper on the same claim"
          : "") +
        (e.paper ? ` — ${e.paper.title}` : ""),
    })),
    ...minted.map((f) => ({
      at: f.at ? new Date(f.at) : null,
      kind: "minted",
      text: `${f.id} (${f.name}${f.unit ? `, ${f.unit}` : ""}) minted from doi:${f.mintedFrom}`,
    })),
    ...interventions.map((r) => ({
      at: r.createdAt,
      kind: "intervention",
      text: `${r.conditionId} · ${r.name}${r.dose ? ` ${r.dose}` : ""} · grade ${r.grade} (${tierOf(r.grade)})`,
    })),
    ...secondPass.map((r) => ({
      at: r.at ? new Date(r.at) : null,
      kind: "second pass",
      text:
        `${r.subject?.metricCode ?? "?"} · ` +
        (r.answer?.replace(/^second pass: /, "") ??
          `left for the person${r.subject?.evidenceLine ? ` — “${r.subject.evidenceLine}”` : ""}`),
    })),
    ...runs.map((r) => ({
      at: r.ranAt,
      kind: "run",
      text: `${r.script}: ${
        r.notes ??
        Object.entries(r.rows ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")
      }`,
    })),
  ]
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, FEED);

  return (
    <Card
      title={`Activity (last ${feed.length})`}
      action={
        <span className="font-mono text-[10px] text-neutral-400">
          what the knowledge base did on its own
        </span>
      }
    >
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>when</th>
            <th className={TH}>what</th>
            <th className={TH}>detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {feed.length === 0 && (
            <tr>
              <td className={TD} colSpan={3}>
                nothing has happened yet
              </td>
            </tr>
          )}
          {feed.map((row, i) => (
            <tr key={`${row.kind}-${i}`}>
              <td className={TD}>
                {row.at?.toISOString().slice(0, 19).replace("T", " ") ?? "—"}
              </td>
              <td className={TD}>
                <StateWord tone={STATUS_TONE[row.kind]}>{row.kind}</StateWord>
              </td>
              <td className="px-3 py-1.5 text-[11px] text-neutral-500">
                {row.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function priorsTab(country: string) {
  const db = getDb();
  const [rows, byCountry] = await Promise.all([
    db
      .select()
      .from(hkbPriors)
      .where(
        country === "all"
          ? undefined
          : or(isNull(hkbPriors.country), eq(hkbPriors.country, country)),
      )
      .orderBy(asc(hkbPriors.conditionId), asc(hkbPriors.country))
      .limit(LIMIT),
    db
      .select({ country: hkbPriors.country, n: sql<number>`count(*)::int` })
      .from(hkbPriors)
      .groupBy(hkbPriors.country)
      .orderBy(desc(sql`count(*)`))
      .limit(12),
  ]);

  return (
    <Card
      title={`Priors · ${country} (${rows.length}${rows.length === LIMIT ? "+" : ""})`}
      action={
        <span className="flex flex-wrap gap-2 font-mono text-[10px]">
          {["all", ...byCountry.map((c) => c.country).filter(Boolean)].map(
            (c) => (
              <Link
                key={String(c)}
                href={`/hkb?tab=priors&country=${c}`}
                className={
                  c === country
                    ? "font-bold underline"
                    : "underline decoration-dotted"
                }
              >
                {c === "all" ? "all" : countryName(String(c))}
              </Link>
            ),
          )}
        </span>
      }
    >
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>condition</th>
            <th className={TH}>country</th>
            <th className={TH}>sex</th>
            <th className={TH}>age</th>
            <th className={TH}>prevalence</th>
            <th className={TH}>source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className={TD}>{p.conditionId}</td>
              <td className={TD}>{p.country ?? "—"}</td>
              <td className={TD}>{p.sex ?? "—"}</td>
              <td className={TD}>
                {p.ageMin == null && p.ageMax == null
                  ? "—"
                  : `${p.ageMin ?? ""}–${p.ageMax ?? ""}`}
              </td>
              <td className={TD}>{(p.prevalence * 100).toFixed(1)}%</td>
              <td className="max-w-[560px] px-3 py-1.5 text-[11px] text-neutral-500">
                {p.source}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function testsTab() {
  const rows = await getDb()
    .select()
    .from(hkbTests)
    .orderBy(asc(hkbTests.name));
  const priced = rows.filter((t) => t.costByCountry);
  return (
    <Card title={`Tests (${rows.length}, ${priced.length} with a price)`}>
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>id</th>
            <th className={TH}>name</th>
            <th className={TH}>band</th>
            <th className={TH}>LR+</th>
            <th className={TH}>LR−</th>
            <th className={TH}>prices</th>
            <th className={TH}>reads</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className={TD}>{t.id}</td>
              <td className={TDT}>{t.name}</td>
              <td className={TD}>{t.cost}</td>
              <td className={TD}>{t.lrPos}</td>
              <td className={TD}>{t.lrNeg}</td>
              <td className={TD}>
                {Object.entries(t.costByCountry ?? {})
                  .map(([c, v]) => `${c} ${money(v)}`)
                  .join(" · ") || "—"}
              </td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-neutral-500">
                {t.featureIds.join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function calibrationTab() {
  const db = getDb();
  const [rows, rings, revisions] = await Promise.all([
    calibrationRows(),
    db
      .select({
        ring: hkbConditions.ring,
        inCatalog: hkbConditions.inCatalog,
        n: sql<number>`count(*)::int`,
      })
      .from(hkbConditions)
      .groupBy(hkbConditions.ring, hkbConditions.inCatalog)
      .orderBy(asc(hkbConditions.ring)),
    db.select().from(hkbRevisions).orderBy(desc(hkbRevisions.id)).limit(25),
  ]);

  const bands = bandsOf(rows);
  const names = new Map(
    (
      await db
        .select({ id: hkbConditions.id, name: hkbConditions.name })
        .from(hkbConditions)
        .where(
          rows.length
            ? inArray(hkbConditions.id, [
                ...new Set(rows.map((r) => r.conditionId)),
              ])
            : sql`false`,
        )
    ).map((c) => [c.id, c.name]),
  );

  return (
    <>
      <Card title={`Calibration (${rows.length} events)`}>
        {rows.length < READABLE_AT ? (
          <p className="font-body text-[13px] text-neutral-500">
            {rows.length} settled prediction{rows.length === 1 ? "" : "s"} so
            far. Too few to read: the table appears at {READABLE_AT}. An event
            is written when a discriminator with an LR+ of {RESOLVING_LR} or
            more comes back, or when an accepted document confirms or excludes a
            condition. Nothing here changes a probability; it is the measuring
            stick.
          </p>
        ) : (
          <table className="w-full font-mono text-[11px]">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <th className={TH}>band</th>
                <th className={TH}>n</th>
                <th className={TH}>mean predicted</th>
                <th className={TH}>observed rate</th>
                <th className={TH}>gap</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => (
                <tr key={b.label} className="border-b border-neutral-100">
                  <td className={TDT}>{b.label}</td>
                  <td className={TD}>{b.n}</td>
                  <td className={TD}>
                    {b.predicted == null
                      ? "—"
                      : `${(b.predicted * 100).toFixed(0)} %`}
                  </td>
                  <td className={TD}>
                    {b.observed == null
                      ? "—"
                      : `${(b.observed * 100).toFixed(0)} %`}
                  </td>
                  <td className={TD}>
                    {b.predicted == null || b.observed == null
                      ? "—"
                      : `${((b.observed - b.predicted) * 100).toFixed(0)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Rings">
        <table className="w-full font-mono text-[11px]">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className={TH}>ring</th>
              <th className={TH}>in catalog</th>
              <th className={TH}>conditions</th>
              <th className={TH}>what it means</th>
            </tr>
          </thead>
          <tbody>
            {rings.map((r) => (
              <tr
                key={`${r.ring}-${String(r.inCatalog)}`}
                className="border-b border-neutral-100"
              >
                <td className={TD}>{r.ring}</td>
                <td className={TD}>{r.inCatalog ? "yes" : "no"}</td>
                <td className={TD}>{r.n}</td>
                <td className={TDT}>
                  {r.ring === 1
                    ? "scored for everybody, every time"
                    : "dormant: a name and a rarity-class prior, scored only for a person something woke it for"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Knowledge-base revisions">
        <table className="w-full font-mono text-[11px]">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>when</th>
              <th className={TH}>what changed</th>
            </tr>
          </thead>
          <tbody>
            {revisions.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100">
                <td className={TD}>{r.id}</td>
                <td className={TD}>
                  {r.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className={TDT}>{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {rows.length > 0 && (
        <Card title="Every settled prediction">
          <table className="w-full font-mono text-[11px]">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <th className={TH}>condition</th>
                <th className={TH}>predicted</th>
                <th className={TH}>turned out</th>
                <th className={TH}>resolver</th>
                <th className={TH}>when</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, LIMIT).map((r, i) => (
                <tr
                  key={`${r.conditionId}-${r.resolver}-${i}`}
                  className="border-b border-neutral-100"
                >
                  <td className={TDT}>
                    {names.get(r.conditionId) ?? r.conditionId}
                  </td>
                  <td className={TD}>{(r.predicted * 100).toFixed(1)} %</td>
                  <td className={TD}>{r.resolved ? "yes" : "no"}</td>
                  <td className={TDT}>{r.resolver}</td>
                  <td className={TD}>{r.at.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

async function importsTab() {
  const db = getDb();
  const [runs, research, terms, annotations] = await Promise.all([
    db
      .select()
      .from(hkbImportRuns)
      .orderBy(desc(hkbImportRuns.ranAt))
      .limit(20),
    db
      .select()
      .from(hkbImportRuns)
      .where(eq(hkbImportRuns.script, "hkb-research"))
      .orderBy(desc(hkbImportRuns.ranAt))
      .limit(30),
    db
      .select({ ontology: hkbTerms.ontology, n: sql<number>`count(*)::int` })
      .from(hkbTerms)
      .groupBy(hkbTerms.ontology),
    db.select({ n: sql<number>`count(*)::int` }).from(hkbAnnotations),
  ]);

  return (
    <>
      <Card
        title="Run an importer"
        action={
          <span className="font-mono text-[10px] text-neutral-400">
            {terms.map((t) => `${t.ontology} ${t.n}`).join(" · ")} · annotations{" "}
            {annotations[0]?.n ?? 0}
          </span>
        }
      >
        <div className="flex flex-wrap gap-3">
          <RunImport script="ontology" label="HPO, MONDO, HPOA" />
          <RunImport script="priors" label="NCD-RisC priors" />
          <RunImport script="prices" label="Romanian prices" />
        </div>
        <p className="mt-3 font-body text-[12px] text-neutral-500">
          The ontology import downloads about 165 MB the first time and reuses
          the cache in <code>data/hkb/</code> after that. Every write is an
          upsert, so a second run changes nothing.
        </p>
      </Card>

      <Card title={`Research runs (${research.length})`}>
        <table className="w-full font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>ran at</th>
              <th className={TH}>hits</th>
              <th className={TH}>verified</th>
              <th className={TH}>extracted</th>
              <th className={TH}>proposed</th>
              <th className={TH}>new</th>
              <th className={TH}>tokens</th>
              <th className={TH}>condition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {research.length === 0 && (
              <tr>
                <td className={TD} colSpan={8}>
                  no research run yet
                </td>
              </tr>
            )}
            {research.map((r) => (
              <tr key={r.id}>
                <td className={TD}>
                  {r.ranAt?.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className={TD}>{r.rows?.hits ?? 0}</td>
                <td className={TD}>{r.rows?.verified ?? 0}</td>
                <td className={TD}>{r.rows?.extracted ?? 0}</td>
                <td className={TD}>{r.rows?.proposed ?? 0}</td>
                <td className={TD}>{r.rows?.written ?? 0}</td>
                <td className={TD}>{r.rows?.tokens ?? 0}</td>
                <td className="px-3 py-1.5 text-[11px] text-neutral-500">
                  {r.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Import runs (${runs.length})`}>
        <table className="w-full font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>ran at</th>
              <th className={TH}>script</th>
              <th className={TH}>rows</th>
              <th className={TH}>notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {runs.length === 0 && (
              <tr>
                <td className={TD} colSpan={4}>
                  never run
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id}>
                <td className={TD}>
                  {r.ranAt?.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className={TD}>{r.script}</td>
                <td className={TD}>
                  {Object.entries(r.rows ?? {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" ")}
                </td>
                <td className="px-3 py-1.5 text-[11px] text-neutral-500">
                  {r.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/**
 * The knowledge base with the lid off: what the engine reads, where each row
 * came from, and the queue of rows an importer proposed that nobody has looked
 * at yet. Admin only, and nothing here touches a user's data.
 */
export default async function HkbPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    country?: string;
    condition?: string;
  }>;
}) {
  if (!(await isAdmin())) notFound();
  const q = await searchParams;
  const tab = (TABS.includes(q.tab as Tab) ? q.tab : "conditions") as Tab;
  const status = q.status ?? "all";
  const country = q.country ?? "RO";
  const condition = q.condition ?? "all";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Knowledge base
        </h1>
        <p className="mt-1 max-w-3xl font-body text-[13px] text-neutral-500">
          Every condition the engine scores, every likelihood ratio it
          multiplies, and where each number came from. The acceptance policy
          decides in code: rows land already scoring, the ones worth a second
          look carry a chip, and Override is how you disagree with it.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/hkb?tab=${t}`}
            className={
              t === tab
                ? "border-b-2 border-accent-500 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-500"
                : "px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-500 hover:text-neutral-900"
            }
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === "conditions" && (await conditionsTab())}
      {tab === "evidence" && (await evidenceTab(status, condition))}
      {tab === "interventions" && (await interventionsTab(condition))}
      {tab === "activity" && (await activityTab())}
      {tab === "priors" && (await priorsTab(country))}
      {tab === "tests" && (await testsTab())}
      {tab === "calibration" && (await calibrationTab())}
      {tab === "imports" && (await importsTab())}
    </div>
  );
}
