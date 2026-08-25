import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { LlmError, assertUsableApiKey, attributionHeaders, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { createProvider } from "@earendil-works/pi-ai";
import { builtinProviders, getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";

export const name = "llm-headers";
export const inject = ["llm", "settings"];

export const LLM_HEADERS_SETTINGS_NAMESPACE = settingsNamespace("llm-headers");

/**
 * Wire protocols a route may name when pi-ai's catalog does not already
 * describe it. The same three `dsh-llm-pi-ai` offers a hand-declared route, for
 * the same reason: they are the ones a key, an endpoint, and headers fully
 * describe. Bedrock, Vertex, Azure, and Codex authenticate through material
 * this configuration shape cannot express — but a *catalog* route reaches them
 * anyway, because it keeps the installed provider's own implementations.
 */
const PROTOCOLS = {
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
  "anthropic-messages": anthropicMessagesApi,
};

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** A hand-declared model has no published price; the seam still wants the shape. */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// dsh-llm-pi-ai resolves these same defaults, but does not export them at
// runtime (only `Config`, `PiAiAdapter`, `supportedProtocols`, `recordKeyFor`).
// Restated here so a route this plugin owns is sized exactly like one the stock
// adapter owns; drift shows up as a different context window, not as a crash.
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
const DEFAULT_CONTEXT_WINDOW = 262144;
const DEFAULT_MAX_TOKENS = 32768;

/** `${env:NAME}` — substituted anywhere in a header value, so `Bearer ${env:TOKEN}` works. */
const ENV_REFERENCE = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

let catalogIndex;

/** pi-ai's installed providers by id, built once. */
function catalogProvider(provider) {
  catalogIndex ??= new Map(builtinProviders().map((entry) => [entry.id, entry]));
  return catalogIndex.get(provider);
}

/** The installed catalog's models for one route, keyed by id; empty when pi-ai does not ship it. */
function catalogModels(provider) {
  if (catalogProvider(provider) === void 0) return new Map();
  return new Map(getBuiltinModels(provider).map((model) => [model.id, model]));
}

/** A header value: a literal, a `${env:NAME}` reference, or null to remove the header. */
const headerValue = z.union([z.string(), z.const(null)]);
const headerMap = z.dict(headerValue);
const compatSwitch = z.union([z.boolean(), z.string()]);

const modelFields = {
  name: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union([z.const("text"), z.const("image")])),
  reasoningEfforts: z.union([
    z.const(false),
    z.dict(z.union([z.string(), z.const(null)]), z.union(THINKING_LEVELS)),
  ]),
  compat: z.dict(compatSwitch),
  /** Headers for this model alone, merged over the route's. */
  headers: headerMap,
};

const modelProfile = z.object({ id: z.string().required(), ...modelFields });
/** The same fields a `models` entry takes, with the id living in the dict key. */
const modelOverride = z.object(modelFields);

const providerProfile = z.object({
  displayName: z.string(),
  apiKeyEnv: z.string().role("credential-ref"),
  /**
   * Wire protocol. Omission keeps each installed catalog model's own protocol,
   * which is why a catalog route needs none; a route pi-ai does not ship must
   * name one.
   */
  api: z.union(Object.keys(PROTOCOLS)),
  /** Endpoint. Omission keeps the installed catalog's; a declared route needs one. */
  baseURL: z.string(),
  /**
   * Request headers for this route. Unlike `llm-pi-ai.providers.*.headers`,
   * these win — including the names the harness reserves for itself.
   */
  headers: headerMap.default({}),
  /** This route's catalog. Omission serves the installed one. */
  models: z.array(modelProfile).default([]),
  /** Installed-catalog customizations by model id; only meaningful beside no `models` list. */
  modelOverrides: z.dict(modelOverride).default({}),
  compat: z.dict(compatSwitch),
  reasoning: z.union(THINKING_LEVELS),
  timeoutMs: z.number().step(1).min(1),
  streamIdleTimeoutMs: z.number().step(1).min(1).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
});

export const Config = z.object({
  providers: z.dict(providerProfile).default({}),
});

/** Fail one route's resolution, naming the setting to fix. */
function invalid(provider, message) {
  throw new Error(`${name}: provider "${provider}" ${message}`);
}

/**
 * Resolve a configured header map into literals, keeping `null` as the removal
 * marker.
 *
 * A `${env:NAME}` reference reads the launcher's environment snapshot — the same
 * place a credential reference resolves from — so a machine-specific or secret
 * header value stays out of `settings.yaml`. Substitution happens anywhere in
 * the value, which is what makes `Bearer ${env:TOKEN}` expressible. Resolution
 * happens here rather than per request because that snapshot is fixed for the
 * process lifetime; a changed variable takes effect on the next DSH start.
 *
 * @param provider - route key, for diagnostics.
 * @param where - what is being resolved, for diagnostics.
 * @param headers - the configured map.
 * @param env - the launch environment snapshot.
 * @returns the map with references substituted.
 */
function resolveHeaderValues(provider, where, headers, env) {
  const resolved = {};
  for (const [header, value] of Object.entries(headers ?? {})) {
    if (value === null) {
      resolved[header] = null;
      continue;
    }
    let missing;
    const substituted = value.replace(ENV_REFERENCE, (_reference, variable) => {
      const entry = env?.get(variable);
      if (entry === void 0 || entry.value.length === 0) {
        missing ??= variable;
        return "";
      }
      return entry.value;
    });
    // The variable name is named, never the value or the substituted result: a
    // header may legitimately carry a secret, and echoing one into a startup log
    // is the failure this diagnosis exists to avoid.
    if (missing !== void 0) {
      invalid(provider, `${where} header "${header}" references \${env:${missing}}, which the launching environment does not set`);
    }
    resolved[header] = substituted;
  }
  return resolved;
}

/**
 * Refuse a header map that would leave a request unattributed.
 *
 * Replacing the harness identity is this plugin's purpose; deleting it is not.
 * Every request still says what it is — the value is the deployment's to choose,
 * its presence is not. The reserved names come from `attributionHeaders()` so
 * this stays correct if the harness ever sends more than one.
 *
 * @param provider - route key, for diagnostics.
 * @param headers - the resolved header map.
 */
function assertAttributed(provider, headers) {
  for (const reserved of Object.keys(attributionHeaders())) {
    for (const [header, value] of Object.entries(headers)) {
      if (value === null && header.toLowerCase() === reserved) {
        invalid(provider, `removes the "${reserved}" header; set it to the identity the endpoint expects instead of null`);
      }
    }
  }
}

/**
 * Merge `overrides` over `existing` so the override wins by header *name*,
 * case-insensitively, with `null` removing the header outright.
 *
 * The case fold is the subtle half rather than tidiness. HTTP field names are
 * case-insensitive, but a plain object is not: leaving both `user-agent` and
 * `User-Agent` in the record makes fetch send the two values combined into one
 * comma-separated field, which is not the override anyone asked for. This is
 * `dsh-llm-pi-ai`'s own `requestHeaders()` discipline with the winner reversed.
 *
 * @param existing - headers assembled by the layers above.
 * @param overrides - this route's resolved headers.
 * @returns the merged record, override names lowercased.
 */
export function overrideHeaders(existing, overrides) {
  const shadowed = new Set(Object.keys(overrides).map((header) => header.toLowerCase()));
  const merged = {};
  for (const [header, value] of Object.entries(existing ?? {})) {
    if (!shadowed.has(header.toLowerCase())) merged[header] = value;
  }
  for (const [header, value] of Object.entries(overrides)) {
    if (value !== null) merged[header.toLowerCase()] = value;
  }
  return merged;
}

/**
 * Wrap a pi-ai provider so this route's headers get the last word.
 *
 * This is the entire reason the plugin exists. Every layer above already ran:
 * `dsh-llm-pi-ai` builds the request's headers with `requestHeaders()`, which
 * drops a configured `user-agent` and appends the harness's own attribution
 * last, and pi-ai's `applyAuth` then merges auth headers under those. The
 * provider's own `stream`/`streamSimple` are the final stop before the HTTP
 * client is built, so overriding here reaches the wire and nothing else in the
 * chain can.
 *
 * Wrapping the *provider* rather than the protocol implementation is what lets
 * a route pi-ai already ships keep its own API implementations — Bedrock loads
 * its Smithy module through a separate entry point and cannot be rebuilt from
 * parts — while still carrying deployment headers.
 *
 * Needed because some gateways gate on client identity: Tencent CodeBuddy
 * answers `500 {"code":11128,"msg":"request illegal"}` to a streaming request
 * carrying the harness `User-Agent`, and 200 to the identical request carrying
 * its own CLI's.
 *
 * @param base - the provider to wrap.
 * @param headers - each model's resolved header map, by model id.
 * @returns a provider equivalent to `base` but header-forcing.
 */
export function headerForcingProvider(base, headers) {
  if (headers.size === 0) return base;
  const force = (model, options) => {
    const forced = headers.get(model.id);
    if (forced === void 0) return options;
    return { ...options, headers: overrideHeaders(options?.headers, forced) };
  };
  return {
    ...base,
    stream: (model, context, options) => base.stream(model, context, force(model, options)),
    streamSimple: (model, context, options) => base.streamSimple(model, context, force(model, options)),
  };
}

/**
 * Translate a configured effort dict into pi-ai's `thinkingLevelMap`.
 *
 * Mirrors `dsh-llm-pi-ai`'s translation, including why it pins undeclared
 * levels to `null`: pi-ai's own defaulting is asymmetric — an absent key reads
 * as supported for the five base levels but unsupported for `xhigh`/`max` — so
 * declaring the map completely is what makes the picker offer exactly the
 * levels configuration named. A declared `off` with no value stays absent,
 * which pi-ai reads as "supported, send nothing".
 *
 * @param provider - route key, for diagnostics.
 * @param id - model id, for diagnostics.
 * @param efforts - the configured dict, `false`, or nothing.
 * @param base - the installed catalog entry of the same id, when one exists.
 * @returns the reasoning fields the materialized model carries.
 */
function modelReasoning(provider, id, efforts, base) {
  if (efforts === void 0) {
    return base?.reasoning
      ? { reasoning: true, ...(base.thinkingLevelMap === void 0 ? {} : { thinkingLevelMap: { ...base.thinkingLevelMap } }) }
      : { reasoning: false };
  }
  if (efforts === false) return { reasoning: false };
  const declared = THINKING_LEVELS.filter((level) => efforts[level] !== void 0);
  if (declared.length === 0) {
    invalid(provider, `model "${id}" has an empty reasoningEfforts; declare the offered levels, or set false for a non-reasoning model`);
  }
  for (const level of declared) {
    const wire = efforts[level];
    if (wire === null) {
      if (level !== "off") invalid(provider, `model "${id}" reasoningEfforts.${level} needs the wire value dispatch should send; only "off" may leave it empty`);
    } else if (wire.length === 0) {
      invalid(provider, `model "${id}" reasoningEfforts.${level} must not be an empty string`);
    }
  }
  if (!declared.some((level) => level !== "off")) {
    invalid(provider, `model "${id}" reasoningEfforts offers no level beyond "off"; declare a thinking level, or set reasoningEfforts to false`);
  }
  const map = {};
  for (const level of THINKING_LEVELS) {
    const wire = efforts[level];
    if (wire === void 0) map[level] = null;
    else if (wire !== null) map[level] = wire;
  }
  return { reasoning: true, thinkingLevelMap: map };
}

/** The protocol every installed model on a route agrees on, when they do. */
function sharedCatalogApi(defaults) {
  const apis = new Set([...defaults.values()].map((model) => model.api));
  return apis.size === 1 ? [...apis][0] : void 0;
}

/**
 * Drop the model's own catalog headers that this route removed with `null`.
 *
 * The override map alone cannot unset them. pi-ai's client seeds its defaults
 * from `model.headers` and *then* merges the request map over, so a name simply
 * absent from the request map keeps whatever the catalog put there — a removal
 * has to happen on the descriptor. What a lower layer adds later (pi-ai's
 * session-affinity headers, an auth method's own) is instead removed by the
 * request-map merge, which is why both halves exist.
 *
 * @param model - the materialized model descriptor, mutated in place.
 * @param headers - this model's resolved header map, `null` marking removals.
 */
function stripRemovedHeaders(model, headers) {
  const removed = new Set(Object.entries(headers).flatMap(([header, value]) => (value === null ? [header.toLowerCase()] : [])));
  if (removed.size === 0 || model.headers === void 0) return;
  const kept = Object.fromEntries(Object.entries(model.headers).filter(([header]) => !removed.has(header.toLowerCase())));
  if (Object.keys(kept).length > 0) model.headers = kept;
  else delete model.headers;
}

/**
 * Materialize one route's pi-ai model descriptors.
 *
 * A route pi-ai ships inherits that catalog: omitting `models` serves it whole,
 * `modelOverrides` reshapes named entries, and a `models` list replaces it —
 * each entry still defaulting its unset fields from the installed model of the
 * same id. A route pi-ai has never heard of spells every model out.
 *
 * @param provider - route key.
 * @param profile - the resolved route profile.
 * @param env - the launch environment snapshot, for header references.
 * @returns descriptors, explicitly configured caps, and per-model header maps.
 */
function routeModels(provider, profile, env) {
  const defaults = catalogModels(provider);
  const catalogBaseUrl = catalogProvider(provider)?.baseUrl;
  const overrides = profile.modelOverrides;

  for (const id of Object.keys(overrides)) {
    if (id.length === 0) invalid(provider, "has a modelOverrides entry with an empty model id");
    if (defaults.size === 0) invalid(provider, `sets modelOverrides for "${id}", but pi-ai does not ship this route; a declared route spells every model out in its models list`);
    if (profile.models.length > 0) invalid(provider, `sets modelOverrides for "${id}" beside a models list; models already replaces the served catalog, so declare the fields on its entries`);
    if (!defaults.has(id)) invalid(provider, `modelOverrides names "${id}", which pi-ai's catalog does not describe`);
  }

  const entries = profile.models.length > 0
    ? profile.models
    : [...defaults.values()].map((model) => ({ id: model.id, ...overrides[model.id] }));
  if (entries.length === 0) {
    invalid(provider, "resolves no models; pi-ai does not ship this route, so its models must be listed in configuration");
  }

  const routeApi = sharedCatalogApi(defaults);
  const seen = new Set();
  const configuredMaxTokens = new Map();
  const modelHeaders = new Map();

  const models = entries.map((entry) => {
    if (entry.id.length === 0) invalid(provider, "has a model with an empty id");
    if (seen.has(entry.id)) invalid(provider, `lists model "${entry.id}" more than once`);
    seen.add(entry.id);

    const base = defaults.get(entry.id);
    const api = profile.api ?? base?.api ?? routeApi;
    if (api === void 0) invalid(provider, `model "${entry.id}" needs an api; pi-ai does not describe it, so set the route's api to the wire protocol its endpoint speaks`);
    const baseUrl = profile.baseURL ?? base?.baseUrl ?? catalogBaseUrl;
    if (baseUrl === void 0) invalid(provider, `model "${entry.id}" needs a baseURL; pi-ai does not ship this route`);
    if (entry.maxTokens !== void 0) configuredMaxTokens.set(entry.id, entry.maxTokens);

    // Each model's effective map is the route's with its own merged over.
    const where = entry.headers !== void 0 && Object.keys(entry.headers).length > 0 ? `model "${entry.id}"` : "route";
    const effective = resolveHeaderValues(provider, where, { ...profile.headers, ...entry.headers }, env);
    assertAttributed(provider, effective);
    if (Object.keys(effective).length > 0) modelHeaders.set(entry.id, effective);

    const compat = { ...(base?.api === api ? base.compat : void 0), ...profile.compat, ...entry.compat };
    const reasoning = modelReasoning(provider, entry.id, entry.reasoningEfforts, base);
    const model = {
      ...base,
      id: entry.id,
      name: entry.name ?? base?.name ?? entry.id,
      api,
      provider,
      baseUrl,
      input: entry.input !== void 0 && entry.input.length > 0 ? [...entry.input] : base?.input === void 0 ? ["text"] : [...base.input],
      cost: base?.cost ?? { ...NO_COST },
      contextWindow: entry.contextWindow ?? base?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: entry.maxTokens ?? base?.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...reasoning,
    };
    // Spreading `base` inherits fields this route may have just contradicted:
    // an installed compat block belongs to the protocol it was written for, and
    // a thinking map means nothing on a model declared non-reasoning.
    if (Object.keys(compat).length > 0) model.compat = compat;
    else delete model.compat;
    if (!model.reasoning) delete model.thinkingLevelMap;
    stripRemovedHeaders(model, effective);
    return model;
  });

  return { models, configuredMaxTokens, modelHeaders };
}

/**
 * Api-key auth for a route the harness authenticates itself.
 *
 * Copied in shape from `dsh-llm-pi-ai`'s `harnessApiKeyAuth`, which is not
 * exported: the harness resolves the credential before the request enters
 * pi-ai and hands it over as the `apiKey` stream option, which pi-ai presents
 * back here as the credential key. Declaring the method at all is also what
 * makes pi-ai honour that override.
 *
 * @param displayName - label used as the resolution's source.
 * @returns the api-key auth method for this route.
 */
function harnessApiKeyAuth(displayName) {
  return {
    name: displayName,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
      source: displayName,
    }),
  };
}

