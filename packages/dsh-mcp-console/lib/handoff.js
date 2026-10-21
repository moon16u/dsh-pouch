import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { Store } from "./store.js";
import { writeFileAtomicSync } from "./atomicFile.js";
import { formatMcpYamlEntry } from "./yamlMigrator.js";
import { patchDocument } from "./yamlDocument.js";

export const HANDOFF_ID = "mcp-console-handoff";
export const HANDOFF_BEGIN = "# ---- MCP console automatic handoff: begin ----";
export const HANDOFF_END = "# ---- MCP console automatic handoff: end ----";
export const CONSOLE_PACKAGE = "@moon16u/dsh-mcp-console";

// Inspect the complete composed options, not partially started fibers. The
// official Loader assigns group.data before starting any entry in that group.
// This expression uses only Loader facilities; no dependency on this package
// survives in the handoff document after uninstall.
export const OWNER_PRESENT = '(() => { const e = ctx[Symbol.for("cordis.entry")]; const walk = rows => rows.some(r => { if (r.id === "mcp-console-handoff") return false; const off = r.disabled && typeof r.disabled === "object" ? e.evaluate(r.disabled.__jsExpr) : r.disabled; return !off && (r.name === "@moon16u/dsh-mcp-console" || (r.group && Array.isArray(r.config) && walk(r.config))); }); return walk(e.parent.tree.root.data); })()';
const TAGS = [{ tag: "tag:yaml.org,2002:js", resolve: value => value }];

/** Reinstall may reuse an unchanged group; await its old native fibers first. */
export async function releaseHandoffFibers(ctx) {
  const loader = typeof ctx.get === "function" ? ctx.get("loader") : undefined;
  if (!loader) return;
  const pending = [];
  for (const entry of loader.entries()) {
    let parent = entry.parent?.ctx?.fiber?.entry;
    while (parent) {
      if (parent.options?.id === HANDOFF_ID) {
        if (entry.fiber) pending.push(entry.fiber.dispose());
        break;
      }
      parent = parent.parent?.ctx?.fiber?.entry;
    }
  }
  await Promise.all(pending);
}

export function splitHandoff(raw) {
  const start = raw.indexOf(HANDOFF_BEGIN);
  const end = raw.indexOf(HANDOFF_END);
  if (start < 0 && end < 0) return { base: raw, block: null };
  if (start < 0 || end < start || raw.indexOf(HANDOFF_BEGIN, start + 1) >= 0 || raw.indexOf(HANDOFF_END, end + 1) >= 0) {
    throw new Error("MCP handoff markers are damaged; configuration was not overwritten");
  }
  const finish = end + HANDOFF_END.length;
  return { base: raw.slice(0, start) + raw.slice(finish).replace(/^\r?\n/, ""), block: raw.slice(start, finish).replace(/\r\n/g, "\n") };
}

export function handoffBlock(servers) {
  const lines = [
    HANDOFF_BEGIN,
    "# Native MCP fallback: active only when the console plugin is absent/disabled.",
    "- insert:",
    `    - id: ${HANDOFF_ID}`,
    "      name: cordis:group",
    "      group: true",
    `      disabled: !!js ${JSON.stringify(OWNER_PRESENT)}`,
    `      config:${Object.keys(servers).length ? "" : " []"}`,
  ];
  for (const [name, raw] of Object.entries(servers)) {
    const restricted = Array.isArray(raw.disabledTools) && raw.disabledTools.length > 0;
    if (restricted) lines.push(`        # ${name}: returned disabled; tool restrictions remain in dsh-mcp.json.`);
    const entry = formatMcpYamlEntry(name, { ...raw, enabled: raw.enabled !== false && !restricted });
    lines.push(...entry.split("\n").slice(2).map(line => "    " + line));
  }
  lines.push(HANDOFF_END);
  return lines.join("\n");
}

function handoffNode(node) {
  if (isScalar(node)) return ["scalar", node.tag ?? null, node.value];
  if (isSeq(node)) return ["sequence", node.tag ?? null, node.items.map(handoffNode)];
  if (isMap(node)) {
    const pairs = node.items.map(({ key, value }) => {
      if (!isScalar(key) || typeof key.value !== "string") throw new Error("Unsupported MCP handoff key");
      return [handoffNode(key), handoffNode(value)];
    });
    pairs.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
    return ["map", node.tag ?? null, pairs];
  }
  throw new Error("Unsupported MCP handoff node");
}

