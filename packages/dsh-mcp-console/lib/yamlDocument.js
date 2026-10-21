import { isAlias, isMap, isSeq, parseDocument, visit } from "yaml";

export const MCP_CLIENT_NAME = "@deepseek-ai/dsh-mcp-client";

/**
 * DSH evaluates `!!js` expressions when it loads a profile. The upstream
 * config editor registers the same custom tag, so the parser must accept it
 * instead of reporting an unresolved-tag warning (which this module treats as
 * a refusal to edit an unfamiliar document).
 */
const PROFILE_TAGS = [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }];

/** Parse semantics without reserializing unrelated user formatting. */
export function patchDocument(source) {
  const doc = parseDocument(source, { uniqueKeys: true, customTags: PROFILE_TAGS });
  if (doc.errors.length || doc.warnings.length) {
    throw new Error(`Cannot safely migrate YAML: ${[...doc.errors, ...doc.warnings].map(e => e.message).join("; ")}`);
  }
  if (doc.contents === null) return [];
  if (!isSeq(doc.contents)) throw new Error("Profile patch must be a YAML array");
  // Removing an anchored entry can break references outside the edited range.
  visit(doc, (_key, node) => {
    if (isAlias(node) || node?.anchor) throw new Error("YAML anchors/aliases require manual migration");
  });
  return doc.contents.items.map(node => {
    const inserted = isMap(node) ? node.get("insert", true) : null;
    const nodes = isSeq(inserted) ? inserted.items : [node];
    return {
      node,
      range: lineRange(source, node),
      entries: nodes.map(entry => ({
        node: entry,
        range: lineRange(source, entry),
        value: entry?.toJSON() ?? null,
      })),
    };
  });
}

function lineRange(source, node) {
  if (!node?.range) throw new Error("Unsupported YAML patch entry");
  let start = source.lastIndexOf("\n", node.range[0] - 1) + 1;
  if (!/^\s*-\s*$/.test(source.slice(start, node.range[0]))) return null;
  const end = source.indexOf("\n", node.range[1] - 1);
  const boundary = end < 0 ? source.length : end + 1;
  if (!/^\s*(?:#[^\n]*)?\s*$/.test(source.slice(node.range[1], boundary))) return null;
  // Only the contiguous header belongs to this entry, not file-wide comments.
  while (start > 0) {
    const previous = source.lastIndexOf("\n", start - 2) + 1;
    const header = source.slice(previous, start).trim();
    if (!header.startsWith("#") || header === "# ---- MCP console automatic handoff: end ----") break;
    start = previous;
  }
  return [start, boundary];
}

export function removeRanges(source, ranges) {
  const ordered = ranges.sort((a, b) => a[0] - b[0]);
  let offset = 0;
  let result = "";
  for (const [start, end] of ordered) {
    if (start > offset) result += source.slice(offset, start);
    offset = Math.max(offset, end);
  }
  return result + source.slice(offset);
}

export function removableRanges(items, selected) {
  const ranges = items.flatMap(item => {
    if (item.range !== null && item.entries.every(entry => selected.has(entry))) return [item.range];
    return item.entries.filter(entry => selected.has(entry)).map(entry => entry.range);
  });
  // An unaddressable inline entry must never turn into a null range that
  // `removeRanges` would compare against a number.
  return ranges.filter(Array.isArray);
}
