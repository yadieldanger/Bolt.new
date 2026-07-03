/**
 * Generic OpenAI-compatible streaming client.
 *
 * Backed by the official `openai` Node SDK. We pass in the base URL and any
 * default headers per-provider so this same class works for OpenAI, Groq,
 * Together, DeepSeek, Mistral, Google (Gemini OpenAI-compat), Perplexity,
 * Ollama, OpenRouter, and any user-defined custom provider that speaks the
 * OpenAI chat-completions protocol.
 */

import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions.js";
import type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "../types.js";

export interface StreamDoneInfo {
  finishReason?: string;
  /** Local token estimate for the completed assistant message. */
  tokenEstimate: number;
}

export interface StreamHandlers {
  onToken: (token: string) => void;
  onToolCalls: (calls: ToolCall[]) => void;
  onDone: (info: StreamDoneInfo) => void;
  onError: (err: Error) => void;
}

export interface LlmClientOptions {
  /** Per-provider API key. Empty string is allowed for providers with requiresApiKey=false. */
  apiKey: string;
  /** OpenAI-compatible base URL for the provider. */
  baseUrl: string;
  /** Optional default headers (e.g. HTTP-Referer for OpenRouter ranking). */
  defaultHeaders?: Record<string, string>;
  /** Model id to send on every request. */
  model: string;
}

export class LlmClient {
  private client: OpenAI;
  model: string;

  constructor(opts: LlmClientOptions) {
    // For providers that don't require an api key (e.g. local Ollama), the SDK
    // still wants a non-empty string for the Authorization header so we send a
    // placeholder. The server ignores it.
    const apiKey = opts.apiKey && opts.apiKey.length > 0 ? opts.apiKey : "no-key";
    this.client = new OpenAI({
      apiKey,
      baseURL: opts.baseUrl,
      defaultHeaders: opts.defaultHeaders ?? {},
      maxRetries: 1,
      timeout: 120_000,
    });
    this.model = opts.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Convert a ChatMessage array (with tool messages) into the OpenAI message-param shape.
   * The `system` role is included only when explicitly part of the conversation.
   */
  toApiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    const out: ChatCompletionMessageParam[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        out.push({ role: "system", content: m.content });
        continue;
      }
      if (m.role === "user") {
        out.push({ role: "user", content: m.content });
        continue;
      }
      if (m.role === "assistant") {
        if (m.toolCalls && m.toolCalls.length > 0) {
          out.push({
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments ?? {}),
              },
            })),
          });
        } else {
          out.push({ role: "assistant", content: m.content });
        }
        continue;
      }
      if (m.role === "tool") {
        if (!m.toolCallId) continue;
        out.push({
          role: "tool",
          tool_call_id: m.toolCallId,
          content: m.content,
        });
      }
    }
    return out;
  }

  toTools(tools: ToolDefinition[]): ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object" as const,
          properties: t.parameters.properties as Record<
            string,
            { type: string; description: string; enum?: string[] }
          >,
          required: t.parameters.required,
        },
      },
    }));
  }

  /**
   * Run one streaming chat completion. The caller is responsible for handling
   * the returned tool calls (execute them, append tool messages, re-call).
   */
  async streamChat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    handlers: StreamHandlers,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const apiMessages = this.toApiMessages(messages);
    const apiTools = this.toTools(tools);

    let stream;
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        messages: apiMessages,
        stream: true,
        tools: apiTools,
        tool_choice: "auto",
        ...(abortSignal ? { signal: abortSignal } : {}),
      });
    } catch (err) {
      // Re-raise on caller handler after normalization.
      handlers.onError(normalizeError(err));
      return;
    }

    // Accumulate tool calls from streamed deltas. Keyed by tool call index.
    const partialCalls: Array<{
      id: string;
      name: string;
      rawArgs: string;
      preview: string;
    }> = [];

    try {
      for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
        if (abortSignal?.aborted) {
          handlers.onError(new Error("aborted"));
          return;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta?.content) {
          handlers.onToken(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!partialCalls[idx]) {
              partialCalls[idx] = {
                id: tc.id ?? `call_${Date.now()}_${idx}`,
                name: tc.function?.name ?? "",
                rawArgs: "",
                preview: "",
              };
            }
            const slot = partialCalls[idx];
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) {
              slot.rawArgs += tc.function.arguments;
              slot.preview = slot.rawArgs;
            }
          }
        }
      }

      const calls: ToolCall[] = partialCalls.map((p, i) => ({
        id: p.id || `call_${Date.now()}_${i}`,
        name: p.name,
        arguments: safeParseJson(p.rawArgs),
        status: "pending",
        rawArgs: p.rawArgs,
        preview: p.preview,
      }));

      if (calls.length > 0) {
        handlers.onToolCalls(calls);
      }
      handlers.onDone({ tokenEstimate: 0 });
    } catch (err) {
      handlers.onError(normalizeError(err));
    }
  }
}

function safeParseJson(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "object" && err !== null) {
    const msg = (err as { message?: string }).message ?? String(err);
    return new Error(msg);
  }
  return new Error(String(err));
}
