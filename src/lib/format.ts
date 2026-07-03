/**
 * Lightweight format helpers used by the chat view.
 *
 * Nothing in here depends on an external markdown library — we keep it small to
 * stay friendly with Termux installs. Code fencing, inline `code`, **bold**, _italic_,
 * list bullets and headings are supported; anything else is rendered as plain text.
 *
 * Rendering is done with Ink (via <Text>); this module only prepares the segments.
 */

import { format } from "node:util";

export function estimateTokens(text: string): number {
  // Heuristic: ~4 chars per token. Good enough for a status-bar counter.
  return Math.max(0, Math.ceil(text.length / 4));
}

export function ellipsize(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "…";
  return text.slice(0, max - 1) + "…";
}

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "codeblock"; lang: string; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

/**
 * Minimal markdown-ish parser. Splits the text into segments that first paint
 * the structure of the message, then leave styling to Ink.
 */
export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const lines = text.split(/\r?\n/);
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const joined = paraBuf.join("\n");
    segments.push({ kind: "text", text: joined });
    paraBuf = [];
  };

  for (const raw of lines) {
    const line = raw;
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inCode) {
        segments.push({
          kind: "codeblock",
          lang: codeLang,
          text: codeBuf.join("\n"),
        });
        inCode = false;
        codeBuf = [];
        codeLang = "";
      } else {
        flushPara();
        inCode = true;
        codeLang = fence[1] ?? "";
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      segments.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushPara();
      segments.push({ kind: "quote", text: quote[1]! });
      continue;
    }

    if (line.match(/^[-*_]{3,}\s*$/)) {
      flushPara();
      segments.push({ kind: "rule" });
      continue;
    }

    const li = line.match(/^(\s*)([-*])\s+(.*)$/);
    if (li) {
      // accumulate list (single-level only)
      const indent = (li[1] ?? "").length;
      if (paraBuf.length > 0 && !segments.at(-1)?.kind) {
        flushPara();
      } else {
        flushPara();
      }
      const last = segments.at(-1);
      if (last?.kind === "list") {
        last.items.push("  ".repeat(indent / 2) + "• " + li[3]!);
      } else {
        segments.push({ kind: "list", items: ["• " + li[3]!] });
      }
      continue;
    }

    paraBuf.push(line);
  }

  if (inCode && codeBuf.length > 0) {
    segments.push({ kind: "codeblock", lang: codeLang, text: codeBuf.join("\n") });
  }
  flushPara();
  return segments;
}

export function wrap(text: string, width: number): string {
  if (width < 8) return text;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length <= width) {
      out.push(line);
      continue;
    }
    let current = "";
    for (const word of line.split(/\s+/)) {
      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += " " + word;
      } else {
        out.push(current);
        current = word;
      }
    }
    if (current.length > 0) out.push(current);
  }
  return out.join("\n");
}

/**
 * Build a stable, unique id for local messages / agent steps.
 */
export function makeId(prefix = "m"): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${t}${r}`;
}

export { format };
