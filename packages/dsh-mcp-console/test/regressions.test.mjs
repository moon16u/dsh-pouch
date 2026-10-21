import { tempDir, recoverTempDir } from "./helpers/temp.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { parseDocument } from "yaml";
import { ingestProfileMcpEntries, exportStoreToProfileYaml } from "../lib/yamlMigrator.js";
import { Store } from "../lib/store.js";
import { Orchestrator, mergeMasked } from "../lib/orchestrator.js";
import { ConsoleAggregate } from "../lib/aggregate.js";
import { registerRoutes } from "../lib/routes.js";
import { Context } from "@deepseek-ai/cordis";

const recover = recoverTempDir;
function fixture(yaml = "") {
  const root = tempDir("_tmp_mcp_regression");
  const yamlPath = join(root, "cordis.patch.yml");
  if (yaml !== null) writeFileSync(yamlPath, yaml);
  return { root, yamlPath, store: new Store(join(root, "store.json")), cleanup: () => recover(root) };
}
const insert = (body) => ["- insert:", "    - id: mcp-demo", "      name: '@deepseek-ai/dsh-mcp-client'", "      config:", ...body.map(line => `        ${line}`), ""].join("\n");

test("invalid, commented, flow and reconnect entries stay lossless", async () => {
  const flow = insert(["serverName: demo", "transport: stdio", "command: node", 'args: ["--flag", "server.js"]', "env: {API_KEY: abc}", "reconnect:", "  enabled: false", "  maxAttempts: 2"]);
  let f = fixture(flow);
  let result = await ingestProfileMcpEntries(f);
  assert.deepEqual(result.ingested, ["demo"]);
  assert.deepEqual(f.store.read().servers.demo.args, ["--flag", "server.js"]);
  assert.deepEqual(f.store.read().servers.demo.env, { API_KEY: "abc" });
  assert.deepEqual(f.store.read().servers.demo.reconnect, { enabled: false, maxAttempts: 2 });
  assert.doesNotThrow(() => parseDocument(readFileSync(f.yamlPath, "utf8")));

  const commented = insert(["serverName: demo", "transport: stdio", "command: node", "# inside block", "args:", "  - server.js"]);
  f = fixture(commented);
  result = await ingestProfileMcpEntries(f);
  assert.deepEqual(result.ingested, ["demo"]);
  const parsed = parseDocument(readFileSync(f.yamlPath, "utf8"));
  assert.equal(parsed.errors.length, 0);

  f = fixture(insert(["serverName: demo", "transport: stdio", "command: ''"]));
  result = await ingestProfileMcpEntries(f);
  assert.deepEqual(result.ingested, []);
  assert.match(readFileSync(f.yamlPath, "utf8"), /serverName: demo/);
});

test("a !!js profile expression does not block migration", async () => {
  // DSH evaluates `!!js` at load time; the parser must accept the tag instead
  // of treating its unresolved-tag warning as "do not touch this file".
  const f = fixture(insert([
    "serverName: demo",
    "transport: stdio",
    "command: node",
    "env:",
    "  TOKEN: !!js process.env.TOKEN",
  ]).replace("        env:\n        TOKEN", "        env:\n          TOKEN"));
  const before = readFileSync(f.yamlPath, "utf8");
  const result = await ingestProfileMcpEntries(f);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.ingested, ["demo"]);
  assert.notEqual(readFileSync(f.yamlPath, "utf8"), before);
});

test("removing the first item does not leave a leading blank line", async () => {
  const text = [
    "- insert:",
    "    - id: mcp-first",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: first",
    "        transport: stdio",
    "        command: node",
    "",
    "- insert:",
    "    - id: kept",
    "      name: other-plugin",
    "",
  ].join("\n");
  const f = fixture(text);
  const result = await ingestProfileMcpEntries(f);
  assert.deepEqual(result.ingested, ["first"]);
  const after = readFileSync(f.yamlPath, "utf8");
  assert.equal(after.startsWith("- insert:"), true, `unexpected prefix: ${JSON.stringify(after.slice(0, 20))}`);
  assert.match(after, /other-plugin/);
});

