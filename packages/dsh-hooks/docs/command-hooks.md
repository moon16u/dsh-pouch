# Native command hooks contract

Implementation target: DSH 0.2.1-rc.2 on Linux/WSL, macOS and Windows.
This is a DSH-native command-hook system, not a complete Codex compatibility layer.

## Configuration and activation

Version 2.0 has one execution path: reviewed commands. There is no built-in
file-memory loader. Definitions are maintained in configuration files, not UI.
The approval page only lists source cards, opens read-only hook details, and
permits explicit approval, enable/disable, revoke and refresh.

`commandHooksEnabled` is a file-only emergency gate, true by default. False
pauses every command without deleting approvals. `commandHooks` is the optional
file-managed profile JSON string. Neither field has a volatile GUI editor.

Three sources accumulate in this order, without precedence replacement:

1. Profile `commandHooks`.
2. `$DSH_HOME/hooks.json` (default home: `~/.dsh`).
3. Nearest Git root's `.dsh/hooks.json`; without a Git ancestor, cwd's file.

Regular UTF-8 files are required; symlink source files are rejected. Codex
configuration/trust is not imported. IDs are unique within each source.
Definitions are validated on every dispatch. No file can grant trust; newly
created and changed definitions are pending until explicitly approved.

```json
{
  "version": 1,
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume",
      "hooks": [{
        "id": "project-context",
        "type": "command",
        "command": "bash .agents/hook/project-context.sh",
        "watchFiles": [".agents/hook/project-context.sh"],
        "statusMessage": "Load project context",
        "timeout": 30,
        "contextBytes": 65536
      }]
    }]
  }
}
```

This is an illustrative declaration, not a trusted command. Review the script
before approving it. The engine does not interpret Markdown as executable hooks.

## Handler fields

| Field | Default | Contract |
| --- | --- | --- |
| `id` | Required | Unique per source; 1..64 letters/digits/underscore/dot/hyphen, starts alphanumeric |
| `type` | Required | Only `command` |
| `command` | Required | Nonempty selected-shell command, at most 16384 characters, no NUL |
| `shell` | `auto` | `auto`, `bash` or `pwsh`; auto selects Bash on POSIX, PowerShell on Windows |
| `timeout` | 30 seconds | Integer 1..600; observation events default 3, maximum 10 |
| `maxOutputBytes` | 65536 | Per stdout/stderr stream, integer 256..1048576 |
| `contextBytes` | 16384 | Model-context cap, integer 1..262144; no unlimited mode |
| `async` | `false` | Background observation; cannot return decisions or context |
| `enabled` | `true` | Declaration-level switch; UI also has a separate host-side disable |
| `subagents` | `false` | Run in child execution contexts; not needed just to observe a root's child lifecycle |
| `onError` | `continue` | `continue` or `block`; block only for synchronous gating events |
| `env` | `{}` | At most 32 explicit environment strings, up to 8192 characters each |
| `watchFiles` | `[]` | At most 16 paths resolved from execution cwd; included in trust hash |
| `statusMessage` | `""` | Optional descriptive metadata, up to 256 characters |

Matchers support `*`, `?` and `|` alternatives, with limits of 256 characters and
16 alternatives. Patterns such as `^Bash$` are rejected, not interpreted as regex.
Input is matched against the DSH tool name/source, not a Codex alias.

## Event semantics

| Event | DSH seam | Matching field | Synchronous result |
| --- | --- | --- | --- |
| `SessionStart` | `agent/created` | `source` | Run at creation; context enters first admitted step; block rejects that first admission |
| `UserPromptSubmit` | `agent/pre-step` | Empty | Only claimed source-kind `user` messages; context or rejection before admission |
| `PreToolUse` | `tools/pre-execute` | `tool_name` | Deny/cancel/ask; never rewrite logged arguments |
| `PostToolUse` | `tools/post-execute` | `tool_name` | Add context or turn the result into corrective feedback; cannot undo tool side effects |
| `PermissionRequest` | `approval/request` | `tool_name` | Deny or delegate to native answerer; allow is not a grant |
| `Stop` | `agent/turn-stopping` | Empty | A block steers corrective context and continues, at most 3 checks per turn |
| `PostCompact` | successful `compaction/end`, drained at pre-step/request | `manual` or `auto` | Context before next request, including same-step overflow retry; no veto |
| `SessionEnd` | `agent/disposed` | Empty | Observation only; registry disposal, not every idle turn |
| `SubagentStart` | parent-scoped `subagent/start` | provider name | Observation only |
| `SubagentStop` | parent-scoped `subagent/end` | provider name | Observation only |

Observation events do not block their publisher even when `async` is omitted.
An idle manual compaction is observed immediately but its command is deferred
until the next request; it does not wake the agent. SessionEnd is best-effort:
process crashes, shutdown order or plugin disposal can prevent its completion.
Root and child lifecycle semantics are those of DSH, not synthesized Codex events.

All context output is owned by `dsh-command-hooks`. The independent
`dsh-workspace-context` memory producer is retired; historical messages are not deleted.

## Execution and input

Commands use official `ctx.subprocess`. The provider's `terminalEnvironment()`
selects the OS family, not the browser's platform. Bash runs with
`--noprofile --norc -c`; PowerShell runs with
`-NoLogo -NoProfile -NonInteractive -Command` and UTF-8 input/output pinning.
Windows probes the PowerShell 7 standard location, PATH and Windows PowerShell
5.1. Explicit `bash` requires Bash on PATH; explicit `pwsh` on POSIX requires
PowerShell on PATH. No syntax translation or silent Bash fallback is performed.
Cwd is the canonical session directory, not the server
directory. Event data is written as a single JSON object to stdin; no event
value is interpolated into the command string.

