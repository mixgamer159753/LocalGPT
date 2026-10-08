"use client";

import { useEffect, useRef, useState } from "react";
import { Globe2, LoaderCircle, Paperclip, Send, Square, X } from "lucide-react";
import { FileAttachment, SearchMode, ResearchDepth } from "@/types/chat";
import { FILE_ACCEPT, MAX_FILE_BYTES, useFileAttachments } from "@/hooks/useFileAttachments";
import FileCard from "./FileCard";
import FilePreviewDialog from "./FilePreviewDialog";
import fileStyles from "./FileAttachments.module.css";

interface Props {
  onSend: (message: string, images?: string[], files?: FileAttachment[]) => void;
  onStop: () => void;
  disabled?: boolean;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  researchDepth: ResearchDepth;
  onResearchDepthChange: (depth: ResearchDepth) => void;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 20_000;

export default function ChatInput({ onSend, onStop, disabled, searchMode, onSearchModeChange, researchDepth, onResearchDepthChange }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [readingImages, setReadingImages] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileAttachment | null>(null);
  const attachments = useFileAttachments();
  const dragDepthRef = useRef(0);
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
    if ((!trimmed && images.length === 0 && attachments.files.length === 0) || disabled || readingImages || attachments.files.some((file) => file.status !== "ready")) {
      return;
    }

    const files = attachments.files.flatMap((file) => file.attachment ? [file.attachment] : []);
    onSend(trimmed, images.length > 0 ? images : undefined, files.length ? files : undefined);
    attachments.clear(true);
    setText("");
    setImages([]);
    setAttachmentNotice("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  }

  async function addSelectedFiles(selectedFiles: File[]) {
    if (disabled || readingImages) return;
    const results: string[] = [];
    const remainingSlots = Math.max(0, MAX_IMAGES - images.length - attachments.files.length);
    const notices: string[] = [];
    const valid = selectedFiles.filter((file) => {
      if (file.type.startsWith("image/")) {
        if (file.size > MAX_IMAGE_BYTES) { notices.push("Each image must be 3.5 MB or smaller."); return false; }
      } else {
        const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
        if (!FILE_ACCEPT.split(",").includes(extension)) { notices.push(`${file.name}: use PDF, DOCX, text, CSV, or code.`); return false; }
        if (file.size > MAX_FILE_BYTES) { notices.push(`${file.name}: files must be 8 MB or smaller.`); return false; }
        if (!file.size) { notices.push(`${file.name} is empty.`); return false; }
      }
      return true;
    });
    if (valid.length > remainingSlots) notices.push(`Attach up to ${MAX_IMAGES} files or images per message.`);
    const candidates = valid.slice(0, remainingSlots);
    attachments.add(candidates.filter((file) => !file.type.startsWith("image/")));
    const imageFiles = candidates.filter((file) => file.type.startsWith("image/"));
    setReadingImages(imageFiles.length > 0);
    for (const file of imageFiles) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        results.push(dataUrl);
      } catch { notices.push(`Could not read ${file.name}. Try again.`); }
    }
    if (results.length > 0) setImages((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
    setAttachmentNotice([...new Set(notices)].join(" "));
    setReadingImages(false);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  const hasContent = text.trim().length > 0 || images.length > 0 || attachments.files.length > 0;
  const uploading = readingImages || attachments.files.some((file) => file.status === "uploading");
  const failed = attachments.files.some((file) => file.status === "error");
  const full = images.length + attachments.files.length >= MAX_IMAGES;

  return (
    <div onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files") && !disabled) { event.preventDefault(); dragDepthRef.current++; setDragging(true); } }}
      onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragging(false); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; } }}
      onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDragging(false); void addSelectedFiles(Array.from(event.dataTransfer.files)); }}
      className={`relative shrink-0 border-t border-[var(--border)]/80 bg-[var(--surface)]/85 px-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5 sm:pt-4 md:px-7 ${dragging ? "ring-2 ring-inset ring-[#e58e74]" : ""}`}>
      <div className="mx-auto max-w-4xl">
        {dragging && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[#191e24]/95 text-sm font-medium text-[#ffb297]">Drop files to attach</div>}
        {attachments.files.length > 0 && <div className={fileStyles.list} aria-label="File attachments">{attachments.files.map((draft) => <FileCard key={draft.key} name={draft.file.name} size={draft.file.size}
          kind={draft.attachment?.kind} pages={draft.attachment?.pages} truncated={draft.attachment?.truncated} status={draft.status} error={draft.error}
          onPreview={draft.attachment ? () => setPreviewFile(draft.attachment!) : undefined} onRemove={() => attachments.remove(draft.key)} onRetry={() => void attachments.retry(draft)} />)}</div>}
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

        <div className="flex items-end gap-2 rounded-[1.35rem] border border-[var(--border)] bg-[#191e24] p-2 shadow-[0_8px_32px_-20px_rgba(0,0,0,0.75)] transition focus-within:border-[#e58e74]/80 focus-within:ring-4 focus-within:ring-[#e58e74]/[0.08]">
          <input
            ref={fileInputRef}
            type="file"
            accept={`image/*,${FILE_ACCEPT}`}
            multiple
            onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addSelectedFiles(files); }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || full || readingImages}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-[#ffb297] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Attach files or images"
            title={full ? `Up to ${MAX_IMAGES} attachments per message` : "Attach PDF, DOCX, text, CSV, code, or images"}
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Message LocalGPT…"
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
              disabled={!hasContent || uploading || failed}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e58e74] text-[#271914] transition hover:bg-[#f0a087] active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              aria-label="Send message"
            >
              {uploading ? <LoaderCircle size={16} className={fileStyles.spinner} /> : <Send size={16} />}
            </button>
          )}
        </div>

        {!images.length && !attachments.files.length && <p className="mt-2 px-1 text-[10px] text-slate-500">Drop files here · PDF, DOCX, text, CSV & code · 4 attachments, 8 MB per document</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-500">
          <span>Enter to send · Shift + Enter for a new line{ text.length > 18_000 ? ` · ${text.length}/${MAX_MESSAGE_LENGTH}` : ""}</span>
          <div className="flex items-center gap-2"><label className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 transition ${searchMode === "off" ? "border-transparent text-slate-500" : "border-[#e58e74]/20 bg-[#e58e74]/[0.06] text-[#f0a087]"}`}>
            <Globe2 size={13} aria-hidden="true" />
            <span>Web</span>
            <select
              aria-label="Web search mode"
              value={searchMode}
              onChange={(event) => onSearchModeChange(event.target.value as SearchMode)}
              disabled={disabled}
              title="Auto searches when useful. Search uses web sources for your next question. Off keeps requests local."
              className="cursor-pointer rounded bg-transparent py-0.5 pr-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-[#e58e74] disabled:cursor-not-allowed [&>option]:bg-[#191e24] [&>option]:text-slate-200"
            >
              <option value="auto">Auto</option>
              <option value="always">Search</option>
              <option value="off">Off</option>
            </select>
          </label>
          <button type="button" disabled={disabled || searchMode === "off"} aria-pressed={searchMode !== "off" && researchDepth === "deep"} onClick={() => onResearchDepthChange(researchDepth === "deep" ? "standard" : "deep")}
            title="Deep research explores more sources, reads page content, and writes a cited report. Slower; uses additional Exa requests."
            className={`rounded-lg border px-2 py-1.5 text-[11px] transition disabled:opacity-40 ${researchDepth === "deep" && searchMode !== "off" ? "border-[#e58e74]/40 bg-[#e58e74]/10 text-[#ffb297]" : "border-[var(--border)] text-slate-400 hover:text-[#f0a087]"}`}>Deep research</button></div>
        </div>
      </div>
      {previewFile && <FilePreviewDialog key={previewFile.id} file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
