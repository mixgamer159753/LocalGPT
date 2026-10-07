"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Code2, Copy, Download, Maximize2, PanelRightOpen, WrapText, X } from "lucide-react";
import { describeLanguage, highlightLines } from "@/lib/code-highlighting";
import styles from "./CodeBlock.module.css";

interface Props {
  code: string;
  language?: string;
  onOpenWorkspace?: () => void;
}

const CodeSource = memo(function CodeSource({ code, language }: { code: string; language: string }) {
  const lines = useMemo(() => highlightLines(code, language), [code, language]);

  return (
    <pre className={styles.pre}>
      <code className={styles.source}>
        {lines.map((tokens, index) => (
          <span className={styles.line} key={index}>
            <span className={styles.lineNumber} aria-hidden="true">{index + 1}</span>
            <span className={styles.lineContent}>
              {tokens.map((token, tokenIndex) => (
                <span className={token.className} key={tokenIndex}>{token.text}</span>
              ))}
              {index < lines.length - 1 ? "\n" : null}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
});

export default function CodeBlock({ code, language = "", onOpenWorkspace }: Props) {
  const [wrapped, setWrapped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();
  const { label, filename } = describeLanguage(language);
  const lineCount = code.split("\n").length;

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  async function copyCode() {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2400);
  }

  function downloadCode() {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderPanel(fullscreen: boolean) {
    const id = `${panelId}-${fullscreen ? "expanded" : "inline"}`;
    return (
      <>
        <div className={styles.toolbar}>
          <div className={styles.identity}>
            <span className={styles.fileIcon}><Code2 size={17} aria-hidden="true" /></span>
            <div className={styles.fileDetails}>
              <span className={styles.filename} id={`${id}-title`} title={filename}>{filename}</span>
              <span className={styles.language} title={label}>{label}</span>
            </div>
          </div>
          <div className={styles.actions}>
            {onOpenWorkspace && <button type="button" className={styles.workspaceButton} disabled={!code.trim()}
              onClick={() => { setExpanded(false); onOpenWorkspace(); }}
              title="Edit files, preview the page, and download the project" aria-label="Open coding workspace">
              <PanelRightOpen size={14} /><span>Workspace</span>
            </button>}
            <button
              type="button" className={styles.iconButton}
              onClick={() => setWrapped((value) => !value)} aria-pressed={wrapped}
              aria-controls={`${id}-source`} aria-label="Wrap lines" title="Wrap lines"
            ><WrapText size={16} /></button>
            <button
              type="button" className={styles.iconButton} onClick={downloadCode}
              aria-label={`Download ${filename}`} title={`Download ${filename}`}
            ><Download size={16} /><span className={styles.downloadLabel}>Download</span></button>
            <button
              type="button" className={styles.copyButton} onClick={() => void copyCode()}
              aria-label={copyState === "copied" ? "Code copied" : "Copy code"}
            >
              {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
              <span>{copyState === "copied" ? "Copied" : "Copy"}</span>
            </button>
            <span className={styles.divider} aria-hidden="true" />
            <button
              type="button" className={styles.iconButton} onClick={() => setExpanded(!fullscreen)}
              aria-label={fullscreen ? "Close expanded code" : "Expand code"}
              title={fullscreen ? "Close (Escape)" : "Expand code"}
              aria-haspopup={fullscreen ? undefined : "dialog"}
            >{fullscreen ? <X size={17} /> : <Maximize2 size={15} />}</button>
          </div>
        </div>
        <div
          className={`${styles.viewport} ${wrapped ? styles.wrapped : ""}`}
          id={`${id}-source`} tabIndex={0} role="region" aria-label={`${label} source code`}
        >
          <CodeSource code={code} language={language} />
        </div>
        <div className={styles.footer}>
          <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          <span className={styles.feedback} role="status" aria-live="polite">
            {copyState === "copied" ? "Copied to clipboard" : copyState === "error" ? "Couldn't copy. Select the code to copy manually." : ""}
          </span>
          <span className={styles.wrapStatus}>{wrapped ? "Lines wrapped" : "No wrap"}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`not-prose ${styles.panel}`}>{renderPanel(false)}</div>
      {expanded && createPortal(
        <dialog
          ref={dialogRef} className={styles.dialog} onClose={() => setExpanded(false)}
          aria-labelledby={`${panelId}-expanded-title`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <div className={`${styles.panel} ${styles.fullscreen}`}>{renderPanel(true)}</div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
