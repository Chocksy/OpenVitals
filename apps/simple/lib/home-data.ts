/**
 * The four key-trend charts on Home, derived on the server from the metric
 * rows.
 *
 * ponytail: the counters, the score and the attention list moved into
 * `lib/ledger.ts` with the phase-12 rewrite, so this file is one function now.
 */
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import {
  checkinPosts,
  documentItems,
  genomeVariants,
  getDb,
  lifeEvents,
  profileFacts,
  profileFactHistory,
  protocolItems,
  readings,
  uploads,
  type CheckinPost,
} from "@/db";
import { askSurfaces, type Ask, type AskPlan } from "./asking";
import { buildModelInput } from "./coverage";
import {
  documentFinding,
  explainKey,
  genomeFinding,
  FINDING_DAYS,
  type AcceptedItem,
  type Finding,
} from "./explain";
import { callGenome } from "./genome";
import type { MetricRow } from "./data";
import { tagsOfEvent } from "./facts";
import { catalogFor } from "./hkb";
import { nextMoves } from "./infogain";
import { dueFacts, revisitAtFor, type DueFact } from "./revisit";
import { healthStatus, type HealthStatus } from "./status";
import { PROFILE_QUESTIONS } from "./vectors";
import type { Conclusion, Ledger } from "./ledger";

/** The profile fact key a card's own question would answer. */
export const askKeyOf = (c: Conclusion): string | undefined =>
  c.question?.featureId.replace(/^fact:/, "");

/**
 * Where each question is asked on Home, decided once for the whole page.
 *
 * The page renders from this and so does `GET /api/ledger`, so the question
 * the Today card advances to after an answer is the same one a reload would
 * have shown. Phase 24a wrote the rule; phase 24d needed both callers to
 * agree, which is why it lives here and not inside the page.
 */
export function homeAskPlan(
  ledger: Ledger,
  due: DueFact[],
  /** the key a link asked for: `/?ask=smoking` */
  want?: string,
): AskPlan {
  /**
   * A link can name a question the engine is not currently ranking — every
   * open review item on /plan links here. So the wanted key joins the gain
   * list with its catalog wording and no effect line, rather than dropping the
   * reader on somebody else's question.
   */
  const gain =
    want && PROFILE_QUESTIONS[want] && !ledger.asks.some((a) => a.key === want)
      ? [
          { key: want, question: PROFILE_QUESTIONS[want].question, moves: [] },
          ...ledger.asks,
        ]
      : ledger.asks;

  return askSurfaces(
    {
      due: due.map((d) => d.key),
      gain,
      others: ledger.conclusions.flatMap((c) => {
        const key = askKeyOf(c);
        return key ? [{ where: `card:${c.id}`, keys: [key] }] : [];
      }),
    },
    want,
  );
}

/** The options that question offers, empty for a free-text one. */
export const optionsFor = (key: string): string[] =>
  PROFILE_QUESTIONS[key]?.options ?? [];

/** One card's question as a link, when the plan says this card only links. */
export function linkedAsk(
  ledger: Ledger,
  plan: AskPlan,
  c: Conclusion,
): Ask | undefined {
  const key = askKeyOf(c);
  if (!key || !plan.links.includes(key)) return undefined;
  return (
    ledger.asks.find((a) => a.key === key) ?? {
      key,
      question: c.question!.label,
      moves: [],
    }
  );
}

/** The bands a reading is judged against, i.e. the range bar's props. */
export interface Bands {
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
}

export interface TrendMetric extends Bands {
  metricCode: string;
  metricName: string;
  unit: string | null;
  status: HealthStatus;
  points: { date: string; value: number }[];
  latestValue: number;
  prevValue: number | null;
  /** the day the previous draw landed, so the ruler's hollow mark is dated */
  prevDate: string | null;
  goalLow: number | null;
  goalHigh: number | null;
  /** the day the goal is due, so the chart can aim its projection */
  goalDue: string | null;
}

const bandsOf = (m: MetricRow): Bands => ({
  refLow: m.latest.refLow,
  refHigh: m.latest.refHigh,
  optimalLow: m.optimalLow,
  optimalHigh: m.optimalHigh,
});

const rowStatus = (m: MetricRow): HealthStatus =>
  healthStatus({ value: m.latest.value, ...bandsOf(m) });

