"use client";

import { ComponentPropsWithoutRef, useId, useState } from "react";
import { Bot, Check, Copy, Download, ExternalLink, Link2Off, User } from "lucide-react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "@/types/chat";

interface Props {
  message: Message;
  index?: number;
}

type CodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
};

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

function extensionForLanguage(language: string) {
  const map: Record<string, string> = {
    bash: "sh",
    css: "css",
    html: "html",
    javascript: "js",
    js: "js",
    json: "json",
    markdown: "md",
    md: "md",
    powershell: "ps1",
    python: "py",
    py: "py",
    shell: "sh",
    sh: "sh",
    ts: "ts",
    tsx: "tsx",
    typescript: "ts",
    yaml: "yml",
    yml: "yml",
  };
  return map[language.toLowerCase()] || "txt";
}

export default function MessageBubble({ message, index = 0 }: Props) {
  const isUser = message.role === "user";
  const isError = !isUser && (message.status === "error" || message.content.startsWith("Error:"));
  const isStopped = message.status === "stopped";
  const [copied, setCopied] = useState(false);
  const [codeCopiedId, setCodeCopiedId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const blockId = useId();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function handleCopyCode(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopiedId(id);
      window.setTimeout(() => setCodeCopiedId(null), 1800);
    } catch {
      setCodeCopiedId(null);
    }
  }

  function handleDownloadCode(code: string, language: string) {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `localgpt-${Date.now()}.${extensionForLanguage(language)}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const markdownComponents: Components = {
    code({ className, children, inline, ...props }: CodeProps) {
      const codeStr = String(children).replace(/\n$/, "");
      const language = className?.replace("language-", "") || "";
      const isInline = inline ?? !className;

      if (isInline) {
        return (
          <code
            className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-teal-800 dark:border-slate-800 dark:bg-slate-950 dark:text-teal-200"
            {...props}
          >
            {children}
          </code>
        );
      }

      const copyId = `${blockId}-${language}-${codeStr.length}-${codeStr.slice(0, 24)}`;
      const isCopied = codeCopiedId === copyId;
      return (
        <div className="my-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-sm dark:border-slate-800">
          <div className="flex h-10 items-center border-b border-white/10 px-3">
            <span className="text-xs font-medium uppercase text-slate-400">{language || "code"}</span>
            <button
              type="button"
              onClick={() => void handleCopyCode(codeStr, copyId)}
              className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              {isCopied ? <Check size={13} /> : <Copy size={13} />}
              {isCopied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadCode(codeStr, language)}
              className="ml-1 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <Download size={13} />
              File
            </button>
          </div>
          <pre className="m-0 overflow-x-auto p-4 text-sm leading-6 text-slate-100">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        </div>
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
          className="inline-flex items-center gap-1 rounded-md text-teal-700 underline decoration-teal-500/30 underline-offset-4 transition hover:text-teal-900 hover:decoration-teal-600 dark:text-teal-300 dark:hover:text-teal-100"
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
        <blockquote className="my-4 rounded-lg border border-teal-200 bg-teal-50/70 px-4 py-3 text-slate-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-slate-200">
          {children}
        </blockquote>
      );
    },
  };

  return (
    <div
      className={`mb-5 flex gap-3 animate-message-in md:gap-4 ${
        isUser ? "justify-end" : "justify-start"
      }`}
      style={{ animationDelay: `${Math.min(index * 24, 160)}ms` }}
    >
      <div className={`flex max-w-[92%] gap-3 md:max-w-[78%] ${isUser ? "flex-row-reverse" : ""}`}>
        <div className="mt-1 shrink-0">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm ${
              isUser
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950"
            }`}
          >
            {isUser ? <User size={16} /> : <Bot size={17} />}
          </div>
        </div>

        <div className="group min-w-0">
          <div
            className={`rounded-lg px-4 py-3 shadow-sm ${
              isUser
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : isError
                  ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
                  : isStopped
                    ? "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                  : "border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
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
            ) : message.content ? (
              <div className="prose prose-sm max-w-none prose-custom dark:prose-invert prose-headings:font-semibold prose-a:no-underline hover:prose-a:underline prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-1">
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
            {time ? <span className="text-xs text-slate-400 dark:text-slate-600">{time}</span> : null}
            {message.content ? (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Copy message"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
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
        >
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
