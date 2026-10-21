# dsh-hooks

**English** | [中文](./README.zh-CN.md)

`@moon16u/dsh-hooks` 2.0.0 executes file-defined DSH command
hooks after explicit per-definition approval. There is **no built-in memory
loader** and **no GUI configuration editor**.

## Approval-only GUI

Open **Plugins > Installed > Built-in plugin configuration > Hooks**.
The page groups source files by project, user and profile. Open a source card
to see its event groups; expand a hook for its command, matcher, timeout and
execution mode. Additional read-only details include cwd, source, limits,
pinned files, environment names and the definition fingerprint.

Each event has compact numbered rows with an expand button and enable switch.
Expanded rows show hook type, command, matcher and timeout first; execution mode
and other details remain under Additional configuration. Revocation stays in the
expanded row rather than occupying the collapsed list.

The file-opening icon uses the host's native default application, not the browser
machine's filesystem. Synthetic profile declarations have no file-opening icon.
Opening a file does not approve or run its hooks.

The state-changing actions are approve, enable/disable and revoke.
An unapproved toggle expands the existing four basic fields and collapsed
Additional configuration; it does not enable the hook yet. Click **Approve**
below those fields to approve and enable it. There is no duplicate review panel,
checkbox or second confirmation. Definition hashes and one-use review receipts
are still validated before approval. The file-only emergency/source gates remain
in force. Approval enables future matching events; it does not run the command now.
There is no Add, Edit, Delete, JSON editor, validation form or Save button.

Screenshots (isolated fixtures): [desktop](docs/approval-direct-desktop.png) / [mobile](docs/approval-direct-mobile.png).

## Definitions and safety

Maintain hooks in files:

- Project: `<nearest-git-root>/.dsh/hooks.json` (cwd without a Git ancestor).
- User: `$DSH_HOME/hooks.json`, defaulting to `~/.dsh/hooks.json`.
- Profile: `commandHooks` JSON string in the profile patch, for existing deployments.

Sources accumulate; no hook file can grant trust. Approval binds the exact
normalized definition, canonical execution cwd and explicitly pinned files.
New/changed definitions remain pending. The host-side enable state and trust
ledger are separate from source files; approval UI operations never rewrite them.

The engine is available by default, **but no unapproved command runs**. The
file-only emergency setting `commandHooksEnabled: false` still disables all
commands, including approved ones. The GUI displays that condition; it cannot
change the setting. Configuration fields are not volatile GUI editors.

Commands run as the DSH OS user without a separate hook sandbox or per-tool
approval. Read [SECURITY.md](SECURITY.md) before approving them. Do not put secrets
in commands or `env` unless plaintext storage is acceptable.

See [command-hooks.md](docs/command-hooks.md) for event mapping, command schema,
JSON stdin/stdout, error policies, limits and compatibility exclusions.

## Upgrade from 1.x

2.0 retires `coreDir`, `files`, `maxBytes`, the old `enabled` memory switch and
its lifecycle/subagent settings. The independent filesystem scan, renderer,
placement and memory deduplication are removed, including their exported helpers.
Existing transcript messages are not deleted. Memory loading now has to be an
ordinary configured command hook and requires the same approval as every other
command. There is no automatic fallback while it awaits approval.

Existing memory injection in a project becomes an ordinary declared command hook
in that project's `.dsh/hooks.json`, pinned with `watchFiles`, and it starts
unapproved. That declaration and any adapter script it calls belong to the
project, not to this package; nothing of the kind is bundled as a default.

The engine's default emergency gate changes from false to true in 2.0 so that
approval is the activation step. Explicitly configured false remains false.
Existing trust is retained: operators with previously approved hooks must set
`commandHooksEnabled: false` in their profile before upgrading if they want them
to stay globally paused. The 2.0 migration creates no trust grants.

## Installation

The package is distributed from source and is not published to npm. The package
is `@moon16u/dsh-hooks` and the profile entry ID is `dsh-hooks`.

When migrating an existing installation, replace the old package in both profile
dependencies and `dsh.profile.bundles`, and update the lockfile and installed
`link:` symlink. Rename any `dsh-core-memory` profile override ID to `dsh-hooks`
without changing its configuration. The approval ledger stays at
`$DSH_HOME/workspace-hooks/<profile-hash>.json`; do not clear or move it.

```bash
dsh plugin --profile web add "link:/path/to/dsh-pouch/packages/dsh-hooks"
```

Restart the DSH host after changing host code, then refresh the browser.
DSH 0.2.1-rc.2 on WSL/POSIX with Bash is the verified target. Later DSH
versions are not guaranteed compatible. No DSH host patches are required.

## Tests

```bash
node --test --test-isolation=none test/*.test.mjs
DSH_RUNTIME_ROOT=/path/to/dsh/node_modules node test/official-runtime.mjs
```

The explicit integration command uses the installed official subprocess service
and harmless temporary commands. Adapter mapping runs only when
`DSH_HOOK_TEST_FIXTURE` names a directory holding one `.mjs` adapter and one
`.sh` sibling; no project path is assumed.
Default tests have no network or model calls.
See [design.md](docs/design.md) for verification evidence and lifecycle limits.
