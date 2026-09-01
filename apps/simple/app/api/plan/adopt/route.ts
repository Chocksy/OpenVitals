import { and, eq, inArray } from "drizzle-orm";
import {
  getDb,
  goals,
  hkbInterventions,
  metrics,
  protocolItems,
  reports,
  reviewItems,
  type ReportAction,
} from "@/db";
import { adoptBodyOf } from "@/lib/actions";
import { currentUserId } from "@/lib/auth";
import { recordBeliefs } from "@/lib/ledger";
import { queueResearch } from "@/lib/research";

const DAY = 86_400_000;

/** The first number in "LDL down to 70 mg/dL". */
const firstNumber = (text: string): number | null => {
  const hit = text.replace(/[,\s](?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/);
  return hit ? Number(hit[0]) : null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The id of the protocol item this action already is, when it is one.
 *
 * `lib/ledger.ts` joins the plan to the protocol by "the item's text starts
 * with the action's title", so the same join answers "have they got this
 * already?" and adopting twice is one line rather than two.
 */
async function onProtocol(userId: string, text: string): Promise<string | null> {
  const title = text.split(" — ")[0]!;
  const rows = await getDb()
    .select({ id: protocolItems.id, text: protocolItems.text })
    .from(protocolItems)
    .where(
      and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
    );
  return rows.find((r) => r.text.startsWith(title))?.id ?? null;
}

const doseSummary = (a: ReportAction) =>
  a.dose ? `${a.title} — ${a.dose.amount}, ${a.dose.schedule}` : a.title;

/**
 * Take one action off the plan and turn it into everything that makes it real:
 * a protocol item to tick, a check-in for each follow-up dated in the future,
 * and a goal for every target whose expected value is a number.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    /**
     * Phase 27. One chip in an answer knows the action only by the id the
     * model was given (`plan:<reportId>:<index>`, `int:<id>`), so the id is
     * a third way to say the same two bodies and `adoptBodyOf` is the only
     * place that reads it.
     */
    id?: string;
    reportId?: string;
    actionIndex?: number;
    /** the horizon shelf and the card blocks: one claim, adopted */
    interventionId?: string;
    /**
     * The undo behind every "Added N actions" toast. Phase 26: adding said
     * nothing and could not be taken back, so nobody trusted the button.
     */
    removeIds?: string[];
    /**
     * The day this person says they started doing it, when they said so —
     * "i already do this, since March". The addendum path writes it; every
     * other caller leaves it null and the row is dated by `createdAt`.
     */
    startedAt?: string;
  };
  const startedAt = DATE.test(body.startedAt ?? "") ? body.startedAt! : null;
  const named = body.id ? adoptBodyOf(body.id) : null;
  if (body.id && !named)
    return Response.json({ error: "no action" }, { status: 400 });
  const { reportId, actionIndex, interventionId, removeIds } = {
    ...body,
    ...(named ?? {}),
  };
  const db = getDb();

  if (removeIds?.length) {
    await db
      .delete(protocolItems)
      .where(
        and(
          eq(protocolItems.userId, userId),
          inArray(protocolItems.id, removeIds),
        ),
      );
    await recordBeliefs(userId);
    return Response.json({ ok: true, removed: removeIds.length });
  }

  /**
   * A claim off the horizon shelf. It becomes a protocol item like anything
   * else, but nothing pretends it has an effect size: grade E never projects,
   * so the card says what it will be judged on and the research queue gets the
   * condition, which is exactly the phase 19 behaviour for a pair with no
   * number on file.
   */
  if (interventionId) {
    const [row] = await db
      .select()
      .from(hkbInterventions)
      .where(eq(hkbInterventions.id, interventionId));
    if (!row) return Response.json({ error: "not found" }, { status: 404 });
    const code = row.outcomeFeatureId?.replace(/^metric:/, "") ?? null;
    /**
     * A horizon row is a popular claim and says so. An accepted row is a
     * graded intervention off a card's "What to do" block, and its label is
     * its grade — phase 26, where the labels have to survive the adopt.
     */
    const why =
      row.status === "horizon"
        ? `popular right now, grade ${row.grade}, anecdotal (from ${
            row.population ?? "unknown"
          }): ${row.quote ?? ""}`
        : `grade ${row.grade}${row.dose ? `, ${row.dose}` : ""}${
            row.effect ? `, ${row.direction} ${row.effect}` : ""
          } for ${row.conditionId}`;
    const text = `${row.name}${row.dose ? ` — ${row.dose}` : ""}`.slice(0, 300);
    const already = await onProtocol(userId, text);
    if (already)
      return Response.json({ ok: true, id: already, adopted: row.name });
    const [item] = await db
      .insert(protocolItems)
      .values({
        userId,
        text,
        why: why.slice(0, 500),
        metricCodes: code ? [code] : [],
        cadence: "daily",
      })
      .returning({ id: protocolItems.id });
    await queueResearch(row.conditionId).catch(() => false);
    await recordBeliefs(userId);
    return Response.json({ ok: true, id: item?.id, adopted: row.name });
  }

  if (!reportId || typeof actionIndex !== "number")
    return Response.json({ error: "no action" }, { status: 400 });

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report || report.userId !== userId)
    return Response.json({ error: "not found" }, { status: 404 });

  const action = report.body.actions[actionIndex];
  if (!action) return Response.json({ error: "not found" }, { status: 404 });

  /**
   * The same action, adopted twice, is one line on the protocol. The addendum
   * path adopts what a person says they already do, and they can say it after
   * having pressed Add, so this is the difference between one habit and two.
   */
  const text = doseSummary(action).slice(0, 300);
  const already = await onProtocol(userId, text);
  if (already) {
    if (startedAt)
      await db
        .update(protocolItems)
        .set({ startedAt })
        .where(eq(protocolItems.id, already));
    await recordBeliefs(userId);
    return Response.json({ ok: true, id: already, already: true });
  }

  const [item] = await db
    .insert(protocolItems)
    .values({
      userId,
      text,
      why: action.why.slice(0, 500),
      metricCodes: action.targets.map((t) => t.code),
      cadence: /week/i.test(action.dose?.schedule ?? "") ? "weekly" : "daily",
      ...(startedAt ? { startedAt } : {}),
    })
    .returning({ id: protocolItems.id });

  for (const [i, f] of action.followUp.entries())
    await db.insert(reviewItems).values({
      userId,
      kind: "check_in",
      subject: {
        key: `${reportId}:${actionIndex}:${i}`,
        reportId,
        actionIndex,
        ask: f.ask,
        detail: `${action.title} · day ${f.afterDays}`,
      },
      question: f.ask,
      options: ["Yes", "No", "Note…"],
      createdAt: new Date(Date.now() + f.afterDays * DAY),
    });

  const codes = action.targets.map((t) => t.code);
  const known = codes.length
    ? new Set(
        (
          await db
            .select({ code: metrics.code })
            .from(metrics)
            .where(inArray(metrics.code, codes))
        ).map((m) => m.code),
      )
    : new Set<string>();

  for (const t of action.targets) {
    if (!known.has(t.code)) continue;
    const target = firstNumber(t.expect);
    if (target == null) continue;
    const band =
      t.direction === "down"
        ? { targetLow: null, targetHigh: target }
        : { targetLow: target, targetHigh: null };
    await db
      .insert(goals)
      .values({
        userId,
        metricCode: t.code,
        ...band,
        note: `${action.title}: ${t.expect}`,
      })
      .onConflictDoUpdate({
        target: [goals.userId, goals.metricCode],
        set: {
          ...band,
          note: `${action.title}: ${t.expect}`,
          achievedAt: null,
        },
      });
  }

  await recordBeliefs(userId);
  return Response.json({ ok: true, id: item?.id });
}
