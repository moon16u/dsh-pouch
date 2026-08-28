# @moon16u/dsh-plugin-restart

**English** | [中文](./README.zh-CN.md)

Safe, detached DSH process restart command (`/dsh-restart`) and agent tool (`dsh_restart`).

## Features
- **Zero Freeze**: Schedules restart in a detached worker process with a 3-second grace period.
- **Slash Command**: Run `/dsh-restart` in chat to trigger restart.
- **Agent Tool**: Enables the AI Agent to self-heal and restart DSH when requested.
- **Failure Visibility**: If a restart fails (new process dies or never becomes ready), `dsh-restart.sh` serves a self-contained error page on the port — failure reason, log tails, and a "restart DSH" button that releases the port and retries. The service always exits by itself, so it can never block a later manual start. The next successful start also surfaces a one-line "previous restart failed" notice in chat (`restart-failed.json` marker).

## Installation

Ships inside the [`@moon16u/dsh-pouch`](../../README.md) bundle (recommended):

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

Or install this plugin standalone:

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-restart
```

Either way, **restart `dsh web` once** after installing (bundle layers compose at startup). No manual `cordis.patch.yml` edits needed — the package carries its own patch.

## Testing
```bash
npm test
```
The suite sets `DSH_RESTART_DRY_RUN=1`, which makes scheduling write the helper file but never spawn it. Without this flag every handler invocation schedules a REAL detached restart of whatever DSH instance `$DSH_HOME` points at.

## License
[MIT](../../LICENSE)