/**
 * The auth one route resolves its credential through.
 *
 * A route pi-ai ships keeps that provider's own auth, which is what preserves
 * provider-native ambient discovery for a profile naming no credential. The
 * single addition covers a catalog provider offering no api-key method at all:
 * pi-ai honours a request's `apiKey` override only when the provider declares
 * one, so an OAuth-only route would otherwise refuse a configured key.
 *
 * @param displayName - label used as the resolution's source.
 * @param namesCredential - whether the profile configured an `apiKeyEnv`.
 * @param catalog - pi-ai's provider for this route, when it ships one.
 * @returns the auth to build the provider with.
 */
function routeAuth(displayName, namesCredential, catalog) {
  if (catalog === void 0) return { apiKey: harnessApiKeyAuth(displayName) };
  if (catalog.auth.apiKey !== void 0 || !namesCredential) return catalog.auth;
  return { ...catalog.auth, apiKey: harnessApiKeyAuth(displayName) };
}

/**
 * Build the pi-ai provider for one route.
 *
 * A route pi-ai ships is *reused* rather than rebuilt: the installed provider
 * owns API implementations this package cannot reconstruct, so dispatch stays
 * with it and only the identity, endpoint, models, and auth are this route's.
 * Catalog-owned dynamic refresh is dropped — the settings document is this
 * route's catalog, and a background refresh would contradict it.
 */
