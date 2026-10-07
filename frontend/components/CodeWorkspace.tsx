"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, Check, Code2, Download, Eye, FileCode2, Globe2, LoaderCircle, Maximize2, Minimize2, Monitor, Play, RotateCcw, Smartphone, SquareSplitHorizontal, X } from "lucide-react";
import { CodeProject, downloadBlob, downloadProject, previewEntry, WorkspaceFile } from "@/lib/code-workspace";
import { describeLanguage, highlightLines } from "@/lib/code-highlighting";
import styles from "./CodeWorkspace.module.css";
import syntaxStyles from "./CodeBlock.module.css";

interface Props {
  project: CodeProject;
  originalFiles: WorkspaceFile[];
  saveState: "saved" | "saving" | "session";
  onClose: () => void;
  onSelectFile: (name: string) => void;
  onUpdateFile: (name: string, content: string) => void;
  onReset: () => void;
}

type View = "split" | "code" | "preview";

export default function CodeWorkspace({ project, originalFiles, saveState, onClose, onSelectFile, onUpdateFile, onReset }: Props) {
  const [view, setView] = useState<View>("split");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [expanded, setExpanded] = useState(false);
  const [externalAssets, setExternalAssets] = useState(false);
  const [entryName, setEntryName] = useState(previewEntry(project.files)?.name || "");
  const [preview, setPreview] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [runId, setRunId] = useState(0);
  const [downloadState, setDownloadState] = useState<"idle" | "busy" | "error">("idle");
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 300 });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef("");
  const file = project.files.find((item) => item.name === project.activeFile) || project.files[0];
  const lineNumbers = useMemo(() => file.content.split("\n").map((_, index) => index + 1).join("\n"), [file.content]);
  const highlighted = useMemo(() => highlightLines(file.content, file.language), [file.content, file.language]);
  const hasPreview = project.files.some((item) => ["html", "css", "javascript", "js"].includes(item.language) || /\.(?:html?|css|js)$/i.test(item.name));
  const edited = JSON.stringify(project.files) !== JSON.stringify(originalFiles);
  const referencesRemoteAssets = project.files.some((item) => /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//i.test(item.content));
  const needsBuild = project.files.some((item) => ["jsx", "tsx", "typescript", "ts", "scss"].includes(item.language));
  const frameWidth = device === "mobile" ? 390 : 1280;
  const frameScale = Math.min(1, Math.max(1, canvasSize.width) / frameWidth);
  const frameHeight = Math.max(1, Math.round(canvasSize.height / frameScale));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setCanvasSize({ width: Math.max(1, canvas.clientWidth - 20), height: Math.max(1, canvas.clientHeight - 20) }));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [view, hasPreview]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const media = window.matchMedia("(max-width: 1279px)");
    const open = () => {
      if (dialog.open) dialog.close();
      if (media.matches || expanded) dialog.showModal(); else dialog.show();
    };
    open();
    media.addEventListener("change", open);
    return () => {
      media.removeEventListener("change", open);
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [expanded]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== "localgpt-preview-error" ||
          event.data.channel !== channelRef.current || typeof event.data.message !== "string") return;
      const message = event.data.message.slice(0, 600);
      setErrors((current) => current.includes(message) ? current : [...current, message].slice(-5));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (!hasPreview) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { buildPreview } = await import("@/lib/code-preview");
        if (cancelled) return;
        const channel = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const html = buildPreview(project.files, entryName, externalAssets, channel);
        channelRef.current = channel;
        setErrors([]);
        setPreview(html);
      } catch {
        if (!cancelled) setErrors(["The preview could not be built. Check the HTML and file references."]);
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [project.files, entryName, externalAssets, runId, hasPreview]);

  async function exportProject() {
    setDownloadState("busy");
    try { await downloadProject(project.files, project.title); setDownloadState("idle"); }
    catch { setDownloadState("error"); }
  }

  function handleEditorKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault(); setRunId((current) => current + 1); return;
    }
    // Shift+Tab keeps the editor keyboard-accessible by moving focus out.
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart, end = input.selectionEnd;
      if (start !== end) {
        const lineStart = file.content.lastIndexOf("\n", start - 1) + 1;
        const selected = file.content.slice(lineStart, end).split("\n");
        onUpdateFile(file.name, file.content.slice(0, lineStart) + selected.map((line) => "  " + line).join("\n") + file.content.slice(end));
        window.requestAnimationFrame(() => input.setSelectionRange(start + 2, end + selected.length * 2));
      } else {
        onUpdateFile(file.name, file.content.slice(0, start) + "  " + file.content.slice(end));
        window.requestAnimationFrame(() => input.setSelectionRange(start + 2, start + 2));
      }
    }
  }

  return (
    <dialog ref={dialogRef} className={`${styles.workspace} ${expanded ? styles.expanded : ""}`} aria-labelledby="workspace-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className={styles.header}>
        <div className={styles.identity}><span className={styles.logo}><Braces size={18} /></span><div><span className={styles.eyebrow}>Coding workspace</span><h2 id="workspace-title" title={project.title}>{project.title}</h2></div></div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => void exportProject()} className={styles.download} disabled={downloadState === "busy"}>
            {downloadState === "busy" ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <Download size={14} />}<span>Project ZIP</span>
          </button>
          <button type="button" className={styles.iconButton} onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Restore workspace size" : "Expand workspace"} title={expanded ? "Restore size" : "Expand"}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close coding workspace" title="Close (Escape)"><X size={17} /></button>
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.views} aria-label="Workspace view">
          {([{ value: "code", label: "Code", icon: Code2 }, { value: "split", label: "Split", icon: SquareSplitHorizontal }, { value: "preview", label: "Preview", icon: Eye }] as const).map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}><Icon size={13} /><span>{label}</span></button>
          ))}
        </div>
        <button type="button" className={styles.reset} disabled={!edited} onClick={() => { if (window.confirm("Replace your workspace edits with the original generated files?")) onReset(); }} title="Restore original generated files"><RotateCcw size={13} /><span>Reset edits</span></button>
      </div>

      <div className={`${styles.content} ${view === "split" ? styles.split : ""}`}>
        {view !== "preview" && (
          <section className={styles.code} aria-label="Code editor">
            <div className={styles.fileTabs} aria-label="Project files">
              {project.files.map((item) => <button type="button" key={item.name} aria-pressed={file.name === item.name} onClick={() => onSelectFile(item.name)} title={item.name}><FileCode2 size={13} /><span>{item.name}</span></button>)}
            </div>
            <div className={styles.editor}>
              <div className={styles.gutter} ref={gutterRef} aria-hidden="true"><pre>{lineNumbers}</pre></div>
              <div className={styles.editingSurface} key={file.name}>
                <pre className={styles.highlight} ref={highlightRef} aria-hidden="true"><code className={syntaxStyles.source}>{highlighted.map((tokens, index) => <span key={index}>{tokens.map((token, tokenIndex) => <span className={token.className} key={tokenIndex}>{token.text}</span>)}{"\n"}</span>)}</code></pre>
                <textarea ref={editorRef} value={file.content} onChange={(event) => onUpdateFile(file.name, event.target.value)}
                  onKeyDown={handleEditorKey} onScroll={(event) => {
                    if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                    if (highlightRef.current) { highlightRef.current.scrollTop = event.currentTarget.scrollTop; highlightRef.current.scrollLeft = event.currentTarget.scrollLeft; }
                  }}
                  aria-label={`Edit ${file.name}`} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" />
              </div>
            </div>
            <div className={styles.editorFooter}>
              <span>{describeLanguage(file.language).label} · {file.content.split("\n").length} lines</span>
              <button type="button" onClick={() => downloadBlob(new Blob([file.content], { type: "text/plain;charset=utf-8" }), file.name.split("/").at(-1)!)}><Download size={11} /> File</button>
            </div>
          </section>
        )}

        {view !== "code" && (
          <section className={styles.preview} aria-label="Live preview">
            <div className={styles.previewToolbar}>
              <span className={styles.previewLabel}><span className={styles.liveDot} />Live preview</span>
              <div className={styles.devices} aria-label="Preview device">
                <button type="button" aria-pressed={device === "desktop"} aria-label="Desktop preview" onClick={() => setDevice("desktop")} title="Desktop"><Monitor size={14} /></button>
                <button type="button" aria-pressed={device === "mobile"} aria-label="Mobile preview" onClick={() => setDevice("mobile")} title="Mobile"><Smartphone size={14} /></button>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setRunId((value) => value + 1)} disabled={!hasPreview} aria-label="Reload preview" title="Reload (Ctrl + Enter)"><Play size={13} /></button>
            </div>
            {hasPreview ? (
              <>
                {project.files.filter((item) => /\.html?$/i.test(item.name)).length > 1 && <label className={styles.entry}>Page<select value={entryName} onChange={(event) => setEntryName(event.target.value)}>{project.files.filter((item) => /\.html?$/i.test(item.name)).map((item) => <option key={item.name}>{item.name}</option>)}</select></label>}
                <div ref={canvasRef} className={`${styles.canvas} ${device === "mobile" ? styles.mobile : ""}`}>
                  {/* The preview intentionally has no allow-same-origin permission. */}
                  <div className={styles.frame} style={{ width: frameWidth * frameScale, height: canvasSize.height }}>
                    <iframe ref={iframeRef} title={`${project.title} live preview`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview}
                      style={{ width: frameWidth, height: frameHeight, transform: `scale(${frameScale})` }} />
                  </div>
                </div>
                {errors.length > 0 && <div className={styles.errors} role="status"><strong>Console</strong>{errors.map((error) => <p key={error}>{error}</p>)}</div>}
                {needsBuild && <p className={styles.notice}>JSX, TypeScript, and SCSS need a build tool. Download the project to run them locally.</p>}
                {!externalAssets && referencesRemoteAssets && <p className={styles.notice}>This page uses remote assets. Enable External assets to load its images, fonts, or libraries.</p>}
                <div className={styles.previewFooter}><label title="Allow HTTPS images, fonts, stylesheets and scripts. API requests remain disabled."><input type="checkbox" checked={externalAssets} onChange={(event) => setExternalAssets(event.target.checked)} /><Globe2 size={12} /> External assets</label><span>{frameWidth}px · Updates as you type</span></div>
              </>
            ) : (
              <div className={styles.empty}><Code2 size={30} /><h3>This project needs its own runtime</h3><p>Live preview supports HTML, CSS, and plain JavaScript. You can edit these files and download the project to run it locally.</p></div>
            )}
          </section>
        )}
      </div>

      <footer className={styles.footer}>
        <span role="status">{saveState === "saved" ? <Check size={12} /> : null}{saveState === "saving" ? "Saving draft…" : saveState === "saved" ? "Draft saved in this browser" : "Draft kept in this session"}</span>
        <span>{downloadState === "error" ? "Download failed. Please try again." : `${project.files.length} ${project.files.length === 1 ? "file" : "files"}`}</span>
      </footer>
    </dialog>
  );
}
