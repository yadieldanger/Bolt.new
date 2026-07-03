/**
 * Slash commands recognised inside the chat input.
 *
 * Each command returns a `CommandResult` describing what the UI/RPC layer should do
 * (clear messages, switch model, save session, exit, …) plus optional text to render.
 */

import {
  BUILTIN_PROVIDERS,
  effectiveProviders,
  findProvider,
  formatModelRow,
  resolveModelInput,
  type ProviderMeta,
} from "./providers.js";
import type { ProviderConfig } from "../types.js";

export interface CommandResult {
  /** Plain text echo to display to the user. */
  echo: string;
  /** Mutate app state. */
  effect?: CommandEffect;
}

export type CommandEffect =
  | { type: "clear" }
  | { type: "exit" }
  | { type: "setActiveModel"; providerId: string; modelId: string }
  | { type: "setActiveProvider"; providerId: string }
  | { type: "setProviderKey"; providerId: string; apiKey: string }
  | { type: "addCustomProvider"; provider: ProviderMeta; apiKey?: string }
  | { type: "removeProvider"; providerId: string }
  | { type: "rememberLastListed"; list: { providerId: string; modelId: string }[] }
  | { type: "setAutoApprove"; value: boolean }
  | { type: "setSystemPrompt"; prompt: string }
  | { type: "loadSession"; id: string }
  | { type: "setCwd"; path: string };

export interface CommandState {
  activeProviderId: string;
  activeModel: string;
  providerKeys: Record<string, ProviderConfig>;
  customProviders: ProviderMeta[];
  /** Models most recently listed by `/model` for numbered selection. */
  lastListed?: { providerId: string; modelId: string }[];
  autoApprove: boolean;
  systemPrompt: string;
}

const COMMANDS: Record<
  string,
  (args: string, state: CommandState) => CommandResult
