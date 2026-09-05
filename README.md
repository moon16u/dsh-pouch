<p align="center">
  <img src="./assets/logo.png" width="96" height="96" alt="dsh-pouch logo" />
</p>

# dsh-pouch

**English** | [中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@moon16u/dsh-pouch.svg?color=cb3837)](https://www.npmjs.com/package/@moon16u/dsh-pouch)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-0.1.1--rc.2%20%7C%200.1.2--rc.1-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

> **dsh-pouch** is a pocket toolkit of practical, lightweight, and beautiful plugins designed for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).  
> It delivers out-of-the-box micro-extensions to enhance your daily workflow, interactive experience, and development productivity.

---

## 📦 Plugins Included

| Plugin | Type | Description |
| :--- | :--- | :--- |
| **[`@moon16u/dsh-plugin-restart`](./packages/dsh-plugin-restart)** | Host / CLI | Safe, detached DSH process restart command (`/dsh-restart`) and agent tool (`dsh_restart`) with a 3-second grace period. |
| **[`@moon16u/dsh-plugin-current-time`](./packages/dsh-plugin-current-time)** | Host / Agent | Injects the host's real date, time, and timezone into agent context at the start of every turn, so a long-running session never reasons from a stale date. |
| **[`@moon16u/dsh-plugin-session-id`](./packages/dsh-plugin-session-id)** | Web UI | Displays a native-styled Session ID badge in the web session header with one-click clipboard copy. |
| **[`@moon16u/dsh-plugin-web-search-tavily`](./packages/dsh-plugin-web-search-tavily)** | Capability Seam | Real-time web search provider backed by the Tavily REST API, seamlessly integrating with DSH's `ctx.web` capability seam. |
| **[`@moon16u/dsh-plugin-llm-headers`](./packages/dsh-plugin-llm-headers)** | LLM Seam + Web UI | Provider routes whose request headers are yours to set from `settings.yaml` — including the `User-Agent` the harness reserves for itself: literals, `${env:NAME}` interpolation, per-model overrides, `null` deletion, plus a visual **Request Headers** settings page. Wire up any of pi-ai's 37 built-in providers with headers only. |
| **[`@moon16u/dsh-plugin-mcp-console`](./packages/dsh-plugin-mcp-console)** | Web UI + Host | MCP server console in the settings page: runtime add/edit/enable/disable/reconnect/delete, per-tool switches, live status over SSE, and mcpServers JSON import. Zero MCP protocol code — everything rides the official `@deepseek-ai/dsh-mcp-client`. Profile-YAML MCP entries are auto-migrated into dynamic management on boot/refresh (and exportable back). |
| **[`@moon16u/dsh-plugin-llm-model-listing`](./packages/dsh-plugin-llm-model-listing)** | LLM Seam | Makes the Models page's "fetch models" button work against a gateway that serves its model list at another path, in its own response shape — one rule maps the listing URL to the real endpoint and translates the reply. |

---

## 🚀 Quick Start & Installation

### Method 1: One-Command Installation via DSH CLI (Recommended ⭐️⭐️⭐️⭐️⭐️)

Run a single command in your terminal. DSH will automatically download, bundle-register, and mount all 6 pocket plugins (zero manual configuration):

```bash
# 1. Install the entire toolkit via npm (recommended)
dsh plugin --profile web add @moon16u/dsh-pouch

# Or install directly from GitHub
dsh plugin --profile web add https://github.com/moon16u/dsh-pouch.git
```

---

