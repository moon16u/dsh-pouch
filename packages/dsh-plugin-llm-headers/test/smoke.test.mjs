import assert from "node:assert/strict";
import { test } from "node:test";

import { Config, headerForcingProvider, name, overrideHeaders, resolveProfile } from "../lib/index.js";

const CODEBUDDY_UA = "CLI/unknown CodeBuddy/2.137.1";
const HARNESS_UA = "deepseek-harness/0.1.2-rc.1 (+https://github.com/deepseek-ai/deepseek-harness)";

/** Stand-in for the launcher's environment snapshot. */
function env(vars = {}) {
  return { get: (variable) => (variable in vars ? { value: vars[variable] } : void 0) };
}

function codebuddyRoute(extra = {}) {
  return {
    api: "openai-completions",
    baseURL: "https://copilot.tencent.com/v2",
    apiKeyEnv: "CODEBUDDY_API_KEY",
    headers: { "user-agent": CODEBUDDY_UA },
    compat: { supportsDeveloperRole: false, maxTokensField: "max_tokens" },
    models: [{
      id: "deepseek-v4-flash",
      name: "Deepseek-V4-Flash",
      contextWindow: 660000,
      maxTokens: 50000,
      reasoningEfforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    }],
    ...extra,
  };
}

/** Record what a wrapped provider was ultimately called with. */
function recordingProvider() {
  const calls = [];
  const capture = (kind) => (model, context, options) => {
    calls.push({ kind, model, context, options });
    return `${kind}-stream`;
  };
  return { calls, provider: { id: "rec", name: "rec", stream: capture("stream"), streamSimple: capture("streamSimple") } };
}

test("overrideHeaders replaces a reserved header instead of duplicating its spelling", () => {
  const merged = overrideHeaders({ "User-Agent": HARNESS_UA, accept: "text/event-stream" }, { "user-agent": CODEBUDDY_UA });

  // The case fold is the assertion that matters: leaving both spellings in the
  // record makes fetch send one comma-joined User-Agent, which the gateway
  // rejects exactly like the un-overridden one.
  assert.deepEqual(Object.keys(merged).sort(), ["accept", "user-agent"]);
  assert.equal(merged["user-agent"], CODEBUDDY_UA);
  assert.equal(merged.accept, "text/event-stream");
});

test("overrideHeaders lowercases override names and keeps everything else verbatim", () => {
  const merged = overrideHeaders({ "X-Keep": "kept" }, { "X-Product": "SaaS" });

  assert.deepEqual(merged, { "X-Keep": "kept", "x-product": "SaaS" });
});

test("overrideHeaders drops a header whose override is null, whatever its spelling", () => {
  const merged = overrideHeaders({ "X-Session-Id": "abc", accept: "application/json" }, { "x-session-id": null });

  assert.deepEqual(merged, { accept: "application/json" });
});

test("headerForcingProvider forces the streamed model's map on both entry points", () => {
  const { calls, provider } = recordingProvider();
  const forced = headerForcingProvider(provider, new Map([["m", { "user-agent": CODEBUDDY_UA }]]));
  const model = { id: "m" };

  assert.equal(forced.stream(model, "c", { headers: { "user-agent": HARNESS_UA }, apiKey: "k" }), "stream-stream");
  assert.equal(forced.streamSimple(model, "c", { headers: { "User-Agent": HARNESS_UA } }), "streamSimple-stream");

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.context, "c");
    assert.equal(call.options.headers["user-agent"], CODEBUDDY_UA);
    assert.equal(Object.keys(call.options.headers).length, 1);
  }
  // Every other stream option must survive the wrap untouched.
  assert.equal(calls[0].options.apiKey, "k");
});

