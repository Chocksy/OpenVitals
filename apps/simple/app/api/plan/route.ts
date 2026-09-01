import { currentUserId } from "@/lib/auth";
import { catalogFor } from "@/lib/hkb";
import { generateReport } from "@/lib/report";

export const maxDuration = 300;

/**
 * Generate a plan now. Returns the whole report row.
 *
 * `conditionId` is the card the person pressed "Get actions" on: the same
 * plan, written with that condition named first (phase 26, item 5).
 */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { conditionId } = (await request.json().catch(() => ({}))) as {
    conditionId?: string;
  };

  try {
    const focus = conditionId
      ? (await catalogFor(userId)).find((h) => h.id === conditionId)
      : undefined;
    if (conditionId && !focus)
      return Response.json({ error: "no such condition" }, { status: 404 });
    return Response.json(
      await generateReport(
        userId,
        "manual",
        focus ? { id: focus.id, name: focus.name } : undefined,
      ),
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[plan] generate failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
