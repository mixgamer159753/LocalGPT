"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Conversation, Message } from "@/types/chat";
import {
  fetchConversations,
  fetchConversation,
  updateConversationTitle as apiUpdateConversationTitle,
  deleteConversation as apiDeleteConversation,
} from "@/lib/api";

const WELCOME_ID = -1;

function uid() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const PIN_STORAGE_KEY = "localgpt:pinned-conversations";

function loadPinnedIds() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PIN_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [messages, setMessages] = useState<Message[]>([{
    id: WELCOME_ID,
    role: "assistant",
    content: "Hi. I am LocalGPT, your private AI assistant. How can I help?",
  }]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setPinnedIds(loadPinnedIds());
    return () => { mountedRef.current = false; };
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await fetchConversations();
      if (mountedRef.current) setConversations(list);
    } catch {
      if (mountedRef.current) setConversations([]);
    }
  }, []);

  useEffect(() => { void refreshConversations(); }, [refreshConversations]);

  const persistPins = useCallback((nextPinnedIds: number[]) => {
    setPinnedIds(nextPinnedIds);
    window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(nextPinnedIds));
  }, []);

  const togglePin = useCallback((id: number) => {
    persistPins(pinnedIds.includes(id) ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id]);
  }, [pinnedIds, persistPins]);

  const openConversation = useCallback(async (
    id: number,
    setModel: (m: string) => void,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    stopGeneration: () => void,
    welcomeMessage: { id: number; role: "user" | "assistant"; content: string }
  ) => {
    stopGeneration();
    try {
      const detail = await fetchConversation(id);
      setConversationId(detail.id);
      if (detail.model) setModel(detail.model);
      setMessages(
        detail.messages.length
          ? detail.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at }))
          : [welcomeMessage]
      );
    } catch (error) {
      setMessages([
        welcomeMessage,
        { id: uid(), role: "assistant", content: `Could not load that conversation. ${toErrorMessage(error)}` },
      ]);
    }
  }, []);

  const removeConversation = useCallback(async (id: number, newChat: () => void) => {
    try {
      await apiDeleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) newChat();
    } catch (error) {
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: `Could not delete that conversation. ${toErrorMessage(error)}` }]);
    }
  }, [conversationId]);

  const renameConversation = useCallback(async (id: number, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const updated = await apiUpdateConversationTitle(id, trimmed);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)));
    } catch (error) {
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: `Could not rename that conversation. ${toErrorMessage(error)}`, status: "error" }]);
    }
  }, []);

  const newChat = useCallback(() => {
    setMessages([{ id: WELCOME_ID, role: "assistant", content: "Hi. I am LocalGPT, your private AI assistant. How can I help?" }]);
    setConversationId(null);
  }, []);

  return {
    conversations,
    conversationId,
    setConversationId,
    messages,
    setMessages,
    pinnedIds,
    togglePin,
    refreshConversations,
    openConversation,
    removeConversation,
    renameConversation,
    newChat,
  };
}
