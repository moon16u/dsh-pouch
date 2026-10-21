import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function fixture(t, script = 'echo "inert launcher failed" >&2\nexit 23\n') {
  const dir = mkdtempSync(join(tmpdir(), "_tmp_restart-failure-"));
  const home = join(dir, "home with spaces ' $HOME");
  const pkg = join(dir, "package");
  const env = { DSH_HOME: process.env.DSH_HOME, DSH_RESTART_DRY_RUN: process.env.DSH_RESTART_DRY_RUN, PATH: process.env.PATH };
  const disposers = [];
  t.after(() => {
    for (const dispose of disposers) dispose();
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    renameSync(dir, `${dir}.recovered`);
  });
  mkdirSync(join(pkg, "lib"), { recursive: true });
  mkdirSync(join(pkg, "scripts"));
  copyFileSync(join(root, "lib", "index.js"), join(pkg, "lib", "index.js"));
  writeFileSync(join(pkg, "package.json"), '{"type":"module"}');
  // This package copy can never reach the production restart worker.
  if (script !== null) writeFileSync(join(pkg, "scripts", "dsh-restart.sh"), script, { mode: 0o644 });
  symlinkSync(join(root, "node_modules"), join(pkg, "node_modules"), "dir");
  process.env.DSH_HOME = home;
  delete process.env.DSH_RESTART_DRY_RUN;
  const commands = [];
  const sections = [];
  let tool, route;
  const scope = {
    connection: { fetch: { register: (spec) => { route = spec; return () => {}; } } },
    systemPrompt: { section: (spec) => sections.push(spec) },
    effect: (fn) => { disposers.push(fn()); },
  };
  const { apply } = await import(pathToFileURL(join(pkg, "lib", "index.js")));
  apply({
    ...scope,
    commands: { register: (spec) => commands.push(spec) },
    tools: { register: (spec) => { tool = spec; } },
    inject: (_names, fn) => fn(scope),
  });
  const agent = { session: { id: "owning-session" } };
  const marker = join(home, "restart-failed.json");
  return { dir, home, pkg, commands, tool, route, sections, agent, marker };
}

async function waitForMarker(path) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("detached failure must produce a marker");
}

test("missing script returns a useful error through both commands and the tool", async (t) => {
  const f = await fixture(t, null);
  for (const command of f.commands) {
    const result = await command.handler({ agent: f.agent });
    assert.equal(result.kind, "error");
    assert.match(result.text, /ENOENT/);
    assert.match(result.text, /dsh-restart\.schedule\.log/);
  }
  const result = await f.tool.execute({}, { agent: f.agent });
  assert.equal(result.ok, false);
  assert.match(result.text, /ENOENT/);
  assert.equal(existsSync(join(f.home, "dsh-restart-helper.sh")), false);
});

test("unwritable helper destination is returned instead of thrown", async (t) => {
  const f = await fixture(t);
  writeFileSync(f.home, "not a directory");
  const result = await f.commands[0].handler({ agent: f.agent });
  assert.equal(result.kind, "error");
  assert.match(result.text, /EEXIST|ENOTDIR/);
});

test("missing launch dependencies fail before reporting scheduled success", async (t) => {
  const f = await fixture(t);
  const bin = join(f.dir, "missing-nohup");
  mkdirSync(bin);
  for (const name of ["setsid", "env", "sleep"]) symlinkSync(`/usr/bin/${name}`, join(bin, name));
  process.env.PATH = bin;
  const result = await f.tool.execute({}, { agent: f.agent });
  assert.equal(result.ok, false);
  assert.match(result.text, /Failed to schedule/);
  assert.match(result.text, /Missing restart dependency: nohup/);
});

