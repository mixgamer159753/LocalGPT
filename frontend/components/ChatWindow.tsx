"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Code2,
  Lightbulb,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { Message } from "@/types/chat";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  loading: boolean;
  onSend?: (text: string) => void;
  markdownRich?: boolean;
}

const STARTERS = [
  {
    title: "Debug a problem",
    description: "Trace an error and work toward a fix.",
    prompt: "Help me debug a problem. Ask me for the code or error details you need.",
    icon: Code2,
  },
  {
    title: "Write a first draft",
    description: "Shape a message, outline, or longer piece.",
    prompt: "Help me write a clear first draft. Ask what I am trying to create.",
    icon: PenLine,
  },
  {
    title: "Understand a topic",
    description: "Get a clear explanation, one step at a time.",
    prompt: "Explain a difficult topic in simple, beginner-friendly terms.",
    icon: BookOpen,
  },
  {
    title: "Explore an idea",
    description: "Compare options and choose a useful next step.",
    prompt: "Help me think through an idea, compare options, and choose a next step.",
    icon: Lightbulb,
  },
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
        <div className="w-full max-w-xl animate-message-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#e58e74] text-[#271914] shadow-lg shadow-[#e58e74]/10">
            <BrainCircuit size={29} strokeWidth={1.7} />
          </div>
          <div className="mt-7 text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#e58e74]/25 bg-[#e58e74]/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f0a087]">
              <ShieldCheck size={13} /> Private by design
            </div>
            <h2 className="font-serif text-3xl font-medium tracking-[-0.035em] text-[#f1eee9] sm:text-4xl">
              What would you like to work on?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
              Ask a question, bring a problem, or start with one of these.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2">
            {STARTERS.map(({ title, description, prompt, icon: Icon }, i) => (
              <button
                key={title}
                type="button"
                onClick={() => onSend?.(prompt)}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group animate-message-in flex min-h-[5.25rem] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[#191e24]/90 px-3.5 py-3 text-left shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#e58e74]/55 hover:bg-[#20262e] hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e58e74] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111418]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#24282d] text-[#f0a087] transition group-hover:bg-[#e58e74] group-hover:text-[#271914]">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-slate-200 transition group-hover:text-white">{title}</span>
                  <span className="mt-1 block text-xs leading-4 text-slate-500 transition group-hover:text-slate-400">{description}</span>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-slate-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#f0a087]" />
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
