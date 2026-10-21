# Hooks 2.0: approval-only design and verification

Date: 2026-10-20. Target: official DSH 0.2.1-rc.2 on WSL/POSIX.
No DSH host patches or automatic command approvals are part of this design.

## Current approval flow (2026-10-21)

The unapproved switch opens a single details block: four basic fields and
collapsed Additional configuration. Clicking **Approve** below it approves and
enables that definition, without a duplicate review panel or checkbox. The
client retains exact-definition hashes and one-use review receipts. Source-file
and profile disable gates remain effective; approval does not run a command now.
The verification notes below describe the original October 20 interface,
including its now-removed consent checkbox.

## Contract

One execution path remains: file-defined commands gated by explicit trust.
The former core-memory scanner, renderer, placement, deduplication and settings
are removed. Existing transcript messages are not rewritten or deleted.

The GUI follows the supplied reference: configuration source groups, project
cards with hook counts, then a native modal containing event groups. Expand a
hook to read its command, matcher, timeout and execution mode. More configuration
and full approval details are read-only. Actions are limited to refresh,
review/approve, enable/disable and revoke; the only input is consent. There is
no definition editor, JSON editor, Save, Add/Delete or execute-now operation.
The obsolete validation API is removed, not merely hidden from the page.

## Runtime and migration

- `lib/index.js` only mounts `lib/hooks/`. Config exposes file-only command
  fields, without volatile editable fields. Stable package/profile IDs remain.
- `commandHooksEnabled` is a file-only emergency gate, true by default in 2.0.
  Explicit false remains respected. The gate never grants trust. Deployments
  with existing grants can preserve global pause by explicitly setting false.
- Approval and enable state use a separate host-owned profile ledger. This
  migration adds no grants and does not rewrite hook definition files on approval.
- A migrated deployment declares its former memory injection as ordinary
  SessionStart and PostCompact command hooks in that project's `.dsh/hooks.json`,
  calling a project-owned adapter script. The adapter and any shared script it
  invokes are pinned with `watchFiles`. Neither belongs to this package, and no
  such declaration is bundled as a default.
- Both migrated hooks are pending approval. There is no old injection fallback.
  Command lifecycle execution is not the retired memory-specific resume dedup.
- Commands run as the DSH OS user without a hook sandbox. Trust does not protect
  against a hostile process sharing that OS identity. See SECURITY.md.

## Official mechanisms

The engine uses `ctx.subprocess` for execution; agent/tool/approval/compaction
and subagent events for adaptation; `connection.fetch` for authenticated owner
routes; `plugins.item`, `Modal`, `Button` and `Switch` for the approval UI.
PreCompact veto, argument rewriting, Interrupt, Windows-native execution and
MCP/prompt/agent handlers remain unsupported. See command-hooks.md for exact
input/output, event and failure semantics.

## Verification

- 72 offline tests pass, covering command config/engine/adapters/security and
  the replacement entry and approval UI. Tests for the removed memory feature
  and editor were retired rather than presented as supported functionality.
- Seven integration groups pass using official subprocess: JSON transport,
  timeout cleanup, cancellation, overflow, environment scrubbing, trust and
  deduplication/revocation, and adapter startup/compaction/empty-output mapping.
  Adapter tests replace the shared script with a harmless fixture; no real
  project context is read or executed.
- Read-only inspection validates real project declarations and script
  fingerprints. Dispatch with a temporary empty ledger records them as
  untrusted without invoking their commands.
- An isolated DSH and an independent Chrome verify source cards, event groups,
  read-only details, approval, a harmless printf hook on an empty test session,
  disable and revocation. No model prompt is submitted.
- Escape closes the native modal. Desktop and 390px captures show no control
  overflow.
- The documentation links only to approval-only screenshots taken against
  isolated fixtures; no live workspace path appears in them.

## Scope

Only the plugin is in scope. No migrated command is to be approved or executed
during verification.

## Expanded modal scroll fix

Expanding both hooks reproduced a 1584px-tall modal in a 484px viewport: its top
was -550px and no element could scroll. A width limit alone did not constrain the
native Modal. Its flex body also shrank event cards, whose overflow clipping hid
content instead of producing a scrollbar.

The plugin now supplies the official `contentClassName` and caps the dialog to
the viewport's available height. Header and description do not shrink; the body
has `min-height: 0` and vertical overflow, with nonshrinking child cards. The
selectors are scoped to this plugin's modal, not the shared DSH component.

`test/browser-scroll.mjs` exercises real wheel and PageDown input at 1440x768,
1024x420 and 390x640 with all details expanded. It checks that the last hook
action is reachable while the close button remains fixed, including after adding
approval details. Consent is never selected. The dialog was measured at 24..460px
in a 484px viewport, with a 308px scroll viewport and 1488px scrollable content.
