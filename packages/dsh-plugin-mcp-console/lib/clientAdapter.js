/**
 * The ONLY module that touches `@deepseek-ai/dsh-mcp-client` (plan §7 R2:
 * every official-package coupling converges here).
 *
 * Resolution is deliberately DYNAMIC, not a static import: the console
 * package itself vendors nothing, and the official client is loaded from
 * the running DSH profile's module graph so that the SAME module instance
 * the loader used for manually-declared servers is reused. Sharing the
 * instance matters: the official client keeps its serverName namespace
 * reservation in module-level state, and one instance means conflicts with
 * profile-declared entries are caught by the official mechanism itself, not
 * only by our pre-check.
 *
 * Search order (profile first — see the module doc for why sharing the
 * loader's instance matters):
 *   1. `<DSH_HOME>/profiles/node_modules` — the profiles workspace hoisted
 *      root (plan §2.1 verified layout);
 *   2. `<DSH_HOME>/profiles/<profile>/node_modules` for every profile;
 *   3. plain specifier resolution from this package (standalone installs
 *      whose peer deps are locally resolvable).
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** serverName contract, mirrored from the official client's schema. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** Official default for per-tool-call timeout (ms). */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;

/** Mask shown for secret-shaped values in API responses and the panel. */
export const MASK = "••••";

const CLIENT_SPECIFIER = "@deepseek-ai/dsh-mcp-client";

let cachedClient = undefined;

/** Candidate resolution bases for the official client, most specific first. */
export function resolutionBases(dshHome) {
  const root = dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const bases = [];
  const profilesRoot = join(root, "profiles");
  const hoisted = join(profilesRoot, "node_modules");
  if (existsSync(hoisted)) bases.push(hoisted);
  try {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const base = join(profilesRoot, entry.name, "node_modules");
      if (existsSync(base) && !bases.includes(base)) bases.push(base);
    }
  } catch {
    // no profiles dir: the hoisted base (if any) plus self-resolution remain
  }
  return bases;
}

/**
 * Resolve the official client plugin module ({ name, inject, Config, apply }).
 * Memoized; failures are retried on the next call.
 *
 * @returns {Promise<typeof import("@deepseek-ai/dsh-mcp-client")>}
 */
export async function resolveMcpClient() {
  if (cachedClient !== undefined) return cachedClient;
  const attempts = [];
  for (const base of resolutionBases()) {
    try {
      const require = createRequire(join(base, "clientAdapter-anchor.js"));
      const resolved = require.resolve(CLIENT_SPECIFIER);
      if (typeof resolved !== "string" || !existsSync(resolved)) continue;
      cachedClient = await import(pathToFileURL(resolved).href);
      return cachedClient;
    } catch (error) {
      attempts.push(`${base}: ${String(error?.message ?? error)}`);
    }
  }
  // fallback: self-context resolution (standalone installs with locally
  // resolvable peer deps — resolves to the same instance there anyway)
  try {
    cachedClient = await import(CLIENT_SPECIFIER);
    return cachedClient;
  } catch (error) {
    attempts.push(`self: ${String(error?.message ?? error)}`);
  }
  throw new Error(
    `mcp-console: cannot resolve ${CLIENT_SPECIFIER} (tried ${resolutionBases().length} profile node_modules bases and self resolution: ${attempts.join(" | ")}). ` +
      "Ensure dsh is installed and the web profile has been booted at least once.",
  );
}

function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function str(value) {
  return typeof value === "string" ? value : "";
}

function strArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function strMap(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

/**
 * Validate one stored server config (console shape) before it is persisted or
 * assembled. Returns `{ config }` normalized, or `{ error }` explaining the
 * first problem.
 *
 * @param {object} server stored config (may lack defaults)
 * @returns {{ config?: object, error?: string }}
 */
export function validateServerConfig(server) {
  if (server === null || typeof server !== "object") return { error: "server config must be an object" };
  const name = str(server.name).trim();
  if (!SERVER_NAME_PATTERN.test(name)) {
    return { error: `serverName "${name}" must match [A-Za-z0-9_-]{1,32}` };
  }
  const transport = server.transport;
  if (transport !== "stdio" && transport !== "streamable-http") {
    return { error: `transport must be "stdio" or "streamable-http" (got ${JSON.stringify(transport)})` };
  }
  const config = {
    name,
    enabled: bool(server.enabled, true),
    transport,
    scope: server.scope === "project" ? "project" : "global",
    toolCallTimeoutMs: num(server.toolCallTimeoutMs, DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: bool(server.failOnStartupError, false),
    /** Disabled public tool names, per-tool switch (mcp-manager-gui-spec §3.4). */
    disabledTools: Array.isArray(server.disabledTools)
      ? server.disabledTools.filter((item) => typeof item === "string")
      : [],
  };
  if (transport === "stdio") {
    const command = str(server.command).trim();
    if (command.length === 0) return { error: "stdio transport requires a command" };
    config.command = command;
    config.args = strArray(server.args);
    config.env = strMap(server.env);
    config.cwd = str(server.cwd);
  } else {
    const url = str(server.url).trim();
    if (!/^https?:\/\//i.test(url)) {
      return { error: "streamable-http transport requires an http(s) url" };
    }
    config.url = url;
    config.headers = strMap(server.headers);
  }
  if (server.reconnect !== undefined && server.reconnect !== null) {
    if (typeof server.reconnect !== "object" || Array.isArray(server.reconnect)) {
      return { error: "reconnect must be an object" };
    }
    config.reconnect = { ...server.reconnect };
  }
  return { config };
}

/**
 * Translate one stored console config into the official client's config
 * (input to `ctx.plugin(mcpClient, config)`). Assumes validateServerConfig()
 * has passed; still coerces defensively.
 *
 * @param {object} server validated console config
 * @returns {object} official StdioConfig | StreamableHttpConfig
 */
export function toClientConfig(server) {
  const config = {
    transport: server.transport,
    serverName: server.name,
    toolCallTimeoutMs: num(server.toolCallTimeoutMs, DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: bool(server.failOnStartupError, false),
  };
  if (server.transport === "stdio") {
    config.command = str(server.command);
    config.args = strArray(server.args);
    config.env = strMap(server.env);
    config.cwd = str(server.cwd);
  } else {
    config.url = str(server.url);
    config.headers = strMap(server.headers);
  }
  if (server.reconnect && typeof server.reconnect === "object") {
    config.reconnect = { ...server.reconnect };
  }
  return config;
}

/**
 * Mask secret-shaped values for API responses and the panel. env/headers
 * values become MASK when set; keys are kept so the shape stays visible.
 */
export function maskRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    out[key] = typeof value === "string" && value.length > 0 ? MASK : value;
  }
  return out;
}
