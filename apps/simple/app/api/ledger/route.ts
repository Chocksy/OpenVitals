import { currentUserId } from "@/lib/auth";
import { localDay } from "@/lib/daily";
import { buildToday, homeAskPlan, optionsFor } from "@/lib/home-data";
import { buildLedger } from "@/lib/ledger";
import { snapshotLedger } from "@/lib/ledger-diff";

/**
 * The model Home renders, small enough to re-fetch after an answer.
 *
 * Phase 24d: answering the Today question no longer reloads the page. The
 * client posts to `/api/facts`, asks here for the new picture, and animates
 * the difference — numbers pop, chips swap, cards move. Nothing here is new
 * arithmetic: it is `buildLedger` and `buildToday`, exactly what the page
 * awaits on a normal render, reduced by `snapshotLedger` to what can change.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [ledger, today] = await Promise.all([
    buildLedger(userId),
    buildToday(userId),
  ]);
  const plan = homeAskPlan(ledger, today.due);

  return Response.json({
    day: localDay(),
    snapshot: snapshotLedger(ledger),
    ask: plan.ask ? { ...plan.ask, options: optionsFor(plan.ask.key) } : null,
  });
}