function buildProvider(provider, profile, displayName, models) {
  const catalog = catalogProvider(provider);
  const auth = routeAuth(displayName, profile.apiKeyEnv !== void 0, catalog);
  const baseUrl = profile.baseURL ?? catalog?.baseUrl;
  if (catalog !== void 0) {
    return {
      id: provider,
      name: displayName,
      ...(baseUrl === void 0 ? {} : { baseUrl }),
      auth,
      getModels: () => models,
      stream: (model, context, options) => catalog.stream(model, context, options),
      streamSimple: (model, context, options) => catalog.streamSimple(model, context, options),
    };
  }
  return createProvider({
    id: provider,
    name: displayName,
    baseUrl,
    auth,
    models,
    api: PROTOCOLS[profile.api](),
  });
}

/**
 * Build the adapter profile for one configured route.
 *
 * @param provider - route key.
 * @param source - the route's configured profile.
 * @param env - the launch environment snapshot, for `${env:NAME}` header values.
 * @returns a resolved profile shaped for `PiAiAdapter`.
 */
export function resolveProfile(provider, source, env) {
  const profile = providerProfile(source);
  const displayName = profile.displayName ?? provider;
  if (profile.api !== void 0 && PROTOCOLS[profile.api] === void 0) {
    invalid(provider, `names api "${profile.api}"; supported protocols are ${Object.keys(PROTOCOLS).join(", ")}`);
  }

  const routeHeaders = resolveHeaderValues(provider, "route", profile.headers, env);
  assertAttributed(provider, routeHeaders);

  const { models, configuredMaxTokens, modelHeaders } = routeModels(provider, profile, env);

  return {
    provider,
    displayName,
    ...(profile.apiKeyEnv === void 0 ? {} : { apiKeyEnv: credentialRef(profile.apiKeyEnv) }),
    headers: routeHeaders,
    ...(profile.reasoning === void 0 ? {} : { reasoning: profile.reasoning }),
    ...(profile.timeoutMs === void 0 ? {} : { timeoutMs: profile.timeoutMs }),
    streamIdleTimeoutMs: profile.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(void 0, `${name}: provider "${provider}" retryPolicy`),
    configuredMaxTokens,
    // The headers reach the wire from here, not from `profile.headers`: the
    // adapter runs that field through `requestHeaders()`, which is exactly what
    // this plugin exists to outrank. The field above is still set so a reader
    // of the resolved profile sees the same intent.
    piProvider: headerForcingProvider(buildProvider(provider, profile, displayName, models), modelHeaders),
  };
}

