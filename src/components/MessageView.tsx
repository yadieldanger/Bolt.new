import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../types.js";
import { ellipsize, parseSegments } from "../lib/format.js";

export interface MessageViewProps {
  msg: ChatMessage;
}

export function MessageView({ msg }: MessageViewProps) {
  if (msg.role === "user") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan">› you</Text>
        <Box marginLeft={2}>
          <Text wrap="wrap">{msg.content}</Text>
        </Box>
      </Box>
    );
  }
  if (msg.role === "assistant") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="green">● assistant</Text>
        <Box marginLeft={2} flexDirection="column">
          {renderRich(msg.content)}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              {msg.toolCalls.map((tc, i) => (
                <Box key={tc.id ?? i} flexDirection="column">
                  <Text color="yellow">
                    🔧 {tc.name} <Text dimColor>({ellipsize(JSON.stringify(tc.arguments), 160)})</Text>
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    );
  }
  if (msg.role === "tool") {
    const name = msg.toolName ? `${msg.toolName}` : "tool";
    const isError = msg.content.startsWith("Error:");
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color={isError ? "red" : "magenta"}>← {name}</Text>
        <Box marginLeft={2}>
          <Text wrap="wrap" color={isError ? "red" : "gray"} dimColor={!isError}>
            {msg.content}
          </Text>
        </Box>
      </Box>
    );
  }
  if (msg.role === "system") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="blue">⚙ system</Text>
        <Box marginLeft={2}>
          <Text dimColor wrap="wrap">{msg.content}</Text>
        </Box>
      </Box>
    );
  }
  return null;
}

function renderRich(text: string): React.ReactNode {
  const segments = parseSegments(text);
  return segments.map((seg, i) => renderSegment(seg, i));
}

function renderSegment(seg: ReturnType<typeof parseSegments>[number], key: number): React.ReactNode {
  switch (seg.kind) {
    case "text":
      return renderInline(seg.text, key);
    case "heading":
      return (
        <Text key={key} bold color="green">
          {seg.text}
        </Text>
      );
    case "codeblock":
      return (
        <Box
          key={key}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginY={1}
        >
          {seg.lang ? <Text dimColor>┤ {seg.lang} ├</Text> : null}
          <Text wrap="wrap">{seg.text}</Text>
        </Box>
      );
    case "list":
      return (
        <Box key={key} flexDirection="column">
          {seg.items.map((item, j) => (
            <Text key={j}>{item}</Text>
          ))}
        </Box>
      );
    case "quote":
      return (
        <Text key={key} color="yellow">
          │ {seg.text}
        </Text>
      );
    case "rule":
      return (
        <Text key={key} dimColor>
          ─────────────
        </Text>
      );
    default:
      return null;
  }
}

/**
 * Render an inline string with simple markdown: **bold**, _italic_, `code`, and links.
 * Splits the string on these tokens and emits nested <Text> for styling.
 */
function renderInline(text: string, key: number): React.ReactNode {
  // Tokenize: alternate between plain text and styled spans.
  const tokens: Array<{ kind: "plain" | "bold" | "italic" | "code"; text: string }> = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) tokens.push({ kind: "plain", text: text.slice(lastIndex, m.index) });
    const raw = m[0];
    if (raw.startsWith("**")) tokens.push({ kind: "bold", text: raw.slice(2, -2) });
    else if (raw.startsWith("`")) tokens.push({ kind: "code", text: raw.slice(1, -1) });
    else if (raw.startsWith("*")) tokens.push({ kind: "italic", text: raw.slice(1, -1) });
    else tokens.push({ kind: "italic", text: raw.slice(1, -1) });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ kind: "plain", text: text.slice(lastIndex) });

  return (
    <Text key={key} wrap="wrap">
      {tokens.map((t, i) => {
        if (t.kind === "bold") {
          return (
            <Text key={i} bold>
              {t.text}
            </Text>
          );
        }
        if (t.kind === "italic") {
          return (
            <Text key={i} italic>
              {t.text}
            </Text>
          );
        }
        if (t.kind === "code") {
          return (
            <Text key={i} color="cyan">
              {t.text}
            </Text>
          );
        }
        return (
          <Text key={i}>{t.text}</Text>
        );
      })}
    </Text>
  );
}
