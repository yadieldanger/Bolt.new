/**
 * Shared types for the ai-cli agent.
 */

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

export interface ResolvedConfig {
  apiKey: string;
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
