import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandSpec, POWERSHELL_ENCODING } from "../lib/hooks/shell.js";
import { parseConfig, discover, fingerprint } from "../lib/hooks/config.js";
import { runCommand } from "../lib/hooks/runner.js";
import { HookStore, replaceState } from "../lib/hooks/store.js";

const definition = (changes = {}) => parseConfig(JSON.stringify({ hooks: { SessionStart: [{ hooks: [
  { id: "platform", type: "command", command: "echo test", ...changes },
] }] } }))[0];
const missing = () => Object.assign(new Error("not on PATH"), { name: "SubprocessExecutableNotFoundError" });
const signal = () => new AbortController().signal;

for (const [platform, shell] of [["posix", "bash"], ["windows", "pwsh"]]) {
  test(`auto selects ${shell} from provider ${platform} facts and preserves one command argument`, async () => {
    const entry = definition({ command: "'; & echo untouched", env: { PATH: "trusted-path", VALUE: "a b" } });
    const calls = [];
    const spec = await commandSpec({
      terminalEnvironment: async () => ({ platform, defaultShell: "must-not-be-used" }),
      resolveExecutable: async (name, env, cancellation) => {
        calls.push(name);
        assert.equal(env.PATH, "trusted-path");
        assert.equal(env.VALUE, "a b");
        assert.ok(cancellation);
        return "resolved executable with spaces";
      },
    }, entry, signal());
    assert.equal(calls.length, 1);
    assert.equal(spec.argv[0], "resolved executable with spaces");
    assert.equal(spec.argv.at(-1), shell === "pwsh" ? POWERSHELL_ENCODING + entry.command : entry.command);
    assert.equal(spec.env.DSH_HOOK_ACTIVE, "1");
    assert.equal(spec.env.DSH_HOOK_EVENT, "SessionStart");
    for (const name of ["BASH_ENV", "ENV", "NODE_OPTIONS"]) assert.equal(spec.env[name], undefined);
  });
}

for (const [platform, shell] of [["windows", "bash"], ["posix", "pwsh"]]) {
  test(`explicit ${shell} overrides ${platform} auto selection`, async () => {
    const calls = [];
    const spec = await commandSpec({
      terminalEnvironment: async () => ({ platform }),
      resolveExecutable: async (name) => { calls.push(name); return name; },
    }, definition({ shell }), signal());
    assert.deepEqual(calls, [shell]);
    assert.equal(spec.argv.includes("-Command"), shell === "pwsh");
  });
}

test("Windows PowerShell fallback probes installation, PATH and legacy executable in order", async () => {
  const calls = [];
  const spec = await commandSpec({
    terminalEnvironment: async () => ({ platform: "windows" }),
    resolveExecutable: async (name) => { calls.push(name); if (calls.length < 3) throw missing(); return name; },
  }, definition(), signal());
  assert.equal(calls.length, 3);
  assert.match(calls[0], /PowerShell\\7\\pwsh\.exe$/);
  assert.equal(calls[1], "pwsh");
  assert.match(calls[2], /WindowsPowerShell\\v1\.0\\powershell\.exe$/);
  assert.equal(spec.argv[0], calls[2]);
  assert.ok(spec.argv.at(-1).includes("UTF8Encoding"));
});

test("missing PowerShell produces an actionable failure without silently switching syntax", async () => {
  await assert.rejects(commandSpec({
    terminalEnvironment: async () => ({ platform: "windows" }),
    resolveExecutable: async () => { throw missing(); },
  }, definition(), signal()), /PowerShell is unavailable/);
});

test("permission and infrastructure lookup errors do not trigger a shell fallback", async () => {
  let calls = 0;
  await assert.rejects(commandSpec({
    terminalEnvironment: async () => ({ platform: "windows" }),
    resolveExecutable: async () => { calls++; throw Object.assign(new Error("denied"), { code: "EACCES" }); },
  }, definition(), signal()), /denied/);
  assert.equal(calls, 1);
});

test("cancellation during executable resolution prevents spawning and fallback", async () => {
  const abort = new AbortController();
  let calls = 0;
  const result = await runCommand({
    terminalEnvironment: async () => ({ platform: "windows" }),
    resolveExecutable: async () => { calls++; abort.abort(); throw missing(); },
    spawn: () => assert.fail("cancelled resolution must not spawn"),
  }, { ...definition(), cwd: os.tmpdir() }, {}, abort.signal);
  assert.equal(result.status, "cancelled");
  assert.equal(calls, 1);
});

test("unknown provider platforms fail before executable lookup or spawn", async () => {
  const result = await runCommand({
    terminalEnvironment: async () => ({ platform: "unknown" }),
    resolveExecutable: () => assert.fail(),
    spawn: () => assert.fail(),
  }, definition(), {});
  assert.equal(result.status, "error");
  assert.match(result.error, /platform/);
});

