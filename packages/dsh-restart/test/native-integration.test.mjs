import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("detached native helper survives its harmless owner and starts one replacement", { timeout: 20000 }, async (t) => {
  const home = mkdtempSync(join(tmpdir(), "_tmp_native-e2e-"));
  const entry = join(home, "fake host.mjs");
  const statePath = join(home, "state.json");
  const replacementPath = join(home, "replacement.json");
  const helperPath = join(home, "helper.pid");
  let first;
  let replacement;
  t.after(async () => {
    first?.kill();
    if (!replacement && existsSync(replacementPath)) replacement = JSON.parse(readFileSync(replacementPath, "utf8"));
    if (replacement) {
      try { process.kill(replacement.pid); } catch {}
    }
    if (existsSync(helperPath)) {
      try { process.kill(Number(readFileSync(helperPath, "utf8"))); } catch {}
    }
    await sleep(200);
    renameSync(home, `${home}.recovered`);
  });
  writeFileSync(entry, `
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { scheduleNativeRestart } from ${JSON.stringify(new URL("../lib/native-restart.js", import.meta.url).href)};
const home = ${JSON.stringify(home)};
const statePath = ${JSON.stringify(statePath)};
const replacementPath = ${JSON.stringify(replacementPath)};
const old = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
const server = http.createServer((_req, res) => { res.writeHead(401); res.end(); });
await new Promise(resolve => server.listen(old?.port || 0, "127.0.0.1", resolve));
const port = server.address().port;
if (old) {
  writeFileSync(replacementPath, JSON.stringify({ pid: process.pid, cwd: process.cwd(), argv: process.argv, home: process.env.DSH_HOME, shell: process.env.DSH_SHELL }));
} else {
  writeFileSync(statePath, JSON.stringify({ pid: process.pid, port }));
  const services = {
    profileContext: { name: "web", cwd: home, home },
    appExit: () => server.close(() => process.exit(0)),
    webServer: { getOrigin: () => "http://127.0.0.1:" + port },
  };
  await scheduleNativeRestart({ get: name => services[name] }, home, "fake-chat", 30, () => () => {}, () => {}, {
    spawn: (...args) => {
      const child = spawn(...args);
      if (child.pid) writeFileSync(${JSON.stringify(helperPath)}, String(child.pid));
      return child;
    },
  });
}
`);
  const env = { ...process.env, DSH_HOME: home, DSH_SHELL: "test-marker" };
  delete env.DSH_RESTART_DRY_RUN;
  // Do not inherit a test runner's Node hooks into the fake application.
  delete env.NODE_OPTIONS;
  first = spawn(process.execPath, [entry, "--test-argument", "space & quote'"], {
    cwd: home, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let stderr = "";
  first.stderr.on("data", (data) => { stderr += data; });
  const exited = new Promise((resolve, reject) => {
    first.once("error", reject);
    first.once("exit", resolve);
  });
  for (let i = 0; i < 150 && !existsSync(replacementPath); i++) await sleep(50);
  assert.ok(existsSync(replacementPath), stderr || "replacement was not started");
  replacement = JSON.parse(readFileSync(replacementPath, "utf8"));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(await exited, 0);
  assert.notEqual(replacement.pid, state.pid);
  assert.equal(realpathSync(replacement.cwd), realpathSync(home));
  assert.equal(replacement.home, home);
  assert.equal(replacement.shell, undefined);
  assert.deepEqual(replacement.argv.slice(1), [entry, "--test-argument", "space & quote'", "--no-open"]);
  assert.equal(existsSync(join(home, "restart-failed.json")), false);
  // Let the helper observe readiness before teardown terminates the test host.
  await sleep(600);
});
