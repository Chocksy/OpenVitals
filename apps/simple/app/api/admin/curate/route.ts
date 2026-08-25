import { currentUserId, isAdmin } from "@/lib/auth";
import { runCuratorForAllUsers } from "@/lib/curator";

export const maxDuration = 120;

export async function POST() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin()))
    return Response.json({ error: "not found" }, { status: 404 });

  const users = await runCuratorForAllUsers("manual");
  return Response.json({ ok: true, users });
}
