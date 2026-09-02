"use client";

/**
 * Ask and discuss, as a conversation.
 *
 * Phase 28c. The old chat was one stateless exchange with no persistence and
 * no buttons: a reload started over and nothing the answer said could be acted
 * on. A thread is now rows in our own Postgres, the answer's structured half
 * arrives as the `offer` tool part, and the chips under it are the same ones
 * the composer already renders, through `ActOnIt` and the same routes.
 *
 * Nothing here decides anything. A chip acts through the engine's own routes;
 * a chip click never goes back through the model.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChevronRight, Loader2, Send, Trash2 } from "lucide-react";
import { ActOnIt, type Acts } from "./act-on-it";
import { Sources, type AskSource } from "./ask-answer";
import { LabelledProse } from "./evidence-chip";
import { Button } from "./ui-kit";

/** One thread in "Everything you asked". */
export interface ThreadRow {
  id: string;
  title: string;
  about: string | null;
  lastTurnAt: string | null;
}

/** What the `offer` tool hands back: the guard's result plus ask-back options. */
interface Offered extends Acts {
  sources?: AskSource[];
  options?: Record<string, string[]>;
}

/** A tool part on a message, whatever the tool was. */
interface ToolPart {
  type: string;
  state?: string;
  output?: unknown;
}

const DAY = 86_400_000;

/** "Sep 1", or "today" for the last day. */
function when(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Date.now() - at.getTime() < DAY) return "today";
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/* ── the list ─────────────────────────────────────────────────────────── */

export function ThreadList({ threads }: { threads: ThreadRow[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const left = threads.filter((t) => !gone.includes(t.id));

  if (!left.length)
    return (
      <div className="card border-dashed p-8 text-center">
        <p className="t-body text-neutral-500">
          Nothing yet. Ask a question above and it becomes a thread you can come
          back to.
        </p>
      </div>
    );

  return (
    <div className="card divide-y divide-neutral-100">
      {left.map((t) => (
        <div key={t.id} className="flex items-center gap-2 px-3">
          <a
            href={`/chat/${t.id}`}
            className="hit-40 flex min-w-0 flex-1 items-center gap-3 py-2.5"
          >
            <span className="t-meta w-14 shrink-0 text-[11px] text-neutral-400">
              {when(t.lastTurnAt)}
            </span>
            <span className="t-body min-w-0 flex-1 truncate text-neutral-800">
              {t.title}
            </span>
            <ChevronRight className="size-4 shrink-0 text-neutral-300" />
          </a>
          <button
            aria-label={`Delete ${t.title}`}
            className="hit-40 shrink-0 text-neutral-300 hover:text-[var(--color-health-critical)]"
            onClick={async () => {
              await fetch(`/api/chat/threads?id=${t.id}`, { method: "DELETE" });
              setGone((was) => [...was, t.id]);
              router.refresh();
            }}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── the thread ───────────────────────────────────────────────────────── */

/**
 * The engine asking back.
 *
 * A question the answer put in `offer.questions` is a fact that would change
 * what it just said. Picking an option writes the fact through `/api/facts` and
 * then sends the answer back into the thread, so the next turn's facts block
 * has it.
 */
function AskBack({
  question,
  options,
  onAnswered,
}: {
  question: { key: string; question: string };
  options: string[];
  onAnswered: (text: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");

  if (done)
    return (
      <p className="t-meta mt-2 text-[12px] text-[var(--color-health-normal)]">
        Recorded: {question.question} — {done}
      </p>
    );

  return (
    <div className="mt-3 border-l-2 border-neutral-150 pl-3">
      <p className="t-body text-neutral-800">{question.question}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(options.length ? options : ["Yes", "No", "Not sure"]).map((o) => (
          <button
            key={o}
            className="inline-flex h-8 items-center gap-1.5 border border-neutral-200 bg-neutral-0 px-2.5 font-display text-[12px] tracking-[0.04em] text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50"
            disabled={!!busy}
            onClick={async () => {
              setBusy(o);
              const res = await post("/api/facts", {
                key: question.key,
                value: o,
              });
              setBusy("");
              if (!res.ok) return;
              setDone(o);
              onAnswered(`${question.question}: ${o}`);
            }}
          >
            {busy === o && <Loader2 className="size-3.5 animate-spin" />}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Everything one assistant turn put on the screen, part by part. */
function Turn({
  message,
  onAnswered,
}: {
  message: UIMessage;
  onAnswered: (text: string) => void;
}) {
  return (
    <>
      {message.parts.map((raw, i) => {
        const part = raw as ToolPart & { text?: string };
        if (part.type === "text")
          return (
            <p key={i} className="t-body whitespace-pre-line text-neutral-800">
              <LabelledProse text={part.text ?? ""} />
            </p>
          );
        if (!part.type.startsWith("tool-")) return null;
        if (part.state !== "output-available") return null;

        if (part.type === "tool-offer") {
          const acts = part.output as Offered;
          return (
            <div key={i}>
              <Sources sources={acts.sources} />
              <ActOnIt acts={{ ...acts, questions: [] }} />
              {acts.questions.map((q) => (
                <AskBack
                  key={q.key}
                  question={q}
                  options={acts.options?.[q.key] ?? []}
                  onAnswered={onAnswered}
                />
              ))}
            </div>
          );
        }

        const receipt = (part.output as { receipt?: string })?.receipt;
        if (!receipt) return null;
        return (
          <p
            key={i}
            className="t-meta mt-2 text-[12px] text-[var(--color-health-normal)]"
          >
            {receipt}
          </p>
        );
      })}
    </>
  );
}

export function Thread({
  id,
  about,
  initial = [],
}: {
  /** absent for a thread that does not exist yet */
  id?: string;
  about?: string;
  initial?: UIMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  /** the id the server gave a brand new thread, read off `x-thread-id` */
  const threadId = useRef(id);

  const { messages, sendMessage, status, error } = useChat({
    messages: initial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: all }) => ({
        body: {
          threadId: threadId.current,
          about,
          message: all[all.length - 1],
        },
      }),
      fetch: async (url, init) => {
        const res = await fetch(url as string, init);
        const given = res.headers.get("x-thread-id");
        if (given) threadId.current = given;
        return res;
      },
    }),
    onFinish: () => {
      if (!id && threadId.current) router.replace(`/chat/${threadId.current}`);
      router.refresh();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={m.role === "user" ? "" : "card space-y-2 p-4"}
        >
          {m.role === "user" ? (
            <p className="font-display text-[15px] tracking-[-0.02em] text-neutral-900">
              {m.parts
                .filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join("")}
            </p>
          ) : (
            <Turn message={m} onAnswered={send} />
          )}
        </div>
      ))}

      {busy && (
        <p className="t-meta text-[11px] text-neutral-400">Thinking…</p>
      )}
      {error && (
        <p className="t-meta text-[11px] text-[var(--color-health-critical)]">
          {error.message}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 flex items-end gap-2 bg-neutral-0/90 py-2 backdrop-blur"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Ask a follow-up, or tell me something"
          className="w-full resize-none rounded-sm border border-neutral-200 bg-neutral-0 px-3 py-2 font-body text-[13px]"
        />
        <Button type="submit" disabled={busy || !input.trim()} className="h-[52px]">
          <Send />
          Ask
        </Button>
      </form>
    </div>
  );
}
