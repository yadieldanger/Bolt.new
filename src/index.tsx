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

interface CliArgs {
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
        "ai — OpenRouter-powered CLI agent.",
        "",
        "Usage:",
        "  ai                       Start an interactive chat session.",
        "  ai --model <id>          Start with a specific model override.",
        "  ai --auto-approve        Skip confirmation prompts for mutating tools.",
        "  ai --print-config        Print resolved configuration and exit.",
        "  ai --help                Show this help.",
        "",
        "Inside the chat:",
        "  /help            Show slash commands.",
        "  /model [name]    Show or set the model.",
        "  /auto on|off     Toggle auto-approval at runtime.",
        "  /clear           Reset the conversation.",
        "  /quit            Exit.",
        "",
      ].join("\n"),
    );
    return;
  }

  ensureDirs();
  const cfg = loadConfig({
    model: args.model,
    autoApprove: args.autoApprove,
  });

  if (args.printConfig) {
    process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
    return;
  }

  if (!cfg.apiKey) {
    process.stderr.write(
      "✗ OPENROUTER_API_KEY not set.\n" +
        "  Set it as an environment variable, or save it to:\n" +
        `    ${cfg.configPath}\n` +
        "  Visit https://openrouter.ai/keys and paste your key starting with sk-or-...\n\n",
    );
  }

  const cwd = resolve(processCwd());
  const tui = (
    <App
      apiKey={cfg.apiKey}
      initialModel={cfg.model}
      systemPrompt={cfg.systemPrompt}
      cwd={cwd}
      hasTermuxApi={hasTermuxApi()}
    />
  );

  // Cleanly unmount on SIGINT — Ink handles resize already.
  const { unmount, waitUntilExit } = render(tui, { exitOnCtrlC: false });
  process.on("SIGTERM", () => unmount());
  await waitUntilExit();
}

main().catch((err) => {
  process.stderr.write("ai: " + (err?.message ?? String(err)) + "\n");
  process.exit(1);
});

// Hush unused import warning on builds where the env tweak is dynamically used.
void existsSync;