let activeRules = [];

export function setFetchHeaderRules(rules) {
  activeRules = rules;
}

export function matchFetchHeaderOverrides(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return undefined;
  for (const rule of activeRules) {
    if (rule.prefix) {
      if (urlStr === rule.prefix || urlStr.startsWith(rule.prefix + "/") || urlStr.startsWith(rule.prefix + "?")) {
        return rule.headers;
      }
    }
  }
  return undefined;
}

export function applyFetchHeaderOverrides(input, init, overrides) {
  const options = init ? { ...init } : {};
  let currentHeaders = {};

  if (options.headers instanceof Headers) {
    currentHeaders = Object.fromEntries(options.headers.entries());
  } else if (Array.isArray(options.headers)) {
    currentHeaders = Object.fromEntries(options.headers);
  } else if (options.headers && typeof options.headers === "object") {
    currentHeaders = { ...options.headers };
  } else if (input && typeof input === "object" && input.headers instanceof Headers) {
    currentHeaders = Object.fromEntries(input.headers.entries());
  }

  options.headers = overrideHeaders(currentHeaders, overrides);
  return options;
}

export function installGlobalFetchHook() {
  if (globalThis.__dsh_llm_headers_hook_installed__) return;
  globalThis.__dsh_llm_headers_hook_installed__ = true;
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return;

  globalThis.fetch = async function (input, init) {
    let urlStr = "";
    if (typeof input === "string") urlStr = input;
    else if (input instanceof URL) urlStr = input.href;
    else if (input && typeof input === "object" && typeof input.url === "string") urlStr = input.url;

    if (urlStr) {
      const overrides = matchFetchHeaderOverrides(urlStr);
      if (overrides && Object.keys(overrides).length > 0) {
        init = applyFetchHeaderOverrides(input, init, overrides);
      }
    }
    const response = await originalFetch.call(this, input, init);
    if (!response.ok) {
      try {
        const cloned = response.clone();
        const text = await cloned.text();
        console.error(`[dsh-plugin-llm-headers] fetch status=${response.status} for ${urlStr}: ${text.slice(0, 300)}`);
      } catch {}
    }
    return response;
  };
}

