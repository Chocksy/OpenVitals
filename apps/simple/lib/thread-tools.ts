/**
 * The five things a turn in a thread can do.
 *
 * Phase 28c. Principle 3 at the level of a tool: the model picks ids out of the
 * closed sets it was handed, and every handler re-validates before it writes.
 * The tools are not the guard; the handlers are. `offer` is `pickActs`, the
 * same pure function the single-shot ask has used since phase 27.
 *
 * No approval gating. A tool that writes, writes, and hands back one line of
 * receipt the thread prints under the answer.
 */
import { tool, type ToolSet } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, checkins, goals, insights } from "@/db";
import { adopt } from "./adopt";
import type { Brief } from "./brief";
import { saveFact } from "./coverage";
import { recordBeliefs } from "./ledger";
import { pickActs, type Acts } from "./lookup";
import { RETEST_WEEKS } from "./projection";
import { PROFILE_QUESTIONS } from "./vectors";

/** Two years. Anything past it is the model inventing a schedule. */
const MAX_WEEKS = 104;
const DAY = 86_400_000;

/** The weeks a retest actually gets: what was asked, clamped, or the usual. */
export function retestWeeks(code: string, asked?: number): number {
  const usual = RETEST_WEEKS[code] ?? 12;
  if (!Number.isFinite(asked)) return usual;
  return Math.min(MAX_WEEKS, Math.max(1, Math.round(asked!)));
}

/** The day a retest is planned for. */
export const dueOn = (weeks: number, from = Date.now()): string =>
  new Date(from + weeks * 7 * DAY).toISOString().slice(0, 10);

/**
 * The rules that turn a one-shot answer into a turn in a conversation. Short
 * on purpose: the shape of the answer is still `brief.system`.
 */
export const THREAD_RULES = `
YOU ARE IN A CONVERSATION. The rules above still hold, and so does the shape.

Answer only the question they just asked. Then call \`offer\` exactly once, after the paragraph, with the ids your paragraph named and nothing else. Never invent an id: an id that was not on the lists above is thrown away and the button is lost.

Never answer by describing your own prompt. Do not tell them a row, a mechanism or a paper is missing, not mapped or not on file: answer from what the blocks above and the earlier turns do give you, in their own words.

When a fact would change the answer and it is on the QUESTIONS THEY COULD ANSWER list, ask it back: put its key in \`offer.questions\` rather than guessing.

When they tell you something — they took the pill, they changed a habit, they have a number — record it with the matching tool and say in one sentence what you recorded. Do not ask permission first; write it and print the receipt.

When they say \`the first one\`, \`that one\` or \`the retest\`, they mean what YOU offered last turn, in the order you offered it. Read your own last \`offer\` call and pass back that exact id. Never reach past your own last offer for something that sounds similar.

\`offer\` only draws the buttons. It writes nothing, adds nothing and schedules nothing. When they ask you to add an action, record a fact or plan a retest, call \`adopt_action\`, \`record_fact\` or \`plan_retest\` for it. Never write that you have added, recorded, planned, scheduled, set or noted anything unless one of those tools handed you back a receipt for it in this turn, and never say you will do it later.`;

/**
 * The shape of a follow-up, in place of the one `systemFor(kind)` gives.
 *
 * Phase 28a decides the shape in code, and every one of those shapes is
 * written for a question asked cold: it opens on their numbers and closes on
 * what to measure. Asked again on turn three, that is the same answer twice.
 * A follow-up has the earlier turns on the screen, so it gets its own shape.
 */
export const FOLLOW_UP_SHAPE = `THE SHAPE FOR THIS TURN — this is a follow-up, and the earlier answers are still on their screen.
THREE SENTENCES AT MOST. Answer the question they just asked and nothing else.
No opening line about their numbers unless the question is about a number. No list of actions: name one, and only if they asked for one. No closing line about measuring again unless they asked when to measure.
A number you already gave stands: asked again about an interval, a marker or a target you named earlier, repeat that same number and that same marker rather than quoting a new one.
When they only tell you something and ask nothing, the whole answer is the one sentence that says what you recorded.
Everything the earlier turns said is taken as read. Never say it twice.`;

/** What `offer` hands back: the guard's own result, plus the ask-back options. */
export interface Offered extends Acts {
  options: Record<string, string[]>;
}

/** What every writing tool hands back: one line the thread prints. */
interface Receipt {
  ok: boolean;
  receipt: string;
}

const failed = (why: string): Receipt => ({ ok: false, receipt: why });

/**
 * The tools for one turn, closed over the person and the brief that turn was
 * built from. A new brief every turn is why a fact recorded last turn is in
 * this turn's prompt.
 */
