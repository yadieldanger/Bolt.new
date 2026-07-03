# ai-cli

A complete AI agent CLI for the **terminal**, optimized for mobile (Termux on Android) and powered by **multiple OpenAI-compatible providers**. Streams responses token-by-token, supports **tool calling** (`read_file`, `write_file`, `run_shell`, `web_fetch`, plus Termux integrations), runs entirely from a single Node binary, and stores history locally.

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

Most AI CLIs assume a desktop terminal and write to ~120 columns. This one is built for thumb typing: minimal chrome, no confirm-on-everything, large readable text, and good behavior when your phone autocorrects or your thumb lands on `Ctrl+C`. It speaks any OpenAI-compatible chat-API, so you can route the same `/model` / `/provider` workflow to OpenRouter, OpenAI, Groq, DeepSeek, Mistral, Gemini, Together, Perplexity, a local Ollama, or your own custom endpoint. The model can *do* things on the device, not just chat.

## Features

- **Live streaming** with a 50 ms throttle so Termux doesn't choke.
- **Multi-provider support** — switch between OpenRouter, OpenAI, Groq, Together, DeepSeek, Mistral, Gemini (OpenAI-compat), Perplexity, Ollama, or any custom OpenAI-compatible endpoint at runtime.
- **Provider-aware `/model`** — list curated models per provider, pick by number, or jump straight to a specific `provider/model` id.
- **Tool calling** — eight built-in tools, all pure JS, zero native deps.
- **Approval gate** for any tool that mutates the device (`run_shell`, `write_file`, `termux_clipboard`, `termux_toast`). Toggle globally with `/auto on`.
- **Inline tool approval** rendered in the chat stream with a Y/N keystroke.
- **Persistent sessions** (`~/.local/share/ai-cli/sessions/*.jsonl`).
- **Local notes** via `save_note` (great for "remember this for later").
- **Termux:API integration** — read/write the Android clipboard, pop toasts via `termux-toast`.
- **Markdown rendering** — code fences, lists, headings, quotes, inline `code` / **bold** / *italic*.
- **Cancel a stream** with `Ctrl+C` (returns to idle).
- **Pure JS, ESM, Node 18+** — no native compilation, fast Termux install.

## Install

**From npm (once published):**

```sh
npm install -g @admin_0513/ai-cli
ai
```

**From source:**

```sh
git clone https://github.com/yadieldanger/Bolt.new.git ai-cli
cd ai-cli
npm install            # build runs automatically via the prepare hook
./bin/ai.js
# or, with link so `ai` works from anywhere:
npm link && ai
```

## Quick start (Termux)

```sh
pkg install nodejs git
git clone https://github.com/yadieldanger/Bolt.new.git ai-cli
cd ai-cli
npm install            # build runs automatically via the prepare hook
./bin/ai.js
```

Then inside the chat:

```
/provider add openrouter sk-or-v1-...
/provider use openrouter
/model
/model 2
```

Get an OpenRouter key at <https://openrouter.ai/keys> (it's free to sign up; choose any `:free` model). Or pick any of the other built-in providers (groq, openai, mistral, …) — each has its own keys page linked below.

To install globally so `ai` works anywhere:

```sh
npm link
ai
```

## Providers

| id           | name                       | key env var            | get a key                                              |
|--------------|----------------------------|------------------------|--------------------------------------------------------|
| `openrouter` | OpenRouter                 | `OPENROUTER_API_KEY`   | <https://openrouter.ai/keys>                           |
| `openai`     | OpenAI                     | `OPENAI_API_KEY`       | <https://platform.openai.com/api-keys>                 |
| `groq`       | Groq                       | `GROQ_API_KEY`         | <https://console.groq.com/keys>                        |
| `together`   | Together AI                | `TOGETHER_API_KEY`     | <https://api.together.xyz/settings/api-keys>           |
| `deepseek`   | DeepSeek                   | `DEEPSEEK_API_KEY`     | <https://platform.deepseek.com/api_keys>               |
| `mistral`    | Mistral                    | `MISTRAL_API_KEY`      | <https://console.mistral.ai/api-keys>                  |
| `gemini`     | Google Gemini (OpenAI)     | `GEMINI_API_KEY`       | <https://aistudio.google.com/apikey>                   |
| `perplexity` | Perplexity                 | `PERPLEXITY_API_KEY`   | <https://www.perplexity.ai/settings/api>               |
| `ollama`     | Ollama (local)             | _none_                 | <https://ollama.com>                                   |

You can also register an arbitrary OpenAI-compatible endpoint that isn't in this list:

```
/provider add-custom mycorp myCorp https://api.mycorp.com/v1 my-default-model my-api-key
```

## Slash commands