export function getSettingsSection(settingsService, ns) {
  if (!settingsService) return undefined;
  if (typeof settingsService.describe === "function") {
    const list = settingsService.describe();
    const found = list.find((item) => item.ns === ns);
    if (found?.value) return found.value;
    if (found?.user) return found.user;
  }
  if (typeof settingsService.section === "function") {
    try {
      const sec = settingsService.section(ns);
      if (sec) return sec;
    } catch {}
  }
  return undefined;
}

export function extractHeaderRules(settingsService, env) {
  const rules = [];
  if (!settingsService) return rules;

  const collectFromSection = (ns) => {
    const section = getSettingsSection(settingsService, ns);
    const providers = section?.providers;
    if (!providers || typeof providers !== "object") return;

    for (const [providerName, profile] of Object.entries(providers)) {
      if (!profile || typeof profile !== "object") continue;
      const baseUrl = profile.baseURL ?? catalogProvider(providerName)?.baseUrl;
      const normalizedBase = typeof baseUrl === "string" ? baseUrl.replace(/\/+$/, "") : undefined;

      if (profile.headers && typeof profile.headers === "object" && Object.keys(profile.headers).length > 0) {
        try {
          const resolved = resolveHeaderValues(providerName, "route", profile.headers, env);
          if (normalizedBase && Object.keys(resolved).length > 0) {
            rules.push({ provider: providerName, prefix: normalizedBase, headers: resolved });
          }
        } catch {}
      }

      if (Array.isArray(profile.models)) {
        for (const model of profile.models) {
          if (model && typeof model === "object" && model.headers && typeof model.headers === "object") {
            try {
              const combined = { ...profile.headers, ...model.headers };
              const resolved = resolveHeaderValues(providerName, `model "${model.id}"`, combined, env);
              const mBase = (typeof model.baseUrl === "string" ? model.baseUrl.replace(/\/+$/, "") : undefined) ?? normalizedBase;
              if (mBase && Object.keys(resolved).length > 0) {
                rules.push({ provider: providerName, modelId: model.id, prefix: mBase, headers: resolved });
              }
            } catch {}
          }
        }
      }
    }
  };

  collectFromSection("llm-pi-ai");
  collectFromSection("llm-headers");
  return rules;
}