/** One key-trend chart: the line, its bands and the goal tick. */
export function buildTrend(
  m: MetricRow,
  goal?: {
    targetLow: number | null;
    targetHigh: number | null;
    due?: string | null;
  } | null,
): TrendMetric | null {
  if (m.points.length < 3 || m.latest.value == null) return null;
  const values = m.rows.filter((r) => r.value != null);
  return {
    metricCode: m.code,
    metricName: m.name,
    unit: m.latest.unit ?? m.unit,
    status: rowStatus(m),
    points: m.points,
    latestValue: m.latest.value,
    prevValue: values[values.length - 2]?.value ?? null,
    prevDate: values[values.length - 2]?.observedAt ?? null,
    goalLow: goal?.targetLow ?? null,
    goalHigh: goal?.targetHigh ?? null,
    goalDue: goal?.due ?? null,
    ...bandsOf(m),
  };
}

/* ── the Today card (phase 20) ────────────────────────────────────────── */

export interface Today {
  /** at most two answers worth re-asking, best reason first */
  due: DueFact[];
  /** the last check-in, so Home can print its reply in one line */
  post: {
    id: string;
    date: string;
    text: string;
    reply: string | null;
    chips: number;
  } | null;
}

/**
 * What Home puts at the top: the re-asks that are due, and the last reply.
 *
 * Every trigger `dueFacts` reads is looked up here and nowhere else: the
 * newest draw, the adopted actions, the life events that are going on, and the
 * fact keys the information-gain engine currently wants. The arithmetic stays
 * in `lib/revisit.ts`, which is why it is testable to the day.
 */
export async function buildToday(userId: string): Promise<Today> {
  const db = getDb();
  const [m, catalog] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
  ]);

  const [facts, history, draw, actions, events, posts] = await Promise.all([
    db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
    db
      .select()
      .from(profileFactHistory)
      .where(eq(profileFactHistory.userId, userId)),
    db
      .select({ observedAt: readings.observedAt })
      .from(readings)
      .where(eq(readings.userId, userId))
      .orderBy(desc(readings.observedAt))
      .limit(1),
    db
      .select({ text: protocolItems.text })
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    db
      .select()
      .from(lifeEvents)
      .where(
        and(eq(lifeEvents.userId, userId), isNotNull(lifeEvents.startedAt)),
      ),
    db
      .select()
      .from(checkinPosts)
      .where(eq(checkinPosts.userId, userId))
      .orderBy(desc(checkinPosts.createdAt))
      .limit(1),
  ]);

  const openFrom = new Map<string, string>();
  for (const h of history)
    if (h.changeKind !== "corrected" && h.validTo == null)
      openFrom.set(h.key, h.validFrom);

  // A fact answered before phase 20 has no `revisit_at`, so its cadence is
  // worked out from the day it started holding. That is cheaper and safer than
  // a backfill, and it means the column only ever caches the arithmetic.
  const rows = facts.map((f) => {
    const validFrom =
      openFrom.get(f.key) ??
      (f.answeredAt ?? new Date()).toISOString().slice(0, 10);
    return {
      key: f.key,
      value: f.value,
      validFrom,
      revisitAt: f.revisitAt ?? revisitAtFor(f.key, validFrom, f.value),
    };
  });

  // Anything still going on today, by the same tags a confounder uses.
  const eventTags = [
    ...new Set(
      events
        .filter((e) => (e.endedAt ?? m.today) >= m.today)
        .flatMap((e) => tagsOfEvent(e)),
    ),
  ];

  const gainKeys = nextMoves(m, catalog, { max: 6 })
    .filter((mv) => mv.kind === "question")
    .map((mv) => mv.featureId.replace(/^fact:/, ""));

  const due = dueFacts(
    m,
    rows,
    {
      newDrawSince: draw[0]?.observedAt,
      adopted: actions.map((a) => a.text),
      eventTags,
      gainKeys,
    },
    m.today,
  );

  const last = posts[0] as CheckinPost | undefined;
  return {
    due,
    post: last
      ? {
          id: last.id,
          date: (last.createdAt ?? new Date()).toISOString().slice(0, 10),
          text: last.text,
          reply: last.reply,
          chips: (last.chips ?? []).length,
        }
      : null,
  };
}