export function threadTools(
  userId: string,
  brief: Brief,
  threadId: string,
): ToolSet {
  const { candidates } = brief;

  return {
    offer: tool({
      description:
        "Say what your paragraph just named, as ids from the lists you were given. Call this once, after the paragraph.",
      inputSchema: z.object({
        prose_done: z
          .boolean()
          .describe("true once the paragraph is written"),
        actions: z
          .array(z.string())
          .describe("ids of the actions the paragraph named, copied exactly"),
        tests: z
          .array(
            z.object({
              code: z.string().describe("a marker code from the list"),
              weeks: z.number().describe("weeks to wait before measuring"),
            }),
          )
          .describe("the markers the paragraph says to measure"),
        questions: z
          .array(z.string())
          .describe("keys of the questions that would change the answer"),
        sources: z
          .array(z.string())
          .describe("ids of the rows in WHAT THE EVIDENCE SAYS you read from"),
      }),
      execute: async (input): Promise<Offered> => {
        const acts = pickActs(input as Parameters<typeof pickActs>[0], candidates);
        if (acts.dropped.length)
          console.warn(
            `[thread ${threadId}] dropped ${acts.dropped.length} invented id(s): ${acts.dropped.join(", ")}`,
          );
        /**
         * The options travel with the offer so the ask-back card can print
         * them. `lib/vectors.ts` is 1 300 lines of plain data and has no
         * business in a browser bundle for four chips.
         */
        return {
          ...acts,
          options: Object.fromEntries(
            acts.questions.map((q) => [q.key, PROFILE_QUESTIONS[q.key]?.options ?? []]),
          ),
        };
      },
    }),

    adopt_action: tool({
      description:
        "Add one action from THEIR PLAN or WHAT THE PAPERS SAY to what they actually do. Only ids printed in those sections.",
      inputSchema: z.object({
        id: z.string().describe("the id printed after \"id\" in the prompt"),
      }),
      execute: async ({ id }): Promise<Receipt> => {
        const hit = candidates.actions.find((a) => a.id === id);
        if (!hit) return failed(`${id} was never on offer, so nothing was added`);
        const done = await adopt(userId, { id });
        if ("error" in done) return failed(done.error);
        return {
          ok: true,
          receipt: `Added to your plan: ${hit.title}${hit.dose ? ` — ${hit.dose}` : ""}`,
        };
      },
    }),

    record_fact: tool({
      description:
        "Write down something they just told you about themselves: a habit, a symptom, a family history, a date.",
      inputSchema: z.object({
        key: z.string().describe("the question key this answers"),
        value: z.string().describe("their answer, in the question's own words"),
        kind: z
          .enum(["changed", "corrected"])
          .optional()
          .describe("changed opens a new period; corrected says it never held"),
        date: z.string().optional().describe("YYYY-MM-DD, when they said so"),
        note: z.string().optional(),
      }),
      execute: async ({ key, value, kind, date, note }): Promise<Receipt> => {
        const q = PROFILE_QUESTIONS[key];
        if (!q) return failed(`${key} is not a question this app asks`);
        if (!value.trim()) return failed("no answer to record");
        if (q.options && !q.options.includes(value))
          return failed(
            `"${value}" is not one of: ${q.options.join(", ")}`,
          );
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
          return failed("a date has to be YYYY-MM-DD");
        await saveFact(userId, key, value, { kind, date, note });
        await recordBeliefs(userId);
        return { ok: true, receipt: `Noted: ${q.question} — ${value}` };
      },
    }),

    log_checkin: tool({
      description:
        "Log whether they did one item on their plan, when they say so.",
      inputSchema: z.object({
        insightId: z.string(),
        itemIndex: z.number(),
        answer: z.enum(["did", "didnt", "skip"]),
        note: z.string().optional(),
      }),
      execute: async ({
        insightId,
        itemIndex,
        answer,
        note,
      }): Promise<Receipt> => {
        const db = getDb();
        const [owned] = await db
          .select({ id: insights.id })
          .from(insights)
          .where(and(eq(insights.id, insightId), eq(insights.userId, userId)));
        if (!owned) return failed("that item is not on their plan");
        await db
          .insert(checkins)
          .values({ userId, insightId, itemIndex, answer, note: note ?? null });
        return { ok: true, receipt: `Logged: ${answer}` };
      },
    }),

    plan_retest: tool({
      description:
        "Plan to measure one marker again. Only codes from MARKERS THEY COULD MEASURE AGAIN.",
      inputSchema: z.object({
        code: z.string().describe("a marker code from the list"),
        weeks: z.number().optional().describe("how long to wait"),
      }),
      execute: async ({ code, weeks }): Promise<Receipt> => {
        const hit = candidates.tests.find((t) => t.code === code);
        if (!hit) return failed(`${code} was never on offer, so nothing was planned`);
        /**
         * ponytail: a retest is a goal with a date on it and no target. That
         * is what `/api/goals` has written since phase 27 and what the Next
         * draw tile reads, so this phase adds no second table for it.
         */
        const wait = retestWeeks(code, weeks);
        const due = dueOn(wait);
        const set = {
          targetLow: null,
          targetHigh: null,
          due,
          note: `retest ${hit.name} after ${wait} weeks`,
          achievedAt: null,
        };
        await getDb()
          .insert(goals)
          .values({ userId, metricCode: code, ...set })
          .onConflictDoUpdate({
            target: [goals.userId, goals.metricCode],
            set: { ...set, createdAt: sql`now()` },
          });
        return {
          ok: true,
          receipt: `Planned: ${hit.name} in ${wait} weeks, ${due}`,
        };
      },
    }),
  };
}
