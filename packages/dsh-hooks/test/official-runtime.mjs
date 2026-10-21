// Explicit integration check. Never loaded by the default unit-test command.
// DSH_RUNTIME_ROOT must point to an already installed DSH node_modules directory.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCommand } from "../lib/hooks/runner.js";
import { parseConfig } from "../lib/hooks/config.js";
import { parseOutput } from "../lib/hooks/runner.js";
import { HookStore } from "../lib/hooks/store.js";
import { HookEngine } from "../lib/hooks/engine.js";

const runtime = process.env.DSH_RUNTIME_ROOT;
if (!runtime) throw new Error("Set DSH_RUNTIME_ROOT to the installed DSH node_modules directory");
const { Context } = await import(pathToFileURL(path.join(runtime, "@deepseek-ai/cordis/lib/index.js")));
const { LocalSubprocessRuntime } = await import(pathToFileURL(path.join(runtime, "@deepseek-ai/dsh-subprocess-local/lib/index.js")));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "_tmp_dsh-hooks-native-"));
fs.mkdirSync(path.join(root, ".git"));
const ctx = new Context();
const fiber = ctx.plugin(LocalSubprocessRuntime);
await fiber.await();
const subprocess = ctx.get("subprocess");
assert.ok(subprocess, "official subprocess service is mounted");
const make = (command, timeout = 5, maxOutputBytes = 65536) => ({
  ...parseConfig(JSON.stringify({ hooks: { SessionStart: [{ hooks: [
    { id: "native-test", type: "command", shell: "bash", command, timeout, maxOutputBytes },
  ] }] } }))[0], cwd: root,
});
try {
  const echo = make("node -e 'let s=\"\";process.stdin.on(\"data\",c=>s+=c);process.stdin.on(\"end\",()=>{const p=JSON.parse(s);process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:p.hook_event_name,additionalContext:p.prompt}}))})'");
  const result = await runCommand(subprocess, echo, { hook_event_name: "SessionStart", prompt: "offline payload" });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, "offline payload");
  console.log("PASS: official subprocess JSON stdin/stdout");

  const timeout = await runCommand(subprocess, make("sleep 30", 1), {});
  assert.equal(timeout.status, "timeout", JSON.stringify(timeout));
  console.log("PASS: timeout and process-range cleanup");

  const abort = new AbortController();
  const cancel = runCommand(subprocess, make("sleep 30", 10), {}, abort.signal);
  setTimeout(() => abort.abort(), 100);
  assert.equal((await cancel).status, "cancelled");
  console.log("PASS: caller cancellation");

  const capped = await runCommand(subprocess, make("printf '%05000d' 0", 5, 256), {});
  assert.equal(capped.status, "error");
  assert.match(capped.error, /exceeded/);
  console.log("PASS: oversized output rejection");

  const previous = process.env.DSH_HOOK_TEST_SECRET;
  process.env.DSH_HOOK_TEST_SECRET = "must-not-inherit";
  const secret = await runCommand(subprocess, make('printf "%s" "${DSH_HOOK_TEST_SECRET-unset}"'), {});
  if (previous === undefined) delete process.env.DSH_HOOK_TEST_SECRET;
  else process.env.DSH_HOOK_TEST_SECRET = previous;
  assert.equal(secret.stdout, "unset");
  console.log("PASS: official environment scrubbing");

  const config = JSON.stringify({ hooks: { SessionStart: [{ hooks: [
    { id: "counter", type: "command", shell: "bash", command: "printf x >> counter; printf context", timeout: 5 },
  ] }] } });
  const store = new HookStore(path.join(root, "state.json"));
  const engine = new HookEngine({ store, subprocess, home: root, profile: "integration", cwd: root,
    getConfig: () => ({ commandHooksEnabled: true, commandHooks: config }) });
  const agent = { session: { header: { id: "offline-test", cwd: root } } };
  await engine.dispatch("SessionStart", agent, {}, "untrusted");
  assert.equal(fs.existsSync(path.join(root, "counter")), false);
  const entry = engine.inspect(root).entries[0];
  engine.change("trust", root, entry.key, entry.hash);
  const first = await engine.dispatch("SessionStart", agent, {}, "once");
  await engine.dispatch("SessionStart", agent, {}, "once");
  assert.deepEqual(first.contexts, ["context"]);
  assert.equal(fs.readFileSync(path.join(root, "counter"), "utf8"), "x");
  engine.change("revoke", root, entry.key, entry.hash);
  await engine.dispatch("SessionStart", agent, {}, "revoked");
  assert.equal(fs.readFileSync(path.join(root, "counter"), "utf8"), "x");
  await engine.dispose();
  console.log("PASS: real command trust, event deduplication and revocation");

  // Optional adapter mapping check. The caller supplies a directory holding one
  // adapter entry script (.mjs) and one sibling script (.sh) it invokes. The
  // sibling's contents are replaced with a harmless stub, keeping its name so
  // the adapter's relative reference stays valid. No project layout is assumed.
  const fixture = process.env.DSH_HOOK_TEST_FIXTURE;
  const fixtureFiles = fixture && fs.existsSync(fixture) ? fs.readdirSync(fixture) : [];
  const entryName = fixtureFiles.find((name) => path.extname(name) === ".mjs");
  const siblingName = fixtureFiles.find((name) => path.extname(name) === ".sh");
  if (!entryName || !siblingName) {
    console.log("SKIP: adapter mapping (set DSH_HOOK_TEST_FIXTURE to a directory with one .mjs and one .sh)");
  } else {
    fs.copyFileSync(path.join(fixture, entryName), path.join(root, entryName));
    fs.writeFileSync(path.join(root, siblingName), `#!/bin/bash
cat >/dev/null
printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"isolated-context"}}'
`);
    for (const event of ["SessionStart", "PostCompact"]) {
      const entry = { ...make(`node "${path.join(root, entryName)}"`), event };
      const output = await runCommand(subprocess, entry, { hook_event_name: event });
      assert.equal(output.status, "completed", JSON.stringify(output));
      assert.deepEqual(parseOutput(entry, output).contexts, ["isolated-context"]);
      assert.equal(JSON.parse(output.stdout).hookSpecificOutput.hookEventName, event);
    }
    fs.writeFileSync(path.join(root, siblingName), `#!/bin/bash
printf '%s\\n' '{"additional_context":""}'
`);
    const noFiles = await runCommand(subprocess, make(`node "${path.join(root, entryName)}"`), { hook_event_name: "SessionStart" });
    assert.deepEqual(parseOutput(make(":"), noFiles).contexts, []);
    console.log("PASS: supplied adapter maps startup/compaction and empty sources without reading project context");
  }
} finally {
  await fiber.dispose();
  for (const name of fs.readdirSync(root)) {
    if (name === ".git") fs.rmdirSync(path.join(root, name));
    else fs.unlinkSync(path.join(root, name));
  }
  fs.rmdirSync(root);
}
