# Phase 28c: the thread (Ask and discuss as a conversation)

Written 2026-09-02. For an Opus implementation subagent. Research behind every
decision: `docs/plans/2026-09-02-chat-thread-research.md` (round one) and
`docs/plans/2026-09-02-chat-harness-research-2.md` (round two, twenty
candidates). Design: `docs/mockups/v4/chat.html` and its spec
`docs/plans/2026-09-02-phase28b4-v4-mockups-spec.md`.

## The decision

We do not build a harness and we do not adopt one. Twenty candidates were
scored. The session store is a table and two queries. The hard part, keeping a
long thread inside the context window without writing a summariser, is sold as
a stateless request parameter by OpenAI (`context_management` compaction, works
with `store: false`, verified in the guide and in `@ai-sdk/openai@4.0.56`,
which exposes it as `providerOptions.openai.contextManagement` and round-trips
the returned compaction item as a `custom` content part). So:

- The Vercel AI SDK we already run is the harness. `streamText` with tools and
  `stopWhen` is the tool loop. `useChat` is the client.
- OpenAI Responses does the context management. We never summarise.
- Threads and turns live in our Postgres, under our deletion policy. Hosted
  thread stores (OpenAI Conversations, Anthropic Managed Agents) are excluded
  from ZDR and BAA coverage, which for a blood-panel app is the wrong trade.
- The tools are thin wrappers over route logic that exists. The guard stays
  `pickActs`: the model picks ids from the closed sets it was given and every
  handler re-validates.

What the owner asked for is preserved: system prompt with the facts at hand,
the conversation continued by the harness, tools that update or add data, no
in-house memory or context management.

## Mandatory reads before any edit

1. `apps/simple/lib/lookup.ts` lines 540-700 (`AskCandidates`, `Acts`,
   `RawActs`, `askCandidates`, `pickActs`) and 850-1175 (`actsSchema`,
   `QUESTION_SYSTEM`, `QUESTION_SHAPES`, `systemFor`, `askModel`,
   `answerQuestion` in full).
2. `apps/simple/app/api/ask/route.ts`, `apps/simple/app/api/chat/route.ts`,
   `apps/simple/components/chat.tsx`, `apps/simple/app/(app)/chat/page.tsx`.
3. `apps/simple/components/composer.tsx` lines 240-300 and 395-420 (the ask
   call) and `apps/simple/components/ask-answer.tsx` (how acts render today).
4. `apps/simple/app/api/plan/adopt/route.ts`, `apps/simple/app/api/facts/route.ts`,
   `apps/simple/app/api/checkins/route.ts`, `apps/simple/lib/actions.ts`
   (`adoptBodyOf`), `apps/simple/lib/projection.ts` (`RETEST_WEEKS`).
5. `apps/simple/db/schema.ts` (`checkins` at 209 for the table style),
   `apps/simple/drizzle.config.ts`, the newest file in `apps/simple/drizzle/`.
6. `apps/simple/evals/ask.ts` in full (how cases, the judge and the dropped-id
   check work).
7. `docs/mockups/v4/chat.html` (open in a browser) and `docs/mockups/v4/v4.css`.
8. The two research documents named above.

## Hard constraints

- Never remove or weaken `pickActs`, `pnpm eval:ask`, `/brain`, `/hkb`.
- No approval gating on data writes. A tool that writes, writes, and the UI
  shows a receipt with the number it moved. No "confirm?" dialogs.
- Every act the answer offers comes from the closed sets in `askCandidates`.
  Anything else is dropped and counted.
- No new dependency beyond `@ai-sdk/openai`. No Redis, no second database, no
  Mastra. Bumping `ai` and `@ai-sdk/react` to current is allowed and expected.
- The composer's single-shot ask (`answerQuestion` via `/api/ask`) keeps
  working unchanged. The eval that scores it stays green.
