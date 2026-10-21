<p align="center">
  <img src="./assets/logo.png" width="96" height="96" alt="dsh-pouch logo" />
</p>

# dsh-pouch

**English** | [中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-0.2.1--rc.1-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

> **dsh-pouch** is a monorepo of independent, standalone [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.
> The repository root is only a pnpm workspace — it is **not** a DSH bundle, not installable, and never published to npm. Install only the plugins you need.

---

## 📦 Plugins Included

| Plugin | Type | Description |
| :--- | :--- | :--- |
| **[`@moon16u/dsh-restart`](./packages/dsh-restart)** | Host / Web UI | Safe, detached DSH process restart commands (`/restart`, `/dsh-restart`) and agent tool (`dsh_restart`) with native Web UI candidate styling. |
| **[`@moon16u/dsh-mcp-console`](./packages/dsh-mcp-console)** | Web UI + Host | MCP server console in the settings page: runtime add/edit/enable/disable/reconnect/delete, per-tool switches, live status over SSE, and mcpServers JSON import. Zero MCP protocol code — everything rides the official `@deepseek-ai/dsh-mcp-client`. Profile-YAML MCP entries are auto-migrated into dynamic management on boot/refresh (and exportable back). |
| **[`@moon16u/dsh-hooks`](./packages/dsh-hooks)** | Host / Web UI | File-defined DSH command hooks across the SessionStart, prompt, tool, permission, Stop and PostCompact seams, with an approval-only GUI. No unapproved command runs; trust binds the exact definition, canonical cwd and pinned files. Source-distributed, not published to npm. |

---

## 🚀 Installation

Each plugin is its own DSH bundle with its own npm package and version. Install exactly the ones you want:

```bash
dsh plugin --profile web add @moon16u/dsh-restart
dsh plugin --profile web add @moon16u/dsh-mcp-console
```

`@moon16u/dsh-hooks` is distributed from source only, so add it from a checkout:

```bash
dsh plugin --profile web add "link:/path/to/dsh-pouch/packages/dsh-hooks"
```

**Restart `dsh web` once** after installing (bundle layers compose at startup). No manual `cordis.patch.yml` edits are needed — every package carries its own patch.

### From a local checkout

```bash
git clone https://github.com/moon16u/dsh-pouch.git ~/dsh-pouch
dsh plugin --profile web add file:~/dsh-pouch/packages/dsh-restart
```

### Migrating from the old all-in-one bundle

`@moon16u/dsh-pouch` used to be a single bundle that loaded all the plugins. The last bundle release is **0.7.3**, now deprecated and no longer updated. If your profile still depends on it, remove it **before** installing the individual packages:

```bash
dsh plugin --profile web remove @moon16u/dsh-pouch
```

Do not keep the old bundle and the standalone packages installed together — both load the same plugins, which duplicates the restart commands, the settings cards, and the MCP console.

---

## 🛠️ Plugin Highlights

### 1. `@moon16u/dsh-restart`
* **Problem**: After editing plugins or configs, restarting DSH manually in an external terminal is tedious; killing the process directly inside an agent tool causes the session to freeze; stock commands in web chat lack native icons or localized names.
* **Solution**: Exposes `/restart` (and backwards-compatible `/dsh-restart`) slash commands with native `🔄 Restart restart` slash candidate styling, plus `dsh_restart` agent tool. Spawns an asynchronous detached worker process that returns immediately and restarts cleanly after 3 seconds.

### 2. `@moon16u/dsh-mcp-console`
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