/**
 * The cards a fresh upload earns: "What your genome changed" for a fortnight
 * after a genome file, the same for a document. The picking and the window are
 * in `lib/explain.ts` and tested there; this function only fetches.
 *
 * ponytail: one query for the recent uploads, then one query each for what
 * they carry. Nothing is stored: the card is a view over the upload date.
 */
export async function recentFindings(
  userId: string,
  today: string,
): Promise<Finding[]> {
  const db = getDb();
  const since = new Date(Date.parse(today) - FINDING_DAYS * 86400000);
  const recent = await db
    .select({
      id: uploads.id,
      kind: uploads.kind,
      createdAt: uploads.createdAt,
      docMeta: uploads.docMeta,
    })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        eq(uploads.status, "done"),
        isNotNull(uploads.createdAt),
        gte(uploads.createdAt, since),
        inArray(uploads.kind, ["genome", "document"]),
      ),
    )
    .orderBy(desc(uploads.createdAt));
  if (!recent.length) return [];

  const dayOf = (d: Date | null) =>
    (d ?? new Date()).toISOString().slice(0, 10);
  const out: Finding[] = [];

  const genome = recent.find((u) => u.kind === "genome");
  if (genome) {
    const variants = await db
      .select()
      .from(genomeVariants)
      .where(
        and(
          eq(genomeVariants.userId, userId),
          eq(genomeVariants.uploadId, genome.id),
        ),
      );
    const finding = genomeFinding(
      { id: genome.id, at: dayOf(genome.createdAt) },
      callGenome(variants),
      today,
    );
    if (finding) out.push(finding);
  }

  const docs = recent.filter((u) => u.kind === "document");
  if (docs.length) {
    const items = await db
      .select()
      .from(documentItems)
      .where(
        and(
          eq(documentItems.userId, userId),
          eq(documentItems.status, "accepted"),
          inArray(
            documentItems.uploadId,
            docs.map((d) => d.id),
          ),
        ),
      );
    for (const doc of docs) {
      const mine: AcceptedItem[] = items
        .filter((i) => i.uploadId === doc.id)
        .map((i) => {
          const p = i.payload as Record<string, unknown>;
          const moved = typeof p.icd10 === "string" ? p.icd10 : undefined;
          return {
            kind: i.kind,
            text: String(p.text ?? p.name ?? i.excerpt ?? ""),
            ...(moved ? { moved: `${i.kind} · ${moved}` } : {}),
          };
        })
        .filter((i) => i.text.trim() !== "");
      const finding = documentFinding(
        { id: doc.id, at: dayOf(doc.createdAt), docType: doc.docMeta?.docType },
        mine,
        today,
      );
      if (finding) out.push(finding);
    }
  }

  return out;
}

/* ── the rail (phase 28c) ─────────────────────────────────────────────── */

/** "red" is the engine's word for it. A person says "off". */
export const WORST_WORD = {
  red: "off",
  amber: "borderline",
  green: "good",
  gray: "no reading",
} as const;

/** Spectrum logic: three tones, plus "never measured" and Kite's navy. */
export type RailTone = "bad" | "warn" | "ok" | "none";

export interface RailCard {
  kind: "status" | "body" | "blood" | "plan" | "system";
  label: string;
  /** the big line: a number (mono, 34 px) or a title (sans, 21 px) */
  headline: string;
  big: "num" | "title";
  /** what sits next to the headline: "at 43", "/ 22 markers", a unit */
  sub?: string;
  /** the Status card only: three counters, each with the word for it */
  counts?: { n: number; word: string; tone: RailTone }[];
  /** the 13 px line at the bottom */
  line: string;
  tone: RailTone;
  href: string;
}

/** red first, then amber, then green; ties by score, worst first. */
const SYSTEM_RANK = { red: 3, amber: 2, gray: 1, green: 0 } as const;

const TONE_OF = {
  red: "bad",
  amber: "warn",
  green: "ok",
  gray: "none",
} as const;

/** The first sentence of a reply, so a card never prints a paragraph. */
const firstSentence = (text: string) =>
  (text.split(/(?<=[.!?])\s/)[0] ?? text).trim();

