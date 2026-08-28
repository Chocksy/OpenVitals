import { eq } from "drizzle-orm";
import { getDb, profileFacts } from "@/db";
import { requireUserId } from "@/lib/auth";
import { buildModelInput } from "@/lib/coverage";
import { SYMPTOM_ITEMS } from "@/lib/symptoms";
import { Feel } from "@/components/feel";

export const dynamic = "force-dynamic";

/**
 * The whole symptom set on demand. The review queue asks these one at a time
 * and only when they would settle something; this page is for the person who
 * wants to answer all twelve now.
 */
export default async function FeelPage() {
  const userId = await requireUserId();
  const [m, facts] = await Promise.all([
    buildModelInput(userId),
    getDb().select().from(profileFacts).where(eq(profileFacts.userId, userId)),
  ]);

  const items = SYMPTOM_ITEMS.map((group) => ({
    ...group,
    questions: group.questions.filter((q) => {
      const gate = q.appliesTo;
      if (!gate) return true;
      if (gate.sex && m.sex !== gate.sex) return false;
      if (gate.minAge != null && (m.age == null || m.age < gate.minAge)) return false;
      if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge)) return false;
      return true;
    }),
  })).filter((group) => group.questions.length > 0);

  const keys = new Set(items.flatMap((g) => g.questions.map((q) => q.key)));
  const answers = Object.fromEntries(
    facts
      .filter((f) => keys.has(f.key))
      .map((f) => [f.key, String(f.value ?? "")]),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          How do you feel
        </h1>
        <p className="mt-1 max-w-2xl font-body text-[13px] text-neutral-500">
          Twelve questions. Each one carries a published likelihood ratio, so an
          answer moves the differential the same way a blood test does, and
          costs nothing. Answers save as you tap them.
        </p>
      </div>
      <Feel items={items} answers={answers} />
    </div>
  );
}