test("headerForcingProvider reads the map of the model being streamed", () => {
  const { calls, provider } = recordingProvider();
  // Resolution has already merged each model's map, so the wrap only selects:
  // a model with no entry is streamed with its options untouched.
  const forced = headerForcingProvider(provider, new Map([
    ["special", { "user-agent": CODEBUDDY_UA, "x-route": "special" }],
  ]));

  forced.streamSimple({ id: "special" }, "c", { headers: { "user-agent": HARNESS_UA } });
  forced.streamSimple({ id: "ordinary" }, "c", { headers: { "user-agent": HARNESS_UA } });

  assert.deepEqual(calls[0].options.headers, { "user-agent": CODEBUDDY_UA, "x-route": "special" });
  assert.deepEqual(calls[1].options.headers, { "user-agent": HARNESS_UA });
});

test("headerForcingProvider tolerates a call with no options at all", () => {
  const { calls, provider } = recordingProvider();

  headerForcingProvider(provider, new Map([["m", { "user-agent": CODEBUDDY_UA }]])).streamSimple({ id: "m" }, "c");

  assert.deepEqual(calls[0].options.headers, { "user-agent": CODEBUDDY_UA });
});

test("headerForcingProvider returns the base provider unchanged when nothing is configured", () => {
  const { provider } = recordingProvider();

  assert.equal(headerForcingProvider(provider, new Map()), provider);
});

test("resolveProfile builds a pi-ai provider whose dispatch forces the configured headers", () => {
  const profile = resolveProfile("codebuddy", codebuddyRoute(), env());

  assert.equal(profile.provider, "codebuddy");
  assert.equal(profile.displayName, "codebuddy");
  assert.equal(profile.piProvider.baseUrl, "https://copilot.tencent.com/v2");
  assert.equal(profile.headers["user-agent"], CODEBUDDY_UA);
  assert.equal(typeof profile.piProvider.stream, "function");
  assert.equal(typeof profile.piProvider.streamSimple, "function");
});

test("resolveProfile carries the model catalog and reasoning map pi-ai needs", () => {
  const profile = resolveProfile("codebuddy", codebuddyRoute(), env());
  const [model] = profile.piProvider.getModels();

  assert.equal(model.id, "deepseek-v4-flash");
  assert.equal(model.name, "Deepseek-V4-Flash");
  assert.equal(model.provider, "codebuddy");
  assert.equal(model.api, "openai-completions");
  assert.equal(model.contextWindow, 660000);
  assert.equal(model.maxTokens, 50000);
  assert.deepEqual(model.input, ["text"]);
  assert.equal(model.reasoning, true);

  // Undeclared levels are pinned to null rather than left absent: pi-ai reads an
  // absent key as supported for the five base levels but unsupported for
  // xhigh/max, so only a complete map offers exactly the configured levels.
  assert.equal(model.thinkingLevelMap.minimal, null);
  assert.equal(model.thinkingLevelMap.max, "max");
  assert.equal(model.thinkingLevelMap.off, null);

  // A configured maxTokens is also this model's per-request default.
  assert.equal(profile.configuredMaxTokens.get("deepseek-v4-flash"), 50000);
});

test("resolveProfile merges route compat under per-model compat", () => {
  const route = codebuddyRoute();
  route.models[0].compat = { maxTokensField: "max_completion_tokens" };

  const [model] = resolveProfile("codebuddy", route, env()).piProvider.getModels();

  assert.equal(model.compat.supportsDeveloperRole, false);
  assert.equal(model.compat.maxTokensField, "max_completion_tokens");
});

test("resolveProfile defaults an unsized declared model and marks it non-reasoning", () => {
  const profile = resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    models: [{ id: "plain" }],
  }, env());
  const [model] = profile.piProvider.getModels();

  assert.equal(model.contextWindow, 262144);
  assert.equal(model.maxTokens, 32768);
  assert.equal(model.reasoning, false);
  assert.equal("thinkingLevelMap" in model, false);
  assert.equal("compat" in model, false);
  // A capability inherited from a default must not become a request cap.
  assert.equal(profile.configuredMaxTokens.size, 0);
});

