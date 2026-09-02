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
import { EvidenceChip } from "@/components/evidence-chip";
import { PillTabs } from "@/components/pill-tabs";
import { basisOfGrade } from "@/lib/actions";

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

const STATUS_TONE: Record<string, StateTone> = {
  seed: "none",
  accepted: "on",
  proposed: "none",
  rejected: "border",
};

/** The row limit on every table here: this is a review page, not an export. */
const LIMIT = 300;

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  /** the mono line on the right of the head: real row counts, never a mood */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {right && <span className="r">{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** "300 shown · 1 284 in the ring · no pagination", from the real numbers. */
const shown = (n: number, total?: number) =>
  `${n}${n === LIMIT ? "+" : ""} ${n === 1 ? "row" : "rows"} shown` +
  (total == null ? "" : ` · ${total} in the ring`) +
  ` · no pagination`;

/**
 * The grade cell, as the mark plus its letter (● A, ● B, ○ E).
 *
 * The mapping is not rewritten here: `basisOfGrade` already decides that D and
 * E rest on somebody's story and everything else on a study, and
 * `EvidenceChip` already owns the glyph and the tooltip.
 */
function Grade({ grade }: { grade: string }) {
  return <EvidenceChip basis={basisOfGrade(grade)} grade={grade} />;
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
    <Panel title="Conditions" right={`ring 1 · ${shown(rows.length)}`}>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>id</th>
              <th>name</th>
              <th>MONDO</th>
              <th>parent</th>
              <th>catalog</th>
              <th>evidence</th>
              <th>research</th>
              <th>why in the catalog · prior source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const n = counts.get(c.id) ?? {};
              return (
                <tr key={c.id}>
                  <td className="k n">{c.id}</td>
                  <td className="k">{c.name}</td>
                  <td className="n">
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
                  <td className="n">{c.parentId ?? "—"}</td>
                  <td>
                    <CatalogToggle id={c.id} inCatalog={c.inCatalog} />
                  </td>
                  <td className="n">
                    {Object.entries(n)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ") || "none"}
                  </td>
                  <td>
                    <ResearchButton conditionId={c.id} />
                  </td>
                  <td>
                    {c.why ?? "—"}
                    <br />
                    <span className="t-meta">
                      {priorBy.get(c.id) ?? "no base prior"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
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
    <Panel
      title="Evidence"
      right={shown(
        rows.length,
        total.reduce((a, b) => a + b.n, 0),
      )}
    >
      <div className="filters mb-[var(--s13)]">
        {["all", "proposed", "seed", "accepted", "rejected"].map((s) => (
          <Link
            key={s}
            href={href(s, condition)}
            className={s === status ? "f on" : "f"}
          >
            {s}{" "}
            {total.find((t) => t.status === s)?.n ??
              (s === "all" ? total.reduce((a, b) => a + b.n, 0) : 0)}
          </Link>
        ))}
      </div>
      <div className="filters mb-[var(--s13)]">
        {[{ conditionId: "all", n: rows.length }, ...conditions].map((c) => (
          <Link
            key={c.conditionId}
            href={href(status, c.conditionId)}
            className={c.conditionId === condition ? "f on" : "f"}
          >
            {c.conditionId} {c.n}
          </Link>
        ))}
      </div>
      {/* The phone note admin.html section 04 draws: the table is 1 200 px and
          says so rather than pretending to fit. Nothing is hidden. */}
      <div className="empty mb-[var(--s13)] md:hidden">
        <span className="k">Narrow screen</span>
        <p>
          The evidence table is 1 200 px wide. It scrolls sideways here and
          keeps the claim column pinned, so a row never loses its name.
        </p>
      </div>
      <div className="tblwrap">
        <table className="tbl wide">
          <thead>
            <tr>
              <th>condition</th>
              <th>rule</th>
              <th>reads</th>
              <th>when</th>
              <th>LR+</th>
              <th>LR−</th>
              <th>pooled</th>
              <th>papers</th>
              <th>grade</th>
              <th>status</th>
              <th>source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11}>nothing with that status</td>
              </tr>
            )}
            {rows.map((e) => {
              const p = pooled.get(keyOf(e));
              return (
                <tr key={e.id}>
                  <td className="k n">{e.conditionId}</td>
                  <td className="n max-w-[150px] truncate" title={e.id}>
                    {e.id}
                  </td>
                  <td className="n">{e.featureId}</td>
                  <td className="n">{JSON.stringify(e.conditionOn)}</td>
                  <td className="n">{e.lrPos}</td>
                  <td className="n">{e.lrNeg ?? "—"}</td>
                  <td className="n" title="what the engine multiplies by">
                    {p ? p.lrPos : "—"}
                  </td>
                  <td className="n">{p ? p.n : 0}</td>
                  <td>
                    <Grade grade={e.grade} />
                  </td>
                  <td>
                    <span className="flex flex-col items-start gap-1">
                      <StateWord tone={STATUS_TONE[e.status]}>
                        {e.status}
                      </StateWord>
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
                  <td className="max-w-[420px]">
                    {e.paper && (
                      <>
                        <a
                          href={e.paper.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {e.paper.title}
                        </a>{" "}
                        <span className="t-num">
                          {[e.paper.journal, e.paper.year]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                        <p className="my-1 border-l-2 border-[var(--hair)] pl-2 italic">
                          “{e.paper.quote}”
                        </p>
                      </>
                    )}
                    {e.source}
                    {e.reviewNote && (
                      <p className="t-meta mt-1">reviewed: {e.reviewNote}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
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
    <Panel title="Interventions" right={shown(rows.length)}>
      <p className="t-meta mb-[var(--s13)]">
        A and B are candidate actions, C is early, D and E are the horizon and
        only ever offered with a measurement plan.
      </p>
      <div className="mb-[var(--s21)] border-b border-[var(--hair)] pb-[var(--s21)]">
        <p className="t-meta mb-[var(--s8)]">
          Whatever is popular this month gets a door in. The engine reads the
          science the claim implies, and files the popular form itself as grade
          E, anecdotal, on the horizon shelf with a measurement plan. Nothing
          filed here can move a probability.
        </p>
        <ClaimBox />
      </div>
      <div className="filters mb-[var(--s13)]">
        {[{ conditionId: "all", n: rows.length }, ...byCondition].map((c) => (
          <Link
            key={c.conditionId}
            href={`/hkb?tab=interventions&condition=${c.conditionId}`}
            className={c.conditionId === condition ? "f on" : "f"}
          >
            {c.conditionId} {c.n}
          </Link>
        ))}
      </div>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>condition</th>
              <th>tier</th>
              <th>what</th>
              <th>dose</th>
              <th>for</th>
              <th>effect</th>
              <th>grade</th>
              <th>paper</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  nothing read yet — run the research job on a condition
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="k n">{r.conditionId}</td>
                <td>
                  <Tier tier={tierOf(r.grade)} />
                  {r.status === "horizon" && (
                    <span className="t-meta ml-1">
                      horizon · {r.population ?? "unknown"}
                    </span>
                  )}
                </td>
                <td className="k">{r.name}</td>
                <td className="n">{r.dose ?? "—"}</td>
                <td className="n">{r.duration ?? "—"}</td>
                <td className="n">
                  {r.direction}
                  {r.effect ? ` ${r.effect}` : ""}
                  {r.outcomeFeatureId ? ` in ${r.outcomeFeatureId}` : ""}
                </td>
                <td>
                  <Grade grade={r.grade} />
                </td>
                <td className="max-w-[460px]">
                  {r.paper && (
                    <a
                      href={r.paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {r.paper.title}
                    </a>
                  )}
                  {r.quote && (
                    <p className="my-1 border-l-2 border-[var(--hair)] pl-2 italic">
                      “{r.quote}”
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** The last 100 things the knowledge base did, newest first. */
async function activityTab() {
  const db = getDb();
  const FEED = 100;
  const [evidence, minted, interventions, runs, secondPass] = await Promise.all(
    [
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
    ],
  );

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
    <Panel
      title="Activity"
      right={`last ${feed.length} · what the knowledge base did on its own`}
    >
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>when</th>
              <th>what</th>
              <th>detail</th>
            </tr>
          </thead>
          <tbody>
            {feed.length === 0 && (
              <tr>
                <td colSpan={3}>nothing has happened yet</td>
              </tr>
            )}
            {feed.map((row, i) => (
              <tr key={`${row.kind}-${i}`}>
                <td className="k n">
                  {row.at?.toISOString().slice(0, 19).replace("T", " ") ?? "—"}
                </td>
                <td>
                  <StateWord tone={STATUS_TONE[row.kind]}>{row.kind}</StateWord>
                </td>
                <td>{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
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
    <Panel title="Priors" right={`${country} · ${shown(rows.length)}`}>
      <div className="filters mb-[var(--s13)]">
        {["all", ...byCountry.map((c) => c.country).filter(Boolean)].map(
          (c) => (
            <Link
              key={String(c)}
              href={`/hkb?tab=priors&country=${c}`}
              className={c === country ? "f on" : "f"}
            >
              {c === "all" ? "all" : countryName(String(c))}
            </Link>
          ),
        )}
      </div>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>condition</th>
              <th>country</th>
              <th>sex</th>
              <th>age</th>
              <th>prevalence</th>
              <th>source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="k n">{p.conditionId}</td>
                <td className="n">{p.country ?? "—"}</td>
                <td className="n">{p.sex ?? "—"}</td>
                <td className="n">
                  {p.ageMin == null && p.ageMax == null
                    ? "—"
                    : `${p.ageMin ?? ""}–${p.ageMax ?? ""}`}
                </td>
                <td className="n">{(p.prevalence * 100).toFixed(1)}%</td>
                <td className="max-w-[560px]">{p.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function testsTab() {
  const rows = await getDb()
    .select()
    .from(hkbTests)
    .orderBy(asc(hkbTests.name));
  const priced = rows.filter((t) => t.costByCountry);
  return (
    <Panel
      title="Tests"
      right={`${shown(rows.length)} · ${priced.length} with a price`}
    >
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>id</th>
              <th>name</th>
              <th>band</th>
              <th>LR+</th>
              <th>LR−</th>
              <th>prices</th>
              <th>reads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="k n">{t.id}</td>
                <td className="k">{t.name}</td>
                <td className="n">{t.cost}</td>
                <td className="n">{t.lrPos}</td>
                <td className="n">{t.lrNeg}</td>
                <td className="n">
                  {Object.entries(t.costByCountry ?? {})
                    .map(([c, v]) => `${c} ${money(v)}`)
                    .join(" · ") || "—"}
                </td>
                <td className="n">{t.featureIds.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
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
      <Panel title="Calibration" right={`${rows.length} settled events`}>
        {rows.length < READABLE_AT ? (
          <p className="t-body">
            {rows.length} settled prediction{rows.length === 1 ? "" : "s"} so
            far. Too few to read: the table appears at {READABLE_AT}. An event
            is written when a discriminator with an LR+ of {RESOLVING_LR} or
            more comes back, or when an accepted document confirms or excludes a
            condition. Nothing here changes a probability; it is the measuring
            stick.
          </p>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>band</th>
                  <th>n</th>
                  <th>mean predicted</th>
                  <th>observed rate</th>
                  <th>gap</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.label}>
                    <td className="k">{b.label}</td>
                    <td className="n">{b.n}</td>
                    <td className="n">
                      {b.predicted == null
                        ? "—"
                        : `${(b.predicted * 100).toFixed(0)} %`}
                    </td>
                    <td className="n">
                      {b.observed == null
                        ? "—"
                        : `${(b.observed * 100).toFixed(0)} %`}
                    </td>
                    <td className="n">
                      {b.predicted == null || b.observed == null
                        ? "—"
                        : `${((b.observed - b.predicted) * 100).toFixed(0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Rings" right={`${rings.length} rows`}>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ring</th>
                <th>in catalog</th>
                <th>conditions</th>
                <th>what it means</th>
              </tr>
            </thead>
            <tbody>
              {rings.map((r) => (
                <tr key={`${r.ring}-${String(r.inCatalog)}`}>
                  <td className="k n">{r.ring}</td>
                  <td className="n">{r.inCatalog ? "yes" : "no"}</td>
                  <td className="n">{r.n}</td>
                  <td>
                    {r.ring === 1
                      ? "scored for everybody, every time"
                      : "dormant: a name and a rarity-class prior, scored only for a person something woke it for"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Knowledge-base revisions"
        right={`${revisions.length} shown · newest first`}
      >
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>when</th>
                <th>what changed</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((r) => (
                <tr key={r.id}>
                  <td className="k n">{r.id}</td>
                  <td className="n">
                    {r.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td>{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {rows.length > 0 && (
        <Panel
          title="Every settled prediction"
          right={`${Math.min(rows.length, LIMIT)} of ${rows.length} shown`}
        >
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>condition</th>
                  <th>predicted</th>
                  <th>turned out</th>
                  <th>resolver</th>
                  <th>when</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, LIMIT).map((r, i) => (
                  <tr key={`${r.conditionId}-${r.resolver}-${i}`}>
                    <td className="k">
                      {names.get(r.conditionId) ?? r.conditionId}
                    </td>
                    <td className="n">{(r.predicted * 100).toFixed(1)} %</td>
                    <td>
                      <StateWord tone={r.resolved ? "on" : "off"}>
                        {r.resolved ? "yes" : "no"}
                      </StateWord>
                    </td>
                    <td>{r.resolver}</td>
                    <td className="n">{r.at.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
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
      <Panel
        title="Run an importer"
        right={`${terms.map((t) => `${t.ontology} ${t.n}`).join(" · ")} · annotations ${annotations[0]?.n ?? 0}`}
      >
        <div className="rowh">
          <RunImport script="ontology" label="HPO, MONDO, HPOA" />
          <RunImport script="priors" label="NCD-RisC priors" />
          <RunImport script="prices" label="Romanian prices" />
        </div>
        <p className="t-meta mt-[var(--s13)]">
          The ontology import downloads about 165 MB the first time and reuses
          the cache in <code>data/hkb/</code> after that. Every write is an
          upsert, so a second run changes nothing.
        </p>
      </Panel>

      <Panel title="Research runs" right={`${shown(research.length)}`}>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ran at</th>
                <th>hits</th>
                <th>verified</th>
                <th>extracted</th>
                <th>proposed</th>
                <th>new</th>
                <th>tokens</th>
                <th>condition</th>
              </tr>
            </thead>
            <tbody>
              {research.length === 0 && (
                <tr>
                  <td colSpan={8}>no research run yet</td>
                </tr>
              )}
              {research.map((r) => (
                <tr key={r.id}>
                  <td className="k n">
                    {r.ranAt?.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="n">{r.rows?.hits ?? 0}</td>
                  <td className="n">{r.rows?.verified ?? 0}</td>
                  <td className="n">{r.rows?.extracted ?? 0}</td>
                  <td className="n">{r.rows?.proposed ?? 0}</td>
                  <td className="n">{r.rows?.written ?? 0}</td>
                  <td className="n">{r.rows?.tokens ?? 0}</td>
                  <td>{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Import runs" right={`${shown(runs.length)}`}>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ran at</th>
                <th>script</th>
                <th>rows</th>
                <th>notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={4}>never run</td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="k n">
                    {r.ranAt?.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="n">{r.script}</td>
                  <td className="n">
                    {Object.entries(r.rows ?? {})
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" ")}
                  </td>
                  <td>{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
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
    <div className="space-y-[var(--s13)]">
      <div>
        <h1 className="t-title text-[length:var(--type-xl)] leading-none">
          Knowledge base
        </h1>
        <p className="t-meta mt-1 max-w-3xl text-[length:var(--type-sm)]">
          Every condition the engine scores, every likelihood ratio it
          multiplies, and where each number came from. The acceptance policy
          decides in code: rows land already scoring, the ones worth a second
          look carry a chip, and Override is how you disagree with it.
        </p>
      </div>

      <div className="rowh">
        <PillTabs
          label="Knowledge base"
          active={tab}
          tabs={TABS.map((t) => ({ id: t, label: t, href: `/hkb?tab=${t}` }))}
        />
      </div>

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
