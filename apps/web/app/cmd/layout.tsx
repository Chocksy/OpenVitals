import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { getDb } from "@openvitals/database/client";
import { users } from "@openvitals/database";
import { TopNav } from "@/features/layout/top-nav";

const ONBOARDING_COMPLETE = 9;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // const session = await auth.api.getSession({
  //   headers: await headers(),
  // });

  // if (!session) {
  //   redirect('/login');
  // }

  // try {
  //   const db = getDb();
  //   const [user] = await db
  //     .select({ onboardingStep: users.onboardingStep })
  //     .from(users)
  //     .where(eq(users.id, session.user.id))
  //     .limit(1);

  //   if (!user || user.onboardingStep < ONBOARDING_COMPLETE) {
  //     redirect('/onboarding');
  //   }
  // } catch (e) {
  //   // Re-throw redirect errors (Next.js uses thrown redirects)
  //   if (e instanceof Error && 'digest' in e) throw e;
  //   redirect('/onboarding');
  // }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <main className="flex-1 overflow-auto bg-neutral-100">{children}</main>
    </div>
  );
}
