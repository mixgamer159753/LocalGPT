"use client";

import { useCallback, useEffect, useRef } from "react";
import { FileAttachment, Message, UserSettings } from "@/types/chat";
import { useConversations } from "./useConversations";
import { useModel } from "./useModel";
import { useStreaming } from "./useStreaming";
import { DEFAULT_SETTINGS } from "./useSettings";

const WELCOME_ID = -1;

const WELCOME_MESSAGE: Message = {
  id: WELCOME_ID,
  role: "assistant",
  content: "Hi. I am LocalGPT, your private AI assistant. How can I help?",
};

export function useChat(settings: UserSettings = DEFAULT_SETTINGS, projectId: number | null = null) {
  const { model, setModel, modelRef } = useModel();

  const {
    conversations,
    conversationId,
    setConversationId,
    messages,
    setMessages,
    pinnedIds,
    togglePin,
    refreshConversations,
    openConversation: openConvApi,
    removeConversation: removeConvApi,
    renameConversation: renameConvApi,
    newChat: newChatApi,
    clearHistory,
  } = useConversations();

  const conversationIdRef = useRef(conversationId);
  const settingsRef = useRef(settings);
  const projectIdRef = useRef(projectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const streaming = useStreaming({
    modelRef,
    conversationIdRef,
    settingsRef,
    projectIdRef,
    setConversationId,
    setMessages,
    refreshConversations,
  });

  const { sendMessage: streamSend, stopGeneration, isGenerating } = streaming;

  const sendMessage = useCallback(async (text: string, images?: string[], files?: FileAttachment[]) => {
    await streamSend(text, images, messages, WELCOME_ID, files);
  }, [streamSend, messages]);

  const newChat = useCallback(() => {
    stopGeneration();
    newChatApi();
  }, [stopGeneration, newChatApi]);

  const openConversation = useCallback(async (id: number) => {
    await openConvApi(id, setModel, setMessages, stopGeneration, WELCOME_MESSAGE);
  }, [openConvApi, setModel, setMessages, stopGeneration]);

  const removeConversation = useCallback(async (id: number) => {
    await removeConvApi(id, newChat);
  }, [removeConvApi, newChat]);

  const renameConversation = useCallback(async (id: number, title: string) => {
    await renameConvApi(id, title);
  }, [renameConvApi]);

  return {
    messages,
    sendMessage,
    stopGeneration,
    loading: isGenerating,
    newChat,
    model,
    setModel,
    conversations,
    conversationId,
    openConversation,
    removeConversation,
    renameConversation,
    pinnedIds,
    togglePin,
    refreshConversations,
    clearHistory,
  };
}
