import { test } from "node:test";
import assert from "node:assert/strict";
import { validateServerConfig, toClientConfig, maskRecord, MASK, SERVER_NAME_PATTERN } from "../lib/clientAdapter.js";
import { parseMcpServers } from "../lib/import.js";
import { mergeMasked } from "../lib/orchestrator.js";
import { serverStatus } from "../lib/status.js";

test("serverName pattern mirrors the official contract", () => {
  assert.match("everything", SERVER_NAME_PATTERN);
  assert.match("a-b_C9", SERVER_NAME_PATTERN);
  assert.doesNotMatch("bad name", SERVER_NAME_PATTERN);
  assert.doesNotMatch("x".repeat(33), SERVER_NAME_PATTERN);
  assert.doesNotMatch("名", SERVER_NAME_PATTERN);
});

test("validateServerConfig normalizes a stdio server", () => {
  const { config, error } = validateServerConfig({
    name: "everything",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything", "stdio"],
    env: { A: "1" },
  });
  assert.equal(error, undefined);
  assert.equal(config.enabled, true);
  assert.equal(config.scope, "global");
  assert.equal(config.toolCallTimeoutMs, 60000);
  assert.equal(config.failOnStartupError, false);
  assert.deepEqual(config.args, ["-y", "@modelcontextprotocol/server-everything", "stdio"]);
});

test("validateServerConfig rejects bad input", () => {
  assert.ok(validateServerConfig({ name: "bad name", transport: "stdio", command: "x" }).error);
  assert.ok(validateServerConfig({ name: "ok", transport: "carrier-pigeon", command: "x" }).error);
  assert.ok(validateServerConfig({ name: "ok", transport: "stdio", command: "" }).error);
  assert.ok(validateServerConfig({ name: "ok", transport: "streamable-http", url: "ftp://x" }).error);
  assert.ok(validateServerConfig({ name: "ok", transport: "stdio", command: "x", reconnect: 5 }).error);
});

test("toClientConfig produces the official shape", () => {
  const config = toClientConfig({
    name: "everything",
    transport: "stdio",
    command: "npx",
    args: ["-y"],
    env: { A: "1" },
    cwd: "/tmp",
    toolCallTimeoutMs: 12345,
    failOnStartupError: true,
  });
  assert.deepEqual(config, {
    transport: "stdio",
    serverName: "everything",
    toolCallTimeoutMs: 12345,
    failOnStartupError: true,
    command: "npx",
    args: ["-y"],
    env: { A: "1" },
    cwd: "/tmp",
  });
  const http = toClientConfig({ name: "h", transport: "streamable-http", url: "http://x/mcp", headers: { a: "b" } });
  assert.equal(http.serverName, "h");
  assert.deepEqual(http.headers, { a: "b" });
});

test("maskRecord masks values but keeps keys", () => {
  assert.deepEqual(maskRecord({ KEY: "secret", EMPTY: "" }), { KEY: MASK, EMPTY: "" });
});

test("mergeMasked round-trips the panel's masked values", () => {
  const stored = { KEY: "real", OLD: "gone" };
  const merged = mergeMasked(stored, { KEY: MASK, OLD: "", NEW: "set" });
  assert.deepEqual(merged, { KEY: "real", NEW: "set" });
});

test("parseMcpServers handles stdio and http shapes", () => {
  const { servers, errors } = parseMcpServers(JSON.stringify({
    mcpServers: {
      everything: { command: "npx", args: ["-y", "x"], env: { A: "1" } },
      remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer x" }, type: "http" },
      junk: "not-an-object",
    },
  }));
  assert.deepEqual(errors, ['"junk": not an object, skipped']);
  assert.equal(servers.length, 2);
  assert.equal(servers[0].config.transport, "stdio");
  assert.equal(servers[1].config.transport, "streamable-http");
  assert.equal(servers[1].config.url, "https://example.com/mcp");
});

