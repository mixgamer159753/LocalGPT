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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#e58e74] text-[#271914] shadow-lg shadow-[#e58e74]/10">
            <BrainCircuit size={29} strokeWidth={1.7} />
          </div>
          <div className="mt-7 text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#e58e74]/25 bg-[#e58e74]/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f0a087]">
              <ShieldCheck size={13} /> Private by design
            </div>
            <h2 className="font-serif text-3xl font-medium tracking-[-0.035em] text-[#f1eee9] sm:text-4xl">
              Good to see you here.
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
                className="group animate-message-in flex min-h-[4.25rem] items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[#191e24]/90 px-4 py-3.5 text-left text-sm font-medium text-slate-300 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#e58e74]/55 hover:bg-[#20262e] hover:text-white hover:shadow-lg hover:shadow-black/20"
              >
                <span>{hint}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2a2524] text-[#e58e74] transition group-hover:bg-[#e58e74] group-hover:text-[#271914]">
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
