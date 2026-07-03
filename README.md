# ai-cli

A complete AI agent CLI for the **terminal**, optimized for mobile (Termux on Android) and powered by **OpenRouter**. Streams responses token-by-token, supports **tool calling** (`read_file`, `write_file`, `run_shell`, `web_fetch`, plus Termux integrations), runs entirely from a single Node binary, and stores history locally.

```text
› you
   list the files in the current directory

● assistant
   I'll list the files for you.

🔧 list_files
›  ┌─ ~/src/ai-cli
   │  ▸ components
   │  ▸ lib
   │  ▸ App.tsx
   │  ▸ index.tsx
← list_files
   === ~/src/ai-cli ===
   App.tsx
   components/
   lib/
   index.tsx
```

## Why

Most AI CLIs assume a desktop terminal and write to ~120 columns. This one is built for thumb typing: minimal chrome, no confirm-on-everything, large readable text, and good behavior when your phone autocorrects or your thumb lands on `Ctrl+C`. It also speaks the OpenRouter API (any model, including free ones) and lets the model *do* things on the device instead of just chatting.

## Features

- **Live streaming** with a 50 ms throttle so Termux doesn't choke.
- **Tool calling** — eight built-in tools, all pure JS, zero native deps.
- **Approval gate** for any tool that mutates the device (`run_shell`, `write_file`, `termux_clipboard`, `termux_toast`). Toggle globally with `/auto on`.
- **Inline tool approval** rendered in the chat stream with a Y/N keystroke.
- **Persistent sessions** (`~/.local/share/ai-cli/sessions/*.jsonl`).
- **Local notes** via `save_note` (great for "remember this for later").
- **Termux:API integration** — read/write the Android clipboard, pop toasts via `termux-toast`.
- **Markdown rendering** — code fences, lists, headings, quotes, inline `code` / **bold** / *italic*.
- **Cancel a stream** with `Ctrl+C` (returns to idle).
- **Pure JS, ESM, Node 18+** — no native compilation, fast Termux install.

## Quick start (Termux)

```sh
pkg install nodejs git
git clone <this-repo> ai-cli
cd ai-cli
npm install            # build runs automatically via the prepare hook
export OPENROUTER_API_KEY=sk-or-v1-...
./bin/ai.js
```

Get an OpenRouter key at <https://openrouter.ai/keys> (it's free to sign up; choose any `:free` model).

To install globally so `ai` works anywhere:

```sh
npm link
ai
```

To make the API key persistent *inside* the tool:

```sh
mkdir -p ~/.config/ai-cli
echo '{"apiKey":"sk-or-v1-..."}' > ~/.config/ai-cli/config.json
chmod 600 ~/.config/ai-cli/config.json
```

## Slash commands

| Command          | What it does                                                       |
|------------------|--------------------------------------------------------------------|
| `/help`          | Show all slash commands.                                           |
| `/model [name]`  | Show or change the current model.                                  |
| `/auto on\|off`  | Toggle auto-approval for mutating tools.                           |
| `/clear`         | Reset the conversation.                                            |
| `/system [text]` | Show or replace the system prompt.                                 |
| `/save [name]`   | Tag the current session id.                                        |
| `/load <id>`     | Load a saved session from `~/.local/share/ai-cli/sessions/`.       |
| `/tools`         | List every available tool.                                         |
| `/cwd [path]`    | Show or change the working directory referenced by `read_file`.    |
| `/quit`          | Exit.                                                              |

## Tools available to the model

| Tool                | Approval | Notes                                                   |
|---------------------|----------|---------------------------------------------------------|
| `read_file`         | no       | Reads up to 256 KiB, line-numbered.                     |
| `list_files`        | no       | Recursive tree, depth-limited.                          |
| `write_file`        | **yes**  | Overwrites any file path; warns on `.env`/`.git`.       |
| `run_shell`         | **yes**  | Non-interactive shell; 30 s timeout; warns on `rm -rf`. |
| `save_note`         | no       | Append to `~/.local/share/ai-cli/notes.jsonl`.          |
| `web_fetch`         | no       | HTTP(S) GET, HTML converted to text, ≤ 64 KiB.          |
| `termux_clipboard`  | **yes**  | `read` / `write` the Android clipboard via Termux:API.  |
| `termux_toast`      | **yes**  | Show a short notification.                              |

Press **y** to approve, **n** to deny. Hold **Ctrl+C** to bail out of the chat.

## Configuration

Resolution order (highest first):

1. CLI flags: `--model <id>`, `--auto-approve`
2. Environment: `OPENROUTER_API_KEY`, `AI_MODEL`, `AI_AUTO_APPROVE`
3. Config file: `~/.config/ai-cli/config.json`
4. Built-in defaults

Default model is **google/gemini-2.0-flash-exp:free** — it supports tool calling and is fast on small contexts. Other good picks:

- `meta-llama/llama-3.3-70b-instruct:free`
- `qwen/qwen-2.5-72b-instruct:free`
- `openai/gpt-4o-mini` (cheap, paid)

Switch at runtime with `/model`.

## Mobile tips

- **Enable the extra-keys row** in Termux (long-press terminal → "Extra keys") — `Ctrl` and arrows make the prompt more pleasant.
- **One message at a time.** The CLI streams tokens as they arrive; don't double-tap Enter.
- **Long prompts.** For multi-line, run `termux-setup-storage`, then paste via `Ctrl+Alt+V` from your phone. (Multi-line edit isn't implemented yet — PRs welcome.)
- **Battery.** Streaming models wakes the network. The status bar shows cumulative token use; clear the conversation with `/clear` between big tasks.

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm run dev         # tsc --watch
npm run build       # tsc + chmod bin/ai.js
```

Built into `dist/`. The `bin/ai.js` shebang wrapper loads the compiled module.

## File layout

```
src/
├── App.tsx              # Ink TUI orchestrator
├── index.tsx            # CLI entry
├── types.ts             # Shared TS types
└── components/
│   ├── ApprovalView.tsx # Inline Y/N prompting
│   ├── InputBox.tsx     # Prompt + text input
│   ├── MessageView.tsx  # Markdown-ish renderer
│   ├── StatusBar.tsx    # Compact footer
│   └── StreamingView.tsx
└── lib/
    ├── config.ts        # env + config.json loader
    ├── format.ts        # markdown parsing, ids
    ├── history.ts       # JSONL session store
    ├── openrouter.ts    # OpenAI SDK pointed at OpenRouter
    ├── slash.ts         # /command dispatcher
    └── tools.ts         # Tool registry + executors
```

## License

MIT.
