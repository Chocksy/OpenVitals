import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/auth-schema";
import { isAdmin } from "@/lib/auth";
import { PERSONA_IDS, userPanels } from "@/lib/sample";
import { Brain, type BrainUser } from "@/components/brain";

export const dynamic = "force-dynamic";

/**
 * Admin only, and read-only over everybody's data: the page never writes a
 * reading, a fact or a review answer. The simulation lives in localStorage.
 */
export default async function BrainPage() {
  if (!(await isAdmin())) notFound();

  const rows = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users);
  const people: BrainUser[] = rows
    .map((u) => ({ ...u, name: u.name ?? u.email }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const panels = Object.fromEntries(
    await Promise.all(
      people.map(async (u) => [u.id, await userPanels(u.id)] as const),
    ),
  );

  return (
    <Suspense fallback={null}>
      <Brain users={people} personas={PERSONA_IDS} panels={panels} />
    </Suspense>
  );
}
