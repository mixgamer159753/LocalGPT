"use client";

import { useCallback, useEffect, useRef } from "react";
import { Message, UserSettings } from "@/types/chat";
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

export function useChat(settings: UserSettings = DEFAULT_SETTINGS) {
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
  } = useConversations();

  const conversationIdRef = useRef(conversationId);
  const settingsRef = useRef(settings);

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
    setConversationId,
    setMessages,
    refreshConversations,
  });

  const { sendMessage: streamSend, continueMessage: streamContinue, stopGeneration, isGenerating } = streaming;

  const sendMessage = useCallback(async (text: string, images?: string[]) => {
    await streamSend(text, images, messages, WELCOME_ID);
  }, [streamSend, messages]);

  const continueMessage = useCallback(async (aiMessageId: number) => {
    await streamContinue(aiMessageId, messages);
  }, [streamContinue, messages]);

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
    continueMessage,
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
  };
}
