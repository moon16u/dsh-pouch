# Contributing to dsh-hooks

`@moon16u/dsh-hooks` is one package inside the [dsh-pouch](../../) monorepo: a
DeepSeek Harness bundle for file-defined command hooks with an approval-only UI.
Use public DSH service/event contracts; do not patch the installed host.

## Development

Run from the repository root so the shared workspace lockfile applies:

```bash
pnpm install
pnpm --filter @moon16u/dsh-hooks test
```

The package has no build step. `lib/index.js` mounts the hook engine,
`lib/hooks/` owns command execution/configuration/trust/adapters, `lib/client.js`
is the hand-written browser bundle, and `lib/types/index.d.ts` describes exports.
`lib/` is committed. Clone it and it is mountable as-is.

## Guidelines

1. Keep the plugin dependency-free at runtime beyond its declared `peerDependencies`
   (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`).
   DSH supplies them at mount time.
2. Every behavior change needs a test in `test/`; the package test script must pass.
3. Do not add a `settings.yaml` namespace requirement to the mount path — the plugin
   reads file declarations, which must never carry trust grants.
4. Keep `cordis.patch.yml` to the single `insert` entry that mounts this bundle.
5. Update both `README.md` and `README.zh-CN.md` together.
6. Keep command declarations and trust separate. Do not expose an unauthenticated
   execute/trust endpoint or allow hook decisions to bypass native policy.
7. Do not restore configuration editors, memory-specific settings or a second
   context injection path. GUI actions are restricted to review/approve,
   enable/disable, revoke, refresh and read-only inspection.
8. Verify protocol errors, cancellation, queued revocation and process cleanup
   with tests. Never run real project hooks, model calls or live settings changes
   as a test. Run `test/official-runtime.mjs` only against an explicitly selected
   installed DSH runtime, using its isolated fixtures.
9. Keep the native settings schema JSON-projectable. A custom transform may pass
   host validation yet make the browser's shared config form unavailable.
10. Never commit a screenshot, fixture or document that carries a real local
    path, user name, host address or approved-command listing.

## Reporting

Open an issue at <https://github.com/moon16u/dsh-pouch/issues>. For
security issues, follow [SECURITY.md](./SECURITY.md) instead.