- No secrets in code. `OPENAI_API_KEY` and `AI_THREAD_MODEL` are env.
- Do not commit. Do not push. Do not touch `docs/mockups/`.
- ASD-STE100 in prose you write for humans, no em dashes.

## Data

Two tables in `apps/simple/db/schema.ts`, then `pnpm db:generate` for
migration 0022. Keep the file names drizzle-kit produces.

```ts
/** One conversation. The title is the first question, cut at 80 chars. */
export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** the condition id a card's Discuss opened it about, if any */
    about: text("about"),
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("threads_user_idx").on(t.userId, t.lastTurnAt)],
);

/**
 * One message. `ui` is the UIMessage the client renders; `model` is the
 * ModelMessage[] slice the next turn sends (for an assistant turn that is
 * `response.messages`, compaction item included; for a user turn, one message).
 */
export const threadMessages = pgTable(
  "thread_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant"
    ui: jsonb("ui").notNull(),
    model: jsonb("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("thread_messages_thread_idx").on(t.threadId, t.createdAt)],
);

/** A marker the person plans to measure again. Written by the thread tool and, later, by the draw builder. */
export const retests = pgTable("retests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  dueOn: date("due_on").notNull(),
  source: text("source").notNull(), // "thread" | "plan"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

If a retest concept already exists under another name (search `projection`,
`retest`, `draw`, `planned` in `lib/` and `db/schema.ts` before adding), reuse
it and skip the `retests` table. Say which in the report.

## Server

### `lib/brief.ts` (new): the facts at hand

Extract from `answerQuestion` everything between "const named" and the
`generateObject` call into

```ts
export interface Brief {
  kind: QuestionKind;
  system: string; // systemFor(kind)
  facts: string; // the whole prompt body below "THEIR QUESTION:" as it is today
  candidates: AskCandidates;
  now: AskAnswer["now"];
  actions: PlanLine[];
  settles: string[];
  named: AskAnswer; // the term lookup result, unchanged
}
export async function briefFor(
  userId: string,
  question: string,
  about?: string,
): Promise<Brief>;
```

`answerQuestion` then becomes `briefFor` + the existing `generateObject` call +
`pickActs`. Its output must be byte-for-byte what it is today for the same
inputs. `pnpm eval:ask` proves it.

### `lib/thread-tools.ts` (new): the five tools

`tool()` from `ai`, zod input schemas, `execute` closes over `userId` and the
turn's `Brief`. Every handler validates before it writes. Every handler returns
a small JSON receipt the UI prints as one line.

| Tool           | Input                                                                                                     | Handler                                                                                                                      | Receipt                                       |
| -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `offer`        | `{ prose_done: true, actions: string[], tests: {code, weeks}[], questions: string[], sources: string[] }` | `pickActs(input, brief.candidates)`. Returns `Acts` with labels. No write.                                                   | rendered as the chip row and the Sources line |
| `adopt_action` | `{ id }`                                                                                                  | must be in `brief.candidates.actions`; then the same call `app/api/plan/adopt/route.ts` makes                                | "Added to your plan: {label}"                 |
| `record_fact`  | `{ key, value, kind?, date?, note? }`                                                                     | `key` in `brief.candidates.questions` or `PROFILE_QUESTIONS`; value validated the way `/api/facts` does; then the same write | "Noted: {question} = {value}"                 |
| `log_checkin`  | `{ insightId, itemIndex, answer, note? }`                                                                 | ownership check as `/api/checkins`; same write                                                                               | "Logged: {answer}"                            |
| `plan_retest`  | `{ code, weeks? }`                                                                                        | `code` in `brief.candidates.tests`; weeks default `RETEST_WEEKS[code] ?? 12`, max 104; insert `retests`                      | "Planned: {name} in {weeks} weeks, {date}"    |

`offer` is the structured half of every answer. The system prompt tells the
model: write the paragraph, then call `offer` once with the ids you named, from
these lists and no others. The model's `dropped` ids are logged
(`console.warn` with thread id) so the eval can read them.

Do not add a web search tool in this phase. Research-kind answers cite
`candidates.sources` only. Note in the report where a `web_search` tool would
plug in (it is one entry in the `tools` object on the OpenAI path).

### `lib/thread-model.ts` (new): which model, and compaction

```ts
export function threadModel() {
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return {
      model: openai.responses(process.env.AI_THREAD_MODEL ?? "gpt-5.6-luna"),
      providerOptions: {
        openai: {
          store: false,
          contextManagement: [{ type: "compaction", compactThreshold: 60_000 }],
          promptCacheKey: /* userId, passed in */,
        },
      },
      compacts: true,
    };
  }
  // ponytail: no OpenAI key, no compaction. Keep the last 40 model messages;
  // switch to the OpenAI path when threads outgrow that.
  return { model: model(process.env.AI_THREAD_MODEL), providerOptions: {}, compacts: false };
}
```

Pick `compactThreshold` so that a 6k-token facts block plus ten turns never
triggers it and a forty-turn thread does. State the number you chose and why.

### `app/api/chat/route.ts` (rewrite)

Body: `{ threadId?: string, about?: string, message: UIMessage }` (the
`useChat` transport sends only the last message, see client). Steps:

1. `currentUserId()` or 401.
2. Thread: load by id and user, or create with `title = message text cut at 80`,
   `about`. 404 if the id belongs to another user.
3. `brief = await briefFor(userId, text, thread.about)`. The facts block is
   rebuilt every turn, so a fact recorded by a tool last turn is in this turn's
   prompt.
4. History: `model` columns of the thread's messages in order, flattened. On
   the fallback path slice to the last 40.
5. `streamText({ model, system: brief.system + THREAD_RULES + "\n\n" + brief.facts, messages: [...history, userModelMessage], tools, stopWhen: stepCountIs(4), providerOptions })`.
6. `result.toUIMessageStreamResponse({ originalMessages: [message], onFinish })`.
   In `onFinish` insert the user row (`ui` = message, `model` = its ModelMessage)
   and the assistant row (`ui` = the finished UIMessage, `model` =
   `response.messages`), and bump `lastTurnAt`. Respond with the thread id in a
   header (`x-thread-id`) so a new thread's client learns it.

`THREAD_RULES` (add to the prompt, keep it short): answer only the question
asked; call `offer` exactly once after the paragraph; when a fact would change
the answer and is on the "QUESTIONS THEY COULD ANSWER" list, ask it back by
putting its key in `offer.questions`; when the person tells you something
(took the pill, changed a habit, a number), record it with the matching tool
and say what you recorded in one sentence; never invent an id.

Compaction round trip: the compaction item comes back inside
`response.messages` as an assistant `custom` part (`kind: "openai.compaction"`,
`providerMetadata.openai.encryptedContent`). Storing `response.messages`
verbatim and replaying them is the whole mechanism. Verify the installed `ai`
package types include `custom` content parts after the bump
(`grep -n "'custom'" node_modules/ai/dist/index.d.ts`). If it does not, bump
until it does and record the versions in the report.

### `app/api/chat/threads/route.ts` (new)

`GET`: the user's threads, newest `lastTurnAt` first, `{ id, title, about, lastTurnAt }`.
`DELETE ?id=`: the user's own thread only. `GET ?id=`: the thread with its
`ui` messages for rehydration.

### `app/api/ask/route.ts`

Unchanged, except: the response gains `threadable: true`. (The composer uses
it to show "Continue this".)

### Seeding a thread from a composer answer

`POST /api/chat/threads` with `{ question, answer: AskAnswer, about? }`
creates a thread with two rows: the user question and an assistant row whose
`ui` has a text part plus an `offer` tool part carrying `answer.acts`, and
whose `model` is `[{ role: "assistant", content: [{ type: "text", text: reply }] }]`.
Returns `{ id }`.

## Client

### `components/chat.tsx` (rewrite) and `app/(app)/chat/page.tsx`, `app/(app)/chat/[id]/page.tsx`

- `/chat`: "Everything you asked" list from `GET /api/chat/threads` (title,
  relative time, about chip), a composer at the top that starts a new thread.
  Empty state as in the mockup.
- `/chat/[id]`: the thread. `useChat` with a `DefaultChatTransport` whose
  `prepareSendMessagesRequest` sends `{ threadId, about, message: last }` only,
  and `messages` rehydrated from `GET /api/chat/threads?id=`. Read
  `x-thread-id` from the first response of a new thread and `router.replace`
  to `/chat/[id]`.
- Rendering an assistant message: text parts as the paragraph; the `offer`
  tool part (state `output-available`) as the chip row and the Sources line,
  reusing the pieces of `ask-answer.tsx` (evidence glyphs, chip styles) rather
  than copying them; other tool parts as one receipt line each. A `questions`
  entry renders as the ask-back card: the question text and its option chips.
  Picking an option posts to `/api/facts` (existing route) and then sends the
  user message "{question}: {option}" so the model continues.
- Chips act through the existing routes the composer already uses
  (`applyAction`, plan retest, facts). After a chip acts, append a receipt line
  under it. Do not route chip clicks through the model.
- Follow-up composer at the bottom: "Ask a follow-up, or tell me something".
- 390 px: the thread is the screen, the composer sticks to the bottom above the
  tab bar. Use the v4 tokens already in the app where they exist; do not
  import `v4.css`.

### `components/composer.tsx`

Under a single-shot answer, one quiet link: "Continue this". It posts to
`/api/chat/threads` with the question, the answer and `about`, then navigates
to `/chat/[id]`. Nothing else in the composer changes.

### iOS

Nothing. The web view carries the cookie and loads `/chat`. Native SwiftUI
thread screens are a later phase.

## Evals and tests

- `pnpm eval:ask` unchanged and green at the current score or better (it
  proves the `briefFor` extraction).
- New `evals/thread.ts` + `pnpm eval:thread`: three cases against the test
  account, each three turns, run through the real `/api/chat` logic (call the
  route module directly, do not spawn a server). Checks per turn: `offer` was
  called once; `dropped` is empty; a turn that states a fact ("I started
  selenium yesterday") produces a `record_fact` or `adopt_action` call and its
  receipt; the judge from `evals/ask.ts` scores prose. Print the model, the
  score and total tokens. On the OpenAI path also assert one case with
  `compactThreshold` forced low (env override) yields a `custom` compaction
  part in the stored `model` column on turn three and that turn four still
  answers.
- Vitest: `lib/brief.test.ts` (brief has the four blocks and the closed sets
  match `askCandidates`), `lib/thread-tools.test.ts` (each tool rejects an id
  that is not on offer, `offer` drops and counts, `plan_retest` clamps weeks),
  `app/api/chat/threads` ownership (another user's id gives 404).
- `pnpm test` green. `pnpm lint` and `pnpm typecheck` (or whatever the repo
  uses; check `package.json`) green.

## Verification commands (run all, paste output in the report)

```
cd apps/simple
pnpm db:generate && ls drizzle | tail -2
pnpm typecheck 2>/dev/null || pnpm tsc --noEmit
pnpm lint
pnpm test
pnpm eval:ask
pnpm eval:thread
grep -n "'custom'" node_modules/ai/dist/index.d.ts | head -3
```

Run the dev server, sign in as the test account, and shoot with Playwright
(same pattern as `/tmp/p28b/shot.py`) into `/tmp/p28c/`: `chat-list-1440.png`,
`thread-1440.png`, `thread-390.png` (a thread with a receipt and an ask-back
card visible), `composer-continue-1440.png`.

## Report back

Files touched with one line each. The `ai`/`@ai-sdk/*` versions before and
after. The compaction threshold and why. Whether `retests` was added or an
existing table reused. Eval scores for `eval:ask` before and after and
`eval:thread`. Anything skipped, and why. Where `web_search` would plug in.