test("export after full ingest, then re-export preserves later plugin", async () => {
  const f = fixture(insert(["serverName: demo", "transport: stdio", "command: node"]));
  await ingestProfileMcpEntries(f);
  assert.deepEqual(parseDocument(readFileSync(f.yamlPath, "utf8")).toJSON(), []);
  f.store.mutate(servers => {
    servers.demo = { enabled: true, transport: "stdio", command: "node", args: [], env: {}, cwd: "", toolCallTimeoutMs: 60000, failOnStartupError: false, disabledTools: [] };
  });
  await exportStoreToProfileYaml(f);
  assert.equal(parseDocument(readFileSync(f.yamlPath, "utf8")).errors.length, 0);
  writeFileSync(f.yamlPath, readFileSync(f.yamlPath, "utf8") + "\n- insert:\n    - id: unrelated\n      name: unrelated-plugin\n");
  await exportStoreToProfileYaml(f);
  assert.match(readFileSync(f.yamlPath, "utf8"), /unrelated-plugin/);
  assert.equal(readFileSync(f.yamlPath, "utf8").match(/serverName: demo/g).length, 1);
});

test("secret map replacement validates masks and supports no-change patches", () => {
  assert.deepEqual(mergeMasked({ A: "old" }, { A: "••••", B: "new" }), { A: "old", B: "new" });
  assert.throws(() => mergeMasked({}, { A: "••••" }), /no stored secret/);
  assert.deepEqual(mergeMasked({ A: "old" }, {}), {});
});

function fakeContext() {
  return {
    registry: { entries: () => [[undefined, { name: "mcp-client", fibers: [] }]][Symbol.iterator]() },
    tools: { schemas: () => [] },
    plugin: () => { throw new Error("unexpected plugin"); },
    logger: { warn() {}, error() {} },
  };
}
function orchestrator(scopeKey, names = []) {
  const root = tempDir("_tmp_mcp_regression-orch");
  const store = new Store(join(root, "store.json"));
  const created = new Orchestrator(fakeContext(), {
    globalStore: store,
    scopeKey,
    ingestProfile: false,
    reservedNames: () => names,
  });
  created.__root = root;
  return created;
}
test("overlapping namespaces are rejected and never attributed", () => {
  const one = orchestrator("one", ["foo__bar"]);
  assert.match(one.namespaceConflict("foo"), /ambiguous/);
  assert.deepEqual(one.attributeTools("foo", ["mcp__foo__a", "mcp__foo__bar__b"]), []);
  recover(one.__root);
});

test("a failed null fiber recovers through reconcile", async () => {
  const one = orchestrator("one");
  one.ledger.set("broken", { fiber: null, config: { name: "broken" }, error: "boom", pending: false, loadedAt: 0 });
  one.storedServers = () => new Map([["broken", { name: "broken", enabled: true, transport: "stdio", command: "node" }]]);
  let loaded = 0;
  one.loadOne = async () => { loaded++; };
  await one.reconcileNow(true);
  assert.equal(loaded, 1);
  recover(one.__root);
});

