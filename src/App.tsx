import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { OpenRouterClient } from "./lib/openrouter.js";
import { dispatch as dispatchSlash, type CommandEffect } from "./lib/slash.js";
import { registerDefaultTools, makeToolContext } from "./lib/tools.js";
import { estimateTokens, makeId } from "./lib/format.js";
import { saveConfig } from "./lib/config.js";
import type {
  ActiveToolCall,
  ChatMessage,
  StreamMode,
  ToolCall,
  UsageInfo,
} from "./types.js";
import { InputBox } from "./components/InputBox.js";
import { StatusBar } from "./components/StatusBar.js";
import { MessageView } from "./components/MessageView.js";
import { ApprovalView } from "./components/ApprovalView.js";
import { StreamingView } from "./components/StreamingView.js";

export interface AppProps {
  apiKey: string;
  initialModel: string;
  systemPrompt: string;
  cwd: string;
  hasTermuxApi: boolean;
}

export function App({
  apiKey,
  initialModel,
  systemPrompt,
  cwd,
  hasTermuxApi,
}: AppProps) {
  const { exit } = useApp();

  // ───────── configurable state ─────────
  const [model, setModel] = useState(initialModel);
  const [autoApprove, setAutoApprove] = useState(false);
  const [systemPromptText, setSystemPromptText] = useState(systemPrompt);
  const [cwdState, setCwdState] = useState(cwd);

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

  // ───────── reactive refs ─────────
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
  const ctx = useMemo(() => makeToolContext(cwdRef.current, hasTermuxApi), [hasTermuxApi]);

  const clientRef = useRef<OpenRouterClient | null>(null);
  if (clientRef.current === null && apiKey) {
    clientRef.current = new OpenRouterClient(apiKey, modelRef.current);
  }
  // Keep client model in sync with state changes (avoid re-creating client).
  useEffect(() => {
    clientRef.current?.setModel(model);
  }, [clientRef, model]);

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
        case "setModel":
          setModel(eff.model);
          saveConfig({ model: eff.model });
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
      }
    },
    [exit],
  );

  // ───────── agent loop ─────────
  const runTurn = useCallback(async () => {
    if (runningRef.current) return;
    if (!clientRef.current) {
      setErrorMsg("No API key configured. Set OPENROUTER_API_KEY or save it to ~/.config/ai-cli/config.json. Get a key at https://openrouter.ai/keys");
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

          // Tool definition is already resolved at the top of the loop above.

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
  }, [pushMessage, scheduleFlush, waitForApproval, toolDefs, ctx]);

  const submitUserMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || mode !== "idle") return;

      if (trimmed.startsWith("/")) {
        const result = dispatchSlash(trimmed, {
          model,
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
    [mode, model, autoApprove, systemPromptText, pushMessage, runTurn, handleEffect],
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
  if (!apiKey) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">✗ OPENROUTER_API_KEY is not set.</Text>
        <Text>{"  "}Set it in your environment, or save it to ~/.config/ai-cli/config.json:</Text>
        <Text>{"    "}{`{ "apiKey": "sk-or-..." }`}</Text>
        <Text>{"\n  "}Get your key at <Text color="cyan">https://openrouter.ai/keys</Text></Text>
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
        model={model}
        autoApprove={autoApprove}
        usage={tokenUsage}
        cwd={cwdState}
        width={width}
      />
    </Box>
  );
}
