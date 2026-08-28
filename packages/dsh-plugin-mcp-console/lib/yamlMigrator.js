/**
 * Auto-ingest engine + YAML export (dsh-mcp-ingest-export-plan.md).
 *
 * The profile's `cordis.patch.yml` is the official static way to declare MCP
 * servers, but entries there are invisible to the console's dynamic
 * management. This module moves them across, both ways:
 *
 *   ingest  cordis.patch.yml  ->  ~/.dsh/dsh-mcp.json (+ physical removal of
 *          the migrated blocks from the YAML, preserving every other entry,
 *          comment, and blank line)
 *   export  ~/.dsh/dsh-mcp.json  ->  cordis.patch.yml (append standard
 *          mcp-client entries, for uninstall/backup reversibility)
 *
 * The YAML edit is line-based and comment-preserving — no YAML library: the
 * patch file's shape (top-level list of `- id:`/`- insert:` items) is stable,
 * and a tolerant block parser keeps the file's own formatting intact.
 *
 * Safety order (ingest): parse+extract -> persist to store -> physically
 * trim YAML. If the store write throws, the YAML is left untouched, so a
 * failed ingest never loses configuration. Deletions (ingest trim, delete
 * server) are the user's explicit intent — no backup files are kept.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { validateServerConfig } from "./clientAdapter.js";

const MCP_CLIENT_NAME = /name:\s*['"]?@deepseek-ai\/dsh-mcp-client['"]?/;

/** The profile patch layer this console manages (web surface). */
export function defaultProfilePatchYamlPath(dshHome, profile = "web") {
  const root = dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(root, "profiles", profile, "cordis.patch.yml");
}

function indentOf(line) {
  const match = /^(\s*)/.exec(line);
  return match ? match[1].length : 0;
}

function scalar(raw) {
  const value = raw.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse one `key: value` (or `- key: value`) line into its parts.
 * Returns null for blank/comment/continuation-less lines without a colon.
 */
function keyValue(line) {
  const stripped = line.replace(/^(\s*)-\s+/, "$1");
  const match = /^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(stripped);
  if (!match) return null;
  return { key: match[1], value: scalar(match[2] || ""), indent: indentOf(stripped) };
}

/**
 * Split the patch file into top-level list-item blocks.
 *
 * Comment/blank lines BETWEEN items buffer as "pending"; when the next item
 * starts, the comment run after the last pending blank becomes that item's
 * LEADING lines (its header comment) so removing an item takes its own
 * comment with it and never its neighbour's. Earlier pending lines (file
 * headers, spacing) stay unassigned and are always kept.
 */
function splitTopLevelItems(lines) {
  const items = [];
  const pending = [];
  let current = null;
  const itemIndent = (() => {
    let min = null;
    for (const line of lines) {
      if (!/^\s*-\s/.test(line)) continue;
      const indent = indentOf(line);
      if (min === null || indent < min) min = indent;
    }
    return min;
  })();
  if (itemIndent === null) return items;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*-\s/.test(line) && indentOf(line) === itemIndent) {
      // flush: the comment run after the last pending blank is my header
      let lastBlank = -1;
      for (let p = 0; p < pending.length; p += 1) {
        if (pending[p].trim() === "") lastBlank = p;
      }
      const leading = pending.slice(lastBlank + 1).filter((l) => l.trim().startsWith("#"));
      current = { start: index - leading.length, lines: [...leading, line] };
      items.push(current);
      pending.length = 0;
    } else if (/^\s*#/.test(line) || line.trim() === "") {
      pending.push(line);
    } else if (current) {
      current.lines.push(line);
    }
    // lines before the first item (file header) are left unassigned: kept
  }
  return items;
}

/**
 * Split one top-level item into its nested entries (`- id:` siblings under
 * `- insert:`). The flat form (the item itself names the plugin) returns a
 * single entry covering the whole item. Returns { shell, entries } where
 * shell is the lines before the first nested entry (the `- insert:` header).
 */
