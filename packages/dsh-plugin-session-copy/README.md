# @moon16u/dsh-plugin-session-copy

**English** | [中文](./README.zh-CN.md)

Copy the current session's title, storage directory, or working directory from the web session header.

## Features
- Native-styled **Copy** button in the session header utilities area.
- Opens a menu with three copy targets: **Session title**, **Session directory**, and **Working directory**.
- **Session directory** copies the session's real on-disk folder as a plain path (trailing separator, no `file://` prefix and no percent-encoding; the home prefix is abbreviated to `~`, which the shell expands back), resolved by a read-only host route; it is disabled with a stated reason when the session has not been written to disk yet or the storage backend cannot locate it.
- **Session title** and **Working directory** copy the values the header already displays.
- Instant feedback (`Copied` / `Copy failed`) with an `aria-live` announcement. The shared clipboard helper falls back to `execCommand` when the async Clipboard API is unavailable; rejected writes report failure.
- Mostly client-side UI; the host half adds exactly one authenticated, read-only directory lookup route.

## Installation

Install this plugin as its own DSH bundle:

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-session-copy
```

**Restart `dsh web` once** after installing. No manual `cordis.patch.yml` edits needed — the package carries its own patch.

## Host route

`GET /api/dsh-session-copy/directory?sessionId=<id>` — authenticated by the connection
service, read-only, `no-store`. It resolves the stored log through the JSONL persistence
backend's public `resolveCurrentLog(id, signal)` and returns
`{ok:true, directory}` (a plain filesystem path; the home prefix is abbreviated to `~`). This API only locates current-format
logs; older log generations cannot be copied through it. An empty resolution does
not distinguish unwritten sessions from unsupported log formats. The route never
reads log contents, flushes, migrates, or takes a write lease. Session IDs are opaque,
non-empty strings; path encoding belongs to the backend. Failures are reported with
fixed codes: `400 invalid_session_id`, `404 directory_unavailable`, `501 not_supported`,
`503 persistence_unavailable`, `500 resolve_failed`.

## License
[MIT](../../LICENSE)
