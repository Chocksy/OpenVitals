import { eq } from "drizzle-orm";
import { checkinPosts, getDb, lifeEvents, readings } from "@/db";
import { currentUserId } from "@/lib/auth";
import {
  beliefsNow,
  followUp,
  heldChips,
  replyPack,
  understand,
  writeReply,
  type Chip,
} from "@/lib/compose";
import { buildModelInput, saveFact } from "@/lib/coverage";
import { writeFact } from "@/lib/facts";
import { catalogFor } from "@/lib/hkb";
import { loadGraph } from "@/lib/kg";
import { recordBeliefs } from "@/lib/ledger";
import {
  fileClaim,
  MARKER_CODES,
  SOURCE_KINDS,
  type Claim,
} from "@/lib/trends";
import { PROFILE_QUESTIONS } from "@/lib/vectors";
import { SELF_METRICS } from "@/lib/compose";

export const maxDuration = 60;

interface Body {
  text?: string;
  /** live chips while typing: understand only, write nothing */
  draft?: boolean;
  chips?: Chip[];
  /** answering the one question the engine asked back */
  postId?: string;
  followUpKey?: string;
  followUpAnswer?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The options behind each chip, so the chip editor needs no second call. */
const optionsFor = (chips: Chip[]): Record<string, string[]> =>
  Object.fromEntries(
    chips
      .map((c) => [c.key, PROFILE_QUESTIONS[c.key]?.options ?? []] as const)
      .filter(([, o]) => o.length),
  );

/**
 * Every chip the client sends back, re-checked here.
 *
 * The browser can edit a chip, so nothing it sends is trusted: the key has to
 * be one the engine knows, the value one of that key's options, and the date a
 * date. This is the same rule the model layer lives under, applied to the only
 * other thing that can put words in the engine's mouth.
 */
function clean(chips: Chip[], today: string): Chip[] {
  const out: Chip[] = [];
  for (const c of chips ?? []) {
    if (!c?.key || !c.kind) continue;
    const date = DATE.test(String(c.date)) && c.date <= today ? c.date : today;
    if (c.kind === "reading") {
      const metric = SELF_METRICS.find((s) => s.code === c.key);
      const known = metric ?? { code: c.key, unit: c.unit ?? null };
      const value = Number(c.value);
      if (!Number.isFinite(value)) continue;
      if (!metric && c.key !== "bp_systolic" && c.key !== "bp_diastolic")
        continue;
      out.push({ ...c, value, date, unit: c.unit ?? known.unit ?? undefined });
      continue;
    }
    if (c.kind === "fact" || c.kind === "symptom") {
      const q = PROFILE_QUESTIONS[c.key];
      if (!q) continue;
      const value = String(c.value ?? "").trim();
      if (!value) continue;
      if (q.options?.length && !q.options.includes(value)) continue;
      out.push({ ...c, value, date });
      continue;
    }
    if (c.kind === "phenotype") {
      if (!/^HP:\d{7}$/.test(c.key)) continue;
      out.push({ ...c, value: "present", date });
      continue;
    }
    if (c.kind === "event") {
      const value = String(c.value ?? "").trim();
      if (!value) continue;
      out.push({ ...c, value, date });
      continue;
    }
    // Hearsay. It carries a whole claim, so the claim is re-read here rather
    // than trusted: the intervention has to be words, and every marker has to
    // be one of ours. It writes nothing about the person either way.
    if (c.kind === "claim") {
      const claim = c.value as Partial<Claim> | null;
      const intervention = String(claim?.intervention ?? "").trim();
      if (!intervention) continue;
      out.push({
        ...c,
        date,
        value: {
          text: String(claim?.text ?? c.quote ?? "").slice(0, 500),
          intervention: intervention.slice(0, 120),
          markers: (claim?.markers ?? []).filter((m) =>
            MARKER_CODES.includes(m),
          ),
          direction: claim?.direction === "up" ? "up" : "down",
          sourceKind: SOURCE_KINDS.includes(
            claim?.sourceKind as (typeof SOURCE_KINDS)[number],
          )
            ? claim!.sourceKind!
            : "unknown",
        } satisfies Claim,
      });
    }
  }
  return out;
}

/** Chips into rows. Facts always through `saveFact`, so history is never lost. */
async function write(userId: string, chips: Chip[], held: Set<string>) {
  const db = getDb();
  for (const c of chips) {
    if (held.has(c.key)) continue;
    if (c.kind === "fact" || c.kind === "symptom") {
      await saveFact(userId, c.key, String(c.value), {
        kind: "changed",
        date: c.date,
        note: c.quote,
      });
    } else if (c.kind === "phenotype") {
      await writeFact(userId, `hp:${c.key}`, "present", {
        kind: "changed",
        date: c.date,
        note: c.quote,
        source: "user",
      });
    } else if (c.kind === "reading") {
      await db.insert(readings).values({
        userId,
        metricCode: c.key,
        value: Number(c.value),
        valueText: String(c.value),
        unit: c.unit ?? null,
        observedAt: c.date,
        flags: ["self_reported"],
      });
      // A claim is about the world, so it writes nothing here. It goes to the
      // trends inbox instead, below.
    } else if (c.kind === "event") {
      await db.insert(lifeEvents).values({
        userId,
        kind: c.key,
        text: String(c.value),
        startedAt: c.date,
        endedAt: null,
        source: "checkin",
      });
    }
  }
}

/**
 * The composer: one endpoint, three jobs.
 *
 * `draft` understands and writes nothing, which is what the live chips call
 * every 400 ms. A post with chips writes them, asks at most one question back
 * and replies. A `followUpKey` answers that question and re-runs the reply, so
 * the paragraph the person ends up reading is the one that knows the answer.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const db = getDb();

  try {
    // ── answering the follow-up ─────────────────────────────────────────
    if (body.postId && body.followUpKey) {
      const q = PROFILE_QUESTIONS[body.followUpKey];
      const answer = String(body.followUpAnswer ?? "").trim();
      if (!q || !answer)
        return Response.json({ error: "unknown answer" }, { status: 400 });
      if (q.options?.length && !q.options.includes(answer))
        return Response.json(
          { error: "not one of the options" },
          { status: 400 },
        );

      const [post] = await db
        .select()
        .from(checkinPosts)
        .where(eq(checkinPosts.id, body.postId));
      if (!post || post.userId !== userId)
        return Response.json({ error: "no such post" }, { status: 404 });

      const before = beliefsNow(
        await buildModelInput(userId),
        await catalogFor(userId),
      );
      await saveFact(userId, body.followUpKey, answer, { kind: "changed" });

      // A chip the engine was holding back may now be free: "over a month" is
      // exactly what `sym_energy` was waiting for.
      const chips = clean(
        (post.chips ?? []) as unknown as Chip[],
        (await buildModelInput(userId)).today,
      );
      const m = await buildModelInput(userId);
      const still = heldChips(chips, m);
      await write(
        userId,
        chips.filter((c) => c.key === "sym_energy"),
        still,
      );
      await recordBeliefs(userId);

      const followUpRow = {
        key: body.followUpKey,
        question: q.question,
        options: q.options,
        answer,
      };
      const pack = await replyPack(
        userId,
        { ...post, followUp: followUpRow },
        before,
      );
      const reply = await writeReply(pack);
      await db
        .update(checkinPosts)
        .set({ followUp: followUpRow, reply })
        .where(eq(checkinPosts.id, post.id));
      return Response.json({ ok: true, id: post.id, reply, pack });
    }

    // ── understanding and posting ───────────────────────────────────────
    const text = String(body.text ?? "").trim();
    if (text.length < 2)
      return Response.json({ error: "write something first" }, { status: 400 });

    const m = await buildModelInput(userId);
    if (body.draft) {
      const chips = await understand(text, m);
      return Response.json({ chips, options: optionsFor(chips) });
    }

    const chips = clean(
      body.chips?.length ? body.chips : await understand(text, m),
      m.today,
    );
    const [catalog, graph] = await Promise.all([
      catalogFor(userId),
      loadGraph(),
    ]);
    const before = beliefsNow(m, catalog);
    const ask = followUp(chips, m, catalog, graph);
    const held = heldChips(chips, m);

    await write(userId, chips, held);
    // The trends inbox. The science half is left to the scheduled run: the
    // horizon row this writes is what puts the condition on the ninety-day
    // clock, and a check-in must not wait on Europe PMC.
    const filed = [];
    for (const c of chips.filter((x) => x.kind === "claim"))
      filed.push(
        await fileClaim(c.value as Claim, { science: false }).catch((e) => {
          console.error("[compose] could not file the claim:", e);
          return null;
        }),
      );

    const [post] = await db
      .insert(checkinPosts)
      .values({
        userId,
        text,
        chips: chips.map((c) => ({ ...c, value: c.value as unknown })),
        followUp: ask
          ? { key: ask.key, question: ask.question, options: ask.options }
          : null,
      })
      .returning();
    await recordBeliefs(userId);

    const pack = await replyPack(userId, post!, before);
    const reply = await writeReply(pack);
    await db
      .update(checkinPosts)
      .set({ reply })
      .where(eq(checkinPosts.id, post!.id));

    return Response.json({
      ok: true,
      id: post!.id,
      chips,
      options: optionsFor(chips),
      held: [...held],
      claims: filed.filter((f) => f != null),
      followUp: post!.followUp,
      reply,
      pack,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[compose] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