// Hook PiAiAdapter prototype so any stock adapter streaming a profile with custom headers
// dynamically ensures its baseURL prefix is registered with the fetch hook.
if (typeof PiAiAdapter?.prototype?.streamWithSnapshot === "function" && !PiAiAdapter.prototype.__dsh_llm_headers_patched__) {
  PiAiAdapter.prototype.__dsh_llm_headers_patched__ = true;
  const originalStreamWithSnapshot = PiAiAdapter.prototype.streamWithSnapshot;
  PiAiAdapter.prototype.streamWithSnapshot = async function* (options, snapshot) {
    try {
      const profile = this.profileOf(snapshot, options?.provider);
      const baseUrl = profile?.baseURL ?? profile?.piProvider?.baseUrl;
      if (baseUrl && profile?.headers && Object.keys(profile.headers).length > 0) {
        const normalized = String(baseUrl).replace(/\/+$/, "");
        const existing = activeRules.find((r) => r.prefix === normalized);
        if (!existing) {
          activeRules.push({ prefix: normalized, headers: profile.headers });
        } else {
          existing.headers = { ...existing.headers, ...profile.headers };
        }
      }
    } catch {}
    yield* originalStreamWithSnapshot.call(this, options, snapshot);
  };
}

/**
 * Resolve every configured route, skipping — loudly — the ones that cannot be
 * served. One unserviceable route must not take the rest of the section with
 * it: this section is edited by hand, and a typo in a spare route should not
 * silently unregister the one the agent is running on.
 *
 * @param ctx - plugin context, for diagnostics and the launch environment.
 * @param config - the current section value.
 * @returns route-keyed resolved profiles.
 */
