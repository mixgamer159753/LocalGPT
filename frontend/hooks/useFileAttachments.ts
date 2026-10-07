"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage, deleteDraftDocument, uploadDocument } from "@/lib/api";
import { FileAttachment } from "@/types/chat";

export const FILE_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.tsv,.json,.jsonl,.py,.js,.jsx,.ts,.tsx,.html,.htm,.css,.scss,.yaml,.yml,.xml,.sql,.sh,.c,.cpp,.h,.java,.rs,.go,.rb,.php,.toml,.ini,.log,.tex,.ipynb";
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface DraftFile {
  key: string;
  file: File;
  status: "uploading" | "ready" | "error";
  attachment?: FileAttachment;
  error?: string;
}

export function useFileAttachments() {
  const [files, setFiles] = useState<DraftFile[]>([]);
  const filesRef = useRef<DraftFile[]>([]);
  const requestsRef = useRef(new Map<string, AbortController>());

  const update = useCallback((fn: (previous: DraftFile[]) => DraftFile[]) => {
    filesRef.current = fn(filesRef.current);
    setFiles(filesRef.current);
  }, []);

  const upload = useCallback(async (draft: DraftFile) => {
    const controller = new AbortController();
    requestsRef.current.set(draft.key, controller);
    update((previous) => previous.map((file) => file.key === draft.key ? { ...file, status: "uploading", error: undefined } : file));
    try {
      const attachment = await uploadDocument(draft.file, controller.signal);
      if (!filesRef.current.some((file) => file.key === draft.key)) {
        void deleteDraftDocument(attachment.id).catch(() => {});
        return;
      }
      update((previous) => previous.map((file) => file.key === draft.key ? { ...file, status: "ready", attachment } : file));
    } catch (error) {
      if (!controller.signal.aborted) update((previous) => previous.map((file) => file.key === draft.key ? { ...file, status: "error", error: apiErrorMessage(error, "Could not read this file. Try another format.") } : file));
    } finally {
      requestsRef.current.delete(draft.key);
    }
  }, [update]);

  const add = useCallback((selected: File[]) => {
    const drafts = selected.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, status: "uploading" as const }));
    update((previous) => [...previous, ...drafts]);
    for (const draft of drafts) void upload(draft);
  }, [update, upload]);

  const remove = useCallback((key: string) => {
    requestsRef.current.get(key)?.abort();
    const attachment = filesRef.current.find((file) => file.key === key)?.attachment;
    update((previous) => previous.filter((file) => file.key !== key));
    if (attachment) void deleteDraftDocument(attachment.id).catch(() => {});
  }, [update]);

  const clear = useCallback((sent = false) => {
    for (const controller of requestsRef.current.values()) controller.abort();
    if (!sent) for (const draft of filesRef.current) {
      if (draft.attachment) void deleteDraftDocument(draft.attachment.id).catch(() => {});
    }
    update(() => []);
  }, [update]);

  useEffect(() => () => {
    for (const controller of requestsRef.current.values()) controller.abort();
    for (const draft of filesRef.current) if (draft.attachment) void deleteDraftDocument(draft.attachment.id).catch(() => {});
    filesRef.current = [];
  }, []);

  return { files, add, remove, clear, retry: upload };
}
