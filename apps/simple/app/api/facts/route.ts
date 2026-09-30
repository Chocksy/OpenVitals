import { currentUserId } from "@/lib/auth";
import { saveFact } from "@/lib/coverage";
import { checkFact } from "@/lib/fact-input";
import { recordBeliefs } from "@/lib/ledger";

/**
 * One answered profile fact, and the two ways to edit one that already has a
 * value: `changed` opens a new period from a date, `corrected` says the old
 * value never held. Either way a row lands in `profile_fact_history`.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { key, value, kind, date, note } = (await req.json()) as {
    key?: string;
    value?: string;
    kind?: string;
    date?: string;
    note?: string;
  };
  const check = checkFact(key, value);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  if (kind && kind !== "changed" && kind !== "corrected")
    return Response.json({ error: "unknown edit" }, { status: 400 });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "bad date" }, { status: 400 });

  // `checkFact` passed, so both are non-empty strings.
  await saveFact(userId, key!, value!, {
    kind: kind as "changed" | "corrected" | undefined,
    date,
    note,
  });
  await recordBeliefs(userId);
  return Response.json({ ok: true, key, value, kind: kind ?? "changed" });
}
