"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Check, Copy, WrapText } from "lucide-react";
import { useState, useCallback, type ComponentPropsWithoutRef } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code"> & { node?: unknown }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : null;
  const code = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // Inline code
  if (!language && !code.includes("\n")) {
    return (
      <code
        className="rounded-xs bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px] text-accent-700 border border-neutral-150"
        {...props}
      >
        {children}
      </code>
    );
  }

  // Code block
  return (
    <div className="group relative my-3 overflow-hidden border border-neutral-200 bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between bg-neutral-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          {language || "code"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWrap((w) => !w)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors",
              wrap && "text-accent-400",
            )}
          >
            <WrapText className="size-3" />
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {copied ? (
              <>
                <Check className="size-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      {/* Code content */}
      <pre
        className={cn(
          "overflow-x-auto p-4 text-[13px] leading-relaxed",
          wrap && "whitespace-pre-wrap break-words",
        )}
      >
        <code className="font-mono text-neutral-200" {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose-cmd font-body text-[14px] leading-[1.7] text-neutral-800",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mb-3 mt-5 font-display text-[20px] font-semibold text-neutral-900 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 font-display text-[17px] font-semibold text-neutral-900 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 font-display text-[15px] font-semibold text-neutral-900 first:mt-0">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 ml-4 list-disc space-y-1 marker:text-neutral-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-4 list-decimal space-y-1 marker:text-neutral-400">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="text-[14px]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-accent-300 bg-accent-50/50 py-1 pl-4 text-[13px] text-neutral-600 italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-600 underline underline-offset-2 hover:text-accent-700"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto border border-neutral-200">
              <table className="w-full text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-neutral-50 text-left">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-neutral-200 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-neutral-100 px-3 py-2 text-neutral-700">
              {children}
            </td>
          ),
          hr: () => <hr className="my-4 border-neutral-200" />,
          strong: ({ children }) => (
            <strong className="font-semibold text-neutral-900">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="text-neutral-600">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
