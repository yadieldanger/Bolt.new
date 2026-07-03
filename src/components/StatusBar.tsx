import React from "react";
import { Box, Text } from "ink";
import type { UsageInfo } from "../types.js";

export interface StatusBarProps {
  /** Short provider label, e.g. "openrouter", "openai". */
  providerLabel: string;
  /** Active model id, e.g. "google/gemini-2.0-flash-exp:free" or "gpt-4o-mini". */
  model: string;
  autoApprove: boolean;
  usage: UsageInfo;
  cwd: string;
  width: number;
}

export function StatusBar({
  providerLabel,
  model,
  autoApprove,
  usage,
  cwd,
  width,
}: StatusBarProps) {
  const compactModel = shortenModel(model);
  const cwdShort = shortenPath(cwd, Math.max(8, Math.floor(width * 0.25)));
  const total = usage.total;
  const tokenStr = total > 0 ? `~${formatTokens(total)}t` : "—";

  const cols = Math.max(40, width);
  const segments = [
    { color: "green" as const, text: `${providerLabel}/${compactModel}` },
    {
      color: (autoApprove ? "red" : "gray") as "red" | "gray",
      text: autoApprove ? "AUTO" : "ask",
    },
    { color: "blue" as const, text: tokenStr },
    { color: "gray" as const, text: cwdShort },
  ];

  return (
    <Box paddingX={1}>
      {segments.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color="gray"> · </Text>}
          <Text color={s.color}>{truncateCell(s.text, Math.max(10, Math.floor(cols / segments.length)))}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}

function shortenModel(model: string): string {
  // "google/gemini-2.0-flash-exp:free" -> "gemini-2.0-flash:free"
  const slash = model.indexOf("/");
  const colon = model.indexOf(":");
  let core = model;
  if (slash >= 0) core = core.slice(slash + 1);
  if (colon > slash + 1 && slash >= 0) {
    // already handled above (colon is across whole string)
  }
  // For "google/gemini-2.0-flash-exp:free" we want "gemini-2.0-flash:free".
  // We want to drop org prefix and stop at a tag colon.
  const parts: string[] = [];
  let p = "";
  for (let i = 0; i < core.length; i++) {
    const c = core[i];
    if (c === ":") {
      parts.push(p);
      p = ":";
      continue;
    }
    p += c;
  }
  parts.push(p);
  const base = parts[0] ?? core;
  const tag = parts.length > 1 ? parts.slice(1).join("") : "";
  const compact = base.length > 18 ? base.slice(0, 18) + "…" : base;
  return compact + tag;
}

function shortenPath(p: string, max: number): string {
  if (p.length <= max) return p;
  return "…" + p.slice(p.length - max + 1);
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return (n / 1000).toFixed(1) + "k";
  if (n < 1_000_000) return Math.round(n / 1000) + "k";
  return (n / 1_000_000).toFixed(1) + "M";
}

function truncateCell(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + "…";
}
