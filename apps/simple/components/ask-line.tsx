"use client";

/**
 * One line at the top of Home: ask anything, or tell it something.
 *
 * Home used to carry a second answering surface halfway down the page — its
 * own search box, its own reply, its own memory — while the composer sat
 * behind a "+" in the corner. Two places to say something is one too many, so
 * this line hands whatever was typed straight to the composer and the answer
 * happens there. Phase 25b, the same rule phase 24a applied to questions.
 */
import { useState } from "react";
import { MessageCircleQuestionMark } from "lucide-react";
import { openComposer } from "./composer";
import { Button } from "./ui-kit";

export function AskLine() {
  const [text, setText] = useState("");

  const hand = () => {
    openComposer(text.trim());
    setText("");
  };

  return (
    <div className="ask-pill flex items-center gap-2 px-3 py-1.5">
      <MessageCircleQuestionMark className="size-4 shrink-0 text-[var(--ink-3)]" />
      <input
        className="t-body min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-[var(--ink-3)]"
        placeholder="Ask, or tell me what changed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") hand();
        }}
      />
      <Button
        size="sm"
        job="text"
        disabled={text.trim().length < 2}
        onClick={hand}
      >
        Ask
      </Button>
    </div>
  );
}