### Method 2: Local Git Clone Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/moon16u/dsh-pouch.git ~/dsh-pouch
   ```

2. **Add the bundle to your DSH profile**:
   ```bash
   dsh plugin --profile web add file:~/dsh-pouch
   ```
   *DSH automatically detects `dsh.bundle` and applies the built-in `cordis.patch.yml` layer without manual configuration file edits.*

---

## 🛠️ Plugin Highlights

### 1. `@moon16u/dsh-plugin-restart`
* **Problem**: After editing plugins or configs, restarting DSH manually in an external terminal is tedious; killing the process directly inside an agent tool causes the session to freeze.
* **Solution**: Exposes `/dsh-restart` slash command and `dsh_restart` agent tool. Spawns an asynchronous detached worker process that returns the response immediately and restarts cleanly after 3 seconds.

### 2. `@moon16u/dsh-plugin-current-time`
* **Problem**: A model has no clock. It infers "today" from whatever the harness injected once at startup, so a session left open across midnight keeps reasoning from yesterday's date — and nothing in the transcript contradicts it.
* **Solution**: Hooks `agent/pre-step` and appends one wall-clock reading after the prompt on the first step of every turn. Once per turn rather than per step, so a tool-call loop does not bury the transcript in near-identical timestamps.

### 3. `@moon16u/dsh-plugin-session-id`
* **Problem**: Retrieving the current session UUID for debugging or log tracking requires digging into URLs or console logs.
* **Solution**: Injects a clean capsule button displaying the Session ID in the web header utility bar with instant one-click clipboard copying.

### 4. `@moon16u/dsh-plugin-web-search-tavily`
* **Problem**: Built-in search engines may be restricted or lack high-quality synthesized web answers.
* **Solution**: Formally implements the `ctx.web.registerSearchProvider` contract. Automatically resolves API keys from the `TAVILY_API_KEY` environment variable or DSH Credentials service.

### 5. `@moon16u/dsh-plugin-llm-headers`
* **Problem**: DSH merges its own attribution `User-Agent` into every provider request last, and a `headers` map written into `llm-pi-ai` cannot override that reserved name. Gateways that authenticate by client identity — Tencent CodeBuddy returns `500 {"code":11128,"msg":"request illegal"}` — are unreachable with configuration alone.
* **Solution**: Declare routes in your own `llm-headers` settings section, still served by the official `PiAiAdapter`; only the pi-ai provider is wrapped, so the configured headers get the final word before the socket. Ships with a **Request Headers** settings page (independent sidebar entry) — the stock provider cards expose no slot, and headers written into `llm-pi-ai` are stripped anyway. Wrapping the provider rather than the protocol object keeps pi-ai's own route implementations, so such routes wire up in a couple of lines. Routes without configured headers keep sending the DSH attribution unchanged, and deleting it is refused.
* **Version span**: the settings page reads the provider directory and writes settings over a dual-generation wire — DSH 0.1.1's `connection.api` (APIProxy) or DSH 0.1.2-rc.1's `remote.llm` / `remote.settings` namespaces — preferring whichever the host serves.

### 6. `@moon16u/dsh-plugin-mcp-console`
* **Problem**: The official way to attach MCP servers is a static `cordis.patch.yml` entry — no GUI, no runtime changes, and every restart to apply an edit. Declared servers show up as untouchable read-only instances.
* **Solution**: A full **MCP servers** settings section managing the official `@deepseek-ai/dsh-mcp-client` at runtime: one fiber per server via cordis dynamic assembly (hot edit, no DSH restart), master switches, per-tool enable/disable pills, live status + tool lists over SSE, and mcpServers JSON import. External agents writing MCP entries into `cordis.patch.yml` are handled by an auto-ingest engine: on boot/refresh the entries are migrated into `~/.dsh/dsh-mcp.json` (fiber takeover included, YAML trimmed precisely), reversible via `POST /export-yaml`. Secrets stay masked in every API response.

### 7. `@moon16u/dsh-plugin-llm-model-listing`
* **Problem**: The Models page's "fetch models" button requests `${baseURL}/models` and reads an OpenAI-shaped reply — one hard-coded path, one hard-coded shape, with no provider setting to redirect either. Gateways whose chat completions work fine but whose model list lives elsewhere can never answer it: Tencent CodeBuddy serves `POST /v2/chat/completions` and returns a hard 404 for `GET /v2/models`, keeping its 28-model list at `GET /v2/enterprises/personal/models` inside a vendor envelope. Every model has to be hand-typed, and re-typed whenever upstream adds one.
* **Solution**: One rule claims that listing URL. An exact GET on it is served from the rule's real endpoint with the probe's own headers forwarded, and the reply is translated into the four fields the reader wants (`id`, `name`, `context_window`, `max_output_tokens`), with a `modelsPath`, per-field name mapping, and `excludeTags` for the non-chat models a listing still advertises. Everything else passes through untouched — a `registerModelDiscovery` implementation would collide with `dsh-llm-pi-ai`'s (`DUPLICATE_DISCOVERY`) and would cost every catalog route its no-network answer, so the interception is one URL wide. The `fetch` hook chains rather than captures, so it coexists with `llm-headers`.

---

## 🧪 Testing

This monorepo uses pnpm workspaces and Node.js native test runner for contract and smoke tests:

```bash
cd dsh-pouch
pnpm install
pnpm test
```

---

## 📄 License & Credits

* [MIT License](./LICENSE) © 2026 moon16u
* Logo icon: [Toolbox icon](https://icons8.com/icon/41P574Kp7REI/toolbox) by [Icons8](https://icons8.com).
