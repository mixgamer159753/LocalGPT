"use client";

import { useEffect, useRef, useState } from "react";
import { Bug, Code2, FileText, ImagePlus, Search, Send, Sparkles, Square, X } from "lucide-react";

interface Props {
  onSend: (message: string, images?: string[]) => void;
  onStop: () => void;
  disabled?: boolean;
  model?: string;
}

const QUICK_ACTIONS = [
  { label: "Search Web", icon: Search, prompt: "Search the web and answer with sources: " },
  { label: "Think Longer", icon: Sparkles, prompt: "Think carefully and give a structured answer: " },
  { label: "Summarize", icon: FileText, prompt: "Summarize this clearly: " },
  { label: "Generate Code", icon: Code2, prompt: "Generate complete practical code for: " },
  { label: "Debug", icon: Bug, prompt: "Debug this and explain the fix: " },
];

function getPlaceholder(model?: string) {
  if (!model) {
    return "Ask LocalGPT anything";
  }

  const lower = model.toLowerCase();
  if (lower.includes("coder")) {
    return "Ask for code, tests, reviews, or debugging help";
  }
  if (lower.includes("llama")) {
    return "Ask anything: research, writing, planning, or ideas";
  }
  if (lower.includes("qwen")) {
    return "Ask for writing, analysis, or planning";
  }
  return "Ask LocalGPT anything";
}

export default function ChatInput({ onSend, onStop, disabled, model }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || disabled) {
      return;
    }

    onSend(trimmed, images.length > 0 ? images : undefined);
    setText("");
    setImages([]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;

    const results: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        results.push(dataUrl);
      } catch { /* skip failed reads */ }
    }
    if (results.length > 0) setImages((prev) => [...prev, ...results]);
    event.target.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  const hasContent = text.trim().length > 0 || images.length > 0;

  return (
    <div className="border-t border-slate-200 bg-white/80 px-4 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 md:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setText((current) => `${action.prompt}${current}`.trimStart());
                  textareaRef.current?.focus();
                }}
                disabled={disabled}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500/60 dark:hover:text-white"
              >
                <Icon size={13} />
                {action.label}
              </button>
            );
          })}
        </div>

        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={i} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Upload ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-teal-500 dark:border-slate-800 dark:bg-slate-900">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Attach image"
          >
            <ImagePlus size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={getPlaceholder(model)}
            className="max-h-[168px] min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-slate-500"
          />

          {disabled ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-rose-600 text-white transition hover:bg-rose-500 active:scale-95"
              aria-label="Stop generation"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!hasContent}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white transition hover:bg-teal-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-500">
          <span>Enter to send, Shift+Enter for a new line</span>
          <span>Generated on your local machine</span>
        </div>
      </div>
    </div>
  );
}
