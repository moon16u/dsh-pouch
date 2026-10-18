import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The settings scope is bound to the optional `configForms` service AFTER the
 * MCP section registers. This drives the real bundle through the same
 * ModuleLoader shape the browser uses, so the late binding and the Plugins
 * card registration are asserted on the shipped client, not a stub.
 */
const here = dirname(fileURLToPath(import.meta.url));

async function loadBundle(tag) {
  const source = await readFile(join(here, "..", "lib", "client.js"), "utf8");
  let registration;
  globalThis.window = { __ModuleLoader__: { load: (candidate) => { registration = candidate; } } };
  // A distinct data URL per call: an identical one is served from the module
  // cache and never re-executes, which would leave `registration` undefined
  // and also starve render.test.mjs of its own registration capture.
  await import("data:text/javascript," + encodeURIComponent(`${source}\n// ${tag}`));
  const requireShim = (id) => {
    if (id === "react") {
      return { createElement: () => {}, useState: () => [undefined, () => {}], useEffect: () => {}, useReducer: () => [0, () => {}], Fragment: {} };
    }
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return {};
    throw new Error(`unexpected module ${id}`);
  };
  return registration.factory(requireShim);
}

test("the settings scope binds late and registers the Plugins card", async () => {
  const bundle = await loadBundle("bind-a");
  const form = {
    getSnapshot: () => ({ status: "ready", value: { enabled: true, announceToAgent: false }, user: { announceToAgent: false }, writable: true }),
    subscribe: () => () => {},
    set: () => Promise.resolve(true),
    unset: () => Promise.resolve(true),
    dispose: () => {},
  };
  const injected = [];
  const registered = [];
  const ctx = {
    effect: (fn) => { fn(); },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: { inject: (_slot, fn) => fn(), register: (spec) => { registered.push([spec.name, spec.id]); return () => {}; } },
    inject: (names, fn) => {
      injected.push(names[0]);
      fn({
        configForms: { get: () => form, whileServed: (_ns, fn2) => fn2() },
        sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
      });
    },
  };
  bundle.apply(ctx);

  assert.deepEqual(bundle.inject, ["slots", "locale"], "only hard services are declared");
  assert.ok(injected.includes("configForms"), "configForms is injected optionally");
  assert.ok(injected.includes("sessions"), "sessions is injected optionally");
  assert.ok(registered.some(([name]) => name === "settings.section"));
  assert.ok(registered.some(([name, id]) => name === "plugins.item" && id === "ui-mcp-console"));
  assert.equal(typeof globalThis.__dshMcpConsoleSession, "function");
});

test("a host without configForms still mounts the MCP section", async () => {
  const bundle = await loadBundle("bind-b");
  const registered = [];
  const ctx = {
    effect: (fn) => { fn(); },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: { inject: (_slot, fn) => fn(), register: (spec) => { registered.push(spec.name); return () => {}; } },
    // Cordis never runs the callback for an unavailable service: simulate a
    // host that simply has no configForms/sessions composed.
    inject: () => {},
  };
  bundle.apply(ctx);
  assert.ok(registered.includes("settings.section"), "the MCP section does not depend on configForms");
});
