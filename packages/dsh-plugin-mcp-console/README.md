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
# Recommended: the whole pouch bundle (this plugin ships inside it)
dsh plugin --profile web add @moon16u/dsh-pouch
# Or standalone:
dsh plugin --profile web add @moon16u/dsh-plugin-mcp-console
```

**Restart `dsh web` once** after installing (bundle layers compose at startup).
Then open DSH Web → bottom-left Settings → **"MCP servers"**.

## Capabilities

| Capability | Description |
|---|---|
| Server management | Add (stdio / streamable-http forms), edit, delete, enable/disable, reconnect; config changes take effect immediately, no DSH restart |
| Per-tool switches | Expand a server card and click tool pills to toggle individual tools; disabled tools are denied at execution time by a guard |
| Live status | running / connecting / starting / disabled / failed grading; SSE push updates, tool counts in real time |
| JSON import | Paste Claude / Cursor style `mcpServers` JSON, preview, import; existing names skipped and reported |
| Auto-ingest | MCP entries written into `cordis.patch.yml` by external agents/scripts are migrated into dynamic management on boot and on "Sync config & refresh status" (store persists before the YAML is trimmed — configuration is never lost) |
| YAML export | `POST /api/dsh-mcp-console/export-yaml` restores dynamic config as standard `cordis.patch.yml` entries (uninstall/backup reversibility) |

## Config storage

- Dynamic config: `~/.dsh/dsh-mcp.json` (versioned JSON, atomic writes: temp file + rename; deletions are explicit user intent, no backup files are kept)
- Profile layer: `~/.dsh/profiles/web/cordis.patch.yml` (the ingest engine touches only mcp-client entries; other entries and comments are preserved verbatim)

## HTTP API (loopback-only, prefix `/api/dsh-mcp-console/`)

`GET /health` · `GET/POST /servers` · `PATCH/DELETE /servers/:name` · `POST /servers/:name/enable|disable|reconnect` · `POST /refresh` (ingest YAML + retry failed) · `POST /import` · `POST /export-yaml` · `GET /events` (SSE) · `GET/PUT /config` (UI config)

## Known limitations (honest wording)

1. **Connection-level status**: the official client exposes no structured connection events, so "connecting" vs "reconnecting, attempt N" cannot be distinguished; the status model is "fiber lifecycle + tool prefix count".
2. **Per-tool disable exposure**: `tools.restrict()` requires an agent scope in dsh-tools (context-global restriction is explicitly forbidden), so a disabled tool still appears in the model's tool list — but its calls are denied by the guard with a clear reason.
3. **First-migration boot race**: with small probability the loader and the ingest engine assemble the same serverName during boot; the loader-side fiber logs one duplicate error (harmless — the YAML is already trimmed, so it does not recur on the next boot).
4. **rc-version coupling**: depends on cordis/webserver/tools contracts of the official packages; all official-package coupling is isolated in `clientAdapter.js` (the official client is resolved dynamically from the profile's module graph, sharing the loader's module instance) and `routes.js`.

## Development

```bash
pnpm --filter @moon16u/dsh-plugin-mcp-console test     # 43 tests
node scripts/sync-root-client.mjs                      # after editing lib/client.js, sync into the pouch root bundle
```

The marked section inside `lib/client.js` is kept identical to the dsh-pouch
root `lib/client.js` by the sync script; tests pin it against drift.

## License
[MIT](../../LICENSE)
