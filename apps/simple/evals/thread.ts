/**
 * The thread eval: does a conversation stay grounded over three turns?
 *
 *   pnpm --filter simple eval:thread [caseId ...] [--user email]
 *
 * `pnpm eval:ask` scores one question in isolation. A thread can fail in ways
 * one question cannot: it can invent an id once the closed sets are two turns
 * back, it can ask permission instead of writing when the person states a
 * fact, and it can lose the shape by turn three. So three cases of three turns
 * each, run through the same `prepareTurn` the route runs, with the tool calls
 * read off the result.
 *
 * Every turn writes for real, in the eval account, exactly as the app does.
 * That is the point: turn 3 is scored on a prompt that contains what turn 2
 * wrote.
 *
 * Results land in `evals/results/thread-<date>.json`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import { and, eq } from "drizzle-orm";
import { getDb, pool, profileFacts, threads } from "@/db";
import { users } from "@/db/auth-schema";
import { model } from "@/lib/extract";
import { prepareTurn } from "@/lib/thread-turn";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The account the questions are asked from, as in `evals/ask.ts`. */
const DEFAULT_EMAIL = "test-newuser@example.com";

interface ThreadCase {
  id: string;
  /** what a person types, turn by turn */
  turns: string[];
  /** the tools each turn is expected to have called, beyond `offer` */
  wants: string[][];
  judge: string;
}

/**
 * Three shapes of conversation: a question that becomes a follow-up, a
 * statement of fact mid-thread, and a person acting on what was offered.
 */
const CASES: ThreadCase[] = [
  {
    id: "follow-up",
    turns: [
      "what should I do about my LDL?",
      "why does that one work?",
      "how long before I retest it?",
    ],
    wants: [[], [], []],
    judge:
      "Each answer takes the previous one as read: turn 2 explains the mechanism behind the action turn 1 named, and turn 3 gives an interval for the marker they have been discussing rather than starting over.",
  },
  {
    id: "tells-us-something",
    turns: [
      "am I at risk of type 2 diabetes?",
      "by the way, I started metformin 500 mg at night two weeks ago",
      "so what changes?",
    ],
    wants: [[], ["record_fact"], []],
    judge:
      "The middle turn writes the medication down and says so in one sentence without asking permission, and the last turn answers with that medication taken into account.",
  },
  /**
   * Phase 31a item 1, in the owner's own words. Both of the threads that
   * broke on the evening of 2026-09-02 were a question and then a follow-up
   * about the same thing, and both stored an empty assistant row for the
   * second turn. A second answer, with words in it, is the whole assertion.
   */
  {
    id: "second-turn",
    turns: [
      "What is my LDL and how can i improve it?",
      "how can i improve it?",
    ],
    wants: [[], []],
    judge:
      "The second turn answers the follow-up with a real answer of its own, taking the first turn's numbers as read rather than repeating them or failing.",
  },
  {
    id: "acts-on-it",
    turns: [
      "how do I fix my Hashimoto's?",
      "add the first one to my plan",
      "and plan the retest",
    ],
    wants: [[], ["adopt_action"], ["plan_retest"]],
    judge:
      "It adopts the action it itself offered rather than inventing one, plans a retest for a marker that was on the list, and prints a receipt for each.",
  },
];

interface TurnResult {
  said: string;
  /** the tools this turn called, in order */
  called: string[];
  /** ids `pickActs` threw away, which is the model inventing a button */
  dropped: string[];
  /** the receipts the writing tools handed back */
  receipts: string[];
  failed: string[];
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error?: string;
}

interface CaseResult {
  id: string;
  threadId?: string;
  turns: TurnResult[];
  judgeScore?: number;
  judgeNote?: string;
}

const JUDGE_SYSTEM = `You are grading a three-turn conversation a health app had with the person whose data it holds.

Answer in exactly four lines, nothing else:
carries: yes|no — later turns take the earlier ones as read instead of restarting from the person's whole panel.
shape: yes|no — every turn stays in the app's shape: their own numbers, short, no filler, no "consult a healthcare provider".
writes: yes|no — when the person states a fact or asks for something to be added, the app writes it and says so in one sentence, without asking permission first.
worst: <one sentence on the worst thing about the conversation>`;

