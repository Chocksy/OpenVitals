import { eq } from "drizzle-orm";
import { checkinPosts, getDb } from "@/db";
import { currentUserId } from "@/lib/auth";
import {
  beliefsNow,
  cleanChips,
  composeReceipt,
  followUp,
  heldChips,
  NOTHING_TO_KEEP,
  readActionStatement,
  replyFallback,
  replyPack,
  understand,
  understandRead,
  writeChips,
  writeReply,
  type ActionSubject,
  type Chip,
} from "@/lib/compose";
import { buildModelInput, saveFact } from "@/lib/coverage";
import { catalogFor } from "@/lib/hkb";
import { loadGraph } from "@/lib/kg";
import { recordBeliefs } from "@/lib/ledger";
import { fileClaim, type Claim } from "@/lib/trends";
import { PROFILE_QUESTIONS } from "@/lib/vectors";

export const maxDuration = 60;

interface Body {
  text?: string;
  /** live chips while typing: understand only, write nothing */
  draft?: boolean;
  chips?: Chip[];
  /**
   * The plan action a card's Discuss opened the box about. With one of these,
   * the words are read relative to it as well: "i already do this" about
   * "Resistance training 3x/week" is an adopt, a start date and an exercise
   * answer, not a phenotype and never an ontology lookup.
   */
  about?: ActionSubject;
  /** answering the one question the engine asked back */
  postId?: string;
  followUpKey?: string;
  followUpAnswer?: string;
}

/** The options behind each chip, so the chip editor needs no second call. */
const optionsFor = (chips: Chip[]): Record<string, string[]> =>
  Object.fromEntries(
    chips
      .map((c) => [c.key, PROFILE_QUESTIONS[c.key]?.options ?? []] as const)
      .filter(([, o]) => o.length),
  );


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
      const chips = cleanChips(
        (post.chips ?? []) as unknown as Chip[],
        (await buildModelInput(userId)).today,
      );
      const m = await buildModelInput(userId);
      const still = heldChips(chips, m);
      await writeChips(
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
      const reply =
        (await writeReply(pack)).trim() ||
        replyFallback(chips, { reply: NOTHING_TO_KEEP });
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
    const about = body.about?.title
      ? {
          title: String(body.about.title).slice(0, 300),
          ...(body.about.reportId ? { reportId: body.about.reportId } : {}),
          ...(typeof body.about.index === "number"
            ? { index: body.about.index }
            : {}),
        }
      : null;
    const action = about ? readActionStatement(text, about, m.today) : null;

    if (body.draft) {
      const chips = await understand(text, m);
      return Response.json({ chips, options: optionsFor(chips), action });
    }

    /**
     * The reading, and whether the reader ran.
     *
     * Chips the client sends back were read on an earlier call, so that path
     * counts as read. A model layer that threw — no quota, 402, 429, provider
     * down — does not: the rules keep whatever they found, the words are kept
     * whole, and the post is saved `unread` for the next pass.
     */
    const read = body.chips?.length
      ? {
          chips: body.chips,
          modelRan: false,
          modelFailed: false,
          worthReading: false,
        }
      : await understandRead(text, m);
    const receipt = composeReceipt(read);
    const chips = cleanChips(read.chips, m.today);
    const [catalog, graph] = await Promise.all([
      catalogFor(userId),
      loadGraph(),
    ]);
    const before = beliefsNow(m, catalog);
    const ask = followUp(chips, m, catalog, graph);
    const held = heldChips(chips, m);

    await writeChips(userId, chips, held);
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
        readState: receipt.readState,
      })
      .returning();
    await recordBeliefs(userId);

    /**
     * With the reader down there is nothing to write a paragraph out of, and
     * the reply model is the same provider that just failed. The receipt is
     * the whole answer: the words are kept, and they will be read.
     */
    if (!receipt.read) {
      await db
        .update(checkinPosts)
        .set({ reply: receipt.reply })
        .where(eq(checkinPosts.id, post!.id));
      return Response.json({
        ok: true,
        id: post!.id,
        chips,
        action,
        options: optionsFor(chips),
        held: [...held],
        claims: filed.filter((f) => f != null),
        followUp: post!.followUp,
        saved: receipt.saved,
        read: receipt.read,
        reply: receipt.reply,
        pack: null,
      });
    }

    /**
     * The paragraph, and the receipt behind it. `writeReply` talks to the same
     * provider the reader does, so an empty answer is a live failure mode —
     * never an empty reply on the body.
     */
    const pack = await replyPack(userId, post!, before);
    const reply = (await writeReply(pack)).trim() || replyFallback(chips, receipt);
    await db
      .update(checkinPosts)
      .set({ reply })
      .where(eq(checkinPosts.id, post!.id));

    return Response.json({
      ok: true,
      id: post!.id,
      chips,
      action,
      options: optionsFor(chips),
      held: [...held],
      claims: filed.filter((f) => f != null),
      followUp: post!.followUp,
      saved: receipt.saved,
      read: receipt.read,
      reply,
      pack,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[compose] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
