export interface ApiContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export type ApiContent = string | ApiContentPart[];

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  created_at?: string;
  status?: "streaming" | "complete" | "error" | "stopped";
  statusText?: string;
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
  markdownRich: boolean;
}
