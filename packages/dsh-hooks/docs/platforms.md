# Platform contract and official source

Source snapshot: DeepSeek Harness
`687f282e8625c6b8d11ff58211a90524be2e4317` (master, inspected 2026-10-22).
Native integration dependency: `@deepseek-ai/dsh-subprocess-local@0.2.1-rc.2`.

## Official references

- [PowerShell resolution](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/shell/pwsh-local/src/resolve.ts):
  Windows PowerShell 7 standard install, PATH, legacy Windows PowerShell fallback.
- [PowerShell execution](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/shell/pwsh-local/src/index.ts):
  direct argv, no profile, noninteractive execution and UTF-8 output preamble.
  Hooks additionally pin console input to UTF-8 for JSON stdin.
- [Subprocess provider](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subprocess/subprocess-local/src/index.ts)
  and [public platform facts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subprocess/subprocess/src/types.ts):
  execution-world lookup, `terminalEnvironment()`, managed spawn, termination and
  Windows Job/POSIX fallback limits. No direct hook-owned process spawner.
- [Environment merging](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subprocess/subprocess-local/src/spawn.ts):
  credential scrubbing and case-insensitive Windows environment overrides.
- [Atomic writes](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/util/atomic-write/src/index.ts):
  exclusive temp creation and eight bounded Windows sharing-violation retries
  (20 ms initial, 200 ms cap). Hooks retain their synchronous ledger API; retry
  waits may block its event loop for up to 1.1 seconds on Windows interference.

## Requirements

| Platform | Default shell | Explicit alternatives | Ledger permissions |
| --- | --- | --- | --- |
| Linux/WSL | Bash on PATH | PowerShell 7 on PATH | `0600` |
| macOS | Bash on PATH | PowerShell 7 on PATH | `0600` |
| Windows | PowerShell 7, then Windows PowerShell 5.1 | Bash on PATH | Parent directory ACL |

Only `auto`, `bash`, `pwsh` are accepted. Windows does not implicitly use Git
Bash. Shell scripts and command syntax must match the selection. A missing
executable fails according to `onError`; a permission/infrastructure lookup
failure does not trigger fallback.

JSON event data goes through stdin, never command interpolation. PowerShell
native executables need explicit `exit $LASTEXITCODE` for meaningful exit codes.
Paths containing spaces, apostrophes and Unicode are supported when the command
quotes them using its selected shell's syntax.

Approval fingerprints include the normalized shell. Existing Bash-only grants
become pending after upgrade. Changing shell, command or pinned bytes requires
new approval. The GUI shows the declared shell in read-only details.

Windows source paths are native paths. POSIX modes do not create owner-only
Windows ACLs; the operator must restrict `$DSH_HOME`. macOS fallback containment
does not guarantee termination of intentionally detached descendants.

## Verification scope

`test/platforms.test.mjs` covers platform resolution, fallbacks, lookup errors,
cancellation before spawn, environment case rules, trust invalidation, bounded
atomic retries, failure rollback and native path persistence.

`test/native.test.mjs` uses the real official subprocess provider on each CI OS,
with temporary scripts, a temporary ledger and no live profile or model calls.
It verifies Unicode JSON/context, output caps, exit 2/nonzero propagation,
environment scrubbing, trust gates, timeout/cancellation and parent/child cleanup.
Windows also executes both PowerShell 7 and Windows PowerShell 5.1 JSON fixtures.
The CI matrix runs the complete hook suite; native tests cannot silently skip.

`test/official-runtime.mjs` remains an optional Bash-only installed-runtime
check, not the cross-platform CI entry.
