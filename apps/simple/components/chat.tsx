"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";
import { Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui-kit";

const SUGGESTIONS = [
  "Which of my markers are worst right now?",
  "What changed since my last blood draw?",
  "Explain my lipid panel in plain language.",
];

/** ponytail: no conversation persistence. Reload starts a new chat. */
export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="card border-dashed p-8 text-center">
            <Sparkles className="mx-auto mb-3 size-6 text-accent-400" />
            <p className="font-body text-[13px] text-neutral-500">
              Ask about your own numbers. The assistant only sees your latest
              readings and your two most recent plans.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="border border-neutral-200 bg-neutral-0 px-2.5 py-1.5 font-body text-[12px] text-neutral-600 hover:border-accent-300 hover:text-neutral-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const text = m.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("");
          return (
            <div
              key={m.id}
              className={cn(
                "card p-4",
                m.role === "user" ? "bg-neutral-50" : "bg-neutral-0",
              )}
            >
              <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                {m.role === "user" ? "You" : "OpenVitals"}
              </span>
              <div className="prose-sm max-w-none space-y-2 font-body text-[13px] leading-relaxed text-neutral-800 [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold">
                <Markdown>{text}</Markdown>
              </div>
            </div>
          );
        })}

        {busy && (
          <p className="font-mono text-[11px] text-neutral-400">Thinking…</p>
        )}
        {error && (
          <p className="font-mono text-[11px] text-[var(--color-health-critical)]">
            {error.message}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-4 flex items-end gap-2"
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
          placeholder="Ask about your labs…"
          className="w-full resize-none rounded-sm border border-neutral-200 bg-neutral-0 px-3 py-2 font-body text-[13px]"
        />
        <Button type="submit" disabled={busy || !input.trim()} className="h-[52px]">
          <Send />
          Send
        </Button>
      </form>
    </div>
  );
}
