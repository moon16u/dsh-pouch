/**
 * mcpServers JSON import (plan §5.5).
 *
 * Accepts the Claude Code / Codex family of shapes:
 *
 *   { "mcpServers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }
 *   { "mcpServers": { "<name>": { "url": "https://...", "headers": {...}, "type": "http" } } }
 *
 * plus the bare map without the `mcpServers` wrapper. stdio entries map
 * 1:1; http entries are normalized to the official client's
 * `streamable-http` transport, tolerating the common key variants
 * (`url`/`serverUrl`/`endpoint`, `type: "http"|"streamable-http"|"sse"`).
 * Names are reported, never overwritten — conflicts are the caller's to
 * surface (the orchestrator skips and reports them).
 */

const NAME_LIMIT = 100;

/**
 * Parse pasted JSON into console server configs.
 * @param {string} text
 * @returns {{ servers: {name: string, config: object}[], errors: string[] }}
 */
export function parseMcpServers(text) {
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { servers: [], errors: [`invalid JSON: ${String(error?.message ?? error)}`] };
  }
  let map = parsed;
  if (isPlainObject(parsed) && isPlainObject(parsed.mcpServers)) {
    map = parsed.mcpServers;
  } else if (isPlainObject(parsed) && isPlainObject(parsed.servers) && !parsed.command && !parsed.url) {
    map = parsed.servers;
  }
  if (!isPlainObject(map)) {
    return { servers: [], errors: ["expected an object like { mcpServers: { name: { command, args, env } } }"] };
  }
  const servers = [];
  for (const [name, entry] of Object.entries(map)) {
    if (servers.length >= NAME_LIMIT) {
      errors.push(`import capped at ${NAME_LIMIT} servers; remaining entries ignored`);
      break;
    }
    if (!isPlainObject(entry)) {
      errors.push(`"${name}": not an object, skipped`);
      continue;
    }
    const config = mapEntry(name, entry);
    if (config) servers.push({ name, config });
    else errors.push(`"${name}": neither a stdio (command/args/env) nor an http (url/headers) entry, skipped`);
  }
  return { servers, errors };
}

function mapEntry(name, entry) {
  const common = {
    enabled: true,
    scope: "global",
    toolCallTimeoutMs: typeof entry.toolCallTimeoutMs === "number" ? entry.toolCallTimeoutMs : undefined,
    failOnStartupError: entry.failOnStartupError === true,
  };
  const url = firstString(entry.url, entry.serverUrl, entry.endpoint);
  if (url) {
    return {
      ...common,
      transport: "streamable-http",
      url,
      headers: stringMap(entry.headers),
    };
  }
  if (typeof entry.command === "string" && entry.command.length > 0) {
    return {
      ...common,
      transport: "stdio",
      command: entry.command,
      args: Array.isArray(entry.args) ? entry.args.filter((item) => typeof item === "string") : [],
      env: stringMap(entry.env),
      cwd: typeof entry.cwd === "string" ? entry.cwd : "",
    };
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

function stringMap(value) {
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
