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
    // the mcp-console settings section also uses refresh/trash/close icons
    return {
      IconCopyOutline16: () => null,
      IconCheckOutline16: () => null,
      IconRefreshOutline16: () => null,
      IconTrashOutline16: () => null,
      IconCloseOutline16: () => null,
    };
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

/** A minimal scope for `wireOf`: service lookup only, no plugin machinery. */
function scopeOf(services) {
  return { get: (name) => services[name] };
}

/** The 0.1.2 Remote namespaces: payload-direct Results, positional args. */
function modernServices() {
  const calls = { providers: [], configurable: [], mutate: [] };
  return {
    calls,
    remote: {
      llm: {
        listProviders: () => {
          calls.providers.push([]);
          return Promise.resolve({
            ok: true,
            value: [
              { id: "codebuddy", name: "CodeBuddy" },
              { id: "deepseek", name: "DeepSeek" },
            ],
          });
        },
        listConfigurableProviders: () => {
          calls.configurable.push([]);
          return Promise.resolve({
            ok: true,
            value: [
              { provider: "deepseek", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [] },
              { provider: "openrouter", displayName: "OpenRouter", settingsNs: "llm-pi-ai", settingsPath: ["providers", "openrouter"] },
            ],
          });
        },
      },
      settings: {
        mutate: (ns, ops, expectedRevision) => {
          calls.mutate.push({ ns, ops, expectedRevision });
          return Promise.resolve({ ok: true, value: { ns, value: { providers: {} } } });
        },
      },
    },
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
    "settings.section#mcp-console",
  ]);
  assert.deepEqual(dictionaries, ["session-id", "llm-headers", "mcp-console"]);

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

  // The api seat is the dual-version facade, not a captured carrier object.
  assert.equal(typeof injected.api.providers, "function");
  assert.equal(typeof injected.api.mutate, "function");
  assert.equal(injected.schema, services.settingsSchema);
  assert.equal(typeof injected.mirror.getSnapshot, "function");
  assert.equal(typeof injected.t, "function");
});

test("the wire face keeps one identity across inject calls", async () => {
  const bundle = await loadBundle();
  const { scope, registered } = contextStub(settingsServices());

  bundle.apply(scope);

  // The section's effect deps key on this object; a fresh facade per call
  // would refetch providers on every render.
  assert.equal(registered[1].inject().api, registered[1].inject().api);
});

test("wireOf serves a 0.1.2 host through the Remote namespaces", async () => {
  const { wireOf } = await loadBundle();
  const services = modernServices();

  const response = await wireOf(scopeOf(services)).providers();

  // Declared rows first with live/dormant state, then routes with no declaration.
  assert.deepEqual(response.result.value.providers, [
    { provider: "deepseek", displayName: "DeepSeek", settingsNs: "llm-deepseek", active: true },
    { provider: "openrouter", displayName: "OpenRouter", settingsNs: "llm-pi-ai", active: false },
    { provider: "codebuddy", displayName: "CodeBuddy", settingsNs: "", active: true },
  ]);
  assert.equal(services.calls.providers.length, 1);
  assert.equal(services.calls.configurable.length, 1);
});

test("wireOf writes through a 0.1.2 host with positional args and a direct Result", async () => {
  const { wireOf } = await loadBundle();
  const services = modernServices();
  const ops = [{ op: "set", path: ["providers", "codebuddy", "headers"], value: { "user-agent": "x" } }];

  const written = await wireOf(scopeOf(services)).mutate("llm-headers", ops, 7);

  assert.deepEqual(services.calls.mutate, [{ ns: "llm-headers", ops, expectedRevision: 7 }]);
  // The facade keeps the 0.1.1 envelope the section body reads.
  assert.equal(written.result.ok, true);
  assert.deepEqual(written.result.value, { ns: "llm-headers", value: { providers: {} } });
});

test("wireOf surfaces a 0.1.2 conflict answer through the shared envelope", async () => {
  const { wireOf } = await loadBundle();
  const services = modernServices();
  services.remote.settings.mutate = () =>
    Promise.resolve({ ok: false, error: { code: "settings-conflict", message: "stale revision" } });

  const written = await wireOf(scopeOf(services)).mutate("llm-headers", [], 1);

  assert.equal(written.result.ok, false);
  assert.equal(written.result.error.code, "settings-conflict");
  assert.equal(written.result.error.message, "stale revision");
});

