"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { MarkdownRenderer } from "./markdown-renderer";
import {
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Code2,
  Table,
  Image as ImageIcon,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { useState, useCallback } from "react";

export type ArtifactType =
  | "code"
  | "document"
  | "table"
  | "image"
  | "component";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  model?: string;
  artifacts?: Artifact[];
  thinking?: string;
  isStreaming?: boolean;
}

const ARTIFACT_ICONS: Record<ArtifactType, React.ElementType> = {
  code: Code2,
  document: FileText,
  table: Table,
  image: ImageIcon,
  component: Code2,
};

interface ChatMessageProps {
  message: ChatMessageData;
  onArtifactClick?: (artifact: Artifact) => void;
  onRetry?: (id: string) => void;
  onEdit?: (id: string, content: string) => void;
}

export function ChatMessage({
  message,
  onArtifactClick,
  onRetry,
  onEdit,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div
      className={cn(
        "group px-4 py-4 md:px-6",
        isUser ? "bg-transparent" : "bg-white border-y border-neutral-100",
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center mt-0.5",
              isUser
                ? "bg-neutral-900 text-white"
                : "bg-accent-50 border border-accent-200",
            )}
          >
            {isUser ? (
              <span className="font-mono text-[10px] font-bold">U</span>
            ) : (
              <span className="font-mono text-[10px] font-bold text-accent-600">
                AI
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Role label */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-900">
                {isUser ? "You" : "Assistant"}
              </span>
              {message.model && (
                <span className="font-mono text-[10px] text-neutral-400">
                  {message.model}
                </span>
              )}
              {message.timestamp && (
                <span className="font-mono text-[10px] text-neutral-300">
                  {message.timestamp}
                </span>
              )}
            </div>

            {/* Thinking block */}
            {message.thinking && (
              <div className="mb-3">
                <button
                  onClick={() => setShowThinking((s) => !s)}
                  className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform",
                      !showThinking && "-rotate-90",
                    )}
                  />
                  <span>Thinking</span>
                  {message.isStreaming && (
                    <span className="inline-block size-1.5 rounded-full bg-accent-500 animate-pulse" />
                  )}
                </button>
                {showThinking && (
                  <div className="mt-2 border-l-2 border-neutral-200 pl-3">
                    <p className="font-mono text-[12px] text-neutral-400 leading-relaxed whitespace-pre-wrap">
                      {message.thinking}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            {isUser ? (
              <p className="text-[14px] leading-[1.7] text-neutral-800">
                {message.content}
              </p>
            ) : message.isStreaming && !message.content ? (
              <div className="flex items-center gap-2 py-2">
                <div className="flex gap-1">
                  <div
                    className="size-1.5 rounded-full bg-accent-400 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="size-1.5 rounded-full bg-accent-400 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="size-1.5 rounded-full bg-accent-400 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="font-mono text-[11px] text-neutral-400">
                  Generating...
                </span>
              </div>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}

            {/* Artifacts */}
            {message.artifacts && message.artifacts.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {message.artifacts.map((artifact) => {
                  const Icon = ARTIFACT_ICONS[artifact.type];
                  return (
                    <button
                      key={artifact.id}
                      onClick={() => onArtifactClick?.(artifact)}
                      className="relative flex items-center gap-3 bg-neutral-50 border border-neutral-200 px-4 py-3 text-left hover:border-accent-300 hover:bg-accent-50 transition-colors group/artifact"
                    >
                      <CornerEdge location="tl" />
                      <div className="flex size-8 shrink-0 items-center justify-center bg-white border border-neutral-200 group-hover/artifact:border-accent-300">
                        <Icon className="size-4 text-neutral-500 group-hover/artifact:text-accent-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[13px] font-medium text-neutral-900 block truncate">
                          {artifact.title}
                        </span>
                        <span className="font-mono text-[10px] text-neutral-400 uppercase">
                          {artifact.type}
                          {artifact.language && ` · ${artifact.language}`}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400 group-hover/artifact:text-accent-500 shrink-0">
                        View →
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Actions toolbar */}
            {!message.isStreaming && (
              <div
                className={cn(
                  "mt-2 flex items-center gap-0.5 transition-opacity",
                  isUser
                    ? "opacity-0 group-hover:opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
              >
                <ActionButton
                  icon={copied ? Check : Copy}
                  label={copied ? "Copied" : "Copy"}
                  onClick={handleCopy}
                />
                {!isUser && onRetry && (
                  <ActionButton
                    icon={RotateCcw}
                    label="Retry"
                    onClick={() => onRetry(message.id)}
                  />
                )}
                {isUser && onEdit && (
                  <ActionButton
                    icon={Pencil}
                    label="Edit"
                    onClick={() => onEdit(message.id, message.content)}
                  />
                )}
                {!isUser && (
                  <>
                    <ActionButton
                      icon={ThumbsUp}
                      label="Good"
                      onClick={() => {}}
                    />
                    <ActionButton
                      icon={ThumbsDown}
                      label="Bad"
                      onClick={() => {}}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
      title={label}
    >
      <Icon className="size-3" />
    </button>
  );
}
