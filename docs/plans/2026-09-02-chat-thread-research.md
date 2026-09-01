# Chat, threads and memory for the Ask/Discuss surface

Research for phase 28b-4. Written 2026-09-02. Every claim below is either read out of
this repo or fetched from a live doc page; URLs at the end of each section.

The question asked was: "can we use a harness that exists already? does OpenRouter offer
something? I have a problem with having to implement memory and context management, can
we offset that? maybe an open harness like Pi or Hermes."

Short answer: no harness will offset it, because the thing you would be offloading is not
where this app's memory lives. The rest of this document is the evidence.

---

## 0. What is actually in the repo today (verified)

| Fact                                                               | Where                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `/api/ask` is a one-shot POST, no storage, no thread id            | `apps/simple/app/api/ask/route.ts:36-77`                         |
| The answer is produced by `generateObject`, not by streaming       | `apps/simple/lib/lookup.ts:1121-1162`                            |
| The closed-set guard is a pure function over model output          | `pickActs`, `lib/lookup.ts:629-680`                              |
| The candidate set is assembled in code from engine state           | `askCandidates`, `lib/lookup.ts:586-621`                         |
| Question kind is decided by regex before the model sees anything   | `questionKind`, `lib/ask-intent.ts:65-97`                        |
| Six per-kind prompt shapes                                         | `QUESTION_SHAPES`, `lib/lookup.ts:911-936`                       |
| A second, unrelated chat already exists and streams with AI SDK v6 | `app/api/chat/route.ts`, `components/chat.tsx`                   |
| That chat is explicitly not persisted                              | `components/chat.tsx:17` "ponytail: no conversation persistence" |
| `ai` installed version                                             | `6.0.116` (verified from `node_modules/ai/package.json`)         |
| `@ai-sdk/react`                                                    | `3.0.269`                                                        |
| Model factory is OpenRouter-only                                   | `model()`, `lib/extract.ts`                                      |
| Ask model                                                          | `AI_ASK_MODEL=google/gemini-3.7-flash` (`apps/simple/.env`)      |
| Drizzle schema is one file, 40 tables                              | `apps/simple/db/schema.ts`                                       |
| 21 migrations, own ledger in schema `simple`                       | `apps/simple/drizzle/`, `drizzle.config.ts`                      |
| The intended UX is already specced                                 | `docs/plans/2026-09-01-phase28b3-pages-and-flows-spec.md` §5     |

