"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge } from "@/components/decorations/dot-badge";
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Pencil,
  Pin,
  Archive,
} from "lucide-react";
import { useState } from "react";

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  model?: string;
  workstream?: string;
  pinned?: boolean;
  messageCount: number;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState("");
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  const filtered = conversations.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.preview.toLowerCase().includes(search.toLowerCase()),
  );

  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  return (
    <div className="flex h-full flex-col bg-white border-r border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 h-[45px] border-b border-neutral-200">
        <DashBadge>Conversations</DashBadge>
        <button
          onClick={onNew}
          className="flex size-7 items-center justify-center bg-accent-600 text-white hover:bg-accent-700 transition-colors active:scale-95"
          title="New conversation"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-neutral-100">
        <div className="flex items-center gap-2 bg-neutral-50 px-2.5 py-1.5 border border-neutral-200">
          <Search className="size-3.5 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="flex-1 bg-transparent font-mono text-[12px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {pinned.length > 0 && (
          <div className="py-2">
            <span className="px-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              Pinned
            </span>
            <div className="mt-1">
              {pinned.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeId}
                  onSelect={() => onSelect(conv.id)}
                  showContextMenu={contextMenuId === conv.id}
                  onContextMenu={() =>
                    setContextMenuId(contextMenuId === conv.id ? null : conv.id)
                  }
                  onDelete={() => onDelete?.(conv.id)}
                  onRename={(title) => onRename?.(conv.id, title)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="py-2">
          {pinned.length > 0 && (
            <span className="px-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              Recent
            </span>
          )}
          <div className={cn(pinned.length > 0 && "mt-1")}>
            {recent.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeId}
                onSelect={() => onSelect(conv.id)}
                showContextMenu={contextMenuId === conv.id}
                onContextMenu={() =>
                  setContextMenuId(contextMenuId === conv.id ? null : conv.id)
                }
                onDelete={() => onDelete?.(conv.id)}
                onRename={(title) => onRename?.(conv.id, title)}
              />
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8">
            <MessageSquare className="size-5 text-neutral-300 mb-2" />
            <p className="text-[12px] text-neutral-400">
              No conversations found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  showContextMenu,
  onContextMenu,
  onDelete,
  onRename,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  showContextMenu: boolean;
  onContextMenu: () => void;
  onDelete?: () => void;
  onRename?: (title: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onSelect}
        className={cn(
          "w-full text-left px-3 py-2.5 transition-colors group",
          isActive
            ? "bg-accent-50 border-r-2 border-accent-500"
            : "hover:bg-neutral-50",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                "block font-mono text-[12px] font-medium truncate",
                isActive ? "text-accent-700" : "text-neutral-900",
              )}
            >
              {conversation.title}
            </span>
            <span className="block mt-0.5 text-[11px] text-neutral-400 truncate">
              {conversation.preview}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="font-mono text-[9px] text-neutral-300">
              {conversation.updatedAt}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu();
              }}
              className="opacity-0 group-hover:opacity-100 flex size-5 items-center justify-center text-neutral-400 hover:text-neutral-600 transition-all"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        </div>
        {conversation.workstream && (
          <span className="mt-1 inline-block font-mono text-[9px] uppercase text-accent-500">
            {conversation.workstream}
          </span>
        )}
      </button>

      {/* Context menu */}
      {showContextMenu && (
        <div className="absolute right-2 top-10 z-10 bg-white border border-neutral-200 shadow-md py-1 min-w-[140px]">
          <button
            onClick={() => {
              onRename?.(conversation.title);
              onContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
          >
            <Pencil className="size-3" />
            Rename
          </button>
          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50">
            <Pin className="size-3" />
            {conversation.pinned ? "Unpin" : "Pin"}
          </button>
          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50">
            <Archive className="size-3" />
            Archive
          </button>
          <div className="my-1 border-t border-neutral-100" />
          <button
            onClick={() => {
              onDelete?.();
              onContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
