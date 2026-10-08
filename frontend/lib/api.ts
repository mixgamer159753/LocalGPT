import axios from "axios";
import { Conversation, ConversationDetail, HealthInfo, ModelInfo, FileAttachment, FilePreview, ProjectSpace, ProjectInput, SavedMemory, ConnectionDiagnostics } from "@/types/chat";

const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "8000";

export const CONNECTION_KEY = "localgpt:backend-url";
export const CONNECTION_EVENT = "localgpt:connection-changed";

export function defaultApiBaseUrl() {
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

export function normalizeBackendUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error("Enter a full FastAPI address starting with http:// or https://, without /api or /v1."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("Use the FastAPI server origin, for example http://127.0.0.1:8000 or an HTTPS tunnel. Leave out /api and /v1.");
  }
  return url.origin;
}

export function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage.getItem(CONNECTION_KEY);
      if (override) return normalizeBackendUrl(override);
    } catch { /* Browser storage may be unavailable. */ }
  }
  return defaultApiBaseUrl();
}

export function saveBackendUrl(value: string | null) {
  if (value) window.localStorage.setItem(CONNECTION_KEY, normalizeBackendUrl(value));
  else window.localStorage.removeItem(CONNECTION_KEY);
  window.dispatchEvent(new Event(CONNECTION_EVENT));
}

export function apiHeaders(url = getApiBaseUrl()): Record<string, string> {
  return new URL(url).hostname.toLowerCase().includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {};
}
export function streamUrl() { return `${getApiBaseUrl()}/api/chat/stream`; }

const api = axios.create({
  baseURL: `${defaultApiBaseUrl()}/api`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  config.baseURL = `${getApiBaseUrl()}/api`;
  config.headers.delete("ngrok-skip-browser-warning");
  for (const [key, value] of Object.entries(apiHeaders())) config.headers.set(key, value);
  return config;
});

api.interceptors.response.use((response) => {
  if (response.config.baseURL !== `${getApiBaseUrl()}/api`) throw new Error("The backend address changed during this request. Please try again.");
  return response;
}, async (error) => {
  const config = error.config;
  if (!config || config.signal?.aborted || config.baseURL !== `${getApiBaseUrl()}/api` || config.__localgptRetried || config.method?.toLowerCase() !== "get") {
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
    if (error.code === "ECONNABORTED") return "The backend took too long to respond. Please try again.";
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

export async function fetchProjects(): Promise<ProjectSpace[]> { return (await api.get("/projects")).data; }
export async function saveProject(input: ProjectInput, id?: number): Promise<ProjectSpace> {
  return (await (id ? api.put(`/projects/${id}`, input) : api.post("/projects", input))).data;
}
export async function deleteProject(id: number): Promise<void> { await api.delete(`/projects/${id}`); }
export async function moveConversation(id: number, project_id: number | null): Promise<Conversation> {
  return (await api.patch(`/conversations/${id}`, { project_id })).data;
}
function memoryPath(projectId: number | null) { return projectId === null ? "/memories" : `/projects/${projectId}/memories`; }
export async function fetchMemories(projectId: number | null): Promise<SavedMemory[]> { return (await api.get(memoryPath(projectId))).data; }
export async function saveMemory(projectId: number | null, key: string, value: string): Promise<SavedMemory> {
  return (await api.post(memoryPath(projectId), { key, value })).data;
}
export async function removeMemory(projectId: number | null, id: number): Promise<void> { await api.delete(`${memoryPath(projectId)}/${id}`); }
export async function fetchDiagnostics(url = getApiBaseUrl(), signal?: AbortSignal): Promise<ConnectionDiagnostics> {
  // An isolated request lets the user check a proposed URL before applying it.
  const data = (await axios.get(`${normalizeBackendUrl(url)}/api/diagnostics`, { timeout: 20000, headers: apiHeaders(url), signal })).data;
  if (!data || typeof data !== "object" || !Array.isArray(data.models) || !data.models.every((name: unknown) => typeof name === "string") ||
      typeof data.database_connected !== "boolean" || typeof data.provider_reachable !== "boolean" || typeof data.chat_url !== "string") {
    throw new Error("This address did not return LocalGPT diagnostics. Use the FastAPI backend address and restart the updated backend.");
  }
  return data;
}
