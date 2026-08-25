import { requireUserId } from "@/lib/auth";
import { Chat } from "@/components/chat";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requireUserId();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Chat
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          Questions about your own lab data. Not medical advice.
        </p>
      </div>
      <Chat />
    </div>
  );
}