> = {
  help() {
    return {
      echo: [
        "Slash commands:",
        "  /help                       Show this help.",
        "  /provider …                  Configure providers (list / add / use / show).",
        "  /model [name|provider/name]  Show available models, or set the active one.",
        "  /clear                      Clear the current conversation.",
        "  /system [text]              Show or replace the system prompt.",
        "  /auto on|off                Toggle auto-approval for shell/write tools.",
        "  /save [name]                Save the current session.",
        "  /load <id>                  Load a saved session by id.",
        "  /tools                      List available tools.",
        "  /cwd [path]                 Print or change cwd.",
        "  /quit, /exit                Leave the chat.",
        "",
        "Providers are configured entirely at runtime — no manual JSON editing needed.",
        "Type `/provider` to list and `/provider add <id> <key>` to register an API key.",
      ].join("\n"),
    };
  },

  provider(args, state) {
    const sub = args.trim().split(/\s+/);
    const [verb, ...rest] = sub;
    const id = rest[0];
    const third = rest[1];

    if (!verb || verb === "list") {
      const lines: string[] = ["Providers:"];
      const activeId = state.activeProviderId;
      const customIds = new Set(state.customProviders.map((p) => p.id));
      for (const p of effectiveProviders(state.customProviders)) {
        const key = state.providerKeys[p.id]?.apiKey;
        const configured = key ? "configured" : p.requiresApiKey ? "no key" : "(no key needed)";
        const marker = activeId === p.id ? "●" : "○";
        const tag = customIds.has(p.id) ? " (custom)" : "";
        lines.push(
          `  ${marker} ${p.id.padEnd(11)} ${p.name}${tag}  — ${configured}`,
        );
      }
      lines.push("");
      lines.push("Tips:");
      lines.push("  /provider add <id> <key>                   register an API key for a built-in");
      lines.push("  /provider add-custom <id> <name> <baseUrl> [model] [key]");
      lines.push("  /provider use <id>                         make this provider active");
      lines.push("  /provider remove <id>                      forget the key for this provider");
      lines.push("  /provider show <id>                        masked key + base URL");
      return { echo: lines.join("\n") };
    }

    if (verb === "current") {
      const p = findProvider(state.activeProviderId, state.customProviders);
      if (!p) return { echo: "no active provider. Use /provider use <id>." };
      return {
        echo:
          `active provider: ${p.name}\n` +
          `  base URL:     ${p.baseUrl}\n` +
          `  requires key: ${p.requiresApiKey ? "yes" : "no"}\n` +
          `  model:        ${state.activeModel}\n` +
          (p.docsUrl ? `  docs:         ${p.docsUrl}` : ""),
      };
    }

    if (verb === "show") {
      if (!id) return { echo: "usage: /provider show <id>" };
      const p = findProvider(id, state.customProviders);
      if (!p) return { echo: `unknown provider: ${id}` };
      const key = state.providerKeys[p.id]?.apiKey ?? "";
      return {
        echo:
          `${p.name}\n` +
          `  id:     ${p.id}\n` +
          `  base:   ${p.baseUrl}\n` +
          `  key:    ${key ? maskKey(key) : "(not set)"}\n` +
          (p.docsUrl ? `  docs:   ${p.docsUrl}` : ""),
      };
    }

    if (verb === "add") {
      if (!id) {
        return {
          echo:
            "usage: /provider add <id> <key>\n" +
            "  e.g. /provider add openrouter sk-or-v1-...",
        };
      }
      const apiKey = third?.trim() ?? "";
      if (!apiKey) {
        const p = findProvider(id, state.customProviders);
        const where = p?.docsUrl
          ? `Get one at ${p.docsUrl}.`
          : "This provider doesn't require an API key — just /provider use " + id + ".";
        return {
          echo: `missing key for "${id}".\n  ${where}\n  Then: /provider add ${id} <your-key>`,
        };
      }
      const p = findProvider(id, state.customProviders);
      if (!p) {
        return {
          echo:
            `unknown provider: "${id}".\n` +
            "  Built-in options: " +
            BUILTIN_PROVIDERS.map((bp) => bp.id).join(", ") +
            "\n" +
            "  For arbitrary OpenAI-compatible APIs use /provider add-custom.",
        };
      }
      return {
        echo: `key saved for ${p.name}.`,
        effect: { type: "setProviderKey", providerId: p.id, apiKey },
      };
    }

    if (verb === "add-custom") {
      // usage: /provider add-custom <id> <name> <baseUrl> [defaultModel] [key]
      const [customId, name, baseUrl, defaultModelArg, keyArg] = rest;
      if (!customId || !name || !baseUrl) {
        return {
          echo:
            "usage: /provider add-custom <id> <name> <baseUrl> [defaultModel] [key]\n" +
            "  e.g. /provider add-custom mycorp myCorp https://api.mycorp.com/v1 my-model sk-...",
        };
      }
      const idLower = customId.toLowerCase();
      if (findProvider(idLower, state.customProviders)) {
        return { echo: `provider id "${idLower}" already exists.` };
      }
      const defaultModel = defaultModelArg ?? "default";
      const trimmedKey = keyArg?.trim() ?? "";
      const models: { id: string; name: string; supportsTools?: boolean }[] = [
        { id: defaultModel, name: defaultModel, supportsTools: false },
      ];
      // Custom providers almost always need a key, so default requiresApiKey to true
      // until the user explicitly tells us otherwise via /provider add <id> without a key.
      const newProvider: ProviderMeta = {
        id: idLower,
        name,
        label: idLower,
        baseUrl,
        defaultModel,
        models,
        requiresApiKey: true,
        note: "Custom provider, added at runtime.",
      };
      const reminder = trimmedKey
        ? "Key recorded."
        : `No key recorded — run /provider add ${idLower} <your-key> before /provider use ${idLower}.`;
      return {
        echo: `custom provider "${idLower}" added. ${reminder}`,
        effect: trimmedKey
          ? { type: "addCustomProvider", provider: newProvider, apiKey: trimmedKey }
          : { type: "addCustomProvider", provider: newProvider },
      };
    }

    if (verb === "use") {
      if (!id) return { echo: "usage: /provider use <id>" };
      const p = findProvider(id, state.customProviders);
      if (!p) {
        return {
          echo: `unknown provider: "${id}". See /provider list for built-ins.`,
        };
      }
      const key = state.providerKeys[p.id]?.apiKey;
      if (p.requiresApiKey && !key) {
        return {
          echo:
            `provider "${p.id}" has no key yet.\n` +
            "  Run: /provider add " +
            p.id +
            " <your-key>\n" +
            (p.docsUrl ? `  (get one at ${p.docsUrl})` : ""),
        };
      }
      return {
        echo: `provider → ${p.name}. Use /model to pick a model.`,
        effect: {
          type: "setActiveProvider",
          providerId: p.id,
        },
      };
    }

    if (verb === "remove") {
      if (!id) return { echo: "usage: /provider remove <id>" };
      const p = findProvider(id, state.customProviders);
      if (!p) return { echo: `unknown provider: "${id}".` };
      return {
        echo: `removed key for ${p.name}.`,
        effect: { type: "removeProvider", providerId: p.id },
      };
    }

    return {
      echo:
        `unknown /provider subcommand: "${verb}".\n` +
        "  Try: list, current, show <id>, add <id> <key>, add-custom …, use <id>, remove <id>.",
    };
  },

  model(args, state) {
    const arg = args.trim();

    // No args: list models on the active provider and accept numbered picks.
    if (!arg) {
      const active = findProvider(state.activeProviderId, state.customProviders);
      if (!active) {
        return {
          echo:
            "no active provider — /provider use <id> first.\n" +
            "  Built-ins: " +
            BUILTIN_PROVIDERS.map((p) => p.id).join(", "),
        };
      }
      if (active.models.length === 0) {
        return {
          echo:
            `${active.name} has no curated models yet.\n` +
            `Pick a specific id with /model ${active.id}/<model-id>.`,
        };
      }
      const lines: string[] = [
        `Models on ${active.name}  (active: ${state.activeModel}):`,
        "",
      ];
      const list: { providerId: string; modelId: string }[] = [];
      active.models.forEach((m, i) => {
        const isActive = m.id === state.activeModel;
        lines.push(
          `  ${String(i + 1).padStart(2, " ")}. ${formatModelRow(
            active.label,
            m,
            isActive,
          )}`,
        );
        list.push({ providerId: active.id, modelId: m.id });
      });
      lines.push("");
      lines.push("Pick with /model <n>  (e.g. /model 2)");
      lines.push("Or with /model <model-id>  on the Active provider");
      lines.push("Or with /model <provider-id>/<model-id>  to switch providers too");
      return {
        echo: lines.join("\n"),
        effect: { type: "rememberLastListed", list },
      };
    }

    // Try a `<provider>/<model>` form first (also handles bare provider id with trailing slash).
    const resolved =
      arg.includes("/")
        ? resolveModelInput(arg, state.activeProviderId, state.customProviders)
        : null;
    if (resolved) {
      const provider = resolved.provider;
      // If the user typed just "openai/", switch provider only — no model change.
      if (!resolved.modelId) {
        const hasKey =
          state.providerKeys[provider.id]?.apiKey || !provider.requiresApiKey;
        if (!hasKey) {
          return {
            echo:
              `provider "${provider.id}" has no key yet. Run /provider add ${provider.id} <your-key>.\n` +
              (provider.docsUrl ? `(get one at ${provider.docsUrl})` : ""),
          };
        }
        return {
          echo: `provider → ${provider.name}. Use /model to pick a model.`,
          effect: { type: "setActiveProvider", providerId: provider.id },
        };
      }
      const hasKey =
        state.providerKeys[provider.id]?.apiKey || !provider.requiresApiKey;
      if (!hasKey) {
        return {
          echo:
            `provider "${provider.id}" has no key yet. Run /provider add ${provider.id} <your-key>.\n` +
            (provider.docsUrl ? `(get one at ${provider.docsUrl})` : ""),
        };
      }
      return {
        echo: `→ ${provider.name} / ${resolved.modelId}`,
        effect: {
          type: "setActiveModel",
          providerId: provider.id,
          modelId: resolved.modelId,
        },
      };
    }

    // Numeric pick from the last /model listing.
    if (/^\d+$/.test(arg) && state.lastListed) {
      const idx = Number(arg) - 1;
      const target = state.lastListed[idx];
      if (!target) {
        return {
          echo: `no entry #${arg} in the previous /model listing. Run /model first.`,
        };
      }
      const p = findProvider(target.providerId, state.customProviders);
      if (!p) return { echo: `provider "${target.providerId}" not found.` };
      return {
        echo: `→ ${p.name} / ${target.modelId}`,
        effect: {
          type: "setActiveModel",
          providerId: p.id,
          modelId: target.modelId,
        },
      };
    }

    // Bare provider id (no slash) — switch the active provider without setting a model.
    if (!arg.includes("/")) {
      const asProvider = findProvider(arg, state.customProviders);
      if (asProvider) {
        const hasKey =
          state.providerKeys[asProvider.id]?.apiKey || !asProvider.requiresApiKey;
        if (!hasKey) {
          return {
            echo:
              `provider "${asProvider.id}" has no key yet. Run /provider add ${asProvider.id} <your-key>.\n` +
              (asProvider.docsUrl
                ? `(get one at ${asProvider.docsUrl})`
                : ""),
          };
        }
        return {
          echo: `provider → ${asProvider.name}. Use /model to pick a model.`,
          effect: { type: "setActiveProvider", providerId: asProvider.id },
        };
      }
    }

    // Bare model id on the active provider.
    const active = findProvider(state.activeProviderId, state.customProviders);
    if (active && active.models.some((m) => m.id === arg)) {
      return {
        echo: `→ ${active.name} / ${arg}`,
        effect: { type: "setActiveModel", providerId: active.id, modelId: arg },
      };
    }

    return {
      echo:
        `couldn't parse "${arg}".\n` +
        "  Try: /model 3   /model gpt-4o-mini   /model openai/gpt-4o-mini   /model openai/",
    };
  },

  clear() {
    return { echo: "cleared.", effect: { type: "clear" } };
  },

  system(args, state) {
    const text = args.trim();
    if (!text) {
      return { echo: `current system prompt:\n${state.systemPrompt}` };
    }
    return {
      echo: "system prompt updated.",
      effect: { type: "setSystemPrompt", prompt: text },
    };
  },

  auto(args, state) {
    const v = args.trim().toLowerCase();
    if (v === "on" || v === "1" || v === "true") {
      return {
        echo: "auto-approve is ON (destructive tools will run without confirmation).",
        effect: { type: "setAutoApprove", value: true },
      };
    }
    if (v === "off" || v === "0" || v === "false") {
      return {
        echo: "auto-approve is OFF (destructive tools will ask first).",
        effect: { type: "setAutoApprove", value: false },
      };
    }
    return {
      echo: `auto-approve: ${state.autoApprove ? "on" : "off"}. Use /auto on|off.`,
    };
  },

  save(args) {
    return {
      echo: `session saved (id: ${args.trim() || "auto"}).`,
    };
  },

  load(args) {
    const id = args.trim();
    if (!id) return { echo: "usage: /load <session-id>" };
    return { echo: `loading ${id}…`, effect: { type: "loadSession", id } };
  },

  tools(args) {
    if (args.trim().length > 0) return { echo: "/tools takes no arguments." };
    return {
      echo: [
        "Tools:",
        "  read_file(path, startLine?, maxLines?)        read text",
        "  write_file(path, content)                     overwrite [approval]",
        "  list_files(path?, maxDepth?)                  traverse dir",
        "  run_shell(command, cwd?, timeoutMs?)          exec sh [approval]",
        "  save_note(text, tag?)                         append note",
        "  web_fetch(url)                                HTTP GET → text",
        "  termux_clipboard(action='read'|'write', text?) Android clipboard [approval]",
        "  termux_toast(text)                            Android toast [approval]",
      ].join("\n"),
    };
  },

  quit() {
    return { echo: "bye.", effect: { type: "exit" } };
  },

  exit() {
    return { echo: "bye.", effect: { type: "exit" } };
  },
};

const ALIASES: Record<string, string> = {
  "?": "help",
  p: "provider",
  m: "model",
};

export function listCommands(): string[] {
  return Object.keys(COMMANDS).concat(Object.keys(ALIASES));
}

export function dispatch(raw: string, state: CommandState): CommandResult | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;
  // Split command + rest on first whitespace.
  const match = trimmed.match(/^\/([A-Za-z?]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const nameRaw = match[1];
  const args = match[2] ?? "";
  const resolved = ALIASES[nameRaw] ?? nameRaw;
  const handler = COMMANDS[resolved.toLowerCase()];
  if (!handler) {
    return { echo: `unknown command: /${nameRaw}. Try /help.` };
  }
  return handler(args, state);
}

export function isLikelyCommand(raw: string): boolean {
  return raw.trim().startsWith("/");
}

function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return key.slice(0, 6) + "…" + key.slice(-4) + ` (${key.length} chars)`;
}
