"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowRight, BrainCircuit, ChevronDown, ShieldCheck } from "lucide-react";
import { Message } from "@/types/chat";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  loading: boolean;
  onSend?: (text: string) => void;
  markdownRich?: boolean;
}

const SUGGESTIONS = [
  "Summarize today's top AI news",
  "Help me plan my week",
  "Compare two products before I buy",
  "Explain a topic in simple terms",
];

function formatDateSeparator(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export default function ChatWindow({ messages, loading, onSend, markdownRich = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || showScrollBtn) {
      return;
    }
    scrollToBottom(!loading);
  }, [messages, loading, showScrollBtn, scrollToBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const handler = () => {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 180);
    };

    el.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => el.removeEventListener("scroll", handler);
  }, []);

  if (messages.length === 1 && messages[0].id === -1) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
        <div className="w-full max-w-lg animate-message-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#315b49] text-white shadow-lg shadow-emerald-900/10 dark:bg-[#b5d9c1] dark:text-[#193c2d]">
            <BrainCircuit size={29} strokeWidth={1.7} />
          </div>
          <div className="mt-7 text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#dce6dc] bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#53745e] dark:border-slate-700 dark:bg-slate-900/70 dark:text-[#b5d9c1]">
              <ShieldCheck size={13} /> Private by design
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1d2b23] dark:text-white sm:text-4xl">
              A little space to think.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
              Ask a question, explore an idea, or get help with the work in front of you.
            </p>
          </div>
          <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
            {SUGGESTIONS.map((hint, i) => (
              <button
                key={hint}
                type="button"
                onClick={() => onSend?.(hint)}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group animate-message-in flex min-h-[4.25rem] items-center justify-between gap-3 rounded-2xl border border-[#e0e6df] bg-white/75 px-4 py-3.5 text-left text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#b7cdb9] hover:bg-white hover:text-[#203d2d] hover:shadow-md dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-300 dark:hover:border-[#456c53] dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <span>{hint}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eff3ed] text-[#53745e] transition group-hover:bg-[#315b49] group-hover:text-white dark:bg-slate-800 dark:text-[#b5d9c1] dark:group-hover:bg-[#b5d9c1] dark:group-hover:text-[#193c2d]">
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-3.5 py-6 sm:px-5 md:px-7" ref={containerRef}>
      <div className="mx-auto max-w-4xl">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showDateSep =
            index > 0 &&
            message.created_at &&
            previous?.created_at &&
            new Date(message.created_at).toDateString() !== new Date(previous.created_at).toDateString();

          return (
            <div key={message.id} className="msg-container">
              {showDateSep && message.created_at ? (
                <div className="my-8 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    {formatDateSeparator(message.created_at)}
                  </span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
              ) : null}
              <MessageBubble message={message} index={index} markdownRich={markdownRich} />
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {showScrollBtn ? (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="fixed bottom-28 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-lg shadow-slate-950/10 transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ChevronDown size={15} />
          New messages
        </button>
      ) : null}
    </div>
  );
}
