"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Send, Square, X } from "lucide-react";

interface Props {
  onSend: (message: string, images?: string[]) => void;
  onStop: () => void;
  disabled?: boolean;
  model?: string;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 20_000;

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
  const [attachmentNotice, setAttachmentNotice] = useState("");
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
    setAttachmentNotice("");
    textareaRef.current?.focus();
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
    const selectedFiles = Array.from(files);
    const remainingSlots = Math.max(0, MAX_IMAGES - images.length);
    let skippedLarge = false;
    const candidates = selectedFiles.filter((file) => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_IMAGE_BYTES) {
        skippedLarge = true;
        return false;
      }
      return true;
    }).slice(0, remainingSlots);
    for (const file of candidates) {
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
    if (results.length > 0) setImages((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
    setAttachmentNotice(
      skippedLarge
        ? "Each image must be 3.5 MB or smaller."
        : selectedFiles.filter((file) => file.type.startsWith("image/")).length > remainingSlots
          ? `You can attach up to ${MAX_IMAGES} images per message.`
          : "",
    );
    event.target.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  const hasContent = text.trim().length > 0 || images.length > 0;

  return (
    <div className="shrink-0 border-t border-[var(--border)]/80 bg-[var(--surface)]/85 px-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5 sm:pt-4 md:px-7">
      <div className="mx-auto max-w-4xl">
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2" aria-label={`${images.length} image attachments`}>
            {images.map((img, i) => (
              <div key={i} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Upload ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white opacity-100 transition md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`Remove image ${i + 1}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachmentNotice ? <p role="status" className="mb-2 text-xs text-amber-800 dark:text-amber-300">{attachmentNotice}</p> : null}

        <div className="flex items-end gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white p-2 shadow-[0_5px_24px_-18px_rgba(20,43,29,0.42)] transition focus-within:border-[#87a78d] focus-within:ring-4 focus-within:ring-[#315b49]/[0.07] dark:bg-[#171f1a]">
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
            disabled={disabled || images.length >= MAX_IMAGES}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#eff3ed] hover:text-[#315b49] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-slate-800 dark:hover:text-[#b5d9c1]"
            aria-label="Attach image"
            title={images.length >= MAX_IMAGES ? `Up to ${MAX_IMAGES} images per message` : "Attach images"}
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
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={getPlaceholder(model)}
            className="max-h-[168px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-slate-500"
          />

          {disabled ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500 active:scale-95"
              aria-label="Stop generation"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!hasContent}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#315b49] text-white transition hover:bg-[#264b39] active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-[#b5d9c1] dark:text-[#193c2d] dark:hover:bg-[#c9e8d2] dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-500">
          <span>Enter to send · Shift + Enter for a new line{ text.length > 18_000 ? ` · ${text.length}/${MAX_MESSAGE_LENGTH}` : ""}</span>
          <span>Responses run through your selected local model</span>
        </div>
      </div>
    </div>
  );
}
