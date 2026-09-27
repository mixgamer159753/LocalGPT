"use client";

import { useMemo, useState } from "react";
import { Bot, Edit3, MessageSquare, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { Conversation } from "@/types/chat";

interface Props {
  open: boolean;
  onNewChat: () => void;
  conversations: Conversation[];
  activeId: number | null;
  pinnedIds: number[];
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number) => void;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 86_400_000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 604_800_000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Sidebar({
  open,
  onNewChat,
  conversations,
  activeId,
  pinnedIds,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
}: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = query
      ? conversations.filter((conversation) => conversation.title.toLowerCase().includes(query))
      : conversations;

    return [...visible].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [conversations, pinnedIds, search]);

  function startRename(chat: Conversation) {
    setEditingId(chat.id);
    setDraftTitle(chat.title);
  }

  function submitRename(id: number) {
    const title = draftTitle.trim();
    if (title) {
      onRename(id, title);
    }
    setEditingId(null);
    setDraftTitle("");
  }

  return (
    <aside
      className={`
        fixed z-40 flex h-full w-80 max-w-[86vw] flex-col border-r border-slate-200
        bg-white/94 shadow-2xl shadow-slate-950/10 backdrop-blur-xl transition duration-200
        dark:border-slate-800 dark:bg-slate-950/94 md:relative md:translate-x-0 md:shadow-none
        ${open ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950">
            <Bot size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950 dark:text-white">LocalGPT</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">LocalGPT workspace</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <Plus size={16} />
          New chat
        </button>
      </div>

      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-600 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-teal-400"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-800">
            <MessageSquare size={22} className="mx-auto text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
              {search ? "No matching chats" : "No conversations yet"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              {search ? "Try a shorter search." : "Start a chat and it will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((chat) => {
              const active = chat.id === activeId;
              const pinned = pinnedIds.includes(chat.id);
              const editing = editingId === chat.id;

              return (
                <div
                  key={chat.id}
                  className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                    active
                      ? "bg-teal-50 text-teal-900 dark:bg-teal-400/10 dark:text-teal-100"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`}
                  onClick={() => {
                    if (!editing) {
                      onSelect(chat.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (!editing && (event.key === "Enter" || event.key === " ")) {
                      onSelect(chat.id);
                    }
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    {pinned ? <Pin size={14} /> : <MessageSquare size={14} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    {editing ? (
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            submitRename(chat.id);
                          }
                          if (event.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        onBlur={() => submitRename(chat.id)}
                        autoFocus
                        className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    ) : (
                      <>
                        <span className="block truncate text-sm font-medium">{chat.title}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-500">{formatDate(chat.updated_at)}</span>
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePin(chat.id);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
                  >
                    {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      startRename(chat);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={`Rename ${chat.title}`}
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(chat.id);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                    aria-label={`Delete ${chat.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
