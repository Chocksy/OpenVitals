import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { restartSetup, setupBody, setupDue } from "@/lib/setup-server";
import { SetupFlow } from "@/components/setup-flow";

export const dynamic = "force-dynamic";

/**
 * Phase 43B: the setup flow, outside the `(app)` group so there is no top
 * nav. A person whose setup is closed (or who never needed it) goes Home.
 */
export default async function SetupPage({
  searchParams,
}: {
  /** `?again=1`: run it again on an account that is past it */
  searchParams: Promise<{ again?: string }>;
}) {
  const userId = await requireUserId();
  const { again } = await searchParams;
  if (!(await setupDue(userId))) {
    if (again !== "1") redirect("/");
    await restartSetup(userId);
    redirect("/setup");
  }
  return (
    <main className="setup-page">
      <SetupFlow initial={await setupBody(userId)} />
    </main>
  );
}
