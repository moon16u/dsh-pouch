/** Safe profile migration: semantic YAML reads and surgical, validated writes. */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseDocument, isSeq } from "yaml";
import { validateServerConfig, toClientConfig } from "./clientAdapter.js";
import { patchDocument, removableRanges, removeRanges, MCP_CLIENT_NAME } from "./yamlDocument.js";

export function defaultProfilePatchYamlPath(dshHome, profile = "web") {
  return join(dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh"), "profiles", profile, "cordis.patch.yml");
}

function atomicYaml(path, text, previous) {
  const doc = parseDocument(text, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] });
  if (doc.errors.length || doc.warnings.length || !isSeq(doc.contents)) throw new Error("Refusing to write an invalid YAML patch array");
  // Another writer must not be silently overwritten during a store migration.
  if ((existsSync(path) ? readFileSync(path, "utf8") : "") !== previous) throw new Error("Profile changed during MCP migration; retry");
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.mcp-${randomBytes(8).toString("hex")}.tmp`);
  writeFileSync(temp, text, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

const CONFIG_KEYS = new Set(["serverName", "transport", "command", "args", "env", "cwd", "url", "headers", "toolCallTimeoutMs", "failOnStartupError", "reconnect", "maxInstructionBytes"]);
function candidate(entry, item, items) {
  const row = entry.value;
  if (!row?.config?.serverName) return { error: "entry has no serverName" };
  if (Object.keys(row).some(k => !["id", "name", "config", "disabled"].includes(k))) return { error: "entry controls require manual migration" };
  if (row.disabled !== undefined && typeof row.disabled !== "boolean") return { error: "disabled must be a boolean" };
  const parent = item.node.toJSON();
  if (item.node !== entry.node && Object.keys(parent).some(k => k !== "insert")) return { error: "targeted insert requires manual migration" };
  if (row.id && items.some(it => it !== item && it.node.toJSON()?.id === row.id)) return { error: "entry has profile overrides; migrate them explicitly" };
  if (Object.keys(row.config).some(k => !CONFIG_KEYS.has(k))) return { error: "unknown client fields require manual migration" };
  for (const k of ["command", "url", "cwd"]) {
    if (row.config[k] !== undefined && typeof row.config[k] !== "string") return { error: `${k} must be a string` };
  }
  const { serverName: name, ...raw } = row.config;
  return validateServerConfig({ ...raw, name, enabled: row.disabled !== true, scope: "global" });
}

export async function ingestProfileMcpEntries({ store, yamlPath }) {
  const path = yamlPath ?? defaultProfilePatchYamlPath();
  if (!existsSync(path)) return { ingested: [], skipped: [], cleanedYaml: false };
  const raw = readFileSync(path, "utf8");
  const items = patchDocument(raw);
  const selected = new Set();
  const additions = new Map();
  const ingested = [], skipped = [];
  const before = store.read().servers;
  const blocks = items.flatMap(item => item.entries.filter(e => e.value?.name === MCP_CLIENT_NAME).map(entry => ({ item, entry })));
  for (const { item, entry } of blocks) {
    const name = entry.value?.config?.serverName ?? "(unnamed)";
    const { config, error } = candidate(entry, item, items);
    let reason = error;
    if (!reason && blocks.filter(b => b.entry.value?.config?.serverName === name).length > 1) reason = "duplicate serverName in profile";
    if (!reason && entry.range === null) reason = "inline entry cannot be removed safely; use block-style entries";
    if (!reason && Object.hasOwn(before, name)) {
      const stored = validateServerConfig({ ...before[name], name });
      if (stored.error || !isDeepStrictEqual(stored.config, config)) reason = "already present with different configuration; original YAML retained";
    }
    if (reason) { skipped.push({ name, reason }); continue; }
    selected.add(entry);
    ingested.push(name);
    if (!Object.hasOwn(before, name)) {
      const { name: _name, ...rest } = config;
      additions.set(name, rest);
    }
  }
  if (selected.size === 0) return { ingested, skipped, cleanedYaml: false };
  let output = removeRanges(raw, removableRanges(items, selected));
  // Dropping the first item leaves its preceding newline behind; a patch file
  // that did not start blank should not start blank afterwards.
  if (!/^\s*\n/.test(raw)) output = output.replace(/^\n+/, "");
  const remainder = parseDocument(output, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] });
  if (remainder.contents === null) output = output.trimEnd() + (output.trim() ? "\n\n" : "") + "[]\n";
  if (parseDocument(output, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] }).errors.length) throw new Error("Migration would produce invalid YAML; nothing was changed");
  let committed = false;
  try {
    if (additions.size) {
      const result = store.mutate(servers => {
        for (const [name, config] of additions) {
          if (Object.hasOwn(servers, name)) throw new Error(`Server ${name} changed during migration`);
          Object.defineProperty(servers, name, { value: config, enumerable: true, configurable: true, writable: true });
        }
      });
      if (result === false) return { ingested: [], skipped, cleanedYaml: false };
      committed = true;
    }
    atomicYaml(path, output, raw);
  } catch (error) {
    if (committed) store.mutate(servers => {
      for (const [name, config] of additions) if (isDeepStrictEqual(servers[name], config)) delete servers[name];
    });
    throw error;
  }
  return { ingested, skipped, cleanedYaml: true };
}

function scalar(value) {
  const text = String(value ?? "");
  if (/[\r\n\t]/.test(text)) return JSON.stringify(text);
  if (text === "" || /^[-?:,\[\]{}#&*!|>'"%@`\s]/.test(text) || /:\s|\s#|\s$|['"]/.test(text) || /^(?:true|false|null|yes|no|on|off|~|[-+]?\d.*)$/i.test(text)) return "'" + text.replace(/'/g, "''") + "'";
  return text;
}

