import React from "react";
import { Box, Text } from "ink";
import type { ToolCall } from "../types.js";
import { ellipsize } from "../lib/format.js";

export interface ApprovalViewProps {
  call: ToolCall;
}

export function ApprovalView({ call }: ApprovalViewProps) {
  const args = ellipsize(JSON.stringify(call.arguments, null, 2), 600);
  const dangerous = isDangerousCall(call);
  return (
    <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow">
        ⚠ tool call: <Text bold>{call.name}</Text>
      </Text>
      <Box marginLeft={2} flexDirection="column">
        <Text dimColor>args:</Text>
        <Text wrap="wrap">{args}</Text>
      </Box>
      {dangerous && (
        <Box marginTop={1}>
          <Text color="red">⚠ this action can mutate the device ({dangerous}).</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text>
          allow? <Text color="green">[y]</Text>es  <Text color="red">[n]</Text>o
        </Text>
      </Box>
    </Box>
  );
}

function isDangerousCall(call: ToolCall): string | null {
  if (call.name === "run_shell") {
    const cmd = typeof call.arguments?.["command"] === "string" ? call.arguments["command"] : "";
    if (/\brm\s+-rf?\b/.test(cmd)) return "may delete files";
    if (/\bsudo\b/.test(cmd)) return "may escalate privileges";
    if (/\bcurl\b|\bwget\b/.test(cmd)) return "may fetch network resources";
    if (/\b(chmod|chown)\b/.test(cmd)) return "may change permissions";
    return null;
  }
  if (call.name === "write_file") {
    const path = typeof call.arguments?.["path"] === "string" ? call.arguments["path"] : "";
    if (/(^|[\/\\])(\.env|\.git|node_modules)([\/\\]|$)/.test(path)) return "may overwrite sensitive files";
    return null;
  }
  if (call.name === "termux_clipboard") {
    return "may overwrite the Android clipboard";
  }
  if (call.name === "termux_toast") {
    return null;
  }
  return null;
}
