/**
 * Built-in tool registry.
 *
 * Every tool has a name, JSON schema (for the model), and an execute() function.
 * Tools that mutate the filesystem or run shell commands require explicit approval
 * unless `autoApprove` is enabled.
 */

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { ToolContext, ToolDefinition } from "../types.js";

const MAX_FILE_BYTES = 256 * 1024; // 256 KiB preview cap to keep the prompt small.
const MAX_FETCH_BYTES = 64 * 1024; // 64 KiB cap to avoid huge pages.
const MAX_NOTES = 200;
const SHELL_TIMEOUT_MS = 30_000;

const notesPath = join(homedir(), ".local", "share", "ai-cli", "notes.jsonl");

function readRelative(args: Record<string, unknown>, ctx: ToolContext): string {
  const raw = args.path;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("path is required");
  }
  const target = isAbsolute(raw) ? raw : resolve(ctx.cwd, raw);
  return target;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n...[truncated ${text.length - max} chars]`;
}

const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read a UTF-8 text file. Returns up to 256 KiB. Use this before editing to confirm contents.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Absolute path or path relative to the current working directory.",
      },
      startLine: {
        type: "number",
        description: "Optional 1-based line to start reading from (1-indexed).",
        default: 1,
      },
      maxLines: {
        type: "number",
        description: "Optional maximum number of lines to return.",
        default: 400,
      },
    },
    required: ["path"],
  },
  requiresApproval: false,
  async execute(args, ctx) {
    const target = readRelative(args, ctx);
    if (!existsSync(target)) {
      throw new Error(`No such file: ${target}`);
    }
    const stat = statSync(target);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${target}`);
    }
    const text = readFileSync(target, "utf8");
    const startLine = Math.max(1, Number(args.startLine ?? 1));
    const maxLines = Math.min(4000, Number(args.maxLines ?? 400));
    const lines = text.split(/\r?\n/);
    const slice = lines.slice(startLine - 1, startLine - 1 + maxLines);
    return truncate(
      `=== ${target} ===\n` +
        slice
          .map((l, i) => `${String(startLine + i).padStart(5, " ")}│ ${l}`)
          .join("\n"),
      MAX_FILE_BYTES,
    );
  },
};

const writeFileTool: ToolDefinition = {
  name: "write_file",
  description:
    "Write (overwrite or create) a UTF-8 text file. Always reads first unless you confirm overwrite is intended.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Destination file path." },
      content: { type: "string", description: "Full file contents to write." },
    },
    required: ["path", "content"],
  },
  requiresApproval: true,
  async execute(args, ctx) {
    const target = readRelative(args, ctx);
    const content = String(args.content ?? "");
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, content, "utf8");
    return `Wrote ${content.length} bytes to ${target}`;
  },
};

const listFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List entries in a directory (one per line, with type marker).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory to list. Defaults to current working directory.",
      },
      maxDepth: {
        type: "number",
        description: "Maximum depth to recurse (0 = this dir only).",
        default: 1,
      },
    },
    required: [],
  },
  requiresApproval: false,
  async execute(args, ctx) {
    const target = args.path
      ? isAbsolute(String(args.path))
        ? String(args.path)
        : resolve(ctx.cwd, String(args.path))
      : ctx.cwd;
    if (!existsSync(target)) throw new Error(`No such directory: ${target}`);
    const stat = statSync(target);
    if (!stat.isDirectory())
      throw new Error(`Path is not a directory: ${target}`);
    const maxDepth = Math.max(0, Number(args.maxDepth ?? 1));
    return renderTree(target, 0, maxDepth);
  },
};