test("background script error reaches the authenticated status route and prompt", async (t) => {
  const f = await fixture(t);
  const result = await f.commands[0].handler({ agent: f.agent });
  assert.equal(result.kind, "success");
  const duplicate = await f.tool.execute({}, { agent: f.agent });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.text, /already scheduled/);
  const failure = await waitForMarker(f.marker);
  assert.equal(failure.sessionId, "owning-session");
  assert.match(failure.reason, /code 23/);
  assert.match(failure.reason, /inert launcher failed/);
  assert.equal(failure.logPath, join(f.home, "dsh-restart.schedule.log"));
  assert.deepEqual(f.route.methods, ["GET"]);
  assert.equal(f.route.path, "/api/dsh-restart/status");
  assert.equal(f.route.requestBody, "buffered");
  const response = await f.route.fetch();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).failure, failure);
  assert.match(f.sections[0].text(), /inert launcher failed/);
  assert.match(f.sections[0].text(), /dsh-restart\.schedule\.log/);
});

test("helper never starting is reported too, including its stderr", async (t) => {
  const f = await fixture(t);
  const bin = join(f.dir, "bin");
  mkdirSync(bin);
  const nohup = join(bin, "nohup");
  writeFileSync(nohup, '#!/bin/bash\necho "nohup startup failure" >&2\nexit 44\n');
  chmodSync(nohup, 0o700);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  const result = await f.tool.execute({}, { agent: f.agent });
  assert.equal(result.ok, true);
  const failure = await waitForMarker(f.marker);
  assert.match(failure.reason, /deadline/);
  assert.match(failure.reason, /nohup startup failure/);
  assert.equal(failure.logPath, join(f.home, "dsh-restart-helper.log"));
});

test("a script lost after preflight reports bash's error to the originating chat", async (t) => {
  const f = await fixture(t);
  const result = await f.tool.execute({}, { agent: f.agent });
  assert.equal(result.ok, true);
  const script = join(f.pkg, "scripts", "dsh-restart.sh");
  renameSync(script, `${script}.unavailable`);
  const failure = await waitForMarker(f.marker);
  assert.match(failure.reason, /code 127/);
  assert.match(failure.reason, /No such file/);
  assert.equal(failure.sessionId, "owning-session");
});

test("a marker write failure still leaves the failure visible to GUI and model context", async (t) => {
  const f = await fixture(t);
  const logged = t.mock.method(console, "error", () => {});
  await f.commands[0].handler({ agent: f.agent });
  mkdirSync(f.marker);
  const deadline = Date.now() + 5000;
  let failure;
  while (Date.now() < deadline) {
    failure = (await (await f.route.fetch()).json()).failure;
    if (failure) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.match(failure?.reason ?? "", /code 23/);
  assert.match(f.sections[0].text(), /inert launcher failed/);
  assert.equal(logged.mock.callCount(), 1);
});

test("successful launcher produces no failure and releases the scheduling guard", async (t) => {
  const f = await fixture(t, "exit 0\n");
  const result = await f.commands[0].handler({ agent: f.agent });
  assert.equal(result.kind, "success");
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.match(readFileSync(join(f.home, "dsh-restart.schedule.status"), "utf8"), / 0\n$/);
  assert.equal((await (await f.route.fetch()).json()).failure, null);
  assert.equal(existsSync(f.marker), false);
  const script = join(f.pkg, "scripts", "dsh-restart.sh");
  renameSync(script, `${script}.unavailable`);
  const next = await f.tool.execute({}, { agent: f.agent });
  assert.match(next.text, /ENOENT/, "completed attempts must not leave the scheduling guard locked");
});

test("status excludes unrelated, malformed and stale failure markers", async (t) => {
  const f = await fixture(t);
  mkdirSync(f.home);
  for (const content of ['{', '{"reason":"worker failure"}']) {
    writeFileSync(f.marker, content);
    assert.equal((await (await f.route.fetch()).json()).failure, null);
  }
  writeFileSync(f.marker, '{"source":"schedule","attemptId":"stale"}');
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  utimesSync(f.marker, old, old);
  assert.equal((await (await f.route.fetch()).json()).failure, null);
});
