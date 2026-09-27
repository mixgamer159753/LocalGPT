"use client";

import { ComponentPropsWithoutRef, useEffect, useMemo, useState } from "react";
import { Bot, Check, Copy, ExternalLink, Link2Off, User } from "lucide-react";
import ReactMarkdown, { Components, ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "@/types/chat";
import CodeBlock from "./CodeBlock";

interface Props {
  message: Message;
  index?: number;
  markdownRich?: boolean;
}

function MarkdownPre({ node, children }: ComponentPropsWithoutRef<"pre"> & ExtraProps) {
  const codeNode = node?.children.find((child) => child.type === "element" && child.tagName === "code");
  if (!codeNode || codeNode.type !== "element") return <pre>{children}</pre>;

  const classes = codeNode.properties.className;
  const language = Array.isArray(classes)
    ? String(classes.find((name) => String(name).startsWith("language-")) ?? "").replace(/^language-/, "")
    : "";
  const source = codeNode.children.map((child) => child.type === "text" ? child.value : "").join("");

  // Replace the Markdown <pre> itself so panels never end up nested inside a <pre>.
  return <CodeBlock code={source.replace(/\n$/, "")} language={language} />;
}

function normalizeHref(href?: string) {
  if (!href) {
    return null;
  }

  const trimmed = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

function safeImageSrc(src: string | Blob | undefined) {
  if (typeof src !== "string") {
    return null;
  }
  const trimmed = src.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export default function MessageBubble({ message, index = 0, markdownRich = true }: Props) {
  const isUser = message.role === "user";
  const isError = !isUser && (message.status === "error" || message.content.startsWith("Error:"));
  const isStopped = message.status === "stopped";
  const [copied, setCopied] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxSrc]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  // Stable renderers preserve each panel's wrap, copy, and expanded state while streaming.
  const markdownComponents = useMemo<Components>(() => ({
    pre: MarkdownPre,
    code({ children }) {
      return (
        <code className="rounded-md border border-[#343b46] bg-[#12161c] px-1.5 py-0.5 font-mono text-[0.85em] text-[#ffb297] before:content-none after:content-none">
          {children}
        </code>
      );
    },
    p({ children }) {
      return <p className="my-2 leading-7">{children}</p>;
    },
    ul({ children }) {
      return <ul className="my-3 space-y-1.5">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="my-3 space-y-1.5">{children}</ol>;
    },
    li({ children }) {
      return <li className="pl-1">{children}</li>;
    },
    a({ children, href }) {
      const safeHref = normalizeHref(href);
      if (!safeHref) {
        return (
          <span className="inline-flex items-center gap-1 rounded-md text-slate-500 line-through decoration-slate-400 dark:text-slate-500" title="This link is not a valid web URL">
            {children}
            <Link2Off size={12} />
          </span>
        );
      }

      const external = safeHref.startsWith("http");
      return (
        <a
          href={safeHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-1 rounded-md text-[#f0a087] underline decoration-[#e58e74]/40 underline-offset-4 transition hover:text-[#ffc1aa] hover:decoration-[#ffc1aa]"
        >
          {children}
          {external ? <ExternalLink size={12} /> : null}
        </a>
      );
    },
    img({ src, alt }) {
      const imageSrc = safeImageSrc(src);
      if (!imageSrc) {
        return null;
      }

      return (
        <span className="my-4 block overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={alt || "Research image"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-80 w-full object-cover"
          />
          {alt ? (
            <span className="block border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {alt}
            </span>
          ) : null}
        </span>
      );
    },
    hr() {
      return <hr className="my-5 border-slate-200 dark:border-slate-800" />;
    },
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="m-0 w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
    th({ children }) {
      return (
        <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700 dark:border-slate-800 dark:text-slate-200">
          {children}
        </td>
      );
    },
    blockquote({ children }) {
      return (
        <blockquote className="my-4 rounded-lg border border-[#e58e74]/25 bg-[#e58e74]/[0.07] px-4 py-3 text-slate-200">
          {children}
        </blockquote>
      );
    },
  }), []);

  return (
    <div
      className={`mb-5 flex gap-3 animate-message-in md:gap-4 ${
        isUser ? "justify-end" : "justify-start"
      }`}
      style={{ animationDelay: `${Math.min(index * 24, 160)}ms` }}
    >
      <div className={`flex min-w-0 gap-2.5 md:gap-3 ${isUser ? "max-w-[96%] flex-row-reverse md:max-w-[82%]" : "max-w-full"}`}>
        <div className="mt-1 shrink-0">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isUser
                ? "bg-[#3a2925] text-[#ffc1aa]"
                : "bg-[#e58e74] text-[#271914]"
            }`}
          >
            {isUser ? <User size={16} /> : <Bot size={17} />}
          </div>
        </div>

        <div className="group min-w-0">
          <div
            className={`rounded-2xl px-4 py-3 ${
              isUser
                ? "rounded-tr-md bg-[#2a2221] text-[#f4ece8]"
                : isError
                  ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
                  : isStopped
                    ? "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                  : "bg-[#191e24]/90 text-slate-100"
            }`}
          >
            {isUser ? (
              <div>
                {message.images && message.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {message.images.map((img, i) => (
                      <button key={i} type="button" onClick={() => setLightboxSrc(img)} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-white/20 transition hover:opacity-85">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt={`Attached ${i + 1}`} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {message.content && <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>}
              </div>
            ) : message.content && markdownRich ? (
              <div className="prose prose-sm max-w-none break-words prose-custom dark:prose-invert prose-headings:font-semibold prose-a:no-underline hover:prose-a:underline">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : message.content ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
            ) : (
              <div role="status" aria-live="polite" className="flex items-center gap-3 py-2">
                <div aria-hidden="true" className="flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {message.statusText || "Thinking..."}
                </span>
              </div>
            )}
          </div>

          <div className={`mt-1.5 flex items-center gap-2 px-1 ${isUser ? "justify-end" : ""}`}>
            {time ? <span className="text-xs text-slate-500">{time}</span> : null}
            {message.content ? (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 transition hover:bg-white hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={copied ? "Message copied" : "Copy message"}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-message-in"
          onClick={() => setLightboxSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close image preview"
          >
            <span aria-hidden="true">×</span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="Enlarged"
            className="max-h-[90dvh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