function sameHandoff(left, right) {
  if (left === right) return true;
  if (left === null || right === null) return false;
  try {
    // Host profile saves may reflow YAML. Ignore presentation and map order,
    // but retain tags (especially !!js), values and sequence order.
    const shape = source => patchDocument(source).map(item => handoffNode(item.node));
    return isDeepStrictEqual(shape(left), shape(right));
  } catch {
    return false;
  }
}

/** Mirror accepted global edits before acknowledging them to the GUI. */
export class HandoffStore extends Store {
  constructor(path, yamlPath) {
    super(path);
    this.yamlPath = yamlPath;
    this.handoffEnabled = false;
    this.expectedBlock = null;
    this.prepared = false;
    this.required = false;
    this.migrating = false;
  }

  prepareHandoff() {
    this.required = true;
    const doc = this.read();
    if (this.lastError) throw new Error(this.lastError);
    const raw = existsSync(this.yamlPath) ? readFileSync(this.yamlPath, "utf8") : "";
    const { block } = splitHandoff(raw);
    const expected = handoffBlock(doc.servers);
    if (block !== null && !sameHandoff(block, expected)) throw new Error("MCP handoff configuration changed outside the console; review it before takeover");
    this.expectedBlock = block;
    this.prepared = true;
  }

  enableHandoff() {
    if (!this.prepared) this.prepareHandoff();
    const doc = this.read();
    if (this.lastError) throw new Error(this.lastError);
    const raw = existsSync(this.yamlPath) ? readFileSync(this.yamlPath, "utf8") : "";
    this.publish(doc, raw);
    this.handoffEnabled = true;
  }

  async migrate(operation) {
    const active = this.handoffEnabled;
    this.handoffEnabled = false;
    this.migrating = true;
    try { return await operation(); } finally {
      this.migrating = false;
      this.handoffEnabled = active;
      if (active) this.enableHandoff();
    }
  }

  publish(doc, previous) {
    const { base, block } = splitHandoff(previous);
    if (!sameHandoff(block, this.expectedBlock)) throw new Error("MCP handoff configuration changed outside the console; retry after review");
    const items = patchDocument(base);
    const names = new Set(Object.keys(doc.servers));
    for (const item of items) for (const entry of item.entries) {
      if (entry.value?.id === HANDOFF_ID || names.has(entry.value?.config?.serverName) ||
          [...names].some(name => entry.value?.id === `mcp-${name}`)) {
        throw new Error("MCP handoff conflicts with an existing profile entry; nothing was overwritten");
      }
    }
    const parsed = parseDocument(base, { customTags: TAGS });
    let prefix = base;
    if (isSeq(parsed.contents) && parsed.contents.items.length === 0) {
      prefix = base.slice(0, parsed.contents.range[0]) + base.slice(parsed.contents.range[1]);
    }
    const nextBlock = handoffBlock(doc.servers);
    const output = prefix.trimEnd() + (prefix.trim() ? "\n\n" : "") + nextBlock + "\n";
    const check = parseDocument(output, { customTags: TAGS });
    if (check.errors.length || check.warnings.length || !isSeq(check.contents)) throw new Error("Invalid MCP handoff YAML");
    const current = existsSync(this.yamlPath) ? readFileSync(this.yamlPath, "utf8") : "";
    if (current !== previous) throw new Error("Profile changed during MCP handoff update");
    if (output !== previous) writeFileAtomicSync(this.yamlPath, output);
    this.expectedBlock = nextBlock;
  }

  _persist(doc) {
    if (!this.handoffEnabled) {
      if (this.required && !this.migrating) throw new Error("Automatic MCP handoff is not ready; configuration was not changed");
      return super._persist(doc);
    }
    const original = this.read();
    if (this.lastError?.includes("corrupt")) throw new Error(this.lastError);
    const yaml = existsSync(this.yamlPath) ? readFileSync(this.yamlPath, "utf8") : "";
    // Persist first, but roll back a rejected mirror update. A successful GUI
    // response therefore always has both the managed store and native fallback.
    super._persist(doc);
    try {
      this.publish(doc, yaml);
    } catch (error) {
      super._persist(original);
      this.lastError = String(error.message ?? error);
      throw error;
    }
  }
}
