#!/usr/bin/env node
/**
 * Entry point for `ai`. Parses CLI flags, loads config, then mounts the Ink TUI.
 */
import React from "react";
import { render } from "ink";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import { App } from "./App.js";
import { ensureDirs, loadConfig } from "./lib/config.js";
import { BUILTIN_PROVIDERS, findProvider } from "./lib/providers.js";

interface CliArgs {
  provider?: string;
  model?: string;
  autoApprove?: boolean;
  printPrompt?: boolean;
  printConfig?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--provider":
      case "-P":
        out.provider = argv[++i];
        break;
      case "--model":
      case "-m":
        out.model = argv[++i];
        break;
      case "--auto-approve":
        out.autoApprove = true;
        break;
      case "--print-config":
        out.printConfig = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (a.startsWith("--")) {
          // ignore unknown flags
        }
    }
  }
  return out;
}

function hasTermuxApi(): boolean {
  try {
    if (!process.env.PREFIX?.includes("com.termux")) return false;
    execFileSync("which", ["termux-toast"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(
      [
        "ai — multi-provider LLM CLI agent.",
        "",
        "Usage:",
        "  ai                                  Start an interactive chat session.",
        "  ai --provider <id> --model <id>     Override the active provider+model.",
        "  ai --auto-approve                   Skip confirmation for mutating tools.",
        "  ai --print-config                   Print resolved configuration and exit.",
        "  ai --help                           Show this help.",
        "",
        "Inside the chat:",
        "  /help                       Show slash commands.",
        "  /provider                   List & configure providers.",
        "  /model [name|provider/name] Show or set the model.",
        "  /auto on|off                Toggle auto-approval.",
        "  /clear                      Reset the conversation.",
        "  /quit                       Exit.",
        "",
        "Set up a provider first:",
        "  /provider add openrouter sk-or-v1-...",
        "  /provider use openrouter",
        "  /model",
        "",
      ].join("\n"),
    );
    return;
  }

  ensureDirs();
  const cfg = loadConfig({
    provider: args.provider,
    model: args.model,
    autoApprove: args.autoApprove,
  });

  if (args.printConfig) {
    process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
    return;
  }

  if (!cfg.activeProviderId || !cfg.apiKey) {
    process.stderr.write(
      "✗ No provider / API key configured.\n" +
        "  Run inside the chat:\n" +
        "    /provider list                       see built-in providers\n" +
        "    /provider add <id> <key>             register e.g. openrouter, openai, groq\n" +
        "    /provider use <id>                   activate\n" +
        "    /model                               pick a model\n" +
        `  Config file: ${cfg.configPath}\n\n`,
    );
  }

  const initialProviderMeta =
    findProvider(cfg.activeProviderId, cfg.customProviders) ??
    BUILTIN_PROVIDERS[0];
  const cwd = resolve(processCwd());
  const tui = (
    <App
      initialProviderId={cfg.activeProviderId}
      initialModel={cfg.model}
      providerKeys={cfg.providerKeys}
      customProviders={cfg.customProviders}
      initialProviderMeta={initialProviderMeta}
      systemPrompt={cfg.systemPrompt}
      cwd={cwd}
      hasTermuxApi={hasTermuxApi()}
    />
  );

  const { unmount, waitUntilExit } = render(tui, { exitOnCtrlC: false });
  process.on("SIGTERM", () => unmount());
  await waitUntilExit();
}

main().catch((err) => {
  process.stderr.write("ai: " + (err?.message ?? String(err)) + "\n");
  process.exit(1);
});

void existsSync;
