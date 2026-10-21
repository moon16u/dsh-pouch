# @moon16u/dsh-mcp-console

**English** | [中文](./README.zh-CN.md)

The **MCP server console** for the DSH (DeepSeek Harness) web GUI: add, edit,
enable/disable, reconnect and delete MCP servers from Plugins > Built-in plugin configuration > MCP console, with
live status and tool lists, mcpServers JSON import, and automatic migration of
profile-YAML MCP entries.

**Zero MCP protocol code** — connections, reconnect backoff, tool
discovery/registration, `mcp__<server>__<tool>` naming and image bridging all
belong to the official `@deepseek-ai/dsh-mcp-client`; this plugin is only
"config storage + lifecycle orchestration + HTTP API + GUI".

## Installation

```bash
dsh plugin --profile web add @moon16u/dsh-mcp-console
```

**Restart `dsh web` once** after installing (bundle layers compose at startup).
Then open **Plugins → Built-in plugin configuration → MCP console**. Installation activates management automatically; there is no console-wide enable switch. Legacy `enabled: false` configuration no longer disables management.

## Platform Behavior

- Targets Linux, native Windows and macOS; the relevant OS is the DSH host's, not the browser's.
- Home resolution reuses the official `resolveDshHome()`: explicit path, then nonblank `DSH_HOME`, then the OS home default. Tilde prefixes and relative paths follow DSH rules. Profile symlinks and Windows junctions are supported during client resolution.
- JSON/YAML replacement uses an exclusively created sibling temp file. Windows retries transient `EACCES` / `EBUSY` / `EPERM` using the official bounded policy, without deleting the old target first. New POSIX files/directories use `0600`/`0700`; these mode bits are not a Windows ACL guarantee.
- Commands, arguments and working directories pass unchanged to the official MCP client. No shell is added and no Linux scripts or Windows backslashes are rewritten; supply commands that exist on the host OS.
- `pnpm --filter @moon16u/dsh-mcp-console test` isolates configuration and temp directories. It covers real official-client startup, tool discovery and toggling against a local stdio fixture, never the user's MCP services. Fixtures move to `.recovered` temp paths instead of recursive deletion.
- Local package verification passed on Linux and native Windows. A three-OS CI workflow is configured; native macOS verification still awaits its runner. Restart DSH after backend updates; browser refresh alone does not reload backend modules.

## Capabilities

