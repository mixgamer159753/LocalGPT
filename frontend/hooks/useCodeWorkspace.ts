"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CodeProject, safeFileName, WorkspaceFile } from "@/lib/code-workspace";

const STORAGE_KEY = "localgpt:code-drafts:v1";
interface Draft { files: WorkspaceFile[]; updated: number }
interface Session extends CodeProject { originalFiles: WorkspaceFile[] }

function loadDrafts(): Record<string, Draft> {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function validFiles(value: unknown): value is WorkspaceFile[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((file) => file &&
    typeof file.name === "string" && safeFileName(file.name) && typeof file.content === "string" && typeof file.language === "string");
}

function saveDraft(session: Session): boolean {
  try {
    const drafts = loadDrafts();
    drafts[session.id] = { files: session.files, updated: Date.now() };
    const recent = Object.fromEntries(Object.entries(drafts).sort(([, a], [, b]) => (b?.updated || 0) - (a?.updated || 0)).slice(0, 8));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    return true;
  } catch { return false; }
}

export function useCodeWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [visible, setVisible] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "session">("saved");
  const sessionRef = useRef<Session | null>(null);

  const openWorkspace = useCallback((project: CodeProject) => {
    if (sessionRef.current) saveDraft(sessionRef.current);
    const draft = loadDrafts()[project.id];
    setSession((current) => {
      if (current?.id === project.id) return { ...current, activeFile: project.activeFile };
      const files = validFiles(draft?.files) ? draft.files : project.files;
      return { ...project, files, originalFiles: project.files,
        activeFile: files.some((file) => file.name === project.activeFile) ? project.activeFile : files[0].name };
    });
    setVisible(true);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    if (!session) return;
    const flush = () => { saveDraft(session); };
    window.addEventListener("pagehide", flush);
    const timer = window.setTimeout(() => {
      setSaveState(saveDraft(session) ? "saved" : "session");
    }, 500);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", flush); };
  }, [session]);

  const updateFile = useCallback((name: string, content: string) => {
    setSaveState("saving");
    setSession((current) => current ? { ...current, files: current.files.map((file) => file.name === name ? { ...file, content } : file) } : current);
  }, []);
  const selectFile = useCallback((name: string) => {
    setSession((current) => current ? { ...current, activeFile: name } : current);
  }, []);
  const resetFiles = useCallback(() => {
    setSaveState("saving");
    setSession((current) => current ? { ...current, files: current.originalFiles } : current);
  }, []);
  const closeWorkspace = useCallback(() => {
    if (sessionRef.current) setSaveState(saveDraft(sessionRef.current) ? "saved" : "session");
    setVisible(false);
  }, []);
  return { session, visible, saveState, openWorkspace, updateFile, selectFile, resetFiles, closeWorkspace };
}
