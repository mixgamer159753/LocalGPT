"use client";

import { useRef, useCallback, useState } from "react";
import { apiHeaders, streamUrl } from "@/lib/api";
import { type ApiChatMessage, type ApiContentPart, FileAttachment, Message, UserSettings } from "@/types/chat";
import { parseResearchInfo } from "@/lib/research";
import { ResearchInfo } from "@/types/chat";

const STREAM_IDLE_TIMEOUT_MS = 300_000;
const MAX_HISTORY = 4;

type StreamEvent =
  | { type: "status"; message: string; phase?: "search" | "answer"; query?: string; stage?: string; depth?: "standard" | "deep" }
  | { type: "research"; research: ResearchInfo }
  | { type: "files"; attachments: FileAttachment[] }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "ping" }
  | { type: "done"; warning?: string };

function uid() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }
function toErrorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

function parseStreamEvent(line: string): StreamEvent {
  const event: unknown = JSON.parse(line);
  if (!event || typeof event !== "object" || !("type" in event)) {
    throw new Error("The backend sent an invalid stream event.");
  }

  const value = event as Record<string, unknown>;
  if (value.type === "status" && typeof value.message === "string") {
    return { type: "status", message: value.message,
      phase: value.phase === "search" || value.phase === "answer" ? value.phase : undefined,
      stage: typeof value.stage === "string" ? value.stage : undefined,
      depth: value.depth === "deep" ? "deep" : undefined,
      query: typeof value.query === "string" ? value.query : undefined };
  }
  if (value.type === "research") {
    return { type: "research", research: parseResearchInfo(value.research) };
  }
  if (value.type === "files" && Array.isArray(value.attachments)) {
    const attachments = value.attachments.filter((file) => file && typeof file.id === "string" && typeof file.name === "string" && typeof file.size === "number" && typeof file.chars === "number" && typeof file.kind === "string");
    return { type: "files", attachments };
  }
  if (value.type === "token" && typeof value.content === "string") {
    return { type: "token", content: value.content };
  }
  if (value.type === "error" && typeof value.message === "string") {
    return { type: "error", message: value.message };
  }
  if (value.type === "done") {
    return { type: "done", warning: typeof value.warning === "string" ? value.warning : undefined };
  }
  if (value.type === "ping") return { type: "ping" };

  throw new Error("The backend sent an unknown stream event.");
}