/** "2 new, 1 stronger since Aug 31", or "" when nothing moved. */
function sinceLine(since: Ledger["since"]): string {
  if (!since) return "";
  const parts = (
    [
      ["resolved", since.resolved],
      ["new", since.new],
      ["stronger", since.stronger],
      ["weaker", since.weaker],
    ] as const
  ).filter(([, n]) => n > 0);
  if (!parts.length) return "";
  const when = new Date(since.at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${parts.map(([w, n]) => `${n} ${w}`).join(", ")} since ${when}`;
}

/**
 * The cards at the top of Home, in the one order the page may print them:
 * Status, Body, Blood, Plan, then one card per system that has a reading —
 * red first, then amber, then green, ties by score descending.
 *
 * Pure, so `lib/home-data.test.ts` can lock the order. Every number comes off
 * the ledger or Today; a card with nothing to say drops its line rather than
 * inventing one.
 */
export function railCards(
  ledger: Ledger,
  today: Today,
  opts: {
    /** how many actions the latest report wrote (the Plan card needs one) */
    actions?: number;
    /** how many to-do lines the loud conclusions carry, from `actionsForAll` */
    todo?: number;
    /** the newest observation date, for the Status line when nothing moved */
    drawDate?: string;
  } = {},
): RailCard[] {
  const { bioAge, bioAgeMissing, counters, systems, spear, since } = ledger;
  const cards: RailCard[] = [];

  const worstTone: RailTone =
    counters.off > 0
      ? "bad"
      : counters.normal > 0
        ? "warn"
        : counters.optimal > 0
          ? "ok"
          : "none";

  cards.push({
    kind: "status",
    label: "Status",
    headline: "",
    big: "num",
    counts: [
      { n: counters.off, word: "off", tone: "bad" },
      { n: counters.normal, word: "borderline", tone: "warn" },
      { n: counters.optimal, word: "optimal", tone: "ok" },
    ],
    line:
      sinceLine(since) ||
      (opts.drawDate
        ? `Newest draw ${new Date(opts.drawDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}`
        : ""),
    tone: worstTone,
    href: "/plan",
  });

  cards.push({
    kind: "body",
    label: "Body",
    headline: bioAge ? bioAge.pheno.toFixed(1) : "—",
    big: "num",
    ...(bioAge ? { sub: `at ${bioAge.chrono}` } : {}),
    line: bioAge
      ? today.due[0]?.question ||
        (today.post?.reply ? firstSentence(today.post.reply) : "") ||
        "Nothing due today"
      : bioAgeMissing.length
        ? `PhenoAge is waiting on ${bioAgeMissing.join(", ")}`
        : "",
    tone: "none",
    href: "/today",
  });

  const total = counters.off + counters.normal + counters.optimal;
  cards.push({
    kind: "blood",
    label: "Blood",
    headline: String(counters.off),
    big: "num",
    sub: `/ ${total} markers`,
    line: counters.nextDrawCodes.length
      ? `Next draw${
          counters.nextDrawWeeks != null
            ? ` in ${counters.nextDrawWeeks} wk`
            : ""
        }: ${counters.nextDrawCodes.map((c) => explainKey(c)).join(", ")}`
      : "Nothing queued",
    tone: counters.off > 0 ? "bad" : "ok",
    href: "/blood?tab=draws",
  });

  // the spear's own title is already the sentence at the top of the page, so
  // the Plan card prints the first action, or nothing but its own name
  const planTitle = spear?.action?.title;
  if (planTitle || (opts.actions ?? 0) > 0) {
    cards.push({
      kind: "plan",
      label: "Plan",
      headline: planTitle ?? "Your plan",
      big: "title",
      line: opts.todo
        ? `${opts.todo} to do`
        : opts.actions
          ? `${opts.actions} in your plan`
          : "",
      tone: "none",
      href: "/plan",
    });
  }

  const measured = systems
    .filter((s) => s.worst != null && s.worst.value != null)
    .sort(
      (a, b) =>
        SYSTEM_RANK[b.worst!.status] - SYSTEM_RANK[a.worst!.status] ||
        b.score - a.score,
    );

  for (const s of measured) {
    const w = s.worst!;
    cards.push({
      kind: "system",
      label: s.name,
      headline: String(w.value),
      big: "num",
      ...(w.unit ? { sub: w.unit } : {}),
      line: `${explainKey(w.code)} ${WORST_WORD[w.status]}`,
      tone: TONE_OF[w.status],
      href: `/blood/m/${w.code}`,
    });
  }

  return cards;
}
