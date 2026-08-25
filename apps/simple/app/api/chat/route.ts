import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { currentUserId } from "@/lib/auth";
import { chatContext, healthChatPrompt } from "@/lib/ai";
import { model } from "@/lib/extract";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { messages } = (await req.json()) as { messages: UIMessage[] };
  const context = await chatContext(userId);

  const result = streamText({
    model: model(),
    system: `${healthChatPrompt}\n\nUSER HEALTH DATA\n${context}`,
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
