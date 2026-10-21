import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import { runCommand, parseOutput } from "../lib/hooks/runner.js";
import { parseConfig } from "../lib/hooks/config.js";
import { HookStore } from "../lib/hooks/store.js";
import { HookEngine } from "../lib/hooks/engine.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value, windows) => windows ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "_tmp_hooks \u6708\u89c1 ' native-"));
  const script = path.join(root, "hook \u6708\u89c1.mjs");
  fs.copyFileSync(new URL("fixtures/native-command.mjs", import.meta.url), script);
  fs.mkdirSync(path.join(root, ".git"));
  const ctx = new Context();
  const fiber = ctx.plugin(LocalSubprocessRuntime);
  t.after(async () => {
    await fiber.dispose();
    for (const file of fs.readdirSync(root)) {
      if (file === ".git") fs.rmdirSync(path.join(root, file));
      else fs.unlinkSync(path.join(root, file));
    }
    fs.rmdirSync(root);
  });
  await fiber.await();
  const subprocess = ctx.get("subprocess");
  assert.ok(subprocess, "official subprocess must mount; no skipped native tests");
  const { platform } = await subprocess.terminalEnvironment();
  const windows = platform === "windows";
  const command = (mode, args = []) => `${windows ? "& " : ""}${quote(process.execPath, windows)} ${quote(script, windows)} ${quote(mode, windows)}${args.map((arg) => ` ${quote(arg, windows)}`).join("")}${windows ? "; exit $LASTEXITCODE" : ""}`;
  const entry = (mode, changes = {}, args = []) => ({ ...parseConfig(JSON.stringify({ hooks: { SessionStart: [{ hooks: [
    { id: "native", type: "command", command: command(mode, args), timeout: 10, ...changes },
  ] }] } }))[0], cwd: root });
  return { root, subprocess, entry, command };
}

if (process.platform === "win32") {
  for (const legacy of [false, true]) {
    test(`official native ${legacy ? "Windows PowerShell 5.1 fallback" : "PowerShell 7"} reads Unicode JSON stdin and writes UTF-8`, async (t) => {
      const f = await fixture(t);
      const subprocess = legacy ? {
        terminalEnvironment: (...args) => f.subprocess.terminalEnvironment(...args),
        resolveExecutable: (name, ...args) => {
          if (!name.endsWith("powershell.exe")) throw Object.assign(new Error("missing"), { name: "SubprocessExecutableNotFoundError" });
          return f.subprocess.resolveExecutable(name, ...args);
        },
        spawn: (...args) => f.subprocess.spawn(...args),
      } : f.subprocess;
      const command = "$p = [Console]::In.ReadToEnd() | ConvertFrom-Json; [Console]::Write($p.prompt)";
      const entry = f.entry("text", { command });
      const prompt = "\u6708\u89c1 caf\u00e9 \ud83c\udf19";
      const result = await runCommand(subprocess, entry, { prompt });
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.deepEqual(parseOutput(entry, result).contexts, [prompt]);
    });
  }
}

test("official native subprocess transports JSON without interpolation in spaced Unicode paths", async (t) => {
  const f = await fixture(t);
  const prompt = "\u6708\u89c1 caf\u00e9 \ud83c\udf19 ' ; $(echo injection) & $env:PATH \n next";
  const entry = f.entry("echo");
  const result = await runCommand(f.subprocess, entry, { hook_event_name: "SessionStart", prompt });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.deepEqual(parseOutput(entry, result).contexts, [prompt]);
});

test("official native subprocess decodes Unicode context and limits captured output", async (t) => {
  const f = await fixture(t);
  const entry = f.entry("text");
  const text = await runCommand(f.subprocess, entry, {});
  assert.equal(text.status, "completed", JSON.stringify(text));
  assert.deepEqual(parseOutput(entry, text).contexts, ["\u6708\u89c1 caf\u00e9 \ud83c\udf19"]);
  const result = await runCommand(f.subprocess, f.entry("overflow", { maxOutputBytes: 256 }), {});
  assert.equal(result.status, "error");
  assert.match(result.error, /exceeded/);
});

