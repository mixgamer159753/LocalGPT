import axios from "axios";
import { Conversation, ConversationDetail, HealthInfo, ModelInfo, FileAttachment, FilePreview } from "@/types/chat";

const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "8000";

function getApiBaseUrl() {
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

const API_BASE_URL = getApiBaseUrl();
export const STREAM_URL = `${API_BASE_URL}/api/chat/stream`;
const usesNgrok = API_BASE_URL.toLowerCase().includes("ngrok");
export const API_HEADERS: Record<string, string> = usesNgrok
  ? { "ngrok-skip-browser-warning": "true" }
  : {};

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
  headers: API_HEADERS,
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

export async function updateConversationTitle(id: number, title: string): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/conversations/${id}`, { title });
  return data;
}

export async function deleteConversation(id: number): Promise<void> {
  await api.delete(`/conversations/${id}`);
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.code === "ECONNABORTED") return "The backend took too long to read this file. Please try again.";
    if (!error.response) return "Cannot reach the backend. Check that FastAPI is running.";
  }
  return fallback;
}

export async function uploadDocument(file: File, signal: AbortSignal): Promise<FileAttachment> {
  const { data } = await api.post<FileAttachment>(`/files?name=${encodeURIComponent(file.name)}`, file, {
    headers: { "Content-Type": "application/octet-stream" }, timeout: 90_000, signal,
  });
  return data;
}

export async function fetchDocument(id: string, signal: AbortSignal): Promise<FilePreview> {
  const { data } = await api.get<FilePreview>(`/files/${encodeURIComponent(id)}`, { signal });
  return data;
}

export async function deleteDraftDocument(id: string): Promise<void> {
  await api.delete(`/files/${encodeURIComponent(id)}`);
}
