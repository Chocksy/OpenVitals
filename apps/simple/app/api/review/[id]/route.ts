import { currentUserId } from "@/lib/auth";
import { applyAnswer, BadAnswerError } from "@/lib/curator";
import { recordBeliefs } from "@/lib/ledger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { answer, note } = (await req.json()) as {
    answer?: string;
    note?: string;
  };
  if (!answer) return Response.json({ error: "no answer" }, { status: 400 });

  let item;
  try {
    item = await applyAnswer(id, userId, answer, note);
  } catch (e) {
    if (!(e instanceof BadAnswerError)) throw e;
    return Response.json({ error: e.message }, { status: 400 });
  }
  if (!item)
    return Response.json(
      { error: "not found or already answered" },
      { status: 404 },
    );
  await recordBeliefs(userId);
  return Response.json(item);
}
