<p align="center">
  <img src="./assets/logo.png" width="96" height="96" alt="dsh-pouch logo" />
</p>

# dsh-pouch

**English** | [中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@moon16u/dsh-pouch.svg?color=cb3837)](https://www.npmjs.com/package/@moon16u/dsh-pouch)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-0.1.7--rc.2-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

> **dsh-pouch** is a pocket toolkit of practical, lightweight, and beautiful plugins designed for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).  
> It delivers out-of-the-box micro-extensions to enhance your daily workflow, interactive experience, and development productivity.

---

## 📦 Plugins Included

| Plugin | Type | Description |
| :--- | :--- | :--- |
| **[`@moon16u/dsh-plugin-restart`](./packages/dsh-plugin-restart)** | Host / Web UI | Safe, detached DSH process restart commands (`/restart`, `/dsh-restart`) and agent tool (`dsh_restart`) with native Web UI candidate styling. |
| **[`@moon16u/dsh-plugin-current-time`](./packages/dsh-plugin-current-time)** | Host / Agent | Injects the host's real date, time, and timezone into agent context at the start of every turn, so a long-running session never reasons from a stale date. |
| **[`@moon16u/dsh-plugin-session-copy`](./packages/dsh-plugin-session-copy)** | Web UI | Native-styled Copy menu in the web session header for the session title, session directory path, and working directory. |
| **[`@moon16u/dsh-plugin-web-search-tavily`](./packages/dsh-plugin-web-search-tavily)** | Capability Seam | Real-time web search provider backed by the Tavily REST API, seamlessly integrating with DSH's `ctx.web` capability seam. |
| **[`@moon16u/dsh-plugin-mcp-console`](./packages/dsh-plugin-mcp-console)** | Web UI + Host | MCP server console in the settings page: runtime add/edit/enable/disable/reconnect/delete, per-tool switches, live status over SSE, and mcpServers JSON import. Zero MCP protocol code — everything rides the official `@deepseek-ai/dsh-mcp-client`. Profile-YAML MCP entries are auto-migrated into dynamic management on boot/refresh (and exportable back). |

---

## 🚀 Quick Start & Installation

### Method 1: One-Command Installation via DSH CLI (Recommended ⭐️⭐️⭐️⭐️⭐️)

Run a single command in your terminal. DSH will automatically download, bundle-register, and mount all 5 pocket plugins (zero manual configuration):

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
* **Problem**: After editing plugins or configs, restarting DSH manually in an external terminal is tedious; killing the process directly inside an agent tool causes the session to freeze; stock commands in web chat lack native icons or localized names.
* **Solution**: Exposes `/restart` (and backwards-compatible `/dsh-restart`) slash commands with native `🔄 Restart restart` slash candidate styling, plus `dsh_restart` agent tool. Spawns an asynchronous detached worker process that returns immediately and restarts cleanly after 3 seconds.

### 2. `@moon16u/dsh-plugin-current-time`
* **Problem**: A model has no clock. It infers "today" from whatever the harness injected once at startup, so a session left open across midnight keeps reasoning from yesterday's date — and nothing in the transcript contradicts it.
* **Solution**: Hooks `agent/pre-step` and appends one wall-clock reading after the prompt on the first step of every turn. Once per turn rather than per step, so a tool-call loop does not bury the transcript in near-identical timestamps.

### 3. `@moon16u/dsh-plugin-session-copy`
* **Problem**: Getting the current session's storage folder, title, or working directory out of the UI means digging through URLs, console logs, or the filesystem by hand.
* **Solution**: Injects a native-styled **Copy** button into the web header utility bar. It opens a menu with three targets — **Session title**, **Session directory** (the session's real on-disk folder path, home prefix abbreviated to `~`), and **Working directory** — each disabled with a stated reason until its value exists. The directory comes from one authenticated, read-only host route over the JSONL backend's public `resolveCurrentLog`; it only locates current-format logs, never reads log contents, and takes no write lease. An empty result may mean an unwritten session or an unsupported log format; older generations remain unavailable.

### 4. `@moon16u/dsh-plugin-web-search-tavily`
* **Problem**: Built-in search engines may be restricted or lack high-quality synthesized web answers.
* **Solution**: Formally implements the `ctx.web.registerSearchProvider` contract. Automatically resolves API keys from the `TAVILY_API_KEY` environment variable or DSH Credentials service.

### 5. `@moon16u/dsh-plugin-mcp-console`
* **Problem**: The official way to attach MCP servers is a static `cordis.patch.yml` entry — no GUI, no runtime changes, and every restart to apply an edit. Declared servers show up as untouchable read-only instances.
* **Solution**: A full **MCP servers** settings section managing the official `@deepseek-ai/dsh-mcp-client` at runtime: one fiber per server via cordis dynamic assembly (hot edit, no DSH restart), master switches, per-tool enable/disable pills, live status + tool lists over SSE, and mcpServers JSON import. External agents writing MCP entries into `cordis.patch.yml` are handled by an auto-ingest engine: on boot/refresh the entries are migrated into `~/.dsh/dsh-mcp.json` (fiber takeover included, YAML trimmed precisely), reversible via `POST /export-yaml`. Secrets stay masked in every API response.

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
