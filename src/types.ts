/**
 * Shared types for the ai-cli agent.
 */

import type { ModelInfo, ProviderMeta } from "./lib/providers.js";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  /** Local id used by the UI for <Static> rendering. */
  id: string;
  role: Role;
  content: string;
  /** Only set when role === "tool". Identifies the matching assistant tool_call. */
  toolCallId?: string;
  /** Only set when role === "tool". Mirrors the matching tool_call's name for display. */
  toolName?: string;
  /** Only set when role === "assistant" and the assistant requested tools. */
  toolCalls?: ToolCall[];
  timestamp: number;
}

export interface ToolCall {
  /** OpenRouter-assigned id used to correlate a tool result message. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Internal lifecycle for the UI; not sent to the API. */
  status: ToolCallStatus;
  /** Pretty-printed JSON of `arguments`, captured at streaming time. */
  rawArgs?: string;
  /** Truncated, human-readable argument summary. */
  preview?: string;
  /** Execution output if status === "done". */
  result?: string;
  /** Error message if status === "error". */
  error?: string;
}

export type ToolCallStatus =
  | "pending"
  | "awaiting-approval"
  | "approved"
  | "denied"
  | "running"
  | "done"
  | "error";

export interface ToolParam {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParam>;
    required: string[];
  };
  /** If true, the UI must prompt the user before executing. */
  requiresApproval: boolean;
  /** Run the tool. Throws on failure (caught and surfaced as an error tool message). */
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<string>;
}

export interface ToolContext {
  cwd: string;
  home: string;
  hasTermuxApi: boolean;
}

/** Re-export provider catalog types so existing imports keep working. */
export type { ModelInfo, ProviderMeta };

/** Stored credential for one provider (apiKey only; provider shape lives in providers.ts). */
export interface ProviderConfig {
  apiKey: string;
}

export interface ResolvedConfig {
  /** Active provider id, e.g. "openrouter" or a custom one. */
  activeProviderId: string;
  /** Active model id. */
  activeModel: string;
  /** Per-provider credentials, keyed by provider id. */
  providerKeys: Record<string, ProviderConfig>;
  /** User-added OpenAI-compatible providers beyond the built-in catalogue. */
  customProviders: ProviderMeta[];
  /** Resolved apiKey for the active provider (convenience mirror). */
  apiKey: string;
  /** Resolved baseUrl for the active provider (convenience mirror). */
  baseUrl: string;
  /** Resolved model for the active provider (convenience mirror). */
  model: string;
  autoApprove: boolean;
  systemPrompt: string;
  maxHistoryMessages: number;
  termuxIntegration: boolean;
  configPath: string;
  historyDir: string;
}

export interface SessionMeta {
  id: string;
  startedAt: number;
  messageCount: number;
}

export type StreamMode = "idle" | "streaming" | "awaiting-approval";

export interface ActiveToolCall {
  call: ToolCall;
  resolve: (approved: boolean) => void;
}

/**
 * Local token usage estimate. We track this client-side (chars/4) because
 * OpenRouter only returns authoritative usage when `stream_options.include_usage`
 * is set, and we want the status bar to update mid-stream.
 */
export interface UsageInfo {
  total: number;
}
