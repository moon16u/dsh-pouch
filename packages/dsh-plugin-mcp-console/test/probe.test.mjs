import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Orchestrator, ConsoleError, FiberState, PROBE_TIMEOUT_MS } from "../lib/orchestrator.js";
import { Store } from "../lib/store.js";

/**
 * Side-fiber probe ("Test connection", borrowed from dsh-skills-mcp-manager):
 * one throwaway official-client fiber with failOnStartupError forced on, a
 * hard timeout, tool counting (prefix + diff attribution), and honest live
 * reports when the namespace is already reserved by a running fiber.
 */

const ACTIVE = FiberState.ACTIVE;
const DISPOSED = FiberState.DISPOSED;

/**
 * A thenable stand-in for a cordis fiber. `settle` decides the outcome:
 * a resolved/rejected promise, or null for a fiber that never settles
 * (the probe-timeout path). `await fiber` resolves to null, never to the
 * fiber itself, so the fake never trips thenable-adoption recursion.
 */
function fakeFiber({ state = ACTIVE, settle = null, config = null } = {}) {
  const fiber = {
    state,
    config,
    disposed: false,
    async dispose() {
      fiber.disposed = true;
      fiber.state = DISPOSED;
    },
  };
  if (settle === null) fiber.then = () => {}; // never settles
  else fiber.then = (onOk, onErr) => settle.then(() => onOk(null), (error) => onErr(error));
  return fiber;
}

function makeOrchestrator({ servers = {}, tools = [], registryEntries = [], pluginImpl } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-console-probe-"));
  const store = new Store(join(dir, "dsh-mcp.json"));
  store.mutate((existing) => {
    Object.assign(existing, servers);
  });
  const fakeCtx = {
    registry: { entries: () => registryEntries[Symbol.iterator]() },
    tools: { schemas: () => tools.map((name) => ({ name })) },
    plugin: pluginImpl ?? (() => {
      throw new Error("ctx.plugin must not be called in this test");
    }),
    logger: { warn() {}, error() {} },
  };
  const orchestrator = new Orchestrator(fakeCtx, { globalStore: store, onChange: () => {} });
  orchestrator.__dir = dir;
  return orchestrator;
}

function disposeOrchestrator(orchestrator) {
  rmSync(orchestrator.__dir, { recursive: true, force: true });
}

const VALID_HTTP = { transport: "streamable-http", url: "http://127.0.0.1:9/mcp" };