test("Windows explicit env case normalization preserves scrub and owned recursion markers", async () => {
  const spec = await commandSpec({
    terminalEnvironment: async () => ({ platform: "windows" }),
    resolveExecutable: async () => "pwsh.exe",
  }, definition({ env: { node_options: "--trusted", path: "custom", dsh_hook_active: "0", dsh_hook_event: "spoof" } }), signal());
  assert.equal(spec.env.NODE_OPTIONS, "--trusted");
  assert.equal(spec.env.PATH, "custom");
  assert.equal(spec.env.DSH_HOOK_ACTIVE, "1");
  assert.equal(spec.env.DSH_HOOK_EVENT, "SessionStart");
  assert.ok(Object.keys(spec.env).every((key) => key === key.toUpperCase()));
});

test("shell changes revoke exact-definition trust; explicit auto matches default normalization", () => {
  const base = { ...definition(), cwd: "/fixture" };
  const digest = fingerprint(base);
  assert.equal(fingerprint({ ...definition({ shell: "auto" }), cwd: base.cwd }), digest);
  for (const shell of ["bash", "pwsh"]) assert.notEqual(fingerprint({ ...base, shell }), digest);
  for (const shell of [null, "", "cmd.exe", false, {}]) assert.throws(() => definition({ shell }));
});

for (const code of ["EACCES", "EBUSY", "EPERM"]) {
  test(`Windows atomic replacement retries ${code} and preserves the same temp path`, () => {
    const calls = [];
    const delays = [];
    replaceState("temp", "target", { platform: "win32",
      rename: (...args) => { calls.push(args); if (calls.length < 4) throw Object.assign(new Error("busy"), { code }); },
      wait: (delay) => delays.push(delay),
    });
    assert.deepEqual(calls, Array(4).fill(["temp", "target"]));
    assert.deepEqual(delays, [20, 40, 80]);
  });
}

test("Windows atomic retries are bounded and POSIX or permanent failures never retry", () => {
  let attempts = 0;
  const delays = [];
  assert.throws(() => replaceState("temp", "target", { platform: "win32",
    rename: () => { attempts++; throw Object.assign(new Error("busy"), { code: "EPERM" }); },
    wait: (delay) => delays.push(delay),
  }), /busy/);
  assert.equal(attempts, 9);
  assert.deepEqual(delays, [20, 40, 80, 160, 200, 200, 200, 200]);
  for (const [platform, code] of [["darwin", "EPERM"], ["linux", "EBUSY"], ["win32", "ENOENT"]]) {
    let calls = 0;
    assert.throws(() => replaceState("temp", "target", { platform,
      rename: () => { calls++; throw Object.assign(new Error("failure"), { code }); },
      wait: () => assert.fail("unexpected retry"),
    }), /failure/);
    assert.equal(calls, 1);
  }
});

test("native spaced paths keep discovery, repeated ledger replacement and permissions platform-correct", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "_tmp_hooks paths-"));
  t.after(() => {
    fs.unlinkSync(path.join(root, ".dsh", "hooks.json"));
    fs.rmdirSync(path.join(root, ".dsh"));
    fs.unlinkSync(path.join(root, "state.json"));
    fs.rmdirSync(path.join(root, ".git"));
    fs.rmdirSync(root);
  });
  fs.mkdirSync(path.join(root, ".git"));
  fs.mkdirSync(path.join(root, ".dsh"));
  fs.writeFileSync(path.join(root, ".dsh", "hooks.json"), JSON.stringify({ hooks: {} }));
  assert.equal(discover({ cwd: root, home: root }).sources[2].path, path.join(fs.realpathSync(root), ".dsh", "hooks.json"));
  const store = new HookStore(path.join(root, "state.json"));
  store.change("trust", "key", "one");
  store.change("trust", "key", "two");
  assert.equal(new HookStore(store.path).trusted("key", "two"), true);
  assert.equal(fs.readdirSync(root).filter((name) => name.endsWith(".tmp")).length, 0);
  if (process.platform !== "win32") assert.equal(fs.statSync(store.path).mode & 0o777, 0o600);
});

test("failed ledger replacement retains old data, rolls back trust and removes only its own temp file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "_tmp_hooks-write-failure-"));
  const target = path.join(root, "directory-target");
  fs.mkdirSync(target);
  const store = new HookStore(path.join(root, "state.json"));
  store.path = target;
  t.after(() => { fs.rmdirSync(target); fs.rmdirSync(root); });
  assert.throws(() => store.change("trust", "key", "digest"));
  assert.equal(store.trusted("key", "digest"), false);
  assert.deepEqual(fs.readdirSync(root), ["directory-target"]);
});
