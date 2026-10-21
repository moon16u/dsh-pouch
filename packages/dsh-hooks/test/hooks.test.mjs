import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseConfig, matches, validateMatcher, discover, fingerprint, EVENTS } from "../lib/hooks/config.js";
import { HookStore } from "../lib/hooks/store.js";
import { HookEngine } from "../lib/hooks/engine.js";
import { parseOutput, runCommand, bounded } from "../lib/hooks/runner.js";
import { registerAdapters } from "../lib/hooks/adapters.js";
import { registerRoutes, API } from "../lib/hooks/routes.js";
import { Config } from "../lib/index.js";

const document = (hooks = [{ id: "test", type: "command", command: "printf hello" }], event = "SessionStart", matcher = "*") =>
  JSON.stringify({ version: 1, hooks: { [event]: [{ matcher, hooks }] } });
const definition = (overrides = {}, event = "SessionStart") => parseConfig(document([
  { id: "test", type: "command", command: "printf hello", ...overrides },
], event))[0];
function cleanup(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) cleanup(file);
    else fs.unlinkSync(file);
  }
  fs.rmdirSync(root);
}
function fixture(t, config = document(), execute) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "_tmp_dsh-hooks-test-")));
  const cwd = path.join(root, "workspace");
  const home = path.join(root, "home");
  fs.mkdirSync(cwd); fs.mkdirSync(home); fs.mkdirSync(path.join(cwd, ".git"));
  const settings = { commandHooksEnabled: true, commandHooks: config };
  const store = new HookStore(path.join(home, "state.json"));
  const calls = [];
  const engine = new HookEngine({ store, cwd, home, profile: "test", subprocess: {},
    getConfig: () => settings, logger: { warn() {} },
    execute: execute ?? (async (subprocess, entry, input) => {
      calls.push({ entry, input }); return { status: "completed", stdout: "context", exitCode: 0 };
    }) });
  const agent = { session: { header: { id: "session-1", cwd } }, options: { model: "offline" } };
  t.after(async () => { await engine.dispose(); cleanup(root); });
  return { root, cwd, home, settings, store, engine, agent, calls };
}
function trustAll(f) {
  for (const entry of f.engine.inspect(f.cwd).entries) f.engine.change("trust", f.cwd, entry.key, entry.hash);
}

