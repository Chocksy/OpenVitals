# Chat harness, round two: can we buy the session layer instead of building it?

Written 2026-09-02. Round one is at `/tmp/p28b4/chat-research.md` and recommended ~80 lines of
our own thread code. This round takes the pushback seriously: find a harness that owns the
session, hand it a system prompt and 4-6 tools, and go back to working on connections, papers
and markers.

Every claim below is quoted from a doc page or source file that was actually fetched. Anything
not confirmed is marked UNVERIFIED.

---

## What the repo actually forces on us (read this before the table)

Four constraints came out of reading the code, and they kill several candidates before pricing
even matters.

1. **iOS has no identity anywhere except our Next app.** `apps/ios/OpenVitals/Api.swift` signs in
   with `POST /api/auth/sign-in/email` (better-auth) and keeps the `better-auth.session_token`
   cookie; `Api.adopt()` refuses cookies for other domains, and the webview is handed the same
   cookie. So criterion 3 ("reachable from Next AND from iOS") is satisfied by *any* candidate
   as long as our routes proxy. It is satisfied by *no* candidate directly, unless we build a
   second token story. This weakens the "MCP gives web and iOS one tool surface" argument a lot:
   both clients already share one tool surface, our own API routes.
2. **The guard is a pure function, and the eval measures it.** `pickActs(raw, c)` in
   `apps/simple/lib/lookup.ts` maps model output ids against `byId`/`byCode`/`byKey`/`bySource`
   and pushes anything unmatched onto `dropped`, which `pnpm eval:ask` reads as a violation.
   Docblock: *"Principle 3, as a function: the model chooses from the ids it was given and the
   engine owns every button."* Any harness has to preserve that. Tools-as-guard works only if
   the tool handler re-validates ids server-side, exactly like `pickActs` does now. The tools
   are not automatically the guard; the *handlers* are.
3. **"Plan a retest" has no write path.** `apps/simple/db/schema.ts` has 39 tables and no
   draws/retests/orders table. That tool needs a new table and a migration whichever harness wins.
