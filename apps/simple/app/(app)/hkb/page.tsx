import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import {
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbEvidence,
  hkbImportRuns,
  hkbPriors,
  hkbTerms,
  hkbTests,
} from "@/db";
import { countryName } from "@/lib/countries";
import { money } from "@/lib/prices";
import {
  CatalogToggle,
  EvidenceButtons,
  RunImport,
} from "@/components/hkb-controls";
import { Badge } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const TABS = ["conditions", "evidence", "priors", "tests", "imports"] as const;
type Tab = (typeof TABS)[number];

const TH = "px-3 py-1.5 text-left font-bold";
const TD = "px-3 py-1.5 font-mono tabular-nums";
const TDT = "px-3 py-1.5";

const STATUS_BADGE: Record<
  string,
  "secondary" | "info" | "normal" | "warning"
> = {
  seed: "secondary",
  accepted: "normal",
  proposed: "info",
  rejected: "warning",
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
    db.select().from(hkbConditions).orderBy(asc(hkbConditions.id)),
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
    <Card title={`Conditions (${rows.length})`}>
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>id</th>
            <th className={TH}>name</th>
            <th className={TH}>MONDO</th>
            <th className={TH}>parent</th>
            <th className={TH}>catalog</th>
            <th className={TH}>evidence</th>
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

async function evidenceTab(status: string) {
  const db = getDb();
  const where = status === "all" ? undefined : eq(hkbEvidence.status, status);
  const [rows, total] = await Promise.all([
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
  ]);

  return (
    <Card
      title={`Evidence · ${status} (${rows.length}${rows.length === LIMIT ? "+" : ""})`}
      action={
        <span className="flex flex-wrap gap-2 font-mono text-[10px]">
          {["all", "proposed", "seed", "accepted", "rejected"].map((s) => (
            <Link
              key={s}
              href={`/hkb?tab=evidence&status=${s}`}
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
      <table className="w-full font-body text-[12px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className={TH}>condition</th>
            <th className={TH}>rule</th>
            <th className={TH}>reads</th>
            <th className={TH}>when</th>
            <th className={TH}>LR+</th>
            <th className={TH}>LR−</th>
            <th className={TH}>grade</th>
            <th className={TH}>status</th>
            <th className={TH}>source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 && (
            <tr>
              <td className={TD} colSpan={9}>
                nothing with that status
              </td>
            </tr>
          )}
          {rows.map((e) => (
            <tr key={e.id}>
              <td className={TD}>{e.conditionId}</td>
              <td className={TD}>{e.id}</td>
              <td className={TD}>{e.featureId}</td>
              <td className={TD}>{JSON.stringify(e.conditionOn)}</td>
              <td className={TD}>{e.lrPos}</td>
              <td className={TD}>{e.lrNeg ?? "—"}</td>
              <td className={TD}>{e.grade}</td>
              <td className={TD}>
                <span className="flex flex-col items-start gap-1">
                  <Badge variant={STATUS_BADGE[e.status] ?? "secondary"}>
                    {e.status}
                  </Badge>
                  {e.status === "proposed" && <EvidenceButtons id={e.id} />}
                </span>
              </td>
              <td className="max-w-[520px] px-3 py-1.5 text-[11px] text-neutral-500">
                {e.source}
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

async function importsTab() {
  const db = getDb();
  const [runs, terms, annotations] = await Promise.all([
    db
      .select()
      .from(hkbImportRuns)
      .orderBy(desc(hkbImportRuns.ranAt))
      .limit(20),
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
  searchParams: Promise<{ tab?: string; status?: string; country?: string }>;
}) {
  if (!(await isAdmin())) notFound();
  const q = await searchParams;
  const tab = (TABS.includes(q.tab as Tab) ? q.tab : "conditions") as Tab;
  const status = q.status ?? "proposed";
  const country = q.country ?? "RO";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Knowledge base
        </h1>
        <p className="mt-1 max-w-3xl font-body text-[13px] text-neutral-500">
          Every condition the engine scores, every likelihood ratio it
          multiplies, and where each number came from. Rows an importer proposed
          do not score until somebody accepts them here.
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
      {tab === "evidence" && (await evidenceTab(status))}
      {tab === "priors" && (await priorsTab(country))}
      {tab === "tests" && (await testsTab())}
      {tab === "imports" && (await importsTab())}
    </div>
  );
}