async function judge(
  c: ThreadCase,
  turns: TurnResult[],
): Promise<{ judgeScore: number; judgeNote: string }> {
  const { text } = await generateText({
    model: model(process.env.EVAL_JUDGE_MODEL ?? "openai/gpt-5.6-sol"),
    system: JUDGE_SYSTEM,
    prompt: `WHAT A GOOD CONVERSATION DOES HERE: ${c.judge}

THE CONVERSATION:
${c.turns
  .map(
    (q, i) =>
      `person: ${q}\napp: ${turns[i]?.said ?? "(nothing)"}\nreceipts: ${
        turns[i]?.receipts.join(" | ") || "none"
      }`,
  )
  .join("\n\n")}`,
  });
  const yes = (key: string) =>
    new RegExp(`${key}\\s*:\\s*yes`, "i").test(text) ? 1 : 0;
  return {
    judgeScore: yes("carries") + yes("shape") + yes("writes"),
    judgeNote: text.match(/worst\s*:\s*(.+)/i)?.[1]?.trim() ?? "",
  };
}

async function runCase(userId: string, c: ThreadCase): Promise<CaseResult> {
  const out: CaseResult = { id: c.id, turns: [] };
  let threadId: string | undefined;

  for (let i = 0; i < c.turns.length; i++) {
    const started = Date.now();
    const text = c.turns[i]!;
    const message = {
      id: `${c.id}-${i}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text }],
    };
    const turn = await prepareTurn(userId, { threadId, message });
    if ("error" in turn) {
      out.turns.push({
        said: "",
        called: [],
        dropped: [],
        receipts: [],
        failed: [turn.error],
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        error: turn.error,
      });
      break;
    }
    threadId = turn.thread.id;
    out.threadId = threadId;

    try {
      const res = await generateText(turn.args);
      /**
       * The paragraph is written before `offer` is called, so it is the text
       * of an earlier step. `res.text` is the last step's text and is usually
       * empty here; the client sees every part, so the eval has to as well.
       */
      const said = res.steps
        .map((s) => s.text)
        .filter(Boolean)
        .join("\n")
        .trim();
      /**
       * Every step's messages, exactly as `app/api/chat/route.ts` saves them.
       * The eval used to keep only `res.response.messages`, which is the last
       * step, so the fixture never had the history the app actually stores and
       * phase 31a item 1 could not be caught here.
       */
      await turn.save(
        res.steps.flatMap((s) => s.response.messages),
        {
          id: `${c.id}-${i}-a`,
          role: "assistant",
          parts: [{ type: "text", text: said }],
        },
      );

      const calls = res.steps.flatMap((s) => s.toolCalls);
      const results = res.steps.flatMap((s) => s.toolResults);
      const called = calls.map((t) => t.toolName);
      const offer = results.find((r) => r.toolName === "offer")?.output as
        | { dropped?: string[] }
        | undefined;
      const receipts = results
        .map((r) => (r.output as { receipt?: string })?.receipt)
        .filter((r): r is string => !!r);

      const failed: string[] = [];
      /** Phase 31a item 1: a turn that says nothing is the bug, not a score. */
      if (!said) failed.push("said nothing");
      const offers = called.filter((n) => n === "offer").length;
      if (offers !== 1) failed.push(`called offer ${offers} times, wanted 1`);
      if (offer?.dropped?.length)
        failed.push(
          `invented ${offer.dropped.length} id(s): ${offer.dropped.join(", ")}`,
        );
      for (const want of c.wants[i] ?? [])
        if (!called.includes(want)) failed.push(`never called ${want}`);
      /** A tool that says it refused is a receipt that starts with a refusal. */
      for (const r of results)
        if ((r.output as { ok?: boolean })?.ok === false)
          failed.push(
            `${r.toolName} refused: ${(r.output as { receipt: string }).receipt}`,
          );

      out.turns.push({
        said,
        called,
        dropped: offer?.dropped ?? [],
        receipts,
        failed,
        inputTokens: res.usage.inputTokens ?? 0,
        outputTokens: res.usage.outputTokens ?? 0,
        latencyMs: Date.now() - started,
      });
    } catch (e) {
      out.turns.push({
        said: "",
        called: [],
        dropped: [],
        receipts: [],
        failed: ["threw"],
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      });
      break;
    }
  }

  const graded = out.turns.some((t) => t.said)
    ? await judge(c, out.turns).catch(() => ({
        judgeScore: 0,
        judgeNote: "judge failed",
      }))
    : { judgeScore: 0, judgeNote: "nothing was said" };
  return { ...out, ...graded };
}

/** 0..1: the judge's three, minus a third for each code check that failed. */
const scoreOf = (rows: CaseResult[]): number => {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, r) => {
    const failed = r.turns.reduce((n, t) => n + t.failed.length, 0);
    return sum + Math.max(0, (r.judgeScore ?? 0) - failed) / 3;
  }, 0);
  return Math.round((total / rows.length) * 100) / 100;
};

/** The run has to be at least this good, or the phase is not done. */
const FLOOR = 0.6;

/** The profile keys the cases make the model write, undone after the run. */
const WROTE_FACTS = ["medications"];

async function main() {
  const argv = process.argv.slice(2);
  const ids: string[] = [];
  let email = process.env.EVAL_ASK_EMAIL ?? DEFAULT_EMAIL;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--user") email = argv[++i] ?? email;
    else ids.push(arg);
  }
  const cases = CASES.filter((c) => !ids.length || ids.includes(c.id));

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!user) {
    console.error(`no account for ${email}`);
    process.exitCode = 1;
    return;
  }

  const compacts = !!process.env.OPENAI_API_KEY;
  console.log(
    `${cases.length} threads as ${email}, ${
      compacts
        ? `OpenAI compaction on, threshold ${process.env.AI_THREAD_COMPACT_THRESHOLD ?? 40_000}`
        : "no OPENAI_API_KEY: OpenRouter fallback, fixed window, no compaction"
    }\n`,
  );

  const results: CaseResult[] = [];
  for (const c of cases) {
    console.log(`── ${c.id}`);
    const r = await runCase(user.id, c);
    results.push(r);
    r.turns.forEach((t, i) =>
      console.log(
        `· turn ${i + 1} “${c.turns[i]}” → ${t.called.join(", ") || "no tool"}${
          t.receipts.length ? ` | ${t.receipts.join(" | ")}` : ""
        } | ${t.failed.length ? t.failed.join("; ") : "clean"} (${t.inputTokens} in, ${Math.round(
          t.latencyMs / 1000,
        )}s)`,
      ),
    );
    console.log(`  judge ${r.judgeScore}/3: ${r.judgeNote}\n`);
  }

  const score = scoreOf(results);
  console.table(
    results.map((r) => ({
      case: r.id,
      judge: `${r.judgeScore}/3`,
      failed: r.turns.reduce((n, t) => n + t.failed.length, 0),
      invented: r.turns.reduce((n, t) => n + t.dropped.length, 0),
      receipts: r.turns.reduce((n, t) => n + t.receipts.length, 0),
      "in tokens": r.turns.reduce((n, t) => n + t.inputTokens, 0),
      "out tokens": r.turns.reduce((n, t) => n + t.outputTokens, 0),
    })),
  );
  console.log(`\nscore: ${score} (floor ${FLOOR})`);

  for (const r of results)
    for (const [i, t] of r.turns.entries())
      console.log(`── ${r.id} turn ${i + 1}: ${t.said || t.error}`);

  /**
   * The threads this run wrote are the person's; the eval cleans up after.
   * The facts too: a key that stays answered drops off QUESTIONS THEY COULD
   * ANSWER, and the next run would have nothing for the model to record.
   */
  for (const r of results)
    if (r.threadId) await db.delete(threads).where(eq(threads.id, r.threadId));
  for (const key of WROTE_FACTS)
    await db
      .delete(profileFacts)
      .where(and(eq(profileFacts.userId, user.id), eq(profileFacts.key, key)));

  const file = path.join(
    HERE,
    "results",
    `thread-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        email,
        model: process.env.AI_THREAD_MODEL ?? "default",
        compacts,
        score,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);

  if (score < FLOOR) process.exitCode = 1;
  await pool().end();
}

await main();