| Command                          | What it does                                                                                  |
|----------------------------------|-----------------------------------------------------------------------------------------------|
| `/help`                          | Show all slash commands.                                                                      |
| `/provider` *(alias `/p`)*       | List configured providers, show which is active.                                              |
| `/provider current`              | Show the active provider's base URL, model, and docs link.                                    |
| `/provider show <id>`            | Show a provider's base URL, model list, and masked API key.                                   |
| `/provider add <id> <key>`       | Register (or replace) an API key for a built-in provider.                                     |
| `/provider add-custom …`         | Register your own OpenAI-compatible provider.                                                 |
| `/provider use <id>`             | Switch the active provider (uses its default model).                                          |
| `/provider remove <id>`          | Forget the cached API key for a provider.                                                     |
| `/model` *(alias `/m`)*          | Show the active provider's curated model list; remember numbers for `/model <n>`.             |
| `/model <n>`                     | Pick model #n from the last `/model` listing.                                                 |
| `/model <model-id>`              | Set the active model on the current active provider.                                          |
| `/model <provider>/<model>`      | Switch provider+model in one go (e.g. `/model openai/gpt-4o-mini`).                            |
| `/model openai/`                 | Switch active provider to `openai` (keeps current model if it exists there, else default).    |
| `/auto on\|off`                  | Toggle auto-approval for mutating tools.                                                       |
| `/clear`                         | Reset the conversation.                                                                       |
| `/system [text]`                 | Show or replace the system prompt.                                                            |
| `/save [name]`                   | Tag the current session id.                                                                   |
| `/load <id>`                     | Load a saved session from `~/.local/share/ai-cli/sessions/`.                                  |
| `/tools`                         | List every available tool.                                                                    |
| `/cwd [path]`                    | Show or change the working directory referenced by `read_file`.                               |
| `/quit`, `/exit`                 | Exit.                                                                                         |

## Typical first-run flow

```text
› /provider
Providers:
  ○ openrouter    OpenRouter                  — no key
  ○ openai        OpenAI                      — no key
  ○ groq          Groq                        — no key
  ○ together      Together AI                 — no key
  ○ deepseek      DeepSeek                    — no key
  ○ mistral       Mistral                     — no key
  ○ gemini        Google Gemini (OpenAI-compat)— no key
  ○ perplexity    Perplexity                  — no key
  ○ ollama        Ollama (local)              — (no key needed)

› /provider add openrouter sk-or-v1-...
key saved for OpenRouter.

› /provider use openrouter
provider → OpenRouter. Use /model to pick a model.

› /model
Models on OpenRouter  (active: google/gemini-2.0-flash-exp:free):
   1. ● openrouter/google/gemini-2.0-flash-exp:free  — Gemini 2.0 Flash (free)
   2. ○ openrouter/meta-llama/llama-3.3-70b-instruct:free  — Llama 3.3 70B Instruct (free)
   3. ○ openrouter/qwen/qwen-2.5-72b-instruct:free  — Qwen 2.5 72B Instruct (free)
   4. ○ openrouter/openai/gpt-4o-mini  — GPT-4o mini
   5. ○ openrouter/anthropic/claude-3.5-sonnet  — Claude 3.5 Sonnet

› /model 3
→ OpenRouter / qwen/qwen-2.5-72b-instruct:free
```

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

1. CLI flags: `--provider <id>`, `--model <id>`, `--auto-approve`
2. Environment: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, plus `AI_PROVIDER`, `AI_MODEL`
3. Config file: `~/.config/ai-cli/config.json` — **shaped by the CLI itself**: you don't need to edit it by hand. Use `/provider add …` to register keys, `/provider use …` to switch, `/model …` to pick a model.

The on-disk shape (managed for you):

```json
{
  "providers": {
    "openrouter": { "apiKey": "sk-or-v1-…" },
    "groq":       { "apiKey": "gsk_…" }
  },
  "customProviders": [],
  "activeProvider": "openrouter",
  "activeModel": "google/gemini-2.0-flash-exp:free"
}
```

If your config still has a legacy top-level `apiKey` field, the loader migrates it to `providers.openrouter.apiKey` on the next save.

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
   ├── ApprovalView.tsx  # Inline Y/N prompting
   ├── InputBox.tsx      # Prompt + text input
   ├── MessageView.tsx   # Markdown-ish renderer
   ├── StatusBar.tsx     # Compact footer (provider/model, ask/AUTO, tokens, cwd)
   └── StreamingView.tsx
└── lib/
   ├── config.ts         # env + config.json loader
   ├── format.ts         # markdown parsing, ids
   ├── history.ts        # JSONL session store
   ├── llm.ts            # OpenAI-compatible client used across providers
   ├── providers.ts      # Built-in catalogue + helpers
   ├── slash.ts          # /command dispatcher (incl. /provider + /model)
   └── tools.ts          # Tool registry + executors
```

## License

MIT.