function splitItemEntries(itemLines) {
  const firstIndent = indentOf(itemLines[0]);
  let entryIndent = null;
  for (const line of itemLines.slice(1)) {
    if (/^\s*-\s/.test(line)) {
      const indent = indentOf(line);
      if (indent > firstIndent && (entryIndent === null || indent < entryIndent)) entryIndent = indent;
    }
  }
  if (entryIndent === null) {
    return { shell: [], entries: [{ lines: itemLines }] };
  }
  const shell = [];
  const entries = [];
  let current = null;
  for (const line of itemLines) {
    if (/^\s*-\s/.test(line) && indentOf(line) === entryIndent) {
      current = { lines: [line] };
      entries.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      shell.push(line);
    }
  }
  return { shell, entries };
}

/**
 * Extract one MCP item's server config from its block lines.
 * Understands the nesting the official docs use:
 *   - insert:
 *       - id: mcp-x
 *         name: '@deepseek-ai/dsh-mcp-client'
 *         config:
 *           serverName: x
 *           transport: stdio
 *           command: npx
 *           args:
 *             - -y
 *             - pkg
 *           env:
 *             KEY: value
 * plus the flat form (`- name: '@deepseek-ai/dsh-mcp-client'` with config at
 * the same level). List values (`args`) and nested maps (`env`, `headers`,
 * `reconnect`) are collected.
 */
function blockToServerConfig(itemLines) {
  // locate the name line to anchor the config scope
  let nameIndex = -1;
  for (let index = 0; index < itemLines.length; index += 1) {
    if (MCP_CLIENT_NAME.test(itemLines[index])) {
      nameIndex = index;
      break;
    }
  }
  if (nameIndex === -1) return null;
  const nameIndent = indentOf(itemLines[nameIndex]);

  const config = {};
  let args = null;
  const maps = {};
  let inList = null;
  let inMap = null;

  for (let index = nameIndex + 1; index < itemLines.length; index += 1) {
    const line = itemLines[index];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = indentOf(line);

    // list item (- value)
    const listMatch = /^(\s*)-\s+(.*)$/.exec(line);
    if (listMatch && (inList || inMap) && indent >= (inList?.indent ?? inMap.indent)) {
      if (inList) {
        config[inList.key] = config[inList.key] ?? [];
        config[inList.key].push(scalar(listMatch[2]));
        continue;
      }
      if (inMap) {
        const pair = /^([^:]+):\s*(.*)$/.exec(listMatch[2]);
        if (pair) maps[inMap.key][scalar(pair[1])] = scalar(pair[2] || "");
        continue;
      }
    }

    const entry = keyValue(line);
    if (inMap) {
      if (entry && entry.indent > inMap.indent) {
        maps[inMap.key][entry.key] = entry.value;
        continue;
      }
      // same-level or dedented key: the map scope is over
      inMap = null;
    }
    if (!entry || entry.indent < nameIndent) {
      // dedent past the name line: this block's fields are over
      inList = null;
      inMap = null;
      continue;
    }
    if (entry.indent === nameIndent) {
      // sibling of name: (id, config:) — config handled via deeper lines
      if (entry.key === "id") config.id = entry.value;
      if (entry.key === "serverName") config.serverName = entry.value;
      if (entry.key === "transport") config.transport = entry.value;
      if (entry.key === "command") config.command = entry.value;
      if (entry.key === "url") config.url = entry.value;
      if (entry.key === "cwd") config.cwd = entry.value;
      if (entry.key === "toolCallTimeoutMs") config.toolCallTimeoutMs = Number(entry.value) || undefined;
      if (entry.key === "failOnStartupError") config.failOnStartupError = entry.value === "true";
      if (entry.key === "args" && entry.value === "") { inList = { key: "args", indent: entry.indent }; }
      if (entry.key === "env" && entry.value === "") { inMap = { key: "env", indent: entry.indent }; maps.env = {}; }
      if (entry.key === "headers" && entry.value === "") { inMap = { key: "headers", indent: entry.indent }; maps.headers = {}; }
      continue;
    }
    // deeper than name: config fields (or nested under config:)
    if (entry.key === "serverName") config.serverName = entry.value;
    else if (entry.key === "transport") config.transport = entry.value;
    else if (entry.key === "command") config.command = entry.value;
    else if (entry.key === "url") config.url = entry.value;
    else if (entry.key === "cwd") config.cwd = entry.value;
    else if (entry.key === "toolCallTimeoutMs") config.toolCallTimeoutMs = Number(entry.value) || undefined;
    else if (entry.key === "failOnStartupError") config.failOnStartupError = entry.value === "true";
    else if (entry.key === "args" && entry.value === "") { inList = { key: "args", indent: entry.indent }; config.args = []; }
    else if (entry.key === "env" && entry.value === "") { inMap = { key: "env", indent: entry.indent }; maps.env = {}; }
    else if (entry.key === "headers" && entry.value === "") { inMap = { key: "headers", indent: entry.indent }; maps.headers = {}; }
  }
  if (maps.env && Object.keys(maps.env).length > 0) config.env = maps.env;
  if (maps.headers && Object.keys(maps.headers).length > 0) config.headers = maps.headers;
  if (Array.isArray(config.args) && config.args.length === 0) delete config.args;
  if (!config.serverName) return null;
  return config;
}

