# @moon16u/dsh-restart

**English** | [中文](./README.zh-CN.md)

Safe, detached DSH process restart commands (`/restart`, `/dsh-restart`) and agent tool (`dsh_restart`) with native Web UI candidate styling.

**Web hosts only. DeepSeek Harness Desktop on Windows and macOS is explicitly unsupported.** Quit and reopen the desktop application instead. `dsh.unsupportedProfiles: ["desktop"]` lets the patched official installer reject this package during installation; the runtime also refuses Desktop if installed by an older installer or outside DSH. Existing official versions that do not read this declaration cannot enforce installation-time rejection.

Windows/macOS Web hosts use the official launcher's `appExit` service and a detached Node helper. The helper preserves the Node executable, CLI flags, overlays, working directory and DSH home; it waits for the old host to exit before starting a replacement. No Bash, `setsid`, `/proc`, shell command construction or desktop-process control is used. Native support targets standalone Node.js CLI/Web hosts; Electron, IPC-managed, Bun and embedded-executable hosts are rejected. Linux/WSL retains its existing shell and systemd paths.

The fallback error page serves loopback HTTP only. Native HTTPS or non-loopback failures retain their diagnostic marker and logs; this helper does not recreate the host's TLS or network-facing server configuration.

## Features
- **Zero Freeze**: Schedules restart in a detached worker process with a 3-second grace period.
- **Slash Commands**: Run `/restart` (or backwards-compatible `/dsh-restart`) in chat to trigger an immediate, smooth restart.
- **Native Web UI Candidate**: Renders as `🔄 Restart restart` with an icon, bilingual localized descriptions, and one-click/Enter execution (no hint prompt obstruction).
- **Agent Tool**: Enables the AI Agent to self-heal and restart DSH when requested.
- **Scheduling Errors**: Missing scripts, invalid shell syntax, missing launcher utilities, and helper/log write errors return a command error or `ok: false` tool result. Detached helper failures are polled through an authenticated, read-only endpoint and shown once in the originating chat's Web UI with the reason and log path. A persisted `restart-failed.json` marker also supplies context to later model requests; it does not start a model turn.
- **Failure Visibility**: If a restart fails (new process dies or never becomes ready), `dsh-restart.sh` serves a self-contained error page on the port — failure reason, log tails, and a "restart DSH" button that releases the port and retries. The service always exits by itself, so it can never block a later manual start. The next successful start also surfaces a one-line "previous restart failed" notice in chat (`restart-failed.json` marker).

## Installation

Install this plugin as its own DSH bundle:

```bash
dsh plugin --profile web add @moon16u/dsh-restart
```

**Restart `dsh web` once** after installing (bundle layers compose at startup). No manual `cordis.patch.yml` edits needed — the package carries its own patch.

## Testing
```bash
npm test
```
Smoke tests set `DSH_RESTART_DRY_RUN=1` and use a temporary `DSH_HOME`; scheduling writes the helper but never spawns it. Packaging and scheduling-failure tests execute only inert scripts in temporary package copies, never the real restart worker. The client bundle is tested with fake RPC outcomes and status responses. Outside these isolated fixtures, omitting the flag schedules a REAL detached restart.

The test runner selects platform-appropriate suites. Native tests run on Linux, Windows and macOS and use disposable Node/HTTP hosts, not a live DSH installation. Linux-only shell suites are omitted elsewhere. The `Restart Native Platforms` workflow runs the dependency-free native suites on all three operating systems; native error-page retry uses Node instead of Bash.

## License
[MIT](../../LICENSE)
