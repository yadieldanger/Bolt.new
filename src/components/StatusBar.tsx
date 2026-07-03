import React from "react";
import { Box, Text } from "ink";
import type { UsageInfo } from "../types.js";

export interface StatusBarProps {
  model: string;
  autoApprove: boolean;
  usage: UsageInfo;
  cwd: string;
  width: number;
}

export function StatusBar({ model, autoApprove, usage, cwd, width }: StatusBarProps) {
  const compactModel = shortenModel(model);
  const cwdShort = shortenPath(cwd, Math.max(8, Math.floor(width * 0.25)));
  const total = usage.total;
  const tokenStr = total > 0 ? `~${formatTokens(total)}t` : "—";

  const cols = Math.max(40, width);
  const segments = [
    { color: "green" as const, text: compactModel },
    { color: (autoApprove ? "red" : "gray") as "red" | "gray", text: autoApprove ? "AUTO" : "ask" },
    { color: "blue" as const, text: tokenStr },
    { color: "gray" as const, text: cwdShort },
  ];

  return (
    <Box paddingX={1}>
      {segments.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color="gray"> · </Text>}
          <Text color={s.color}>{truncateCell(s.text, Math.max(6, Math.floor(cols / segments.length)))}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}

function shortenModel(model: string): string {
  // "google/gemini-2.0-flash-exp:free" -> "gemini-2.0-flash (free)"
  const [provider, rest] = model.includes("/") ? model.split("/", 2) : ["", model];
  const colon = rest?.indexOf(":");
  const base = colon && colon >= 0 ? rest.slice(0, colon) : rest;
  const tag = colon && colon >= 0 ? rest.slice(colon + 1) : "";
  const compact = base && base.length > 22 ? base.slice(0, 22) + "…" : base;
  return (provider ? `${provider.split("/").pop()}/${compact}` : compact) + (tag ? `:${tag}` : "");
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
