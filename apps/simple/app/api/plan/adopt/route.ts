import { adopt, type AdoptBody } from "@/lib/adopt";
import { currentUserId } from "@/lib/auth";

/**
 * Take one action off the plan and turn it into everything that makes it real:
 * a protocol item to tick, a check-in for each follow-up dated in the future,
 * and a goal for every target whose expected value is a number. The work is
 * `lib/adopt.ts`, so a thread tool adopts by calling the same function.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const result = await adopt(userId, (await req.json()) as AdoptBody);
  return "error" in result
    ? Response.json({ error: result.error }, { status: result.status })
    : Response.json(result);
}
