import { describeLanguage } from "./code-highlighting";

export interface WorkspaceFile { name: string; language: string; content: string }
export interface CodeProject { id: string; title: string; files: WorkspaceFile[]; activeFile: string }

const extensions: Record<string, string> = { html: "html", htm: "html", css: "css", js: "javascript", mjs: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", py: "python", json: "json", md: "markdown", svg: "svg" };

export function safeFileName(value: string): string | null {
  const name = value.trim().replace(/\\/g, "/");
  if (!name || name.length > 160 || name.startsWith("/") || /[<>:"|?*\x00-\x1f]/.test(name)) return null;
  if (name.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return name;
}

function hintedName(info: string, previous: string): string | null {
  const explicit = info.match(/(?:filename|file|title)=["']?([^\s"']+)/i)?.[1];
  const heading = previous.match(/(?:^|[\s`])((?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]{1,10})(?:[`\s:]|$)/i)?.[1];
  const first = info.split(/\s+/)[0];
  return safeFileName(explicit || (/\.[a-z0-9]+$/i.test(first) ? first : "") || heading || "");
}

function defaultName(language: string): string {
  if (language === "html") return "index.html";
  if (language === "css") return "styles.css";
  if (["js", "javascript"].includes(language)) return "script.js";
  return describeLanguage(language).filename.replace(/^snippet/, "main");
}

export function extractCodeProject(markdown: string, selectedCode?: string, selectedLanguage?: string): CodeProject | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const files: WorkspaceFile[] = [];
  const used = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    const fence = lines[index].match(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/);
    if (!fence) continue;
    const marker = fence[1];
    const info = fence[2].trim();
    const previous = lines.slice(Math.max(0, index - 3), index).filter((line) => line.trim()).at(-1) || "";
    const closing = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[\\t ]*$`);
    const start = ++index;
    while (index < lines.length && !closing.test(lines[index])) index++;
    const content = lines.slice(start, index).join("\n");
    if (!content.trim()) continue;
    let language = info.split(/\s+/)[0].toLowerCase();
    let name = hintedName(info, previous);
    if (name) language = extensions[name.split(".").at(-1)!.toLowerCase()] || language;
    if (!language && /<!doctype html|<html[\s>]/i.test(content)) language = "html";
    language = language || "text";
    name = name || defaultName(language);
    const base = name;
    let suffix = 2;
    while (used.has(name)) {
      const dot = base.lastIndexOf(".");
      name = dot >= 0 ? `${base.slice(0, dot)}-${suffix++}${base.slice(dot)}` : `${base}-${suffix++}`;
    }
    used.add(name);
    files.push({ name, language, content });
  }
  if (!files.length && selectedCode?.trim()) {
    const language = selectedLanguage || (/<!doctype html|<html[\s>]/i.test(selectedCode) ? "html" : "text");
    files.push({ name: defaultName(language), language, content: selectedCode });
  }
  if (!files.length) return null;
  // The same generated code restores its draft even after reopening a saved chat.
  let hash = 2166136261;
  const identity = JSON.stringify(files);
  for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  const title = markdown.match(/^#{1,3}\s+(.+)$/m)?.[1]?.replace(/[*`]/g, "").trim().slice(0, 70) || "Code workspace";
  return { id: `code-${(hash >>> 0).toString(16)}`, title, files,
    activeFile: files.find((file) => file.content.trim() === selectedCode?.trim())?.name || files[0].name };
}

export function previewEntry(files: WorkspaceFile[]) {
  return files.find((file) => file.name === "index.html") || files.find((file) => file.language === "html" || /\.html?$/i.test(file.name));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadProject(files: WorkspaceFile[], title: string) {
  const { zipSync, strToU8 } = await import("fflate");
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of files) {
    if (!safeFileName(file.name)) throw new Error("A file has an invalid name.");
    entries[file.name] = strToU8(file.content);
  }
  const bytes = zipSync(entries, { level: 0 });
  const data = new Uint8Array(bytes.length);
  data.set(bytes);
  downloadBlob(new Blob([data.buffer], { type: "application/zip" }), `${title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "project"}.zip`);
}