The 28b-3 spec §5 wants: a thread under the Ask pill, follow-up chips ("Why?", "What does
the research say?", "What test settles it?"), the previous turn collapsing to one line, a
removable context chip ("About Hashimoto's x"), the engine asking back for a fact, receipts
under statements, and a dated thread-history list.

Read that list again. Every follow-up chip in it maps one-to-one onto an existing
`QuestionKind`. That is the whole feature. It is not a general chatbot.

---

## 1. What OpenRouter does and does not offer

### Does not offer

**No conversation state. At all. By design.** The Responses API page says it in a banner:

> Stateless Only. This API is stateless - each request is independent and no conversation
> state is persisted between requests. You must include the full conversation history in
> each request. Requests that set `store: true` or a non-null `previous_response_id` are
> rejected with a `400` error.

https://openrouter.ai/docs/api_reference/responses/overview

So the OpenAI Responses trick (`store: true` + `previous_response_id`, server-side thread)
is explicitly blocked. There is no threads API, no messages API, no memory product, no
"chat history" endpoint. I walked the full docs index (412 lines,
https://openrouter.ai/docs/llms.txt) looking for one. The server-tool list is web search,
web fetch, datetime, image generation, apply patch, shell, bash, search models, tool
search, fusion, advisor, subagent. No memory tool.

### Does offer, and two of these are worth taking

- **`session_id` for sticky routing.** Pass `session_id` (body) or `x-session-id` (header),
  max 256 chars, and OpenRouter pins your requests to the same provider endpoint so the
  cache stays warm. Sticky sessions expire after 10 minutes of inactivity. Without it,
  OpenRouter derives a key by hashing the first system message and the first non-system
  message, which is wrong for this app because the system prompt changes per question kind.
  Your thread id is exactly the right value.
  https://openrouter.ai/docs/guides/best-practices/prompt-caching
- **Gemini caching.** Implicit caching is automatic on Gemini 2.5 and newer, no
  `cache_control` needed, cache reads at **0.25x** input... except the live model catalogue
  prices `google/gemini-3.7-flash` cache reads at **0.1x** ($0.075/M vs $0.75/M input).
  Implicit TTL is 3-5 minutes and varies. Minimum prompt size is 1024 tokens for Flash-class
  models. Explicit `cache_control` breakpoints are also supported, with a 5 minute TTL that
  does not refresh. Tip from the doc that matters here: keep the front of the message array
  stable and push the varying part to the end.
- **Presets**: server-stored model config (temperature, provider order, model). Config, not
  conversation. https://openrouter.ai/docs/api/api-reference/presets/list-presets
- **Guardrails**: spend and model-access controls, prompt-injection and secret detection,
  assigned per API key or org member. Not memory, but relevant to a health app.
- **Zero Data Retention.** `google/gemini-3.7-flash` on `google-vertex/global` is in the ZDR
  endpoint list (verified live at `https://openrouter.ai/api/v1/endpoints/zdr`, 825 ZDR
  endpoints total). It reports `supports_implicit_caching: true`, `structured_outputs: true`,
  `tools: true` and full `tool_choice` support. For a health app, pinning to ZDR endpoints
  is a one-line provider preference and should be done regardless of this phase.
  https://openrouter.ai/docs/guides/features/zdr

### Live pricing, `google/gemini-3.7-flash`, 2026-09-02

Fetched from `https://openrouter.ai/api/v1/models`:

|                       | $/M tokens |
| --------------------- | ---------- |
| input                 | 0.75       |
| output                | 3.75       |
| cache read            | 0.075      |
| cache write (storage) | 0.042      |
| context               | 1,048,576  |

A cheaper `google-vertex/global/flex` tier exists at exactly half ($0.375 / $1.875) with
worse uptime (80.8% over the last day vs 99.5% for standard). Not worth it for an
interactive box.

---

## 2. Candidate comparison

Criteria: fits Next 16 + drizzle/Postgres self-hosted on Coolify; keeps the closed-set guard
server-side; minimal new deps; offloads memory/context; works with OpenRouter; no per-seat SaaS.

| Candidate                                                 | New deps                                                 | Thread persistence in **your** Postgres                                                    | Context mgmt offloaded                                                            | Keeps `pickActs` guard                            | OpenRouter            | Verdict                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| **`ai` v6 (already installed) + 2 tables**                | **0**                                                    | you write ~60 lines                                                                        | no, but you get `prepareStep` + `pruneMessages` + `ToolLoopAgent` free            | yes, untouched                                    | yes                   | **RECOMMENDED**                                                               |
| OpenRouter primitives                                     | 0                                                        | none exists                                                                                | none exists                                                                       | n/a                                               | n/a                   | Nothing to adopt. Take `session_id` only                                      |
| assistant-ui                                              | 3-5 (`@assistant-ui/react`, `-ai-sdk`, Base UI or Radix) | only via a `RemoteThreadListAdapter` you write, or their cloud                             | no                                                                                | yes                                               | yes                   | PARTIAL. UI only. Cloud is $50/mo per 500 MAU                                 |
| AI Elements (`ai-elements`)                               | 0 runtime (shadcn copy-in)                               | no                                                                                         | no                                                                                | yes                                               | yes                   | PARTIAL. Components, not architecture. Wrong aesthetic for this app           |
| Mastra (`@mastra/core` + `memory` + `pg`)                 | 3 big ones                                               | yes, its own tables in your PG                                                             | **yes**: working memory, semantic recall, observational memory, memory processors | only if you re-implement it inside a Mastra Agent | yes                   | PARTIAL. Best memory story of anything here, but it takes over the agent loop |
| mem0 (OSS)                                                | Node SDK + vector store                                  | facts only, not turns                                                                      | long-term facts, not window mgmt                                                  | yes                                               | yes                   | DOES NOT FIT. Duplicates the engine's own facts                               |
| Zep                                                       | n/a                                                      | n/a                                                                                        | n/a                                                                               | n/a                                               | n/a                   | DOES NOT FIT. Community Edition deprecated April 2025, cloud only             |
| Graphiti                                                  | Python + Neo4j/FalkorDB                                  | separate graph store                                                                       | no                                                                                | yes                                               | yes                   | DOES NOT FIT. Second service, second graph, you already have `kg_edges`       |
| Letta (ex-MemGPT)                                         | Python server + own PG                                   | its own schema                                                                             | yes, MemGPT-style                                                                 | no, it owns the loop                              | yes                   | DOES NOT FIT                                                                  |
| LangGraph JS + `@langchain/langgraph-checkpoint-postgres` | 2 (MIT, 1.4.13 / 1.0.5)                                  | yes, checkpointer tables                                                                   | no, you write the summariser                                                      | yes                                               | yes                   | PARTIAL. Adopts a graph runtime for a two-node graph                          |
| OpenAI Agents SDK JS sessions                             | 1                                                        | `OpenAIConversationsSession` needs OpenAI's Conversations API; `MemorySession` is dev-only | no                                                                                | yes                                               | **no** for sessions   | DOES NOT FIT                                                                  |
| Claude Agent SDK sessions                                 | 1                                                        | local session files                                                                        | yes, auto-compaction                                                              | no, owns the loop                                 | Anthropic-shaped only | DOES NOT FIT                                                                  |
| **Pi** (`@earendil-works/pi-agent-core`)                  | 2-3                                                      | SQLite backend only                                                                        | `transformContext` hook, you write the compaction                                 | you would rewrite it                              | yes                   | DOES NOT FIT. See §3                                                          |
| **Hermes Agent** (Nous)                                   | Python service                                           | its own store                                                                              | yes                                                                               | no, owns the loop and 40+ tools                   | yes                   | DOES NOT FIT. See §3                                                          |
| resumable-stream                                          | 1 + **Redis**                                            | n/a                                                                                        | n/a                                                                               | n/a                                               | n/a                   | SKIP. Needs Redis; your answers are four sentences                            |

---

## 3. Straight verdict on Pi and Hermes

### Pi

It is real, it is more library-shaped than I expected, and it still does not fit.

`badlogic/pi-mono` is a monorepo, MIT, recently renamed to the `@earendil-works/*` npm scope
(older `@mariozechner/*` publishes are still up, 0.73.1). The packages are:

- `@earendil-works/pi-ai`: unified multi-provider LLM API with token/cost tracking
- `@earendil-works/pi-agent-core`: "Stateful agent with tool execution and event streaming"
- `@earendil-works/pi-coding-agent`: the CLI
- `@earendil-works/pi-tui`: terminal UI with differential rendering

So there _is_ an embeddable core. `new Agent({ initialState, streamFn, transformContext,
sessionId, beforeToolCall, afterToolCall, shouldStopAfterTurn })`. It runs in Node, it is
not tied to the TUI, and it can talk to OpenRouter.

Why it still does not fit:

1. **It does not solve the thing you want solved.** Compaction is `transformContext:
async (messages, signal) => pruneOldMessages(messages)`. That is a hook. You write the
   pruning. The AI SDK you already have gives you the identical hook (`prepareStep`) plus a
   built-in `pruneMessages` helper that Pi does not have.
2. **Sessions are SQLite.** The persistence backend lives in
   `@earendil-works/pi-session-backend-sqlite-node`. There is no Postgres backend. You would
   write one, which is the same work as writing two drizzle tables, except now it is behind
   someone else's interface.
3. **Wrong streaming protocol.** Pi emits its own event stream. `useChat` expects the AI SDK
   UI message stream. You would write a translator.
4. **It replaces your provider layer.** `pi-ai` instead of `@openrouter/ai-sdk-provider`,
   which means `lib/extract.ts`'s `model()` and every other AI call in the app now has two
   client stacks.

Net: you would add three dependencies, rewrite the streaming protocol, write a Postgres
session backend, and still write your own compaction. Pi is an excellent terminal coding
agent. It is not a web chat backend.

Disambiguation: this is not Inflection's Pi (the consumer personal AI, effectively wound
down after the 2024 Microsoft acquihire) and not the `pi` in any other sense.

Sources: https://github.com/badlogic/pi-mono ,
https://www.npmjs.com/package/@mariozechner/pi-agent-core ,
https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/agent/README.md ,
https://mariozechner.at/posts/2025-11-30-pi-coding-agent/

### Hermes

Two different things share the name, and the owner is probably thinking of the wrong one.

- **Hermes 3 / Hermes 4** are Nous Research _models_, available on OpenRouter
  (https://openrouter.ai/nousresearch, 17 models). Not a harness.
- **Hermes Agent** (`NousResearch/hermes-agent`) is a real, very large harness. Python,
  MIT, ~239k stars. It is a self-improving personal agent: a learning loop that writes its
  own skills, persistent memory across sessions, 40+ built-in tools, 20+ messaging
  platforms, six terminal backends, a desktop app, cron scheduling, MCP. You install it
  with `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash` and then run
  `hermes setup`.

It does have an OpenAI-compatible API server (`gateway/platforms/api_server.py`) with
session continuity, and a documented "use Hermes as a Python library" path. So it is
_technically_ reachable from Next.js over HTTP.

It still does not fit, for one reason that outranks all the operational ones: **Hermes owns
the loop.** The entire value of `answerQuestion` is that the engine computes every number
and `pickActs` throws away every id the model was not handed. Hand the turn to Hermes and
the model has 40 tools, a shell, browser automation, its own memory of the user's health
facts stored outside your Postgres, and no closed set. That is the opposite of ROADMAP
principle 3. Add to that: a Python service to run and update on Coolify, per-user profile
isolation you would have to engineer, and a second copy of a person's health history in a
store you do not control.

Sources: https://github.com/NousResearch/hermes-agent ,
https://hermes-agent.nousresearch.com/docs ,
https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server ,
https://hermes-agent.nousresearch.com/docs/guides/python-library ,
https://openrouter.ai/blog/tutorials/hermes-agent/

---

## 4. The thing the harness question misses

Every memory product in §2 solves "the model forgot what the user said three turns ago" or
"the model does not know the user is vegetarian".

This app already knows the user is vegetarian. It is in `profile_facts`. It knows their
ferritin, their plan, their open projections, their belief snapshots, their conditions and
scores. `chatContext()` and `buildModelInput()` already assemble it, and `answerQuestion`
already pushes all of it into every prompt.

Bolt mem0 or Zep on top and you get a _second_, LLM-extracted, ungrounded copy of the same
health facts, with no grade label, competing with the engine for authority in the same
prompt. For a health app that has spent five phases making sure every claim carries its
source, that is a regression, not a feature.

The only memory you are actually missing is **what was said in this thread, five minutes
ago**. That is a bounded, small, structured problem, and you already produce the structure:
every turn yields `question`, `kind`, `reply`, `acts.actions[].id`, `acts.tests[].code`,
`acts.sources[].id`. Recapping a turn is a `map` and a `join`, not an inference call.

---

## 5. Recommendation

**Stay on `ai` v6, which is already installed. Add two tables and a recap function. Add zero
dependencies.**

### 5.1 Tables

Two new `pgTable`s in `apps/simple/db/schema.ts`, following the `insights` / `checkins`
pattern already there (uuid pk, `text user_id` referencing `users.id` on delete cascade,
`jsonb` body, `timestamptz` created_at):

```ts
export const askThreads = pgTable(
  "ask_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** the first question, trimmed: the line the history list prints */
    title: text("title").notNull(),
    /** the condition id a card's Discuss pinned, or null: the context chip */
    about: text("about"),
    /** two sentences, rewritten every SUMMARY_EVERY turns; null under that */
    summary: text("summary"),
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("ask_threads_user_idx").on(t.userId, t.lastTurnAt)],
);

export const askTurns = pgTable(
  "ask_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => askThreads.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    /** status | howto | prognosis | research | why | next-test */
    kind: text("kind").notNull(),
    reply: text("reply").notNull(),
    /** the whole Acts object, guard already applied */
    acts: jsonb("acts").$type<Acts>(),
    /** the `now` row the answer printed above itself */
    now: jsonb("now").$type<AskAnswer["now"]>(),
    /** which model wrote it, so `pnpm eval:ask` can read prod turns later */
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("ask_turns_thread_idx").on(t.threadId, t.createdAt)],
);
```

One migration: `pnpm --filter simple db:generate`.

Note the shape: one row per _exchange_, not one row per message. There is no user message
and assistant message; there is a question and its answer. That is what this surface is.

### 5.2 Context management, and who does it

Three layers, cheapest first. Only the third costs a token.

**Layer 1, free and deterministic: the recap.** A new pure function in `lib/lookup.ts`,
sitting next to `pickActs` and tested the same way:

```ts
/** One earlier turn, in the ~40 tokens the next prompt needs. */
export function recapOf(t: TurnRow): string {
  const first = t.reply.split(/(?<=[.!?])\s/)[0] ?? t.reply;
  const named = [
    ...(t.acts?.actions ?? []).map((a) => a.title),
    ...(t.acts?.tests ?? []).map((x) => `${x.name} in ${x.weeks} w`),
  ];
  return (
    `- they asked "${t.question}" (${t.kind}) · you said: ${first}` +
    (named.length ? `\n  you offered: ${named.join(", ")}` : "")
  );
}
```

**Layer 2, free: the sliding window.** `threadBlock(summary, recent)` renders the last
`WINDOW = 6` turns through `recapOf`, under the heading `EARLIER IN THIS THREAD`. Six
recaps is about 250 tokens. Also pure, also unit-testable.

**Layer 3, one small call every six turns: the summary.** When a thread passes turn 6, one
`generateText` call folds the recaps that fell out of the window into two sentences and
writes them to `ask_threads.summary`. `threadBlock` prints the summary above the window.
This is the only inference in the memory path, and it fires once per six turns.

That is the whole context management story. It is roughly 80 lines. No harness ships
anything better for this shape, because no harness knows that a turn's meaning is
`(kind, first sentence, ids offered)` rather than a wall of tokens.

If you later want a real tool loop (search the KB mid-answer, re-score, ask back and
continue), the upgrade path is already in the `ai` package you have: `ToolLoopAgent` with
`prepareStep` returning `pruneMessages({ messages, reasoning: 'all', toolCalls:
'before-last-3-messages', emptyMessages: 'remove' })`. I verified `ToolLoopAgent` and
`pruneMessages` are both exported from the installed `ai@6.0.116`. Still zero new deps.

### 5.3 Routes

- `POST /api/ask` gains an optional `threadId` and returns `{ threadId, turnId, ...answer }`.
  Absent id creates a thread with `title` from the question and `about` from the body.
  Writes one `ask_turns` row after `answerQuestion` returns.
- `GET /api/ask/threads` lists `{ id, title, about, lastTurnAt }` for the history list.
- `GET /api/ask/threads/[id]` returns the turns for reopen-on-tap.
- `DELETE /api/ask/threads/[id]`.

`action: "consider"` is unchanged.

### 5.4 What survives in `lib/lookup.ts`

Everything. This is the point of the recommendation.

| Survives untouched | `questionKind`, `QUESTION_SHAPES`, `systemFor`, `CITES_SOURCES`, `ACTS_KINDS`, `askCandidates`, `pickActs`, `sourcesFor`, `mechanismsFor`, `settlesLine`, `askModel`, `actsSchema`, `generateObject` |
| Changes | `AskOptions` gains `thread?: { summary: string \| null; recent: TurnRow[] }`. One `${threadBlock(...)}` interpolation in the prompt, placed **after** the engine blocks and before `${context}` so the stable prefix stays stable for Gemini's implicit cache |
| Adds | `recapOf`, `threadBlock`, `summariseThread` |
| Prompt adds | one paragraph to `QUESTION_SYSTEM`: "EARLIER IN THIS THREAD is what you have already told them. Never repeat an action you already named there. When they ask a follow-up, answer only the new part." |

Critically, `questionKind` still runs **per turn**. A follow-up "why?" re-routes to the
`why` shape and gets graph edges; a follow-up "what does the research say?" gets the papers
block. That is better behaviour than any generic chat harness gives you, and it is already
built. A harness would flatten all six shapes into one system prompt, which is exactly the
bug phase 28a fixed.

### 5.5 Follow-up chips: no model involvement

The 28b-3 spec's chips are the kinds. Generate them in code from the kind just answered:

| just answered | offer                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `status`      | Why? · What should I do? · What test settles it?                      |
| `howto`       | Why does that work? · What does the research say? · I already do this |
| `prognosis`   | What does the research say? · What would change this?                 |
| `research`    | What should I do? · What test settles it?                             |
| `why`         | What should I do? · What does the research say?                       |
| `next-test`   | Why that one? · Plan the draw                                         |

Tapping a chip posts the chip's text with the same `threadId` and `about`. `questionKind`
reads it and lands on the right shape. Zero new guard surface, and the chips can be
snapshot-tested.

"I already do this" is the statement path, not a question: it posts to `/api/facts` and
renders the receipt the spec asks for. That write path exists (`composer.tsx:525`).

### 5.6 Client

- New `components/ask-thread.tsx`. Turn N renders through the existing `AskAnswer` and
  `ActOnIt`; turns 1..N-1 collapse to `recapOf`'s first clause plus the date.
- `composer.tsx:411` changes `setAsked(data)` to appending onto a `turns` array, and keeps
  `threadId` in state next to `DRAFT_KEY` in sessionStorage.
- `ask-answer.tsx`, `act-on-it.tsx`, `evidence-chip.tsx` are unchanged.

### 5.7 Do not do

- **Do not add `useChat` here.** The answer is one paragraph and a structured `acts` object;
  the guard has to run on the complete object anyway. `generateObject` is right. If the
  answers ever grow, `streamObject` + `toUIMessageStreamResponse({ originalMessages,
onFinish })` is the drop-in, and the persistence hook is already in the installed types
  (verified at `node_modules/ai/dist/index.d.ts:2319-2340`).
- **Do not add resumable streams.** They need Redis. Coolify runs one container.
- **Do not add assistant-ui.** It is MIT and good, but it is a UI runtime. You would still
  write the Postgres adapter, and you would be re-skinning it into this app's typography
  anyway. Its cloud is $50/mo for 500 MAU, which is the SaaS lock-in the criteria rule out.
- **Do not add a memory service.** §4.

### 5.8 One free win, one line

Pass the thread id as OpenRouter's `session_id`. `@openrouter/ai-sdk-provider` accepts
`extraBody` (verified at `node_modules/@openrouter/ai-sdk-provider/dist/index.d.ts:364`):

```ts
export const askModel = (id?: string, threadId?: string) =>
  createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(
    id ?? process.env.AI_ASK_MODEL ?? "google/gemini-3.7-flash",
    threadId ? { extraBody: { session_id: threadId } } : undefined,
  );
```

This pins the thread to one provider endpoint so Gemini's implicit cache actually hits on
follow-ups, and it groups the whole thread in OpenRouter's Sessions log view. Without it,
OpenRouter hashes the first system message, which changes every turn here because the shape
changes with the kind. Follow-up chips are tapped within seconds, so they land inside the
3-5 minute implicit TTL.

---

## 6. Cost

Measured against the real prompt in `answerQuestion`. It carries: the system prompt plus
shape (~600 tokens), conclusions, plan and papers blocks, projections, up to 30 test lines,
up to 12 question lines, the kind block (up to 8 source rows), and `chatContext` (one line
per metric plus two plan lines). Call it **6,000 input / 250 output** for a typical turn.

At `google/gemini-3.7-flash` list ($0.75 / $3.75 per M):

|                                               | input   | output  | per turn    |
| --------------------------------------------- | ------- | ------- | ----------- |
| today, one-shot                               | $0.0045 | $0.0009 | **$0.0054** |
| with a 6-turn thread block (+250 tok)         | $0.0047 | $0.0009 | **$0.0056** |
| same, with the cache hitting 4k of the prefix | $0.0018 | $0.0009 | **$0.0027** |
| no window, 20 turns carried raw (+6,000 tok)  | $0.0090 | $0.0009 | $0.0099     |

Per user per month:

| usage                               | turns/mo | cost/mo    |
| ----------------------------------- | -------- | ---------- |
| light, 2 questions/day              | 60       | **$0.34**  |
| the owner, 10 questions/day         | 300      | **$1.68**  |
| same, with cache hits on follow-ups | 300      | **~$1.00** |

Plus summarisation: one `generateText` per six turns, ~2,000 in / 150 out = $0.002. At 300
turns that is 50 calls, **$0.10/month**. Plus optional thread titling, which you should not
pay for at all: use the first question, trimmed.

Storage: a turn row is ~2 KB with the `acts` jsonb. 300 turns/month is 600 KB/user/year.
Free.

**The window is what keeps this flat.** The bottom row of the first table is what happens
if you let a thread accumulate: cost doubles and keeps climbing. Capping at six recaps
plus a summary is the entire difference between $1.68 and unbounded, and it is 80 lines of
code. That is the honest answer to "can we offload context management": you cannot offload
it, but at this shape it is not worth offloading.

Also worth taking: pin to ZDR endpoints. Zero cost, and `google/gemini-3.7-flash` on
`google-vertex/global` is ZDR-eligible with implicit caching intact.

---

## 7. What would change this call

Adopt Mastra (`@mastra/core` 1.63.2, `@mastra/memory` 1.28.1, `@mastra/pg` 1.22.2, all
Apache-2.0) only if the Ask surface becomes a genuine multi-turn agent: several tool calls
per turn, long transcripts, cross-thread recall of things the engine does not model. Its
Observational Memory (an Observer and a Reflector maintaining a dense log that replaces raw
history) is the best automatic-compaction story in TypeScript right now, and its Postgres
adapter supports resource-scoped semantic recall. The cost is that memory only works through
`Agent` from `@mastra/core/agent`, so `answerQuestion` gets rebuilt inside their loop and
the closed-set guard has to be re-attached as a processor. That is a real phase of work, and
nothing in the 28b-3 spec asks for it.

Sources: https://mastra.ai/docs/memory/overview , https://mastra.ai/docs/memory/observational-memory ,
https://mastra.ai/docs/memory/memory-processors

---

## 8. All URLs

**OpenRouter**

- https://openrouter.ai/docs/api_reference/responses/overview (stateless, `store` rejected)
- https://openrouter.ai/docs/llms.txt (full docs index)
- https://openrouter.ai/docs/guides/best-practices/prompt-caching (`session_id`, Gemini caching, multipliers)
- https://openrouter.ai/docs/guides/features/server-tools.md
- https://openrouter.ai/docs/guides/features/zdr.md
- https://openrouter.ai/api/v1/models , https://openrouter.ai/api/v1/endpoints/zdr (live pricing and ZDR, fetched 2026-09-02)

**AI SDK**

- https://v6.ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
- https://v6.ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams (Redis required)
- https://v6.ai-sdk.dev/docs/agents/loop-control (`prepareStep`, `pruneMessages`, `stopWhen`)
- https://v6.ai-sdk.dev/docs/ai-sdk-ui/streaming-data (`data-*` parts)
- https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 (v7 exists; v6.0.116 is what is installed, do not follow v7 docs)
- https://elements.ai-sdk.dev/ , https://github.com/vercel/ai-elements

**Chat UI**

- https://www.assistant-ui.com/pricing , https://www.assistant-ui.com/docs/architecture
- https://www.assistant-ui.com/docs/runtimes/concepts/adapters , https://github.com/assistant-ui/assistant-ui/issues/2136

**Memory layers**

- https://mastra.ai/docs/memory/overview and the pages in §7
- https://docs.mem0.ai/open-source/configuration , https://mem0.ai/blog/self-host-mem0-docker
- https://blog.getzep.com/announcing-a-new-direction-for-zeps-open-source-strategy/ (CE deprecated)
- https://github.com/letta-ai/letta
- https://www.npmjs.com/package/@langchain/langgraph-checkpoint-postgres (1.0.5, MIT)
- https://openai.github.io/openai-agents-js/guides/sessions/

**Harnesses**

- https://github.com/badlogic/pi-mono , https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/agent/README.md
- https://www.npmjs.com/package/@mariozechner/pi-agent-core , https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- https://github.com/NousResearch/hermes-agent , https://hermes-agent.nousresearch.com/docs
- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/guides/python-library
- https://openrouter.ai/blog/tutorials/hermes-agent/ , https://openrouter.ai/nousresearch