test("parseMcpServers reports invalid JSON", () => {
  const { servers, errors } = parseMcpServers("{ oops");
  assert.deepEqual(servers, []);
  assert.ok(errors[0].startsWith("invalid JSON"));
});

test("serverStatus derives the MVP state machine", () => {
  const now = Date.now();
  assert.equal(serverStatus(undefined, [], false), "disabled");
  assert.equal(serverStatus(undefined, [], true), "failed");
  assert.equal(serverStatus({ pending: true, error: null }, [], true), "loading");
  assert.equal(serverStatus({ pending: false, error: "boom", fiber: null }, [], true), "failed");
  // ACTIVE fiber with tools -> running
  const entry = { pending: false, error: null, fiber: { state: 2 }, loadedAt: now };
  assert.equal(serverStatus(entry, ["mcp__a__t"], true), "running");
  // ACTIVE, zero tools, inside grace -> connecting
  assert.equal(serverStatus({ ...entry, tools: 0 }, [], true), "connecting");
  // ACTIVE, zero tools, past grace -> failed
  assert.equal(serverStatus({ ...entry, loadedAt: now - 10 * 60 * 1000 }, [], true), "failed");
  // FAILED fiber -> failed
  assert.equal(serverStatus({ pending: false, error: null, fiber: { state: 3 }, loadedAt: now }, [], true), "failed");
});

test("validateServerConfig carries disabledTools", () => {
  const { config } = validateServerConfig({
    name: "t",
    transport: "stdio",
    command: "x",
    disabledTools: ["mcp__t__a", 42, "mcp__t__b"],
  });
  assert.deepEqual(config.disabledTools, ["mcp__t__a", "mcp__t__b"]);
  const missing = validateServerConfig({ name: "t", transport: "stdio", command: "x" });
  assert.deepEqual(missing.config.disabledTools, []);
});

test("toolGuard denies disabled tools and rebuilds from stores", async () => {
  const { Orchestrator } = await import("../lib/orchestrator.js");
  const { Store } = await import("../lib/store.js");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-console-guard-"));
  const store = new Store(path.join(dir, "dsh-mcp.json"));
  const fakeCtx = {
    registry: { entries: function* () {} },
    tools: { schemas: () => [] },
    plugin: () => { throw new Error("not in this test"); },
    logger: { warn() {}, error() {} },
  };
  const orchestrator = new Orchestrator(fakeCtx, { globalStore: store, onChange: () => {} });
  store.mutate((servers) => {
    servers.t = { transport: "stdio", command: "x", disabledTools: ["mcp__t__a"] };
  });
  orchestrator.rebuildDisabledToolSet();
  assert.equal(orchestrator.toolGuard({ name: "mcp__t__a" })?.includes("disabled"), true);
  assert.equal(orchestrator.toolGuard({ name: "mcp__t__b" }), undefined);
  assert.equal(orchestrator.toolGuard({}), undefined);
  rmSync(dir, { recursive: true, force: true });
});

test("scope migration drops the stale entry from the old store", async () => {
  const { Orchestrator } = await import("../lib/orchestrator.js");
  const { Store } = await import("../lib/store.js");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-console-scope-"));
  const globalStore = new Store(path.join(dir, "global.json"));
  const projectStore = new Store(path.join(dir, "project.json"));
  const fakeCtx = {
    registry: { entries: function* () {} },
    tools: { schemas: () => [] },
    plugin: () => ({ state: 2, update: async () => {}, dispose: async () => {} }),
    logger: { warn() {}, error() {} },
  };
  const orch = new Orchestrator(fakeCtx, { globalStore, onChange: () => {} });
  orch.mcpClient = { name: "mcp-client" };
  globalStore.mutate((s) => { s.mover = { transport: "stdio", command: "x", enabled: true }; });
  orch.setProjectStore(projectStore, dir);
  await orch.update("mover", { scope: "project" });
  assert.equal(globalStore.read().servers.mover, undefined, "old store entry gone");
  assert.equal(projectStore.read().servers.mover?.transport, "stdio", "new store has it");
  rmSync(dir, { recursive: true, force: true });
});
