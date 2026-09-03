/** `GET /api/genome` — the answers, and the genes behind them. Phase 32a §6. */
import { genomeBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await genomeBody(userId));
}