/**
 * Ingest: scan the profile patch YAML, move every mcp-client entry into the
 * store, and physically remove those blocks from the YAML.
 *
 * @param {object} options
 * @param {import("./store.js").Store} options.store
 * @param {string} [options.yamlPath]
 * @returns {Promise<{ ingested: string[], skipped: {name: string, reason: string}[], cleanedYaml: boolean }>}
 */
export async function ingestProfileMcpEntries({ store, yamlPath }) {
  const targetPath = yamlPath ?? defaultProfilePatchYamlPath();
  if (!existsSync(targetPath)) {
    return { ingested: [], skipped: [], cleanedYaml: false };
  }
  const rawYaml = readFileSync(targetPath, "utf8");
  const lines = rawYaml.split("\n");
  const items = splitTopLevelItems(lines);
  // entry-level blocks: one `- insert:` item may carry several entries and
  // only some of them are mcp-client. Entry offsets are resolved inside the
  // item's own line window (items are ordered and non-overlapping).
  const blocks = [];
  for (const item of items) {
    if (!item.lines.some((line) => MCP_CLIENT_NAME.test(line))) continue;
    const { entries } = splitItemEntries(item.lines);
    let offset = item.start;
    for (const entry of entries) {
      while (offset < item.start + item.lines.length && lines[offset] !== entry.lines[0]) offset += 1;
      if (entry.lines.some((line) => MCP_CLIENT_NAME.test(line))) {
        blocks.push({ item, entry, start: offset, config: blockToServerConfig(entry.lines) });
      }
      offset += 1;
    }
  }
  if (blocks.length === 0) {
    return { ingested: [], skipped: [], cleanedYaml: false };
  }

  const ingested = [];
  const skipped = [];
  const committed = store.mutate((servers) => {
    for (const block of blocks) {
      const name = block.config?.serverName;
      if (!name) {
        skipped.push({ name: "(unnamed)", reason: "entry has no serverName" });
        continue;
      }
      const { config: validated, error } = validateServerConfig({
        ...block.config,
        name,
        enabled: true,
        scope: "global",
      });
      if (error) {
        skipped.push({ name, reason: error });
        continue;
      }
      // an existing entry in the store wins (it is already managed); the
      // YAML block is still removed — the store is the single source now
      if (servers[name] === undefined) {
        const { name: _strip, ...rest } = validated;
        servers[name] = rest;
        ingested.push(name);
      } else {
        skipped.push({ name, reason: "already present in the console store (store wins)" });
      }
    }
  });
  if (committed === false) {
    return { ingested, skipped, cleanedYaml: false };
  }

  // physically remove the migrated entries (keep everything else verbatim).
  // An unparseable MCP entry (no serverName) stays in the YAML so nothing is
  // silently lost. When every entry of an item is removed, the item's shell
  // (the `- insert:` header and its header comment) goes too; a partially
  // migrated item keeps its shell and the surviving entries.
  const removedRanges = new Set();
  for (const block of blocks) {
    if (!block.config?.serverName) continue;
    for (let index = block.start; index < block.start + block.entry.lines.length; index += 1) {
      removedRanges.add(index);
    }
  }
  // drop shells of fully-migrated items (leading comment lines included)
  for (const item of items) {
    if (!item.lines.some((line) => MCP_CLIENT_NAME.test(line))) continue;
    const { entries } = splitItemEntries(item.lines);
    const migrated = entries.filter((entry) =>
      entry.lines.some((line) => MCP_CLIENT_NAME.test(line)) && blockToServerConfig(entry.lines)?.serverName,
    );
    if (migrated.length === entries.length) {
      for (let index = item.start; index < item.start + item.lines.length; index += 1) {
        removedRanges.add(index);
      }
    }
  }
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (removedRanges.has(index)) continue;
    kept.push(lines[index]);
  }
  // trim: collapse the blank-line runs left by removals inside the document
  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  writeFileSync(targetPath, cleaned.endsWith("\n") ? cleaned : cleaned + "\n", "utf8");

  return { ingested, skipped, cleanedYaml: true };
}

