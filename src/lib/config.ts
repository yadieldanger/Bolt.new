/**
 * Configuration loading.
 *
 * Precedence (high to low):
 *   1. CLI flags (already parsed by index.tsx and passed in overrides)
 *   2. Environment variables (OPENROUTER_API_KEY, AI_MODEL, etc.)
 *   3. ~/.config/ai-cli/config.json
 *   4. Built-in defaults
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ResolvedConfig } from "../types.js";

export const DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free";

export const DEFAULT_SYSTEM_PROMPT = [
  "You are ai-cli, a helpful agent running locally on the user's device (likely Termux on Android).",
  "You have access to a small set of tools to read files, edit files, list directories, run shell commands, take notes, fetch web pages, and read the user's clipboard (via Termux:API when available).",
  "Be concise. Prefer short, direct answers. Use markdown for structure when it helps.",
  "When using tools, always explain in one sentence what you are about to do.",
  "Never run destructive shell commands without confirming intent. Prefer safer forms (e.g., `mv` before `rm`).",
  "When asked to write code, write it directly to disk using write_file instead of dumping huge blocks in chat.",
  "If the user's request is ambiguous, ask a clarifying question rather than guessing.",
].join("\n\n");

export interface ConfigOverrides {
  apiKey?: string;
  model?: string;
  autoApprove?: boolean;
  systemPrompt?: string;
}

const ENV_KEY = "OPENROUTER_API_KEY";
const ENV_MODEL = "AI_MODEL";

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) return join(xdg, "ai-cli");
  return join(homedir(), ".config", "ai-cli");
}

function historyDir(): string {
  const xdg = process.env.XDG_STATE_HOME ?? process.env.XDG_DATA_HOME;
  if (xdg && xdg.length > 0) {
    // Prefer state for ephemeral session files; data is also fine.
    return join(xdg, "ai-cli", "sessions");
  }
  return join(homedir(), ".local", "share", "ai-cli", "sessions");
}

interface RawConfig {
  apiKey?: string;
  model?: string;
  autoApprove?: boolean;
  systemPrompt?: string;
  maxHistoryMessages?: number;
  termuxIntegration?: boolean;
}

function readRawConfig(path: string): RawConfig {
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as RawConfig;
  } catch {
    return {};
  }
}

export function loadConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const configPath = join(configDir(), "config.json");
  const raw = readRawConfig(configPath);

  const apiKey =
    overrides.apiKey?.trim() ||
    process.env[ENV_KEY]?.trim() ||
    raw.apiKey?.trim() ||
    "";

  const model =
    overrides.model?.trim() ||
    process.env[ENV_MODEL]?.trim() ||
    raw.model?.trim() ||
    DEFAULT_MODEL;

  const autoApprove = Boolean(
    overrides.autoApprove ||
      process.env.AI_AUTO_APPROVE === "1" ||
      raw.autoApprove,
  );

  const systemPrompt =
    overrides.systemPrompt?.trim() ||
    raw.systemPrompt?.trim() ||
    DEFAULT_SYSTEM_PROMPT;

  const maxHistoryMessages = raw.maxHistoryMessages ?? 50;
  const termuxIntegration = detectTermux(raw.termuxIntegration);

  return {
    apiKey,
    model,
    autoApprove,
    systemPrompt,
    maxHistoryMessages,
    termuxIntegration,
    configPath,
    historyDir: historyDir(),
  };
}

function detectTermux(raw?: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  // Termux sets PREFIX=/data/data/com.termux/files/usr
  return process.env.PREFIX?.includes("com.termux") ?? false;
}

export function saveConfig(patch: Partial<RawConfig>): void {
  const configPath = join(configDir(), "config.json");
  mkdirSync(dirname(configPath), { recursive: true });
  const current = readRawConfig(configPath);
  const merged = { ...current, ...patch };
  writeFileSync(configPath, JSON.stringify(merged, null, 2), {
    mode: 0o600,
  });
}

export function ensureDirs(): void {
  mkdirSync(configDir(), { recursive: true });
  mkdirSync(historyDir(), { recursive: true });
}
