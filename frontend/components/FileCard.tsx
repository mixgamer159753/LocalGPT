"use client";

import { FileCode2, FileText, LoaderCircle, RotateCcw, Sheet, X } from "lucide-react";
import styles from "./FileAttachments.module.css";

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Props {
  name: string;
  size: number;
  kind?: string;
  pages?: number | null;
  truncated?: boolean;
  status?: "ready" | "uploading" | "error";
  error?: string;
  onPreview?: () => void;
  onRemove?: () => void;
  onRetry?: () => void;
}

export default function FileCard({ name, size, kind, pages, truncated, status = "ready", error, onPreview, onRemove, onRetry }: Props) {
  const Icon = kind === "code" ? FileCode2 : kind === "csv" ? Sheet : FileText;
  return <div className={`${styles.card} ${status === "error" ? styles.failed : ""}`}>
    <button type="button" className={styles.cardContent} onClick={onPreview} disabled={!onPreview || status !== "ready"} title={name} aria-label={`Preview ${name}`}>
      <span className={styles.fileIcon}>{status === "uploading" ? <LoaderCircle size={19} className={styles.spinner} /> : <Icon size={19} />}</span>
      <span className={styles.fileInfo}><strong>{name}</strong><span>{status === "uploading" ? "Reading file…" : status === "error" ? "Could not read file" : `${formatFileSize(size)}${pages ? ` · ${pages} pages` : ""}${truncated ? " · partial text" : " · ready"}`}</span></span>
    </button>
    {onRetry && status === "error" && <button type="button" className={styles.iconButton} onClick={onRetry} aria-label={`Retry ${name}`}><RotateCcw size={14} /></button>}
    {onRemove && <button type="button" className={styles.iconButton} onClick={onRemove} aria-label={`Remove ${name}`}><X size={15} /></button>}
    {error && <p role="alert" className={styles.cardError}>{error}</p>}
  </div>;
}
