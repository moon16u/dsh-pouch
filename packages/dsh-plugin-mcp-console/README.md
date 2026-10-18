# @moon16u/dsh-plugin-mcp-console

**English** | [中文](./README.zh-CN.md)

The **MCP server console** for the DSH (DeepSeek Harness) web GUI: add, edit,
enable/disable, reconnect and delete MCP servers from the settings page, with
live status and tool lists, mcpServers JSON import, and automatic migration of
profile-YAML MCP entries.

**Zero MCP protocol code** — connections, reconnect backoff, tool
discovery/registration, `mcp__<server>__<tool>` naming and image bridging all
belong to the official `@deepseek-ai/dsh-mcp-client`; this plugin is only
"config storage + lifecycle orchestration + HTTP API + GUI".

## Installation

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-mcp-console
```

**Restart `dsh web` once** after installing (bundle layers compose at startup).
Then open DSH Web → bottom-left Settings → **"MCP servers"**.

## Capabilities

| Capability | Description |
|---|---|
| Server management | Add (stdio / streamable-http forms), edit, delete, enable/disable, reconnect; config changes take effect immediately, no DSH restart |
| Connection test | One-click "Test connection" per server: a throwaway official-client fiber (with `failOnStartupError` forced on) performs a real handshake and reports tool count + latency; for a running server it honestly reports the live status instead (the official client's serverName namespace cannot be bypassed) |
| Per-tool switches | Expand a server card and click tool pills to toggle individual tools; disabled tools are denied at execution time by a guard |
| Live status | running / connecting / starting / disabled / failed grading; SSE push updates, tool counts in real time |
| JSON import | Paste Claude / Cursor style `mcpServers` JSON, preview, import; existing names skipped and reported |
| Auto-ingest | MCP entries written into `cordis.patch.yml` by external agents/scripts are migrated into dynamic management on boot and on "Sync config & refresh status". Entries are read and located by YAML semantics, so inline `args`/`env`, `reconnect`, comments and quoting survive; only entries that persisted and match the store are removed, everything else stays with a reported reason |
| YAML export | `POST /api/dsh-mcp-console/export-yaml` restores dynamic config as standard `cordis.patch.yml` entries (uninstall/backup reversibility) |
| Model awareness | A `ctx.systemPrompt.section` announcement tells every agent that MCP management lives in the settings page, not in hand-edited config files (own inject scope; dormant on hosts without the service) |
| Settings integration | `enabled` / `announceToAgent` master switches as `.volatile()` fields of the schema-discovered `export const Config` (rc.2 SettingsForms): editable from the settings GUI and hot-updated in place, no DSH restart — `enabled` tears the whole surface down (routes + MCP connections + announcement; stores preserved), `announceToAgent` toggles only the announcement; hosts without the service fall back to entry defaults |
| Settings-GUI card | The "MCP console" card on Settings → Plugins (`plugins.item`, key `ui-mcp-console`): collapsible and shaped like the official cards (same `--dsw-alias-*` tokens and metrics), switches write immediately, and a changed field carries a "Customized" badge with its own reset. Card and switches bind through the host's `configForms` service, so a host without it simply hides the card while the MCP servers page keeps working |
| Project scope | A server can be marked "current project only": the request's session id resolves the live agent and working directory, the config lands in that project's `.dsh/mcp.json`, and connections/tools register only inside that agent's scope. Without a valid session the console stays global and reports `hasProjectWorkspace: false` honestly |

> **A project session sees the global and project servers as one merged, manageable list.** Global servers stay editable with their tool switches; only names owned by the project store are routed to the project instance. The two instances keep their own connections and guards — only the view is merged. Without a resolvable session the page falls back to the pure global view and reports `hasProjectWorkspace: false` honestly.
| Degraded state | With `enabled` off, the "MCP servers" page stops reporting an API error and shows the switched-off notice plus the way back, and keeps the SSE stream closed instead of retrying |

## Config storage

- Dynamic config: `~/.dsh/dsh-mcp.json` (versioned JSON, atomic writes: temp file + rename; deletions are explicit user intent, no backup files are kept)
- Plugin switches: the official settings user document's `ui-mcp-console` section (edited via the settings GUI, persisted by the provider); the Plugins-page switches read and write through the host's `configForms` form
- Project config: `<project root>/.dsh/mcp.json` (same shape as the global store, selected by the session's working directory)
- Profile layer: `~/.dsh/profiles/web/cordis.patch.yml` (the ingest engine touches only mcp-client entries; other entries and comments are preserved verbatim)

## HTTP API (loopback-only, prefix `/api/dsh-mcp-console/`)

`GET /health` · `GET/POST /servers` · `PATCH/DELETE /servers/:name` · `POST /servers/:name/enable|disable|reconnect|probe` · `POST /refresh` (ingest YAML + retry failed) · `POST /import` · `POST /export-yaml` · `GET /events` (SSE) · `GET/PUT /config` (UI placement only; plugin switches go through the official settings form)

Project-scoped servers are routed by `?sessionId=<id>` to that session's project store; an absent or invalid session falls back to the global console. `PUT /config` no longer accepts plugin switches — sending them returns 400.

**Four-layer loopback fence** (borrowed from dsh-skills-mcp-manager): loopback socket peer, loopback Host header (DNS-rebinding fence), no `sec-fetch-site: cross-site` marker, and — when Origin is present — an Origin matching the Host. `GET /config` (UI placement only) stays open to LAN browsers.

## Known limitations (honest wording)

1. **Connection-level status**: the official client exposes no structured connection events, so "connecting" vs "reconnecting, attempt N" cannot be distinguished; the status model is "fiber lifecycle + tool prefix count".
2. **Per-tool disable exposure**: `tools.restrict()` requires an agent scope in dsh-tools (context-global restriction is explicitly forbidden), so a disabled tool still appears in the model's tool list — but its calls are denied by the guard with a clear reason.
3. **Namespace ambiguity**: the `mcp__<server>__<tool>` prefix can overlap when a server name contains `__` (e.g. `foo` and `foo__bar`). Such servers get no tool attribution, no connection and no tool toggles, and the card states the reason instead of guessing ownership.
4. **rc-version coupling**: depends on cordis/webserver/tools contracts of the official packages; all official-package coupling is isolated in `clientAdapter.js` (the official client is resolved dynamically from the profile's module graph, sharing the loader's module instance) and `routes.js`.
5. **"Test connection" on a running server**: the official client reserves the serverName namespace per module instance, so a live server cannot be re-probed alongside its own fiber; the button then returns the live status (`live: true`) instead of a fresh handshake. Fresh side-fiber probes carry a hard 15s timeout.
6. **Export and per-tool switches**: `POST /export-yaml` writes the fields the official client can express. `disabledTools` has no official-client equivalent, so a server with per-tool restrictions is never silently exported — the call is refused with a reason (disable it or drop the restrictions first).
7. **Project scope needs host services**: resolving a project requires `agents` and `workingDirectory`; without them the console stays global instead of guessing a workspace from the process cwd.

## Development

```bash
pnpm --filter @moon16u/dsh-plugin-mcp-console test

## License
[MIT](../../LICENSE)
