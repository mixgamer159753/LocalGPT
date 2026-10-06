"use client";

import { useRef, useCallback, useState } from "react";
import { API_HEADERS, STREAM_URL } from "@/lib/api";
import { type ApiContent, type ApiContentPart, Message, UserSettings } from "@/types/chat";
import { parseResearchInfo } from "@/lib/research";
import { ResearchInfo } from "@/types/chat";

const STREAM_TIMEOUT_MS = 300_000;
const MAX_HISTORY = 4;

type StreamEvent =
  | { type: "status"; message: string; phase?: "search" | "answer"; query?: string }
  | { type: "research"; research: ResearchInfo }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

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
      query: typeof value.query === "string" ? value.query : undefined };
  }
  if (value.type === "research") {
    return { type: "research", research: parseResearchInfo(value.research) };
  }
  if (value.type === "token" && typeof value.content === "string") {
    return { type: "token", content: value.content };
  }
  if (value.type === "error" && typeof value.message === "string") {
    return { type: "error", message: value.message };
  }
  if (value.type === "done") {
    return { type: "done" };
  }

  throw new Error("The backend sent an unknown stream event.");
}

interface UseStreamingOptions {
  modelRef: React.MutableRefObject<string>;
  conversationIdRef: React.MutableRefObject<number | null>;
  settingsRef: React.MutableRefObject<UserSettings>;
  setConversationId: (id: number | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  refreshConversations: () => Promise<void>;
}

export function useStreaming(opts: UseStreamingOptions) {
  const { modelRef, conversationIdRef, settingsRef, setConversationId, setMessages, refreshConversations } = opts;
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef(0);
  const generatingRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const doStream = useCallback(async (apiMessages: { role: "user" | "assistant"; content: ApiContent }[], aiId: number, startedWithoutConversation: boolean) => {
    const controller = new AbortController();
    const streamId = ++streamIdRef.current;
    abortRef.current = controller;
    let timeoutId: number | null = null;
    let aiText = "";

    try {
      timeoutId = window.setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
      const response = await fetch(STREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          ...API_HEADERS,
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
          conversation_id: conversationIdRef.current,
        }),
      });

      if (!response.ok) throw new Error("The backend rejected the request.");
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
        if (event.type === "status") {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, statusText: event.message, searchPhase: event.phase, searchQuery: event.query ?? msg.searchQuery, status: "streaming" } : msg));
        } else if (event.type === "research") {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, research: event.research, searchPhase: "answer" } : msg));
        } else if (event.type === "token") {
          aiText += event.content;
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, status: "streaming", statusText: undefined } : msg));
        } else if (event.type === "error") {
          encounteredError = true;
          if (startedWithoutConversation) {
            setConversationId(null);
            conversationIdRef.current = null;
          }
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: `Error: ${event.message}`, status: "error", statusText: undefined } : msg));
        } else {
          receivedDone = true;
        }
      };

      while (!encounteredError && !receivedDone) {
        const { value, done } = await reader.read();
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

      if (encounteredError) {
        await reader.cancel().catch(() => {});
      }
      if (!encounteredError && !receivedDone) {
        throw new Error("The response stream ended before it was complete.");
      }

      if (!encounteredError) {
        if (aiText) {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, status: "complete", statusText: undefined } : msg));
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
      if (error instanceof DOMException && error.name === "AbortError") {
        if (startedWithoutConversation) {
          setConversationId(null);
          conversationIdRef.current = null;
        }
        setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: aiText || "Generation stopped.", status: "stopped", statusText: undefined } : m));
        return;
      }
      const msg = toErrorMessage(error);
      if (startedWithoutConversation) {
        setConversationId(null);
        conversationIdRef.current = null;
      }
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: `Error: ${msg}`, status: "error", statusText: undefined } : m));
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (streamIdRef.current === streamId) {
        abortRef.current = null;
        generatingRef.current = false;
        setIsGenerating(false);
      }
    }
  }, [conversationIdRef, modelRef, settingsRef, setConversationId, setMessages, refreshConversations]);

  const sendMessage = useCallback(async (text: string, images: string[] | undefined, currentMessages: Message[], welcomeId: number) => {
    const trimmed = text.trim();
    if ((!trimmed && (!images || images.length === 0)) || generatingRef.current) return;

    stopGeneration();
    generatingRef.current = true;
    setIsGenerating(true);

    const userMessage: Message = { id: uid(), role: "user", content: trimmed, images, created_at: new Date().toISOString() };
    const aiId = uid();

    const apiMessages = [...currentMessages, userMessage]
      .filter((m) => m.id !== welcomeId)
      .map(({ role, content, images }) => {
        const msg: { role: "user" | "assistant"; content: ApiContent } = { role, content };
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
