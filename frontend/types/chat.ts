export interface ApiContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export type ApiContent = string | ApiContentPart[];

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  kind: string;
  chars: number;
  pages?: number | null;
  truncated: boolean;
}

export interface FilePreview extends FileAttachment { text: string }

export interface ApiChatMessage {
  role: "user" | "assistant";
  content: ApiContent;
  attachments?: string[];
}

export type SearchMode = "auto" | "always" | "off";

export interface ResearchSource {
  id: number;
  title: string;
  url: string;
  snippet: string;
  published_date?: string | null;
}

export interface ResearchInfo {
  query: string;
  provider: string;
  cached: boolean;
  warning: string | null;
  sources: ResearchSource[];
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  created_at?: string;
  status?: "streaming" | "complete" | "error" | "stopped" | "incomplete";
  errorMessage?: string;
  attachments?: FileAttachment[] | null;
  statusText?: string;
  searchPhase?: "search" | "answer";
  searchQuery?: string;
  research?: ResearchInfo | null;
}

export interface Conversation {
  id: number;
  title: string;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: {
    id: number;
    role: "user" | "assistant";
    content: string;
    created_at: string;
    research?: ResearchInfo | null;
    attachments?: FileAttachment[] | null;
    generation_warning?: string | null;
  }[];
}

export interface ModelInfo {
  name: string;
  size?: number | null;
  modified_at?: string | null;
  family?: string | null;
  parameter_size?: string | null;
  quantization_level?: string | null;
  context_length?: number | null;
}

export interface HealthInfo {
  status: "ok" | "degraded";
  ollama_reachable: boolean;
  ollama_detail?: string | null;
  database_connected: boolean;
  database_detail?: string | null;
}

export type ThinkingEffort = "low" | "medium" | "high" | "max";

export interface UserSettings {
  temperature: number;
  maxTokens: number;
  thinkingEffort: ThinkingEffort;
  systemStyle: "balanced" | "concise" | "detailed";
  webSearch: boolean;
  searchMode: SearchMode;
  markdownRich: boolean;
}
