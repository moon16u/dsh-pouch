import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeEnvironment, nativeLaunchPlan, scheduleNativeRestart } from "../lib/native-restart.js";

function context(home, exit = () => {}, name = "web") {
  const services = {
    profileContext: { name, cwd: home, home },
    appExit: exit,
    webServer: { getOrigin: () => "http://127.0.0.1:12345" },
  };
  return { get: (key) => services[key] };
}

test("native environment removes restart markers with Windows key semantics", () => {
  const env = nativeEnvironment({ Path: "original", dsh_home: "old", Dsh_Shell: "1", DSH_RESTART_ALLOWED: "1", TOKEN: "kept" }, "new", "win32");
  assert.deepEqual(env, { Path: "original", TOKEN: "kept", DSH_HOME: "new" });
  assert.equal(nativeEnvironment({ dsh_home: "unrelated" }, "new", "darwin").dsh_home, "unrelated");
});

for (const platform of ["win32", "darwin"]) {
  test(`${platform} plan preserves executable, flags, overlays, cwd and home without a shell`, () => {
    const base = platform === "win32" ? "C:\\User Space" : "/Users/user space";
    const executable = platform === "win32" ? `${base}\\node.exe` : `${base}/node`;
    const entry = platform === "win32" ? `${base}\\dsh.js` : `${base}/dsh.js`;
    const runtime = {
      platform, pid: 42, execPath: executable, execArgv: ["--expose-internals"],
      argv: [executable, entry, "--profile", "web", "--patch", "a ' & b.yml", "--port", "12345"],
      versions: {}, connected: false, cwd: () => "changed later",
    };
    const { plan } = nativeLaunchPlan(context(base), "wrong-home", "session-a", runtime);
    assert.equal(plan.executable, executable);
    assert.deepEqual(plan.args, ["--expose-internals", entry, ...runtime.argv.slice(2), "--no-open"]);
    assert.equal(plan.home, base);
    assert.equal(plan.cwd, base);
    assert.equal(plan.sessionId, "session-a");
    assert.equal(plan.ownerPid, 42);
  });
}

test("native launch rejects Desktop and unmanaged exit before spawning", () => {
  assert.throws(() => nativeLaunchPlan(context("/tmp", undefined, "desktop"), "/tmp"), /not Electron\/IPC-managed/);
  assert.throws(() => nativeLaunchPlan({ get: () => undefined }, "/tmp"), /appExit/);
});

test("native scheduler waits for helper readiness and commits before appExit", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "_tmp_native-scheduler-"));
  t.after(() => renameSync(home, `${home}.recovered`));
  const steps = [];
  let options;
  let cancel;
  class Child extends EventEmitter {
    connected = true;
    send(message, callback) {
      steps.push(message.type);
      if (message.type === "prepare") queueMicrotask(() => this.emit("message", { type: "ready", id: message.plan.id }));
      callback?.(null);
    }
    disconnect() { this.connected = false; }
    unref() {}
  }
  const runtime = {
    platform: process.platform, execPath: process.execPath, execArgv: [],
    argv: [process.execPath, new URL(import.meta.url).pathname], pid: process.pid,
    versions: {}, connected: false, cwd: () => home, env: {},
  };
  // Windows file URLs carry a leading slash that is not a native drive path.
  runtime.argv[1] = process.execPath;
  await scheduleNativeRestart(context(home, () => steps.push("exit")), home, "test", 20,
    (stop) => { cancel = stop; return () => { cancel = undefined; }; },
    (failure) => assert.fail(failure.reason),
    { runtime, spawn: (_exe, _args, opts) => {
      options = opts;
      const child = new Child();
      queueMicrotask(() => child.emit("spawn"));
      return child;
    } });
  assert.deepEqual(steps, ["prepare"]);
  assert.equal(options.detached, true);
  assert.equal(options.windowsHide, true);
  assert.equal(options.stdio[3], "ipc");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(steps, ["prepare", "restart", "exit"]);
  assert.equal(cancel, undefined);
});

test("a late helper readiness message cannot restart a cancelled host", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "_tmp_native-cancel-"));
  t.after(() => renameSync(home, `${home}.recovered`));
  let cancel, id;
  let exited = false;
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    send(message, callback) { if (message.type === "prepare") id = message.plan.id; callback?.(null); },
    disconnect() { this.connected = false; },
    unref() {},
  });
  const runtime = {
    platform: process.platform, execPath: process.execPath, execArgv: [],
    argv: [process.execPath, process.execPath], pid: process.pid,
    versions: {}, connected: false, cwd: () => home, env: {},
  };
  const pending = scheduleNativeRestart(context(home, () => { exited = true; }), home, "test", 10,
    (stop) => { cancel = stop; return () => {}; }, () => {},
    { runtime, spawn: () => { queueMicrotask(() => child.emit("spawn")); return child; } });
  const rejected = assert.rejects(pending, /cancelled before handoff/);
  await new Promise((resolve) => setImmediate(resolve));
  cancel();
  child.emit("message", { type: "ready", id });
  await rejected;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(exited, false);
});