export function formatMcpYamlEntry(name, raw) {
  const { config, error } = validateServerConfig({ ...raw, name });
  if (error) throw new Error(`${name}: ${error}`);
  const client = toClientConfig(config);
  const lines = [`# dsh-mcp-${name}: managed by dsh-mcp-console`, "- insert:", `    - id: mcp-${name}`, `      name: '${MCP_CLIENT_NAME}'`];
  if (!config.enabled) lines.push("      disabled: true");
  lines.push("      config:");
  for (const [key, value] of Object.entries(client)) {
    if (typeof value === "string") { lines.push(`        ${key}: ${scalar(value)}`); continue; }
    if (Array.isArray(value)) {
      lines.push(`        ${key}: ${value.length ? "" : "[]"}`);
      for (const v of value) lines.push(`          - ${scalar(v)}`);
    } else if (value && typeof value === "object") {
      const pairs = Object.entries(value);
      lines.push(`        ${key}: ${pairs.length ? "" : "{}"}`);
      for (const [k, v] of pairs) lines.push(`          ${scalar(k)}: ${typeof v === "string" ? scalar(v) : String(v)}`);
    } else lines.push(`        ${key}: ${value}`);
  }
  return lines.join("\n");
}

export async function exportStoreToProfileYaml({ store, yamlPath }) {
  const path = yamlPath ?? defaultProfilePatchYamlPath();
  const servers = store.read().servers;
  const names = Object.keys(servers);
  if (names.length === 0) return { exported: [], filePath: path, warnings: [] };
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const items = patchDocument(raw);
  const selected = new Set();
  for (const item of items) {
    for (const entry of item.entries) {
      const row = entry.value;
      const name = row?.config?.serverName;
      if (typeof name !== "string" || row.name !== MCP_CLIENT_NAME || row.id !== `mcp-${name}`) continue;
      const range = item.entries.length === 1 ? item.range : entry.range;
      if (range && raw.slice(...range).includes(`# dsh-mcp-${name}: managed by dsh-mcp-console`)) selected.add(entry);
    }
  }
  const remaining = items.flatMap(it => it.entries).filter(e => !selected.has(e));
  for (const name of names) {
    if (remaining.some(e => e.value?.config?.serverName === name || e.value?.id === `mcp-${name}`)) throw new Error(`Export conflicts with profile entry ${name}; nothing was changed`);
  }
  let base = removeRanges(raw, removableRanges(items, selected));
  const doc = parseDocument(base, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] });
  if (isSeq(doc.contents) && doc.contents.items.length === 0) {
    // [] is a valid empty patch, not a prefix to append another YAML value to.
    base = base.slice(0, doc.contents.range[0]) + base.slice(doc.contents.range[1]);
  }
  const warnings = [];
  const entries = names.map(name => {
    const config = servers[name];
    if (config.enabled !== false && config.disabledTools?.length) throw new Error(`${name}: per-tool restrictions cannot be exported to the official client; disable the server first`);
    if (config.disabledTools?.length) warnings.push(`${name}: disabledTools remain only in the console store; the exported server stays disabled`);
    return formatMcpYamlEntry(name, config);
  });
  const marker = "# ---- Exported by dsh-mcp-console ----";
  const output = base.trimEnd() + (base.trim() ? "\n\n" : "") + (base.includes(marker) ? "" : marker + "\n") + entries.join("\n") + "\n";
  atomicYaml(path, output, raw);
  return { exported: names, filePath: path, warnings };
}