| Capability | Description |
|---|---|
| Server management | Add (stdio / streamable-http forms), edit, delete, enable/disable, per-server reconnect; config changes take effect immediately, no DSH restart. The edit form's Advanced section exposes the official `reconnect` policy and `maxInstructionBytes` |
| Connection test | One-click "Test connection" per server: a throwaway official-client fiber (with `failOnStartupError` forced on) performs a real handshake and reports tool count + latency; for a running server it honestly reports the live status instead (the official client's serverName namespace cannot be bypassed) |
| Per-tool switches | Expand a server card and click tool pills to toggle individual tools; disabled tools are denied at execution time by a guard |
| Live status | running / connecting / starting / disabled / failed grading; SSE push updates, tool counts in real time |
| JSON import | Paste Claude / Cursor style `mcpServers` JSON, preview, import; existing names skipped and reported |
| Auto-ingest | MCP entries written into `cordis.patch.yml` by external agents/scripts are migrated into dynamic management on boot and on "Sync config & refresh status". Entries are read and located by YAML semantics, so inline `args`/`env`, `reconnect`, comments and quoting survive; only entries that persisted and match the store are removed, everything else stays with a reported reason |
| Automatic handoff | Successful takeover and global edits maintain native Loader fallback configuration. It stays inactive while the console is installed; after removal the official client resumes ownership. No npm uninstall script or manual export is required |
| Model awareness | The default-on `announceToAgent` preference gives agents the active host's resolved `dsh-mcp.json` path, directs them to edit that JSON, then refresh and verify state. Native YAML and the handoff block remain plugin-owned. Disabling the announcement does not stop MCP management |
| Settings integration | Only `announceToAgent` remains as a volatile preference. Connections and management follow the plugin lifecycle, not a second master switch |
| Single UI entry | One `plugins.item` entry (`ui-mcp-console`) contains server management, JSON import, tool switches and the announcement preference. No Settings section, duplicate card, customization badge or reset button |
| Project scope | A server can be marked "current project only": the request's session id resolves the live agent and working directory, the config lands in that project's `.dsh/mcp.json`, and connections/tools register only inside that agent's scope. Without a valid session the console stays global and reports `hasProjectWorkspace: false` honestly |

> **A project session sees the global and project servers as one merged, manageable list.** Global servers stay editable with their tool switches; only names owned by the project store are routed to the project instance. The two instances keep their own connections and guards — only the view is merged. Without a resolvable session the page falls back to the pure global view and reports `hasProjectWorkspace: false` honestly.

## Takeover and Removal Boundaries

- Successfully ingested servers retain tool discovery, server controls and per-tool restrictions. Unsafe or ambiguous native entries remain untouched with diagnostics.
- The handoff uses native `cordis:group` and Loader `!!js` configuration, not JavaScript imported from this plugin. Normal shutdown does not export a stale snapshot. Removal while the host is stopped still leaves the latest successfully saved global configuration usable at the next boot.
- Hosts without hot unloading still require stopping the host before removal and starting it afterward. This plugin does not bypass that rule.
- Tool-restricted servers return disabled, preserving fail-closed behavior. Project stores remain in each project's `.dsh/mcp.json`; removal neither promotes them to global nor claims the native client reads this plugin-specific store.
- External handoff edits, conflicting entries and damaged markers stop overwrites with an error. An accepted managed write updates both the store and the native fallback.
- After direct JSON edits, call `POST /api/dsh-mcp-console/refresh` on the running host (or use the page's refresh button), then inspect server state. Saving alone does not reload connections or sync the handoff; restarting is not a substitute. The JSON root is `version` + `servers`, not the `mcpServers` import envelope.

## Config storage

- Dynamic config: `~/.dsh/dsh-mcp.json` (versioned JSON, atomic writes: temp file + rename; deletions are explicit user intent, no backup files are kept)
- Announcement preference: official settings user document, `ui-mcp-console`, through the host configForms form.
- Project config: `<project root>/.dsh/mcp.json` (same shape as the global store, selected by the session's working directory)
- Profile layer: `~/.dsh/profiles/web/cordis.patch.yml` (the ingest engine touches only mcp-client entries; other entries and comments are preserved verbatim)

## HTTP API (loopback-only, prefix `/api/dsh-mcp-console/`)

`GET /health` · `GET/POST /servers` · `PATCH/DELETE /servers/:name` · `POST /servers/:name/enable|disable|reconnect|probe` · `POST /refresh` (ingest YAML + retry failed) · `POST /import` · `POST /export-yaml` · `GET /events` (SSE) · `GET /config` (announcement preference; writes go through the official settings form)

Project-scoped servers are routed by `?sessionId=<id>` to that session's project store; an absent or invalid session falls back to the global console. `PUT /config` is not supported (405): the announcement preference is written through the official settings form.

**Four-layer loopback fence** (borrowed from dsh-skills-mcp-manager): loopback socket peer, loopback Host header (DNS-rebinding fence), no `sec-fetch-site: cross-site` marker, and — when Origin is present — an Origin matching the Host. `GET /config` is fenced like every other route.

## Known limitations (honest wording)

1. **Connection-level status**: the official client exposes no structured connection events, so "connecting" vs "reconnecting, attempt N" cannot be distinguished; the status model is "fiber lifecycle + tool prefix count".
2. **Per-tool disable exposure**: `tools.restrict()` requires an agent scope in dsh-tools (context-global restriction is explicitly forbidden), so a disabled tool still appears in the model's tool list — but its calls are denied by the guard with a clear reason.
3. **Namespace ambiguity**: the `mcp__<server>__<tool>` prefix can overlap when a server name contains `__` (e.g. `foo` and `foo__bar`). Such servers get no tool attribution, no connection and no tool toggles, and the card states the reason instead of guessing ownership.
4. **rc-version coupling**: depends on cordis/webserver/tools contracts of the official packages; all official-package coupling is isolated in `clientAdapter.js` (the official client is resolved dynamically from the profile's module graph, sharing the loader's module instance) and `routes.js`.
5. **"Test connection" on a running server**: the official client reserves the serverName namespace per module instance, so a live server cannot be re-probed alongside its own fiber; the button then returns the live status (`live: true`) instead of a fresh handshake. Fresh side-fiber probes carry a hard 15s timeout.
6. **Restrictions after uninstall**: tool discovery and per-tool management work during takeover. The native client has no `disabledTools` field, so tool-restricted global servers return disabled; full restrictions remain in the store for reinstall. Uninstall never silently enables a denied tool.
7. **Project scope needs host services**: resolving a project requires `agents` and `workingDirectory`; without them the console stays global instead of guessing a workspace from the process cwd.

## Development

```bash
pnpm --filter @moon16u/dsh-mcp-console test

## License
[MIT](../../LICENSE)