test("SSE close ends responses and no-op route after dispose", async () => {
  let handler;
  let ended = 0;
  const routes = registerRoutes({ webServer: { register({ handler: h }) { handler = h; return () => {}; } } }, {
    orchestrator: orchestrator("sse"),
  });
  const req = new EventEmitter();
  Object.assign(req, { url: "/api/dsh-mcp-console/events?sessionId=x", method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:3080" } });
  handler(req, { writeHead() {}, write() {}, end() { ended++; } });
  routes.dispose();
  assert.equal(ended, 1);
});

test("project requests route by an explicit session callback", async () => {
  let handler;
  const global = orchestrator("global");
  const project = orchestrator("project");
  const routes = registerRoutes({
    webServer: { register({ handler: h }) { handler = h; return () => {}; } },
    orchestratorForSession: id => id === "p" ? project : global,
  }, { orchestrator: global });
  const req = new EventEmitter();
  Object.assign(req, { url: "/api/dsh-mcp-console/health?sessionId=p", method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:3080" } });
  let body;
  handler(req, { writeHead() {}, end(value) { body = JSON.parse(value); } });
  assert.match(body.globalStore, /store\.json/);
  routes.dispose();
});

test("real Cordis reload waits for startup settlement", async () => {
  const root = tempDir("_tmp_mcp_regression-reload");
  const store = new Store(join(root, "store.json"));
  const real = new Context();
  let attempts = 0;
  const loaded = [];
  const mcp = {
    name: "regression-mcp",
    async apply(ctx) {
      const attempt = ++attempts;
      await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 0 : 40));
      if (attempt === 2) throw new Error("second startup failed");
      ctx.effect(() => () => loaded.push(attempt));
    },
  };
  const one = new Orchestrator({
    plugin: real.plugin.bind(real),
    registry: real.registry,
    tools: real.tools ?? { schemas: () => [] },
    logger: real.logger,
  }, { globalStore: store, ingestProfile: false, scopeKey: "reload" });
  one.mcpClient = mcp;
  store.mutate(servers => {
    servers.demo = { enabled: true, transport: "stdio", command: "node" };
  });
  await one.bootstrap();
  assert.equal(one.ledger.get("demo").fiber.state, 2);
  await assert.rejects(() => one.reconnect("demo"), /second startup failed/);
  assert.equal(attempts, 2);
  assert.match(one.ledger.get("demo").error, /second startup failed/);
  assert.equal(one.ledger.get("demo").pending, false);
  await one.close();
  await real.fiber.dispose();
  recover(root);
});

test("real Cordis refresh recreates a disposed fiber", async () => {
  const root = tempDir("_tmp_mcp_regression-recover");
  const store = new Store(join(root, "store.json"));
  const real = new Context();
  let starts = 0;
  const one = new Orchestrator({
    plugin: real.plugin.bind(real),
    registry: real.registry,
    tools: real.tools ?? { schemas: () => [] },
    logger: real.logger,
  }, { globalStore: store, ingestProfile: false, scopeKey: "recover" });
  one.mcpClient = {
    name: "regression-recover",
    async apply(ctx) {
      starts++;
      if (starts === 1) throw new Error("first startup failed");
      ctx.effect(() => () => {});
    },
  };
  store.mutate(servers => {
    servers.demo = { enabled: true, transport: "stdio", command: "node", failOnStartupError: true };
  });
  await one.bootstrap();
  assert.equal(one.ledger.get("demo").fiber, null);
  await one.refresh();
  assert.equal(starts, 2);
  assert.equal(one.ledger.get("demo").fiber.state, 2);
  await one.close();
  await real.fiber.dispose();
  recover(root);
});

test("refresh reports what it restarted, not every healthy server", async () => {
  const one = orchestrator("refresh-semantics");
  // one healthy server and one that needs a reload
  one.storedServers = () => new Map([
    ["healthy-a", { name: "healthy-a", enabled: true, transport: "stdio", command: "node" }],
    ["broken", { name: "broken", enabled: true, transport: "stdio", command: "node" }],
  ]);
  one.ledger.set("healthy-a", { fiber: { state: 2 }, config: {}, error: null, pending: false, loadedAt: Date.now() });
  one.ledger.set("broken", { fiber: null, config: {}, error: "boom", pending: false, loadedAt: 0 });
  one.loadOne = async (name, config) => {
    const entry = { fiber: { state: 2 }, config, error: null, pending: false, loadedAt: Date.now() };
    one.ledger.set(name, entry);
    return entry;
  };
  const result = await one.refresh();
  assert.deepEqual(result.restarted, ["broken"], "only the reloaded server is reported");
  recover(one.__root);
});

test("a failed swap leaves the error on the live ledger entry", async () => {
  const one = orchestrator("swap-failure");
  one.mcpClient = { name: "swap-probe" };
  one.storedServers = () => new Map([
    ["demo", { name: "demo", enabled: true, transport: "stdio", command: "node" }],
  ]);
  const stale = { fiber: { state: 2, dispose: async () => {} }, config: {}, error: null, pending: false, loadedAt: Date.now() };
  one.ledger.set("demo", stale);
  // loadOne replaces the map entry and reports the failure there
  one.loadOne = async (name, config) => {
    const fresh = { fiber: null, config, error: "startup exploded", pending: false, loadedAt: 0 };
    one.ledger.set(name, fresh);
    return fresh;
  };
  await assert.rejects(() => one.reconnect("demo"), /startup exploded/);
  const live = one.ledger.get("demo");
  assert.equal(live.error, "startup exploded");
  assert.equal(live.pending, false, "the live entry must not stay stuck pending");
  assert.equal(stale.pending, true, "the replaced object is the stale one");
  recover(one.__root);
});

test("PUT /config is refused and persists nothing", async () => {
  let handler;
  const routes = registerRoutes({ webServer: { register({ handler: h }) { handler = h; return () => {}; } } }, {
    orchestrator: orchestrator("cfg"),
  });
  const body = JSON.stringify({ ui: { position: "bottom-right" }, config: { enabled: false } });
  const req = new EventEmitter();
  Object.assign(req, {
    url: "/api/dsh-mcp-console/config",
    method: "PUT",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "localhost:3080", "content-type": "application/json" },
  });
  let status;
  handler(req, { writeHead(code) { status = code; }, end() {} });
  process.nextTick(() => { req.emit("data", Buffer.from(body)); req.emit("end"); });
  await new Promise((resolve) => setTimeout(resolve, 30));
  // The UI-placement section has no reader and is gone; switches are written
  // through the official settings form, so nothing here may persist.
  assert.equal(status, 405);
  routes.dispose();
});

test("GET /config answers the resolved switches and stays loopback-only", async () => {
  let handler;
  const routes = registerRoutes({ webServer: { register({ handler: h }) { handler = h; return () => {}; } } }, {
    orchestrator: orchestrator("cfg-read"),
    getPluginConfig: () => ({ enabled: true, announceToAgent: false }),
  });
  const call = async (headers) => {
    const req = new EventEmitter();
    Object.assign(req, { url: "/api/dsh-mcp-console/config", method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers });
    let status;
    let payload;
    handler(req, { writeHead(code) { status = code; }, end(value) { payload = value; } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { status, payload };
  };
  const local = await call({ host: "localhost:3080" });
  assert.equal(local.status, 200);
  assert.deepEqual(JSON.parse(local.payload).config, { enabled: true, announceToAgent: false });
  // no route is exempt from the fence anymore
  const lan = await call({ host: "attacker.example:3080" });
  assert.equal(lan.status, 403);
  routes.dispose();
});

test("an oversized body answers 400 instead of resetting the connection", async () => {
  let handler;
  const routes = registerRoutes({ webServer: { register({ handler: h }) { handler = h; return () => {}; } } }, {
    orchestrator: orchestrator("oversize"),
  });
  const req = new EventEmitter();
  req.resume = () => {};
  Object.assign(req, {
    url: "/api/dsh-mcp-console/import",
    method: "POST",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "localhost:3080" },
  });
  let status;
  let payload;
  handler(req, { writeHead(code) { status = code; }, end(value) { payload = value; } });
  process.nextTick(() => {
    req.emit("data", Buffer.alloc(1024 * 1024 + 1, 0x61));
    req.emit("end");
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(status, 400);
  assert.match(JSON.parse(payload).error.message, /exceeds/);
  routes.dispose();
});

test("a project-scope add without a workspace is a 400, not a 500", async () => {
  let handler;
  const routes = registerRoutes({ webServer: { register({ handler: h }) { handler = h; return () => {}; } } }, {
    orchestrator: orchestrator("project-refusal"),
    resolveOrchestrator: () => new ConsoleAggregate(orchestrator("agg-global"), null),
  });
  const req = new EventEmitter();
  Object.assign(req, {
    url: "/api/dsh-mcp-console/servers",
    method: "POST",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "localhost:3080" },
  });
  let status;
  handler(req, { writeHead(code) { status = code; }, end() {} });
  process.nextTick(() => {
    req.emit("data", Buffer.from(JSON.stringify({ name: "demo", transport: "stdio", command: "node", scope: "project" })));
    req.emit("end");
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(status, 400);
  routes.dispose();
});

test("PATCH null clears an optional advanced field, omitting it keeps it", async () => {
  const root = tempDir("_tmp_mcp_regression-null");
  const store = new Store(join(root, "store.json"));
  const one = new Orchestrator(fakeContext(), { globalStore: store, ingestProfile: false, scopeKey: "null-clear" });
  store.mutate((servers) => {
    servers.demo = {
      enabled: false,
      transport: "stdio",
      command: "node",
      reconnect: { maxAttempts: 3 },
      maxInstructionBytes: 4096,
    };
  });
  await one.update("demo", { reconnect: null, maxInstructionBytes: null });
  const stored = store.read().servers.demo;
  assert.equal(stored.reconnect, undefined, "null clears the reconnect policy");
  assert.equal(stored.maxInstructionBytes, undefined, "null clears the byte cap");
  // a patch that does not mention them leaves the values untouched
  store.mutate((servers) => {
    servers.demo.reconnect = { maxAttempts: 2 };
  });
  await one.update("demo", { toolCallTimeoutMs: 9000 });
  assert.deepEqual(store.read().servers.demo.reconnect, { maxAttempts: 2 });
  recover(root);
});
