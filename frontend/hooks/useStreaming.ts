"use client";

import { useRef, useCallback, useState } from "react";
import { STREAM_URL } from "@/lib/api";
import { type ApiContent, type ApiContentPart, Message, UserSettings } from "@/types/chat";

const ERROR_PREFIX = "[LOCALGPT_ERROR]";
const STATUS_PREFIX = "[LOCALGPT_STATUS]";
const STREAM_TIMEOUT_MS = 300_000;
const MAX_HISTORY = 4;

function uid() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }
function toErrorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

function splitStatusMarkers(chunk: string) {
  const lines = chunk.split("\n");
  const content: string[] = [];
  const statuses: string[] = [];

  for (const line of lines) {
    if (line.startsWith(STATUS_PREFIX)) statuses.push(line.slice(STATUS_PREFIX.length).trim());
    else content.push(line);
  }

  return { content: content.join("\n"), status: statuses.at(-1) ?? undefined };
}

function splitErrorMarker(chunk: string) {
  const index = chunk.indexOf(ERROR_PREFIX);
  if (index < 0) {
    return null;
  }

  return {
    before: chunk.slice(0, index),
    message: chunk.slice(index + ERROR_PREFIX.length).trim(),
  };
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
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: apiMessages.slice(-MAX_HISTORY),
          model: modelRef.current,
          temperature: settingsRef.current.temperature,
          max_tokens: settingsRef.current.maxTokens || 16384,
          response_style: settingsRef.current.systemStyle,
          web_search_enabled: settingsRef.current.webSearch,
          conversation_id: conversationIdRef.current,
        }),
      });

      if (!response.ok) throw new Error("The backend rejected the request.");
      if (!response.body) throw new Error("This browser does not support streaming responses.");

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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const errorMarker = splitErrorMarker(chunk);
        if (errorMarker) {
          encounteredError = true;
          const parsedBeforeError = splitStatusMarkers(errorMarker.before);
          if (parsedBeforeError.content) {
            aiText += parsedBeforeError.content;
          }
          const errMsg = errorMarker.message || "The model returned an error.";
          if (startedWithoutConversation) {
            setConversationId(null);
            conversationIdRef.current = null;
          }
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: `Error: ${errMsg}`, status: "error" } : msg));
          break;
        }

        const parsed = splitStatusMarkers(chunk);
        if (parsed.status) {
          setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, statusText: parsed.status, status: "streaming" } : msg));
        }
        if (!parsed.content) continue;
        if (encounteredError) continue;

        aiText += parsed.content;
        setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, status: "streaming", statusText: undefined } : msg));
      }

      if (!encounteredError && aiText) {
        setMessages((prev) => prev.map((msg) => msg.id === aiId ? { ...msg, content: aiText, status: "complete", statusText: undefined } : msg));
      }

      if (startedWithoutConversation && !encounteredError) {
        await refreshConversations();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: aiText || "Generation stopped.", status: aiText ? "stopped" : "stopped", statusText: undefined } : m));
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

  const continueMessage = useCallback(async (aiMessageId: number, currentMessages: Message[]) => {
    if (generatingRef.current) return;

    const idx = currentMessages.findIndex((m) => m.id === aiMessageId);
    if (idx < 0) return;

    const partial = currentMessages[idx].content;
    if (!partial || partial.startsWith("Error:")) return;

    const lastUser = [...currentMessages.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    stopGeneration();
    generatingRef.current = true;
    setIsGenerating(true);

    const continuePrompt = `Continue from where the previous response stopped. Do not repeat anything already written. Continue from exactly where it left off. Previous response ended with:\n\n${partial.slice(-500)}`;
    const continueMsg: Message = { id: uid(), role: "user", content: continuePrompt, created_at: new Date().toISOString() };
    const aiId = uid();

    setMessages((prev) => [...prev, continueMsg, { id: aiId, role: "assistant", content: "", status: "streaming", statusText: "Thinking..." }]);
    await doStream(
      [{ role: "user", content: lastUser.content }, { role: "assistant", content: partial }, { role: "user", content: continuePrompt }],
      aiId,
      false,
    );
  }, [doStream, stopGeneration, setMessages]);

  return { sendMessage, continueMessage, stopGeneration, generating: generatingRef, isGenerating };
}
