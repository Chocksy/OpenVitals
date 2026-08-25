import { currentUserId } from "@/lib/auth";
import { applyAnswer } from "@/lib/curator";

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

  const item = await applyAnswer(id, userId, answer, note);
  if (!item)
    return Response.json(
      { error: "not found or already answered" },
      { status: 404 },
    );
  return Response.json(item);
}
