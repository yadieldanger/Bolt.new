/**
 * Persistent session history.
 *
 * Each session is appended as one JSON object per line (JSONL), at:
 *   ~/.local/share/ai-cli/sessions/<id>.jsonl
 *
 * JSONL is forgiving: a corrupt trailing line can be dropped without losing the rest.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ChatMessage, SessionMeta } from "../types.js";

const SESSION_PREFIX = "session-";

function newSessionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${SESSION_PREFIX}${stamp}-${rand}`;
}

export interface SessionFile {
  id: string;
  path: string;
}

function listSessionFiles(dir: string): SessionFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(SESSION_PREFIX) && f.endsWith(".jsonl"))
    .map((f) => ({ id: f.replace(/\.jsonl$/, ""), path: join(dir, f) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function listSessions(dir: string): SessionMeta[] {
  return listSessionFiles(dir).map(({ id, path }) => {
    let count = 0;
    let startedAt = Date.now();
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as ChatMessage;
          if (msg.role !== "system") count++;
          if (count === 1) startedAt = msg.timestamp;
        } catch {
          /* skip bad line */
        }
      }
    } catch {
      /* unreadable */
    }
    return { id, startedAt, messageCount: count };
  });
}

export function loadSession(dir: string, id: string): ChatMessage[] {
  const file = listSessionFiles(dir).find((f) => f.id === id);
  if (!file) throw new Error(`Session not found: ${id}`);
  const messages: ChatMessage[] = [];
  const text = readFileSync(file.path, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line) as ChatMessage);
    } catch {
      /* skip bad line */
    }
  }
  return messages;
}

export function createSession(dir: string): SessionFile {
  mkdirSync(dir, { recursive: true });
  const id = newSessionId();
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, "");
  return { id, path };
}

export function appendMessage(file: SessionFile, message: ChatMessage): void {
  // JSONL append: read-modify-write is fine at this scale.
  const current = existsSync(file.path) ? readFileSync(file.path, "utf8") : "";
  const line = JSON.stringify(message) + "\n";
  writeFileSync(file.path, current + line);
}
