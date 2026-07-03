import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { LlmClient } from "./lib/llm.js";
import {
  dispatch as dispatchSlash,
  type CommandEffect,
} from "./lib/slash.js";
import { registerDefaultTools, makeToolContext } from "./lib/tools.js";
import { makeId } from "./lib/format.js";
import {
  saveConfig,
  setProviderKey as saveProviderKey,
} from "./lib/config.js";
import {
  findProvider,
  type ProviderMeta,
} from "./lib/providers.js";
import type {
  ActiveToolCall,
  ChatMessage,
  StreamMode,
  ToolCall,
  UsageInfo,
} from "./types.js";
import type { ProviderConfig } from "./types.js";
import { InputBox } from "./components/InputBox.js";
import { StatusBar } from "./components/StatusBar.js";
import { MessageView } from "./components/MessageView.js";
import { ApprovalView } from "./components/ApprovalView.js";
import { StreamingView } from "./components/StreamingView.js";

export interface AppProps {
  initialProviderId: string;
  initialModel: string;
  providerKeys: Record<string, ProviderConfig>;
  customProviders: ProviderMeta[];
  initialProviderMeta: ProviderMeta;
  systemPrompt: string;
  cwd: string;
  hasTermuxApi: boolean;
}

export function App({
  initialProviderId,
  initialModel,
  providerKeys,
  customProviders: initialCustomProviders,
  initialProviderMeta,
  systemPrompt,
  cwd,
  hasTermuxApi,
}: AppProps) {
  const { exit } = useApp();

  // ───────── configurable state ─────────
  const [activeProviderId, setActiveProviderId] = useState(initialProviderId);
  const [model, setModel] = useState(initialModel);
  const [customProviders, setCustomProviders] = useState<ProviderMeta[]>(
    initialCustomProviders,
  );
  const [providerKeysState, setProviderKeysState] = useState<
    Record<string, ProviderConfig>
  >(providerKeys);
  const [autoApprove, setAutoApprove] = useState(false);
  const [systemPromptText, setSystemPromptText] = useState(systemPrompt);
  const [cwdState, setCwdState] = useState(cwd);
  const [lastListed, setLastListed] = useState<
    | { providerId: string; modelId: string }[]
    | undefined
  >(undefined);

  // ───────── chat state ─────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<StreamMode>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ───────── streaming ─────────
  const [streamingContent, setStreamingContent] = useState("");
  const [tokenUsage, setTokenUsage] = useState<UsageInfo>({ total: 0 });

  // ───────── approval ─────────
  const [pending, setPending] = useState<ActiveToolCall | null>(null);

  // ───────── reactive refs (read by runTurn) ─────────
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const systemRef = useRef(systemPromptText);
  useEffect(() => {
    systemRef.current = systemPromptText;
  }, [systemPromptText]);

  const cwdRef = useRef(cwdState);
  useEffect(() => {
    cwdRef.current = cwdState;
  }, [cwdState]);

  const autoRef = useRef(autoApprove);
  useEffect(() => {
    autoRef.current = autoApprove;
  }, [autoApprove]);

  // Tools/context don't change at runtime.
  const toolDefs = useMemo(() => registerDefaultTools(), []);
  const ctx = useMemo(
    () => makeToolContext(cwdRef.current, hasTermuxApi),
    [hasTermuxApi],
  );

  // Resolve the currently-active provider (built-in or custom).
  const activeProvider = useMemo(
    () =>
      findProvider(activeProviderId, customProviders) ?? initialProviderMeta,
    [activeProviderId, customProviders, initialProviderMeta],
  );

  const activeKey = providerKeysState[activeProvider.id]?.apiKey ?? "";

  // Rebuild the LLM client whenever the active provider or key changes.
  const clientRef = useRef<LlmClient | null>(null);
  if (clientRef.current === null && activeKey) {
    clientRef.current = new LlmClient({
      apiKey: activeKey,
      baseUrl: activeProvider.baseUrl,
      defaultHeaders: activeProvider.defaultHeaders,
      model: modelRef.current,
    });
  }
  // Recreate the client when the provider identity changes (different baseUrl or key).
  useEffect(() => {
    if (!activeKey) {
      clientRef.current = null;
      return;
    }
    clientRef.current = new LlmClient({
      apiKey: activeKey,
      baseUrl: activeProvider.baseUrl,
      defaultHeaders: activeProvider.defaultHeaders,
      model,
    });
  }, [activeKey, activeProvider.baseUrl, activeProvider.defaultHeaders, model, activeProvider.id]);

  // ───────── streaming buffer ─────────
  const bufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const flushStream = useCallback(() => {
    setStreamingContent(bufferRef.current);
    flushTimerRef.current = null;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushStream, 50);
    }
  }, [flushStream]);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const waitForApproval = useCallback((call: ToolCall): Promise<boolean> => {
    return new Promise<boolean>((resolveP) => {
      setPending({
        call: { ...call, status: "awaiting-approval" },
        resolve: resolveP,
      });
    });
  }, []);

  const handleEffect = useCallback(
    (eff: CommandEffect) => {
      switch (eff.type) {
        case "clear":
          setMessages([]);
          setErrorMsg(null);
          break;
        case "setActiveProvider": {
          setActiveProviderId(eff.providerId);
          const p = findProvider(eff.providerId, customProviders);
          if (p) {
            // Reset model to provider default if current model doesn't exist there.
            if (
              modelRef.current &&
              !p.models.some((m) => m.id === modelRef.current)
            ) {
              setModel(p.defaultModel);
            }
          }
          saveConfig({
            providers: providerKeysState,
            activeProvider: eff.providerId,
            activeModel:
              (findProvider(eff.providerId, customProviders)?.models.some(
                (m) => m.id === modelRef.current,
              )
                ? modelRef.current
                : findProvider(eff.providerId, customProviders)?.defaultModel) ?? "",
            customProviders,
          });
          break;
        }
        case "setActiveModel": {
          setModel(eff.modelId);
          // If switching to a different provider, also update active provider.
          if (eff.providerId !== activeProviderId) {
            setActiveProviderId(eff.providerId);
          }
          saveConfig({
            providers: providerKeysState,
            activeProvider: eff.providerId,
            activeModel: eff.modelId,
            customProviders,
          });
          break;
        }
        case "setProviderKey": {
          const next = {
            ...providerKeysState,
            [eff.providerId]: { apiKey: eff.apiKey },
          };
          setProviderKeysState(next);
          saveProviderKey(eff.providerId, eff.apiKey);
          // Auto-activate the provider if there isn't one yet.
          if (!activeProviderId) {
            setActiveProviderId(eff.providerId);
            saveConfig({ activeProvider: eff.providerId });
          }
          break;
        }
        case "addCustomProvider": {
          const exists = customProviders.some((p) => p.id === eff.provider.id);
          const nextCustom = exists
            ? customProviders.map((p) => (p.id === eff.provider.id ? eff.provider : p))
            : [...customProviders, eff.provider];
          setCustomProviders(nextCustom);
          let nextKeys = providerKeysState;
          if (eff.apiKey) {
            nextKeys = {
              ...providerKeysState,
              [eff.provider.id]: { apiKey: eff.apiKey },
            };
            setProviderKeysState(nextKeys);
          }
          saveConfig({
            customProviders: nextCustom,
            providers: nextKeys,
          });
          break;
        }
        case "removeProvider": {
          const { [eff.providerId]: _removed, ...rest } = providerKeysState;
          void _removed;
          setProviderKeysState(rest);
          // Drop matched custom provider too.
          const nextCustom = customProviders.filter(
            (p) => p.id !== eff.providerId,
          );
          if (nextCustom.length !== customProviders.length) {
            setCustomProviders(nextCustom);
          }
          saveConfig({
            providers: rest,
            customProviders: nextCustom,
          });
          // If the removed provider was active, fall back to first configured or empty.
          if (eff.providerId === activeProviderId) {
            const fallback = Object.keys(rest)[0] ?? nextCustom[0]?.id ?? "";
            setActiveProviderId(fallback);
            saveConfig({ activeProvider: fallback });
          }
          break;
        }
        case "rememberLastListed":
          setLastListed(eff.list);
          break;
        case "setAutoApprove":
          setAutoApprove(eff.value);
          break;
        case "setSystemPrompt":
          setSystemPromptText(eff.prompt);
          saveConfig({ systemPrompt: eff.prompt });
          break;
        case "setCwd":
          setCwdState(eff.path);
          break;
        case "exit":
          exit();
          break;
        case "loadSession":
          // Sessions aren't persisted to disk in this build — surface a notice.
          setErrorMsg(`session loading not implemented in this build (id=${eff.id}).`);
          break;
      }
    },
    [exit, providerKeysState, customProviders, activeProviderId],
  );

  // ───────── agent loop ─────────
  const runTurn = useCallback(async () => {
    if (runningRef.current) return;
    if (!clientRef.current) {
      setErrorMsg(
        `No provider configured. Type /provider to add one (e.g. /provider add openrouter sk-or-v1-...).`,
      );
      return;
    }
    if (!activeKey) {
      setErrorMsg(
        `Active provider "${activeProvider.name}" has no API key. Run /provider show ${activeProvider.id}.`,
      );
      return;
    }
    runningRef.current = true;
    setErrorMsg(null);

    const workingMessages: ChatMessage[] = [
      {
        id: makeId("sys"),
        role: "system",
        content: systemRef.current,
        timestamp: Date.now(),
      },
      ...messagesRef.current,
    ];

    let abortedOnce = false;

    try {
      while (true) {
        setMode("streaming");
        setStreamingContent("");
        bufferRef.current = "";

        const accumulatedCalls: ToolCall[] = [];

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        await clientRef.current.streamChat(
          workingMessages,
          toolDefs,
          {
            onToken: (tok) => {
              bufferRef.current += tok;
              scheduleFlush();
            },
            onToolCalls: (calls) => {
              accumulatedCalls.push(...calls);
            },
            onDone: ({ tokenEstimate }) => {
              if (tokenEstimate > 0) {
                setTokenUsage((p) => ({ total: p.total + tokenEstimate }));
              }
            },
            onError: (err) => {
              if (err.message !== "aborted") {
                setErrorMsg(err.message);
              }
            },
          },
          ctrl.signal,
        );

        // Flush remaining buffered tokens.
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        const finalText = bufferRef.current;
        setStreamingContent("");
        bufferRef.current = "";

        if (ctrl.signal.aborted && finalText.length === 0 && !abortedOnce) {
          abortedOnce = true;
          setMode("idle");
          return;
        }

        const assistantMsg: ChatMessage = {
          id: makeId("a"),
          role: "assistant",
          content: finalText,
          toolCalls: accumulatedCalls.length > 0 ? accumulatedCalls : undefined,
          timestamp: Date.now(),
        };
        pushMessage(assistantMsg);
        workingMessages.push(assistantMsg);

        if (accumulatedCalls.length === 0) {
          setMode("idle");
          return;
        }

        // Execute each tool call (with optional approval gate).
        for (const call of accumulatedCalls) {
          let approved = true;
          const def = toolDefs.find((t) => t.name === call.name);
          if (!def) {
            const errMsg: ChatMessage = {
              id: makeId("t"),
              role: "tool",
              content: `Error: unknown tool "${call.name}"`,
              toolCallId: call.id,
              toolName: call.name,
              timestamp: Date.now(),
            };
            pushMessage(errMsg);
            workingMessages.push(errMsg);
            continue;
          }
          approved = !def.requiresApproval || autoRef.current;
          if (!approved) {
            setMode("awaiting-approval");
            approved = await waitForApproval(call);
            // After resolve, mode remains awaiting-approval until we set it back.
          }

          if (!approved) {
            const deniedMsg: ChatMessage = {
              id: makeId("t"),
              role: "tool",
              content: "[user denied this tool call]",
              toolCallId: call.id,
              toolName: call.name,
              timestamp: Date.now(),
            };
            pushMessage(deniedMsg);
            workingMessages.push(deniedMsg);
            continue;
          }

          try {
            const result = await def.execute(call.arguments, ctx);
            const truncated =
              result.length > 24_000
                ? result.slice(0, 24_000) + "\n...[truncated]"
                : result;
            const toolMsg: ChatMessage = {
              id: makeId("t"),
              role: "tool",
              content: truncated,
              toolCallId: call.id,
              toolName: call.name,
              timestamp: Date.now(),
            };
            pushMessage(toolMsg);
            workingMessages.push(toolMsg);
          } catch (err) {
            const errorMsg: ChatMessage = {
              id: makeId("t"),
              role: "tool",
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
              toolCallId: call.id,
              toolName: call.name,
              timestamp: Date.now(),
            };
            pushMessage(errorMsg);
            workingMessages.push(errorMsg);
          }
        }

        // Continue the loop — model will see tool results.
      }
    } finally {
      runningRef.current = false;
      setMode((m) => (m === "streaming" ? "idle" : m));
    }
  }, [pushMessage, scheduleFlush, waitForApproval, toolDefs, ctx, activeKey, activeProvider]);

  const submitUserMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || mode !== "idle") return;

      if (trimmed.startsWith("/")) {
        const result = dispatchSlash(trimmed, {
          activeProviderId,
          activeModel: model,
          providerKeys: providerKeysState,
          customProviders,
          lastListed,
          autoApprove,
          systemPrompt: systemPromptText,
        });
        if (result) {
          pushMessage({
            id: makeId("sys-cmd"),
            role: "system",
            content: result.echo,
            timestamp: Date.now(),
          });
          if (result.effect) handleEffect(result.effect);
        }
        setInput("");
        return;
      }

      const userMsg: ChatMessage = {
        id: makeId("u"),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      pushMessage(userMsg);
      setInput("");
      runTurn();
    },
    [
      mode,
      activeProviderId,
      model,
      providerKeysState,
      customProviders,
      lastListed,
      autoApprove,
      systemPromptText,
      pushMessage,
      runTurn,
      handleEffect,
    ],
  );

  // ───────── global key handling ─────────
  useInput((inputStr, key) => {
    if (key.ctrl && inputStr === "c") {
      if (mode === "streaming") {
        cancelStream();
      } else {
        exit();
      }
      return;
    }
    if (mode === "awaiting-approval" && pending) {
      if (inputStr === "y" || inputStr === "Y") {
        pending.resolve(true);
        setPending(null);
      } else if (inputStr === "n" || inputStr === "N" || key.escape || key.return) {
        pending.resolve(false);
        setPending(null);
      }
    }
  });

  // ───────── render ─────────
  if (!activeKey) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">✗ No provider API key configured.</Text>
        <Text>{"  "}Add one at runtime — no manual JSON editing needed:</Text>
        <Text>{"    "}<Text color="cyan">/provider list</Text>{"            "}see built-in providers</Text>
        <Text>{"    "}<Text color="cyan">/provider add openrouter sk-or-v1-...</Text></Text>
        <Text>{"    "}<Text color="cyan">/provider add openai sk-...</Text></Text>
        <Text>{"    "}<Text color="cyan">/provider add groq gsk_...</Text></Text>
        <Text>{"\n  "}Then run /provider use openrouter, /model to pick a model.</Text>
        <Text>{"\n  "}Press Ctrl+C to exit.</Text>
      </Box>
    );
  }

  const width = process.stdout.columns ?? 80;

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflowY="hidden">
        <Static items={messages}>
          {(msg) => <MessageView key={msg.id} msg={msg} />}
        </Static>
        {streamingContent.length > 0 && <StreamingView content={streamingContent} />}
        {pending && <ApprovalView call={pending.call} />}
        {errorMsg && mode === "idle" && (
          <Box marginY={1}>
            <Text color="red">✗ {errorMsg}</Text>
          </Box>
        )}
      </Box>

      <Box paddingX={1} flexDirection="column">
        {mode === "idle" && (
          <InputBox
            value={input}
            onChange={setInput}
            onSubmit={submitUserMessage}
          />
        )}
        {mode === "streaming" && (
          <Box>
            <Text color="green">
              <Spinner type="dots" />
              {"  streaming…"}
            </Text>
            <Text dimColor>{"  "}Ctrl+C to cancel</Text>
          </Box>
        )}
        {mode === "awaiting-approval" && (
          <Text dimColor>● awaiting decision (y/n)</Text>
        )}
      </Box>

      <StatusBar
        providerLabel={activeProvider.label}
        model={model}
        autoApprove={autoApprove}
        usage={tokenUsage}
        cwd={cwdState}
        width={width}
      />
    </Box>
  );
}
