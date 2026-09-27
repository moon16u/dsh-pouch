import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  Config,
  MCP_CONSOLE_SETTINGS_NAMESPACE,
  name,
  resolveConfig,
} from "../lib/index.js";

// rc.2 settings (schema-driven SettingsForms): the section comes from
// `export const Config`, `.volatile()` fields are the editable switches, and a
// GUI edit hot-updates the volatile value in place then emits
// `settings/document-updated`; the plugin re-syncs its live surfaces on it.
// The live SettingsForms path (configEditor + profileContext + Loader) is
// verified on a real host; here the wiring is driven through a fake ctx.

const SETTLE = () => new Promise((r) => setTimeout(r, 10));

// A cosmokit `Volatile`-shaped ref whose value the test mutates to model a GUI
// edit; the plugin reads it via `.get()`.
function volatileRef(initial) {
  let value = initial;
  return { get: () => value, set: (next) => { value = next; } };
}

// Fake host ctx: `activate` names services whose inject callback runs; inject
// returns disposable fake fibers so surface toggles are observable; on/emit
// model the cordis event bus carrying the settings-changed event.
function makeFakeCtx({ activate = [] } = {}) {
  const state = { injectCalls: [], fibers: [], sections: [], warnings: [], listeners: new Map() };
  const systemPromptScope = {
    systemPrompt: {
      section: (section) => { state.sections.push(section); return () => {}; },
    },
  };
  const ctx = {
    fiber: { state: 2 },
    logger: { warn: (m) => state.warnings.push(m) },
    on(event, cb) {
      const list = state.listeners.get(event) ?? [];
      list.push(cb);
      state.listeners.set(event, list);
      return () => {};
    },
    emit(event, ...args) {
      for (const cb of state.listeners.get(event) ?? []) cb(...args);
    },
    inject(names, fn) {
      state.injectCalls.push([...names]);
      const fiber = {
        state: 2,
        names: [...names],
        disposed: false,
        async dispose() { fiber.disposed = true; fiber.state = 4; },
      };
      state.fibers.push(fiber);
      if (activate.includes(names[0])) fn(names[0] === "systemPrompt" ? systemPromptScope : {});
      return fiber;
    },
  };
  return { ctx, state };
}

const liveCount = (state, service) =>
  state.fibers.filter((f) => f.names[0] === service && !f.disposed).length;

const emitEdit = (ctx) => ctx.emit("settings/document-updated", MCP_CONSOLE_SETTINGS_NAMESPACE, 2);
test("Config schema and resolveConfig defaults (plain + volatile refs)", () => {
  assert.equal(name, "mcp-console");
  assert.equal(MCP_CONSOLE_SETTINGS_NAMESPACE, "mcp-console");
  assert.ok(Config, "schemastery Config schema is exported for the loader");
  assert.deepEqual(resolveConfig(undefined), { enabled: true, announceToAgent: true });
  assert.deepEqual(resolveConfig({ enabled: false }), { enabled: false, announceToAgent: true });
  assert.deepEqual(resolveConfig({ announceToAgent: false }), { enabled: true, announceToAgent: false });
  assert.deepEqual(
    resolveConfig({ enabled: volatileRef(false), announceToAgent: volatileRef(true) }),
    { enabled: false, announceToAgent: true },
  );
});

test("apply with default config creates both surfaces", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  apply(ctx, undefined);
  assert.equal(liveCount(state, "systemPrompt"), 1);
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(state.sections.length, 1);
  assert.equal(state.sections[0].name, "plugin:mcp-console");
});

test("apply with enabled=false creates no surfaces at all", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  apply(ctx, { enabled: false });
  assert.equal(liveCount(state, "webServer"), 0);
  assert.equal(liveCount(state, "systemPrompt"), 0);
  assert.equal(state.sections.length, 0);
});

test("apply with announceToAgent=false keeps composition, drops announcement", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  apply(ctx, { enabled: true, announceToAgent: false });
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(liveCount(state, "systemPrompt"), 0);
});
test("volatile edit + document-updated: enabled off tears down, back on rebuilds", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  const enabled = volatileRef(true);
  apply(ctx, { enabled, announceToAgent: true });
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(liveCount(state, "systemPrompt"), 1);
  enabled.set(false); emitEdit(ctx);
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 0, "composition disposed by the edit");
  assert.equal(liveCount(state, "systemPrompt"), 0, "announcement disposed with the switch");
  enabled.set(true); emitEdit(ctx);
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 1, "fresh composition after re-enable");
  assert.equal(liveCount(state, "systemPrompt"), 1);
  assert.deepEqual(state.warnings, []);
});

test("announceToAgent volatile edit drops only the announcement", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  const announceToAgent = volatileRef(true);
  apply(ctx, { enabled: true, announceToAgent });
  assert.equal(liveCount(state, "systemPrompt"), 1);
  announceToAgent.set(false); emitEdit(ctx);
  await SETTLE();
  assert.equal(liveCount(state, "systemPrompt"), 0, "announcement disposed");
  assert.equal(liveCount(state, "webServer"), 1, "composition untouched");
});
test("rapid off->on collapses to exactly one live composition", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  const enabled = volatileRef(true);
  apply(ctx, { enabled, announceToAgent: true });
  enabled.set(false); emitEdit(ctx);
  enabled.set(true); emitEdit(ctx);
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 1);
  const webFibers = state.fibers.filter((f) => f.names[0] === "webServer");
  assert.equal(webFibers.length, 1, "no wasted teardown/rebuild");
  assert.equal(webFibers[0].disposed, false);
});

test("a host without an event bus (no ctx.on) still applies without crashing", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  delete ctx.on;
  apply(ctx, undefined);
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(liveCount(state, "systemPrompt"), 1);
});
