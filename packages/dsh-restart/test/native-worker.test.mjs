import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNativeRestart, validateNativePlan } from "../lib/native-worker.js";

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), "_tmp_native-worker-"));
  t.after(() => renameSync(home, `${home}.recovered`));
  t.mock.method(console, "error", () => {});
  return {
    plan: { id: "test-attempt", ownerPid: 11, executable: process.execPath, args: ["fake-dsh.js", "--no-open"], cwd: home, home, origin: "http://127.0.0.1:12345", platform: process.platform },
    marker: join(home, "restart-failed.json"),
  };
}

function spawner(calls, failed = false) {
  return (exe, args, options) => {
    calls.push({ exe, args, options });
    const child = Object.assign(new EventEmitter(), { pid: 22, unref() {} });
    queueMicrotask(() => child.emit(failed ? "error" : "spawn", ...(failed ? [new Error("fake launch error")] : [])));
    return child;
  };
}

test("invalid native plans are refused", () => {
  assert.throws(() => validateNativePlan({ ownerPid: -1 }), /Invalid native restart plan/);
});

test("a host that has not exited is never killed or duplicated", async (t) => {
  const { plan, marker } = fixture(t);
  await runNativeRestart(plan, {
    alive: () => true, responds: async () => false, sleep: async () => {}, errorPage: false,
    spawn: () => assert.fail("must not spawn a competing instance"),
  });
  assert.match(JSON.parse(readFileSync(marker, "utf8")).reason, /did not exit/);
});

test("an occupied port prevents a replacement from being spawned", async (t) => {
  const { plan, marker } = fixture(t);
  await runNativeRestart(plan, {
    alive: () => false, responds: async () => true, errorPage: false,
    spawn: () => assert.fail("must leave the existing listener alone"),
  });
  assert.match(JSON.parse(readFileSync(marker, "utf8")).reason, /already occupied/);
});

test("successful native startup preserves the invocation and resolves the old diagnostic", async (t) => {
  const { plan, marker } = fixture(t);
  writeFileSync(marker, '{"reason":"previous failure"}');
  const calls = [];
  let probes = 0;
  await runNativeRestart(plan, {
    alive: (pid) => pid === 22, responds: async () => ++probes > 1,
    spawn: spawner(calls), errorPage: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].exe, plan.executable);
  assert.deepEqual(calls[0].args, plan.args);
  assert.equal(calls[0].options.cwd, plan.cwd);
  assert.equal(calls[0].options.env.DSH_HOME, plan.home);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(join(plan.home, "restart-failed.test-attempt.resolved.json")), true);
});

test("a failed spawn records an actionable failure and a native retry plan", async (t) => {
  const { plan, marker } = fixture(t);
  await runNativeRestart(plan, {
    alive: () => false, responds: async () => false, spawn: spawner([], true), errorPage: false,
  });
  const failure = JSON.parse(readFileSync(marker, "utf8"));
  assert.match(failure.reason, /fake launch error/);
  assert.deepEqual(failure.nativePlan.args, plan.args);
  assert.match(failure.scriptPath, /dsh-restart-worker\.mjs$/);
});

test("startup timeout retains the replacement PID so retry cannot duplicate it", async (t) => {
  const { plan, marker } = fixture(t);
  await runNativeRestart(plan, {
    alive: (pid) => pid === 22, responds: async () => false,
    sleep: async () => {}, spawn: spawner([]), errorPage: false,
  });
  const failure = JSON.parse(readFileSync(marker, "utf8"));
  assert.match(failure.reason, /30 seconds/);
  assert.equal(failure.nativePlan.ownerPid, 22);
});