test("probe rejects unknown server names", async () => {
  const orchestrator = makeOrchestrator();
  try {
    await assert.rejects(() => orchestrator.probe("ghost"), (error) => {
      assert.ok(error instanceof ConsoleError);
      assert.equal(error.code, "not_found");
      return true;
    });
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe reports invalid stored config without spawning a fiber", async () => {
  const orchestrator = makeOrchestrator({
    servers: { broken: { transport: "carrier-pigeon" } },
  });
  try {
    const result = await orchestrator.probe("broken");
    assert.equal(result.ok, false);
    assert.equal(result.live, false);
    assert.match(result.error, /transport/);
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe of a live healthy fiber reports live status without a side fiber", async () => {
  const tools = ["mcp__github__echo", "mcp__github__list_repos"];
  const orchestrator = makeOrchestrator({ servers: { github: { ...VALID_HTTP } }, tools });
  try {
    orchestrator.ledger.set("github", {
      fiber: fakeFiber({ state: ACTIVE, settle: Promise.resolve() }),
      config: {},
      toolNames: new Set(),
      error: null,
      pending: false,
      loadedAt: Date.now(),
    });
    const result = await orchestrator.probe("github");
    assert.deepEqual(
      { ok: result.ok, live: result.live, toolCount: result.toolCount, latencyMs: result.latencyMs, error: result.error },
      { ok: true, live: true, toolCount: 2, latencyMs: null, error: null },
    );
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe of a live-but-unhealthy fiber reports the failure honestly", async () => {
  const orchestrator = makeOrchestrator({ servers: { github: { ...VALID_HTTP } }, tools: [] });
  try {
    orchestrator.ledger.set("github", {
      fiber: fakeFiber({ state: ACTIVE, settle: Promise.resolve() }),
      config: {},
      toolNames: new Set(),
      error: null,
      pending: false,
      loadedAt: Date.now(),
    });
    const result = await orchestrator.probe("github");
    assert.equal(result.ok, false);
    assert.equal(result.live, true);
    assert.match(result.error, /no tools/);
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe spawns one side fiber, forces failOnStartupError, counts tools, disposes it", async () => {
  const spawnedConfigs = [];
  const spawnedFibers = [];
  // a live foreign server exists; the probe's own diff will capture one of
  // its concurrently-registered tools and must drop it
  const tools = ["mcp__github__echo"];
  const orchestrator = makeOrchestrator({
    servers: { github: { ...VALID_HTTP, failOnStartupError: false } },
    tools,
    registryEntries: [
      ["cb1", { name: "mcp-client", fibers: [{ config: { serverName: "other" } }] }],
    ],
  });
  try {
    orchestrator.mcpClient = { name: "fake-mcp-client" };
    orchestrator.ctx.plugin = (mod, config) => {
      assert.equal(mod.name, "fake-mcp-client");
      spawnedConfigs.push(config);
      // the official client registers a hash-renamed long tool (no server
      // prefix — that is why the diff capture exists) and a foreign server's
      // tool lands in the same window
      tools.push("mcp__a1b2c3d4e5f6g7h8", "mcp__other__scrape");
      const fiber = fakeFiber({ state: ACTIVE, settle: Promise.resolve(), config });
      spawnedFibers.push(fiber);
      return fiber;
    };
    const result = await orchestrator.probe("github");
    assert.equal(spawnedConfigs.length, 1, "exactly one side fiber");
    assert.equal(spawnedConfigs[0].failOnStartupError, true, "probe forces failOnStartupError");
    assert.equal(spawnedConfigs[0].serverName, "github");
    assert.equal(result.ok, true);
    assert.equal(result.live, false);
    // prefix match + hash-renamed diff capture; the foreign capture is dropped
    assert.equal(result.toolCount, 2);
    assert.ok(typeof result.latencyMs === "number" && result.latencyMs >= 0);
    assert.equal(result.error, null);
    assert.equal(orchestrator.ledger.size, 0, "probe never touches the ledger");
    assert.equal(spawnedFibers[0].disposed, true, "the side fiber is disposed after a successful probe");
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe reports a failed handshake and still disposes the fiber", async () => {
  const spawned = [];
  const orchestrator = makeOrchestrator({ servers: { github: { ...VALID_HTTP } } });
  try {
    orchestrator.mcpClient = {};
    orchestrator.ctx.plugin = (_mod, config) => {
      const fiber = fakeFiber({
        state: ACTIVE,
        settle: Promise.reject(new Error("probe: connection refused")),
        config,
      });
      spawned.push(fiber);
      return fiber;
    };
    const result = await orchestrator.probe("github");
    assert.equal(result.ok, false);
    assert.equal(result.live, false);
    assert.equal(result.error, "probe: connection refused");
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].disposed, true, "failed probe fiber is disposed");
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe times out a hanging fiber and disposes it", async () => {
  const spawned = [];
  const orchestrator = makeOrchestrator({ servers: { github: { ...VALID_HTTP } } });
  try {
    orchestrator.mcpClient = {};
    orchestrator.ctx.plugin = (_mod, config) => {
      const fiber = fakeFiber({ state: FiberState.LOADING, settle: null, config });
      spawned.push(fiber);
      return fiber;
    };
    const result = await orchestrator.probe("github", { timeoutMs: 40 });
    assert.equal(result.ok, false);
    assert.equal(result.live, false);
    assert.match(result.error, /timed out after 40ms/);
    assert.equal(spawned[0].disposed, true, "hanging probe fiber is disposed on timeout");
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("probe is serialized against concurrent mutations of the same namespace", async () => {
  const order = [];
  const orchestrator = makeOrchestrator({ servers: { github: { ...VALID_HTTP } } });
  try {
    orchestrator.mcpClient = {};
    orchestrator.ctx.plugin = () => {
      order.push("plugin");
      return fakeFiber({ state: ACTIVE, settle: Promise.resolve() });
    };
    const slowMutation = orchestrator.run(async () => {
      order.push("mutation:start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push("mutation:end");
    });
    const probe = orchestrator.probe("github");
    await Promise.all([slowMutation, probe]);
    // the probe's ctx.plugin only ran after the in-flight mutation finished
    assert.deepEqual(order, ["mutation:start", "mutation:end", "plugin"]);
  } finally {
    disposeOrchestrator(orchestrator);
  }
});

test("PROBE_TIMEOUT_MS default stays generous (cold stdio downloads)", () => {
  assert.ok(PROBE_TIMEOUT_MS >= 10000, `PROBE_TIMEOUT_MS=${PROBE_TIMEOUT_MS}`);
});
