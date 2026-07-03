/**
 * Built-in provider catalog for the ai-cli tool.
 *
 * Each entry here represents a hosted (or local) API that speaks the
 * OpenAI-compatible `/v1/chat/completions` shape. The CLI keeps a curated,
 * hand-picked list of models per provider so that `/model` can show a useful
 * menu without making an additional API call.
 *
 * Users can add *custom* OpenAI-compatible providers at runtime via the
 * `/provider add-custom <id> <name> <base_url>` command — those land in
 * `customProviders` inside the config file.
 */

export interface ModelInfo {
  /** Model id sent to the API as-is. */
  id: string;
  /** Short display label for `/model` listings. */
  name: string;
  /** `:free` tier on aggregators. */
  free?: boolean;
  /** Indicates the model reliably supports tool calling. */
  supportsTools?: boolean;
  /** Optional single-line note shown next to the model name. */
  note?: string;
}

export interface ProviderMeta {
  /** Stable, lowercase id used in config & CLI. */
  id: string;
  /** Human display name. */
  name: string;
  /** Short label rendered in the status bar. */
  label: string;
  /** OpenAI-compatible base URL (must end in `/v1` or equivalent). */
  baseUrl: string;
  /** Optional extra headers always sent with requests (e.g. attribution). */
  defaultHeaders?: Record<string, string>;
  /** Default model picked on first use. */
  defaultModel: string;
  /** Curated model catalogue used by `/model`. */
  models: ModelInfo[];
  /** Local providers (e.g. Ollama) can opt out of requiring a key. */
  requiresApiKey: boolean;
  /** Where users can register & grab a key. */
  docsUrl?: string;
  /** Optional human note (e.g. capacity caveats). */
  note?: string;
}

/** Built-in catalogue. Order = display order in `/provider list`. */
export const BUILTIN_PROVIDERS: ProviderMeta[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    label: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/freebuff/ai-cli",
      "X-Title": "ai-cli",
    },
    defaultModel: "google/gemini-2.0-flash-exp:free",
    requiresApiKey: true,
    docsUrl: "https://openrouter.ai/keys",
    note: "Aggregator across many providers — single key, hundreds of models.",
    models: [
      {
        id: "google/gemini-2.0-flash-exp:free",
        name: "Gemini 2.0 Flash (free)",
        free: true,
        supportsTools: true,
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        name: "Llama 3.3 70B Instruct (free)",
        free: true,
        supportsTools: true,
      },
      {
        id: "qwen/qwen-2.5-72b-instruct:free",
        name: "Qwen 2.5 72B Instruct (free)",
        free: true,
        supportsTools: true,
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini",
        supportsTools: true,
        note: "Cheap, very capable, paid.",
      },
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        supportsTools: true,
        note: "Strong reasoning, paid.",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    label: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresApiKey: true,
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o mini", supportsTools: true },
      { id: "gpt-4o", name: "GPT-4o", supportsTools: true },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", supportsTools: true },
      { id: "o1-mini", name: "o1-mini", supportsTools: true, note: "Reasoning model." },
      { id: "o1", name: "o1", supportsTools: true, note: "Reasoning model, paid." },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", supportsTools: true },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    label: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    requiresApiKey: true,
    docsUrl: "https://console.groq.com/keys",
    note: "Very fast inference, generous free tier.",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B Versatile",
        supportsTools: true,
      },
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        supportsTools: true,
        note: "Lowest latency.",
      },
      {
        id: "mixtral-8x7b-32768",
        name: "Mixtral 8x7B (32k)",
        supportsTools: true,
      },
      {
        id: "gemma2-9b-it",
        name: "Gemma 2 9B Instruct",
        supportsTools: false,
      },
    ],
  },
  {
    id: "together",
    name: "Together AI",
    label: "together",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    requiresApiKey: true,
    docsUrl: "https://api.together.xyz/settings/api-keys",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        name: "Llama 3.3 70B Instruct Turbo",
        supportsTools: true,
      },
      {
        id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
        name: "Qwen 2.5 72B Instruct Turbo",
        supportsTools: true,
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        name: "DeepSeek R1",
        supportsTools: false,
        note: "Reasoning model, paid.",
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    label: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    requiresApiKey: true,
    docsUrl: "https://platform.deepseek.com/api_keys",
    note: "Cheap paid — strong reasoning.",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat (V3)",
        supportsTools: true,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner (R1)",
        supportsTools: false,
        note: "Reasoning model.",
      },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    label: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    requiresApiKey: true,
    docsUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-small-latest", name: "Mistral Small", supportsTools: true },
      { id: "mistral-large-latest", name: "Mistral Large", supportsTools: true },
      { id: "open-mistral-7b", name: "Open Mistral 7B", supportsTools: true },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini (OpenAI-compat)",
    label: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    requiresApiKey: true,
    docsUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", supportsTools: true },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", supportsTools: true },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", supportsTools: true },
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    label: "perplexity",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "llama-3.1-sonar-large-128k-online",
    requiresApiKey: true,
    docsUrl: "https://www.perplexity.ai/settings/api",
    note: "Online search-augmented completions.",
    models: [
      {
        id: "llama-3.1-sonar-large-128k-online",
        name: "Sonar Large 128k Online",
        supportsTools: false,
      },
      {
        id: "llama-3.1-sonar-small-128k-online",
        name: "Sonar Small 128k Online",
        supportsTools: false,
      },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    label: "ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    requiresApiKey: false,
    docsUrl: "https://ollama.com",
    note: "Run models locally; no API key needed.",
    models: [
      { id: "llama3.2", name: "Llama 3.2 (default)", supportsTools: true },
      { id: "qwen2.5", name: "Qwen 2.5", supportsTools: true },
      { id: "mistral", name: "Mistral 7B", supportsTools: false },
      { id: "deepseek-r1", name: "DeepSeek R1", supportsTools: false },
    ],
  },
];