function formatScalar(value) {
  const text = String(value ?? "");
  if (text === "") return "''";
  const needsQuote =
    /^[-?:,\[\]{}#&*!|>'"%@`\s]/.test(text) || // starts with a YAML indicator
    /:\s/.test(text) ||                          // colon-space ends a plain scalar
    /\s#/.test(text) ||                          // space-hash starts a comment
    /\s$/.test(text) ||                          // trailing space
    /['"]/.test(text);                            // quote chars: escape conservatively
  return needsQuote ? `'${text.replace(/'/g, "''")}'` : text;
}

/** Render one store server config as a cordis.patch.yml insert entry. */
export function formatMcpYamlEntry(name, config) {
  const lines = [
    `# dsh-mcp-${name}: managed by dsh-mcp-console`,
    "- insert:",
    `    - id: mcp-${name}`,
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    `        serverName: ${formatScalar(name)}`,
    `        transport: ${config.transport}`,
  ];
  if (config.transport === "stdio") {
    lines.push(`        command: ${formatScalar(config.command ?? "")}`);
    if (Array.isArray(config.args) && config.args.length > 0) {
      lines.push("        args:");
      for (const arg of config.args) lines.push(`          - ${formatScalar(arg)}`);
    }
    if (config.env && Object.keys(config.env).length > 0) {
      lines.push("        env:");
      for (const [key, value] of Object.entries(config.env)) {
        lines.push(`          ${formatScalar(key)}: ${formatScalar(value)}`);
      }
    }
    if (config.cwd) lines.push(`        cwd: ${formatScalar(config.cwd)}`);
  } else {
    lines.push(`        url: ${formatScalar(config.url ?? "")}`);
    if (config.headers && Object.keys(config.headers).length > 0) {
      lines.push("        headers:");
      for (const [key, value] of Object.entries(config.headers)) {
        lines.push(`          ${formatScalar(key)}: ${formatScalar(value)}`);
      }
    }
  }
  lines.push(`        toolCallTimeoutMs: ${config.toolCallTimeoutMs ?? 60000}`);
  lines.push(`        failOnStartupError: ${config.failOnStartupError === true}`);
  return lines.join("\n");
}

/**
 * Export: append every store server back into the profile patch YAML as
 * standard mcp-client entries (uninstall/backup reversibility).
 *
 * @param {object} options
 * @param {import("./store.js").Store} options.store
 * @param {string} [options.yamlPath]
 * @param {boolean} [options.remove] when true, previously exported entries
 *        (the marked block) are replaced instead of duplicated
 */
export async function exportStoreToProfileYaml({ store, yamlPath }) {
  const targetPath = yamlPath ?? defaultProfilePatchYamlPath();
  const doc = store.read();
  const servers = doc.servers ?? {};
  const names = Object.keys(servers);
  if (names.length === 0) {
    return { exported: [], filePath: targetPath };
  }

  let baseContent = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";

  // drop a previous export block so re-exports do not duplicate
  const markerStart = "# ---- Exported by dsh-mcp-console ----";
  const lines = baseContent.split("\n");
  const firstMarker = lines.findIndex((line) => line.trim() === markerStart);
  if (firstMarker !== -1) {
    lines.splice(firstMarker, lines.length - firstMarker);
    baseContent = lines.join("\n").replace(/\n+$/, "");
  }

  const entries = names.map((name) => formatMcpYamlEntry(name, servers[name]));
  const appendContent =
    (baseContent.endsWith("\n") || baseContent === "" ? "" : "\n") +
    `\n${markerStart}\n` +
    entries.join("\n") +
    "\n";
  writeFileSync(targetPath, baseContent + appendContent, "utf8");
  return { exported: names, filePath: targetPath };
}
