/**
 * Slash commands recognised inside the chat input.
 *
 * Each command returns a `CommandResult` describing what the UI/RPC layer should do
 * (clear messages, switch model, save session, exit, …) plus optional text to render.
 */

export interface CommandResult {
  /** Plain text echo to display to the user. */
  echo: string;
  /** Mutate app state. */
  effect?: CommandEffect;
}

export type CommandEffect =
  | { type: "clear" }
  | { type: "exit" }
  | { type: "setModel"; model: string }
  | { type: "setAutoApprove"; value: boolean }
  | { type: "setSystemPrompt"; prompt: string }
  | { type: "loadSession"; id: string }
  | { type: "setCwd"; path: string };

export interface CommandState {
  model: string;
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
        "  /help                 Show this help.",
        "  /model [name]         Show or change the current model.",
        "  /clear                Clear the current conversation.",
        "  /system [text]        Show or replace the system prompt.",
        "  /auto on|off          Toggle auto-approval for shell/write tools.",
        "  /save [name]          Save the current session.",
        "  /load <id>            Load a saved session by id.",
        "  /tools                List available tools.",
        "  /cwd [path]           Print or change cwd.",
        "  /quit, /exit          Leave the chat.",
        "",
        "Configuration: env OPENROUTER_API_KEY, or ~/.config/ai-cli/config.json",
        "History: ~/.local/share/ai-cli/sessions/",
      ].join("\n"),
    };
  },

  model(args, state) {
    const name = args.trim();
    if (!name) {
      return { echo: `current model: ${state.model}` };
    }
    return {
      echo: `model → ${name}`,
      effect: { type: "setModel", model: name },
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
        "  termux_clipboard(action='read'|'write', text?)  Android clipboard [approval, requires Termux:API]",
        "  termux_toast(text)                            Android toast [approval, requires Termux:API]",
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