test("resolveProfile interpolates ${env:NAME} anywhere in a header value", () => {
  const profile = resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    headers: {
      "x-tenant": "${env:TENANT_ID}",
      authorization: "Bearer ${env:GATEWAY_TOKEN}",
      "x-pair": "${env:TENANT_ID}/${env:GATEWAY_TOKEN}",
      "x-fixed": "literal",
    },
    models: [{ id: "m" }],
  }, env({ TENANT_ID: "tenant-42", GATEWAY_TOKEN: "t0k3n" }));

  assert.equal(profile.headers["x-tenant"], "tenant-42");
  // The embedded form is the one that matters: a bare value cannot express a scheme prefix.
  assert.equal(profile.headers.authorization, "Bearer t0k3n");
  assert.equal(profile.headers["x-pair"], "tenant-42/t0k3n");
  assert.equal(profile.headers["x-fixed"], "literal");
});

test("resolveProfile refuses an unset ${env:NAME} without echoing any value", () => {
  assert.throws(() => resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    headers: { authorization: "Bearer ${env:MISSING_TOKEN}" },
    models: [{ id: "m" }],
  }, env({ PRESENT: "s3cret" })), (error) => {
    assert.match(error.message, /header "authorization" references \$\{env:MISSING_TOKEN\}/);
    // Nothing resolvable may leak into the diagnosis.
    assert.equal(error.message.includes("s3cret"), false);
    return true;
  });

  assert.throws(() => resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    headers: { "x-tenant": "${env:NOT_SET}" },
    models: [{ id: "m" }],
  }, env()), /references \$\{env:NOT_SET\}, which the launching environment does not set/);
});

test("resolveProfile accepts a per-model header map without disturbing the route's", () => {
  const profile = resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    headers: { "x-tenant": "${env:TENANT_ID}" },
    models: [{ id: "special", headers: { "x-route": "${env:ROUTE_TAG}" } }, { id: "plain" }],
  }, env({ TENANT_ID: "tenant-42", ROUTE_TAG: "beta" }));

  // `profile.headers` stays the route-wide map; what each model actually sends
  // is asserted end-to-end in wire.test.mjs, which can observe the socket.
  assert.deepEqual(profile.headers, { "x-tenant": "tenant-42" });
  assert.deepEqual(profile.piProvider.getModels().map((model) => model.id), ["special", "plain"]);
});

test("resolveProfile refuses to remove the attribution header", () => {
  const attempt = (headers) => () => resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    headers,
    models: [{ id: "m" }],
  }, env());

  // Replacing the harness identity is the point; going unidentified is not.
  assert.throws(attempt({ "user-agent": null }), /removes the "user-agent" header/);
  assert.throws(attempt({ "User-Agent": null }), /removes the "user-agent" header/);
  // Any other header may be removed outright.
  assert.doesNotThrow(attempt({ "x-session-id": null }));
});

test("resolveProfile serves a whole pi-ai catalog route from headers alone", () => {
  const profile = resolveProfile("deepseek", {
    apiKeyEnv: "DEEPSEEK_API_KEY",
    headers: { "user-agent": "my-gateway/1.0" },
  }, env());

  const models = profile.piProvider.getModels();
  assert.ok(models.length > 0, "the installed catalog should supply the models");
  for (const model of models) {
    assert.equal(model.provider, "deepseek");
    // Endpoint and protocol come from the catalog, not from configuration.
    assert.equal(typeof model.api, "string");
    assert.equal(typeof model.baseUrl, "string");
  }
  assert.equal(profile.headers["user-agent"], "my-gateway/1.0");
});

