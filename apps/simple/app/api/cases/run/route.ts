import { currentUserId, isAdmin } from "@/lib/auth";
import { researchCase } from "@/lib/cases";

export const maxDuration = 300;

/**
 * Phase 41C: run case research now. The signed-in person runs their own case;
 * an admin may name another user. `dryRun` returns the overlay and writes
 * nothing. Spend is capped by `CASE_BUDGET_USD` either way.
 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    dryRun?: boolean;
    asOf?: string;
  };
  const userId = body.userId && body.userId !== me ? body.userId : me;
  if (userId !== me && !(await isAdmin()))
    return Response.json({ error: "not found" }, { status: 404 });
  if (body.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(body.asOf))
    return Response.json({ error: "asOf is YYYY-MM-DD" }, { status: 400 });

  const { summary, queries, papers, proposals, accepted, costUsd, stopped } =
    await researchCase(userId, { dryRun: !!body.dryRun, asOf: body.asOf });
  return Response.json({
    ok: true,
    summary,
    queries,
    papers,
    proposals,
    accepted,
    costUsd,
    stopped,
  });
}
