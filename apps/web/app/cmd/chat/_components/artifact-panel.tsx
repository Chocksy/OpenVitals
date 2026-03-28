"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge } from "@/components/decorations/dot-badge";
import { MarkdownRenderer } from "./markdown-renderer";
import type { Artifact } from "./chat-message";
import {
  X,
  Copy,
  Check,
  Download,
  ExternalLink,
  Code2,
  FileText,
  Table,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";

const ARTIFACT_ICONS: Record<string, React.ElementType> = {
  code: Code2,
  document: FileText,
  table: Table,
  image: ImageIcon,
  component: Code2,
};

interface ArtifactPanelProps {
  artifact: Artifact | null;
  artifacts: Artifact[];
  onClose: () => void;
  onNavigate?: (artifact: Artifact) => void;
}

export function ArtifactPanel({
  artifact,
  artifacts,
  onClose,
  onNavigate,
}: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");

  const currentIndex = artifact
    ? artifacts.findIndex((a) => a.id === artifact.id)
    : -1;

  const handleCopy = useCallback(() => {
    if (!artifact) return;
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate?.(artifacts[currentIndex - 1]!);
    }
  }, [currentIndex, artifacts, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < artifacts.length - 1) {
      onNavigate?.(artifacts[currentIndex + 1]!);
    }
  }, [currentIndex, artifacts, onNavigate]);

  if (!artifact) {
    return (
      <div className="flex h-full flex-col bg-neutral-50">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 h-[45px]">
          <DashBadge>Artifacts</DashBadge>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center bg-neutral-100">
              <Code2 className="size-5 text-neutral-400" />
            </div>
            <p className="text-[13px] text-neutral-500">
              Artifacts will appear here
            </p>
            <p className="mt-1 text-[11px] text-neutral-400 font-mono">
              Code, documents, tables, and more
            </p>
          </div>
        </div>
      </div>
    );
  }

  const Icon = ARTIFACT_ICONS[artifact.type] || Code2;
  const showCodeTab = artifact.type === "code" || artifact.type === "component";

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 h-[45px]">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 text-neutral-500 shrink-0" />
          <span className="font-mono text-[13px] font-medium text-neutral-900 truncate">
            {artifact.title}
          </span>
          {artifact.language && (
            <span className="font-mono text-[10px] text-neutral-400 uppercase shrink-0">
              {artifact.language}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Navigation */}
          {artifacts.length > 1 && (
            <div className="flex items-center gap-0.5 mr-1 border-r border-neutral-200 pr-1">
              <button
                onClick={handlePrev}
                disabled={currentIndex <= 0}
                className="flex size-6 items-center justify-center text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="font-mono text-[10px] text-neutral-400">
                {currentIndex + 1}/{artifacts.length}
              </span>
              <button
                onClick={handleNext}
                disabled={currentIndex >= artifacts.length - 1}
                className="flex size-6 items-center justify-center text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}

          {/* Tab switcher for code */}
          {showCodeTab && (
            <div className="flex items-center mr-1 border-r border-neutral-200 pr-1">
              <button
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "px-2 py-0.5 font-mono text-[10px] transition-colors",
                  activeTab === "preview"
                    ? "text-accent-600 bg-accent-50"
                    : "text-neutral-400 hover:text-neutral-600",
                )}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={cn(
                  "px-2 py-0.5 font-mono text-[10px] transition-colors",
                  activeTab === "code"
                    ? "text-accent-600 bg-accent-50"
                    : "text-neutral-400 hover:text-neutral-600",
                )}
              >
                Code
              </button>
            </div>
          )}

          {/* Actions */}
          <button
            onClick={handleCopy}
            className="flex size-6 items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors"
            title="Copy"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
          <button
            className="flex size-6 items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors"
            title="Download"
          >
            <Download className="size-3.5" />
          </button>
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="flex size-6 items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </button>
          <button
            onClick={onClose}
            className="flex size-6 items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {artifact.type === "code" && activeTab === "code" ? (
          <pre className="p-4 text-[13px] leading-relaxed bg-neutral-900 text-neutral-200 font-mono h-full overflow-auto">
            <code>{artifact.content}</code>
          </pre>
        ) : artifact.type === "code" && activeTab === "preview" ? (
          <div className="p-4">
            <MarkdownRenderer
              content={`\`\`\`${artifact.language || ""}\n${artifact.content}\n\`\`\``}
            />
          </div>
        ) : (
          <div className="p-5">
            <MarkdownRenderer content={artifact.content} />
          </div>
        )}
      </div>
    </div>
  );
}
