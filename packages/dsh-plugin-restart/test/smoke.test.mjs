import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// MUST be set before any handler runs. Scheduling is otherwise a real,
// detached restart of whatever DSH instance the test process inherited —
// running this suite unprotected actually restarted production once (each
// handler call schedules a 3s detached `dsh-restart.sh`).
process.env.DSH_RESTART_DRY_RUN = "1";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

test("host entry exports name/inject/apply", async () => {
  const mod = await import("../lib/index.js");
  assert.equal(mod.name, "dsh-restart");
  assert.deepEqual(mod.inject, ["commands", "tools"]);
  assert.equal(typeof mod.apply, "function");
});

test("plugin registers /dsh-restart command that returns immediately", async () => {
  const mod = await import("../lib/index.js");
  let registered;
  const fakeCtx = {
    commands: {
      register(def) { registered = def; },
    },
    tools: { register() {} },
  };
  mod.apply(fakeCtx);
  assert.equal(registered.name, "dsh-restart");
  const result = await registered.handler({ rawInput: "" });
  assert.equal(result.kind, "success");
  assert.match(result.text, /scheduled/);
});

test("plugin registers both /restart and /dsh-restart commands with localized description", async () => {
  const mod = await import("../lib/index.js");
  const commands = [];
  const fakeCtx = {
    commands: {
      register(def) { commands.push(def); },
    },
    tools: { register() {} },
  };
  mod.apply(fakeCtx);
  const restartCmd = commands.find((c) => c.name === "restart");
  const dshRestartCmd = commands.find((c) => c.name === "dsh-restart");
  assert.ok(restartCmd, "/restart command registered");
  assert.ok(dshRestartCmd, "/dsh-restart command registered");
  assert.equal(restartCmd.description, "在 3 秒后平滑重启 DSH 进程");
  assert.equal(dshRestartCmd.description, "在 3 秒后平滑重启 DSH 进程");
  assert.equal(restartCmd.input, undefined, "no input hint should be set on restart");
  assert.equal(dshRestartCmd.input, undefined, "no input hint should be set on dsh-restart");
  const res = await restartCmd.handler({ rawInput: "" });
  assert.equal(res.kind, "success");
  assert.match(res.text, /scheduled/);
});

test("plugin registers dsh_restart agent tool", async () => {
  const mod = await import("../lib/index.js");
  const tools = [];
  const fakeCtx = {
    commands: { register() {} },
    tools: { register(t) { tools.push(t); } },
  };
  mod.apply(fakeCtx);
  const tool = tools.find((t) => t.name === "dsh_restart");
  assert.ok(tool, "dsh_restart tool registered");
  assert.match(tool.description, /restart DSH/i);
  const result = await tool.execute({}, {});
  assert.equal(result.ok, true);
  assert.match(result.text, /scheduled/);
});

test("dsh_restart ignores delay_ms and always schedules 3s", async () => {
  const mod = await import("../lib/index.js");
  const tools = [];
  const fakeCtx = {
    commands: { register() {} },
    tools: { register(t) { tools.push(t); } },
  };
  mod.apply(fakeCtx);
  const tool = tools.find((t) => t.name === "dsh_restart");
  const result = await tool.execute({ delay_ms: 15000 }, {});
  assert.equal(result.ok, true);
  assert.match(result.text, /scheduled in 3s/);
  assert.doesNotMatch(result.text, /15s/);
});

test("dsh_restart without args schedules 3s", async () => {
  const mod = await import("../lib/index.js");
  const tools = [];
  const fakeCtx = {
    commands: { register() {} },
    tools: { register(t) { tools.push(t); } },
  };
  mod.apply(fakeCtx);
  const tool = tools.find((t) => t.name === "dsh_restart");
  const result = await tool.execute({}, {});
  assert.equal(result.ok, true);
  assert.match(result.text, /scheduled in 3s/);
});

test("package.json exports ./client with 0.4.1 and correct inject", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "0.4.1");
  assert.ok(pkg.exports["./client"]);
  assert.equal(pkg.exports["./client"].default, "./lib/client.js");
  assert.equal(pkg.exports["./client"].types, "./lib/types/client/index.d.ts");
  assert.deepEqual(pkg.dsh.client.inject, [
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-commands",
  ]);
});

test("client.js implements exact token matching and locale support", async () => {
  const clientSrc = await readFile(join(root, "lib/client.js"), "utf8");
  // Exact token parsing
  assert.match(clientSrc, /var tok = line\.split\(\/\\s\/\)\[0\];/);
  assert.match(clientSrc, /tok === "\/restart" \|\| tok === "\/dsh-restart"/);
  // Locale dictionary and usage
  assert.match(clientSrc, /var NS = "dsh-restart";/);
  assert.match(clientSrc, /Restart/);
  assert.match(clientSrc, /Smoothly restart/);
  assert.match(clientSrc, /Failed to schedule restart/);
  // Failure handling in execute
  assert.match(clientSrc, /commandUi\.noticeFor\(session\.sessionId, "error", t\("fail"\)\);/);
});