/** Look up a provider by id, including custom providers. */
export function findProvider(
  id: string,
  custom: ProviderMeta[] = [],
): ProviderMeta | undefined {
  const lower = id.toLowerCase();
  return (
    BUILTIN_PROVIDERS.find((p) => p.id === lower) ??
    custom.find((p) => p.id === lower)
  );
}

/** Total catalogue for `/provider list` (built-in + custom). */
export function effectiveProviders(custom: ProviderMeta[] = []): ProviderMeta[] {
  return [...BUILTIN_PROVIDERS, ...custom];
}

/** Pretty-print provider & model rows for `/model` and `/provider list`. */
export function formatModelRow(
  providerLabel: string,
  m: ModelInfo,
  active: boolean,
): string {
  const tag = m.free ? " (free)" : "";
  const tools = m.supportsTools === false ? " [no-tools]" : "";
  const bullet = active ? "●" : "○";
  return `${bullet} ${providerLabel}/${m.id}  — ${m.name}${tag}${tools}`;
}

/**
 * Resolve a model input string like `"openai/gpt-4o-mini"` into the right
 * provider/model pair. Falls back to the active provider if the input has no
 * `/` separator and matches a model id within that provider.
 */
export interface ModelResolution {
  provider: ProviderMeta;
  modelId: string;
}

export function resolveModelInput(
  input: string,
  activeProviderId: string,
  custom: ProviderMeta[] = [],
): ModelResolution | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/")) {
    // Could be `provider/model` (two slashes for OpenRouter's `org/model` ids
    // is unavoidable). We always split on the FIRST `/`.
    const idx = trimmed.indexOf("/");
    const providerId = trimmed.slice(0, idx);
    const rest = trimmed.slice(idx + 1);
    const provider = findProvider(providerId, custom);
    if (!provider) return null;
    return { provider, modelId: rest };
  }

  const active = findProvider(activeProviderId, custom);
  if (!active) return null;
  if (active.models.some((m) => m.id === trimmed)) {
    return { provider: active, modelId: trimmed };
  }
  return null;
}
