# Security Policy

## Reporting a Vulnerability

Do not open a public issue for a security problem. Report it privately through
GitHub's [security advisory](https://github.com/moon16u/dsh-pouch/security/advisories/new)
form, or contact the maintainer directly.

## Scope

This plugin executes explicitly approved file-defined command hooks.
Reports that matter most:

- Injection of content that is attributed to a source the plugin does not own.
- Command output exceeding its declared capture or context budget.
- Execution without matching trust for the exact definition and execution cwd.
- Hook `allow` bypassing a native denial, guard or approval policy.
- Bypassing owner authentication, review nonces or origin checks on management routes.
- Cancellation, output overflow or teardown leaving unreported managed processes.

## Command trust boundary

- Commands require approval by default. Editing a declaration, enabling the
  file-only global gate, or loading a project never grants trust. The approval-only UI uses a short-lived one-use
  nonce and a definition hash rechecked before each launch, including queued work.
- Clicking **Approve** below the displayed definition grants approval and enables
  that hook. There is no additional checkbox or duplicate confirmation panel.
  Opening the details or clicking an unapproved switch alone does not grant trust.
  Source-file disable and the profile emergency gate still prevent execution.
- Commands run with the DSH OS user's filesystem and network authority. There is
  **no hook sandbox** and no per-command tool approval. Only trusted local users
  should authorize them. A hook's `permissionDecision: allow` does not itself
  grant a pending tool's native approval.
- Trust hashes include normalized command settings, source identity, canonical
  cwd and the contents of explicitly listed `watchFiles`. Files must be regular
  files under 1 MiB. Other script dependencies, executables, libraries and ambient
  PATH are not pinned. Hashing before launch is not an atomic snapshot against a
  concurrent filesystem edit; do not execute in attacker-writable directories.
- The ledger is outside project declarations, under
  `$DSH_HOME/workspace-hooks/<profile-hash>.json`, with private file permissions.
  It is not tamper-proof against a process running as the same OS user. Use one
  DSH process per profile; concurrent ledger writers are not supported.
- Official subprocess environment scrubbing is retained; explicit `env` fields
  deliberately opt back in and are stored in plaintext in the declaration.
  Prefer scripts that obtain credentials through an appropriate local mechanism.
- Management routes use authenticated owner-only `connection.fetch`. POSTs also
  require a matching Host/Origin, JSON, a UI header and bounded request bodies.
  These checks do not distinguish the human from another fully privileged
  same-origin plugin or a local client that already possesses owner credentials.
- Stdout is never persisted in execution history; only context byte counts are
  stored. Stderr tails and errors are retained, with explicit env values and
  bearer-token patterns redacted. Redaction is best-effort, not secret detection;
  commands must not print other credentials.
- Disable/revoke applies to later launches. Running hooks finish, time out or
  are cancelled with their caller/plugin lifetime. Crashed runs are not replayed.
  Stop continuation has a three-check cap per turn.
- `DSH_HOOK_ACTIVE` suppresses this plugin's command engine in inherited DSH
  children. This prevents accidental direct recursion, not malicious recursion
  through a command that clears its environment or calls an existing server.
