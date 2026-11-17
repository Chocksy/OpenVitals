import { desc, eq, inArray } from "drizzle-orm";
import { getDb, insights, checkins } from "@/db";
import { getMetricRows, type MetricRow } from "./data";
import { statusOf } from "./status";

const DAY = 1000 * 60 * 60 * 24;

function metricLine(m: MetricRow): string {
  const last3 = m.rows
    .slice(-3)
    .map((r) => `${r.value ?? r.valueText ?? "?"}${r.unit ? ` ${r.unit}` : ""}@${r.observedAt}`);
  const days = Math.floor(
    (Date.now() - new Date(m.latest.observedAt).getTime()) / DAY,
  );
  const status = statusOf({
    value: m.latest.value,
    refLow: m.latest.refLow,
    refHigh: m.latest.refHigh,
    optimalLow: m.optimalLow,
    optimalHigh: m.optimalHigh,
  });
  const label =
    status === "red" ? "critical" : status === "amber" ? "warning" : "normal";
  return `${m.code} | ${m.name} | ${m.unit ?? ""} | last3: ${last3.join(", ")} | ref ${m.latest.refLow ?? "-"}..${m.latest.refHigh ?? "-"} | optimal ${m.optimalLow ?? "-"}..${m.optimalHigh ?? "-"} | ${label} | ${days}d since last test`;
}

/** The last three plans plus the check-in answers attached to them. */
async function history(userId: string) {
  const db = getDb();
  const prev = await db
    .select()
    .from(insights)
    .where(eq(insights.userId, userId))
    .orderBy(desc(insights.createdAt))
    .limit(3);
  if (!prev.length) return { prev, lines: [] as string[] };

  const answers = await db
    .select()
    .from(checkins)
    .where(
      inArray(
        checkins.insightId,
        prev.map((p) => p.id),
      ),
    );

  const lines = prev.map((p) => {
    const mine = answers
      .filter((a) => a.insightId === p.id)
      .map((a) => `#${a.itemIndex}=${a.answer}${a.note ? ` (${a.note})` : ""}`);
    return `${p.kind} on ${p.createdAt?.toISOString().slice(0, 10)}: ${JSON.stringify(p.body)}${
      mine.length ? `\n  check-ins: ${mine.join(", ")}` : ""
    }`;
  });
  return { prev, lines };
}

/** Latest value per metric plus the two most recent plans, for the chat. */
export async function chatContext(userId: string) {
  const rows = await getMetricRows(userId);
  const { lines } = await history(userId);
  return `The user's latest biomarker readings (code | name | unit | last 3 readings | reference range | optimal range | status | recency):
${rows.map(metricLine).join("\n")}

Their most recent AI plans and check-ins:
${lines.slice(0, 2).join("\n") || "none"}`;
}

export const healthChatPrompt = `You are a helpful health data assistant for Halewell. You help users understand their health records and lab results.

IMPORTANT RULES:
1. You are NOT a doctor. Never diagnose conditions or prescribe treatments.
2. Always recommend consulting a healthcare provider for medical decisions.
3. You CAN explain what lab values mean, identify trends, and highlight values outside reference ranges.
4. Only discuss data that has been provided to you in the context. Never make up or assume values.
5. When referencing specific values, cite the date and source when available.
6. Use plain language. Explain medical terms when you use them.
7. If asked about data categories not included in your context, say you don't have access to that information.

The user's health data context will be provided before their question. Use it to give informed, accurate answers about their specific data.`;
