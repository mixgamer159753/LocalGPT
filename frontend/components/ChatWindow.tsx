"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowRight, BrainCircuit, ChevronDown } from "lucide-react";
import { Message } from "@/types/chat";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  loading: boolean;
  onContinue?: (messageId: number) => void;
  onSend?: (text: string) => void;
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

export default function ChatWindow({ messages, loading, onContinue, onSend }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const hasStreamingMessage = messages.some(
    (message) => message.role === "assistant" && message.content === "" && message.id !== -1,
  );

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || showScrollBtn) {
      return;
    }
    scrollToBottom();
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

  const lastAssistantId = (() => {
    if (loading || !onContinue) {
      return null;
    }

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (
        message.role === "assistant" &&
        message.id !== -1 &&
        message.content.trim() &&
        !message.content.startsWith("Error:")
      ) {
        return message.id;
      }
    }

    return null;
  })();

  if (messages.length === 1 && messages[0].id === -1) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
        <div className="w-full max-w-lg animate-message-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white shadow-lg shadow-teal-500/20 dark:from-teal-400 dark:to-teal-600 dark:shadow-teal-400/10">
            <BrainCircuit size={36} />
          </div>
          <div className="mt-6 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              What can I help with?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Private local chat for research, writing, planning, learning, and everyday questions.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map((hint, i) => (
              <button
                key={hint}
                type="button"
                onClick={() => onSend?.(hint)}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group animate-message-in rounded-xl border border-slate-200 bg-white/80 p-4 text-left text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-teal-300 hover:bg-white hover:text-slate-950 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-teal-500/60 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <span className="text-teal-600 transition group-hover:translate-x-0.5 dark:text-teal-400">&rarr;</span>
                  {hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-y-auto px-4 py-6 md:px-6" ref={containerRef}>
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
              <MessageBubble message={message} index={index} />
            </div>
          );
        })}

        {!loading && lastAssistantId !== null ? (
          <div className="my-6 flex justify-center animate-message-in">
            <button
              type="button"
              onClick={() => onContinue?.(lastAssistantId)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-teal-300 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500/60 dark:hover:text-white"
            >
              <ArrowRight size={15} />
              Continue generation
            </button>
          </div>
        ) : null}

        {loading && !hasStreamingMessage ? (
          <div className="mb-4 flex justify-start animate-message-in">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Thinking</span>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {showScrollBtn ? (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="fixed bottom-28 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-lg shadow-slate-950/10 transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ChevronDown size={15} />
          New messages
        </button>
      ) : null}
    </div>
  );
}
