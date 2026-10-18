import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { parseDocument } from "yaml";
import { ingestProfileMcpEntries, exportStoreToProfileYaml } from "../lib/yamlMigrator.js";
import { Store } from "../lib/store.js";
import { Orchestrator, mergeMasked } from "../lib/orchestrator.js";
import { registerRoutes } from "../lib/routes.js";
import { Context } from "@deepseek-ai/cordis";

const recover = (path) => {
  if (existsSync(path)) renameSync(path, `${path}.recovered-${Date.now()}`);
};
function fixture(yaml = "") {
  const root = mkdtempSync("/tmp/_tmp_mcp_regression-");
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
  const root = mkdtempSync("/tmp/_tmp_mcp_regression-orch-");
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
    uiStore: new Store("/tmp/_tmp_mcp_regression-ui.json"),
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
  }, { orchestrator: global, uiStore: new Store("/tmp/_tmp_mcp_regression-ui2.json") });
  const req = new EventEmitter();
  Object.assign(req, { url: "/api/dsh-mcp-console/health?sessionId=p", method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:3080" } });
  let body;
  handler(req, { writeHead() {}, end(value) { body = JSON.parse(value); } });
  assert.match(body.globalStore, /store\.json/);
  routes.dispose();
});

test("real Cordis reload waits for startup settlement", async () => {
  const root = mkdtempSync("/tmp/_tmp_mcp_regression-reload-");
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
  const root = mkdtempSync("/tmp/_tmp_mcp_regression-recover-");
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