4. **One container, no Redis.** `docker-compose.simple.yml` is postgres:16-alpine + web. Anything
   that wants a second database engine (Inkeep: Doltgres *and* Postgres) or Redis
   (Vercel chatbot template's resumable streams) is a real ops step change on the Hetzner box.

One more, decisive for a health app: **every hosted API that stores threads for you marks that
exact feature ZDR/HIPAA-ineligible**, and all of them say it is because the transcripts are
durable. See the retention rows in the table.

---

## (a) Scoring table

Criteria, in the owner's priority order:

- **C1 Harness owns the session** — conversation state *and* automatic context-window management
  (compaction/summarisation that fires on its own, not an endpoint we call).
- **C2 Per-session system prompt + our tools** — can we inject the facts block per turn, and
  attach 4-6 tools (MCP preferred)?
- **C3 Next + iOS** — per-user threads, thread list, resume, over HTTP.
- **C4 Model + hosting** — OpenRouter or a good cheap model; self-hostable in our compose is a
  plus; per-seat pricing disqualifies.
- **C5 Minimal glue** — files we still write in this repo.

Scores: **Yes / Partial / No**. `$` is per user per month at 10 questions/day, 300 turns,
~6k-token facts block, ~400-token answers, one 10-turn thread per day so history accumulates
(2.505M input, 120k output).

### Hosted conversation-state APIs

| Candidate | C1 owns session | C2 prompt + tools | C3 Next + iOS | C4 model/hosting | C5 glue | $ | Verdict |
|---|---|---|---|---|---|---|---|
| **OpenAI Responses + Conversations** | **Partial.** Threads hosted. Default window policy is `truncation:"auto"` = *"the model will truncate the response to fit the context window by dropping items from the beginning of the conversation"*. Real compaction exists (`context_management: [{type, compact_threshold}]`, Feb 2026) but the guide documents it only for stateless and `previous_response_id` loops and **never mentions the `conversation` param**. UNVERIFIED whether it prunes a hosted conversation. | **Yes.** Remote MCP first-class: `{type:"mcp", server_url, headers, authorization, allowed_tools, require_approval, defer_loading}`, Streamable HTTP or SSE. Mixed `tools` array so `web_search` + `function` + `mcp` coexist. | **Partial.** 8 conversation endpoints, **no list endpoint and no user field**. Resume by id works; the thread list is our table. | **Partial.** OpenAI models only (`model` is an enum). gpt-5.6-luna $0.20/$1.20 is the cheapest cheap tier found. Per-token, no seats. | ~3 files | **luna $0.65**, gpt-5-mini $0.87 | Cheapest, best MCP story. **Conversations is ZDR: No, Eyes Off: No** while `/v1/responses` is Yes/Yes — so the hosted-thread feature is the one a BAA can't cover. |
| **Anthropic Messages API** | **No on state, Partial on window.** *"The Messages API is stateless, which means that you always send the full conversational history."* Compaction (`compact_20260112`) is genuinely automatic — *"handles context management automatically, without client-side summarization code"* — but *"Context editing is applied server-side before the prompt reaches Claude. Your client application maintains the full, unmodified conversation history."* Server-side means applied to the prompt, not stored for us. | **Yes.** MCP connector (`mcp-client-2025-11-20`) needs both `mcp_servers` and `tools:[{type:"mcp_toolset"}]`; public HTTPS only. Or plain function tools. | **No.** We store, list and resume everything. | **Partial.** Anthropic only. Haiku 4.5 $1/$5, Sonnet 5 $2/$10 (the Sep 1 increase to $3/$15 was cancelled). Only vendor with deliberate `cache_control` on the facts block. | ~4 files | Haiku 4.5 **$3.11**, or **$1.22** with bursty 5m caching; Sonnet 5 $6.21 / $2.45 | Best caching, worst state story. Compaction and MCP connector are both **HIPAA: No**. |
| **Anthropic Managed Agents** (`/v1/agents`, `/v1/sessions`) | **Yes.** *"Event history is persisted server-side and can be fetched in full."* *"The harness supports built-in prompt caching, compaction, and other performance optimizations."* Sessions idle and resume. | **Partial.** `agent_with_overrides` at create, but *"The agent's configured `system` field is fixed for the session's lifetime"* — you append via `system.message` events. MCP with vault-stored OAuth. | **Partial.** `GET /v1/sessions` filters by `agent_id`, `statuses`, `created_at` — **no user_id filter**. `metadata` accepts 16 pairs but isn't filterable. | **No.** Anthropic only, plus **$0.08/session-hour** on `running` time (~+$0.13/user/mo). | ~3 files | +$0.13 over Messages | The only hosted thing that truly does everything asked. And: *"Managed Agents is not currently eligible for Zero Data Retention or HIPAA Business Associate Agreement (BAA) coverage."* **Disqualified for a health app under a BAA.** |
| **Google Gemini Interactions API** (GA Jun 2026) | **Partial.** `previous_interaction_id` retrieves history server-side. But *"The `previous_interaction_id` parameter preserves only the conversation history (inputs and outputs). The other parameters are interaction-scoped... `tools`, `system_instruction`, `generation_config`... you must re-specify these parameters in each new interaction."* No truncation, summarisation or budget field on the resource at all. Google's answer to long threads is the 1M window. | **Partial.** `tools:[{type:"mcp_server", name, url, headers, allowed_tools}]`, **Streamable HTTP only**, server names must not contain `-`. **Doc contradiction:** the Interactions overview says *"Gemini 3 does not support remote MCP, this is coming soon"* while the function-calling page shows `gemini-3.7-flash` doing exactly that. UNVERIFIED which is stale. | **Partial.** Four methods only (`POST`, `GET`, `DELETE`, `cancel`). **No `interactions.list`, no user field.** Retention 55 days paid / 1 day free. | **Partial.** Gemini only. `gemini-3.7-flash` $0.75/$3.75 — **doubles 2027-01-01**. Implicit caching only; the 6k block cannot be pinned. | ~3 files | **$2.33**, **$4.66** after the price cliff, `gemini-3.1-flash-lite` $0.81 | Same model we already default to (`AI_DEFAULT_MODEL=google/gemini-3.7-flash`), but via Google direct, not OpenRouter. |
| **Google Agent Engine Sessions + Memory Bank** | **No.** Sessions/events/memories are REST-addressable with no code deployed. `:compact` exists but the schema comment gives it away: *"reused across surfaces (e.g. on the compact request today, and on session creation for a **future reactive trigger**)"*. We call it, on our policy. Retrieval is manual: *"Then you can insert the retrieved memories into your prompt."* | **No.** It is storage. We assemble every request. | **Yes — the only candidate with a real per-user thread list.** Session has a required immutable `userId`; `GET .../sessions?filter=user_id="X"`. TTL 365 days. | **Yes-ish.** Model-agnostic event storage with a `raw_event` escape hatch *"useful for interoperability with other agent frameworks"*, so OpenRouter turns can be stored. Memory Bank is locked to `publishers/google/models/*`. No fixed cost: 50 vCPU-h + 100 GiB-h + 1 GiB free, sessions bill 1 vCPU-h per 3M reads / 1M writes. | ~5 files | +$0.31 (memory generation) over the model cost | Great storage, not a harness. HIPAA coverage **UNVERIFIED** — check the GCP covered-products list; AI Studio keys are a different legal surface from Vertex. |

### Self-hostable harnesses

| Candidate | C1 | C2 | C3 | C4 | C5 | Verdict |
|---|---|---|---|---|---|---|
| **Mastra** (Apache 2.0) | **Yes.** `observationalMemory: true` runs background Observer/Reflector agents that replace raw history with a dense observation log past a token threshold; plus `TokenLimiter({limit})` and `lastMessages`. | **Yes.** `POST /api/agents/:id/stream` accepts a per-request `instructions`/`system` override alongside `threadId` and `resourceId`. `MCPClient` for remote HTTP MCP, `MCPServer` to expose ours. | **Yes.** `mastra build` emits a standalone Hono server; REST at `/api/memory/threads/*`, `/api/agents/:id/stream`, plus OpenAI-compatible `/v1/responses` and `/v1/conversations`. `resourceId` is the per-user key. `@mastra/auth` + `MastraJwtAuth`. | **Yes.** `"openrouter/anthropic/claude-haiku-4.5"` with fallback chains. `PostgresStore` from `@mastra/pg` uses our `DATABASE_URL`. No seats. Can embed in Next.js instead of a second container. | ~4-6 files | **Top pick of the self-hosted set.** Downsides: Observational Memory is `@mastra/memory@1.1.0`-new, durable agents beta, OpenAI-compat surface experimental, and its tables sit *beside* our drizzle schema, not inside it. |
| **Agno** (Apache 2.0 runtime) | **Partial.** `num_history_runs` (default 3) + `enable_session_summaries=True` + `compress_tool_results` + `/optimize-memories`. A fixed window plus a running summary, not token-budget compaction. | **Yes.** `MCPTools` client, serves `/mcp`. | **Yes.** 109 OpenAPI paths: `GET/POST /sessions` filterable by `user_id`, `/sessions/{id}/runs`, `/memories`, SSE with `background=true`. | **Yes.** `OpenRouter` model class, `PostgresDb(db_url=...)`. Runtime and REST API free; the hosted control plane is $150/mo + $30/seat, which we skip. | ~4-6 files | Best REST surface of any candidate. Cost: a **Python/FastAPI container** next to our Next app. |
| **Inkeep** | **Yes, and it is the best compaction on the list.** Conversation-level compaction at 50% of the model's context window, sub-agent tool-result compaction at ~75-91%, large tool results archived as artifacts and swapped for summary references, older turns AI-summarised. Fallback 50 messages / 8,000 tokens. | **Yes, elegantly.** `headers()` with a Zod schema + `contextConfig` + `fetchDefinition` means Inkeep calls *our* URL for the facts block and caches per `conversationId`. | **Yes.** Conversations REST API with `userId` filtering and pagination. | **Partial.** OpenRouter only via the custom OpenAI-compatible provider (`providerOptions.baseURL` + `CUSTOM_LLM_API_KEY`); no per-model threshold entry, so `contextWindowSize` must be set by hand. | ~5 files | **Elastic License 2.0 + supplemental terms**, and the footprint is a **Doltgres manage DB plus a Postgres run DB plus run API plus manage API plus builder UI**. Wrong shape for one Hetzner box. |
| **Letta** | **Yes on paper.** *"As it approaches the model's context limit, compaction happens automatically."* Verified in source: `LOCAL_DEFAULT_COMPACTION_MODE = "sliding_window"` in `src/backend/local/compaction.ts`. | **Partial.** Session-scoped `tools` and `mcpServers` (Streamable HTTP + SSE), which is good. But `systemPrompt` is **create-time only** — *"passing them to `createSession()` or `resumeSession()` throws."* Facts block goes in a MemFS `system/` file we must git-commit, or gets prepended to every user message. | **No.** Native API is a **bidirectional WebSocket**. The OpenAI-compat path keys threads off `X-Letta-Chat-Key` in an in-process `Map` with `MAX_TRACKED_TRANSCRIPTS = 4096`, FIFO-evicted, **lost on restart**. No users, no identities self-hosted: *"Keep App Server isolated per tenant or machine... enforce authorization in your controller."* | **Yes.** OpenRouter first-class, Apache 2.0, no DB to run. | ~8+ files incl. a Node sidecar | **Out.** The Postgres REST server was archived 2026-08-16 (*"This repository now serves as a landing page"*); `letta/letta:latest` last pushed 2026-05-14; the docker page says the image *"is no longer an actively maintained or supported Letta product surface"*; the V1 comparison table lists **"Self-hosting option — V1 SDK: No"**. The current product is a coding harness. Its own self-hosting doc contradicts its deployment repo (which ships cloud-attached mode). |
| **Open WebUI / LibreChat / Dify / Flowise** | UNVERIFIED — this track did not complete. | | | | | Two things did land: Letta's docs treat Open WebUI and LibreChat as *clients* of an OpenAI-compatible endpoint, which places them above our stack, not inside it; and Open WebUI's per-chat routing needs `ENABLE_FORWARD_USER_INFO_HEADERS=true` to emit `X-OpenWebUI-Chat-Id`. They are chat *front-ends*. We already have a front-end. |
| **OpenClaw** (MIT, `openclaw/openclaw`) | n/a | Serves `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, gated `/v1/responses`, all **disabled by default**. | **No.** *"OpenClaw's default security model is one trusted operator boundary per Gateway, not hostile multi-tenant isolation... Session IDs select routing; they do not authorize one tenant against another."* Multi-tenant = one containerised Gateway per tenant (`openclaw fleet` "cells", experimental). | | | **Single-operator dev harness.** Also: an authenticated caller gets an agent with terminal and file tools on the host. A leaked key is host compromise. |
| **Hermes Agent** (MIT, NousResearch) | Own memory store; owns the loop with 40+ tools. | | **No, but closest of the three.** Real Sessions REST API: `GET/POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/{id}`, `/messages`, `/fork`, `/chat`, `/chat/stream` (SSE), plus a Runs API with `Idempotency-Key`. **All behind one shared `API_SERVER_KEY`** — any key holder reads every session. Docs' answer to multi-user is `hermes profile create alice` / one process per user. `X-Hermes-Session-Key` is a memory-scoping hint, not authorization. | | | **Single-user dev harness with a good HTTP shape.** Same host-compromise caveat as OpenClaw. |
| **Pi** (`earendil-works/pi`, MIT) | Library, not a server. Letta's own runtime imports `Context`, `Model`, `isContextOverflow` from `@earendil-works/pi-ai`. | | **No.** `packages/server` is *"Experimental... may change or be removed without notice"*, ships only a **Unix-socket** listener (length-prefixed CBOR, not HTTP/JSON), and *"does not provide a standalone CLI or coding-agent service."* Sessions are JSONL under `~/.pi/agent/sessions/`. | | | **Not a candidate.** Confirms round one. |

### Chat backend as a service

| Candidate | C1 | C2/C3 | C4 | Verdict |
|---|---|---|---|---|
| **Vercel Chatbot template** (`github.com/vercel/chatbot`, Apache 2.0) | **No.** `getMessagesByChatId` → `convertToModelMessages` → `streamText`. Full history every turn, no context management at all. | Already Postgres + drizzle (`User`, `Chat`, `Message_v2`, `Vote`, `Stream`), 11 routes incl. `/api/history`. | Needs **Redis** for `resumable-stream`. | A git template, not a service: 181 files to copy in and own. It *is* round one's 80-line layer, written out longhand by someone else. Note: chat-sdk.dev is now an unrelated Slack/Teams bot framework. |
| **LangGraph Platform** | Opt-in `SummarizationMiddleware(trigger=("tokens", 4000), keep=("messages", 20))`. | | **DISQUALIFIED on license.** `langgraph-api` is **Elastic-2.0**, standalone Docker needs `LANGGRAPH_CLOUD_LICENSE_KEY` and egress to beacon.langchain.com, self-host requires Enterprise, and the only self-serve tier is Plus at **$39/seat/month**. The MIT `@langchain/langgraph-api` npm package is the in-memory `langgraph dev` toy. langmem is effectively dead (0.0.30, Oct 2025). | Out. |
| **assistant-ui Cloud** | **No context management at all**; inference still happens in our route. | Per-end-user tokens (`auth.tokens.create({userId})`), REST `/threads`, `/threads/{id}/messages`. | Free 200 MAU, Pro $50/mo for 500 MAU + $0.10/extra MAU. Self-hosting Cloud is Enterprise-only. | Buys thread storage only, for ~7 files of glue. Storage is the part we're best at. |
| **CopilotKit + AG-UI** | AG-UI "compaction" is event-delta merging, not LLM context compaction. Their docs say OSS persistence has *"no such extension point"*. | No Swift SDK. | Developer tier **3-day thread retention**, Pro $39/mo 5-day, **Team $100/seat/month** 14-day; self-host is Team-tier Helm only. | Out on per-seat and on retention. |
| **Pydantic AI + `pydantic-ai-harness`** (MIT) | **Yes — best compaction design in the field.** `TieredCompaction`, `SlidingWindowCompaction`, `ClearToolResults`, `SummarizingCompaction`, provider-native `OpenAICompaction`/`AnthropicCompaction`, and `ConversationSearch` (BM25 over dropped snapshots). `VercelAIAdapter.dispatch_request()` speaks the AI SDK v6 data-stream protocol our client already reads. | **No hosted thread API. No Postgres step store** — InMemory/File/Sqlite/Mongo only. | Second Python container. | Excellent library, wrong category. It's a better `threadBlock`, not a harness. Docs moved to https://pydantic.dev/docs/ai/ |
| **Convex Agents** | **No.** `contextOptions` = `recentMessages: N` + search. Summarization is a code sample, not a feature. | MCP is not a documented feature (18 pages in their agents llms.txt, none about MCP). | `@convex-dev/agent@0.7.1` peers `ai: ^7.0.0`; we're on v6, so we'd pin `0.6.4` and sit a major behind. **Convex Professional is $25 per developer per month**, and the HIPAA BAA lives there. | Out: per-seat BAA, version lag, and a whole second database runtime beside our Postgres. |
| **Julep** | — | — | — | **DEAD.** `api.julep.ai` redirects to memory.store; the Sessions API (which on paper matched this brief exactly: `context_overflow="adaptive"`, `token_budget`, `recall_options`) is frozen on a read-only branch, last commit 2026-03-13. Julep 3 has no sessions or chat and is still `3.0.0rc6`. |

**The headline across 20 candidates: almost nothing does automatic context-window management.**
Only Mastra, Inkeep, Pydantic AI, Letta and Anthropic's `compact_20260112` ship compaction that
fires on its own. Everything else either drops the oldest items, keeps a fixed window, or hands
you a `:compact` endpoint and a policy decision.

---

## (b) The top two, concretely

### Option 1 — Mastra, embedded in the Next app

**What we deploy.** Nothing new in docker-compose. `@mastra/core`, `@mastra/memory`, `@mastra/pg`
and `@mastra/mcp` as dependencies, with the Mastra instance mounted inside the existing Next
server (`https://mastra.ai/docs/deployment/web-framework.md`). `PostgresStore` points at the
`DATABASE_URL` we already have and creates its own thread/message/resource/working-memory tables.
They land beside the `simple` schema, not inside it, so `pnpm db:generate` never sees them —
give them their own schema name and leave drizzle alone. If we later want the standalone server,
`mastra build` emits `.mastra/output/index.mjs` and `mastra start` runs it; that is a second
service in compose, and we do not need it on day one.

Cost to sign up for: **zero**. Apache 2.0, no seats, no license key, no phone-home.

**The tools (5).** Written as Mastra `createTool` definitions in one file, each handler calling
the route logic we already have. Every handler re-validates ids against the candidate set the
same way `pickActs` does today — that is the guard, and it does not move.

| Tool | Input | Backed by |
|---|---|---|
| `adopt_plan_action` | `{ actionId: string }` — `plan:<reportId>:<index>` or `int:<interventionId>` | `app/api/plan/adopt/route.ts` via `adoptBodyOf` in `lib/actions.ts` |
| `record_fact` | `{ key, value, kind?: "changed"\|"corrected", date?: "YYYY-MM-DD", note? }` | `app/api/facts/route.ts` — already validates `key` against `PROFILE_QUESTIONS` and `value` against its options |
| `log_checkin` | `{ insightId, itemIndex, answer: "did"\|"didnt"\|"skip", note? }` | `app/api/checkins/route.ts`, ownership check included |
| `lookup_marker` | `{ code?: string, mondoId?: string }` | `askCandidates` / `catalogFor` in `lib/lookup.ts`, read-only |
| `plan_retest` | `{ markerCode: string, weeks?: number }` | **New.** No draws/retests table exists. Needs a table + migration 0022. Default from `RETEST_WEEKS[code] ?? DEFAULT_WEEKS`. |

**MCP or not.** Skip MCP. It buys nothing here: iOS never reaches the harness directly (it holds
a better-auth cookie for our domain and `Api.adopt()` rejects everything else), so both clients
already share one tool surface — our routes. In-process `createTool` handlers with `userId`
closed over from the request are simpler and safer than an MCP server that has to re-authenticate
per call. Keep `MCPServer` in the back pocket for the day a third client appears.

**System prompt per session.** `POST /api/agents/:id/stream` takes a per-request
`instructions`/`system` override alongside `threadId` and `resourceId`. We call `systemFor(kind)`
and `buildModelInput` exactly as `answerQuestion` does now, and pass the result as `instructions`
on every turn. No config push, no redeploy, no MemFS commit. This is the single cleanest
per-turn-prompt story of any candidate.

**Threads.** `resourceId = userId` (our better-auth id), `threadId` = a uuid we mint. Create and
resume are the same call with a `threadId`. Thread list is `/api/memory/threads?resourceId=...`.
From iOS: `GET /api/ask/threads` on our Next app, cookie-authed, which forwards to Mastra with
`resourceId` pinned server-side from `currentUserId()`. Never let `resourceId` come from the client.

**Context management.** `observationalMemory: true` plus `TokenLimiter({ limit })`. The Observer/
Reflector agents run in the background and replace raw history with an observation log past the
threshold. Point them at a cheap OpenRouter model so summarisation doesn't cost answer money.

**Model.** `"openrouter/google/gemini-3.7-flash"` — same model as `AI_DEFAULT_MODEL` today, same
key, with fallback chains available. **$2.33/user/month** at 10 questions/day with history
accumulating; $4.66 after the 2027-01-01 Gemini price doubling, or $0.81 on
`gemini-3.1-flash-lite`. Observational Memory adds a background summarisation pass; budget
roughly +10%.

**What we still write: 5-6 files.**
1. `lib/agent.ts` — Mastra instance, `PostgresStore`, `Memory` config, the agent.
2. `lib/agent-tools.ts` — the five `createTool` definitions plus the id re-validation.
3. `app/api/ask/thread/route.ts` — POST a turn, cookie auth, build `instructions`, stream back.
4. `app/api/ask/threads/route.ts` — list and delete, `resourceId` pinned server-side.
5. `db/migrations/0022_retests.sql` + the schema entry for `plan_retest`.
6. Edits to `app/ask/page.tsx` to carry a `threadId`.

**Risk.** Observational Memory is `@mastra/memory@1.1.0`-new. Durable agents are beta. The
OpenAI-compatible surface is experimental. A second set of tables in our database that we do not
own the migrations for. That last one is the real one: when Mastra changes its schema, our
Postgres changes with it.

### Option 2 — OpenAI Responses, stateless, with `context_management` compaction

**What we sign up for.** An OpenAI platform key. That's it. No new container, no new dependency
beyond `@ai-sdk/openai` (or raw fetch, since we want `context_management`, which the AI SDK may
not surface yet — UNVERIFIED).

**Deliberately not the Conversations API.** Hosted threads are `ZDR: No, Eyes Off: No` while
`/v1/responses` is `Yes, Yes`, and *"Conversation objects and items in them are not subject to
the 30 day TTL."* For a product built on blood panels, storing the transcript in our own Postgres
under our own deletion policy is strictly better than renting it from a vendor who marks it as
the one feature a BAA can't cover. And there is no `list conversations` endpoint and no user
field anyway, so we'd write the threads table regardless.

**The tools.** Same five as Option 1. Here MCP is genuinely attractive because OpenAI's remote
MCP support is the best of any vendor — `{type:"mcp", server_url, headers, authorization,
allowed_tools, require_approval:"never", defer_loading}`, over plain public HTTPS with header
auth, and `web_search` + `function` + `mcp` coexist in one `tools` array. But it means our tool
endpoints become publicly reachable with a bearer token instead of a session cookie, and OpenAI
*"does not store the value you provide in the `authorization` field... you must send the
`authorization` value in every Responses API creation request"* — so we mint a short-lived
per-turn token anyway. Start with plain `{type:"function"}` tools resolved in our own loop; the
`pickActs` re-validation is identical either way. Switch to MCP the day a non-OpenAI client needs
the same tools.

**System prompt per session.** Trivially: `instructions` on every `/v1/responses` call, built by
`systemFor(kind)` + `buildModelInput`, unchanged from today.

**Threads.** Ours. Two drizzle tables, exactly as round one proposed. Compaction changes what we
store: we append the response output verbatim, compaction blocks included, and OpenAI drops
everything before the compaction block on the next turn. We never write a summariser.

**Context management.** `context_management: [{ type: "compaction", compact_threshold: N }]`.
*"When the rendered token count crosses the configured threshold, the server runs server-side
compaction. No separate `/responses/compact` call is required in this mode."* And
*"server-side compaction is ZDR-friendly when you set `store=false`."* This is the documented,
supported path, and it is documented specifically for the stateless and `previous_response_id`
loops — the ones we'd use. `POST /responses/compact` exists as a manual escape hatch:
*"do not prune `/responses/compact` output. The returned window is the canonical next context window."*

**Model.** `gpt-5.6-luna`, $0.20/$1.20 per 1M, 1.05M context, supports `web_search`, `mcp`,
`file_search`. **$0.65/user/month** — the cheapest number in this entire document, roughly a
third of the Gemini path and half of Anthropic's best cached case. `gpt-5-mini` at $0.87 if luna
disappoints on the ask eval. Add `prompt_cache_key` (fixed 30m TTL) for the facts block.
Web search, if we turn it on at 2/day, is **+$0.60/user/month** — it nearly doubles the bill on
luna, so gate it behind the `research` question kind only.

**Cost of leaving OpenRouter.** This is the one real concession. `model()` in `lib/ai.ts` and
`askModel(id)` in `lib/lookup.ts` both go through `@openrouter/ai-sdk-provider`. Adding a second
provider is a few lines, but `pnpm eval:ask` (12 cases, gemini-3.7-flash at 0.78) has to be re-run
against luna before we trust it, and the per-kind prompt shapes were tuned on Gemini.

**What we still write: 4 files.**
1. `db/schema.ts` + one migration — `ask_threads`, `ask_turns`, and the retests table.
2. `lib/thread.ts` — append, load, and the `context_management` request body.
3. `app/api/ask/thread/route.ts` — POST a turn.
4. `app/api/ask/threads/route.ts` — list, resume, delete.

Plus the tool handlers, which are five thin wrappers over route logic that already exists.

---

## (c) Verdict: round one was right, and buying a harness is more code, not less

Round one said build ~80 lines. That estimate was low — call it 200 with the tool handlers and
the retests table — but the direction survives contact with twenty candidates, for a reason
neither round anticipated. **The thing being bought is not the expensive thing.** Storing threads
is a table and two queries; every harness that sells it either has no thread list (OpenAI,
Gemini Interactions), no per-user field (Anthropic Managed Agents), or charges per seat for the
BAA that makes it legal (Convex, CopilotKit, LangGraph). The genuinely hard part, automatic
context-window management, is shipped by only five things on the list, and three of them
(Anthropic's `compact_20260112`, OpenAI's `context_management`, Pydantic's `TieredCompaction`)
are **stateless request parameters** that work perfectly well on top of our own thread table.
That is the finding that settles it: we can buy the compaction without buying the session.
Meanwhile every harness that owns the session charges a real tax — Mastra puts tables it
controls in our Postgres and is 1.1.0-new on the feature we'd depend on; Agno adds a Python
container; Inkeep adds two database engines and an ELv2 license; Letta deleted its REST server
four months ago and its remaining OpenAI-compat threading is an in-memory FIFO map that loses
threads on restart; OpenClaw, Hermes and Pi are single-operator dev harnesses where an
authenticated caller gets shell on the host. **Recommendation: Option 2** — OpenAI Responses,
stateless, `context_management` compaction, `store=false`, our own two tables, five function
tools that re-run the `pickActs` id check, at $0.65/user/month. It is fewer files than any
harness option, it keeps `pickActs` and `pnpm eval:ask` exactly where they are, it leaves the
transcript under our deletion policy, and it is the only option where the compaction we're
relying on is documented for the loop we're actually running. If leaving OpenRouter is
unacceptable, **Option 1 (Mastra) is the fallback** and the per-request `instructions` override
is what makes it viable — but be honest that it is the larger bet, not the smaller one.

---

## URLs

**OpenAI:** developers.openai.com/api/reference/resources/conversations.md ·
/api/reference/resources/responses.md · /api/docs/guides/compaction.md · /api/docs/guides/tools-remote-mcp.md ·
/api/docs/guides/your-data.md · platform.openai.com/docs/pricing

**Anthropic:** platform.claude.com/docs/en/api/overview.md · /build-with-claude/working-with-messages.md ·
/build-with-claude/compaction.md · /build-with-claude/context-editing.md · /build-with-claude/prompt-caching.md ·
/agents-and-tools/tool-use/memory-tool.md · /agents-and-tools/mcp-connector.md · /about-claude/pricing.md ·
/models/overview.md · /manage-claude/api-and-data-retention.md · /managed-agents/{overview,sessions,session-operations,reference}.md ·
code.claude.com/docs/en/agent-sdk/sessions.md

**Google:** ai.google.dev/gemini-api/docs/interactions-overview · /api/interactions-api · /docs/function-calling ·
/docs/caching · /docs/pricing · /docs/long-context ·
docs.cloud.google.com/gemini-enterprise-agent-platform/scale/{sessions,sessions/manage-with-api,memory-bank,memory-bank/ingest-events} ·
cloud.google.com/products/gemini-enterprise-agent-platform/pricing · aiplatform.googleapis.com/$discovery/rest?version=v1beta1 ·
generativelanguage.googleapis.com/$discovery/rest?version=v1beta

**Mastra:** mastra.ai/docs/storage.md · /integrations/databases/postgresql.md · /docs/memory/observational-memory.md ·
/docs/memory/memory-processors.md · /docs/deployment/mastra-server.md · /docs/deployment/web-framework.md ·
/reference/client-js/memory.md · /docs/harness/durable-agents.md · /docs/connections/mcp.md · /models.md ·
/docs/auth/jwt.md · /pricing

**Agno:** docs.agno.com/use-cases/product-agents/sessions-and-memory.md · /reference/agents/agent.md · /features/api.md ·
/reference-api/openapi.json · /agent-os/mcp/mcp.md · /reference/models/openrouter.md · agno.com/pricing

**Letta:** docs.letta.com/{self-hosting,v1-sdk/index,v1-sdk/docker,configuration/models,concepts/memfs,concepts/conversations,platform/app-server,platform/app-server/integration-patterns,agent-sdk/{agents,memory,sessions,mcp,permissions},reference/faq,pricing}.md ·
github.com/letta-ai/letta (commits `2026-08-16 chore: archive the legacy server repository (#3430)`) ·
letta-code `src/backend/local/compaction.ts`, `src/websocket/app-server-openai-common.ts` ·
hub.docker.com/v2/repositories/letta/letta/tags

**Others:** docs.inkeep.com/{typescript-sdk/memory,typescript-sdk/headers,api-reference/conversations,community/license}.md ·
www.langchain.com/pricing · docs.langchain.com/langsmith/deploy-standalone-server · pypi.org/pypi/langgraph-api/json ·
www.assistant-ui.com/{pricing,docs/cloud.md,docs/cloud/authorization.md} · github.com/vercel/chatbot · chatbot.ai-sdk.dev ·
docs.copilotkit.ai/threads-self-managed.md · www.copilotkit.ai/pricing · docs.ag-ui.com/concepts/serialization.md ·
pydantic.dev/docs/ai/ · docs.convex.dev/{agents,agents/context.md,self-hosting.md} · www.convex.dev/pricing ·
docs.openclaw.ai/gateway/multi-tenant-hosting · github.com/openclaw/openclaw/docs/gateway/{operator-scopes,openai-http-api}.md ·
hermes-agent.nousresearch.com/docs/user-guide/{features/api-server,messaging/open-webui,sessions} ·
github.com/earendil-works/pi/packages/{server/README.md,coding-agent/docs/sessions.md,coding-agent/docs/rpc.md}

## Unverified

- Whether OpenAI's `context_management` compaction applies to hosted `conversation` threads. The
  guide documents only stateless and `previous_response_id` loops; `Compaction` does appear as a
  valid conversation item type. **Test before building on it.** Option 2 avoids the question by
  not using Conversations.
- Whether Gemini 3.x supports remote MCP. Two Google doc pages contradict each other.
- Google HIPAA coverage for Agent Platform / the Gemini Developer API.
- Open WebUI / LibreChat / Dify / Flowise: license clauses, per-session prompt override, MCP,
  multi-tenancy by API key. That track did not finish. They are chat front-ends, so the gap is
  unlikely to change the recommendation.
- Whether Anthropic's MCP connector is gated to specific model tiers.

---

## Addendum: the four chat front-ends (track landed after the verdict)

Verified from fetched docs and source, 2026-09-02.

| Candidate | End-user threads on one service key | Per-request system prompt | Thread list API | Compaction | Ops on one box | Licence |
|---|---|---|---|---|---|---|
| **Dify** 1.17.0 | Yes. Every app endpoint takes `user`; conversations, messages and files are scoped to it. | No. `ChatRequest` has no system field; pass the facts block as an `inputs` variable into a prompt template that lives in Dify's UI, not in git. | Yes: `GET /v1/conversations?user=`. | No. `token_buffer_memory.py` drops oldest (`prompt_messages.pop(0)`) until it fits. | ~16 containers (api, worker, beat, web, redis, sandbox, plugin daemon, agent backend, two ssrf proxies, nginx, weaviate, postgres). | Modified Apache-2.0: one workspace and your own UI is inside the line. |
| **LibreChat** 0.8.8-rc1 | No. Agents API keys are per LibreChat user; "act as X" means one account per end user or an OIDC token minter. | Partial. `instructions` on `/api/agents/v1/responses` is merged as content, not a clean override (UNVERIFIED). | No API-key route; `/api/convos` is JWT and UI-internal. | Yes, the best of the four: summarisation on by default with `contextPruning` and `retainRecent`. | api, admin panel, nginx client, MongoDB, Meilisearch, pgvector, rag api. | MIT. |
| **Open WebUI** 0.10.x | No. One key per account, "the key acts as the user who created it". | No. A workspace model's prompt overwrites `messages[0]`. | Internal chat CRUD only; caller builds the message tree, then polls a task id. Doc pinned to v0.6.15 and unsupported. | Yes since v0.10.0, off by default, and only for chats created through the internal CRUD. | One container. | BSD-3 plus a branding clause above 50 end users. |
| **Flowise** 3.1.4 | No isolation. Keys are workspace-scoped; any key holder reads any `sessionId`. Identity layer is the commercial directory. | Yes, the best of the four: `overrideConfig.llmMessages` per request (must be enabled in Security). | No thread list; group `/chatmessage` by `sessionId` yourself. | Partial: per-node `agentMemoryType`, default `allMessages`. | One container. | Apache-2.0 outside `packages/server/src/enterprise`. |

None gives all four of per-end-user threads on a service key, a per-request
system prompt, a thread list API and automatic compaction. The verdict above
stands.