function resolveProfiles(ctx, config) {
  const env = launchEnvironmentOf(ctx);
  const profiles = new Map();
  for (const [provider, source] of Object.entries(config?.providers ?? {})) {
    try {
      profiles.set(provider, resolveProfile(provider, source, env));
    } catch (error) {
      ctx.logger.error(`${name}: provider "${provider}" is not serviceable and was skipped`);
      ctx.logger.error(error);
    }
  }
  return profiles;
}

export function apply(ctx, config) {
  installGlobalFetchHook();

  let current = () => config;
  let source;
  let profiles = new Map();
  let registration;

  const snapshot = () => {
    const latest = current();
    if (latest !== source) {
      source = latest;
      profiles = resolveProfiles(ctx, latest);
    }
    return profiles;
  };

  const adapter = new PiAiAdapter({
    profiles: snapshot,
    resolveApiKey: async (provider, profile) => {
      const ref = profile.apiKeyEnv;
      if (ref === void 0) return void 0;
      const stored = await ctx.get("credentials")?.resolve(ref);
      const value = stored?.value ?? launchEnvironmentOf(ctx).get(ref)?.value;
      if (value === void 0 || value.length === 0) {
        throw new LlmError(`${name}: provider "${provider}" has no API key at "${ref}"; store it through the credentials service or export it in the launching environment`, "MISSING_CREDENTIAL");
      }
      return assertUsableApiKey(value, name, ref);
    },
    resolveAttachments: () => ctx.get("attachments"),
  });

  let held = new Set();
  let registering = false;

  const registerRoutes = () => {
    if (registering) return;
    const settingsService = ctx.get("settings");
    const piAiProviders = getSettingsSection(settingsService, "llm-pi-ai")?.providers ?? {};
    // Only register routes with ctx.llm that are NOT already in llm-pi-ai.
    // Routes in llm-pi-ai are served by PiAiAdapter from dsh-llm-pi-ai, with headers enforced by the fetch hook.
    const allRoutes = [...snapshot().keys()];
    const routes = allRoutes.filter((route) => !(route in piAiProviders));

    if (routes.length === held.size && routes.every((route) => held.has(route))) return;
    registering = true;
    try {
      if (registration === void 0) {
        if (routes.length > 0) {
          registration = ctx.llm.registerAdapter(routes, adapter);
          held = new Set(routes);
        }
      } else {
        registration.replace(routes);
        held = new Set(routes);
      }
    } catch (error) {
      ctx.logger.error(`${name}: could not register routes ${routes.join(", ")}; a route claimed here must not also appear under llm-pi-ai.providers`);
      ctx.logger.error(error);
    } finally {
      registering = false;
    }
  };

  const refreshRules = () => {
    const settingsService = ctx.get("settings");
    const env = launchEnvironmentOf(ctx);
    const rules = extractHeaderRules(settingsService, env);
    setFetchHeaderRules(rules);
  };

  refreshRules();

  installSettingsSection(ctx, LLM_HEADERS_SETTINGS_NAMESPACE, Config, config, {
    setSource: (next) => {
      current = next;
    },
    onChange: () => {
      refreshRules();
      registerRoutes();
    },
  });

  ctx.on("settings/updated", () => {
    refreshRules();
    registerRoutes();
  });

  ctx.on("llm/adapters-updated", () => {
    registerRoutes();
  });

  registerRoutes();
}

installGlobalFetchHook();