test("native config defaults are bounded and command execution remains opt-in", () => {
  const entry = definition();
  assert.equal(entry.timeout, 30);
  assert.equal(entry.async, false);
  assert.equal(entry.maxOutputBytes, 65536);
  assert.equal(entry.onError, "continue");
  assert.equal(entry.shell, "auto");
  assert.equal(Config({}).commandHooksEnabled, true);
  assert.throws(() => parseConfig('{"hooks":{"PreCompact":[]}}'), /unsupported event/);
});
for (const [label, change] of [
  ["unknown event", { event: "PreCompact" }],
  ["MCP type", { type: "mcp_tool" }],
  ["Windows command", { commandWindows: "cmd.exe" }],
  ["unknown shell", { shell: "cmd" }],
  ["non-string shell", { shell: 123 }],
  ["empty command", { command: "" }],
  ["negative timeout", { timeout: -1 }],
  ["unbounded timeout", { timeout: 601 }],
  ["fraction timeout", { timeout: 0.5 }],
  ["unbounded output", { maxOutputBytes: 99999999 }],
  ["unlimited context", { contextBytes: 0 }],
  ["invalid env", { env: { BAD: 1 } }],
  ["array env", { env: [] }],
  ["NUL command", { command: "a\0b" }],
  ["bad watchFiles", { watchFiles: [""] }],
  ["bad enabled", { enabled: "yes" }],
  ["async failure block", { async: true, onError: "block" }],
]) {
  test(`config rejects ${label}`, () => {
    const { event = "SessionStart", ...rest } = change;
    assert.throws(() => definition(rest, event));
  });
}
test("duplicate ids, unsupported shapes and regex matchers are rejected", () => {
  assert.throws(() => parseConfig(document([{ id: "a", type: "command", command: ":" }, { id: "a", type: "command", command: ":" }])), /unique/);
  assert.throws(() => parseConfig('{"version":2,"hooks":{}}'), /version/);
  assert.throws(() => parseConfig('{"hooks":{},"trust":true}'), /unsupported/);
  for (const pattern of ["(a+)+$", "^Bash$", "["]) assert.throws(() => validateMatcher(pattern));
  assert.equal(matches("Bash|mcp__*", "mcp__files__read"), true);
  assert.equal(matches("tool-?", "tool-a"), true);
  assert.equal(matches("tool-?", "tool-ab"), false);
  assert.equal(matches("*", ""), true);
});
test("three configuration sources accumulate with distinct identities; no implicit Codex import", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.cwd, ".dsh"));
  fs.mkdirSync(path.join(f.cwd, ".codex"));
  fs.writeFileSync(path.join(f.home, "hooks.json"), document());
  fs.writeFileSync(path.join(f.cwd, ".dsh/hooks.json"), document());
  fs.writeFileSync(path.join(f.cwd, ".codex/hooks.json"), document());
  const view = f.engine.inspect(f.cwd);
  assert.equal(view.entries.length, 3);
  assert.equal(new Set(view.entries.map((entry) => entry.key)).size, 3);
  assert.ok(view.entries.every((entry) => !entry.trusted));
});
test("invalid source is reported, never silently partially loaded", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.home, "hooks.json"), '{"hooks":{"PreCompact":[]}}');
  const view = discover({ cwd: f.cwd, home: f.home, profileConfig: document() });
  assert.match(view.sources[1].error, /PreCompact/);
  assert.equal(view.entries.length, 1);
});
test("project discovery is bounded by Git root; symlink sources are rejected", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.cwd, ".dsh"));
  fs.writeFileSync(path.join(f.cwd, ".dsh/hooks.json"), document());
  const nested = path.join(f.cwd, "nested");
  fs.mkdirSync(nested);
  assert.equal(discover({ cwd: nested, home: f.home }).entries.length, 1);
  fs.mkdirSync(path.join(nested, ".git"));
  assert.equal(discover({ cwd: nested, home: f.home }).entries.length, 0);
  fs.symlinkSync(path.join(f.cwd, ".dsh/hooks.json"), path.join(f.home, "hooks.json"));
  assert.match(discover({ cwd: f.cwd, home: f.home }).sources[1].error, /regular file/);
});
test("fingerprints bind script bytes and canonical execution directory", (t) => {
  const f = fixture(t, document([{ id: "pin", type: "command", command: "bash script.sh", watchFiles: ["script.sh"] }]));
  fs.writeFileSync(path.join(f.cwd, "script.sh"), "printf first");
  const entry = f.engine.inspect(f.cwd).entries[0];
  trustAll(f);
  fs.writeFileSync(path.join(f.cwd, "script.sh"), "printf changed");
  assert.notEqual(f.engine.inspect(f.cwd).entries[0].hash, entry.hash);
  assert.equal(f.engine.inspect(f.cwd).entries[0].trusted, false);
  assert.throws(() => f.engine.current(f.cwd, entry.key, entry.hash), /changed/);
  const other = path.join(f.root, "other"); fs.mkdirSync(other);
  assert.throws(() => fingerprint({ ...entry, cwd: other }), /ENOENT/);
});
test("trust rollback on persistence failure, bounded history and crash status", (t) => {
  const f = fixture(t);
  const flush = f.store.flush;
  f.store.flush = () => { throw new Error("read only"); };
  assert.throws(() => f.store.change("trust", "key", "digest"), /read only/);
  assert.equal(f.store.trusted("key", "digest"), false);
  f.store.flush = flush;
  for (let i = 0; i < 205; i++) f.store.record({ id: String(i), cwd: f.cwd, status: "running" });
  const loaded = new HookStore(f.store.path);
  assert.equal(loaded.data.runs.length, 200);
  assert.ok(loaded.data.runs.every((run) => run.status === "interrupted"));
  if (process.platform !== "win32") assert.equal(fs.statSync(f.store.path).mode & 0o777, 0o600);
  else assert.ok(fs.statSync(f.store.path).isFile());
});
test("untrusted hooks never launch; trust, revoke, disable and definition changes are enforced", async (t) => {
  const f = fixture(t);
  await f.engine.dispatch("SessionStart", f.agent, { source: "startup" }, "a");
  assert.equal(f.calls.length, 0);
  trustAll(f);
  await f.engine.dispatch("SessionStart", f.agent, { source: "startup" }, "b");
  assert.equal(f.calls.length, 1);
  const entry = f.engine.inspect(f.cwd).entries[0];
  f.engine.change("disable", f.cwd, entry.key, entry.hash);
  await f.engine.dispatch("SessionStart", f.agent, {}, "c");
  assert.equal(f.calls.length, 1);
  f.engine.change("enable", f.cwd, entry.key, entry.hash);
  f.engine.change("revoke", f.cwd, entry.key, entry.hash);
  await f.engine.dispatch("SessionStart", f.agent, {}, "d");
  assert.equal(f.calls.length, 1);
  trustAll(f);
  f.settings.commandHooks = document([{ id: "test", type: "command", command: "printf changed" }]);
  await f.engine.dispatch("SessionStart", f.agent, {}, "e");
  assert.equal(f.calls.length, 1);
});
test("same event identity executes once, but new event identities execute again", async (t) => {
  const f = fixture(t); trustAll(f);
  const [one, two] = await Promise.all([
    f.engine.dispatch("SessionStart", f.agent, {}, "same"),
    f.engine.dispatch("SessionStart", f.agent, {}, "same"),
  ]);
  assert.deepEqual(one, two); assert.equal(f.calls.length, 1);
  await f.engine.dispatch("SessionStart", f.agent, {}, "different");
  assert.equal(f.calls.length, 2);
});
test("master switch, matcher and subagent policy gate dispatch", async (t) => {
  const f = fixture(t, document(undefined, "SessionStart", "resume")); trustAll(f);
  await f.engine.dispatch("SessionStart", f.agent, { source: "startup" }, 1);
  f.agent.session.header.parentSession = "parent";
  await f.engine.dispatch("SessionStart", f.agent, { source: "resume" }, 2);
  delete f.agent.session.header.parentSession;
  f.settings.commandHooksEnabled = false;
  await f.engine.dispatch("SessionStart", f.agent, { source: "resume" }, 3);
  assert.equal(f.calls.length, 0);
});
test("bounded parallel scheduling rechecks revocations of queued hooks", async (t) => {
  let active = 0; let maximum = 0;
  const finish = [];
  const f = fixture(t, document(Array.from({ length: 6 }, (_, i) => ({
    id: `h${i}`, type: "command", command: ":",
  }))), async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => finish.push(resolve));
    active--;
    return { status: "completed", stdout: "", exitCode: 0 };
  });
  trustAll(f);
  const job = f.engine.dispatch("SessionStart", f.agent, {}, "one");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.engine.active, 4);
  for (const entry of f.engine.inspect(f.cwd).entries.slice(4)) f.engine.change("revoke", f.cwd, entry.key, entry.hash);
  for (const done of finish) done();
  await job;
  assert.equal(maximum, 4);
  assert.equal(f.store.history(f.cwd).filter((run) => run.status === "skipped").length, 2);
});
test("async commands cannot hold admission; disposal aborts and joins them", async (t) => {
  let aborted = false;
  const f = fixture(t, document([{ id: "async", type: "command", command: ":", async: true }]), async (subprocess, entry, input, signal) => {
    await new Promise((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    return { status: "cancelled" };
  });
  trustAll(f);
  assert.deepEqual(await f.engine.dispatch("SessionStart", f.agent, {}, "one"), { block: false, ask: false, reason: "", contexts: [] });
  await f.engine.dispose();
  assert.equal(aborted, true);
});
test("invalid configuration fails closed on gating events and remains visible in UI", async (t) => {
  const f = fixture(t, '{"hooks":{"PreCompact":[]}}');
  const result = await f.engine.dispatch("PreToolUse", f.agent, { tool_name: "Bash" }, "tool1");
  assert.equal(result.block, true);
  assert.match(result.reason, /unsupported event/);
  assert.equal(f.calls.length, 0);
});
test("broken pinned file remains revocable and disableable", (t) => {
  const f = fixture(t, document([{ id: "test", type: "command", command: ":", watchFiles: ["gone.sh"] }]));
  const entry = f.engine.inspect(f.cwd).entries[0];
  assert.ok(entry.error);
  f.engine.change("disable", f.cwd, entry.key, entry.hash);
  f.engine.change("revoke", f.cwd, entry.key, entry.hash);
  assert.equal(f.store.disabled(entry.key), true);
});

test("output protocol maps context, decisions and exit 2 without accepting unsupported fields", () => {
  const entry = definition();
  const result = (stdout, exitCode = 0) => ({ status: "completed", stdout, stderr: "stop", exitCode });
  assert.deepEqual(parseOutput(entry, result("hello")).contexts, ["hello"]);
  assert.equal(parseOutput(entry, result("", 2)).block, true);
  assert.equal(parseOutput(entry, result('{"continue":false,"stopReason":"no"}')).reason, "no");
  assert.throws(() => parseOutput(entry, result('{"hookSpecificOutput":{"updatedInput":{}}}')), /input rewriting/);
  assert.throws(() => parseOutput(entry, result('{"hookSpecificOutput":{"hookEventName":"Stop"}}')), /mismatch/);
  assert.throws(() => parseOutput(entry, result("{bad")), /Malformed/);
  assert.throws(() => parseOutput(entry, result('{"continue":"false"}')), /boolean/);
  assert.throws(() => parseOutput(entry, result('{"systemMessage":"ignored"}')), /Unsupported/);
});
test("observation-only output cannot block or inject; cancelled hooks never deny", () => {
  for (const entry of [definition({ async: true }), definition({}, "SessionEnd"), definition({}, "SubagentStop")]) {
    assert.throws(() => parseOutput(entry, { status: "completed", stdout: "context", exitCode: 0 }));
    assert.throws(() => parseOutput(entry, { status: "completed", stdout: "", exitCode: 2 }));
  }
  assert.equal(parseOutput(definition({ onError: "block" }), { status: "cancelled" }).block, false);
  assert.equal(parseOutput(definition({ onError: "block" }), { status: "timeout", error: "timeout" }).block, true);
  assert.equal(parseOutput(definition(), { status: "error", error: "error" }).block, false);
  assert.ok(Buffer.byteLength(bounded("\u6708".repeat(100), 11)) <= 11);
});
test("native subprocess contract uses JSON stdin, no ambient startup injection, bounded output and cleanup", async () => {
  let spec; let terminated = false; let waited = false;
  const subprocess = {
    terminalEnvironment: async () => ({ platform: "posix" }),
    resolveExecutable: async () => "/bin/bash",
    spawn: (value) => {
      spec = value;
      return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: {
        stdout: { readFrom: () => ({ text: "hello", lossy: false }) },
        stderr: { readFrom: () => ({ text: "", lossy: false }) },
      }, terminate: () => { terminated = true; }, waitForExit: async () => { waited = true; return true; } };
    },
  };
  const entry = { ...definition(), cwd: "/fixture" };
  assert.equal((await runCommand(subprocess, entry, { prompt: "'; touch /nope; '" })).stdout, "hello");
  assert.deepEqual(spec.argv, ["/bin/bash", "--noprofile", "--norc", "-c", entry.command]);
  assert.equal(JSON.parse(spec.stdio.stdin.data).prompt, "'; touch /nope; '");
  assert.equal(spec.env.BASH_ENV, undefined);
  assert.equal(spec.env.DSH_HOOK_ACTIVE, "1");
  assert.equal(terminated && waited, true);
});
test("cancelled native launch does not spawn, truncated stdout is not parsed", async () => {
  const abort = new AbortController(); abort.abort();
  const entry = { ...definition(), cwd: "/tmp" };
  assert.equal((await runCommand({ spawn: () => assert.fail() }, entry, {}, abort.signal)).status, "cancelled");
  const result = await runCommand({
    terminalEnvironment: async () => ({ platform: "posix" }),
    resolveExecutable: async () => "/bin/bash",
    spawn: () => ({ done: Promise.resolve({ exitCode: 0 }), terminate() {}, waitForExit: async () => true,
      collected: { stdout: { readFrom: () => ({ text: "tail", lossy: true }) }, stderr: { readFrom: () => ({ text: "" }) } } }),
  }, entry, {});
  assert.equal(result.status, "error");
  assert.match(result.error, /truncated/);
});

function adapters(dispatch) {
  const handlers = {};
  registerAdapters({ on: (name, handler) => { handlers[name] = handler; } }, { register() {}, dispatch });
  return handlers;
}
test("tool hook allow never overrides native denial; ask delegates; post-hook preserves downstream block", async () => {
  let result = { block: false, ask: false, contexts: [] };
  const h = adapters(async () => result);
  const exec = { agent: {}, name: "Bash", callId: "1", arguments: {}, signal: new AbortController().signal };
  assert.deepEqual(await h["tools/pre-execute"](exec, async () => ({ kind: "deny", reason: "native" })), { kind: "deny", reason: "native" });
  result = { block: false, ask: true, reason: "ask", contexts: [] };
  assert.equal((await h["tools/pre-execute"](exec, async () => ({ kind: "allow" }))).kind, "ask");
  const native = { kind: "block", feedback: [{ type: "text", text: "native" }] };
  result = { block: true, reason: "hook", contexts: ["context"] };
  const post = await h["tools/post-execute"](exec, {}, async () => native);
  assert.equal(post.feedback, native.feedback);
  assert.equal(post.additionalContexts.length, 1);
});
test("permission hooks never grant authority over native answerer", async () => {
  const h = adapters(async () => ({ block: false, contexts: [] }));
  assert.equal(await h["approval/request"]({ agent: {}, toolName: "Bash" }, async () => "rejected"), "rejected");
  const deny = adapters(async () => ({ block: true, contexts: [] }));
  assert.equal(await deny["approval/request"]({ agent: {}, toolName: "Bash" }, () => assert.fail()), "rejected");
});
test("startup and real user prompts inject at admission, not tool or hook messages", async () => {
  const seen = [];
  const h = adapters(async (event) => { seen.push(event); return { block: false, contexts: [event] }; });
  const agent = { session: {} };
  await h["agent/created"]({ agent, source: "startup" });
  const human = { id: "p1", source: { kind: "user" }, content: [{ type: "text", text: "hello" }] };
  const own = { id: "p2", source: { kind: "dsh-command-hooks" }, content: [] };
  const decision = await h["agent/pre-step"]({ agent, messages: [human, own], turn: 1 },
    async () => ({ kind: "enter", messages: [human] }));
  assert.deepEqual(seen, ["SessionStart", "UserPromptSubmit"]);
  assert.equal(decision.messages.length, 3);
  assert.equal(decision.messages[1].source.kind, "dsh-command-hooks");
});
test("a rejected prompt retains startup context for the next admitted prompt", async () => {
  let reject = true;
  const h = adapters(async (event) => event === "SessionStart"
    ? { block: false, contexts: ["startup context"] }
    : { block: reject, contexts: [] });
  const agent = { session: {} };
  await h["agent/created"]({ agent, source: "startup" });
  const human = { id: "first", source: { kind: "user" }, content: [] };
  const admit = async () => ({ kind: "enter", messages: [human] });
  assert.equal((await h["agent/pre-step"]({ agent, messages: [human], turn: 1 }, admit)).kind, "reject");
  reject = false;
  const result = await h["agent/pre-step"]({ agent, messages: [{ ...human, id: "second" }], turn: 2 }, admit);
  assert.equal(result.messages[1].content[0].text, "startup context");
  const next = await h["agent/pre-step"]({ agent, messages: [], turn: 2 }, admit);
  assert.equal(next.messages.length, 1);
});
test("cancellation after prompt hooks retains startup context without rerunning it", async () => {
  const abort = new AbortController();
  let starts = 0;
  let cancel = true;
  const h = adapters(async (event) => {
    if (event === "SessionStart") { starts++; return { block: false, contexts: ["startup"] }; }
    if (cancel) abort.abort();
    return { block: false, contexts: [] };
  });
  const agent = { session: {} };
  const human = { id: "p1", source: { kind: "user" }, content: [] };
  await h["agent/created"]({ agent, source: "startup" });
  await h["agent/pre-step"]({ agent, messages: [human], signal: abort.signal }, async () => ({ kind: "enter", messages: [human] }));
  cancel = false;
  const result = await h["agent/pre-step"]({ agent, messages: [{ ...human, id: "p2" }] }, async () => ({ kind: "enter", messages: [human] }));
  assert.equal(result.messages[1].content[0].text, "startup");
  assert.equal(starts, 1);
});
test("PostCompact work is awaited at the immediate request retry; failed compaction does nothing", async () => {
  const seen = [];
  const h = adapters(async (event) => { seen.push(event); return { block: false, contexts: event === "PostCompact" ? ["restored"] : [] }; });
  const appended = [];
  const agent = { session: { append: (...args) => appended.push(args) } };
  await h["agent/created"]({ agent, source: "startup" });
  h["session/event"](agent.session, { type: "compaction/end", data: { compactionId: "1", turn: 1 } });
  const config = {};
  assert.equal(await h["agent/request"]({ agent }, async () => config), config);
  assert.equal(appended.length, 1);
  h["session/event"](agent.session, { type: "compaction/end", data: { error: "no" } });
  await h["agent/request"]({ agent }, async () => config);
  assert.equal(appended.length, 1);
});
test("Stop continuation is capped to three and never wakes on observation-only context", async () => {
  const h = adapters(async () => ({ block: true, reason: "continue", contexts: [] }));
  let steered = 0;
  const agent = { steer: () => steered++ };
  for (let i = 0; i < 7; i++) await h["agent/turn-stopping"]({ agent, turn: 1 });
  assert.equal(steered, 3);
});

function apiFixture(f) {
  const routes = new Map();
  registerRoutes({ connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {}; } } },
    effect: (setup) => setup() }, f.engine);
  return async (endpoint, body, headers = {}) => {
    assert.equal(routes.get(API + endpoint.split("?")[0]).requestBody, body === undefined ? "buffered" : "streaming");
    const req = new Request(`http://localhost:3080${API}${endpoint}`, body === undefined ? {} : {
      method: "POST", headers: { origin: "http://localhost:3080", "content-type": "application/json", "x-dsh-hook-ui": "1", ...headers },
      body: JSON.stringify(body),
    });
    const response = await routes.get(API + endpoint.split("?")[0]).fetch(req);
    return { status: response.status, data: await response.json() };
  };
}
test("owner API adds same-origin fencing, one-use review and exact-hash trust", async (t) => {
  const f = fixture(t); const api = apiFixture(f);
  const entry = f.engine.inspect(f.cwd).entries[0];
  const body = { cwd: f.cwd, key: entry.key, hash: entry.hash };
  assert.equal((await api("/review", body, { origin: "https://evil.example" })).status, 400);
  assert.equal((await api("/review", body, { "x-dsh-hook-ui": "" })).status, 400);
  assert.equal((await api("/action", { ...body, action: "trust" })).status, 400);
  const review = await api("/review", body);
  const grant = { ...body, action: "trust", nonce: review.data.nonce, confirmation: "RUN AS DSH USER" };
  assert.equal((await api("/action", grant)).status, 200);
  assert.equal((await api("/action", grant)).status, 400);
  assert.equal(f.engine.inspect(f.cwd).entries[0].trusted, true);
});

