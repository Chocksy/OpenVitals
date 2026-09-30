import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { checkinBody, forceCheckin } from "@/lib/checkin-server";
import { CheckinFlow } from "@/components/checkin-flow";

export const dynamic = "force-dynamic";

/**
 * Phase 44C: the check-in, outside the `(app)` group like `/setup`, so there
 * is no top nav. Loading it while due starts the round; not due goes Home.
 */
export default async function CheckinPage({
  searchParams,
}: {
  /** `?now=1`: start a round now, whatever the calendar says (testing) */
  searchParams: Promise<{ now?: string }>;
}) {
  const userId = await requireUserId();
  const { now } = await searchParams;
  if (now === "1") {
    // forceCheckin alone does not start a round while setup is open; the
    // forced body does, and a started round stays due.
    await forceCheckin(userId);
    await checkinBody(userId, { force: true });
    redirect("/checkin");
  }
  const body = await checkinBody(userId);
  if (!body.due || !body.screen) redirect("/");
  return (
    <main className="setup-page">
      <CheckinFlow initial={body} />
    </main>
  );
}
