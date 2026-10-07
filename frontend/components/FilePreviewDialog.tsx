"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, LoaderCircle, X } from "lucide-react";
import { apiErrorMessage, fetchDocument } from "@/lib/api";
import { FileAttachment, FilePreview } from "@/types/chat";
import { formatFileSize } from "./FileCard";
import styles from "./FileAttachments.module.css";

export default function FilePreviewDialog({ file, onClose }: { file: FileAttachment; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [visibleLines, setVisibleLines] = useState(2000);
  const lines = useMemo(() => (preview?.text ?? "").split("\n").map((text, index) => ({ text, number: index + 1 })), [preview?.text]);
  const matches = useMemo(() => query.trim() ? lines.filter((line) => line.text.toLowerCase().includes(query.trim().toLowerCase())) : lines, [lines, query]);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchDocument(file.id, controller.signal).then(setPreview).catch((error) => {
      if (!controller.signal.aborted) setError(apiErrorMessage(error, "Could not load the extracted text."));
    });
    return () => controller.abort();
  }, [file.id]);
  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="file-preview-title" onCancel={onClose} onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.dialogInner}>
      <header className={styles.previewHeader}><FileText size={22} /><div><h2 id="file-preview-title">{file.name}</h2><p>{formatFileSize(file.size)} · {file.chars.toLocaleString()} extracted characters{file.pages ? ` · ${file.pages} pages` : ""}</p></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close file preview"><X size={20} /></button></header>
      <p className={styles.previewNote}>Extracted text · answers cite filenames and line ranges. Long files use relevant excerpts.</p>
      {preview && <label className={styles.find}><span>Find in file</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLines(2000); }} placeholder="Search extracted text…" /><span>{matches.length.toLocaleString()} lines</span></label>}
      {file.truncated && <p className={styles.warning}>Extraction is limited to 120,000 characters and the first 100 PDF pages. Some content is omitted.</p>}
      {error ? <p role="alert" className={styles.warning}>{error}</p> : !preview ? <div className={styles.loading}><LoaderCircle size={20} className={styles.spinner} /> Loading extracted text…</div> : <div className={styles.previewText}>{matches.slice(0, visibleLines).map((line) => <div key={line.number}><span aria-hidden="true">{line.number}</span><code>{line.text || " "}</code></div>)}{!matches.length && <p className={styles.previewNote}>No matching lines.</p>}{matches.length > visibleLines && <button type="button" className={styles.moreLines} onClick={() => setVisibleLines((value) => value + 2000)}>Show more lines ({matches.length - visibleLines} remaining)</button>}</div>}
    </div>
  </dialog>;
}