Common fields: `hook_event_name`, `session_id`, `cwd`, `event_id`, `model`
(nullable). Event-specific fields:

- SessionStart: `source`.
- UserPromptSubmit: `prompt` (text blocks), `turn_id`.
- Pre/PostToolUse: `tool_name`, `tool_input`, `tool_use_id`; Post adds `tool_response`.
- PermissionRequest: `tool_name`, optional `tool_use_id` and `reason`.
- Stop: `turn_id`, `stop_hook_active`.
- PostCompact: `trigger`.
- SessionEnd: `reason: "agent-disposed"`.
- SubagentStart/Stop: `source` (provider), `agent_id`, `run_id`; Stop adds `stop_reason`.

No Codex transcript path or permission-mode emulation is provided.
`DSH_HOOK_ACTIVE=1` and `DSH_HOOK_EVENT` are explicit child environment facts.
Ambient `BASH_ENV`, `ENV` and `NODE_OPTIONS` are removed unless deliberately
supplied in the trusted `env`; the official provider scrubs credential-shaped
parent variables.
PowerShell native-process commands must explicitly propagate
`exit $LASTEXITCODE`; a terminating PowerShell error is an execution error.

## Output and decisions

- Exit 0: empty output succeeds. Plain stdout is additional context only for
  synchronous context-capable events. JSON stdout is parsed strictly.
- Exit 2: synchronous gating events block using stderr as the reason.
- Other exits, timeout, malformed/unsupported output or oversized stdout: execution
  error, then the handler's `onError` policy. Cancelled hooks do not return a denial.
- Async/observation hooks cannot block or inject context. Use empty stdout or `{}`;
  diagnostic text may go to stderr. Unsupported result semantics become errors.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Project-specific context."
  }
}
```

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "This operation is not permitted."
  }
}
```

Common output fields: `continue` (boolean), `stopReason`, `decision: "block"`,
`reason`, `hookSpecificOutput`. Specific fields: `hookEventName`,
`additionalContext`, `permissionDecision`, `permissionDecisionReason`.
Permission decisions allow `allow`, `deny`, `ask` for PreToolUse; PermissionRequest
cannot recursively ask. `allow` delegates rather than overriding native policy.
Other fields are rejected, including `updatedInput` and `systemMessage`.

## Trust and failure behavior

The unapproved switch opens the existing details with Additional configuration
collapsed. The **Approve** button is the explicit approval and enable action;
there is no second configuration block or checkbox. Approval does not execute
the command immediately. File-defined disable and the emergency gate still apply.

Trust is per source/ID/canonical cwd and normalized definition hash. Review
includes `shell`, defaulted to `auto`; upgrading from the Bash-only version
invalidates previous fingerprints and requires reapproval. Review
nonces expire after five minutes and are single-use. The command definition is
re-read after queueing and before launch; definition edits or pinned-file changes
invalidate authorization. Revocation and disable apply to queued/future launches.
Editing a different hook does not revoke unchanged definitions.

Untrusted hooks are skipped and recorded; they do not deny a tool. Invalid source
documents cause a visible infrastructure failure and block gating events while
the command master switch is on. `onError` applies to valid handlers, not to an
unparseable source. Set the file-only `commandHooksEnabled` gate to false or repair the source to recover.

The shared ledger is profile-specific, under
`$DSH_HOME/workspace-hooks/<sha256(profile)[0:16]>.json`. Only one host should write
one profile's ledger. Corrupt state prevents the command engine mounting but
has no fallback loader; consult host logs. Editing settings cannot grant
trust because trust is not a profile or project declaration field.
POSIX ledger files use mode `0600`; Windows files inherit the parent directory
ACL, which the operator must restrict. Windows transient `EACCES`, `EBUSY` and
`EPERM` replacement failures retry at most eight times, without deleting the
previous ledger. Persistent failure rolls back the requested trust change.

This is not a sandbox or a same-OS-user security boundary. See [SECURITY.md](../SECURITY.md).

## Limits and durability

- 256 KiB per source document, 64 handlers per source, 1 MiB per event input.
- At most 4 running commands across this engine and 64 queued executions.
  Matching handlers run concurrently; returned contexts retain declaration order.
  No guarantee of serial shell side effects is provided.
- Per-event combined context is capped at 256 KiB and 64 chunks.
- Output exceeding stdout capture capacity is rejected, never parsed as a partial
  JSON response. Stderr overflow keeps a bounded tail and an overflow flag.
- Hooks are finite processes, not daemon launchers. Completion/cancellation
  terminates and joins the official provider's managed process range.
  macOS uses the official provider's weaker process-group/direct-parent fallback;
  deliberately detached descendants are outside its cleanup guarantee.
- Event-result deduplication is process-local and retains 2048 event identities.
  There is no crash-time command replay or exactly-once external-side-effect
  guarantee. A resumed session has a new SessionStart lifecycle.
- Execution history retains 200 runs per profile; status returns the selected
  cwd's latest 100, and the UI shows the latest matching execution inside read-only details. Refresh
  updates that status; it is not a streaming log. Stdout is not retained, only its accepted context byte count.
- A previously running record reads as interrupted after restart. Side effects
  completed before interruption cannot be rolled back.

Unsupported: strict PreCompact veto, Interrupt, input rewriting, cmd.exe command
syntax, MCP/prompt/agent handlers, enterprise-managed hooks, Codex trust import,
arbitrary regex matching, and automatic retries of failed commands.