interface UseStreamingOptions {
  modelRef: React.MutableRefObject<string>;
  conversationIdRef: React.MutableRefObject<number | null>;
  settingsRef: React.MutableRefObject<UserSettings>;
  projectIdRef: React.MutableRefObject<number | null>;
  setConversationId: (id: number | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  refreshConversations: () => Promise<void>;
}

export function useStreaming(opts: UseStreamingOptions) {
  const { modelRef, conversationIdRef, settingsRef, projectIdRef, setConversationId, setMessages, refreshConversations } = opts;
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef(0);
  const generatingRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const doStream = useCallback(async (apiMessages: ApiChatMessage[], aiId: number, startedWithoutConversation: boolean) => {
    const controller = new AbortController();
    const streamId = ++streamIdRef.current;
    abortRef.current = controller;
    let timeoutId: number | null = null;
    let aiText = "";
    let timedOut = false;
    let completionWarning: string | undefined;
    const resetIdleTimeout = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, STREAM_IDLE_TIMEOUT_MS);
    };

    try {
      resetIdleTimeout();
      const response = await fetch(streamUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          ...apiHeaders(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: apiMessages.slice(-MAX_HISTORY),
          model: modelRef.current || undefined,
          temperature: settingsRef.current.temperature,
          max_tokens: settingsRef.current.maxTokens || 16384,
          thinking_effort: settingsRef.current.thinkingEffort,
          response_style: settingsRef.current.systemStyle,
          web_search_enabled: settingsRef.current.searchMode !== "off",
          web_search_mode: settingsRef.current.searchMode,
          research_depth: settingsRef.current.researchDepth,
          project_id: projectIdRef.current,
          conversation_id: conversationIdRef.current,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(typeof error?.detail === "string" ? error.detail : "The backend rejected the request.");
      }
      if (!response.body) throw new Error("This browser does not support streaming responses.");
      if (!response.headers.get("Content-Type")?.includes("application/x-ndjson")) {
        throw new Error("The backend returned an unsupported streaming format. Update the backend and frontend together.");
      }

      const headerConvId = response.headers.get("X-Conversation-Id");
      if (headerConvId) {
        const id = Number(headerConvId);
        if (Number.isFinite(id)) {
          setConversationId(id);
          conversationIdRef.current = id;
        }
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let encounteredError = false;
      let receivedDone = false;
      let buffer = "";

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        const event = parseStreamEvent(line);
        if (event.type === "ping") return;
        if (event.type === "status") {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, statusText: event.message, researchStage: event.stage ?? msg.researchStage, researchDepth: event.depth ?? msg.researchDepth, searchPhase: event.phase, searchQuery: event.query ?? msg.searchQuery, status: "streaming" } : msg));
        } else if (event.type === "research") {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, research: event.research, searchPhase: "answer" } : msg));
        } else if (event.type === "files") {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, attachments: event.attachments } : msg));
        } else if (event.type === "token") {
          aiText += event.content;
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, status: "streaming", statusText: undefined } : msg));
        } else if (event.type === "error") {
          encounteredError = true;
          if (startedWithoutConversation) {
            setConversationId(null);
            conversationIdRef.current = null;
          }
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, errorMessage: event.message, status: "error", statusText: undefined } : msg));
        } else {
          receivedDone = true;
          completionWarning = event.warning;
        }
      };

      while (!encounteredError && !receivedDone) {
        const { value, done } = await reader.read();
        resetIdleTimeout();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) consumeLine(buffer.replace(/\r$/, ""));
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0 && !encounteredError && !receivedDone) {
          consumeLine(buffer.slice(0, newline).replace(/\r$/, ""));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }

      if (encounteredError || receivedDone) {
        await reader.cancel().catch(() => {});
      }
      if (!encounteredError && !receivedDone) {
        throw new Error("The response stream ended before it was complete.");
      }

      if (!encounteredError) {
        if (aiText) {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, status: completionWarning ? "incomplete" : "complete", errorMessage: completionWarning, statusText: undefined } : msg));
        } else {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: "Error: The model returned an empty response.", status: "error", statusText: undefined } : msg));
          encounteredError = true;
          if (startedWithoutConversation) {
            setConversationId(null);
            conversationIdRef.current = null;
          }
        }
      }

      if (startedWithoutConversation && !encounteredError) {
        await refreshConversations();
      }
    } catch (error) {
      if (controller.signal.aborted && !timedOut) {
        if (startedWithoutConversation) {
          setConversationId(null);
          conversationIdRef.current = null;
        }
        setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: aiText || "Generation stopped.", status: "stopped", statusText: undefined } : m));
        return;
      }
      const msg = timedOut ? "The backend stopped responding for five minutes. Any text already received has been kept." : toErrorMessage(error);
      if (startedWithoutConversation) {
        setConversationId(null);
        conversationIdRef.current = null;
      }
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: aiText, errorMessage: msg, status: "error", statusText: undefined } : m));
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (streamIdRef.current === streamId) {
        abortRef.current = null;
        generatingRef.current = false;
        setIsGenerating(false);
      }
    }
  }, [conversationIdRef, modelRef, settingsRef, projectIdRef, setConversationId, setMessages, refreshConversations]);

  const sendMessage = useCallback(async (text: string, images: string[] | undefined, currentMessages: Message[], welcomeId: number, files?: FileAttachment[]) => {
    const trimmed = text.trim() || (files?.length ? "Summarize the attached files and highlight the key points." : "");
    if ((!trimmed && (!images || images.length === 0)) || generatingRef.current) return;

    stopGeneration();
    generatingRef.current = true;
    setIsGenerating(true);

    const userMessage: Message = { id: uid(), role: "user", content: trimmed, images, attachments: files, created_at: new Date().toISOString() };
    const aiId = uid();

    const apiMessages = [...currentMessages, userMessage]
      .filter((m) => m.id !== welcomeId && !m.content.startsWith("Error:") && (m.content.trim() || m.images?.length))
      .map(({ role, content, images, attachments }) => {
        const msg: ApiChatMessage = { role, content, attachments: attachments?.map((file) => file.id) };
        if (images && images.length > 0) {
          const parts: ApiContentPart[] = [];
          if (content) parts.push({ type: "text", text: content });
          for (const img of images) {
            parts.push({ type: "image_url", image_url: { url: img } });
          }
          msg.content = parts;
        }
        return msg;
      });

    setMessages((prev) => [...prev, userMessage, { id: aiId, role: "assistant", content: "", status: "streaming", statusText: "Thinking..." }]);
    await doStream(apiMessages, aiId, conversationIdRef.current === null);
  }, [doStream, stopGeneration, conversationIdRef, setMessages]);

  return { sendMessage, stopGeneration, isGenerating };
}
