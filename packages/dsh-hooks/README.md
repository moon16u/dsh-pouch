# dsh-hooks

**English** | [中文](./README.zh-CN.md)

`@moon16u/dsh-hooks` executes command hooks that configuration files declare.
Every definition stays inert until it is approved explicitly, and the approval
page is read-only apart from the trust actions it exists to perform.

## Approval-only GUI

Open **Plugins > Installed > Built-in plugin configuration > Hooks**.
The page groups source files by project, user and profile. Open a source card
to see its event groups; expand a hook for its command, matcher, timeout and
execution mode. Additional read-only details include cwd, source, limits,
pinned files, environment names and the definition fingerprint.

Each event has compact numbered rows with an expand button and enable switch.
Expanded rows show hook type, command, matcher and timeout first; execution mode
and other details remain under Additional configuration. Revocation sits in the
expanded row rather than occupying the collapsed list.

The file-opening icon uses the host's native default application, not the browser
machine's filesystem. Synthetic profile declarations have no file-opening icon.
Opening a file does not approve or run its hooks.

The state-changing actions are approve, enable/disable and revoke. An unapproved
toggle expands the four basic fields together with the collapsed Additional
configuration; it does not enable the hook yet. Click **Approve** below those
fields to approve and enable it, with no duplicate review panel, checkbox or
second confirmation. Definition hashes and one-use review receipts are validated
before approval, and the file-only emergency and source gates stay in force.
Approval enables future matching events; it does not run the command now. There
is no Add, Edit, Delete, JSON editor or Save action.

Screenshots (isolated fixtures): [desktop](docs/approval-direct-desktop.png) / [mobile](docs/approval-direct-mobile.png).

## Definitions and safety

Maintain hooks in files:

- Project: `<nearest-git-root>/.dsh/hooks.json` (cwd without a Git ancestor).
- User: `$DSH_HOME/hooks.json`, defaulting to `~/.dsh/hooks.json`.
- Profile: `commandHooks` JSON string in the profile patch.

Sources accumulate; no hook file can grant trust. Approval binds the exact
normalized definition, canonical execution cwd and explicitly pinned files.
New or changed definitions stay pending. The host-side enable state and trust
ledger are separate from source files, and approval UI operations never rewrite
the declarations. The ledger lives at
`$DSH_HOME/workspace-hooks/<profile-hash>.json` with private file permissions;
run one DSH process per profile.

The engine is active by default, **but no unapproved command runs**. The
file-only setting `commandHooksEnabled: false` disables every command, including
approved ones. The GUI displays that state and cannot change it.

Commands run as the DSH OS user without a separate hook sandbox or per-tool
approval. Read [SECURITY.md](SECURITY.md) before approving them. Do not put
secrets in commands or `env` unless plaintext storage is acceptable.

See [command-hooks.md](docs/command-hooks.md) for event mapping, command schema,
JSON stdin/stdout, error policies, limits and compatibility exclusions.

## Installation

Published as `@moon16u/dsh-hooks`; the profile entry ID is `dsh-hooks`.

```bash
dsh plugin --profile web add @moon16u/dsh-hooks
```

From a checkout, mount the package directory instead so edits apply without
republishing:

```bash
dsh plugin --profile web add "link:/path/to/dsh-pouch/packages/dsh-hooks"
```

Restart the DSH host after changing host code, then refresh the browser.
DSH 0.2.1-rc.2 on WSL/POSIX with Bash is the verified target; later DSH versions
are not guaranteed compatible. No DSH host patches are required.

## Tests

```bash
node --test test/*.test.mjs
DSH_RUNTIME_ROOT=/path/to/dsh/node_modules node test/official-runtime.mjs
```

The explicit integration command uses the installed official subprocess service
and harmless temporary commands. Its adapter mapping group runs only when
`DSH_HOOK_TEST_FIXTURE` names a directory holding one `.mjs` adapter and one
`.sh` sibling; no project path is assumed. Default tests make no network or
model calls. See [design.md](docs/design.md) for design notes and limits.
