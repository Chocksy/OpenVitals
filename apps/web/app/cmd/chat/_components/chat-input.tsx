"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Square,
  Paperclip,
  Globe,
  Mic,
  ChevronDown,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

export interface FileAttachment {
  id: string;
  name: string;
  type: "image" | "document" | "code";
  size: string;
}

interface CmdChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  attachments?: FileAttachment[];
  onAttach?: () => void;
  onRemoveAttachment?: (id: string) => void;
  placeholder?: string;
  className?: string;
}

const ATTACHMENT_ICONS: Record<string, React.ElementType> = {
  image: ImageIcon,
  document: FileText,
  code: FileText,
};

export function CmdChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  model,
  onModelChange,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  placeholder = "Message your agents...",
  className,
}: CmdChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim() && !isStreaming) {
      e.preventDefault();
      onSubmit();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isStreaming) {
      onSubmit();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  };

  return (
    <div
      className={cn(
        "border-t border-neutral-200 bg-white px-4 py-3",
        className,
      )}
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => {
              const Icon = ATTACHMENT_ICONS[file.type] || FileText;
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-2.5 py-1.5"
                >
                  <Icon className="size-3.5 text-neutral-500" />
                  <span className="font-mono text-[11px] text-neutral-700 max-w-32 truncate">
                    {file.name}
                  </span>
                  <span className="font-mono text-[9px] text-neutral-400">
                    {file.size}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment?.(file.id)}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Input area */}
        <div
          className={cn(
            "flex items-end gap-2 border bg-neutral-50 px-3 py-2.5 transition-all",
            isFocused
              ? "border-accent-300 ring-2 ring-accent-100"
              : "border-neutral-200",
          )}
        >
          {/* Left tools */}
          <div className="flex items-center gap-0.5 pb-0.5">
            <button
              type="button"
              onClick={onAttach}
              className="flex size-7 items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              title="Attach file"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              title="Search the web"
            >
              <Globe className="size-4" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className="max-h-[200px] min-h-[26px] flex-1 resize-none bg-transparent text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none font-body"
          />

          {/* Right actions */}
          <div className="flex items-center gap-1 pb-0.5">
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex size-8 shrink-0 items-center justify-center bg-neutral-900 text-white transition-all hover:bg-neutral-800 active:scale-95"
              >
                <Square className="size-3" fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!value.trim()}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center transition-all active:scale-95",
                  value.trim()
                    ? "bg-accent-600 text-white hover:bg-accent-700"
                    : "bg-neutral-200 text-neutral-400",
                )}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom bar: model selector + hint */}
        <div className="mt-2 flex items-center justify-between">
          {model && onModelChange ? (
            <button
              type="button"
              className="flex items-center gap-1 font-mono text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <span>{model}</span>
              <ChevronDown className="size-2.5" />
            </button>
          ) : (
            <div />
          )}
          <span className="font-mono text-[10px] text-neutral-300">
            Enter to send · Shift+Enter for newline
          </span>
        </div>
      </form>
    </div>
  );
}
