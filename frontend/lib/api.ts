import axios from "axios";
import { Conversation, ConversationDetail, HealthInfo, ModelInfo } from "@/types/chat";

const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "8000";

export function getApiBaseUrl() {
  // Hosted frontends need a public backend origin (for example, an HTTPS tunnel).
  // NEXT_PUBLIC_ values are shipped to browsers, so this must never hold a secret.
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
  }

  return `http://127.0.0.1:${BACKEND_PORT}`;
}

export const API_BASE_URL = getApiBaseUrl();
export const STREAM_URL = `${API_BASE_URL}/api/chat/stream`;

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
});

api.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config || config.__localgptRetried || config.method?.toLowerCase() !== "get") {
    return Promise.reject(error);
  }

  config.__localgptRetried = true;
  await new Promise((resolve) => window.setTimeout(resolve, 500));
  return api(config);
});

export async function fetchHealth(): Promise<HealthInfo> {
  const { data } = await api.get<HealthInfo>("/health");
  return data;
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const { data } = await api.get<ModelInfo[]>("/models");
  return data;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>("/conversations");
  return data;
}

export async function fetchConversation(id: number): Promise<ConversationDetail> {
  const { data } = await api.get<ConversationDetail>(`/conversations/${id}`);
  return data;
}

export async function createConversation(model?: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>("/conversations", { model });
  return data;
}

export async function updateConversationTitle(id: number, title: string): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/conversations/${id}`, { title });
  return data;
}

export async function deleteConversation(id: number): Promise<void> {
  await api.delete(`/conversations/${id}`);
}

export interface Memory { id: number; key: string; value: string; created_at: string; }

export async function fetchMemories(): Promise<Memory[]> {
  const { data } = await api.get<Memory[]>("/memories");
  return data;
}

export async function addMemory(key: string, value: string): Promise<Memory> {
  const { data } = await api.post<Memory>("/memories", { key, value });
  return data;
}

export async function deleteMemory(id: number): Promise<void> {
  await api.delete(`/memories/${id}`);
}

export default api;