test("wireOf falls back to connection.api on a 0.1.1 host", async () => {
  const { wireOf } = await loadBundle();
  const calls = { providers: [], mutate: [] };
  const services = {
    connection: {
      api: {
        llm: {
          providers: (payload) => {
            calls.providers.push(payload);
            return Promise.resolve({ result: { ok: true, value: { providers: [
              { provider: "codebuddy", displayName: "CodeBuddy", settingsNs: "llm-headers", active: true },
            ] } } });
          },
        },
        settings: {
          mutate: (payload) => {
            calls.mutate.push(payload);
            return Promise.resolve({ result: { ok: true, value: { ns: payload.ns } } });
          },
        },
      },
    },
  };

  const wire = wireOf(scopeOf(services));
  const response = await wire.providers();
  const written = await wire.mutate("llm-headers", [{ op: "set", path: [], value: 1 }], 3);

  // Passes the 0.1.1 payloads through untouched, envelope already correct.
  assert.deepEqual(calls.providers, [{}]);
  assert.deepEqual(calls.mutate, [{ ns: "llm-headers", ops: [{ op: "set", path: [], value: 1 }], expectedRevision: 3 }]);
  assert.deepEqual(response.result.value.providers, [
    { provider: "codebuddy", displayName: "CodeBuddy", settingsNs: "llm-headers", active: true },
  ]);
  assert.deepEqual(written.result.value, { ns: "llm-headers" });
});

test("wireOf prefers the Remote namespaces when both carriers exist", async () => {
  const { wireOf } = await loadBundle();
  const services = modernServices();
  services.connection = {
    api: {
      llm: { providers: () => { throw new Error("legacy carrier must stay untouched"); } },
      settings: { mutate: () => { throw new Error("legacy carrier must stay untouched"); } },
    },
  };

  const response = await wireOf(scopeOf(services)).providers();

  assert.equal(response.result.ok, true);
  assert.equal(services.calls.providers.length, 1);
});

test("wireOf reaches namespaces installed as their own remote.<name> services", async () => {
  const { wireOf } = await loadBundle();
  const services = modernServices();
  // A build that installs namespaces as standalone services, not members.
  services["remote.llm"] = services.remote.llm;
  services["remote.settings"] = services.remote.settings;
  services.remote = undefined;

  const response = await wireOf(scopeOf(services)).providers();

  assert.equal(response.result.ok, true);
  assert.equal(services["remote.llm"] !== undefined && response.result.value.providers.length, 3);
});

test("wireOf rejects with a named carrier when a host serves neither", async () => {
  const { wireOf } = await loadBundle();
  const wire = wireOf(scopeOf({ connection: { api: {} } }));

  await assert.rejects(wire.providers(), /no provider wire/);
  await assert.rejects(wire.mutate("llm-headers", [], 1), /no settings wire/);
});

test("providerRowsOf joins the directory with live routes", async () => {
  const { providerRowsOf } = await loadBundle();

  const rows = providerRowsOf(
    [{ id: "deepseek", name: "DeepSeek" }, { id: "bare", name: "" }],
    [{ provider: "deepseek", displayName: "DeepSeek", settingsNs: "llm-deepseek" }],
  );

  assert.deepEqual(rows, [
    { provider: "deepseek", displayName: "DeepSeek", settingsNs: "llm-deepseek", active: true },
    // A live route with no declaration falls back to its id for the name.
    { provider: "bare", displayName: "bare", settingsNs: "", active: true },
  ]);
});

test("the badge still mounts on a host with no settings surface", async () => {
  const bundle = await loadBundle();
  const { scope, registered } = contextStub({});

  bundle.apply(scope);

  // Deferring on the settings services rather than declaring them in `inject`
  // is what keeps this true. (The stub's slots.inject fires immediately, so
  // the mcp-console section registers here too; on a real host without a
  // settings page its slot is never declared and it never mounts.)
  assert.deepEqual(registered.map((entry) => entry.id), ["dsh-session-id", "mcp-console"]);
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
