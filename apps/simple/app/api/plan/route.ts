import { currentUserId } from "@/lib/auth";
import { generateReport } from "@/lib/report";

export const maxDuration = 300;

/** Generate a plan now. Returns the whole report row. */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    return Response.json(await generateReport(userId, "manual"));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[plan] generate failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