test("approval binds canonical cwd while accepting a native directory alias", async (t) => {
  const f = fixture(t); const api = apiFixture(f);
  const alias = path.join(f.root, "workspace-alias");
  fs.symlinkSync(f.cwd, alias, process.platform === "win32" ? "junction" : "dir");
  const entry = f.engine.inspect(alias).entries[0];
  const body = { cwd: alias, key: entry.key, hash: entry.hash };
  const review = await api("/review", body);
  assert.equal(review.status, 200);
  const result = await api("/action", { ...body, action: "trust", nonce: review.data.nonce, confirmation: "RUN AS DSH USER" });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(f.engine.inspect(f.cwd).entries[0].trusted, true);
});

test("DSH bridge internal URL uses authenticated Host for origin checking", async (t) => {
  const f = fixture(t);
  const routes = new Map();
  registerRoutes({ connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {}; } } },
    effect: (setup) => setup() }, f.engine);
  assert.deepEqual([...routes.keys()].sort(), ["/action", "/review", "/status"].map((suffix) => API + suffix).sort());
  const entry = f.engine.inspect(f.cwd).entries[0];
  const route = routes.get(API + "/review");
  const request = new Request("http://dsh.internal" + API + "/review", {
    method: "POST", headers: { host: "127.0.0.1:3086", origin: "http://127.0.0.1:3086",
      "content-type": "application/json", "x-dsh-hook-ui": "1" }, body: JSON.stringify({ cwd: f.cwd, key: entry.key, hash: entry.hash }),
  });
  assert.equal((await route.fetch(request)).status, 200);
});
test("per-event combined context is bounded even when many handlers return large context", async (t) => {
  const f = fixture(t, document(Array.from({ length: 4 }, (_, i) => ({
    id: `large-${i}`, type: "command", command: ":", contextBytes: 262144,
  }))), async () => ({ status: "completed", stdout: "a".repeat(262144), exitCode: 0 }));
  trustAll(f);
  const result = await f.engine.dispatch("SessionStart", f.agent, {}, "bounded");
  assert.equal(result.contexts.reduce((size, text) => size + Buffer.byteLength(text), 0), 262144);
});
test("concurrent handler results retain declaration order and denial dominates allow", async (t) => {
  const f = fixture(t, document([
    { id: "first", type: "command", command: ":" },
    { id: "second", type: "command", command: ":" },
  ]), async (subprocess, entry) => {
    if (entry.id === "first") await new Promise((r) => setTimeout(r, 10));
    return { status: "completed", exitCode: 0, stdout: JSON.stringify({
      continue: entry.id !== "first", hookSpecificOutput: { additionalContext: entry.id },
    }) };
  });
  trustAll(f);
  const result = await f.engine.dispatch("SessionStart", f.agent, {}, "order");
  assert.equal(result.block, true);
  assert.deepEqual(result.contexts, ["first", "second"]);
});
test("execution output diagnostics redact explicit environment values", async (t) => {
  const f = fixture(t, document([{ id: "redact", type: "command", command: ":", env: { SECRET: "test-secret-value" } }]),
    async () => ({ status: "error", error: "failure", stderr: "test-secret-value Bearer abcDEF123", exitCode: 1 }));
  trustAll(f);
  await f.engine.dispatch("SessionStart", f.agent, {}, "redact");
  assert.equal(f.store.history(f.cwd)[0].stderr, "[redacted] Bearer [redacted]");
});
test("stale review cannot authorize edited commands, review never launches", async (t) => {
  const f = fixture(t); const api = apiFixture(f);
  const entry = f.engine.inspect(f.cwd).entries[0];
  const body = { cwd: f.cwd, key: entry.key, hash: entry.hash };
  const review = await api("/review", body);
  f.settings.commandHooks = document([{ id: "test", type: "command", command: "changed" }]);
  assert.equal((await api("/action", { ...body, action: "trust", nonce: review.data.nonce, confirmation: "RUN AS DSH USER" })).status, 400);
  assert.equal(f.calls.length, 0);
});
test("status masks explicit environment values and rejects arbitrary filesystem workspaces", async (t) => {
  const f = fixture(t, document([{ id: "test", type: "command", command: ":", env: { SECRET: "hidden" } }]));
  const api = apiFixture(f);
  const response = await api("/status");
  assert.deepEqual(response.data.entries[0].env, ["SECRET"]);
  assert.ok(!JSON.stringify(response.data).includes("hidden"));
  assert.equal((await api("/status?cwd=/")).status, 400);
});
