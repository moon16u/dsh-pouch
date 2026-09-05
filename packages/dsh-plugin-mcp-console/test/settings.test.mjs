import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  Config,
  MCP_CONSOLE_SETTINGS_NAMESPACE,
  name,
  resolveConfig,
} from "../lib/index.js";

/**
 * Official settings integration (borrowed from dsh-skills-mcp-manager, on the
 * in-repo dual-generation helper): `enabled` / `announceToAgent` master
 * switches, editable from the settings GUI, converging the live surfaces
 * (composition fiber + announcement fiber) with every change.
 */

const SETTLE = () => new Promise((resolve) => setTimeout(resolve, 10));

/**
 * A fake host context. `activate` lists service names whose inject callback
 * runs immediately (others stay dormant, like missing services). Inject calls
 * return disposable fake fibers so surface toggles can be observed.
 */
function makeFakeCtx({ activate = [], settingsImpl = null, scopeValues = null } = {}) {
  const state = {
    injectCalls: [],
    fibers: [],
    sections: [],
    settingsInstalls: [],
    warnings: [],
    scopeValue: scopeValues ?? { enabled: true, announceToAgent: true },
    watchers: [],
  };

  const systemPromptScope = {
    systemPrompt: {
      section: (section) => {
        state.sections.push(section);
        return () => {};
      },
    },
  };

  // new-generation provider (>= 0.1.2): installSection(owner, ns, schema, entry, hooks)
  const newGenerationSettings = {
    settings: {
      installSection: (owner, ns, schema, entry, hooks) => {
        state.settingsInstalls.push({ owner, ns, schema, entry, hooks });
      },
    },
  };
  // pre-0.1.2 provider: register(ns, schema, {base, validate}) -> {get, watch}
  const oldGenerationSettings = {
    settings: {
      register: (ns, schema, options) => {
        state.settingsInstalls.push({ ns, schema, options });
        return {
          get: () => state.scopeValue,
          watch: (watcher) => {
            state.watchers.push(watcher);
          },
        };
      },
    },
  };
  const settingsScope = settingsImpl === "old" ? oldGenerationSettings : newGenerationSettings;

  const ctx = {
    fiber: { state: 2 },
    logger: { warn: (message) => state.warnings.push(message) },
    inject(names, fn) {
      state.injectCalls.push([...names]);
      const fiber = {
        state: 2,
        names: [...names],
        disposed: false,
        async dispose() {
          fiber.disposed = true;
          fiber.state = 4;
        },
      };
      state.fibers.push(fiber);
      if (activate.includes(names[0])) {
        if (names[0] === "settings") fn(settingsScope);
        else if (names[0] === "systemPrompt") fn(systemPromptScope);
        else fn({});
      }
      return fiber;
    },
  };
  return { ctx, state };
}

const liveCount = (state, service) =>
  state.fibers.filter((fiber) => fiber.names[0] === service && !fiber.disposed).length;

test("Config schema and resolveConfig defaults", () => {
  assert.equal(name, "mcp-console");
  assert.equal(MCP_CONSOLE_SETTINGS_NAMESPACE, "mcp-console");
  assert.deepEqual(resolveConfig(undefined), { enabled: true, announceToAgent: true });
  assert.deepEqual(resolveConfig({}), { enabled: true, announceToAgent: true });
  assert.deepEqual(resolveConfig({ enabled: false }), { enabled: false, announceToAgent: true });
  assert.deepEqual(
    resolveConfig({ announceToAgent: false }),
    { enabled: true, announceToAgent: false },
  );
  assert.ok(Config, "schemastery Config schema is exported for the loader");
});

test("new-generation settings: register namespace, create both surfaces by default", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["settings", "systemPrompt"] });
  apply(ctx, undefined);
  // registered against the current provider API with the right namespace
  assert.equal(state.settingsInstalls.length, 1);
  assert.equal(state.settingsInstalls[0].ns, "mcp-console");
  assert.equal(state.settingsInstalls[0].schema, Config);
  assert.deepEqual(state.settingsInstalls[0].entry, { enabled: true, announceToAgent: true });
  // both live surfaces exist synchronously after apply()
  assert.equal(liveCount(state, "systemPrompt"), 1);
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(state.sections.length, 1);
  assert.equal(state.sections[0].name, "plugin:mcp-console");
});

