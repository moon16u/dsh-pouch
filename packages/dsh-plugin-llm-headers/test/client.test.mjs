import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Contract tests for the Request Headers settings section.
 *
 * The section ships inside the pouch's root client bundle (`lib/client.js`) —
 * one module id, one `apply`, everything inlined — because that is the artifact
 * DSH's module loader actually loads. It is exercised from this package because
 * this is the plugin the section configures.
 *
 * The bundle is a script, not a module: it calls `window.__ModuleLoader__.load`
 * at import time. Stubbing that plus the loader's `require` is what makes the
 * wiring assertable in Node, with no browser and no React dependency.
 */
const BUNDLE = new URL("../../../lib/client.js", import.meta.url);

/** Minimal stand-ins for the two host modules the bundle requires. */
function requireShim(id) {
  if (id === "react") {
    return {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useState: (initial) => [initial, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      useRef: () => ({ current: null }),
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    };
  }
  if (id === "@deepseek-ai/dsh-client-ui-primitives") {
    return { IconCopyOutline16: () => null, IconCheckOutline16: () => null };
  }
  throw new Error(`the bundle required an unexpected module: ${id}`);
}

/**
 * The registration the bundle performs on import. Node executes a module once,
 * so the import is memoized here and each caller instead re-runs the factory,
 * which is also what keeps one test's module state out of the next one's.
 */
let registration;

/** Load the bundle and hand back a fresh instance of the module it registers. */
async function loadBundle() {
  if (registration === undefined) {
    globalThis.window = { __ModuleLoader__: { load: (candidate) => { registration = candidate; } } };
    await import(BUNDLE.href);
    assert.ok(registration !== undefined, "the bundle must register through __ModuleLoader__.load");
    // The id must equal the root package name or DSH's loader rejects the bundle.
    assert.equal(registration.id, "@moon16u/dsh-pouch");
  }
  return registration.factory(requireShim);
}

/** A cordis context recording every registration the bundle performs. */
function contextStub(services) {
  const registered = [];
  const dictionaries = [];
  const scope = {
    effect: (fn) => { fn(); },
    locale: {
      register: (ns) => { dictionaries.push(ns); return () => {}; },
      bind: (ns) => (key) => `${ns}:${key}`,
    },
    slots: {
      inject: (name, fn) => fn(),
      register: (options, component) => { registered.push({ ...options, component }); return () => {}; },
    },
    get: (name) => services[name],
    inject: (names, fn) => {
      if (names.some((name) => services[name] === undefined)) return;
      fn(scope);
    },
  };
  for (const [name, value] of Object.entries(services)) scope[name] = value;
  return { scope, registered, dictionaries };
}

function settingsServices() {
  return {
    connection: { api: {} },
    settingsScope: { describe: () => ({ getSnapshot: () => ({ status: "idle", view: undefined, error: null }) }) },
    settingsSchema: { getPath: () => undefined },
  };
}

test("the bundle exports the plugin surface DSH loads", async () => {
  const bundle = await loadBundle();

  assert.equal(typeof bundle.apply, "function");
  assert.equal(typeof bundle.HeadersSection, "function");
  assert.equal(typeof bundle.SessionIdAction, "function");
  // Only the two services both occupants need; the settings ones are deferred.
  assert.deepEqual(bundle.inject, ["slots", "locale"]);
});

test("apply registers the headers section beside the session-id badge", async () => {
  const bundle = await loadBundle();
  const { scope, registered, dictionaries } = contextStub(settingsServices());

  bundle.apply(scope);

  const slots = registered.map((entry) => `${entry.name}#${entry.id}`);
  assert.deepEqual(slots, [
    "conversation.session.header.utilities#dsh-session-id",
    "settings.section#llm-headers",
  ]);
  assert.deepEqual(dictionaries, ["session-id", "llm-headers"]);

  const section = registered[1];
  assert.equal(section.component, bundle.HeadersSection);
  // The nav entry is localized through the registrant's own dictionary.
  assert.equal(section.label(), "llm-headers:nav");
  assert.equal(typeof section.order, "number");
});

test("the section carries the wire faces it renders from", async () => {
  const bundle = await loadBundle();
  const services = settingsServices();
  const { scope, registered } = contextStub(services);

  bundle.apply(scope);
  const injected = registered[1].inject();

  assert.equal(injected.api, services.connection.api);
  assert.equal(injected.schema, services.settingsSchema);
  assert.equal(typeof injected.mirror.getSnapshot, "function");
  assert.equal(typeof injected.t, "function");
});

test("the badge still mounts on a host with no settings surface", async () => {
  const bundle = await loadBundle();
  const { scope, registered } = contextStub({});

  bundle.apply(scope);

  // Deferring on the settings services rather than declaring them in `inject`
  // is what keeps this true.
  assert.deepEqual(registered.map((entry) => entry.id), ["dsh-session-id"]);
});

test("rowsOf renders a stored header map as editable rows", async () => {
  const { rowsOf } = await loadBundle();

  assert.deepEqual(rowsOf({ "user-agent": "CLI/unknown CodeBuddy/2.137.1" }), [
    { name: "user-agent", value: "CLI/unknown CodeBuddy/2.137.1" },
  ]);
  // A removal marker round-trips as an empty value, which is how the editor
  // spells the same thing.
  assert.deepEqual(rowsOf({ "nvcf-poll-seconds": null }), [{ name: "nvcf-poll-seconds", value: "" }]);
  assert.deepEqual(rowsOf(undefined), []);
  assert.deepEqual(rowsOf("not-a-map"), []);
});

test("headersOf stores an empty value as a removal and drops unnamed rows", async () => {
  const { headersOf } = await loadBundle();

  assert.deepEqual(headersOf([
    { name: "user-agent", value: "my-fleet/2.1" },
    { name: "  x-tenant  ", value: "acme" },
    { name: "nvcf-poll-seconds", value: "" },
    { name: "   ", value: "orphaned" },
  ]), {
    "user-agent": "my-fleet/2.1",
    "x-tenant": "acme",
    "nvcf-poll-seconds": null,
  });
  assert.deepEqual(headersOf([]), {});
});

test("rowsOf and headersOf round-trip a map through the editor", async () => {
  const { headersOf, rowsOf } = await loadBundle();
  const stored = { "user-agent": "my-fleet/2.1", "x-drop": null };

  assert.deepEqual(headersOf(rowsOf(stored)), stored);
});

test("savePlan keeps the profile already here when both sections declare the route", async () => {
  const { savePlan } = await loadBundle();
  const here = {
    apiKeyEnv: "CODEBUDDY_API_KEY",
    api: "openai-completions",
    baseURL: "https://copilot.tencent.com/v2",
    compat: { supportsDeveloperRole: false },
    models: [{ id: "deepseek-v4-flash", maxTokens: 50000 }],
    headers: { "user-agent": "CLI/unknown CodeBuddy/2.137.1" },
  };
  const readded = { apiKeyEnv: "CODEBUDDY_API_KEY", api: "openai-completions", baseURL: "https://example.invalid/v1" };

  const plan = savePlan("codebuddy", { "user-agent": "CLI/unknown CodeBuddy/2.137.1" }, readded, here);

  assert.equal(plan.profile.baseURL, here.baseURL);
  assert.deepEqual(plan.profile.headers, { "user-agent": "CLI/unknown CodeBuddy/2.137.1" });
  assert.equal(plan.removeFromPiAi, false);
});

test("savePlan preserves the profile without removing from llm-pi-ai", async () => {
  const { savePlan } = await loadBundle();
  const piAi = {
    apiKeyEnv: "CODEBUDDY_API_KEY",
    api: "openai-completions",
    baseURL: "https://copilot.tencent.com/v2",
    compat: { supportsDeveloperRole: false },
    models: [{ id: "deepseek-v4-flash", maxTokens: 50000 }],
  };

  const plan = savePlan("codebuddy", { "user-agent": "CLI/unknown CodeBuddy/2.137.1" }, piAi, undefined);

  assert.equal(plan.profile.baseURL, piAi.baseURL);
  assert.deepEqual(plan.profile.compat, piAi.compat);
  assert.deepEqual(plan.profile.models, piAi.models);
  assert.equal(plan.profile.apiKeyEnv, "CODEBUDDY_API_KEY");
  assert.deepEqual(plan.profile.headers, { "user-agent": "CLI/unknown CodeBuddy/2.137.1" });
  assert.equal(plan.removeFromPiAi, false);
  assert.equal("headers" in piAi, false);
});

test("savePlan updates a route already served here without removing anything", async () => {
  const { savePlan } = await loadBundle();
  const existing = { apiKeyEnv: "CODEBUDDY_API_KEY", api: "openai-completions", baseURL: "https://example.invalid/v2", headers: { "user-agent": "old" } };

  const plan = savePlan("codebuddy", { "user-agent": "new" }, undefined, existing);

  assert.equal(plan.profile.baseURL, "https://example.invalid/v2");
  assert.deepEqual(plan.profile.headers, { "user-agent": "new" });
  assert.equal(plan.removeFromPiAi, false);
});

test("savePlan derives a credential ref only when it invents the profile", async () => {
  const { savePlan } = await loadBundle();

  // A catalog route the user names here for the first time: no source profile
  // exists, so the key ref is derived the way the Models page derives it.
  const invented = savePlan("openrouter", { "x-title": "my-app" }, undefined, undefined);
  assert.equal(invented.profile.apiKeyEnv, "OPENROUTER_API_KEY");
  assert.equal(invented.removeFromPiAi, false);

  // A moved profile that already records its own ref keeps it, not a derived one.
  const moved = savePlan("cb", {}, { apiKeyEnv: "CUSTOM_KEY", baseURL: "https://x/v1" }, undefined);
  assert.equal(moved.profile.apiKeyEnv, "CUSTOM_KEY");
});

test("savePlan clears the headers field when the map is empty", async () => {
  const { savePlan } = await loadBundle();

  const plan = savePlan("cb", {}, undefined, { apiKeyEnv: "K", baseURL: "https://x/v1", headers: { "user-agent": "gone" } });

  assert.equal("headers" in plan.profile, false);
  assert.equal(plan.profile.baseURL, "https://x/v1");
});