test("resolveProfile narrows a catalog route with modelOverrides", () => {
  const full = resolveProfile("deepseek", { apiKeyEnv: "DEEPSEEK_API_KEY" }, env());
  const first = full.piProvider.getModels()[0];

  const profile = resolveProfile("deepseek", {
    apiKeyEnv: "DEEPSEEK_API_KEY",
    headers: { "x-product": "SaaS" },
    modelOverrides: { [first.id]: { name: "Renamed", contextWindow: 4096 } },
  }, env());

  const model = profile.piProvider.getModels().find((entry) => entry.id === first.id);
  assert.equal(model.name, "Renamed");
  assert.equal(model.contextWindow, 4096);
  // Untouched entries keep serving.
  assert.equal(profile.piProvider.getModels().length, full.piProvider.getModels().length);
  // The rest of the descriptor is still the catalog's.
  assert.equal(model.api, first.api);
  assert.equal(model.maxTokens, first.maxTokens);
});

test("resolveProfile keeps a catalog route's own auth when it needs no harness key", () => {
  const ambient = resolveProfile("deepseek", { headers: { "x-product": "SaaS" } }, env());

  assert.equal(typeof ambient.piProvider.auth.apiKey, "object");
  assert.equal(ambient.apiKeyEnv, void 0);
});

test("resolveProfile refuses modelOverrides beside a models list", () => {
  assert.throws(() => resolveProfile("deepseek", {
    modelOverrides: { "deepseek-v4-flash": { name: "x" } },
    models: [{ id: "deepseek-v4-flash" }],
  }, env()), /beside a models list/);
});

test("resolveProfile refuses modelOverrides on a route pi-ai does not ship", () => {
  assert.throws(() => resolveProfile("gateway", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    modelOverrides: { m: { name: "x" } },
  }, env()), /pi-ai does not ship this route/);
});

test("resolveProfile refuses modelOverrides naming an unknown catalog model", () => {
  assert.throws(() => resolveProfile("deepseek", {
    modelOverrides: { "not-a-model": { name: "x" } },
  }, env()), /which pi-ai's catalog does not describe/);
});

test("resolveProfile refuses a declared route that serves nothing", () => {
  assert.throws(() => resolveProfile("empty", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
  }, env()), (error) => {
    assert.match(error.message, /^llm-headers: provider "empty" resolves no models/);
    return true;
  });
});

test("resolveProfile refuses a declared route with no api or baseURL", () => {
  assert.throws(() => resolveProfile("gateway", {
    baseURL: "https://example.invalid/v1",
    models: [{ id: "m" }],
  }, env()), /needs an api/);

  assert.throws(() => resolveProfile("gateway", {
    api: "openai-completions",
    models: [{ id: "m" }],
  }, env()), /needs a baseURL/);
});

test("resolveProfile refuses a duplicated model id", () => {
  assert.throws(() => resolveProfile("twice", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    models: [{ id: "dup" }, { id: "dup" }],
  }, env()), /lists model "dup" more than once/);
});

test("resolveProfile refuses reasoningEfforts that offer nothing but off", () => {
  assert.throws(() => resolveProfile("offonly", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    models: [{ id: "m", reasoningEfforts: { off: null } }],
  }, env()), /offers no level beyond "off"/);
});

test("resolveProfile refuses a thinking level with no wire spelling", () => {
  assert.throws(() => resolveProfile("nowire", {
    api: "openai-completions",
    baseURL: "https://example.invalid/v1",
    models: [{ id: "m", reasoningEfforts: { high: null } }],
  }, env()), /reasoningEfforts\.high needs the wire value/);
});

test("Config defaults an omitted section to no routes", () => {
  assert.deepEqual(Config({}).providers, {});
  assert.equal(name, "llm-headers");
});

test("Config leaves api and baseURL unset so a catalog route can inherit them", () => {
  const resolved = Config({ providers: { deepseek: { headers: { "x-product": "SaaS" } } } });

  assert.equal(resolved.providers.deepseek.api, void 0);
  assert.equal(resolved.providers.deepseek.baseURL, void 0);
  assert.deepEqual(resolved.providers.deepseek.models, []);
  assert.deepEqual(resolved.providers.deepseek.modelOverrides, {});
});
