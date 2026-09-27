"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, Edit3, MessageSquare, Pin, PinOff, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
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
  onClose: () => void;
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
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const cancelRenameRef = useRef(false);

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
      aria-label="Chat history"
      className={`
        fixed z-40 flex h-full w-[18rem] max-w-[88vw] flex-col border-r border-[#dce4dc]
        bg-[#f0f3ee] shadow-2xl shadow-slate-950/10 transition duration-200
        dark:border-slate-800 dark:bg-[#141c17] md:relative md:translate-x-0 md:shadow-none
        ${open ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      <div className="border-b border-[#dce4dc] p-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-[#315b49] text-white shadow-sm dark:bg-[#b5d9c1] dark:text-[#193c2d]">
            <Bot size={20} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-950 dark:text-white">LocalGPT</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your private workspace</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-slate-900 md:hidden dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close conversations"
          >
            <X size={17} />
          </button>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#315b49] text-sm font-semibold text-white shadow-sm transition hover:bg-[#264b39] active:scale-[0.99] dark:bg-[#b5d9c1] dark:text-[#193c2d] dark:hover:bg-[#c9e8d2]"
        >
          <Plus size={16} />
          New chat
        </button>
      </div>

      <div className="border-b border-[#dce4dc] p-3.5 dark:border-slate-800">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="h-10 w-full rounded-xl border border-[#dce4dc] bg-white/70 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-[#71947a] focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-[#71947a]"
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

      <div className="border-b border-[#dce4dc] px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-800 dark:text-slate-500">
        Conversations <span className="ml-1 font-medium tracking-normal">{conversations.length || ""}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cbd8cd] bg-white/35 p-6 text-center dark:border-slate-800 dark:bg-slate-900/30">
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
                  className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition ${
                    active
                      ? "bg-white text-[#214532] shadow-sm ring-1 ring-[#e2e9e1] dark:bg-slate-900 dark:text-[#c5e2ce] dark:ring-slate-800"
                      : "text-slate-700 hover:bg-white/65 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`}
                >
                  {editing ? (
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRenameRef.current = true;
                          setEditingId(null);
                          setDraftTitle("");
                          event.currentTarget.blur();
                        }
                      }}
                      onBlur={() => {
                        if (cancelRenameRef.current) {
                          cancelRenameRef.current = false;
                          return;
                        }
                        submitRename(chat.id);
                      }}
                      autoFocus
                      aria-label={`Rename ${chat.title}`}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-[#b7cdb9] bg-white px-2 text-sm text-slate-900 outline-none dark:border-[#456c53] dark:bg-slate-950 dark:text-white"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(chat.id)}
                      aria-current={active ? "page" : undefined}
                      className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#71947a]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e5ebe4] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {pinned ? <Pin size={14} /> : <MessageSquare size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{chat.title}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-500">{formatDate(chat.updated_at)}</span>
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onTogglePin(chat.id);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-100 transition hover:bg-slate-100 hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
                  >
                    {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      startRename(chat);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-100 transition hover:bg-slate-100 hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={`Rename ${chat.title}`}
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) onDelete(chat.id);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-100 transition hover:bg-rose-50 hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
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
      <div className="border-t border-[#dce4dc] p-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/55 px-3 py-2.5 dark:bg-slate-900/60">
          <ShieldCheck size={16} className="shrink-0 text-[#53745e] dark:text-[#b5d9c1]" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Private by design</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-500">Your model runs locally</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