test("enabled=false tears down composition AND announcement; stores untouched", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["settings", "systemPrompt"] });
  apply(ctx, undefined);
  const hooks = state.settingsInstalls[0].hooks;
  hooks.setSource(() => ({ enabled: false, announceToAgent: true }));
  hooks.onChange();
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 0, "composition disposed");
  assert.equal(liveCount(state, "systemPrompt"), 0, "announcement disposed with the master switch");
  assert.equal(state.sections.length, 1, "no re-registration happened");
  assert.deepEqual(state.warnings, []);
});

test("announceToAgent=false keeps the composition, drops only the announcement", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["settings", "systemPrompt"] });
  apply(ctx, undefined);
  const hooks = state.settingsInstalls[0].hooks;
  hooks.setSource(() => ({ enabled: true, announceToAgent: false }));
  hooks.onChange();
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 1, "composition stays live");
  assert.equal(liveCount(state, "systemPrompt"), 0, "announcement disposed");
});

test("rapid off->on collapses intermediate states: exactly one live composition", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["settings", "systemPrompt"] });
  apply(ctx, undefined);
  const hooks = state.settingsInstalls[0].hooks;
  // off and on fire before the deferred steps run: the serialized steps both
  // observe the LATEST value, so the composition is never torn down at all
  hooks.setSource(() => ({ enabled: false }));
  hooks.onChange();
  hooks.setSource(() => ({ enabled: true }));
  hooks.onChange();
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(liveCount(state, "systemPrompt"), 1);
  const compositionFibers = state.fibers.filter((fiber) => fiber.names[0] === "webServer");
  assert.equal(compositionFibers.length, 1, "no wasted teardown/rebuild of the original fiber");
  assert.equal(compositionFibers[0].disposed, false);
});

test("sequential off, settled, then on rebuilds a fresh composition", async () => {
  const { ctx, state } = makeFakeCtx({ activate: ["settings", "systemPrompt"] });
  apply(ctx, undefined);
  const hooks = state.settingsInstalls[0].hooks;
  hooks.setSource(() => ({ enabled: false }));
  hooks.onChange();
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 0, "torn down after the off settles");
  hooks.setSource(() => ({ enabled: true }));
  hooks.onChange();
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(liveCount(state, "systemPrompt"), 1);
  const compositionFibers = state.fibers.filter((fiber) => fiber.names[0] === "webServer");
  assert.equal(compositionFibers.length, 2, "initial + rebuilt");
  assert.equal(compositionFibers[0].disposed, true);
  assert.equal(compositionFibers[1].disposed, false);
});

test("apply with enabled=false config creates no surfaces at all", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["settings", "systemPrompt"] });
  apply(ctx, { enabled: false });
  assert.equal(liveCount(state, "webServer"), 0);
  assert.equal(liveCount(state, "systemPrompt"), 0);
  assert.equal(state.sections.length, 0);
  // only the settings inject happened
  assert.deepEqual(state.injectCalls, [["settings"]]);
});

test("pre-0.1.2 provider: scope.get feeds the switches, watch re-syncs live", async () => {
  const { ctx, state } = makeFakeCtx({
    activate: ["settings", "systemPrompt"],
    settingsImpl: "old",
    scopeValues: null,
  });
  apply(ctx, undefined);
  // old-generation register was used, and setSource was wired to scope.get()
  assert.equal(state.settingsInstalls.length, 1);
  assert.ok(state.settingsInstalls[0].options, "register options carry the base entry");
  assert.deepEqual(state.settingsInstalls[0].options.base, { enabled: true, announceToAgent: true });
  assert.equal(liveCount(state, "webServer"), 1);
  // user edits the stored section: enabled -> false, then the watcher fires
  state.scopeValue = { enabled: false, announceToAgent: true };
  for (const watcher of state.watchers) watcher();
  await SETTLE();
  assert.equal(liveCount(state, "webServer"), 0, "composition torn down by the user edit");
});

