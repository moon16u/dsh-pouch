# @moon16u/dsh-plugin-session-id

**English** | [中文](./README.zh-CN.md)

Display the current DSH Session ID badge in the web session header with one-click clipboard copy.

## Features
- Native-styled Session ID button in the session header utilities area.
- One-click copy with instant feedback (falls back to `execCommand` on non-secure origins).
- Pure client-side UI plugin (no host overhead).

## Installation

Ships inside the [`@moon16u/dsh-pouch`](../../README.md) bundle (recommended):

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

Or install this plugin standalone:

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-session-id
```

Either way, **restart `dsh web` once** after installing. No manual `cordis.patch.yml` edits needed — the package carries its own patch.

## License
[MIT](../../LICENSE)