function renderTree(dir: string, depth: number, maxDepth: number): string {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 500);
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${dir}/`];
  for (const e of entries) {
    const marker = e.isDirectory() ? "▸" : "·";
    lines.push(`${indent}  ${marker} ${e.name}`);
    if (e.isDirectory() && depth < maxDepth) {
      try {
        lines.push(renderTree(join(dir, e.name), depth + 1, maxDepth));
      } catch {
        /* permission */
      }
    }
  }
  return lines.join("\n");
}

const runShellTool: ToolDefinition = {
  name: "run_shell",
  description:
    "Execute a short shell command non-interactively. Use `sh -c` style invocations sparingly. Returns stdout (and stderr) with a 30s timeout.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "The exact command to run. Do not include shell metacharacters that mask intent.",
      },
      cwd: {
        type: "string",
        description: "Optional working directory override.",
      },
      timeoutMs: {
        type: "number",
        description: "Optional timeout override (max 60s).",
        default: SHELL_TIMEOUT_MS,
      },
    },
    required: ["command"],
  },
  requiresApproval: true,
  async execute(args, ctx) {
    const command = String(args.command ?? "").trim();
    if (!command) throw new Error("command is required");
    const cwd = args.cwd
      ? String(args.cwd)
      : ctx.cwd;
    const timeoutMs = Math.min(
      60_000,
      Math.max(1_000, Number(args.timeoutMs ?? SHELL_TIMEOUT_MS)),
    );

    return await new Promise<string>((resolveP, rejectP) => {
      const child = spawn(command, {
        shell: "/bin/sh",
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b) => {
        stdout += b.toString("utf8");
      });
      child.stderr.on("data", (b) => {
        stderr += b.toString("utf8");
      });
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        rejectP(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      child.on("error", (err) => {
        clearTimeout(timer);
        rejectP(err);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        const out = (stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "")).trim();
        const truncated = truncate(out, MAX_FILE_BYTES);
        if (code === 0) {
          resolveP(truncated || `(no output, exit 0)`);
        } else {
          rejectP(
            new Error(
              `exit ${code}${signal ? ` (${signal})` : ""}\n${truncated}`,
            ),
          );
        }
      });
    });
  },
};

const saveNoteTool: ToolDefinition = {
  name: "save_note",
  description:
    "Append a short note (≤ 4 KiB) to the user's local notes file (~/.local/share/ai-cli/notes.jsonl). Useful for capturing context.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Note contents (plain text)." },
      tag: { type: "string", description: "Optional single-word tag." },
    },
    required: ["text"],
  },
  requiresApproval: false,
  async execute(args) {
    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("text is required");
    const tag = args.tag ? String(args.tag).trim() : "";
    mkdirSync(resolve(notesPath, ".."), { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      tag,
      text: text.length > 4096 ? text.slice(0, 4096) + "..." : text,
    };
    const line = JSON.stringify(entry) + "\n";
    let existing = "";
    try {
      const stat = statSync(notesPath);
      if (stat.size > MAX_NOTES * 4096) {
        existing = "";
      } else {
        existing = readFileSync(notesPath, "utf8");
      }
    } catch {
      existing = "";
    }
    writeFileSync(notesPath, existing + line, "utf8");
    return `Saved note (${entry.text.length} chars)${tag ? ` #${tag}` : ""}`;
  },
};

const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch a public URL and return its plain text content (≤ 64 KiB). HTML is converted to text only.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "http(s) URL to fetch." },
    },
    required: ["url"],
  },
  requiresApproval: false,
  async execute(args) {
    const url = String(args.url ?? "");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
    const resp = await fetch(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "ai-cli/0.1 (+Termux)" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const buf = await resp.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf.slice(0, MAX_FETCH_BYTES));
    const contentType = resp.headers.get("content-type") ?? "";
    let body = text;
    if (contentType.includes("text/html") || /<[a-z!]/i.test(text)) {
      body = htmlToText(text);
    }
    return truncate(body, MAX_FETCH_BYTES);
  },
};

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const termuxClipboardTool: ToolDefinition = {
  name: "termux_clipboard",
  description:
    "Read or write the Android clipboard via Termux:API. Only works when the user's device has Termux:API installed and configured; otherwise this returns an error explaining what's needed.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "'read' copies clipboard contents into the conversation; 'write' overwrites the clipboard with `text`.",
        enum: ["read", "write"],
      },
      text: {
        type: "string",
        description: "Required when action is 'write'. The text to place on the clipboard.",
      },
    },
    required: ["action"],
  },
  requiresApproval: true,
  async execute(args, ctx) {
    if (!ctx.hasTermuxApi) {
      throw new Error(
        "Termux:API is not detected. Install the 'Termux:API' app and the 'termux-api' package, then try again.",
      );
    }
    const action = String(args.action ?? "read");
    if (action === "read") {
      const out = execFileSync("termux-clipboard-get", {
        encoding: "utf8",
        timeout: 10_000,
      });
      return trunc(out || "(empty clipboard)", 4096);
    }
    const text = String(args.text ?? "");
    execFileSync("termux-clipboard-set", [text], {
      timeout: 10_000,
    });
    return `Copied ${text.length} chars to clipboard.`;
  },
};

const termuxToastTool: ToolDefinition = {
  name: "termux_toast",
  description:
    "Show a short Android toast notification via Termux:API. Useful for confirming actions performed on the user's behalf.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Toast message (≤ 100 chars)." },
    },
    required: ["text"],
  },
  requiresApproval: true,
  async execute(args, ctx) {
    if (!ctx.hasTermuxApi) {
      throw new Error("Termux:API not detected.");
    }
    const text = String(args.text ?? "").slice(0, 100);
    execFileSync("termux-toast", [text], { timeout: 10_000 });
    return `Toast sent: ${text}`;
  },
};

function trunc(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export function registerDefaultTools(): ToolDefinition[] {
  return [
    readFileTool,
    writeFileTool,
    listFilesTool,
    runShellTool,
    saveNoteTool,
    webFetchTool,
    termuxClipboardTool,
    termuxToastTool,
  ];
}

export function makeToolContext(cwd: string, hasTermuxApi: boolean): ToolContext {
  return { cwd, home: homedir(), hasTermuxApi };
}