test("official native subprocess scrubs credentials and startup injections but preserves explicit env", async (t) => {
  const f = await fixture(t);
  const values = { DSH_HOOK_TEST_SECRET: "must-not-inherit", BASH_ENV: "/must-not-load", NODE_OPTIONS: "--throw-deprecation" };
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    const result = await runCommand(f.subprocess, f.entry("env", { env: { HOOK_VALUE: "\u6708 ' &" } }), {});
    assert.equal(result.status, "completed", JSON.stringify(result));
    const env = JSON.parse(result.stdout);
    assert.deepEqual({ ...env, cwd: "" }, {
      secret: "unset", startup: "unset", options: "unset", explicit: "\u6708 ' &",
      active: "1", event: "SessionStart", cwd: "",
    });
    assert.equal(fs.realpathSync(env.cwd), fs.realpathSync(f.root));
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("official native subprocess preserves exit 2 denial and other nonzero errors", async (t) => {
  const f = await fixture(t);
  const entry = f.entry("exit", {}, ["2"]);
  const result = await runCommand(f.subprocess, entry, {});
  assert.equal(result.exitCode, 2, JSON.stringify(result));
  assert.equal(parseOutput(entry, result).block, true);
  assert.equal(parseOutput(entry, result).reason, "exit reason");
  const error = await runCommand(f.subprocess, f.entry("exit", {}, ["7"]), {});
  assert.equal(error.status, "error");
  assert.equal(error.exitCode, 7, JSON.stringify(error));
});

async function waitForFiles(root) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    try {
      if (fs.statSync(path.join(root, "heartbeat")).size > 0) {
        return JSON.parse(fs.readFileSync(path.join(root, "pids.json"), "utf8"));
      }
    } catch {}
    await wait(25);
  }
  assert.fail("fixture child did not start within 8 seconds");
}

async function assertStopped(root, pids) {
  await wait(200);
  const heartbeat = fs.readFileSync(path.join(root, "heartbeat"), "utf8");
  await wait(200);
  assert.equal(fs.readFileSync(path.join(root, "heartbeat"), "utf8"), heartbeat, "managed descendant must stop writing");
  for (const pid of [pids.parent, pids.child]) {
    // A reaped process and a Linux zombie are both stopped, but kill(0) sees zombies.
    let zombie = false;
    if (process.platform === "linux") {
      try { zombie = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].startsWith("Z "); } catch {}
    }
    if (!zombie) assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i);
  }
}

test("official native timeout terminates and joins parent plus managed descendants", async (t) => {
  const f = await fixture(t);
  const pending = runCommand(f.subprocess, f.entry("wait", { timeout: 5 }), {});
  const pids = await waitForFiles(f.root);
  const result = await pending;
  assert.equal(result.status, "timeout", JSON.stringify(result));
  await assertStopped(f.root, pids);
});

test("official native caller cancellation terminates and joins the process range", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  const pending = runCommand(f.subprocess, f.entry("wait"), {}, abort.signal);
  const pids = await waitForFiles(f.root);
  abort.abort();
  assert.equal((await pending).status, "cancelled");
  await assertStopped(f.root, pids);
});

test("official native trust, duplicate identity, shell change and revocation gate real side effects", async (t) => {
  const f = await fixture(t);
  const store = new HookStore(path.join(f.root, "state.json"));
  const settings = { commandHooksEnabled: true, commandHooks: JSON.stringify({ hooks: { SessionStart: [{ hooks: [
    { id: "counter", type: "command", command: f.command("counter") },
  ] }] } }) };
  const engine = new HookEngine({ store, subprocess: f.subprocess, home: f.root, profile: "isolated", cwd: f.root,
    getConfig: () => settings });
  t.after(() => engine.dispose());
  const agent = { session: { header: { id: "isolated", cwd: f.root } } };
  await engine.dispatch("SessionStart", agent, {}, "untrusted");
  assert.equal(fs.existsSync(path.join(f.root, "counter")), false);
  let entry = engine.inspect(f.root).entries[0];
  engine.change("trust", f.root, entry.key, entry.hash);
  const result = await engine.dispatch("SessionStart", agent, {}, "once");
  await engine.dispatch("SessionStart", agent, {}, "once");
  assert.deepEqual(result.contexts, ["context"]);
  assert.equal(fs.readFileSync(path.join(f.root, "counter"), "utf8"), "x");
  const changed = JSON.parse(settings.commandHooks);
  changed.hooks.SessionStart[0].hooks[0].shell = process.platform === "win32" ? "pwsh" : "bash";
  settings.commandHooks = JSON.stringify(changed);
  assert.equal(engine.inspect(f.root).entries[0].trusted, false);
  await engine.dispatch("SessionStart", agent, {}, "changed");
  assert.equal(fs.readFileSync(path.join(f.root, "counter"), "utf8"), "x");
  entry = engine.inspect(f.root).entries[0];
  engine.change("trust", f.root, entry.key, entry.hash);
  engine.change("revoke", f.root, entry.key, entry.hash);
  await engine.dispatch("SessionStart", agent, {}, "revoked");
  assert.equal(fs.readFileSync(path.join(f.root, "counter"), "utf8"), "x");
  await engine.dispose();
});