test("missing settings service: switches stay at entry defaults", () => {
  const { ctx, state } = makeFakeCtx({ activate: ["systemPrompt"] });
  apply(ctx, { announceToAgent: true });
  // settings inject stays dormant (no provider on this host); the entry
  // config still drives the surfaces, so GUI-less hosts lose nothing
  assert.equal(liveCount(state, "webServer"), 1);
  assert.equal(liveCount(state, "systemPrompt"), 1);
  assert.equal(state.injectCalls.filter((names) => names[0] === "settings").length, 1);
  // an entry that disables the announcement works without any provider too
  const second = makeFakeCtx({ activate: ["systemPrompt"] });
  apply(second.ctx, { announceToAgent: false });
  assert.equal(liveCount(second.state, "webServer"), 1);
  assert.equal(liveCount(second.state, "systemPrompt"), 0);
  assert.equal(second.state.sections.length, 0);
});

/**
 * End-to-end against the REAL settings provider and a REAL cordis context:
 * register → resolve(base/user layering) → GUI-shaped describe() →
 * update → watcher → onChange → live surface convergence. Only the file
 * persistence is stubbed (that belongs to dsh-settings-file, not to us).
 */
test("real provider: register, resolve, describe, update, live convergence", async () => {
  let cordis;
  let settings;
  try {
    cordis = await import("@deepseek-ai/cordis");
    settings = await import("@deepseek-ai/dsh-settings");
  } catch {
    // standalone checkouts without the official peers: the fake-based tests
    // above already cover the wiring
    return;
  }
  const { Context } = cordis;
  const { SettingsProvider } = settings;

  class MemoryProvider extends SettingsProvider {
    document = {};
    get writable() {
      return true;
    }
    async load() {
      return this.document;
    }
    async persist(ns, section) {
      this.document[ns] = section;
    }
    get documentPath() {
      return undefined;
    }
  }

  const ctx = new Context();
  const provider = new MemoryProvider(ctx);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

  try {
    apply(ctx, undefined);
    await settle();

    // registration resolved through schema defaults + composition base
    assert.deepEqual(provider.get("mcp-console"), { enabled: true, announceToAgent: true });

    // the GUI shape: describe() serializes the schema, marks user overrides
    const descriptor = provider.describe().find((entry) => entry.ns === "mcp-console");
    assert.ok(descriptor, "namespace is described to configuration UIs");
    assert.ok(descriptor.schema, "schemastery schema serialized for the settings form");
    assert.equal(descriptor.applies, "live");
    assert.deepEqual(descriptor.value, { enabled: true, announceToAgent: true });

    // live composition fiber exists in the real registry (pending on services;
    // registry entries are keyed by callback, names live on the runtime)
    const liveComposition = () =>
      [...ctx.registry.entries()]
        .filter(([, runtime]) => runtime?.name === "buildComposition")
        .flatMap(([, runtime]) => [...runtime.fibers])
        .filter((fiber) => fiber.state !== 4)
        .length;
    assert.equal(liveComposition(), 1, "composition fiber created");

    // a settings-GUI edit flows all the way through: update -> watcher ->
    // onChange -> sync -> the composition fiber is disposed
    await provider.update("mcp-console", { enabled: false });
    await settle();
    assert.deepEqual(provider.get("mcp-console"), { enabled: false, announceToAgent: true });
    assert.equal(liveComposition(), 0, "composition disposed by the settings edit");
    const after = provider.describe().find((entry) => entry.ns === "mcp-console");
    assert.deepEqual(after.user, { enabled: false }, "user override marked in the descriptor");
    assert.ok(after.revision > descriptor.revision, "revision bumped for optimistic writes");

    // and back on: a fresh composition fiber
    await provider.update("mcp-console", { enabled: true });
    await settle();
    assert.equal(liveComposition(), 1);
    assert.deepEqual(provider.get("mcp-console"), { enabled: true, announceToAgent: true });
  } finally {
    try {
      await ctx.fiber.dispose();
    } catch {
      // teardown best-effort; nothing holds the event loop
    }
  }
});
