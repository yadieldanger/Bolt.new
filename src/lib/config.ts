/**
 * Configuration loading.
 *
 * Precedence (high to low):
 *   1. CLI flags (already parsed by index.tsx and passed in overrides)
 *   2. Per-provider env vars (OPENROUTER_API_KEY, OPENAI_API_KEY, …)
 *   3. Generic AI_PROVIDER / AI_MODEL env vars
 *   4. ~/.config/ai-cli/config.json  (multi-provider store)
 *   5. Built-in defaults
 *
 * If a `<provider>_API_KEY` env var is set but no provider is yet active, the
 * loader auto-picks that provider as the active one and clears the
 * `OPENROUTER_API_KEY` legacy field on next save.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  BUILTIN_PROVIDERS,
  findProvider,
  type ModelInfo,
  type ProviderMeta,
} from "./providers.js";
import type { ProviderConfig, ResolvedConfig } from "../types.js";

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
  provider?: string;
  model?: string;
  apiKey?: string;
  autoApprove?: boolean;
  systemPrompt?: string;
}

interface LegacyRawConfig {
  /** Legacy single-key field on top of config.json. */
  apiKey?: string;
  /** Legacy single-model field. */
  model?: string;
  autoApprove?: boolean;
  systemPrompt?: string;
  maxHistoryMessages?: number;
  termuxIntegration?: boolean;
}

interface RawConfig extends LegacyRawConfig {
  providers?: Record<string, ProviderConfig>;
  customProviders?: ProviderMeta[];
  activeProvider?: string;
  activeModel?: string;
}

/** Map provider id → environment variable name that may carry its key. */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  together: "TOGETHER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

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

function readRawConfig(path: string): RawConfig {
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as RawConfig;
  } catch {
    return {};
  }
}

/**
 * Walk the loader's per-provider env vars and gather any keys the host
 * environment supplies. Layered *below* anything already in the JSON file but
 * above the built-in defaults — so an explicit `/provider add` always wins.
 */
function envProviderKeys(): Record<string, ProviderConfig> {
  const out: Record<string, ProviderConfig> = {};
  for (const [providerId, envName] of Object.entries(PROVIDER_ENV_VARS)) {
    const v = process.env[envName]?.trim();
    if (v && v.length > 0) {
      out[providerId] = { apiKey: v };
    }
  }
  return out;
}

function isValidModelFor(modelId: string, models: ModelInfo[]): boolean {
  return models.some((m) => m.id === modelId);
}

function migrateLegacy(raw: RawConfig): RawConfig {
  // If old `apiKey` exists and providers.openrouter doesn't, migrate.
  if (raw.apiKey && raw.apiKey.trim().length > 0) {
    raw.providers ??= {};
    if (!raw.providers.openrouter) {
      raw.providers.openrouter = { apiKey: raw.apiKey.trim() };
    }
    // Drop the legacy field so we don't keep hoisting it.
    delete raw.apiKey;
  }
  return raw;
}

export function loadConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const configPath = join(configDir(), "config.json");
  const rawRaw = readRawConfig(configPath);
  const raw = migrateLegacy(rawRaw);

  const envKeys = envProviderKeys();

  // Merge in this order: JSON < env (so env wins), then per-provider overriding arg.
  const providerKeys: Record<string, ProviderConfig> = {
    ...(raw.providers ?? {}),
    ...envKeys,
  };

  // Custom providers list (user-added via `/provider add-custom`).
  const customProviders: ProviderMeta[] = (raw.customProviders ?? []).filter(
    (p) =>
      typeof p?.id === "string" &&
      typeof p?.baseUrl === "string" &&
      Array.isArray(p?.models),
  );

  const allProviders = [...BUILTIN_PROVIDERS, ...customProviders];

  // Pick an active provider.
  const overrideProvider = overrides.provider?.trim();
  const envProvider = process.env.AI_PROVIDER?.trim();
  const configActive = raw.activeProvider?.trim();
  const argApiKey = overrides.apiKey?.trim();
  const legacyModel = raw.model?.trim();

  let activeProviderId: string | undefined =
    overrideProvider ?? envProvider ?? configActive;

  // If still nothing, pick the first provider that has a key (or arg apiKey).
  if (!activeProviderId && argApiKey) {
    // Default active to OpenRouter when the CLI flag forces a key.
    activeProviderId = "openrouter";
    providerKeys.openrouter = { apiKey: argApiKey };
  }

  if (!activeProviderId) {
    const firstWithKey = Object.keys(providerKeys)[0];
    if (firstWithKey) activeProviderId = firstWithKey;
  }

  // Default model selection.
  const overrideModel = overrides.model?.trim();
  const envModel = process.env.AI_MODEL?.trim();
  const configModel = raw.activeModel?.trim();

  let activeModel: string | undefined =
    overrideModel ?? envModel ?? configModel ?? legacyModel;

  // If active provider is known, validate the model belongs to it.
  if (activeProviderId) {
    const provider = findProvider(activeProviderId, customProviders);
    if (provider && activeModel && !isValidModelFor(activeModel, provider.models)) {
      activeModel = provider.defaultModel;
    }
    if (provider && !activeModel) {
      activeModel = provider.defaultModel;
    }
  }

  // Resolve final shape with sensible fallbacks.
  const provider =
    (activeProviderId ? findProvider(activeProviderId, customProviders) : undefined) ??
    allProviders[0];

  const model =
    activeModel ??
    provider?.defaultModel ??
    DEFAULT_MODEL;

  const apiKey =
    (activeProviderId && providerKeys[activeProviderId]?.apiKey) || "";

  const envAutoApprove =
    process.env.AI_AUTO_APPROVE === "1" ? true : undefined;
  const autoApprove = Boolean(
    overrides.autoApprove ?? envAutoApprove ?? raw.autoApprove,
  );

  const systemPrompt =
    overrides.systemPrompt?.trim() ||
    raw.systemPrompt?.trim() ||
    DEFAULT_SYSTEM_PROMPT;

  const maxHistoryMessages = raw.maxHistoryMessages ?? 50;
  const termuxIntegration = detectTermux(raw.termuxIntegration);

  return {
    activeProviderId: provider?.id ?? "",
    activeModel: model,
    providerKeys,
    customProviders,
    apiKey,
    baseUrl: provider?.baseUrl ?? "",
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

/**
 * Merged write: persist the new shape and drop any legacy `apiKey` field.
 * `customProviders` and individual provider keys are preserved.
 */
export function saveConfig(patch: Partial<RawConfig>): void {
  const configPath = join(configDir(), "config.json");
  mkdirSync(dirname(configPath), { recursive: true });
  const currentRaw = migrateLegacy(readRawConfig(configPath));
  const baseProviders = currentRaw.providers ?? {};
  const baseCustom = currentRaw.customProviders ?? [];
  const merged: RawConfig = {
    ...currentRaw,
    ...patch,
    providers: { ...baseProviders, ...(patch.providers ?? {}) },
    customProviders: patch.customProviders ?? baseCustom,
    // Always strip the legacy single-key field.
    apiKey: undefined,
    model: undefined,
  };
  writeFileSync(
    configPath,
    JSON.stringify(merged, null, 2),
    { mode: 0o600 },
  );
}

/** Set or clear a single provider's API key. */
export function setProviderKey(
  providerId: string,
  apiKey: string,
): void {
  saveConfig({
    providers: {
      [providerId]: { apiKey },
    },
  });
}

export function ensureDirs(): void {
  mkdirSync(configDir(), { recursive: true });
  mkdirSync(historyDir(), { recursive: true });
}
