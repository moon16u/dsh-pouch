import type { Context } from "@deepseek-ai/cordis";
import type { SettingsNamespace } from "@deepseek-ai/dsh-settings";
import type { Model, Provider } from "@earendil-works/pi-ai";

export declare const name = "llm-headers";
export declare const inject: string[];
export declare const LLM_HEADERS_SETTINGS_NAMESPACE: SettingsNamespace;

/** Wire protocols a route pi-ai does not ship may name. */
export type LlmHeadersApi = "openai-completions" | "openai-responses" | "anthropic-messages";

/**
 * One header. A string may embed `${env:NAME}` references, substituted from the
 * launcher's environment. `null` removes the header instead of setting it.
 */
export type LlmHeaderValue = string | null;
export type LlmHeaderMap = Record<string, LlmHeaderValue>;

/** pi-ai wire-compatibility switches, passed through to the model descriptor. */
export type LlmHeadersCompat = Record<string, boolean | string>;

/** Fields a model entry or a `modelOverrides` entry may set. */
export interface LlmHeadersModelFields {
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: ("text" | "image")[];
  /** `false` declares a non-reasoning model; a dict maps effort ids to wire spellings. */
  reasoningEfforts?: false | Record<string, string | null>;
  compat?: LlmHeadersCompat;
  /** Headers for this model alone, merged over the route's. */
  headers?: LlmHeaderMap;
}

export interface LlmHeadersModelProfile extends LlmHeadersModelFields {
  id: string;
}

/** One provider route this plugin owns. */
export interface LlmHeadersProviderProfile {
  displayName?: string;
  apiKeyEnv?: string;
  /** Omission keeps each installed catalog model's protocol; a declared route needs one. */
  api?: LlmHeadersApi;
  /** Omission keeps the installed catalog's endpoint; a declared route needs one. */
  baseURL?: string;
  /** Request headers that win over every layer above, reserved names included. */
  headers?: LlmHeaderMap;
  /** This route's catalog. Omission serves pi-ai's installed one. */
  models?: LlmHeadersModelProfile[];
  /** Installed-catalog customizations by model id; only meaningful beside no `models` list. */
  modelOverrides?: Record<string, LlmHeadersModelFields>;
  compat?: LlmHeadersCompat;
  reasoning?: string;
  timeoutMs?: number;
  streamIdleTimeoutMs?: number;
}

export interface LlmHeadersConfig {
  providers?: Record<string, LlmHeadersProviderProfile>;
}

export declare const Config: import("@deepseek-ai/schemastery").default<LlmHeadersConfig>;

/**
 * Merge `overrides` over `existing`, the override winning by header name
 * case-insensitively so no field is sent twice under two spellings, and a
 * `null` override removing the header.
 */
export declare function overrideHeaders(
  existing: Record<string, string> | undefined,
  overrides: LlmHeaderMap,
): Record<string, string>;

/**
 * Wrap a pi-ai provider so each model's headers reach the wire — the last stop
 * after the harness has already appended its own attribution.
 *
 * @param base - the provider to wrap; returned unchanged when `headers` is empty.
 * @param headers - each model's resolved header map, keyed by model id.
 */
export declare function headerForcingProvider(base: Provider, headers: Map<string, LlmHeaderMap>): Provider;

/** Build the `PiAiAdapter` profile for one configured route. */
export declare function resolveProfile(
  provider: string,
  source: LlmHeadersProviderProfile,
  env?: { get(name: string): { value: string } | undefined },
): { provider: string; displayName: string; piProvider: Provider; headers: Record<string, string>; configuredMaxTokens: ReadonlyMap<string, number> } & Record<string, unknown>;

export declare function apply(ctx: Context, config: LlmHeadersConfig): void;
