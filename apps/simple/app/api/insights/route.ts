import { currentUserId } from "@/lib/auth";
import { generateInsight, type Kind } from "@/lib/ai";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { kind } = (await req.json()) as { kind?: Kind };
  if (kind !== "lifestyle" && kind !== "retest" && kind !== "weekly")
    return Response.json({ error: "bad kind" }, { status: 400 });

  try {
    return Response.json(await generateInsight(userId, kind));
  } catch (e) {
    console.error("[insights] failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
